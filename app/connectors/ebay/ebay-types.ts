export const EBAY_REQUIRED_SCOPES = [
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.finances",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
] as const;

export type EbayEnvironment = "SANDBOX" | "PRODUCTION";

export type EbayApplicationConfig = Readonly<{
  environment: EbayEnvironment;
  clientId: string;
  clientSecret: string;
  ruName: string;
  timeoutMs: number;
  maxAttempts: number;
  maxRetryAfterMs: number;
}>;

export type EbayHttpRequest = Readonly<{
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  headers: Readonly<Record<string, string>>;
  body: Uint8Array;
  timeoutMs: number;
}>;

export type EbayHttpResponse = Readonly<{
  status: number;
  headers: Readonly<Record<string, string>>;
  body: Uint8Array;
}>;

export interface EbayHttpTransport {
  request(request: EbayHttpRequest): Promise<EbayHttpResponse>;
}

export type EbayErrorKind =
  | "CONFIGURATION"
  | "AUTHENTICATION"
  | "AUTHORIZATION"
  | "REAUTH_REQUIRED"
  | "THROTTLED"
  | "RETRYABLE_UPSTREAM"
  | "NON_RETRYABLE_UPSTREAM"
  | "TIMEOUT"
  | "SIGNING_REQUIRED"
  | "INVALID_SIGNATURE"
  | "MALFORMED_RESPONSE";

export class EbayConnectorError extends Error {
  readonly kind: EbayErrorKind;
  readonly retryable: boolean;
  readonly status: number | null;
  readonly requestId: string | null;

  constructor(kind: EbayErrorKind, options: {
    retryable?: boolean; status?: number; requestId?: string | null;
  } = {}) {
    super(`eBay connector ${kind.toLowerCase().replaceAll("_", " ")}`);
    this.name = "EbayConnectorError";
    this.kind = kind;
    this.retryable = options.retryable ?? false;
    this.status = options.status ?? null;
    this.requestId = options.requestId ?? null;
  }

  toJSON() {
    return { name: this.name, kind: this.kind, retryable: this.retryable,
      status: this.status, requestId: this.requestId };
  }
}

function validScope(scope: string) {
  return scope.length > 0 && scope.length <= 512 && scope === scope.trim() &&
    /^https:\/\/api\.ebay\.com\/oauth\/api_scope\/[a-z.]+$/.test(scope);
}

export function canonicalizeEbayScopes(scopes: readonly string[]) {
  if (!Array.isArray(scopes) || !scopes.length || scopes.some((scope) => typeof scope !== "string" || !validScope(scope)))
    throw new EbayConnectorError("AUTHORIZATION");
  const canonical = [...new Set(scopes)].sort();
  if (EBAY_REQUIRED_SCOPES.some((required) => !canonical.includes(required)))
    throw new EbayConnectorError("AUTHORIZATION");
  return canonical;
}
