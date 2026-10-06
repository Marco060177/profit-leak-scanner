import type { PrismaClient } from "@prisma/client";
import type { VerifiedCoreTenant } from "~/core/data-core-d2a.server";
import type { CredentialEncryptionProvider } from "~/services/credential-encryption.server";
import { refreshEbaySellerAccessToken, executeEbayApiRequest, extractSafeEbayRequestId }
  from "./ebay-api-client.server";
import type { EbaySigningKeyProvider } from "./ebay-http-signature.server";
import { EbayConnectorError, type EbayApplicationConfig, type EbayHttpTransport } from "./ebay-types";

const ORDERS_PATH = "/sell/fulfillment/v1/order";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const decoder = new TextDecoder("utf-8", { fatal: true });

export type EbayOrderQuery = Readonly<{
  createdAfter: Date;
  createdBefore: Date;
  pageSize?: number;
  maxPages?: number;
}>;
export type EbayOrderEvidencePage = Readonly<{
  pageNumber: number;
  requestUrl: string;
  body: Uint8Array;
  requestId: string | null;
  orderIds: readonly string[];
}>;

function validDate(value: Date) {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function validateQuery(query: EbayOrderQuery) {
  if (!validDate(query.createdAfter) || !validDate(query.createdBefore) ||
      query.createdAfter >= query.createdBefore || query.pageSize !== undefined &&
      (!Number.isSafeInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > 200) ||
      query.maxPages !== undefined && (!Number.isSafeInteger(query.maxPages) || query.maxPages < 1 || query.maxPages > 10_000))
    throw new EbayConnectorError("MALFORMED_RESPONSE");
}

export async function assertEbayOrdersBoundary(db: PrismaClient, tenant: VerifiedCoreTenant,
marketplaceId: string, expectedAuthorizationVersion?: string) {
  const [owner, authorization, epoch, marketplace] = await Promise.all([
    db.channelConnection.findUnique({ where: { id: tenant.channelConnectionId }, include: { account: true } }),
    db.ebaySellerAuthorization.findUnique({ where: { channelConnectionId: tenant.channelConnectionId } }),
    db.coreChannelAuthorization.findUnique({ where: { channelConnectionId: tenant.channelConnectionId } }),
    db.marketplace.findUnique({ where: { id: marketplaceId } }),
  ]);
  if (!owner || owner.accountId !== tenant.accountId || owner.channel !== "EBAY" || owner.status !== "ACTIVE" ||
      owner.account.status !== "ACTIVE" || authorization?.accountId !== tenant.accountId ||
      authorization.status !== "ACTIVE" || epoch?.accountId !== tenant.accountId ||
      epoch.authorizationVersion !== authorization.authorizationVersion ||
      expectedAuthorizationVersion !== undefined && epoch.authorizationVersion !== expectedAuthorizationVersion ||
      !marketplace || marketplace.accountId !== tenant.accountId ||
      marketplace.channelConnectionId !== tenant.channelConnectionId || marketplace.status !== "ACTIVE")
    throw new EbayConnectorError("AUTHORIZATION");
  return { externalMarketplaceId: marketplace.externalMarketplaceId,
    authorizationVersion: authorization.authorizationVersion };
}

function parsePage(body: Uint8Array) {
  if (body.byteLength > MAX_RESPONSE_BYTES) throw new EbayConnectorError("MALFORMED_RESPONSE");
  let value: unknown;
  try { value = JSON.parse(decoder.decode(body)); } catch { throw new EbayConnectorError("MALFORMED_RESPONSE"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new EbayConnectorError("MALFORMED_RESPONSE");
  const root = value as Record<string, unknown>;
  if (!Array.isArray(root.orders)) throw new EbayConnectorError("MALFORMED_RESPONSE");
  const orderIds: string[] = [];
  for (const order of root.orders) {
    if (!order || typeof order !== "object" || Array.isArray(order) ||
        typeof (order as Record<string, unknown>).orderId !== "string" ||
        !(order as Record<string, string>).orderId.trim()) throw new EbayConnectorError("MALFORMED_RESPONSE");
    orderIds.push((order as Record<string, string>).orderId);
  }
  if (root.next !== undefined && (typeof root.next !== "string" || !root.next.trim()))
    throw new EbayConnectorError("MALFORMED_RESPONSE");
  return { orderIds: [...new Set(orderIds)].sort(), next: root.next as string | undefined };
}

function validateNext(next: string, priorUrl: URL, baseUrl: string) {
  let url: URL;
  try { url = new URL(next); } catch { throw new EbayConnectorError("MALFORMED_RESPONSE"); }
  const expected = new URL(baseUrl);
  const priorOffset = Number(priorUrl.searchParams.get("offset") ?? "0");
  const offset = Number(url.searchParams.get("offset"));
  if (url.origin !== expected.origin || url.pathname !== ORDERS_PATH || url.username || url.password || url.hash ||
      url.searchParams.get("limit") !== priorUrl.searchParams.get("limit") || !Number.isSafeInteger(offset) ||
      offset <= priorOffset || url.searchParams.get("filter") !== priorUrl.searchParams.get("filter"))
    throw new EbayConnectorError("MALFORMED_RESPONSE");
  return url;
}

export async function* listEbayOrderPages(input: {
  db: PrismaClient;
  tenant: VerifiedCoreTenant;
  marketplaceId: string;
  query: EbayOrderQuery;
  config: EbayApplicationConfig;
  transport: EbayHttpTransport;
  credentialEncryptionProvider: CredentialEncryptionProvider;
  signingKeyProvider?: EbaySigningKeyProvider;
  expectedAuthorizationVersion: string;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}): AsyncGenerator<EbayOrderEvidencePage> {
  validateQuery(input.query);
  const boundary = await assertEbayOrdersBoundary(input.db, input.tenant, input.marketplaceId,
    input.expectedAuthorizationVersion);
  const token = await refreshEbaySellerAccessToken({ db: input.db, tenant: input.tenant,
    config: input.config, transport: input.transport, encryptionProvider: input.credentialEncryptionProvider });
  const pageSize = input.query.pageSize ?? 200;
  const maxPages = input.query.maxPages ?? 100;
  const first = new URL(`${input.config.environment === "SANDBOX" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com"}${ORDERS_PATH}`);
  first.searchParams.set("filter", `creationdate:[${input.query.createdAfter.toISOString()}..${input.query.createdBefore.toISOString()}]`);
  first.searchParams.set("limit", String(pageSize));
  first.searchParams.set("offset", "0");
  let requestUrl = first;
  const seen = new Set<string>();
  for (let pageNumber = 1; ; pageNumber += 1) {
    if (pageNumber > maxPages) throw new EbayConnectorError("MALFORMED_RESPONSE");
    const state = requestUrl.toString();
    if (seen.has(state)) throw new EbayConnectorError("MALFORMED_RESPONSE");
    seen.add(state);
    await assertEbayOrdersBoundary(input.db, input.tenant, input.marketplaceId,
      input.expectedAuthorizationVersion);
    const response = await executeEbayApiRequest({ config: input.config, accessToken: token.accessToken,
      method: "GET", path: requestUrl.pathname, query: Object.fromEntries(requestUrl.searchParams),
      operation: "STANDARD", transport: input.transport, signingKeyProvider: input.signingKeyProvider,
      additionalHeaders: { "x-ebay-c-marketplace-id": boundary.externalMarketplaceId },
      now: input.now, sleep: input.sleep });
    const page = parsePage(response.body);
    await assertEbayOrdersBoundary(input.db, input.tenant, input.marketplaceId,
      input.expectedAuthorizationVersion);
    yield { pageNumber, requestUrl: state, body: response.body.slice(),
      requestId: extractSafeEbayRequestId(response.headers), orderIds: page.orderIds };
    if (!page.next) return;
    requestUrl = validateNext(page.next, requestUrl,
      input.config.environment === "SANDBOX" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com");
  }
}
