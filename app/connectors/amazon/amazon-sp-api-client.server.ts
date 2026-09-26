import {
  AmazonConnectorError, type AmazonApplicationConfig, type AmazonHttpRequest,
  type AmazonHttpResponse, type AmazonHttpTransport, type AmazonMarketplaceParticipation,
  type AmazonRegion,
} from "./amazon-types";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";
const ENDPOINTS: Record<AmazonRegion, string> = {
  NA: "https://sellingpartnerapi-na.amazon.com",
  EU: "https://sellingpartnerapi-eu.amazon.com",
  FE: "https://sellingpartnerapi-fe.amazon.com",
};

const MARKETPLACE_REGIONS: Readonly<Record<string, AmazonRegion>> = {
  ATVPDKIKX0DER: "NA", A2EUQ1WTGCTBG2: "NA", A1AM78C64UM0Y8: "NA", A2Q3Y263D00KWC: "NA",
  A1RKKUPIHCS9HS: "EU", A1F83G8C2ARO7P: "EU", A13V1IB3VIYZZH: "EU", AMEN7PMS3EDWL: "EU",
  A1805IZSGTT6HS: "EU", A1PA6795UKMFR9: "EU", APJ6JRA9NG5V4: "EU", A2NODRKZP88ZB9: "EU",
  A1C3SOZRARQ6R3: "EU", A33AVAJ2PDY3EV: "EU", A17E79C6D8DWNP: "EU", A2VIGQ35RCS4UG: "EU",
  A21TJRUUN4KGV: "EU", A1VC38T7YXB528: "FE", A39IBJ37TRP1C6: "FE", A19VAU5U5O7RUS: "FE",
};

export function amazonEndpointForRegion(region: AmazonRegion) {
  const endpoint = ENDPOINTS[region];
  if (!endpoint) throw new AmazonConnectorError("UNSUPPORTED_REGION");
  return endpoint;
}

export function amazonRegionForMarketplace(marketplaceId: string) {
  const region = MARKETPLACE_REGIONS[marketplaceId];
  if (!region) throw new AmazonConnectorError("UNSUPPORTED_REGION");
  return region;
}

function headers(response: Response) {
  return Object.fromEntries([...response.headers.entries()].map(([key, value]) => [key.toLowerCase(), value]));
}

export const nativeAmazonHttpTransport: AmazonHttpTransport = {
  async request(request) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const response = await fetch(request.url, { method: request.method, headers: request.headers,
        body: request.body ? Buffer.from(request.body) : undefined, signal: controller.signal });
      return { status: response.status, headers: headers(response), body: new Uint8Array(await response.arrayBuffer()) };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new AmazonConnectorError("TIMEOUT", { retryable: true });
      throw new AmazonConnectorError("RETRYABLE_UPSTREAM", { retryable: true });
    } finally { clearTimeout(timeout); }
  },
};

export type AmazonRetryHooks = Readonly<{ now?: () => number; sleep?: (ms: number) => Promise<void>; random?: () => number }>;

export function parseAmazonJson(response: AmazonHttpResponse): unknown {
  try { return JSON.parse(decoder.decode(response.body)); }
  catch { throw new AmazonConnectorError("MALFORMED_RESPONSE", { status: response.status,
    requestId: response.headers["x-amzn-requestid"] ?? null }); }
}

function retryAfterMs(value: string | undefined, now: () => number) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 60_000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.min(date - now(), 60_000)) : null;
}

function classify(response: AmazonHttpResponse, now: () => number) {
  const common = { status: response.status, requestId: response.headers["x-amzn-requestid"] ?? null };
  if (response.status === 401) return new AmazonConnectorError("AUTHENTICATION", common);
  if (response.status === 403) return new AmazonConnectorError("AUTHORIZATION", common);
  if (response.status === 429) return new AmazonConnectorError("THROTTLED", { ...common, retryable: true,
    retryAfterMs: retryAfterMs(response.headers["retry-after"], now) });
  if ([500, 502, 503, 504].includes(response.status))
    return new AmazonConnectorError("RETRYABLE_UPSTREAM", { ...common, retryable: true });
  return new AmazonConnectorError("NON_RETRYABLE_UPSTREAM", common);
}

export async function sendAmazonRequest(transport: AmazonHttpTransport, request: AmazonHttpRequest,
  config: AmazonApplicationConfig, hooks: AmazonRetryHooks = {}) {
  const now = hooks.now ?? Date.now;
  const sleep = hooks.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const random = hooks.random ?? Math.random;
  let last: AmazonConnectorError | undefined;
  for (let attempt = 0; attempt < config.maxAttempts; attempt += 1) {
    try {
      const response = await transport.request(request);
      if (response.status >= 200 && response.status < 300) return response;
      last = classify(response, now);
    } catch (error) {
      last = error instanceof AmazonConnectorError ? error : new AmazonConnectorError("RETRYABLE_UPSTREAM", { retryable: true });
    }
    if (!last.retryable || attempt + 1 === config.maxAttempts) throw last;
    const exponential = Math.min(250 * 2 ** attempt, 5_000);
    await sleep(last.retryAfterMs ?? Math.floor(exponential * (0.5 + random() * 0.5)));
  }
  throw last ?? new AmazonConnectorError("RETRYABLE_UPSTREAM", { retryable: true });
}

export async function exchangeLwaAccessToken(refreshToken: string, config: AmazonApplicationConfig,
  transport: AmazonHttpTransport, hooks?: AmazonRetryHooks) {
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken,
    client_id: config.lwaClientId, client_secret: config.lwaClientSecret }).toString();
  const response = await sendAmazonRequest(transport, { method: "POST", url: LWA_TOKEN_URL,
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8", accept: "application/json" },
    body: encoder.encode(body), timeoutMs: config.timeoutMs }, config, hooks);
  const value = parseAmazonJson(response);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AmazonConnectorError("MALFORMED_RESPONSE");
  const token = value as Record<string, unknown>;
  if (typeof token.access_token !== "string" || !token.access_token || token.access_token.length > 2048 ||
      typeof token.token_type !== "string" || token.token_type.toLowerCase() !== "bearer" ||
      typeof token.expires_in !== "number" || !Number.isSafeInteger(token.expires_in) || token.expires_in <= 0 || token.expires_in > 86400)
    throw new AmazonConnectorError("MALFORMED_RESPONSE");
  return { accessToken: token.access_token, expiresInSeconds: token.expires_in } as const;
}

function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value === value.trim(); }
function parseMarketplaceResponse(value: unknown): AmazonMarketplaceParticipation[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AmazonConnectorError("MALFORMED_RESPONSE");
  const root = value as Record<string, unknown>;
  if (!Array.isArray(root.payload) || root.errors !== undefined) throw new AmazonConnectorError("MALFORMED_RESPONSE");
  const seen = new Set<string>();
  return root.payload.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new AmazonConnectorError("MALFORMED_RESPONSE");
    const item = entry as Record<string, unknown>;
    const marketplace = item.marketplace as Record<string, unknown> | undefined;
    const participation = item.participation as Record<string, unknown> | undefined;
    if (!marketplace || !participation || !nonEmpty(marketplace.id) || !nonEmpty(marketplace.name) ||
        !nonEmpty(marketplace.countryCode) || !/^[A-Z]{2}$/.test(marketplace.countryCode) ||
        !nonEmpty(marketplace.defaultCurrencyCode) || !/^[A-Z]{3}$/.test(marketplace.defaultCurrencyCode) ||
        !nonEmpty(marketplace.defaultLanguageCode) || !nonEmpty(marketplace.domainName) || !nonEmpty(item.storeName) ||
        typeof participation.isParticipating !== "boolean" || typeof participation.hasSuspendedListings !== "boolean" ||
        seen.has(marketplace.id)) throw new AmazonConnectorError("MALFORMED_RESPONSE");
    seen.add(marketplace.id);
    return { marketplaceId: marketplace.id, name: marketplace.name, countryCode: marketplace.countryCode,
      defaultCurrencyCode: marketplace.defaultCurrencyCode, defaultLanguageCode: marketplace.defaultLanguageCode,
      domainName: marketplace.domainName, storeName: item.storeName,
      isParticipating: participation.isParticipating, hasSuspendedListings: participation.hasSuspendedListings };
  });
}

export async function getMarketplaceParticipations(region: AmazonRegion, accessToken: string,
  config: AmazonApplicationConfig, transport: AmazonHttpTransport, hooks?: AmazonRetryHooks) {
  const endpoint = amazonEndpointForRegion(region);
  const response = await sendAmazonRequest(transport, { method: "GET",
    url: `${endpoint}/sellers/v1/marketplaceParticipations`, headers: {
      host: new URL(endpoint).host, "x-amz-access-token": accessToken,
      "x-amz-date": new Date((hooks?.now ?? Date.now)()).toISOString().replace(/[:-]|\.\d{3}/g, ""),
      "user-agent": config.userAgent, accept: "application/json",
    }, timeoutMs: config.timeoutMs }, config, hooks);
  const parsed = parseMarketplaceResponse(parseAmazonJson(response));
  for (const marketplace of parsed)
    if (amazonRegionForMarketplace(marketplace.marketplaceId) !== region) throw new AmazonConnectorError("UNSUPPORTED_REGION");
  return parsed;
}
