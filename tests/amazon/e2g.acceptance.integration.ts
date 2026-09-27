import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { persistAmazonSellerAuthorization } from "../../app/connectors/amazon/amazon-authorization.server";
import { ingestAmazonOrdersToD2A } from "../../app/connectors/amazon/amazon-orders-d2a.server";
import { synchronizeAmazonFinances, synchronizeTargetedAmazonFinances } from
  "../../app/connectors/amazon/amazon-finances-sync.server";
import { getEffectiveFinancialComponentsTx } from "../../app/core/effective-financial-components.server";
import { getCanonicalEconomicDatasetTx } from "../../app/core/canonical-economic-dataset.server";
import type { RawSourceEncryptionBoundary } from "../../app/connectors/amazon/amazon-orders-d1.server";
import type { RawSourceDecryptionBoundary } from "../../app/connectors/amazon/amazon-finances-d2b.server";
import type { AmazonApplicationConfig, AmazonHttpRequest, AmazonHttpResponse, AmazonHttpTransport } from
  "../../app/connectors/amazon/amazon-types";
import { testCredentialEncryptionProvider } from "./test-credential-encryption";

const migrations = readdirSync("prisma/migrations").filter((name) => /^\d{14}_/.test(name)).sort();
assert.equal(migrations.length, 26);
const migrate = (file: string) => { const sql = new DatabaseSync(file); sql.exec("PRAGMA foreign_keys=ON");
  for (const name of migrations) sql.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
  assert.deepEqual(sql.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((sql.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok"); return sql; };
const encoder = new TextEncoder();
const response = (body: unknown, status = 200): AmazonHttpResponse => ({ status, headers: {},
  body: encoder.encode(typeof body === "string" ? body : JSON.stringify(body)) });
class Transport implements AmazonHttpTransport { requests: AmazonHttpRequest[] = [];
  private handlers: Array<() => AmazonHttpResponse>; constructor(handlers: Array<() => AmazonHttpResponse>) { this.handlers = handlers; }
  async request(request: AmazonHttpRequest) { this.requests.push(request); const handler = this.handlers.shift();
    if (!handler) throw new Error("Unexpected HTTP request"); return handler(); } }
const config: AmazonApplicationConfig = { lwaClientId: "accept-client", lwaClientSecret: "accept-secret",
  userAgent: "MarginLab/E2G", timeoutMs: 1000, maxAttempts: 1 };
const lwa = () => response({ access_token: "fake-access", token_type: "bearer", expires_in: 3600 });
const MARKET_A = "APJ6JRA9NG5V4", MARKET_B = "A1F83G8C2ARO7P";
let clock = new Date("2026-10-01T12:00:00Z");
const orderBody = { orders: [{ orderId: "ORDER-1", createdTime: "2026-09-01T10:00:00Z",
  lastUpdatedTime: "2026-09-01T11:00:00Z", salesChannel: { channelName: "AMAZON", marketplaceId: MARKET_A },
  proceeds: { grandTotal: { amount: "100.00", currencyCode: "EUR" }, breakdowns: [] },
  fulfillment: { fulfillmentStatus: "SHIPPED", fulfilledBy: "AMAZON" }, orderItems: [{ orderItemId: "ITEM-1", quantityOrdered: 1,
    product: { asin: "ASIN-1", sellerSku: "SKU-1", title: "Accepted item",
      price: { unitPrice: { amount: "100.00", currencyCode: "EUR" } } },
    proceeds: { proceedsTotal: { amount: "100.00", currencyCode: "EUR" }, breakdowns: [] },
    fulfillment: { quantityFulfilled: 1, quantityUnfulfilled: 0 } }] }] };
const money = (amount: string) => `{"currencyAmount":${amount},"currencyCode":"EUR"}`;
const leaf = (type: string, amount: string) => `{"breakdownType":"${type}","breakdownAmount":${money(amount)},"breakdowns":[]}`;
const tx = (id: string, status: string, leaves: string[], type = "Shipment", total = "70.00", orderId: string | null = "ORDER-1") =>
  `{"transactionId":"${id}","transactionType":"${type}","transactionStatus":"${status}",` +
  `"postedDate":"2026-09-01T12:00:00Z","totalAmount":${money(total)},` +
  `"marketplaceDetails":{"marketplaceId":"${MARKET_A}"},` +
  `"relatedIdentifiers":${orderId === null ? "[]" : `[{"relatedIdentifierName":"ORDER_ID","relatedIdentifierValue":"${orderId}"}]`},` +
  `"items":[],"contexts":[],"breakdowns":[${leaves.join(",")}]}`;
const financePage = (rows: string[], token?: string) => `{"payload":{"transactions":[${rows.join(",")}]${token ? `,"nextToken":"${token}"` : ""}}}`;
const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-e2g-"));
const databasePath = path.join(directory, "acceptance.sqlite"); const sqlite = migrate(databasePath);
const db = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } } });
const rawKey = createHash("sha256").update("e2g-test-key").digest();
const rawEncryption: RawSourceEncryptionBoundary = { encryptChunk(plain) { const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", rawKey, nonce); const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]); } };
const rawDecryption: RawSourceDecryptionBoundary = { decryptChunk(encrypted) { const value = Buffer.from(encrypted);
  const decipher = createDecipheriv("aes-256-gcm", rawKey, value.subarray(0, 12)); decipher.setAuthTag(value.subarray(12, 28));
  return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]); } };
try {
  const account = await db.account.create({ data: {} });
  const connection = await db.channelConnection.create({ data: { accountId: account.id, channel: "AMAZON", externalAccountId: "seller-a" } });
  const tenant = { accountId: account.id, channelConnectionId: connection.id };
  await persistAmazonSellerAuthorization(db, tenant, { refreshToken: "fake-refresh", grantedAt: clock }, testCredentialEncryptionProvider);
  const marketA = await db.marketplace.create({ data: { ...tenant, externalMarketplaceId: MARKET_A, currencyCode: "EUR", countryCode: "IT" } });
  const marketB = await db.marketplace.create({ data: { ...tenant, externalMarketplaceId: MARKET_B, currencyCode: "GBP", countryCode: "GB" } });
  const orderMapping = await db.mappingVersion.create({ data: { platform: "AMAZON", sourceContract: "orders-v2026-01-01",
    sourceVersion: "2026-01-01", mapperSemanticVersion: "e2g-orders", formulaCompatibilityVersion: "d2a-v1",
    checksum: "e2g-orders", activatedAt: clock } });
  const financeMapping = await db.mappingVersion.create({ data: { platform: "AMAZON", sourceContract: "finances-v2024-06-19",
    sourceVersion: "2024-06-19", mapperSemanticVersion: "amazon-finances-v2024-06-19-e2c-v1",
    formulaCompatibilityVersion: "d2b-v1", checksum: "e2g-finances", activatedAt: clock } });
  const orderTransport = new Transport([lwa, () => response(orderBody)]);
  const orderResult = await ingestAmazonOrdersToD2A({ db, tenant, marketplaceId: marketA.id,
    operationKey: "e2g-orders", mappingVersionId: orderMapping.id,
    query: { kind: "LAST_UPDATED", after: new Date("2026-09-01T00:00:00Z"), before: new Date("2026-09-30T00:00:00Z") },
    config, transport: orderTransport, credentialEncryptionProvider: testCredentialEncryptionProvider,
    rawEncryption, leaseOwner: "orders-worker", now: clock, retry: { now: () => clock.getTime(), sleep: async () => undefined } });
  assert.deepEqual([orderResult.orderCount, orderResult.itemCount], [1, 1]);
  const order = await db.normalizedOrder.findFirstOrThrow({ where: { sourceOrderKey: "ORDER-1" } });
  assert.equal(order.marketplaceId, marketA.id); assert.equal(await db.normalizedOrderItem.count({ where: { orderId: order.id } }), 1);
  assert(await db.sourceObservation.count({ where: { sourceEntityType: "ORDER", sourceEntityId: "ORDER-1" } }));
  const orderReplay = await ingestAmazonOrdersToD2A({ db, tenant, marketplaceId: marketA.id,
    operationKey: "e2g-orders", mappingVersionId: orderMapping.id,
    query: { kind: "LAST_UPDATED", after: new Date("2026-09-01T00:00:00Z"), before: new Date("2026-09-30T00:00:00Z") },
    config, transport: new Transport([]), credentialEncryptionProvider: testCredentialEncryptionProvider,
    rawEncryption, leaseOwner: "orders-replay", now: clock, retry: { now: () => clock.getTime() } });
  assert.equal(orderReplay.replayed, true); assert.equal(await db.normalizedOrder.count(), 1);

  const boundary = (transport: Transport, leaseOwner: string) => ({ db, tenant, marketplaceId: marketA.id,
    mappingVersionId: financeMapping.id, config, transport, credentialEncryptionProvider: testCredentialEncryptionProvider,
    rawEncryption, rawDecryption, leaseOwner, clock: () => clock,
    retry: { now: () => clock.getTime(), sleep: async () => undefined, random: () => 0 } });
  const initial = tx("SALE-1", "RELEASED", [leaf("ProductCharge", "100.00"), leaf("MarketplaceFee", "-10.00"),
    leaf("FulfillmentFee", "-15.25"), leaf("Tax", "5.20")]);
  const deferred = tx("DEFER-1", "DEFERRED", [leaf("MarketplaceFee", "-2.00")], "Shipment", "-2.00", "ORDER-DEFER-MISSING");
  const firstTransport = new Transport([lwa, () => response(financePage([initial], "P2")),
    () => response(financePage([], "P3")), () => response(financePage([deferred]))]);
  const first = await synchronizeAmazonFinances({ ...boundary(firstTransport, "finance-1"),
    backfillStart: new Date("2026-09-01T00:00:00Z"), maxOperationAttempts: 1 });
  assert.deepEqual([first.pagesAcquired, first.transactionsObserved], [3, 2]);
  const saleScope = await db.financialAuthorityScope.findFirstOrThrow({ where: { economicEventKey: "amazon-finances:transaction:SALE-1" } });
  const firstEntries = await db.financialLedgerEntry.findMany({ where: { authorityScopeId: saleScope.id, state: "PRESENT" } });
  assert.deepEqual(firstEntries.map((row) => [row.projectionKind, row.amountAtoms, row.amountScale, row.currencyCode,
    row.sourceAmountText]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))), [
      ["FULFILLMENT_FEE", -1525n, 2, "EUR", "-15.25"], ["MARKETPLACE_COMMISSION", -10n, 0, "EUR", "-10.00"],
      ["PRODUCT_REVENUE", 100n, 0, "EUR", "100.00"], ["TAX_COMPONENT", 52n, 1, "EUR", "5.20"],
    ]);
  assert(firstEntries.every((row) => row.orderId === order.id));
  const initiallyEffective = await db.$transaction((prisma) => getEffectiveFinancialComponentsTx(prisma, tenant, {
    orderId: order.id, effectiveWindow: { start: new Date("2026-09-01T00:00:00Z"), end: new Date("2026-10-02T00:00:00Z") } }));
  assert.equal(initiallyEffective.status, "READY");
  const evidence = await db.financialAuthorityEvidence.findFirstOrThrow({ where: { authorityScopeId: saleScope.id },
    include: { FinancialAuthorityEvidenceSource_evidence: { include: { sliceEvidence: {
      include: { rawSourceRecord: { include: { chunks: true, references: true } }, normalizationRun: true, sourceObservation: true } } } } } });
  assert(evidence.FinancialAuthorityEvidenceSource_evidence.length > 0);
  for (const source of evidence.FinancialAuthorityEvidenceSource_evidence) {
    const chain = source.sliceEvidence; assert.equal(chain.normalizationRun.status, "SUCCEEDED");
    assert(chain.sourceObservation); assert(chain.rawSourceRecord.chunks.length); assert(chain.rawSourceRecord.references.length);
  }
  const checkpoint1 = await db.syncCheckpoint.findFirstOrThrow({ where: { stream: "amazon-finances-v2024-06-19" } });

  clock = new Date(clock.getTime() + 60 * 60 * 1000);
  const corrected = tx("SALE-1", "RELEASED", [leaf("ProductCharge", "100.00"), leaf("MarketplaceFee", "-12.00"), leaf("Tax", "5.20")]);
  const released = tx("DEFER-1", "RELEASED", [leaf("MarketplaceFee", "-2.00")]);
  const late = tx("LATE-1", "RELEASED", [leaf("Adjustment", "3.00")], "Adjustment", "3.00", "ORDER-1");
  const huge = tx("HUGE-1", "RELEASED", [leaf("ProductCharge", "12345678901234567890.123456789")]);
  const unknown = tx("UNKNOWN-1", "RELEASED", [leaf("FutureQuantumFee", "-7.00")]);
  const nonOrder = tx("NONORDER-1", "RELEASED", [leaf("Adjustment", "4.00")], "Adjustment", "4.00", null);
  const second = await synchronizeAmazonFinances({ ...boundary(new Transport([lwa,
    () => response(financePage([corrected, released, late, huge, unknown, nonOrder]))]), "finance-2"),
    backfillStart: new Date("2026-09-01T00:00:00Z"), maxOperationAttempts: 1 });
  assert.equal(second.windowsCompleted, 1);
  const commission = await db.financialLedgerEntry.findMany({ where: { authorityScopeId: saleScope.id,
    component: { sourceComponentKey: { contains: "MarketplaceFee" } } }, orderBy: { revision: "asc" } });
  assert.equal(commission.length, 2); assert.deepEqual(commission.map((row) => row.amountAtoms), [-10n, -12n]);
  assert.equal(commission[1].previousEntryId, commission[0].id);
  const fulfillment = await db.financialLedgerEntry.findMany({ where: { authorityScopeId: saleScope.id,
    projectionKind: "FULFILLMENT_FEE" }, include: { component: true }, orderBy: { revision: "asc" } });
  assert.deepEqual(fulfillment.map((row) => row.state), ["PRESENT", "WITHDRAWN"]);
  assert.equal((await db.financialComponentHead.findFirstOrThrow({ where: {
    authorityScopeId: saleScope.id, sourceComponentKey: fulfillment[0].component.sourceComponentKey } })).currentEntryId, fulfillment[1].id);
  const deferredScope = await db.financialAuthorityScope.findFirstOrThrow({ where: { economicEventKey: "amazon-finances:transaction:DEFER-1" } });
  assert.equal(await db.financialAuthorityEvidence.count({ where: { authorityScopeId: deferredScope.id } }), 2);
  assert.equal((await db.financialAuthorityDecision.findFirstOrThrow({ where: { authorityScopeId: deferredScope.id },
    orderBy: { revision: "desc" } })).selectedClass, "ACTUAL");
  assert(await db.financialAuthorityScope.findFirst({ where: { economicEventKey: "amazon-finances:transaction:LATE-1" } }));
  const hugeScope = await db.financialAuthorityScope.findFirstOrThrow({ where: { economicEventKey: "amazon-finances:transaction:HUGE-1" } });
  assert.equal(await db.financialLedgerEntry.count({ where: { authorityScopeId: hugeScope.id } }), 0);
  assert.equal((await db.financialAuthorityDecision.findFirstOrThrow({ where: { authorityScopeId: hugeScope.id } })).selectedClass, "BLOCKED");
  const hugeRaw = await db.rawSourceRecord.findFirstOrThrow({ where: { references: { some: { targetKey: "HUGE-1" } } }, include: { chunks: true } });
  const hugePlain = Buffer.concat(hugeRaw.chunks.sort((a, b) => a.chunkIndex - b.chunkIndex)
    .map((chunk) => Buffer.from(rawDecryption.decryptChunk(new Uint8Array(chunk.encryptedBytes), chunk.chunkIndex)))).toString();
  assert(hugePlain.includes("12345678901234567890.123456789"));
  const unknownScope = await db.financialAuthorityScope.findFirstOrThrow({ where: { economicEventKey: "amazon-finances:transaction:UNKNOWN-1" } });
  assert.equal((await db.financialAuthorityDecision.findFirstOrThrow({ where: { authorityScopeId: unknownScope.id } })).selectedClass, "BLOCKED");
  const nonOrderScope = await db.financialAuthorityScope.findFirstOrThrow({ where: { economicEventKey: "amazon-finances:transaction:NONORDER-1" } });
  assert.equal((await db.financialAuthorityDecision.findFirstOrThrow({ where: { authorityScopeId: nonOrderScope.id } })).selectedClass, "ACTUAL");
  assert.equal(await db.financialLedgerEntry.count({ where: { authorityScopeId: nonOrderScope.id, orderId: { not: null } } }), 0);
  assert.equal(await db.normalizedOrder.count(), 1, "Finances must not invent commerce rows");
  assert.equal((await db.syncCheckpoint.findFirstOrThrow({ where: { id: checkpoint1.id } })).id, checkpoint1.id);

  const broadBeforeTarget = await db.syncCheckpoint.findFirstOrThrow({ where: { id: checkpoint1.id } });
  await synchronizeTargetedAmazonFinances({ ...boundary(new Transport([lwa, () => response(financePage([corrected]))]), "targeted"),
    relatedIdentifier: { name: "ORDER_ID", value: "ORDER-1" }, maxOperationAttempts: 1 });
  const broadAfterTarget = await db.syncCheckpoint.findFirstOrThrow({ where: { id: checkpoint1.id } });
  assert.equal(broadAfterTarget.processedSliceId, broadBeforeTarget.processedSliceId);
  assert.equal(broadAfterTarget.windowWatermark?.getTime(), broadBeforeTarget.windowWatermark?.getTime());

  clock = new Date(clock.getTime() + 60 * 60 * 1000);
  const restartTransaction = tx("RESTART-1", "RELEASED", [leaf("Adjustment", "1.00")], "Adjustment", "1.00");
  const checkpointBeforeFailure = await db.syncCheckpoint.findFirstOrThrow({ where: { id: checkpoint1.id } });
  await assert.rejects(synchronizeAmazonFinances({ ...boundary(new Transport([lwa,
    () => response(financePage([corrected], "RESTART")), () => response({ errors: [{ code: "Internal" }] }, 500)]), "failed-window"),
    backfillStart: new Date("2026-09-01T00:00:00Z"), maxOperationAttempts: 1 }));
  const checkpointAfterFailure = await db.syncCheckpoint.findFirstOrThrow({ where: { id: checkpoint1.id } });
  assert.equal(checkpointAfterFailure.processedSliceId, checkpointBeforeFailure.processedSliceId);
  assert.equal(checkpointAfterFailure.windowWatermark?.getTime(), checkpointBeforeFailure.windowWatermark?.getTime());
  await synchronizeAmazonFinances({ ...boundary(new Transport([lwa,
    () => response(financePage([corrected], "RESTART")), () => response(financePage([restartTransaction]))]), "retry-window"),
    backfillStart: new Date("2026-09-01T00:00:00Z"), maxOperationAttempts: 1 });
  assert.equal(await db.financialAuthorityScope.count({ where: { economicEventKey: "amazon-finances:transaction:RESTART-1" } }), 1);
  const revenueHeads = await db.financialComponentHead.findMany({ where: { authorityScopeId: saleScope.id,
    FinancialLedgerEntry_component: { some: { projectionKind: "PRODUCT_REVENUE" } } }, include: { current: true } });
  assert.equal(revenueHeads.length, 1, "repeated page one must retain one component identity");
  assert.equal(revenueHeads[0].current?.state, "PRESENT");

  const effective = await db.$transaction((prisma) => getEffectiveFinancialComponentsTx(prisma, tenant, {
    orderId: order.id, effectiveWindow: { start: new Date("2026-09-01T00:00:00Z"),
      end: new Date("2026-10-02T00:00:00Z") } }));
  assert.equal(effective.status, "BLOCKED", "applicable blocked Amazon economics must fail closed");
  const policy = await db.currencyPolicyVersion.create({ data: { version: "e2g", checksum: "e2g", exponentSourceVersion: "iso",
    roundingMode: "HALF_EVEN", toleranceAtoms: 0n, toleranceScale: 0, residualPolicy: "REJECT", activatedAt: clock } });
  const d2d = await db.$transaction((prisma) => getCanonicalEconomicDatasetTx(prisma, { tenant,
    scope: { kind: "ORDER", orderId: order.id }, economicWindow: { startInclusive: new Date("2026-09-01T00:00:00Z"),
      endExclusive: new Date("2026-10-02T00:00:00Z") }, currencyPolicyVersionId: policy.id }));
  assert.equal(d2d.status, "BLOCKED");
  assert.equal(await db.costRecord.count(), 0); assert.equal(await db.inventoryEconomicEvent.count(), 0);
  assert.equal(await db.inventoryEconomicLot.count(), 0); assert.equal(await db.normalizedTaxEvidence.count(), 0);

  const secondAccount = await db.account.create({ data: {} });
  const secondConnection = await db.channelConnection.create({ data: { accountId: secondAccount.id, channel: "AMAZON", externalAccountId: "seller-b" } });
  const secondTenant = { accountId: secondAccount.id, channelConnectionId: secondConnection.id };
  const unownedMarket = await db.marketplace.create({ data: { ...secondTenant, externalMarketplaceId: "ATVPDKIKX0DER",
    currencyCode: "USD", countryCode: "US" } });
  await assert.rejects(synchronizeTargetedAmazonFinances({ ...boundary(new Transport([]), "cross-tenant"),
    tenant: secondTenant, relatedIdentifier: { name: "ORDER_ID", value: "ORDER-1" }, maxOperationAttempts: 1 }));
  await assert.rejects(synchronizeTargetedAmazonFinances({ ...boundary(new Transport([]), "cross-market"),
    marketplaceId: unownedMarket.id, relatedIdentifier: { name: "ORDER_ID", value: "ORDER-1" }, maxOperationAttempts: 1 }));
  assert.equal(await db.financialAuthorityScope.count({ where: { marketplaceId: marketB.id } }), 0);
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((sqlite.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  console.log("Amazon E2-G fresh database end-to-end acceptance: PASS");
} finally {
  await db.$disconnect(); sqlite.close();
  const secondPath = path.join(directory, "repro.sqlite"); const second = migrate(secondPath); second.close();
  rmSync(directory, { recursive: true, force: true });
}
