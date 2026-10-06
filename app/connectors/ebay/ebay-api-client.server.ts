import type { PrismaClient } from "@prisma/client";
import type { VerifiedCoreTenant } from "~/core/data-core-d2a.server";
import type { CredentialEncryptionProvider } from "~/services/credential-encryption.server";
import { markEbayAuthorizationReauthRequired, resolveEbayRefreshTokenForUse } from "./ebay-authorization.server";
import { signEbayHttpRequest, type EbaySigningKeyProvider } from "./ebay-http-signature.server";
import { canonicalizeEbayScopes, EbayConnectorError, type EbayApplicationConfig,
  type EbayHttpRequest, type EbayHttpResponse, type EbayHttpTransport } from "./ebay-types";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const TOKEN_ENDPOINTS = {
  SANDBOX: "https://api.sandbox.ebay.com/identity/v1/oauth2/token",
  PRODUCTION: "https://api.ebay.com/identity/v1/oauth2/token",
} as const;

export function ebayOAuthTokenEndpoint(config: Pick<EbayApplicationConfig, "environment">) {
  return TOKEN_ENDPOINTS[config.environment];
}

function responseHeaders(response: Response) {
  return Object.fromEntries([...response.headers.entries()].map(([key, value]) => [key.toLowerCase(), value]));
}

export const nativeEbayOAuthTransport: EbayHttpTransport = {
  async request(request) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const response = await fetch(request.url, { method: request.method, headers: request.headers,
        body: request.body.byteLength ? Buffer.from(request.body) : undefined, signal: controller.signal });
      return { status: response.status, headers: responseHeaders(response),
        body: new Uint8Array(await response.arrayBuffer()) };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError")
        throw new EbayConnectorError("TIMEOUT", { retryable: true });
      throw new EbayConnectorError("RETRYABLE_UPSTREAM", { retryable: true });
    } finally { clearTimeout(timeout); }
  },
};

const API_BASE_URLS = {
  SANDBOX: "https://api.sandbox.ebay.com",
  PRODUCTION: "https://api.ebay.com",
} as const;
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,256}$/;
const SIGNATURE_ERROR_IDS = new Set([215120, 215121, 215122, 215123, 215124]);

export type EbayApiOperation = "STANDARD" | "FINANCES" | "EU_UK_ISSUE_REFUND";

export function ebayApiBaseUrl(config: Pick<EbayApplicationConfig, "environment">) {
  return API_BASE_URLS[config.environment];
}

export function extractSafeEbayRequestId(headers: Readonly<Record<string, string>>) {
  const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  const value = normalized["x-ebay-c-request-id"] ?? normalized["x-ebay-request-id"] ??
    normalized["x-ebay-correlation-id"];
  return value && SAFE_REQUEST_ID.test(value) ? value : null;
}

function isSignatureFailure(response: EbayHttpResponse) {
  try {
    const value = parseJson(response);
    return Array.isArray(value.errors) && value.errors.some((entry) => entry && typeof entry === "object" &&
      SIGNATURE_ERROR_IDS.has((entry as { errorId?: number }).errorId ?? -1));
  } catch { return false; }
}

function apiError(response: EbayHttpResponse) {
  const common = { status: response.status, requestId: extractSafeEbayRequestId(response.headers) };
  if (isSignatureFailure(response)) return new EbayConnectorError("INVALID_SIGNATURE", common);
  if (response.status === 401) return new EbayConnectorError("AUTHENTICATION", common);
  if (response.status === 403) return new EbayConnectorError("AUTHORIZATION", common);
  if (response.status === 429) return new EbayConnectorError("THROTTLED", { ...common, retryable: true });
  if ([500, 502, 503, 504].includes(response.status))
    return new EbayConnectorError("RETRYABLE_UPSTREAM", { ...common, retryable: true });
  return new EbayConnectorError("NON_RETRYABLE_UPSTREAM", common);
}

function retryAfterMs(headers: Readonly<Record<string, string>>, nowMs: number, maximum: number) {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === "retry-after")?.[1];
  if (!entry) return null;
  const seconds = Number(entry);
  const value = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : Date.parse(entry) - nowMs;
  return Number.isFinite(value) && value >= 0 ? Math.min(Math.ceil(value), maximum) : null;
}

function signatureRequired(operation: EbayApiOperation, pathname: string) {
  return operation !== "STANDARD" || /^\/sell\/finances(?:\/|$)/.test(pathname) ||
    /\/issue_?refund(?:\/|$)/i.test(pathname);
}

export async function executeEbayApiRequest(input: {
  config: EbayApplicationConfig;
  accessToken: string;
  method: EbayHttpRequest["method"];
  path: string;
  query?: Readonly<Record<string, string>>;
  body?: Uint8Array;
  contentType?: string;
  operation: EbayApiOperation;
  transport: EbayHttpTransport;
  signingKeyProvider?: EbaySigningKeyProvider;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}): Promise<EbayHttpResponse> {
  if (!input.accessToken || input.accessToken !== input.accessToken.trim() || input.accessToken.length > 16_384 ||
      /[\r\n]/.test(input.accessToken) || !input.path.startsWith("/") || input.path.startsWith("//") ||
      /[\r\n]/.test(input.path) || (input.contentType !== undefined &&
        (!input.contentType.trim() || input.contentType !== input.contentType.trim() || /[\r\n]/.test(input.contentType))))
    throw new EbayConnectorError("AUTHORIZATION");
  const url = new URL(input.path, ebayApiBaseUrl(input.config));
  for (const [key, value] of Object.entries(input.query ?? {})) url.searchParams.append(key, value);
  const body = input.body?.slice() ?? new Uint8Array();
  const hasBody = input.body !== undefined;
  const mustSign = signatureRequired(input.operation, url.pathname);
  if (mustSign && !input.signingKeyProvider) throw new EbayConnectorError("SIGNING_REQUIRED");
  const clock = input.now ?? Date.now;
  const pause = input.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let lastError: EbayConnectorError | null = null;
  for (let attempt = 1; attempt <= input.config.maxAttempts; attempt += 1) {
    const headers: Record<string, string> = { authorization: `Bearer ${input.accessToken}`, accept: "application/json" };
    if (hasBody) headers["content-type"] = input.contentType ?? "application/json";
    if (mustSign) Object.assign(headers, await signEbayHttpRequest({ request: { method: input.method,
      url: url.toString(), body }, hasBody, created: Math.floor(clock() / 1000),
      keyProvider: input.signingKeyProvider }));
    let response: EbayHttpResponse;
    try { response = await input.transport.request({ method: input.method, url: url.toString(), headers,
      body: body.slice(), timeoutMs: input.config.timeoutMs }); }
    catch (error) {
      const safe = error instanceof EbayConnectorError ? error :
        new EbayConnectorError("NON_RETRYABLE_UPSTREAM");
      lastError = safe;
      if (!safe.retryable || attempt === input.config.maxAttempts) throw safe;
      await pause(Math.min(100 * (2 ** (attempt - 1)), input.config.maxRetryAfterMs));
      continue;
    }
    if (response.status >= 200 && response.status < 300) return response;
    const error = apiError(response);
    lastError = error;
    if (!error.retryable || attempt === input.config.maxAttempts) throw error;
    const wait = retryAfterMs(response.headers, clock(), input.config.maxRetryAfterMs) ??
      Math.min(100 * (2 ** (attempt - 1)), input.config.maxRetryAfterMs);
    await pause(wait);
  }
  throw lastError ?? new EbayConnectorError("RETRYABLE_UPSTREAM", { retryable: true });
}

function requestId(response: EbayHttpResponse) {
  return extractSafeEbayRequestId(response.headers);
}

function parseJson(response: EbayHttpResponse): Record<string, unknown> {
  if (response.body.byteLength > 64 * 1024)
    throw new EbayConnectorError("MALFORMED_RESPONSE", { status: response.status,
      requestId: requestId(response) });
  try {
    const value: unknown = JSON.parse(decoder.decode(response.body));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
    return value as Record<string, unknown>;
  } catch { throw new EbayConnectorError("MALFORMED_RESPONSE", { status: response.status,
    requestId: requestId(response) }); }
}

function classifyError(response: EbayHttpResponse) {
  const common = { status: response.status, requestId: requestId(response) };
  let code: unknown;
  try { code = parseJson(response).error; } catch { /* Never expose the upstream body. */ }
  if (code === "invalid_grant") return new EbayConnectorError("REAUTH_REQUIRED", common);
  if (response.status === 401) return new EbayConnectorError("AUTHENTICATION", common);
  if (response.status === 403) return new EbayConnectorError("AUTHORIZATION", common);
  if (response.status === 429) return new EbayConnectorError("THROTTLED", { ...common, retryable: true });
  if ([500, 502, 503, 504].includes(response.status))
    return new EbayConnectorError("RETRYABLE_UPSTREAM", { ...common, retryable: true });
  return new EbayConnectorError("NON_RETRYABLE_UPSTREAM", common);
}

type TokenResult = Readonly<{ accessToken: string; expiresInSeconds: number; tokenType: "User Access Token";
  refreshToken: string | null; refreshTokenExpiresInSeconds: number | null }>;

function positiveSeconds(value: unknown, maximum: number) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= maximum ? value : null;
}

async function tokenRequest(config: EbayApplicationConfig, transport: EbayHttpTransport,
form: URLSearchParams, requireRefreshToken: boolean): Promise<TokenResult> {
  const response = await transport.request({ method: "POST", url: ebayOAuthTokenEndpoint(config), headers: {
    authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString("base64")}`,
    "content-type": "application/x-www-form-urlencoded",
    accept: "application/json",
  }, body: encoder.encode(form.toString()), timeoutMs: config.timeoutMs });
  if (response.status < 200 || response.status >= 300) throw classifyError(response);
  const value = parseJson(response);
  const accessToken = value.access_token;
  const refreshToken = value.refresh_token;
  const expiresInSeconds = positiveSeconds(value.expires_in, 86_400);
  const refreshTokenExpiresInSeconds = value.refresh_token_expires_in === undefined ? null :
    positiveSeconds(value.refresh_token_expires_in, 10 * 366 * 24 * 60 * 60);
  if (typeof accessToken !== "string" || !accessToken || accessToken !== accessToken.trim() || accessToken.length > 16_384 ||
      typeof value.token_type !== "string" || !["user access token", "bearer"].includes(value.token_type.toLowerCase()) ||
      expiresInSeconds === null || (refreshToken !== undefined &&
        (typeof refreshToken !== "string" || !refreshToken || refreshToken !== refreshToken.trim() || refreshToken.length > 16_384)) ||
      (requireRefreshToken && typeof refreshToken !== "string") ||
      (value.refresh_token_expires_in !== undefined && refreshTokenExpiresInSeconds === null))
    throw new EbayConnectorError("MALFORMED_RESPONSE", { status: response.status, requestId: requestId(response) });
  return { accessToken, expiresInSeconds, tokenType: "User Access Token",
    refreshToken: typeof refreshToken === "string" ? refreshToken : null, refreshTokenExpiresInSeconds };
}

export async function exchangeEbayAuthorizationCode(input: {
  authorizationCode: string; config: EbayApplicationConfig; transport: EbayHttpTransport;
}) {
  if (!input.authorizationCode || input.authorizationCode !== input.authorizationCode.trim() ||
      input.authorizationCode.length > 16_384) throw new EbayConnectorError("AUTHORIZATION");
  return tokenRequest(input.config, input.transport, new URLSearchParams({ grant_type: "authorization_code",
    code: input.authorizationCode, redirect_uri: input.config.ruName }), true);
}

export async function exchangeEbayRefreshToken(input: {
  refreshToken: string; grantedScopes: readonly string[];
  config: EbayApplicationConfig; transport: EbayHttpTransport;
}) {
  if (!input.refreshToken || input.refreshToken !== input.refreshToken.trim() || input.refreshToken.length > 16_384)
    throw new EbayConnectorError("AUTHORIZATION");
  const scopes = canonicalizeEbayScopes(input.grantedScopes);
  return tokenRequest(input.config, input.transport, new URLSearchParams({ grant_type: "refresh_token",
    refresh_token: input.refreshToken, scope: scopes.join(" ") }), false);
}

export async function refreshEbaySellerAccessToken(input: {
  db: PrismaClient; tenant: VerifiedCoreTenant; config: EbayApplicationConfig;
  transport: EbayHttpTransport; encryptionProvider: CredentialEncryptionProvider; now?: Date;
}) {
  let refreshToken: string;
  try { refreshToken = await resolveEbayRefreshTokenForUse(input.db, input.tenant, input.encryptionProvider); }
  catch { throw new EbayConnectorError("AUTHORIZATION"); }
  const authorization = await input.db.ebaySellerAuthorization.findUnique({
    where: { channelConnectionId: input.tenant.channelConnectionId } });
  if (!authorization || authorization.accountId !== input.tenant.accountId)
    throw new EbayConnectorError("AUTHORIZATION");
  let grantedScopes: string[];
  try { grantedScopes = canonicalizeEbayScopes(JSON.parse(authorization.grantedScopesJson) as unknown as string[]); }
  catch { throw new EbayConnectorError("AUTHORIZATION"); }
  try {
    return await exchangeEbayRefreshToken({ refreshToken, grantedScopes, config: input.config,
      transport: input.transport });
  } catch (error) {
    if (error instanceof EbayConnectorError && error.kind === "REAUTH_REQUIRED")
      await markEbayAuthorizationReauthRequired(input.db, input.tenant, input.now ?? new Date());
    throw error;
  }
}
