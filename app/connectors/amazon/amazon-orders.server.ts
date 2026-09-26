import type { PrismaClient } from "@prisma/client";
import type { VerifiedCoreTenant } from "~/core/data-core-d2a.server";
import type { CredentialEncryptionProvider } from "~/services/credential-encryption.server";
import { resolveAmazonRefreshTokenForUse } from "./amazon-authorization.server";
import { mapAmazonOrder, semantic, type AmazonCanonicalOrder } from "./amazon-order-mapper.server";
import { amazonEndpointForRegion, amazonRegionForMarketplace, exchangeLwaAccessToken,
  parseAmazonJson, sendAmazonRequest, type AmazonRetryHooks } from "./amazon-sp-api-client.server";
import { AmazonConnectorError, type AmazonApplicationConfig, type AmazonHttpTransport } from "./amazon-types";

export type AmazonOrderQuery = Readonly<{
  kind: "LAST_UPDATED" | "CREATED";
  after: Date;
  before?: Date;
  maxResultsPerPage?: number;
  maxPages?: number;
}>;
export type AmazonOrderEvidencePage = Readonly<{ pageNumber: number; body: Uint8Array; requestId: string | null }>;
export type AmazonOrderAcquisition = Readonly<{
  orders: ReadonlyArray<AmazonCanonicalOrder>;
  evidencePages: ReadonlyArray<AmazonOrderEvidencePage>;
}>;

function validDate(value: Date) { return value instanceof Date && Number.isFinite(value.getTime()); }
function validateQuery(query: AmazonOrderQuery, now: number) {
  if (!validDate(query.after) || query.before && !validDate(query.before) || query.after.getTime() > now ||
      query.before && (query.before.getTime() < query.after.getTime() || query.before.getTime() > now - 120_000) ||
      query.maxResultsPerPage !== undefined && (!Number.isInteger(query.maxResultsPerPage) || query.maxResultsPerPage < 1 || query.maxResultsPerPage > 100) ||
      query.maxPages !== undefined && (!Number.isInteger(query.maxPages) || query.maxPages < 1 || query.maxPages > 10_000))
    throw new AmazonConnectorError("INVALID_QUERY");
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AmazonConnectorError("MALFORMED_RESPONSE");
  return value as Record<string, unknown>;
}
function parsePage(value: unknown) {
  const root = object(value);
  if (!Array.isArray(root.orders)) throw new AmazonConnectorError("MALFORMED_RESPONSE");
  let nextToken: string | undefined;
  if (root.pagination !== undefined) {
    const pagination = object(root.pagination);
    if (typeof pagination.nextToken !== "string" || !pagination.nextToken || pagination.nextToken !== pagination.nextToken.trim())
      throw new AmazonConnectorError("MALFORMED_RESPONSE");
    nextToken = pagination.nextToken;
  }
  return { orders: root.orders, nextToken };
}

export async function assertAmazonOrdersBoundary(db: PrismaClient, tenant: VerifiedCoreTenant, marketplaceId: string) {
  const [owner, authorization, epoch, marketplace] = await Promise.all([
    db.channelConnection.findUnique({ where: { id: tenant.channelConnectionId }, include: { account: true } }),
    db.amazonSellerAuthorization.findUnique({ where: { channelConnectionId: tenant.channelConnectionId } }),
    db.coreChannelAuthorization.findUnique({ where: { channelConnectionId: tenant.channelConnectionId } }),
    db.marketplace.findUnique({ where: { id: marketplaceId } }),
  ]);
  if (!owner || owner.accountId !== tenant.accountId || owner.channel !== "AMAZON" || owner.status !== "ACTIVE" ||
      owner.account.status !== "ACTIVE" || authorization?.accountId !== tenant.accountId || authorization.status !== "ACTIVE" ||
      epoch?.authorizationVersion !== authorization.authorizationVersion || !marketplace || marketplace.accountId !== tenant.accountId ||
      marketplace.channelConnectionId !== tenant.channelConnectionId || marketplace.status !== "ACTIVE")
    throw new AmazonConnectorError("AUTHORIZATION");
  amazonRegionForMarketplace(marketplace.externalMarketplaceId);
  return marketplace.externalMarketplaceId;
}

/** Acquires Orders v2026-01-01. Order items are embedded by this API version; no per-order N+1 calls are made. */
export async function listAmazonOrders(input: {
  db: PrismaClient;
  tenant: VerifiedCoreTenant;
  marketplaceId: string;
  query: AmazonOrderQuery;
  config: AmazonApplicationConfig;
  transport: AmazonHttpTransport;
  encryptionProvider: CredentialEncryptionProvider;
  retry?: AmazonRetryHooks;
}): Promise<AmazonOrderAcquisition> {
  const now = (input.retry?.now ?? Date.now)();
  validateQuery(input.query, now);
  const externalMarketplaceId = await assertAmazonOrdersBoundary(input.db, input.tenant, input.marketplaceId);
  let refreshToken: string;
  try { refreshToken = await resolveAmazonRefreshTokenForUse(input.db, input.tenant, input.encryptionProvider); }
  catch { throw new AmazonConnectorError("AUTHORIZATION"); }
  const token = await exchangeLwaAccessToken(refreshToken, input.config, input.transport, input.retry);
  const region = amazonRegionForMarketplace(externalMarketplaceId);
  const endpoint = amazonEndpointForRegion(region);
  const base = new URLSearchParams();
  base.set(input.query.kind === "CREATED" ? "createdAfter" : "lastUpdatedAfter", input.query.after.toISOString());
  if (input.query.before) base.set(input.query.kind === "CREATED" ? "createdBefore" : "lastUpdatedBefore", input.query.before.toISOString());
  base.set("marketplaceIds", externalMarketplaceId);
  base.set("includedData", "PROCEEDS,FULFILLMENT,PROMOTION,TAX");
  base.set("maxResultsPerPage", String(input.query.maxResultsPerPage ?? 100));

  const evidencePages: AmazonOrderEvidencePage[] = [];
  const seenTokens = new Set<string>();
  const orders = new Map<string, AmazonCanonicalOrder>();
  let nextToken: string | undefined;
  const maxPages = input.query.maxPages ?? 100;
  for (let pageNumber = 1; ; pageNumber += 1) {
    if (pageNumber > maxPages) throw new AmazonConnectorError("INVALID_QUERY");
    const params = new URLSearchParams(base);
    if (nextToken) params.set("paginationToken", nextToken);
    const response = await sendAmazonRequest(input.transport, { method: "GET",
      url: `${endpoint}/orders/2026-01-01/orders?${params}`, headers: {
        host: new URL(endpoint).host, "x-amz-access-token": token.accessToken,
        "x-amz-date": new Date((input.retry?.now ?? Date.now)()).toISOString().replace(/[:-]|\.\d{3}/g, ""),
        "user-agent": input.config.userAgent, accept: "application/json",
      }, timeoutMs: input.config.timeoutMs }, input.config, input.retry);
    evidencePages.push({ pageNumber, body: response.body.slice(), requestId: response.headers["x-amzn-requestid"] ?? null });
    const page = parsePage(parseAmazonJson(response));
    for (const source of page.orders) {
      const mapped = mapAmazonOrder(source, externalMarketplaceId);
      const prior = orders.get(mapped.externalOrderId);
      if (prior && semantic(prior) !== semantic(mapped)) throw new AmazonConnectorError("SOURCE_CONFLICT");
      orders.set(mapped.externalOrderId, mapped);
    }
    if (!page.nextToken) break;
    if (seenTokens.has(page.nextToken)) throw new AmazonConnectorError("SOURCE_CONFLICT");
    seenTokens.add(page.nextToken);
    nextToken = page.nextToken;
  }
  await assertAmazonOrdersBoundary(input.db, input.tenant, input.marketplaceId);
  return { orders: [...orders.values()].sort((a, b) => a.externalOrderId.localeCompare(b.externalOrderId)), evidencePages };
}
