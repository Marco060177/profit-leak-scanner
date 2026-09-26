export type AmazonRegion = "NA" | "EU" | "FE";

export type AmazonApplicationConfig = Readonly<{
  lwaClientId: string;
  lwaClientSecret: string;
  userAgent: string;
  timeoutMs: number;
  maxAttempts: number;
}>;

export type AmazonHttpRequest = Readonly<{
  method: "GET" | "POST";
  url: string;
  headers: Readonly<Record<string, string>>;
  body?: Uint8Array;
  timeoutMs: number;
}>;

export type AmazonHttpResponse = Readonly<{
  status: number;
  headers: Readonly<Record<string, string>>;
  body: Uint8Array;
}>;

export interface AmazonHttpTransport {
  request(request: AmazonHttpRequest): Promise<AmazonHttpResponse>;
}

export type AmazonErrorKind =
  | "CONFIGURATION" | "AUTHORIZATION" | "AUTHENTICATION" | "THROTTLED"
  | "RETRYABLE_UPSTREAM" | "NON_RETRYABLE_UPSTREAM" | "TIMEOUT"
  | "MALFORMED_RESPONSE" | "UNSUPPORTED_REGION" | "SOURCE_CONFLICT"
  | "UNSUPPORTED_SOURCE_VALUE" | "INVALID_QUERY";

export class AmazonConnectorError extends Error {
  readonly kind: AmazonErrorKind;
  readonly retryable: boolean;
  readonly status: number | null;
  readonly requestId: string | null;
  readonly retryAfterMs: number | null;

  constructor(kind: AmazonErrorKind, options: {
    retryable?: boolean; status?: number; requestId?: string | null; retryAfterMs?: number | null;
  } = {}) {
    super(`Amazon connector ${kind.toLowerCase().replaceAll("_", " ")}`);
    this.name = "AmazonConnectorError";
    this.kind = kind;
    this.retryable = options.retryable ?? false;
    this.status = options.status ?? null;
    this.requestId = options.requestId ?? null;
    this.retryAfterMs = options.retryAfterMs ?? null;
  }

  toJSON() {
    return { name: this.name, kind: this.kind, retryable: this.retryable, status: this.status,
      requestId: this.requestId, retryAfterMs: this.retryAfterMs };
  }
}

export type AmazonMarketplaceParticipation = Readonly<{
  marketplaceId: string;
  name: string;
  countryCode: string;
  defaultCurrencyCode: string;
  defaultLanguageCode: string;
  domainName: string;
  storeName: string;
  isParticipating: boolean;
  hasSuspendedListings: boolean;
}>;
