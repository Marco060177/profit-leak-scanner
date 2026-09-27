import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { persistAmazonSellerAuthorization } from "../../app/connectors/amazon/amazon-authorization.server";
import { approveAmazonListingSkuMappingTx, getAmazonOrderProfitTx, multiplyExactCost,
  projectAmazonOrderProfit, recognizeAmazonOrderItemCogsTx, sumExactMoney } from
  "../../app/connectors/amazon/amazon-cogs-profit.server";
import { ingestAmazonOrdersToD2A } from "../../app/connectors/amazon/amazon-orders-d2a.server";
import { synchronizeAmazonFinances } from "../../app/connectors/amazon/amazon-finances-sync.server";
import { recordCostRecordRevisionTx } from "../../app/core/cost-record.server";
import { resolveMissingCostTx } from "../../app/core/inventory-economics.server";
import type { RawSourceEncryptionBoundary } from "../../app/connectors/amazon/amazon-orders-d1.server";
import type { RawSourceDecryptionBoundary } from "../../app/connectors/amazon/amazon-finances-d2b.server";
import type { AmazonApplicationConfig, AmazonHttpRequest, AmazonHttpResponse, AmazonHttpTransport } from
  "../../app/connectors/amazon/amazon-types";
import { testCredentialEncryptionProvider } from "./test-credential-encryption";

const migrations = readdirSync("prisma/migrations").filter((name) => /^\d{14}_/.test(name)).sort();
assert.equal(migrations.length, 30);
assert.ok(migrations.includes("20260930120000_partner_p3_billing_qualification"));
assert.ok(migrations.includes("20261001120000_partner_p4_reward_milestones"));
assert.ok(migrations.includes("20261002120000_partner_p5_1_authentication"));
assert.ok(migrations.includes("20261003120000_partner_p6_payout_ledger"));
const encoder = new TextEncoder();
const response = (body: unknown): AmazonHttpResponse => ({ status: 200, headers: {},
  body: encoder.encode(typeof body === "string" ? body : JSON.stringify(body)) });
class Transport implements AmazonHttpTransport { requests: AmazonHttpRequest[] = [];
  private handlers: Array<() => AmazonHttpResponse>;
  constructor(handlers: Array<() => AmazonHttpResponse>) { this.handlers = handlers; }
  async request(request: AmazonHttpRequest) { this.requests.push(request); const next = this.handlers.shift();
    if (!next) throw new Error("Unexpected HTTP request"); return next(); } }
const now = new Date("2026-10-03T12:00:00Z"), MARKET = "APJ6JRA9NG5V4";
const config: AmazonApplicationConfig = { lwaClientId: "f2-client", lwaClientSecret: "fake-secret",
  userAgent: "MarginLab/F2", timeoutMs: 1000, maxAttempts: 1 };
const lwa = () => response({ access_token: "fake-access", token_type: "bearer", expires_in: 3600 });
const key = createHash("sha256").update("f2-raw-key").digest();
const rawEncryption: RawSourceEncryptionBoundary = { encryptChunk(plain) { const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce); const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]); } };
const rawDecryption: RawSourceDecryptionBoundary = { decryptChunk(encrypted) { const value = Buffer.from(encrypted);
  const decipher = createDecipheriv("aes-256-gcm", key, value.subarray(0, 12)); decipher.setAuthTag(value.subarray(12, 28));
  return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]); } };
const order = (id: string, itemId: string, sku: string, quantity: number) => ({ orderId: id,
  createdTime: "2026-09-01T10:00:00Z", lastUpdatedTime: "2026-09-01T11:00:00Z",
  salesChannel: { channelName: "AMAZON", marketplaceId: MARKET },
  proceeds: { grandTotal: { amount: "100.00", currencyCode: "EUR" }, breakdowns: [] },
  fulfillment: { fulfillmentStatus: "SHIPPED", fulfilledBy: "AMAZON" }, orderItems: [{ orderItemId: itemId,
    quantityOrdered: quantity, product: { asin: `ASIN-${sku}`, sellerSku: sku, title: `Product ${sku}`,
      price: { unitPrice: { amount: "100.00", currencyCode: "EUR" } } },
    proceeds: { proceedsTotal: { amount: "100.00", currencyCode: "EUR" }, breakdowns: [] },
    fulfillment: { quantityFulfilled: quantity, quantityUnfulfilled: 0 } }] });
const money = (amount: string) => `{"currencyAmount":${amount},"currencyCode":"EUR"}`;
const leaf = (type: string, amount: string) => `{"breakdownType":"${type}","breakdownAmount":${money(amount)},"breakdowns":[]}`;
const financial = `{"transactionId":"F2-SALE","transactionType":"Shipment","transactionStatus":"RELEASED",` +
  `"postedDate":"2026-09-01T12:00:00Z","totalAmount":${money("82.00")},` +
  `"marketplaceDetails":{"marketplaceId":"${MARKET}"},` +
  `"relatedIdentifiers":[{"relatedIdentifierName":"ORDER_ID","relatedIdentifierValue":"ORDER-1"}],` +
  `"items":[],"contexts":[],"breakdowns":[${leaf("ProductCharge", "100.00")},` +
  `${leaf("MarketplaceFee", "-10.00")},${leaf("FulfillmentFee", "-8.00")}]}`;

assert.deepEqual(sumExactMoney([{ amountAtoms: 1n, amountScale: 1, currencyCode: "EUR" },
  { amountAtoms: 2n, amountScale: 1, currencyCode: "EUR" }], "EUR"),
  { amountAtoms: 3n, amountScale: 1, currencyCode: "EUR" });
assert.deepEqual(multiplyExactCost({ unitCostAtoms: 725n, unitCostScale: 2, quantityAtoms: 4n,
  quantityScale: 0, currencyCode: "EUR" }), { amountAtoms: 2900n, amountScale: 2, currencyCode: "EUR" });
await assert.rejects(async () => sumExactMoney([{ amountAtoms: 1n, amountScale: 0, currencyCode: "USD" }], "EUR"));

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-amazon-f2-"));
const databasePath = path.join(directory, "f2.sqlite"); const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA foreign_keys=ON"); for (const name of migrations)
  sqlite.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
const db = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } } });
try {
  const account = await db.account.create({ data: {} });
  const connection = await db.channelConnection.create({ data: { accountId: account.id, channel: "AMAZON", externalAccountId: "f2-seller" } });
  const tenant = { accountId: account.id, channelConnectionId: connection.id };
  await persistAmazonSellerAuthorization(db, tenant, { refreshToken: "fake-refresh", grantedAt: now }, testCredentialEncryptionProvider);
  const marketplace = await db.marketplace.create({ data: { ...tenant, externalMarketplaceId: MARKET, currencyCode: "EUR", countryCode: "IT" } });
  const ordersMapping = await db.mappingVersion.create({ data: { platform: "AMAZON", sourceContract: "orders-v2026-01-01",
    sourceVersion: "2026-01-01", mapperSemanticVersion: "f2-orders", formulaCompatibilityVersion: "d2a-v1", checksum: "f2-orders", activatedAt: now } });
  const financeMapping = await db.mappingVersion.create({ data: { platform: "AMAZON", sourceContract: "finances-v2024-06-19",
    sourceVersion: "2024-06-19", mapperSemanticVersion: "amazon-finances-v2024-06-19-e2c-v1",
    formulaCompatibilityVersion: "d2b-v1", checksum: "f2-finances", activatedAt: now } });
  await ingestAmazonOrdersToD2A({ db, tenant, marketplaceId: marketplace.id, operationKey: "f2-orders",
    mappingVersionId: ordersMapping.id, query: { kind: "LAST_UPDATED", after: new Date("2026-09-01T00:00:00Z"),
      before: new Date("2026-10-01T00:00:00Z") }, config,
    transport: new Transport([lwa, () => response({ orders: [order("ORDER-1", "ITEM-1", "SKU-1", 1),
      order("ORDER-2", "ITEM-2", "SKU-2", 4), order("ORDER-3", "ITEM-3", "SKU-3", 1)] })]),
    credentialEncryptionProvider: testCredentialEncryptionProvider, rawEncryption, leaseOwner: "orders",
    now, retry: { now: () => now.getTime(), sleep: async () => undefined } });
  const items = await db.normalizedOrderItem.findMany({ include: { order: true }, orderBy: { sourceItemKey: "asc" } });
  assert.equal(items.length, 3); assert(items.every((item) => item.sourceItemKey.startsWith("id:ITEM-")));
  assert.equal(await db.channelListing.count(), 3);
  const makeSku = async (sellerSku: string) => { const product = await db.product.create({ data: {
    accountId: account.id, title: sellerSku } }); return db.sku.create({ data: { accountId: account.id,
      sellerSku, productId: product.id } }); };
  const sku1 = await makeSku("SKU-1"), sku2 = await makeSku("SKU-2"), sku3 = await makeSku("SKU-3");
  const unmapped = await db.$transaction((tx) => recognizeAmazonOrderItemCogsTx(tx, tenant,
    { itemId: items[0].id, currencyCode: "EUR" }));
  assert.deepEqual(unmapped, { status: "BLOCKED", reasonCodes: ["MISSING_APPROVED_SKU_MAPPING"] });
  assert.equal(await db.inventoryEconomicLot.count(), 0);
  const mapped1 = await db.$transaction((tx) => approveAmazonListingSkuMappingTx(tx, tenant,
    { itemId: items[0].id, skuId: sku1.id, actorRef: "f2-acceptance" }));
  await db.$transaction((tx) => approveAmazonListingSkuMappingTx(tx, tenant,
    { itemId: items[1].id, skuId: sku2.id, actorRef: "f2-acceptance" }));
  await db.$transaction((tx) => approveAmazonListingSkuMappingTx(tx, tenant,
    { itemId: items[2].id, skuId: sku3.id, actorRef: "f2-acceptance" }));
  const replayMapping = await db.$transaction((tx) => approveAmazonListingSkuMappingTx(tx, tenant,
    { itemId: items[0].id, skuId: sku1.id, actorRef: "f2-acceptance" }));
  assert.equal(replayMapping.revision.id, mapped1.revision.id); assert.equal(await db.channelListing.count(), 3);
  const missingCostRecognition = await db.$transaction((tx) => recognizeAmazonOrderItemCogsTx(tx, tenant,
    { itemId: items[0].id, currencyCode: "EUR" }));
  assert.equal(missingCostRecognition.status, "BLOCKED");
  if (!("lot" in missingCostRecognition)) throw new Error("missing unknown-cost lot");
  assert.equal(missingCostRecognition.lot.costStatus, "UNKNOWN");
  const manualCost = (skuId: string, key: string, atoms: bigint, scale: number, from: Date) => db.$transaction((tx) =>
    recordCostRecordRevisionTx(tx, tenant, { skuId, sourceKind: "MANUAL", costKey: "base", operationKey: key,
      authorityTier: "MANUAL_OVERRIDE", effectiveFrom: from, unitCost: { amountAtoms: atoms, amountScale: scale,
        currencyCode: "EUR" }, evidenceKind: "MANUAL", manual: { actorRef: "f2-acceptance", manualReasonCode: "KNOWN_COST" } }));
  const cost1 = await manualCost(sku1.id, "cost-35", 35n, 0, new Date("2026-01-01T00:00:00Z"));
  const cost1Replay = await manualCost(sku1.id, "cost-35", 35n, 0, new Date("2026-01-01T00:00:00Z"));
  assert.equal(cost1Replay.revision.id, cost1.revision.id);
  await manualCost(sku2.id, "cost-725", 725n, 2, new Date("2026-01-01T00:00:00Z"));
  const historical = await manualCost(sku3.id, "cost-10", 10n, 0, new Date("2026-01-01T00:00:00Z"));
  await manualCost(sku3.id, "cost-12", 12n, 0, new Date("2026-09-02T00:00:00Z"));
  await synchronizeAmazonFinances({ db, tenant, marketplaceId: marketplace.id, mappingVersionId: financeMapping.id,
    config, transport: new Transport([lwa, () => response(`{"payload":{"transactions":[${financial}]}}`)]),
    credentialEncryptionProvider: testCredentialEncryptionProvider, rawEncryption, rawDecryption,
    leaseOwner: "finances", clock: () => now, retry: { now: () => now.getTime(), sleep: async () => undefined, random: () => 0 },
    backfillStart: new Date("2026-09-01T00:00:00Z"), maxOperationAttempts: 1 });
  const resolution = await db.$transaction((tx) => resolveMissingCostTx(tx, tenant, {
    lotId: missingCostRecognition.lot.id, operationKey: "resolve-cost-35", economicAt: now, currencyCode: "EUR" }));
  assert.equal(resolution.status, "RESOLVED"); if (resolution.status !== "RESOLVED") throw new Error("cost resolution failed");
  assert.equal(resolution.cost.revisionId, cost1.revision.id);
  const recognized2 = await db.$transaction((tx) => recognizeAmazonOrderItemCogsTx(tx, tenant,
    { itemId: items[1].id, currencyCode: "EUR" }));
  assert.equal(recognized2.status, "READY"); assert.deepEqual(multiplyExactCost(recognized2.lot as never),
    { amountAtoms: 2900n, amountScale: 2, currencyCode: "EUR" });
  const recognized3 = await db.$transaction((tx) => recognizeAmazonOrderItemCogsTx(tx, tenant,
    { itemId: items[2].id, currencyCode: "EUR" }));
  assert.equal(recognized3.status, "READY"); assert.equal(recognized3.lot.costRecordRevisionId, historical.revision.id);
  const replay = await db.$transaction((tx) => recognizeAmazonOrderItemCogsTx(tx, tenant,
    { itemId: items[0].id, currencyCode: "EUR" }));
  if (!("lot" in replay)) throw new Error("missing replay lot");
  assert.equal(replay.status, "READY");
  assert.equal(replay.lot.id, missingCostRecognition.lot.id);
  assert.equal(await db.inventoryEconomicEvent.count({ where: { lotId: replay.lot.id } }), 2);
  const policy = await db.currencyPolicyVersion.create({ data: { version: "f2", checksum: "f2", exponentSourceVersion: "iso",
    roundingMode: "HALF_EVEN", toleranceAtoms: 0n, toleranceScale: 0, residualPolicy: "REJECT", activatedAt: now } });
  const normalizedOrder1 = items[0].order;
  const result = await db.$transaction((tx) => getAmazonOrderProfitTx(tx, { tenant, orderId: normalizedOrder1.id,
    startInclusive: new Date("2026-09-01T00:00:00Z"), endExclusive: new Date("2026-10-01T00:00:00Z"),
    currencyPolicyVersionId: policy.id }));
  assert.equal(result.status, "READY"); if (result.status !== "READY") throw new Error("F2 expected READY");
  assert.deepEqual(result.revenue, { amountAtoms: 100n, amountScale: 0, currencyCode: "EUR" });
  assert.deepEqual(result.amazonFees, { amountAtoms: -18n, amountScale: 0, currencyCode: "EUR" });
  assert.deepEqual(result.cogs, { amountAtoms: 35n, amountScale: 0, currencyCode: "EUR" });
  assert.deepEqual(result.tax, { amountAtoms: 0n, amountScale: 0, currencyCode: "EUR" });
  assert.deepEqual(result.profit, { amountAtoms: 47n, amountScale: 0, currencyCode: "EUR" });
  for (const reasonCode of ["MIXED_CURRENCY_WITHOUT_FX", "UNRESOLVED_FINANCIAL_AUTHORITY",
    "UNKNOWN_UNREPRESENTABLE_FINANCIAL_ECONOMICS"]) {
    const blocked = projectAmazonOrderProfit({ status: "BLOCKED", requestedScope: { kind: "ORDER",
      orderId: normalizedOrder1.id }, reasonCodes: [reasonCode] } as never);
    assert.equal(blocked.status, "BLOCKED"); assert.deepEqual(blocked.reasonCodes, [reasonCode]);
  }
  assert.equal(await db.financialLedgerEntry.count({ where: { orderId: normalizedOrder1.id } }), 3);
  assert.equal((await db.inventoryEconomicLot.findFirstOrThrow({ where: { itemId: items[0].id } })).skuId, sku1.id);
  assert.equal(await db.costRecordRevision.count({ where: { id: cost1.revision.id, evidenceKind: "MANUAL",
    actorRef: "f2-acceptance" } }), 1);
  const missingSku = await makeSku("MISSING-COST");
  const listing = await db.channelListing.findFirstOrThrow({ where: {
    externalVariantOrListingId: "seller-sku:SKU-1|asin:ASIN-SKU-1" } });
  assert(listing.metadataJson?.includes("ASIN-SKU-1")); assert.equal(listing.externalProductId, "ASIN-SKU-1");
  assert.equal(await db.inventoryEconomicLot.count({ where: { itemId: "missing" } }), 0);
  assert(missingSku.id);
  await assert.rejects(db.$transaction((tx) => recognizeAmazonOrderItemCogsTx(tx, tenant,
    { itemId: "missing-item", currencyCode: "EUR" })));
  assert.throws(() => multiplyExactCost({ unitCostAtoms: 1n, unitCostScale: 12, quantityAtoms: 1n,
    quantityScale: 1, currencyCode: "EUR" }));
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((sqlite.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  console.log("Amazon F2 COGS and exact order profit integration: PASS");
} finally { await db.$disconnect(); sqlite.close(); rmSync(directory, { recursive: true, force: true }); }
