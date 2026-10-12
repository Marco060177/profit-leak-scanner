import { createHmac } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { EbayNotificationVerificationError } from "./ebay-notification-signature.server";

const KEY_VERSION_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export type EbayDeletionHmacConfig = Readonly<{
  activeKeyVersion: string;
  keys: ReadonlyMap<string, Uint8Array>;
}>;

export class EbayDeletionInboxError extends Error {
  readonly code: "CONFIGURATION" | "INVALID_PAYLOAD" | "CONFLICT" | "PERSISTENCE";

  constructor(code: "CONFIGURATION" | "INVALID_PAYLOAD" | "CONFLICT" | "PERSISTENCE") {
    super(`eBay deletion inbox ${code.toLowerCase().replaceAll("_", " ")}`);
    this.name = "EbayDeletionInboxError";
    this.code = code;
  }
}

export function resolveEbayDeletionHmacConfig(env: NodeJS.ProcessEnv = process.env): EbayDeletionHmacConfig {
  const activeKeyVersion = env.EBAY_MARKETPLACE_ACCOUNT_DELETION_HMAC_ACTIVE_KEY_VERSION;
  const rawKeys = env.EBAY_MARKETPLACE_ACCOUNT_DELETION_HMAC_KEYS_JSON;
  if (!activeKeyVersion || !KEY_VERSION_PATTERN.test(activeKeyVersion) || !rawKeys || rawKeys.length > 16_384)
    throw new EbayDeletionInboxError("CONFIGURATION");
  try {
    const parsed: unknown = JSON.parse(rawKeys);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    const entries = Object.entries(parsed as Record<string, unknown>);
    if (!entries.length || entries.length > 10) throw new Error("invalid");
    const keys = new Map<string, Uint8Array>();
    for (const [version, encoded] of entries) {
      if (!KEY_VERSION_PATTERN.test(version) || typeof encoded !== "string" || encoded.length % 4 !== 0 ||
          !BASE64_PATTERN.test(encoded)) throw new Error("invalid");
      const key = Buffer.from(encoded, "base64");
      if (key.byteLength < 32 || key.byteLength > 64 || key.toString("base64") !== encoded) throw new Error("invalid");
      keys.set(version, key);
    }
    if (!keys.has(activeKeyVersion)) throw new Error("invalid");
    return { activeKeyVersion, keys };
  } catch {
    throw new EbayDeletionInboxError("CONFIGURATION");
  }
}

export const ebayDeletionIdentityLookupToken = (key: Uint8Array, value: string) => createHmac("sha256", key)
  .update("ebay-user-lookup-v1", "utf8").update("\0", "utf8").update(value, "utf8").digest("hex");

const hmac = (key: Uint8Array, domain: string, value: string) => createHmac("sha256", key)
  .update(domain, "utf8").update("\0", "utf8").update(value, "utf8").digest("hex");

type VerifiedNotification = Readonly<{
  notificationId: string;
  topic: "MARKETPLACE_ACCOUNT_DELETION";
  schemaVersion: "1.0";
  eventDate: string;
  userId: string;
}>;

function eventAt(value: string) {
  const result = new Date(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) ||
      !Number.isFinite(result.getTime())) throw new EbayDeletionInboxError("INVALID_PAYLOAD");
  return result;
}

function stableSemantics(notification: VerifiedNotification) {
  return JSON.stringify({ notificationId: notification.notificationId, topic: notification.topic,
    schemaVersion: notification.schemaVersion, eventDate: notification.eventDate, userId: notification.userId });
}

function isUniqueConflict(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

export async function persistVerifiedEbayDeletionNotification(input: {
  db: PrismaClient;
  notification: VerifiedNotification;
  hmacConfig: EbayDeletionHmacConfig;
  receivedAt: Date;
}) {
  if (!(input.receivedAt instanceof Date) || !Number.isFinite(input.receivedAt.getTime()))
    throw new EbayDeletionInboxError("INVALID_PAYLOAD");
  const existing = await input.db.ebayDeletionNotificationInbox.findUnique({
    where: { notificationId: input.notification.notificationId },
  });
  const compare = (row: NonNullable<typeof existing>) => {
    const key = input.hmacConfig.keys.get(row.hmacKeyVersion);
    if (!key) throw new EbayDeletionInboxError("CONFIGURATION");
    const checksum = hmac(key, "ebay-deletion-payload-v1", stableSemantics(input.notification));
    if (row.payloadChecksum !== checksum) throw new EbayDeletionInboxError("CONFLICT");
    return { receipt: row, replayed: true as const };
  };
  if (existing) return compare(existing);

  const key = input.hmacConfig.keys.get(input.hmacConfig.activeKeyVersion);
  if (!key) throw new EbayDeletionInboxError("CONFIGURATION");
  const data = {
    notificationId: input.notification.notificationId,
    topic: input.notification.topic,
    schemaVersion: input.notification.schemaVersion,
    eventAt: eventAt(input.notification.eventDate),
    receivedAt: input.receivedAt,
    processingStatus: "PENDING_UNRESOLVED",
    retryCount: 0,
    diagnosticCode: "IDENTITY_UNRESOLVED",
    payloadChecksum: hmac(key, "ebay-deletion-payload-v1", stableSemantics(input.notification)),
    userLookupToken: ebayDeletionIdentityLookupToken(key, input.notification.userId),
    hmacKeyVersion: input.hmacConfig.activeKeyVersion,
  };
  try {
    const receipt = await input.db.ebayDeletionNotificationInbox.create({ data });
    return { receipt, replayed: false as const };
  } catch (error) {
    if (isUniqueConflict(error)) {
      const raced = await input.db.ebayDeletionNotificationInbox.findUnique({
        where: { notificationId: input.notification.notificationId },
      });
      if (raced) return compare(raced);
    }
    if (error instanceof EbayDeletionInboxError) throw error;
    throw new EbayDeletionInboxError("PERSISTENCE");
  }
}

export type EbayDeletionNotificationVerifier = Readonly<{
  verify(rawBody: Uint8Array, signatureHeader: string | null | undefined): Promise<{
    verified: true;
    notification: VerifiedNotification;
  }>;
}>;

async function boundedBody(request: Request, maximumBytes: number) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maximumBytes))
    throw new Response(null, { status: 413 });
  if (!request.body) throw new Response(null, { status: 400 });
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    let reading = true;
    while (reading) {
      const { done, value } = await reader.read();
      if (done) { reading = false; continue; }
      length += value.byteLength;
      if (length > maximumBytes) throw new Response(null, { status: 413 });
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!length) throw new Response(null, { status: 400 });
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

export async function handleEbayDeletionNotificationPost(input: {
  request: Request;
  db: PrismaClient;
  verifier: EbayDeletionNotificationVerifier;
  hmacConfig: EbayDeletionHmacConfig;
  now?: () => Date;
}) {
  if (input.request.method !== "POST") return new Response(null, { status: 405,
    headers: { Allow: "POST" } });
  const mediaType = input.request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") return new Response(null, { status: 415 });
  try {
    const rawBody = await boundedBody(input.request, 256 * 1024);
    const verified = await input.verifier.verify(rawBody, input.request.headers.get("x-ebay-signature"));
    await persistVerifiedEbayDeletionNotification({ db: input.db, notification: verified.notification,
      hmacConfig: input.hmacConfig, receivedAt: (input.now ?? (() => new Date()))() });
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof EbayNotificationVerificationError) {
      if (error.code === "INVALID_SIGNATURE") return new Response(null, { status: 412 });
      if (error.code === "KEY_RETRIEVAL_FAILED") return new Response(null, { status: 503 });
      return new Response(null, { status: 400 });
    }
    if (error instanceof EbayDeletionInboxError) {
      if (error.code === "CONFLICT") return new Response(null, { status: 409 });
      if (error.code === "INVALID_PAYLOAD") return new Response(null, { status: 400 });
      return new Response(null, { status: 503 });
    }
    return new Response(null, { status: 503 });
  }
}
