import type { PrismaClient } from "@prisma/client";
import type { VerifiedCoreTenant } from "~/core/data-core-d2a.server";
import type { CredentialEncryptionProvider } from "~/services/credential-encryption.server";
import { ebayFinancesApiBaseUrl, executeEbayApiRequest, extractSafeEbayRequestId,
  refreshEbaySellerAccessToken }
  from "./ebay-api-client.server";
import type { EbaySigningKeyProvider } from "./ebay-http-signature.server";
import { assertEbayOrdersBoundary } from "./ebay-orders.server";
import { EbayConnectorError, type EbayApplicationConfig, type EbayHttpTransport } from "./ebay-types";

const FINANCES_PATH = "/sell/finances/v1/transaction";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const decoder = new TextDecoder("utf-8", { fatal: true });
const FINANCES_SCOPE = "https://api.ebay.com/oauth/api_scope/sell.finances";

export type EbayFinancesQuery = Readonly<{
  transactionDateFrom: Date;
  transactionDateTo: Date;
  pageSize?: number;
  maxPages?: number;
}>;
export type EbayFinancialTransactionReference = Readonly<{
  transactionId: string;
  transactionType: string | null;
  transactionStatus?: string;
  transactionDate?: string;
  orderId?: string;
  orderLineItemIds: readonly string[];
}>;
export type EbayFinancesEvidencePage = Readonly<{
  pageNumber: number;
  requestUrl: string;
  body: Uint8Array;
  requestId: string | null;
  transactions: readonly EbayFinancialTransactionReference[];
}>;

function validDate(value: Date) {
  return value instanceof Date && Number.isFinite(value.getTime());
}
function requiredString(value: unknown) {
  if (typeof value !== "string" || !value || value !== value.trim())
    throw new EbayConnectorError("MALFORMED_RESPONSE");
  return value;
}
function optionalString(value: unknown) {
  return value === undefined || value === null ? undefined : requiredString(value);
}
function validateQuery(query: EbayFinancesQuery) {
  if (!validDate(query.transactionDateFrom) || !validDate(query.transactionDateTo) ||
      query.transactionDateFrom >= query.transactionDateTo || query.pageSize !== undefined &&
      (!Number.isSafeInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > 200) ||
      query.maxPages !== undefined && (!Number.isSafeInteger(query.maxPages) || query.maxPages < 1 ||
        query.maxPages > 10_000)) throw new EbayConnectorError("MALFORMED_RESPONSE");
}

export async function assertEbayFinancesBoundary(db: PrismaClient, tenant: VerifiedCoreTenant,
marketplaceId: string, expectedAuthorizationVersion?: string) {
  const boundary = await assertEbayOrdersBoundary(db, tenant, marketplaceId, expectedAuthorizationVersion);
  const authorization = await db.ebaySellerAuthorization.findUnique({
    where: { channelConnectionId: tenant.channelConnectionId } });
  let scopes: unknown;
  try { scopes = authorization ? JSON.parse(authorization.grantedScopesJson) : null; } catch { scopes = null; }
  if (!Array.isArray(scopes) || !scopes.includes(FINANCES_SCOPE))
    throw new EbayConnectorError("AUTHORIZATION");
  return boundary;
}

function parsePage(body: Uint8Array) {
  if (body.byteLength > MAX_RESPONSE_BYTES) throw new EbayConnectorError("MALFORMED_RESPONSE");
  let value: unknown;
  try { value = JSON.parse(decoder.decode(body)); } catch { throw new EbayConnectorError("MALFORMED_RESPONSE"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new EbayConnectorError("MALFORMED_RESPONSE");
  const root = value as Record<string, unknown>;
  if (!Array.isArray(root.transactions)) throw new EbayConnectorError("MALFORMED_RESPONSE");
  const transactions = root.transactions.map((entry): EbayFinancialTransactionReference => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      throw new EbayConnectorError("MALFORMED_RESPONSE");
    const source = entry as Record<string, unknown>;
    const lineItems = source.orderLineItems === undefined ? [] : source.orderLineItems;
    if (!Array.isArray(lineItems)) throw new EbayConnectorError("MALFORMED_RESPONSE");
    return { transactionId: requiredString(source.transactionId),
      transactionType: source.transactionType === undefined || source.transactionType === null ? null :
        requiredString(source.transactionType),
      transactionStatus: optionalString(source.transactionStatus),
      transactionDate: optionalString(source.transactionDate), orderId: optionalString(source.orderId),
      orderLineItemIds: lineItems.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item))
          throw new EbayConnectorError("MALFORMED_RESPONSE");
        return requiredString((item as Record<string, unknown>).lineItemId);
      }) };
  });
  if (new Set(transactions.map((entry) => entry.transactionId)).size !== transactions.length)
    throw new EbayConnectorError("MALFORMED_RESPONSE");
  if (root.next !== undefined && (typeof root.next !== "string" || !root.next.trim()))
    throw new EbayConnectorError("MALFORMED_RESPONSE");
  return { transactions, next: root.next as string | undefined };
}

function validateNext(next: string, priorUrl: URL, baseUrl: string) {
  let url: URL;
  try { url = new URL(next); } catch { throw new EbayConnectorError("MALFORMED_RESPONSE"); }
  const expected = new URL(baseUrl);
  const priorOffset = Number(priorUrl.searchParams.get("offset") ?? "0");
  const offset = Number(url.searchParams.get("offset"));
  if (url.origin !== expected.origin || url.pathname !== FINANCES_PATH || url.username || url.password || url.hash ||
      url.searchParams.get("limit") !== priorUrl.searchParams.get("limit") ||
      url.searchParams.get("filter") !== priorUrl.searchParams.get("filter") ||
      !Number.isSafeInteger(offset) || offset <= priorOffset)
    throw new EbayConnectorError("MALFORMED_RESPONSE");
  return url;
}

export async function* listEbayFinancesPages(input: {
  db: PrismaClient;
  tenant: VerifiedCoreTenant;
  marketplaceId: string;
  query: EbayFinancesQuery;
  config: EbayApplicationConfig;
  transport: EbayHttpTransport;
  credentialEncryptionProvider: CredentialEncryptionProvider;
  signingKeyProvider?: EbaySigningKeyProvider;
  expectedAuthorizationVersion: string;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}): AsyncGenerator<EbayFinancesEvidencePage> {
  validateQuery(input.query);
  if (!input.signingKeyProvider) throw new EbayConnectorError("SIGNING_REQUIRED");
  const boundary = await assertEbayFinancesBoundary(input.db, input.tenant, input.marketplaceId,
    input.expectedAuthorizationVersion);
  const token = await refreshEbaySellerAccessToken({ db: input.db, tenant: input.tenant,
    config: input.config, transport: input.transport,
    encryptionProvider: input.credentialEncryptionProvider });
  const pageSize = input.query.pageSize ?? 200;
  const maxPages = input.query.maxPages ?? 100;
  const baseUrl = ebayFinancesApiBaseUrl(input.config);
  const first = new URL(`${baseUrl}${FINANCES_PATH}`);
  first.searchParams.set("filter",
    `transactionDate:[${input.query.transactionDateFrom.toISOString()}..${input.query.transactionDateTo.toISOString()}]`);
  first.searchParams.set("limit", String(pageSize)); first.searchParams.set("offset", "0");
  let requestUrl = first;
  const seen = new Set<string>();
  for (let pageNumber = 1; ; pageNumber += 1) {
    if (pageNumber > maxPages) throw new EbayConnectorError("MALFORMED_RESPONSE");
    const state = requestUrl.toString();
    if (seen.has(state)) throw new EbayConnectorError("MALFORMED_RESPONSE");
    seen.add(state);
    await assertEbayFinancesBoundary(input.db, input.tenant, input.marketplaceId,
      input.expectedAuthorizationVersion);
    const response = await executeEbayApiRequest({ config: input.config, accessToken: token.accessToken,
      method: "GET", path: requestUrl.pathname, query: Object.fromEntries(requestUrl.searchParams),
      operation: "FINANCES", transport: input.transport, signingKeyProvider: input.signingKeyProvider,
      additionalHeaders: { "x-ebay-c-marketplace-id": boundary.externalMarketplaceId },
      now: input.now, sleep: input.sleep });
    const page = parsePage(response.body);
    await assertEbayFinancesBoundary(input.db, input.tenant, input.marketplaceId,
      input.expectedAuthorizationVersion);
    yield { pageNumber, requestUrl: state, body: response.body.slice(),
      requestId: extractSafeEbayRequestId(response.headers), transactions: page.transactions };
    if (!page.next) return;
    requestUrl = validateNext(page.next, requestUrl, baseUrl);
  }
}
