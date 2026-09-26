import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { persistAmazonSellerAuthorization, revokeAmazonSellerAuthorization } from "../../app/connectors/amazon/amazon-authorization.server";
import { ingestAmazonOrdersToD2A } from "../../app/connectors/amazon/amazon-orders-d2a.server";
import type { RawSourceEncryptionBoundary } from "../../app/connectors/amazon/amazon-orders-d1.server";
import type { AmazonApplicationConfig, AmazonHttpRequest, AmazonHttpResponse, AmazonHttpTransport } from "../../app/connectors/amazon/amazon-types";
import { testCredentialEncryptionProvider } from "./test-credential-encryption";

const encoder = new TextEncoder();
const response = (value: unknown, status = 200): AmazonHttpResponse => ({ status, headers: {}, body: encoder.encode(JSON.stringify(value)) });
class MockTransport implements AmazonHttpTransport {
  requests: AmazonHttpRequest[] = [];
  private handlers: Array<(request: AmazonHttpRequest) => AmazonHttpResponse>;
  constructor(handlers: Array<(request: AmazonHttpRequest) => AmazonHttpResponse>) { this.handlers = handlers; }
  async request(request: AmazonHttpRequest) { this.requests.push(request); const handler = this.handlers.shift();
    if (!handler) throw new Error("Unexpected HTTP request"); return handler(request); }
}
const config: AmazonApplicationConfig = { lwaClientId: "e1e-client", lwaClientSecret: "e1e-secret",
  userAgent: "MarginLab/E1E", timeoutMs: 1000, maxAttempts: 1 };
const refresh = "e1e-refresh"; const access = "e1e-access"; const MARKET = "APJ6JRA9NG5V4";
const now = new Date("2026-09-28T12:00:00Z");
const query = { kind: "LAST_UPDATED" as const, after: new Date("2026-09-01T00:00:00Z"), before: new Date("2026-09-28T11:00:00Z") };
const lwa = () => response({ access_token: access, token_type: "bearer", expires_in: 3600 });
const rawKey = createHash("sha256").update("e1e-test-raw-key").digest();
const rawEncryption: RawSourceEncryptionBoundary = { encryptChunk(plain) { const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", rawKey, nonce); const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]); } };
const item = (id: string, quantity = 1, amount = "0.10") => ({ orderItemId: id, quantityOrdered: quantity,
  product: { asin: `ASIN-${id}`, sellerSku: `SKU-${id}`, title: `Title ${id}`,
    price: { unitPrice: { amount, currencyCode: "EUR" } } },
  proceeds: { proceedsTotal: { amount, currencyCode: "EUR" }, breakdowns: [] },
  fulfillment: { quantityFulfilled: 0, quantityUnfulfilled: quantity } });
const order = (id: string, status = "UNSHIPPED", fulfilledBy = "MERCHANT", items = [item(`${id}-I`)], replacedOrderId?: string) => ({
  orderId: id, createdTime: "2026-09-01T10:00:00Z", lastUpdatedTime: status === "SHIPPED" ? "2026-09-02T12:00:00Z" : "2026-09-01T11:00:00Z",
  salesChannel: { channelName: "AMAZON", marketplaceId: MARKET },
  ...(replacedOrderId ? { associatedOrders: [{ orderId: replacedOrderId, associationType: "REPLACEMENT_ORIGINAL_ID" }] } : {}),
  proceeds: { grandTotal: { amount: items[0]?.product.price.unitPrice.amount ?? "0.00", currencyCode: "EUR" }, breakdowns: [] },
  fulfillment: { fulfillmentStatus: status, fulfilledBy }, orderItems: items,
});
const page = (orders: unknown[], nextToken?: string) => ({ orders, ...(nextToken ? { pagination: { nextToken } } : {}) });

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-amazon-e1e-"));
const databasePath = path.join(directory, "e1e.sqlite"); const sqlite = new DatabaseSync(databasePath); sqlite.exec("PRAGMA foreign_keys=ON");
for (const name of readdirSync("prisma/migrations").filter((name) => /^\d{14}_/.test(name)).sort())
  sqlite.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
const db = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } } });

try {
  const account = await db.account.create({ data: {} });
  const channel = await db.channelConnection.create({ data: { accountId: account.id, channel: "AMAZON", externalAccountId: "e1e-seller" } });
  const tenant = { accountId: account.id, channelConnectionId: channel.id };
  await persistAmazonSellerAuthorization(db, tenant, { refreshToken: refresh, grantedAt: now }, testCredentialEncryptionProvider);
  const market = await db.marketplace.create({ data: { ...tenant, externalMarketplaceId: MARKET, currencyCode: "EUR", countryCode: "IT" } });
  const mapping = await db.mappingVersion.create({ data: { platform: "AMAZON", sourceContract: "orders-v2026-01-01",
    sourceVersion: "2026-01-01", mapperSemanticVersion: "e1e", formulaCompatibilityVersion: "d2a-v1",
    checksum: "e1e-map", activatedAt: now } });
  const invoke = (key: string, handlers: Array<(request: AmazonHttpRequest) => AmazonHttpResponse>) => {
    const transport = new MockTransport([lwa, ...handlers]);
    return { transport, result: ingestAmazonOrdersToD2A({ db, tenant, marketplaceId: market.id, operationKey: key,
      mappingVersionId: mapping.id, query, config, transport, credentialEncryptionProvider: testCredentialEncryptionProvider,
      rawEncryption, leaseOwner: `lease-${key}`, now, retry: { now: () => now.getTime(), sleep: async () => undefined } }) };
  };

  const orderA = order("A", "PARTIALLY_SHIPPED", "MERCHANT", [item("A-1", 2, "0.10"), item("A-2", 1, "0.00")]);
  const orderB = order("B", "PENDING", "AMAZON"); const orderC = order("C", "CANCELLED", "MERCHANT");
  const orderD = order("D", "UNSHIPPED", "AMAZON", [item("D-1", 1, "-0.01")], "A");
  const pages = [page([orderA, orderB], "P1"), page([orderC, structuredClone(orderA)], "P2"), page([orderD])];
  const first = invoke("multi", pages.map((body) => () => response(body))); const applied = await first.result;
  assert.deepEqual({ orders: applied.orderCount, items: applied.itemCount }, { orders: 4, items: 5 });
  assert.equal(await db.normalizedOrder.count(), 4); assert.equal(await db.normalizedOrderItem.count(), 5);
  assert.equal(await db.normalizedOrderRevision.count(), 4); assert.equal(await db.normalizedOrderItemRevision.count(), 5);
  const normalizedA = await db.normalizedOrder.findUniqueOrThrow({ where: { channelConnectionId_marketplaceScopeKey_sourceSystem_sourceOrderKey: {
    channelConnectionId: channel.id, marketplaceScopeKey: market.id, sourceSystem: "AMAZON", sourceOrderKey: "A" } } });
  assert.equal((await db.normalizedOrderItem.findMany({ where: { orderId: normalizedA.id } })).length, 2);
  const revisionA = await db.normalizedOrderRevision.findFirstOrThrow({ where: { orderId: normalizedA.id }, include: {
    rawSourceRecord: true, normalizationRun: true, syncSliceEvidence: { include: { sourceObservation: true, slice: true } } } });
  assert.equal(revisionA.normalizedStatus, "PARTIALLY_SHIPPED"); assert.equal(revisionA.sourceStatus, "PARTIALLY_SHIPPED");
  assert.equal(revisionA.rawSourceRecord.sourceEntityType, "ORDER"); assert.equal(revisionA.rawSourceRecord.sourceEntityId, "A");
  assert.equal(revisionA.normalizationRun.status, "SUCCEEDED"); assert.equal(revisionA.syncSliceEvidence.sourceObservation?.runId, applied.runId);
  assert.equal(revisionA.syncSliceEvidence.slice.status, "SUCCEEDED"); assert.equal(revisionA.syncSliceEvidence.slice.stream, "orders");
  assert.equal(await db.rawSourceRecord.count({ where: { sourceEntityType: "ORDERS_SEARCH_PAGE" } }), 3);
  assert.equal(await db.replacementLink.count(), 0); // Relationship remains exact source evidence; D2C is intentionally dormant.

  const replayTransport = new MockTransport([]);
  const replay = await ingestAmazonOrdersToD2A({ db, tenant, marketplaceId: market.id, operationKey: "multi",
    mappingVersionId: mapping.id, query, config, transport: replayTransport, credentialEncryptionProvider: testCredentialEncryptionProvider,
    rawEncryption, leaseOwner: "replay", now, retry: { now: () => now.getTime() } });
  assert.equal(replay.replayed, true); assert.equal(replayTransport.requests.length, 0);
  assert.equal(await db.normalizedOrder.count(), 4); assert.equal(await db.normalizedOrderItem.count(), 5);

  const rawBeforeLaterRun = await db.rawSourceRecord.count();
  const laterIdentical = invoke("multi-later-identical", pages.map((body) => () => response(body))); await laterIdentical.result;
  assert.equal(await db.rawSourceRecord.count(), rawBeforeLaterRun);
  assert.equal(await db.normalizedOrder.count(), 4); assert.equal(await db.normalizedOrderItem.count(), 5);
  const observationsForA = await db.sourceObservation.findMany({ where: { sourceEntityType: "ORDER", sourceEntityId: "A" } });
  assert.equal(new Set(observationsForA.map((value) => value.runId)).size, 2);

  const update = invoke("update-a", [() => response(page([order("A", "SHIPPED", "MERCHANT", [item("A-1", 3, "0.10"), item("A-2", 1, "0.00")])]))]);
  await update.result;
  assert.equal(await db.normalizedOrder.count(), 4); assert.equal(await db.normalizedOrderItem.count(), 5);
  assert.equal(await db.normalizedOrderRevision.count({ where: { orderId: normalizedA.id } }), 3);
  const itemA1 = await db.normalizedOrderItem.findUniqueOrThrow({ where: { orderId_sourceItemKey: { orderId: normalizedA.id, sourceItemKey: "id:A-1" } } });
  const latestA1 = await db.normalizedOrderItemRevision.findFirstOrThrow({ where: { itemId: itemA1.id }, orderBy: { revision: "desc" } });
  assert.equal(latestA1.quantityAtoms, 3n); assert.equal(latestA1.quantityScale, 0);

  const beforeRollback = { orders: await db.normalizedOrder.count(), revisions: await db.normalizedOrderRevision.count(),
    items: await db.normalizedOrderItem.count(), itemRevisions: await db.normalizedOrderItemRevision.count(), checkpoints: await db.syncCheckpoint.count() };
  sqlite.exec("CREATE TRIGGER E1E_item_abort BEFORE INSERT ON NormalizedOrderItemRevision BEGIN SELECT RAISE(ABORT,'e1e item rollback'); END");
  await assert.rejects(invoke("rollback", [() => response(page([order("ROLLBACK", "UNSHIPPED", "MERCHANT", [item("RB-1"), item("RB-2")])]))]).result);
  sqlite.exec("DROP TRIGGER E1E_item_abort");
  assert.deepEqual({ orders: await db.normalizedOrder.count(), revisions: await db.normalizedOrderRevision.count(),
    items: await db.normalizedOrderItem.count(), itemRevisions: await db.normalizedOrderItemRevision.count(), checkpoints: await db.syncCheckpoint.count() }, beforeRollback);
  const failed = await db.syncSlice.findFirstOrThrow({ where: { status: "FAILED" }, orderBy: { createdAt: "desc" } });
  assert.equal(await db.syncCheckpoint.count({ where: { processedSliceId: failed.id } }), 0);

  const beforeCheckpointFailure = { orders: await db.normalizedOrder.count(), revisions: await db.normalizedOrderRevision.count(),
    items: await db.normalizedOrderItem.count(), itemRevisions: await db.normalizedOrderItemRevision.count() };
  sqlite.exec("CREATE TRIGGER E1E_checkpoint_abort BEFORE UPDATE ON SyncCheckpoint BEGIN SELECT RAISE(ABORT,'e1e checkpoint rollback'); END");
  await assert.rejects(invoke("checkpoint-failure", [() => response(page([order("CHECKPOINT")]))]).result);
  sqlite.exec("DROP TRIGGER E1E_checkpoint_abort");
  assert.deepEqual({ orders: await db.normalizedOrder.count(), revisions: await db.normalizedOrderRevision.count(),
    items: await db.normalizedOrderItem.count(), itemRevisions: await db.normalizedOrderItemRevision.count() }, beforeCheckpointFailure);

  const durable = JSON.stringify({ orders: await db.normalizedOrder.findMany(), refs: await db.sourceReference.findMany() });
  for (const secret of [refresh, access, config.lwaClientSecret, "buyerEmail", "deliveryAddress", "x-amz-access-token"])
    assert.equal(durable.includes(secret), false);
  await revokeAmazonSellerAuthorization(db, tenant, now); const rejected = invoke("revoked", []);
  await assert.rejects(rejected.result); assert.equal(rejected.transport.requests.length, 0);

  assert.equal(await db.financialLedgerEntry.count(), 0); assert.equal(await db.inventoryEconomicEvent.count(), 0);
  assert.equal(await db.costRecord.count(), 0); assert.equal(await db.normalizedTaxEvidence.count(), 0);
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((sqlite.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  console.log("Amazon E1-E D1/D2A atomic normalized commerce ingestion: PASS");
} finally {
  await db.$disconnect(); sqlite.close(); rmSync(directory, { recursive: true, force: true });
}
