import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { markAmazonAuthorizationReauthRequired, persistAmazonSellerAuthorization,
  revokeAmazonSellerAuthorization } from "../../app/connectors/amazon/amazon-authorization.server";
import { AMAZON_FINANCES_RATE_LIMIT, listAmazonFinancialTransactions,
  type AmazonFinancesQuery } from "../../app/connectors/amazon/amazon-finances.server";
import { AmazonConnectorError, type AmazonApplicationConfig, type AmazonHttpRequest,
  type AmazonHttpResponse, type AmazonHttpTransport } from "../../app/connectors/amazon/amazon-types";
import { testCredentialEncryptionProvider } from "./test-credential-encryption";

const encoder = new TextEncoder();
const bytes = (body: string, status = 200, headers: Record<string, string> = {}): AmazonHttpResponse =>
  ({ status, headers, body: encoder.encode(body) });
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  bytes(JSON.stringify(value), status, headers);
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
  userAgent: "MarginLab/E2B", timeoutMs: 1000, maxAttempts: 3 };
const refresh = "refresh-canary";
const access = "access-canary";
const MARKET = "APJ6JRA9NG5V4";
const now = Date.UTC(2026, 8, 28, 12);
const retry = { now: () => now, sleep: async () => undefined, random: () => 0 };
const lwa = (request: AmazonHttpRequest) => {
  assert.equal(request.url, "https://api.amazon.com/auth/o2/token");
  return json({ access_token: access, token_type: "bearer", expires_in: 3600 });
};
const expectKind = (kind: string) => (error: unknown) => error instanceof AmazonConnectorError && error.kind === kind;
const transaction = (id: string, options: { status?: string; type?: string; amount?: string; currency?: string;
  related?: unknown[]; items?: string; breakdowns?: string } = {}) => `{"transactionId":${JSON.stringify(id)},` +
  `"transactionType":${JSON.stringify(options.type ?? "Shipment")},` +
  `"transactionStatus":${JSON.stringify(options.status ?? "RELEASED")},` +
  `"postedDate":"2026-09-01T10:00:00.123Z",` +
  `"totalAmount":{"currencyAmount":${options.amount ?? "12.34"},"currencyCode":${JSON.stringify(options.currency ?? "EUR")}},` +
  `"marketplaceDetails":{"marketplaceId":${JSON.stringify(MARKET)},"marketplaceName":"Amazon.it"},` +
  `"relatedIdentifiers":${JSON.stringify(options.related ?? [])},` +
  `"items":${options.items ?? "[]"},"contexts":[{"contextType":"FutureContext","future":9007199254740993}],` +
  `"breakdowns":${options.breakdowns ?? "[]"}}`;
const page = (transactions: string[], nextToken?: string) =>
  `{"payload":{"transactions":[${transactions.join(",")}]${nextToken === undefined ? "" : `,"nextToken":${JSON.stringify(nextToken)}`}}}`;
const item = (amount = "0.00", breakdowns = "[]") => `{"description":"item","relatedIdentifiers":` +
  `[{"itemRelatedIdentifierName":"TRANSACTION_ID","itemRelatedIdentifierValue":"item-1"}],` +
  `"totalAmount":{"currencyAmount":${amount},"currencyCode":"EUR"},` +
  `"contexts":[{"contextType":"ProductContext","sku":"SKU"}],"breakdowns":${breakdowns}}`;
const nested = (depth: number): string => depth === 0
  ? `[{"breakdownType":"Leaf","breakdownAmount":{"currencyAmount":-0.00000001,"currencyCode":"EUR"},"breakdowns":[]}]`
  : `[{"breakdownType":"Level-${depth}","breakdowns":${nested(depth - 1)}}]`;

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-amazon-e2b-"));
const databasePath = path.join(directory, "e2b.sqlite");
const sqlite = new DatabaseSync(databasePath); sqlite.exec("PRAGMA foreign_keys=ON");
for (const name of readdirSync("prisma/migrations").filter((name) => /^\d{14}_/.test(name)).sort())
  sqlite.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
const db = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } } });

try {
  const account = await db.account.create({ data: {} });
  const connection = await db.channelConnection.create({ data: { accountId: account.id, channel: "AMAZON", externalAccountId: "seller-e2b" } });
  const tenant = { accountId: account.id, channelConnectionId: connection.id };
  await persistAmazonSellerAuthorization(db, tenant, { refreshToken: refresh, grantedAt: new Date() }, testCredentialEncryptionProvider);
  const marketplace = await db.marketplace.create({ data: { ...tenant, externalMarketplaceId: MARKET,
    countryCode: "IT", currencyCode: "EUR" } });
  const defaultQuery: AmazonFinancesQuery = { postedAfter: new Date("2026-09-01T00:00:00Z"),
    postedBefore: new Date("2026-09-02T00:00:00Z") };
  const run = (handlers: Array<(r: AmazonHttpRequest) => AmazonHttpResponse | Promise<AmazonHttpResponse>>,
    query: AmazonFinancesQuery = defaultQuery, customConfig = config) => {
    const transport = new MockTransport([lwa, ...handlers]);
    return { transport, result: listAmazonFinancialTransactions({ db, tenant, marketplaceId: marketplace.id,
      query, config: customConfig, transport, encryptionProvider: testCredentialEncryptionProvider, retry }) };
  };

  // One/many transactions, exact endpoint/query/headers, byte evidence, and open semantic strings.
  const original = page([transaction("T-1", { type: "Future Transaction Type", amount: "0.00",
    related: [{ relatedIdentifierName: "ORDER_ID", relatedIdentifierValue: "ORDER-1" },
      { relatedIdentifierName: "FINANCIAL_EVENT_GROUP_ID", relatedIdentifierValue: "GROUP-1" }],
    items: `[${item("12345678901234567890.123456789", nested(2))}]`,
    breakdowns: `[{"breakdownType":"Future Breakdown","breakdownAmount":{"currencyAmount":-12.34,"currencyCode":"USD"},"breakdowns":[]}]` }),
    transaction("T-2", { amount: "0.1" })]);
  const first = run([(request) => {
    const url = new URL(request.url);
    assert.equal(request.method, "GET"); assert.equal(url.pathname, "/finances/2024-06-19/transactions");
    assert.equal(url.searchParams.get("postedAfter"), "2026-09-01T00:00:00.000Z");
    assert.equal(url.searchParams.get("postedBefore"), "2026-09-02T00:00:00.000Z");
    assert.equal(url.searchParams.get("marketplaceId"), MARKET); assert.equal(url.searchParams.get("nextToken"), null);
    assert.equal(request.headers["x-amz-access-token"], access); assert.equal(request.headers.authorization, undefined);
    return bytes(original, 200, { "x-amzn-requestid": "request-1" });
  }]);
  const acquired = await first.result;
  assert.equal(acquired.pages.length, 1); assert.equal(acquired.pages[0].transactions.length, 2);
  assert.deepEqual(acquired.pages[0].body, encoder.encode(original)); assert.notEqual(acquired.pages[0].body.buffer, encoder.encode(original).buffer);
  assert.equal(acquired.pages[0].requestId, "request-1"); assert.equal(acquired.pages[0].nextToken, null);
  const t = acquired.pages[0].transactions[0];
  assert.equal(t.transactionType, "Future Transaction Type"); assert.equal(t.totalAmount?.amount.sourceText, "0.00");
  assert.equal(t.items[0].totalAmount?.amount.sourceText, "12345678901234567890.123456789");
  assert.equal(t.items[0].breakdowns[0].breakdowns[0].breakdowns[0].breakdownAmount?.amount.sourceText, "-0.00000001");
  assert.equal(t.breakdowns[0].breakdownType, "Future Breakdown");
  assert.equal(t.breakdowns[0].breakdownAmount?.amount.sourceText, "-12.34");
  assert.deepEqual(t.relatedIdentifiers.map((x) => x.name), ["ORDER_ID", "FINANCIAL_EVENT_GROUP_ID"]);
  assert.equal(t.items[0].relatedIdentifiers[0].value, "item-1");

  // Adversarial decimals remain lexical, including zeros and values beyond Number safety.
  const decimals = ["0", "0.00", "12.34", "-12.34", "0.1", "9007199254740993.01",
    "12345678901234567890.123456789", "-0.00000001"];
  const decimalRun = run([() => bytes(page(decimals.map((amount, i) => transaction(`D-${i}`, { amount }))))]);
  assert.deepEqual((await decimalRun.result).pages[0].transactions.map((x) => x.totalAmount?.amount.sourceText), decimals);

  // Pagination preserves filters, continues through empty pages, and permits a final empty page.
  const paged = run([
    (request) => { assert.equal(new URL(request.url).searchParams.get("nextToken"), null); return bytes(page([transaction("P-1")], "token-a")); },
    (request) => { const u = new URL(request.url); assert.equal(u.searchParams.get("nextToken"), "token-a");
      assert.equal(u.searchParams.get("postedAfter"), "2026-09-01T00:00:00.000Z"); return bytes(page([], "token-b")); },
    (request) => { assert.equal(new URL(request.url).searchParams.get("nextToken"), "token-b"); return bytes(page([transaction("P-2")], "token-c")); },
    () => bytes(page([])),
  ]);
  const pagedResult = await paged.result;
  assert.deepEqual(pagedResult.pages.map((x) => x.transactions.length), [1, 0, 1, 0]);
  assert.deepEqual(pagedResult.pages.map((x) => x.pageIndex), [1, 2, 3, 4]);
  await assert.rejects(run([() => bytes(page([], "cycle")), () => bytes(page([], "cycle"))]).result, expectKind("SOURCE_CONFLICT"));
  await assert.rejects(run([() => bytes(page([], "more"))], { ...defaultQuery, maxPages: 1 }).result, expectKind("INVALID_QUERY"));
  for (const badToken of ["", " token", "token "])
    await assert.rejects(run([() => bytes(page([], badToken))]).result, expectKind("MALFORMED_RESPONSE"));

  // Statuses and absence of order identity are source facts, not economic decisions.
  for (const status of ["DEFERRED", "RELEASED", "DEFERRED_RELEASED", "FUTURE_STATUS"]) {
    const value = await run([() => bytes(page([transaction(status, { status })]))]).result;
    assert.equal(value.pages[0].transactions[0].transactionStatus, status);
    assert.equal(value.pages[0].transactions[0].relatedIdentifiers.length, 0);
  }

  // Targeted filters are paired, encoded, and can be used without a posted window.
  for (const name of ["ORDER_ID", "FINANCIAL_EVENT_GROUP_ID"] as const) {
    const targeted = run([(request) => { const url = new URL(request.url);
      assert.equal(url.searchParams.get("relatedIdentifierName"), name);
      assert.equal(url.searchParams.get("relatedIdentifierValue"), "value/with space");
      assert.equal(url.searchParams.get("postedAfter"), null); return bytes(page([])); }],
    { relatedIdentifier: { name, value: "value/with space" }, transactionStatus: "RELEASED",
      includeMarketplaceFilter: false });
    await targeted.result;
  }

  // Mixed currencies are retained independently; malformed currencies and source structures fail after one response.
  const mixed = await run([() => bytes(page([transaction("MIX", { currency: "EUR",
    breakdowns: `[{"breakdownType":"fee","breakdownAmount":{"currencyAmount":1.00,"currencyCode":"USD"}}]` })]))]).result;
  assert.equal(mixed.pages[0].transactions[0].totalAmount?.currencyCode, "EUR");
  assert.equal(mixed.pages[0].transactions[0].breakdowns[0].breakdownAmount?.currencyCode, "USD");
  for (const malformed of [
    page([transaction("bad-currency", { currency: "eur" })]),
    page([transaction("bad-date")]).replace("2026-09-01T10:00:00.123Z", "yesterday"),
    page([transaction("missing-id")]).replace('"transactionId":"missing-id",', ""),
    page([transaction("bad-money")]).replace('"currencyAmount":12.34', '"currencyAmount":"12.34"'),
    page([transaction("bad-breakdown", { breakdowns: '[{"breakdownType":"x","breakdownAmount":{"currencyAmount":NaN,"currencyCode":"EUR"}}]' })]),
    "{", '{"payload":{"transactions":[],"nextToken":"x","nextToken":"y"}}',
  ]) {
    const structural = run([() => bytes(malformed)]);
    await assert.rejects(structural.result, expectKind("MALFORMED_RESPONSE"));
    assert.equal(structural.transport.requests.length, 2);
  }
  await assert.rejects(run([() => bytes(page([transaction("deep", { breakdowns: nested(3) })]))],
    { ...defaultQuery, maxBreakdownDepth: 2 }).result, expectKind("MALFORMED_RESPONSE"));

  // Date combinations are rejected before token exchange/HTTP. Exactly 180 days is accepted; equality at two minutes is not.
  const beforeLimit = new Date(now - 2 * 60_000 - 1);
  const exactly180 = new Date(beforeLimit.getTime() - 180 * 24 * 60 * 60 * 1000);
  await run([() => bytes(page([]))], { postedAfter: exactly180, postedBefore: beforeLimit }).result;
  for (const query of [
    {} as AmazonFinancesQuery,
    { postedAfter: new Date("invalid") },
    { postedAfter: new Date("2026-09-02"), postedBefore: new Date("2026-09-01") },
    { postedAfter: new Date(beforeLimit.getTime() - 180 * 24 * 60 * 60 * 1000 - 1), postedBefore: beforeLimit },
    { postedAfter: new Date(now - 2 * 60_000) },
    { postedAfter: new Date("2026-09-01"), postedBefore: new Date(now - 2 * 60_000) },
    { postedBefore: new Date("2026-09-01"), relatedIdentifier: { name: "ORDER_ID" as const, value: "x" } },
    { relatedIdentifier: { name: "ORDER_ID" as const, value: " x" } },
    { postedAfter: new Date("2026-09-01"), transactionStatus: "FUTURE" as "RELEASED" },
  ]) {
    const invalid = run([], query);
    await assert.rejects(invalid.result, expectKind("INVALID_QUERY"));
    assert.equal(invalid.transport.requests.length, 0);
  }

  // Shared retries cover 429 Retry-After, 5xx, and retryable timeout; validation failures never retry.
  const waits: number[] = [];
  const retryHooks = { now: () => now, sleep: async (ms: number) => { waits.push(ms); }, random: () => 0 };
  const retryTransport = new MockTransport([lwa,
    () => json({}, 429, { "retry-after": "2" }), () => json({}, 503),
    () => { throw new AmazonConnectorError("TIMEOUT", { retryable: true }); }, () => bytes(page([transaction("RETRY")]))]);
  const retryResult = await listAmazonFinancialTransactions({ db, tenant, marketplaceId: marketplace.id,
    query: defaultQuery, config: { ...config, maxAttempts: 4 }, transport: retryTransport,
    encryptionProvider: testCredentialEncryptionProvider, retry: retryHooks });
  assert.equal(retryResult.pages[0].transactions[0].transactionId, "RETRY");
  assert.equal(waits[0], 2000); assert.equal(waits.length, 3);
  assert.deepEqual(AMAZON_FINANCES_RATE_LIMIT, { requestsPerSecond: 0.5, burst: 10 });

  // Authorization and ownership fail before any HTTP request.
  const noHttp = async (inputTenant = tenant, marketId = marketplace.id) => {
    const transport = new MockTransport([]);
    await assert.rejects(listAmazonFinancialTransactions({ db, tenant: inputTenant, marketplaceId: marketId,
      query: defaultQuery, config, transport, encryptionProvider: testCredentialEncryptionProvider, retry }),
    expectKind("AUTHORIZATION"));
    assert.equal(transport.requests.length, 0);
  };
  const foreignAccount = await db.account.create({ data: {} });
  const foreignConnection = await db.channelConnection.create({ data: { accountId: foreignAccount.id,
    channel: "AMAZON", externalAccountId: "foreign" } });
  const foreignMarket = await db.marketplace.create({ data: { accountId: foreignAccount.id,
    channelConnectionId: foreignConnection.id, externalMarketplaceId: MARKET } });
  await noHttp(tenant, foreignMarket.id);
  await noHttp({ accountId: foreignAccount.id, channelConnectionId: connection.id });
  const shopify = await db.channelConnection.create({ data: { accountId: account.id, channel: "SHOPIFY",
    externalAccountId: "e2b.myshopify.com" } });
  await noHttp({ accountId: account.id, channelConnectionId: shopify.id });
  await markAmazonAuthorizationReauthRequired(db, tenant); await noHttp();
  await persistAmazonSellerAuthorization(db, tenant, { refreshToken: refresh, grantedAt: new Date() }, testCredentialEncryptionProvider);
  await revokeAmazonSellerAuthorization(db, tenant); await noHttp();
  await persistAmazonSellerAuthorization(db, tenant, { refreshToken: refresh, grantedAt: new Date() }, testCredentialEncryptionProvider);

  // Safe upstream errors and returned values never expose credentials.
  const denied = run([() => bytes('{"secret":"ignored"}', 403, { "x-amzn-requestid": "safe-request" })]);
  await assert.rejects(denied.result, (error: unknown) => {
    assert(error instanceof AmazonConnectorError); assert.equal(error.kind, "AUTHORIZATION");
    const safe = JSON.stringify(error); assert.equal(safe.includes(refresh), false); assert.equal(safe.includes(access), false);
    assert.equal(safe.includes(config.lwaClientSecret), false); return true;
  });
  assert.equal(JSON.stringify(acquired).includes(access), false);
  assert.equal(JSON.stringify(acquired).includes(refresh), false);

  // E2-B is acquisition-only across every downstream Data Core.
  assert.equal(await db.rawSourceRecord.count(), 0); assert.equal(await db.sourceObservation.count(), 0);
  assert.equal(await db.syncSliceEvidence.count(), 0); assert.equal(await db.financialLedgerEntry.count(), 0);
  assert.equal(await db.financialAuthorityScope.count(), 0); assert.equal(await db.financialAuthorityEvidence.count(), 0);
  assert.equal(await db.financialAuthorityDecision.count(), 0); assert.equal(await db.costRecord.count(), 0);
  assert.equal(await db.inventoryEconomicEvent.count(), 0); assert.equal(await db.normalizedTaxEvidence.count(), 0);
  assert.equal(await db.currencyPolicyVersion.count(), 0);

  console.log("Amazon E2-B integration: PASS");
} finally {
  await db.$disconnect(); sqlite.close(); rmSync(directory, { recursive: true, force: true });
}
