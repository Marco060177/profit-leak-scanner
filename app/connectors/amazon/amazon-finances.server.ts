import type { PrismaClient } from "@prisma/client";
import type { VerifiedCoreTenant } from "~/core/data-core-d2a.server";
import type { CredentialEncryptionProvider } from "~/services/credential-encryption.server";
import { resolveAmazonRefreshTokenForUse } from "./amazon-authorization.server";
import { assertAmazonOrdersBoundary } from "./amazon-orders.server";
import {
  amazonEndpointForRegion,
  amazonRegionForMarketplace,
  exchangeLwaAccessToken,
  sendAmazonRequest,
  type AmazonRetryHooks,
} from "./amazon-sp-api-client.server";
import {
  AmazonConnectorError,
  type AmazonApplicationConfig,
  type AmazonHttpTransport,
} from "./amazon-types";

const decoder = new TextDecoder("utf-8", { fatal: true });
const MAX_WINDOW_MS = 180 * 24 * 60 * 60 * 1000;
const MIN_RECENCY_MS = 2 * 60 * 1000;
export const AMAZON_FINANCES_RATE_LIMIT = { requestsPerSecond: 0.5, burst: 10 } as const;

export type AmazonLosslessNumber = Readonly<{ sourceText: string }>;
export type AmazonLosslessJson = null | boolean | string | AmazonLosslessNumber |
  readonly AmazonLosslessJson[] | { readonly [key: string]: AmazonLosslessJson };

export type AmazonFinancesMoney = Readonly<{ currencyCode: string; amount: AmazonLosslessNumber }>;
export type AmazonFinancesRelatedIdentifier = Readonly<{ name: string; value: string }>;
export type AmazonFinancesContext = Readonly<{ contextType: string; source: Readonly<Record<string, AmazonLosslessJson>> }>;
export type AmazonFinancesBreakdown = Readonly<{
  breakdownType: string;
  breakdownAmount?: AmazonFinancesMoney;
  breakdowns: readonly AmazonFinancesBreakdown[];
}>;
export type AmazonFinancesItem = Readonly<{
  description?: string;
  relatedIdentifiers: readonly AmazonFinancesRelatedIdentifier[];
  totalAmount?: AmazonFinancesMoney;
  contexts: readonly AmazonFinancesContext[];
  breakdowns: readonly AmazonFinancesBreakdown[];
}>;
export type AmazonFinancesTransaction = Readonly<{
  transactionId: string;
  transactionType: string;
  transactionStatus?: string;
  description?: string;
  postedDate: Date;
  totalAmount?: AmazonFinancesMoney;
  marketplace?: Readonly<{ marketplaceId?: string; marketplaceName?: string }>;
  sellingPartner?: Readonly<{ sellingPartnerId?: string; accountType?: string; marketplaceId?: string }>;
  relatedIdentifiers: readonly AmazonFinancesRelatedIdentifier[];
  items: readonly AmazonFinancesItem[];
  contexts: readonly AmazonFinancesContext[];
  breakdowns: readonly AmazonFinancesBreakdown[];
}>;

export type AmazonFinancesQuery = Readonly<{
  postedAfter?: Date;
  postedBefore?: Date;
  includeMarketplaceFilter?: boolean;
  transactionStatus?: "DEFERRED" | "RELEASED" | "DEFERRED_RELEASED";
  relatedIdentifier?: Readonly<{
    name: "ORDER_ID" | "FINANCIAL_EVENT_GROUP_ID";
    value: string;
  }>;
  maxPages?: number;
  maxBreakdownDepth?: number;
}>;

export type AmazonFinancesEvidencePage = Readonly<{
  pageIndex: number;
  body: Uint8Array;
  transactions: readonly AmazonFinancesTransaction[];
  requestId: string | null;
  nextToken: string | null;
}>;

export type AmazonFinancesAcquisition = Readonly<{ pages: readonly AmazonFinancesEvidencePage[] }>;

class LosslessJsonParser {
  private index = 0;
  private readonly text: string;
  constructor(text: string) { this.text = text; }
  parse(): AmazonLosslessJson {
    this.space();
    const value = this.value();
    this.space();
    if (this.index !== this.text.length) this.fail();
    return value;
  }
  private value(): AmazonLosslessJson {
    const char = this.text[this.index];
    if (char === "{") return this.object();
    if (char === "[") return this.array();
    if (char === '"') return this.string();
    if (char === "-" || (char >= "0" && char <= "9")) return this.number();
    if (this.text.startsWith("true", this.index)) { this.index += 4; return true; }
    if (this.text.startsWith("false", this.index)) { this.index += 5; return false; }
    if (this.text.startsWith("null", this.index)) { this.index += 4; return null; }
    return this.fail();
  }
  private object(): { readonly [key: string]: AmazonLosslessJson } {
    this.index += 1; this.space();
    const result: Record<string, AmazonLosslessJson> = Object.create(null) as Record<string, AmazonLosslessJson>;
    const keys = new Set<string>();
    if (this.text[this.index] === "}") { this.index += 1; return result; }
    while (this.index < this.text.length) {
      if (this.text[this.index] !== '"') this.fail();
      const key = this.string();
      if (keys.has(key)) this.fail();
      keys.add(key); this.space();
      if (this.text[this.index++] !== ":") this.fail();
      this.space(); result[key] = this.value(); this.space();
      const delimiter = this.text[this.index++];
      if (delimiter === "}") return result;
      if (delimiter !== ",") this.fail();
      this.space();
    }
    return this.fail();
  }
  private array(): readonly AmazonLosslessJson[] {
    this.index += 1; this.space();
    const result: AmazonLosslessJson[] = [];
    if (this.text[this.index] === "]") { this.index += 1; return result; }
    while (this.index < this.text.length) {
      result.push(this.value()); this.space();
      const delimiter = this.text[this.index++];
      if (delimiter === "]") return result;
      if (delimiter !== ",") this.fail();
      this.space();
    }
    return this.fail();
  }
  private string(): string {
    const start = this.index++;
    while (this.index < this.text.length) {
      const char = this.text[this.index++];
      if (char === '"') {
        try { return JSON.parse(this.text.slice(start, this.index)) as string; }
        catch { return this.fail(); }
      }
      if (char === "\\") {
        const escape = this.text[this.index++];
        if (!'"\\/bfnrtu'.includes(escape ?? "")) this.fail();
        if (escape === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(this.text.slice(this.index, this.index + 4))) this.fail();
          this.index += 4;
        }
      } else if (char < " ") this.fail();
    }
    return this.fail();
  }
  private number(): AmazonLosslessNumber {
    const rest = this.text.slice(this.index);
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest);
    if (!match) return this.fail();
    this.index += match[0].length;
    return Object.freeze({ sourceText: match[0] });
  }
  private space() { while (/\s/.test(this.text[this.index] ?? "")) this.index += 1; }
  private fail(): never { throw new AmazonConnectorError("MALFORMED_RESPONSE"); }
}

function parseLosslessJson(bytes: Uint8Array): AmazonLosslessJson {
  try { return new LosslessJsonParser(decoder.decode(bytes)).parse(); }
  catch (error) {
    if (error instanceof AmazonConnectorError) throw error;
    throw new AmazonConnectorError("MALFORMED_RESPONSE");
  }
}
function object(value: AmazonLosslessJson | undefined): Readonly<Record<string, AmazonLosslessJson>> {
  if (!value || typeof value !== "object" || Array.isArray(value) || "sourceText" in value)
    throw new AmazonConnectorError("MALFORMED_RESPONSE");
  return value as Readonly<Record<string, AmazonLosslessJson>>;
}
function array(value: AmazonLosslessJson | undefined): readonly AmazonLosslessJson[] {
  if (!Array.isArray(value)) throw new AmazonConnectorError("MALFORMED_RESPONSE");
  return value;
}
function optionalArray(value: AmazonLosslessJson | undefined) { return value === undefined ? [] : array(value); }
function nonEmpty(value: AmazonLosslessJson | undefined): string {
  if (typeof value !== "string" || !value || value !== value.trim()) throw new AmazonConnectorError("MALFORMED_RESPONSE");
  return value;
}
function optionalString(value: AmazonLosslessJson | undefined): string | undefined {
  return value === undefined ? undefined : nonEmpty(value);
}
function parseDate(value: AmazonLosslessJson | undefined): Date {
  const source = nonEmpty(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(source))
    throw new AmazonConnectorError("MALFORMED_RESPONSE");
  const date = new Date(source);
  if (!Number.isFinite(date.getTime())) throw new AmazonConnectorError("MALFORMED_RESPONSE");
  return date;
}
function money(value: AmazonLosslessJson | undefined): AmazonFinancesMoney | undefined {
  if (value === undefined) return undefined;
  const source = object(value);
  const code = nonEmpty(source.currencyCode);
  const amount = source.currencyAmount;
  if (!/^[A-Z]{3}$/.test(code) || !amount || typeof amount !== "object" || Array.isArray(amount) ||
      !("sourceText" in amount) || typeof amount.sourceText !== "string")
    throw new AmazonConnectorError("MALFORMED_RESPONSE");
  return { currencyCode: code, amount: amount as AmazonLosslessNumber };
}
function identifiers(value: AmazonLosslessJson | undefined, item = false): AmazonFinancesRelatedIdentifier[] {
  return optionalArray(value).map((entry) => {
    const source = object(entry);
    return { name: nonEmpty(source[item ? "itemRelatedIdentifierName" : "relatedIdentifierName"]),
      value: nonEmpty(source[item ? "itemRelatedIdentifierValue" : "relatedIdentifierValue"]) };
  });
}
function contexts(value: AmazonLosslessJson | undefined): AmazonFinancesContext[] {
  return optionalArray(value).map((entry) => {
    const source = object(entry);
    return { contextType: nonEmpty(source.contextType), source };
  });
}
function breakdowns(value: AmazonLosslessJson | undefined, depth: number, maximum: number): AmazonFinancesBreakdown[] {
  if (depth > maximum) throw new AmazonConnectorError("MALFORMED_RESPONSE");
  return optionalArray(value).map((entry) => {
    const source = object(entry);
    return { breakdownType: nonEmpty(source.breakdownType), breakdownAmount: money(source.breakdownAmount),
      breakdowns: breakdowns(source.breakdowns, depth + 1, maximum) };
  });
}
function parsePage(body: Uint8Array, maximumDepth: number) {
  const root = object(parseLosslessJson(body));
  if (root.errors !== undefined) throw new AmazonConnectorError("MALFORMED_RESPONSE");
  const payload = object(root.payload);
  const nextToken = root.payload === undefined ? undefined : optionalString(payload.nextToken);
  const transactions = array(payload.transactions).map((entry): AmazonFinancesTransaction => {
    const source = object(entry);
    const marketplaceSource = source.marketplaceDetails === undefined ? undefined : object(source.marketplaceDetails);
    const sellingSource = source.sellingPartnerMetadata === undefined ? undefined : object(source.sellingPartnerMetadata);
    const marketplace = marketplaceSource ? { marketplaceId: optionalString(marketplaceSource.marketplaceId),
      marketplaceName: optionalString(marketplaceSource.marketplaceName) } : undefined;
    const sellingPartner = sellingSource ? { sellingPartnerId: optionalString(sellingSource.sellingPartnerId),
      accountType: optionalString(sellingSource.accountType), marketplaceId: optionalString(sellingSource.marketplaceId) } : undefined;
    const parsedItems = optionalArray(source.items).map((entry): AmazonFinancesItem => {
      const item = object(entry);
      return { description: optionalString(item.description), relatedIdentifiers: identifiers(item.relatedIdentifiers, true),
        totalAmount: money(item.totalAmount), contexts: contexts(item.contexts),
        breakdowns: breakdowns(item.breakdowns, 1, maximumDepth) };
    });
    return { transactionId: nonEmpty(source.transactionId), transactionType: nonEmpty(source.transactionType),
      transactionStatus: optionalString(source.transactionStatus), description: optionalString(source.description),
      postedDate: parseDate(source.postedDate), totalAmount: money(source.totalAmount), marketplace, sellingPartner,
      relatedIdentifiers: identifiers(source.relatedIdentifiers), items: parsedItems, contexts: contexts(source.contexts),
      breakdowns: breakdowns(source.breakdowns, 1, maximumDepth) };
  });
  return { transactions, nextToken };
}

function validDate(date: Date | undefined) { return date !== undefined && Number.isFinite(date.getTime()); }
function validateQuery(query: AmazonFinancesQuery, now: number) {
  if (!query.postedAfter && !query.relatedIdentifier) throw new AmazonConnectorError("INVALID_QUERY");
  if (query.postedAfter !== undefined && !validDate(query.postedAfter)) throw new AmazonConnectorError("INVALID_QUERY");
  if (query.postedBefore !== undefined && !validDate(query.postedBefore)) throw new AmazonConnectorError("INVALID_QUERY");
  if (query.postedBefore && !query.postedAfter) throw new AmazonConnectorError("INVALID_QUERY");
  if (query.postedAfter && query.postedAfter.getTime() >= now - MIN_RECENCY_MS) throw new AmazonConnectorError("INVALID_QUERY");
  if (query.postedBefore && query.postedBefore.getTime() >= now - MIN_RECENCY_MS) throw new AmazonConnectorError("INVALID_QUERY");
  if (query.postedAfter && query.postedBefore &&
      (query.postedBefore <= query.postedAfter || query.postedBefore.getTime() - query.postedAfter.getTime() > MAX_WINDOW_MS))
    throw new AmazonConnectorError("INVALID_QUERY");
  if (query.relatedIdentifier && (!query.relatedIdentifier.value ||
      query.relatedIdentifier.value !== query.relatedIdentifier.value.trim() || query.relatedIdentifier.value.length > 512))
    throw new AmazonConnectorError("INVALID_QUERY");
  if (query.transactionStatus !== undefined &&
      !["DEFERRED", "RELEASED", "DEFERRED_RELEASED"].includes(query.transactionStatus))
    throw new AmazonConnectorError("INVALID_QUERY");
  if (query.maxPages !== undefined && (!Number.isSafeInteger(query.maxPages) || query.maxPages < 1 || query.maxPages > 10_000))
    throw new AmazonConnectorError("INVALID_QUERY");
  if (query.maxBreakdownDepth !== undefined && (!Number.isSafeInteger(query.maxBreakdownDepth) ||
      query.maxBreakdownDepth < 1 || query.maxBreakdownDepth > 128)) throw new AmazonConnectorError("INVALID_QUERY");
}

/** Acquires Finances v2024-06-19 transactions only. It performs no persistence or economic classification. */
export async function listAmazonFinancialTransactions(input: {
  db: PrismaClient;
  tenant: VerifiedCoreTenant;
  marketplaceId: string;
  query: AmazonFinancesQuery;
  config: AmazonApplicationConfig;
  transport: AmazonHttpTransport;
  encryptionProvider: CredentialEncryptionProvider;
  retry?: AmazonRetryHooks;
}): Promise<AmazonFinancesAcquisition> {
  const now = (input.retry?.now ?? Date.now)();
  validateQuery(input.query, now);
  const externalMarketplaceId = await assertAmazonOrdersBoundary(input.db, input.tenant, input.marketplaceId);
  let refreshToken: string;
  try { refreshToken = await resolveAmazonRefreshTokenForUse(input.db, input.tenant, input.encryptionProvider); }
  catch { throw new AmazonConnectorError("AUTHORIZATION"); }
  const token = await exchangeLwaAccessToken(refreshToken, input.config, input.transport, input.retry);
  const endpoint = amazonEndpointForRegion(amazonRegionForMarketplace(externalMarketplaceId));
  const base = new URLSearchParams();
  if (input.query.postedAfter) base.set("postedAfter", input.query.postedAfter.toISOString());
  if (input.query.postedBefore) base.set("postedBefore", input.query.postedBefore.toISOString());
  if (input.query.includeMarketplaceFilter !== false) base.set("marketplaceId", externalMarketplaceId);
  if (input.query.transactionStatus) base.set("transactionStatus", input.query.transactionStatus);
  if (input.query.relatedIdentifier) {
    base.set("relatedIdentifierName", input.query.relatedIdentifier.name);
    base.set("relatedIdentifierValue", input.query.relatedIdentifier.value);
  }
  const pages: AmazonFinancesEvidencePage[] = [];
  const seenTokens = new Set<string>();
  const maxPages = input.query.maxPages ?? 100;
  let nextToken: string | undefined;
  for (let pageIndex = 1; ; pageIndex += 1) {
    if (pageIndex > maxPages) throw new AmazonConnectorError("INVALID_QUERY");
    const params = new URLSearchParams(base);
    if (nextToken) params.set("nextToken", nextToken);
    const response = await sendAmazonRequest(input.transport, { method: "GET",
      url: `${endpoint}/finances/2024-06-19/transactions?${params}`, headers: {
        host: new URL(endpoint).host, "x-amz-access-token": token.accessToken,
        "x-amz-date": new Date((input.retry?.now ?? Date.now)()).toISOString().replace(/[:-]|\.\d{3}/g, ""),
        "user-agent": input.config.userAgent, accept: "application/json",
      }, timeoutMs: input.config.timeoutMs }, input.config, input.retry);
    const page = parsePage(response.body, input.query.maxBreakdownDepth ?? 32);
    pages.push({ pageIndex, body: response.body.slice(), transactions: page.transactions,
      requestId: response.headers["x-amzn-requestid"] ?? null, nextToken: page.nextToken ?? null });
    if (!page.nextToken) break;
    if (seenTokens.has(page.nextToken)) throw new AmazonConnectorError("SOURCE_CONFLICT");
    seenTokens.add(page.nextToken);
    nextToken = page.nextToken;
  }
  await assertAmazonOrdersBoundary(input.db, input.tenant, input.marketplaceId);
  return { pages };
}
