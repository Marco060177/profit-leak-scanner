import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { markAmazonAuthorizationReauthRequired, persistAmazonSellerAuthorization,
  revokeAmazonSellerAuthorization } from "../../app/connectors/amazon/amazon-authorization.server";
import { mapAmazonOrder } from "../../app/connectors/amazon/amazon-order-mapper.server";
import { listAmazonOrders } from "../../app/connectors/amazon/amazon-orders.server";
import { AmazonConnectorError, type AmazonApplicationConfig, type AmazonHttpRequest,
  type AmazonHttpResponse, type AmazonHttpTransport } from "../../app/connectors/amazon/amazon-types";
import { testCredentialEncryptionProvider } from "./test-credential-encryption";

const encoder = new TextEncoder();
const response = (status: number, value: unknown, headers: Record<string, string> = {}): AmazonHttpResponse =>
  ({ status, headers, body: encoder.encode(JSON.stringify(value)) });
class MockTransport implements AmazonHttpTransport {
  requests: AmazonHttpRequest[] = [];
  private handlers: Array<(request: AmazonHttpRequest) => AmazonHttpResponse | Promise<AmazonHttpResponse>>;
  constructor(handlers: Array<(request: AmazonHttpRequest) => AmazonHttpResponse | Promise<AmazonHttpResponse>>) {
    this.handlers = handlers;
  }
  async request(request: AmazonHttpRequest) {
    this.requests.push(request);
    const handler = this.handlers.shift();
    if (!handler) throw new Error("Unexpected request");
    return handler(request);
  }
}
const config: AmazonApplicationConfig = { lwaClientId: "client-canary", lwaClientSecret: "secret-canary",
  userAgent: "MarginLab/E1C", timeoutMs: 1000, maxAttempts: 2 };
const refresh = "refresh-canary";
const access = "access-canary";
const MARKET = "APJ6JRA9NG5V4";
const now = Date.UTC(2026, 8, 26, 12);
const retry = { now: () => now, sleep: async () => undefined, random: () => 0 };
const lwa = (request: AmazonHttpRequest) => {
  assert.equal(request.url, "https://api.amazon.com/auth/o2/token");
  return response(200, { access_token: access, token_type: "bearer", expires_in: 3600 });
};
const item = (id: string, overrides: Record<string, unknown> = {}) => ({ orderItemId: id, quantityOrdered: 2,
  product: { asin: "B000TEST", sellerSku: "SKU-1", title: "Widget", condition: { conditionType: "NEW", conditionSubtype: "NEW" },
    price: { unitPrice: { amount: "12.340", currencyCode: "EUR" } } },
  proceeds: { proceedsTotal: { amount: "24.68", currencyCode: "EUR" }, breakdowns: [
    { type: "ITEM", subtotal: { amount: "20.00", currencyCode: "EUR" } },
    { type: "TAX", subtotal: { amount: "4.68", currencyCode: "EUR" }, detailedBreakdowns: [
      { subtype: "ITEM", value: { amount: "4.68", currencyCode: "EUR" } }] },
  ] }, fulfillment: { quantityFulfilled: 1, quantityUnfulfilled: 1 }, ...overrides });
const order = (id: string, overrides: Record<string, unknown> = {}) => ({ orderId: id,
  orderAliases: [{ aliasId: `seller-${id}`, aliasType: "SELLER_ORDER_ID" }], createdTime: "2026-09-01T10:00:00Z",
  lastUpdatedTime: "2026-09-01T11:00:00Z", programs: ["PRIME"],
  associatedOrders: [{ orderId: "original-1", associationType: "REPLACEMENT_ORIGINAL_ID" }],
  salesChannel: { channelName: "AMAZON", marketplaceId: MARKET, marketplaceName: "Amazon.it" },
  proceeds: { grandTotal: { amount: "24.68", currencyCode: "EUR" }, breakdowns: [] },
  fulfillment: { fulfillmentStatus: "PARTIALLY_SHIPPED", fulfilledBy: "AMAZON",
    shipByWindow: { earliestDateTime: "2026-09-02T00:00:00Z", latestDateTime: "2026-09-03T00:00:00Z" } },
  orderItems: [item(`${id}-i1`), item(`${id}-i2`, { quantityOrdered: 0, fulfillment: { quantityFulfilled: 0, quantityUnfulfilled: 0 } })],
  ...overrides });
const page = (orders: unknown[], nextToken?: string) => ({ orders, ...(nextToken ? { pagination: { nextToken } } : {}) });
const expectKind = (kind: string) => (error: unknown) => error instanceof AmazonConnectorError && error.kind === kind;

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-amazon-e1c-"));
const databasePath = path.join(directory, "e1c.sqlite");
const sqlite = new DatabaseSync(databasePath); sqlite.exec("PRAGMA foreign_keys=ON");
for (const name of readdirSync("prisma/migrations").filter((name) => /^\d{14}_/.test(name)).sort())
  sqlite.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
const db = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } } });

try {
  const account = await db.account.create({ data: {} });
  const connection = await db.channelConnection.create({ data: { accountId: account.id, channel: "AMAZON", externalAccountId: "seller-e1c" } });
  const tenant = { accountId: account.id, channelConnectionId: connection.id };
  await persistAmazonSellerAuthorization(db, tenant, { refreshToken: refresh, grantedAt: new Date() }, testCredentialEncryptionProvider);
  const marketplace = await db.marketplace.create({ data: { ...tenant, externalMarketplaceId: MARKET, countryCode: "IT", currencyCode: "EUR" } });

  const sourceBody = page([order("ORDER-B")], "TOKEN-X");
  const transport = new MockTransport([lwa,
    (request) => { const url = new URL(request.url); assert.equal(url.pathname, "/orders/2026-01-01/orders");
      assert.equal(url.searchParams.get("lastUpdatedAfter"), "2026-09-01T00:00:00.000Z");
      assert.equal(url.searchParams.get("marketplaceIds"), MARKET); assert.equal(url.searchParams.get("paginationToken"), null);
      assert.equal(url.searchParams.get("includedData"), "PROCEEDS,FULFILLMENT,PROMOTION,TAX");
      assert.equal(request.headers["x-amz-access-token"], access); assert.equal(request.headers.authorization, undefined);
      return response(200, sourceBody, { "x-amzn-requestid": "request-1" }); },
    (request) => { const url = new URL(request.url); assert.equal(url.searchParams.get("paginationToken"), "TOKEN-X");
      assert.equal(url.searchParams.get("lastUpdatedAfter"), "2026-09-01T00:00:00.000Z"); return response(200, page([order("ORDER-A")])); },
  ]);
  const acquired = await listAmazonOrders({ db, tenant, marketplaceId: marketplace.id,
    query: { kind: "LAST_UPDATED", after: new Date("2026-09-01T00:00:00Z") }, config, transport,
    encryptionProvider: testCredentialEncryptionProvider, retry });
  assert.deepEqual(acquired.orders.map((x) => x.externalOrderId), ["ORDER-A", "ORDER-B"]);
  const mapped = acquired.orders[1];
  assert.equal(mapped.normalizedStatus, "PARTIALLY_SHIPPED"); assert.equal(mapped.fulfillmentChannel, "AMAZON");
  assert.equal(mapped.replacedOrderId, "original-1"); assert.equal(mapped.orderTotal?.amountAtoms, 2468n);
  assert.equal(mapped.currency, "EUR");
  assert.equal(mapped.items[0].unitPrice?.amountAtoms, 12340n); assert.equal(mapped.items[0].unitPrice?.amountScale, 3);
  assert.equal(mapped.items[0].proceedsBreakdowns[1].details[0].value.amountAtoms, 468n);
  assert.equal(acquired.evidencePages.length, 2); assert.deepEqual(acquired.evidencePages[0].body, encoder.encode(JSON.stringify(sourceBody)));
  assert.equal(JSON.stringify(acquired.evidencePages).includes(access), false);
  assert.equal(Object.keys(mapped).some((key) => /buyer|recipient|address|phone|email/i.test(key)), false);
  assert.equal(await db.rawSourceRecord.count(), 0); assert.equal(await db.sourceObservation.count(), 0);
  assert.equal(await db.normalizedOrder.count(), 0); assert.equal(await db.financialLedgerEntry.count(), 0);

  // Every documented status and fulfillment value is explicit; future values fail closed.
  for (const [source, normalized] of [["PENDING_AVAILABILITY", "PENDING"], ["PENDING", "PENDING"], ["UNSHIPPED", "UNSHIPPED"],
    ["PARTIALLY_SHIPPED", "PARTIALLY_SHIPPED"], ["SHIPPED", "SHIPPED"], ["CANCELLED", "CANCELLED"], ["UNFULFILLABLE", "UNFULFILLABLE"]])
    assert.equal(mapAmazonOrder(order(`S-${source}`, { fulfillment: { fulfillmentStatus: source, fulfilledBy: "MERCHANT" } }), MARKET).normalizedStatus, normalized);
  assert.throws(() => mapAmazonOrder(order("bad-status", { fulfillment: { fulfillmentStatus: "FUTURE", fulfilledBy: "AMAZON" } }), MARKET), expectKind("UNSUPPORTED_SOURCE_VALUE"));
  assert.throws(() => mapAmazonOrder(order("bad-fulfillment", { fulfillment: { fulfillmentStatus: "SHIPPED", fulfilledBy: "DRONE" } }), MARKET), expectKind("UNSUPPORTED_SOURCE_VALUE"));
  assert.throws(() => mapAmazonOrder(order("bad-market", { salesChannel: { channelName: "AMAZON", marketplaceId: "A1F83G8C2ARO7P" } }), MARKET), expectKind("SOURCE_CONFLICT"));
  for (const bad of [
    order("money", { proceeds: { grandTotal: { amount: "1e2", currencyCode: "EUR" } } }),
    order("currency", { proceeds: { grandTotal: { amount: "1.00", currencyCode: "eur" } } }),
    order("quantity", { orderItems: [item("i", { quantityOrdered: -1 })] }),
    { ...order("missing-id"), orderId: undefined }, { ...order("missing-item"), orderItems: [{ quantityOrdered: 1 }] },
    order("date", { createdTime: "yesterday" }),
  ]) assert.throws(() => mapAmazonOrder(bad, MARKET), expectKind("MALFORMED_RESPONSE"));

  const identicalItem = item("dup");
  assert.equal(mapAmazonOrder(order("items-identical", { orderItems: [identicalItem, structuredClone(identicalItem)] }), MARKET).items.length, 1);
  assert.throws(() => mapAmazonOrder(order("items-conflict", { orderItems: [identicalItem, item("dup", { quantityOrdered: 3 })] }), MARKET), expectKind("SOURCE_CONFLICT"));
  assert.throws(() => mapAmazonOrder(order("currency-conflict", { orderItems: [item("usd", {
    product: { price: { unitPrice: { amount: "1.00", currencyCode: "USD" } } } })] }), MARKET), expectKind("SOURCE_CONFLICT"));

  const acquire = async (handlers: Array<(r: AmazonHttpRequest) => AmazonHttpResponse>, query: Parameters<typeof listAmazonOrders>[0]["query"] =
    { kind: "CREATED", after: new Date("2026-09-01T00:00:00Z"), before: new Date("2026-09-02T00:00:00Z") }) =>
    listAmazonOrders({ db, tenant, marketplaceId: marketplace.id, query, config,
      transport: new MockTransport([lwa, ...handlers]), encryptionProvider: testCredentialEncryptionProvider, retry });
  assert.equal((await acquire([() => response(200, page([]))])).orders.length, 0);
  assert.equal((await acquire([() => response(200, page([order("same")], "duplicate-page")), () => response(200, page([order("same")]))],
    { kind: "CREATED", after: new Date("2026-09-01"), before: new Date("2026-09-02"), maxPages: 2 })).orders.length, 1);
  await assert.rejects(acquire([() => response(200, page([order("conflict")], "x")),
    () => response(200, page([order("conflict", { lastUpdatedTime: "2026-09-01T12:00:00Z" })]))]), expectKind("SOURCE_CONFLICT"));
  await assert.rejects(acquire([() => response(200, page([], "cycle")), () => response(200, page([], "cycle"))]), expectKind("SOURCE_CONFLICT"));
  await assert.rejects(acquire([() => response(200, page([], "more"))], { kind: "CREATED", after: new Date("2026-09-01"), maxPages: 1 }), expectKind("INVALID_QUERY"));
  await assert.rejects(acquire([() => ({ status: 200, headers: {}, body: encoder.encode("{") })]), expectKind("MALFORMED_RESPONSE"));
  await assert.rejects(acquire([() => response(200, { orders: [], pagination: { nextToken: 1 } })]), expectKind("MALFORMED_RESPONSE"));
  await assert.rejects(acquire([() => response(200, page([order("wrong", { salesChannel: { channelName: "AMAZON", marketplaceId: "A1F83G8C2ARO7P" } })]))]), expectKind("SOURCE_CONFLICT"));

  for (const query of [
    { kind: "CREATED" as const, after: new Date("invalid") },
    { kind: "CREATED" as const, after: new Date(now + 1) },
    { kind: "LAST_UPDATED" as const, after: new Date("2026-09-02"), before: new Date("2026-09-01") },
    { kind: "CREATED" as const, after: new Date("2026-09-01"), before: new Date(now - 60_000) },
    { kind: "CREATED" as const, after: new Date("2026-09-01"), maxResultsPerPage: 101 },
  ]) await assert.rejects(acquire([], query), expectKind("INVALID_QUERY"));

  const foreignAccount = await db.account.create({ data: {} });
  const foreignConnection = await db.channelConnection.create({ data: { accountId: foreignAccount.id, channel: "AMAZON", externalAccountId: "foreign" } });
  const foreignMarket = await db.marketplace.create({ data: { accountId: foreignAccount.id, channelConnectionId: foreignConnection.id, externalMarketplaceId: MARKET } });
  const noHttp = async (inputTenant = tenant, marketId = foreignMarket.id) => {
    const noCalls = new MockTransport([]);
    await assert.rejects(listAmazonOrders({ db, tenant: inputTenant, marketplaceId: marketId,
      query: { kind: "CREATED", after: new Date("2026-09-01") }, config, transport: noCalls,
      encryptionProvider: testCredentialEncryptionProvider, retry }), expectKind("AUTHORIZATION"));
    assert.equal(noCalls.requests.length, 0);
  };
  await noHttp(); await noHttp({ accountId: foreignAccount.id, channelConnectionId: connection.id }, marketplace.id);
  const shopify = await db.channelConnection.create({ data: { accountId: account.id, channel: "SHOPIFY", externalAccountId: "e1c.myshopify.com" } });
  await noHttp({ accountId: account.id, channelConnectionId: shopify.id }, marketplace.id);
  await markAmazonAuthorizationReauthRequired(db, tenant); await noHttp(tenant, marketplace.id);
  await persistAmazonSellerAuthorization(db, tenant, { refreshToken: refresh, grantedAt: new Date() }, testCredentialEncryptionProvider);
  await revokeAmazonSellerAuthorization(db, tenant); await noHttp(tenant, marketplace.id);
  await persistAmazonSellerAuthorization(db, tenant, { refreshToken: refresh, grantedAt: new Date() }, testCredentialEncryptionProvider);
  await db.channelConnection.update({ where: { id: connection.id }, data: { status: "INACTIVE" } }); await noHttp(tenant, marketplace.id);
  await db.channelConnection.update({ where: { id: connection.id }, data: { status: "ACTIVE" } });
  await db.account.update({ where: { id: account.id }, data: { status: "INACTIVE" } }); await noHttp(tenant, marketplace.id);
  await db.account.update({ where: { id: account.id }, data: { status: "ACTIVE" } });
  await db.marketplace.update({ where: { id: marketplace.id }, data: { status: "INACTIVE" } }); await noHttp(tenant, marketplace.id);

  console.log("Amazon E1-C integration: PASS");
} finally {
  await db.$disconnect(); sqlite.close(); rmSync(directory, { recursive: true, force: true });
}
