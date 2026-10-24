import { createPublicKey, createVerify } from "node:crypto";
import type { EbayApplicationConfig, EbayHttpTransport } from "./ebay-types";
import { ebayOAuthTokenEndpoint } from "./ebay-api-client.server";
import type { EbayDeletionDiagnosticCategory, EbayDeletionDiagnosticStage } from
  "./ebay-deletion-notification-diagnostics.server";
import { elapsedMilliseconds } from "./ebay-deletion-notification-diagnostics.server";

const decoder = new TextDecoder("utf-8", { fatal: true });
const encoder = new TextEncoder();
const MAX_NOTIFICATION_BYTES = 256 * 1024;
const MAX_SIGNATURE_HEADER_LENGTH = 16 * 1024;
const MAX_PUBLIC_KEY_RESPONSE_BYTES = 64 * 1024;
const MAX_CACHE_TTL_MS = 60 * 60 * 1000;
const APPLICATION_SCOPE = "https://api.ebay.com/oauth/api_scope";
const KEY_ID_PATTERN = /^[A-Za-z0-9._~-]{1,256}$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const PUBLIC_KEY_START = "-----BEGIN PUBLIC KEY-----";
const PUBLIC_KEY_END = "-----END PUBLIC KEY-----";

export type EbayNotificationVerificationFailure =
  | "MALFORMED_PAYLOAD"
  | "UNSUPPORTED_PAYLOAD"
  | "MISSING_SIGNATURE"
  | "MALFORMED_SIGNATURE"
  | "KEY_RETRIEVAL_FAILED"
  | "INVALID_SIGNATURE";

export class EbayNotificationVerificationError extends Error {
  readonly code: EbayNotificationVerificationFailure;
  readonly diagnosticStage?: EbayDeletionDiagnosticStage;
  readonly diagnosticCategory?: EbayDeletionDiagnosticCategory;
  readonly upstreamStatus?: number;
  readonly durationMs?: number;

  constructor(code: EbayNotificationVerificationFailure, diagnostic?: Readonly<{
    stage: EbayDeletionDiagnosticStage;
    category: EbayDeletionDiagnosticCategory;
    upstreamStatus?: number;
    durationMs: number;
  }>) {
    super(`eBay notification verification ${code.toLowerCase().replaceAll("_", " ")}`);
    this.name = "EbayNotificationVerificationError";
    this.code = code;
    this.diagnosticStage = diagnostic?.stage;
    this.diagnosticCategory = diagnostic?.category;
    this.upstreamStatus = diagnostic?.upstreamStatus;
    this.durationMs = diagnostic?.durationMs;
  }
}

class JsonStructureScanner {
  private index = 0;
  private readonly text: string;

  constructor(text: string) { this.text = text; }

  scan() {
    this.skipWhitespace();
    this.value();
    this.skipWhitespace();
    if (this.index !== this.text.length) this.invalid();
  }

  private invalid(): never {
    throw new EbayNotificationVerificationError("MALFORMED_PAYLOAD");
  }

  private skipWhitespace() {
    while (this.index < this.text.length && [" ", "\t", "\r", "\n"].includes(this.text[this.index]))
      this.index += 1;
  }

  private value() {
    this.skipWhitespace();
    const character = this.text[this.index];
    if (character === "{") return this.object();
    if (character === "[") return this.array();
    if (character === '"') { this.string(); return; }
    for (const literal of ["true", "false", "null"])
      if (this.text.startsWith(literal, this.index)) { this.index += literal.length; return; }
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(this.text.slice(this.index));
    if (!match) this.invalid();
    this.index += match[0].length;
  }

  private string() {
    const start = this.index;
    this.index += 1;
    while (this.index < this.text.length) {
      const character = this.text[this.index];
      const codePoint = character.codePointAt(0) ?? 0;
      if (character === '"') {
        this.index += 1;
        try { return JSON.parse(this.text.slice(start, this.index)) as string; }
        catch { return this.invalid(); }
      }
      if (codePoint <= 31) this.invalid();
      if (character === "\\") {
        this.index += 1;
        const escaped = this.text[this.index];
        if (!escaped || !['"', "\\", "/", "b", "f", "n", "r", "t", "u"].includes(escaped)) this.invalid();
        if (escaped === "u") {
          const hex = this.text.slice(this.index + 1, this.index + 5);
          if (!/^[0-9A-Fa-f]{4}$/.test(hex)) this.invalid();
          this.index += 4;
        }
      }
      this.index += 1;
    }
    return this.invalid();
  }

  private object() {
    this.index += 1;
    this.skipWhitespace();
    const keys = new Set<string>();
    if (this.text[this.index] === "}") { this.index += 1; return; }
    while (this.index < this.text.length) {
      if (this.text[this.index] !== '"') this.invalid();
      const key = this.string();
      if (keys.has(key)) this.invalid();
      keys.add(key);
      this.skipWhitespace();
      if (this.text[this.index] !== ":") this.invalid();
      this.index += 1;
      this.value();
      this.skipWhitespace();
      if (this.text[this.index] === "}") { this.index += 1; return; }
      if (this.text[this.index] !== ",") this.invalid();
      this.index += 1;
      this.skipWhitespace();
    }
    this.invalid();
  }

  private array() {
    this.index += 1;
    this.skipWhitespace();
    if (this.text[this.index] === "]") { this.index += 1; return; }
    while (this.index < this.text.length) {
      this.value();
      this.skipWhitespace();
      if (this.text[this.index] === "]") { this.index += 1; return; }
      if (this.text[this.index] !== ",") this.invalid();
      this.index += 1;
      this.skipWhitespace();
    }
    this.invalid();
  }
}

function parseJsonWithoutDuplicateKeys(bytes: Uint8Array, maximumBytes: number,
failure: "MALFORMED_PAYLOAD" | "MALFORMED_SIGNATURE") {
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > maximumBytes)
    throw new EbayNotificationVerificationError(failure);
  try {
    const text = decoder.decode(bytes);
    new JsonStructureScanner(text).scan();
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof EbayNotificationVerificationError && failure === "MALFORMED_PAYLOAD") throw error;
    throw new EbayNotificationVerificationError(failure);
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new EbayNotificationVerificationError("UNSUPPORTED_PAYLOAD");
  return value as Record<string, unknown>;
}

function validateMarketplaceAccountDeletionMessage(value: unknown) {
  const root = object(value);
  const metadata = object(root.metadata);
  const notification = object(root.notification);
  const data = object(notification.data);
  if (metadata.topic !== "MARKETPLACE_ACCOUNT_DELETION" || metadata.schemaVersion !== "1.0" ||
      metadata.deprecated !== false || typeof notification.notificationId !== "string" ||
      !notification.notificationId || typeof notification.eventDate !== "string" ||
      typeof notification.publishDate !== "string" || !Number.isSafeInteger(notification.publishAttemptCount) ||
      (notification.publishAttemptCount as number) < 1 || typeof data.userId !== "string" || !data.userId)
    throw new EbayNotificationVerificationError("UNSUPPORTED_PAYLOAD");
  return value;
}

function strictBase64(value: string, maximumLength: number, failure: EbayNotificationVerificationFailure) {
  if (!value || value.length > maximumLength || value.length % 4 !== 0 || !BASE64_PATTERN.test(value))
    throw new EbayNotificationVerificationError(failure);
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) throw new EbayNotificationVerificationError(failure);
  return decoded;
}

function parseSignatureHeader(signatureHeader: string | null | undefined) {
  if (!signatureHeader) throw new EbayNotificationVerificationError("MISSING_SIGNATURE");
  const decoded = strictBase64(signatureHeader, MAX_SIGNATURE_HEADER_LENGTH, "MALFORMED_SIGNATURE");
  const value = parseJsonWithoutDuplicateKeys(decoded, MAX_SIGNATURE_HEADER_LENGTH, "MALFORMED_SIGNATURE");
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new EbayNotificationVerificationError("MALFORMED_SIGNATURE");
  const { kid, signature } = value as Record<string, unknown>;
  if (typeof kid !== "string" || !KEY_ID_PATTERN.test(kid) || typeof signature !== "string")
    throw new EbayNotificationVerificationError("MALFORMED_SIGNATURE");
  return { keyId: kid, signature: strictBase64(signature, MAX_SIGNATURE_HEADER_LENGTH, "MALFORMED_SIGNATURE") };
}

export interface EbayNotificationPublicKeyProvider {
  getPublicKey(keyId: string): Promise<string>;
}

const notificationApiBaseUrl = (environment: EbayApplicationConfig["environment"]) => environment === "SANDBOX"
  ? "https://api.sandbox.ebay.com/commerce/notification/v1/public_key/"
  : "https://api.ebay.com/commerce/notification/v1/public_key/";

function parseBoundedResponse(body: Uint8Array) {
  if (!body.byteLength || body.byteLength > MAX_PUBLIC_KEY_RESPONSE_BYTES)
    throw new EbayNotificationVerificationError("KEY_RETRIEVAL_FAILED");
  try {
    const value: unknown = JSON.parse(decoder.decode(body));
    return object(value);
  } catch {
    throw new EbayNotificationVerificationError("KEY_RETRIEVAL_FAILED");
  }
}

function normalizeEbayPublicKey(key: string) {
  const trimmed = key.trim();
  if (!trimmed.startsWith(PUBLIC_KEY_START) || !trimmed.endsWith(PUBLIC_KEY_END))
    throw new EbayNotificationVerificationError("KEY_RETRIEVAL_FAILED");
  const body = trimmed.slice(PUBLIC_KEY_START.length, -PUBLIC_KEY_END.length).trim();
  if (!body) throw new EbayNotificationVerificationError("KEY_RETRIEVAL_FAILED");
  const normalized = `${PUBLIC_KEY_START}\n${body}\n${PUBLIC_KEY_END}`;
  createPublicKey(normalized);
  return normalized;
}

export function createEbayNotificationPublicKeyProvider(
  config: EbayApplicationConfig,
  transport: EbayHttpTransport,
  hooks?: Readonly<{ now?: () => number }>,
): EbayNotificationPublicKeyProvider {
  return { async getPublicKey(keyId) {
    if (!KEY_ID_PATTERN.test(keyId)) throw new EbayNotificationVerificationError("KEY_RETRIEVAL_FAILED");
    const now = hooks?.now ?? Date.now;
    const failure = (stage: "APPLICATION_TOKEN" | "PUBLIC_KEY_RETRIEVAL",
      category: EbayDeletionDiagnosticCategory, startedAt: number, upstreamStatus?: number) =>
      new EbayNotificationVerificationError("KEY_RETRIEVAL_FAILED", {
        stage, category, upstreamStatus, durationMs: elapsedMilliseconds(startedAt, now),
      });
    const tokenStartedAt = now();
    let tokenResponse;
    try {
      const form = new URLSearchParams({ grant_type: "client_credentials", scope: APPLICATION_SCOPE });
      tokenResponse = await transport.request({ method: "POST", url: ebayOAuthTokenEndpoint(config), headers: {
        authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded", accept: "application/json",
      }, body: encoder.encode(form.toString()), timeoutMs: config.timeoutMs });
    } catch {
      throw failure("APPLICATION_TOKEN", "TRANSPORT_FAILURE", tokenStartedAt);
    }
    if (tokenResponse.status < 200 || tokenResponse.status >= 300)
      throw failure("APPLICATION_TOKEN", "UPSTREAM_HTTP_ERROR", tokenStartedAt, tokenResponse.status);
    let token;
    try {
      token = parseBoundedResponse(tokenResponse.body);
      if (typeof token.access_token !== "string" || !token.access_token || token.access_token.length > 16_384 ||
          typeof token.token_type !== "string" ||
          !["application access token", "bearer"].includes(token.token_type.toLowerCase()) ||
          typeof token.expires_in !== "number" || !Number.isSafeInteger(token.expires_in) || token.expires_in < 1)
        throw new Error("invalid");
    } catch {
      throw failure("APPLICATION_TOKEN", "UPSTREAM_RESPONSE_INVALID", tokenStartedAt,
        tokenResponse.status);
    }

    const keyStartedAt = now();
    let keyResponse;
    try {
      keyResponse = await transport.request({ method: "GET",
        url: `${notificationApiBaseUrl(config.environment)}${encodeURIComponent(keyId)}`,
        headers: { authorization: `Bearer ${token.access_token}`, accept: "application/json" },
        body: new Uint8Array(), timeoutMs: config.timeoutMs });
    } catch {
      throw failure("PUBLIC_KEY_RETRIEVAL", "TRANSPORT_FAILURE", keyStartedAt);
    }
    if (keyResponse.status !== 200)
      throw failure("PUBLIC_KEY_RETRIEVAL", "UPSTREAM_HTTP_ERROR", keyStartedAt, keyResponse.status);
    try {
      const key = parseBoundedResponse(keyResponse.body).key;
      if (typeof key !== "string" || !key || key.length > 16_384) throw new Error("invalid");
      return normalizeEbayPublicKey(key);
    } catch {
      throw failure("PUBLIC_KEY_RETRIEVAL", "UPSTREAM_RESPONSE_INVALID", keyStartedAt,
        keyResponse.status);
    }
  } };
}

export function createEbayNotificationSignatureVerifier(input: {
  publicKeyProvider: EbayNotificationPublicKeyProvider;
  cacheTtlMs?: number;
  maxCacheEntries?: number;
  now?: () => number;
}) {
  const cacheTtlMs = input.cacheTtlMs ?? MAX_CACHE_TTL_MS;
  const maxCacheEntries = input.maxCacheEntries ?? 100;
  if (!Number.isSafeInteger(cacheTtlMs) || cacheTtlMs < 1 || cacheTtlMs > MAX_CACHE_TTL_MS ||
      !Number.isSafeInteger(maxCacheEntries) || maxCacheEntries < 1 || maxCacheEntries > 1_000)
    throw new EbayNotificationVerificationError("KEY_RETRIEVAL_FAILED");
  const now = input.now ?? Date.now;
  const cache = new Map<string, { key: string; expiresAt: number }>();

  const publicKey = async (keyId: string) => {
    const cached = cache.get(keyId);
    const currentTime = now();
    if (cached && cached.expiresAt > currentTime) return cached.key;
    if (cached) cache.delete(keyId);
    let key: string;
    try { key = await input.publicKeyProvider.getPublicKey(keyId); createPublicKey(key); }
    catch (error) {
      if (error instanceof EbayNotificationVerificationError && error.code === "KEY_RETRIEVAL_FAILED")
        throw error;
      throw new EbayNotificationVerificationError("KEY_RETRIEVAL_FAILED");
    }
    while (cache.size >= maxCacheEntries) cache.delete(cache.keys().next().value as string);
    cache.set(keyId, { key, expiresAt: currentTime + cacheTtlMs });
    return key;
  };

  return { async verify(rawBody: Uint8Array, signatureHeader: string | null | undefined) {
    const parsed = validateMarketplaceAccountDeletionMessage(
      parseJsonWithoutDuplicateKeys(rawBody, MAX_NOTIFICATION_BYTES, "MALFORMED_PAYLOAD"),
    );
    const signature = parseSignatureHeader(signatureHeader);
    const key = await publicKey(signature.keyId);
    try {
      const verifier = createVerify("ssl3-sha1");
      verifier.update(JSON.stringify(parsed), "utf8");
      verifier.end();
      if (!verifier.verify(key, signature.signature))
        throw new EbayNotificationVerificationError("INVALID_SIGNATURE");
      const root = parsed as Record<string, Record<string, unknown>>;
      const metadata = root.metadata;
      const notification = root.notification;
      const data = notification.data as Record<string, unknown>;
      return { verified: true as const, keyId: signature.keyId, notification: {
        notificationId: notification.notificationId as string,
        topic: metadata.topic as "MARKETPLACE_ACCOUNT_DELETION",
        schemaVersion: metadata.schemaVersion as "1.0",
        eventDate: notification.eventDate as string,
        userId: data.userId as string,
      } };
    } catch (error) {
      if (error instanceof EbayNotificationVerificationError) throw error;
      throw new EbayNotificationVerificationError("INVALID_SIGNATURE");
    }
  } };
}
