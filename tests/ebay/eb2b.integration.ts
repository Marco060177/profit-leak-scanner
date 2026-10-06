import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { attachSourceObservationToSliceTx, claimSyncSlice, completeSyncSliceWithoutCheckpointTx,
  prepareSyncSlice, recordSourceObservationTx, storeRawSourceRecord } from "../../app/core/data-core-d1.server";
import { persistEbaySellerAuthorization } from "../../app/connectors/ebay/ebay-authorization.server";
import { mapEbayOrder } from "../../app/connectors/ebay/ebay-order-mapper.server";
import { ingestEbayOrdersToD1, type EbayRawSourceEncryptionBoundary }
  from "../../app/connectors/ebay/ebay-orders-d1.server";
import { normalizeEbayOrdersFromD1, type EbayRawSourceDecryptionBoundary }
  from "../../app/connectors/ebay/ebay-orders-d2a.server";
import { EBAY_REQUIRED_SCOPES, type EbayApplicationConfig, type EbayHttpRequest,
  type EbayHttpResponse, type EbayHttpTransport } from "../../app/connectors/ebay/ebay-types";
import { testEbayCredentialEncryptionProvider } from "./test-credential-encryption";

const encoder = new TextEncoder();
class MockTransport implements EbayHttpTransport {
  readonly requests: EbayHttpRequest[] = [];
  private readonly handlers: Array<(request: EbayHttpRequest) => EbayHttpResponse>;
  constructor(handlers: Array<(request: EbayHttpRequest) => EbayHttpResponse>) { this.handlers = handlers; }
  async request(request: EbayHttpRequest) {
    this.requests.push(request); const handler = this.handlers.shift();
    if (!handler) throw new Error("Unexpected real/unmocked request"); return handler(request);
  }
}
const json = (value: unknown): EbayHttpResponse =>
  ({ status: 200, headers: {}, body: encoder.encode(JSON.stringify(value)) });
const config: EbayApplicationConfig = { environment: "SANDBOX", clientId: "eb2b-client",
  clientSecret: "eb2b-secret", ruName: "eb2b-runame", timeoutMs: 1000,
  maxAttempts: 1, maxRetryAfterMs: 0 };
const now = new Date("2026-10-06T12:00:00Z");
const query = { createdAfter: new Date("2026-09-01T00:00:00Z"),
  createdBefore: new Date("2026-09-30T00:00:00Z") };
const oauth = () => json({ access_token: "eb2b-access-token", token_type: "bearer", expires_in: 7200 });
const money = (value: string, currency = "EUR") => ({ value, currency });
const item = (lineItemId: string, quantity: number, sku?: string) => ({ lineItemId,
  legacyItemId: `LEGACY-${lineItemId}`, ...(sku ? { sku } : {}), title: `Product ${lineItemId}`,
  quantity, lineItemFulfillmentStatus: "NOT_STARTED", lineItemCost: money("7.25"),
  total: money(quantity === 2 ? "14.50" : "7.25"), taxes: [{ amount: money("1.25") }] });
const order = (overrides: Record<string, unknown> = {}) => ({ orderId: "EBAY-ORDER-1",
  creationDate: "2026-09-02T10:00:00.000Z", lastModifiedDate: "2026-09-02T11:00:00.000Z",
  orderFulfillmentStatus: "NOT_STARTED", cancelStatus: { cancelState: "NONE_REQUESTED" },
  pricingSummary: { priceSubtotal: money("21.75"), deliveryCost: money("0.00"),
    tax: money("2.50"), total: money("24.25") },
  lineItems: [item("LINE-1", 2, "SKU-ONE"), item("LINE-2", 1)], ...overrides });

const parsed = mapEbayOrder(order());
assert.equal(parsed.externalOrderId, "EBAY-ORDER-1");
assert.equal(parsed.items.length, 2); assert.equal(parsed.items[0].externalOrderItemId, "LINE-1");
assert.equal(parsed.items[0].sku, "SKU-ONE"); assert.equal(parsed.items[1].sku, undefined);
assert.equal(parsed.items[0].quantity, 2); assert.equal(parsed.currency, "EUR");
assert.equal(parsed.monetaryValues[0].amountAtoms, 2175n);
assert.equal(mapEbayOrder(order({ orderFulfillmentStatus: "IN_PROGRESS" })).normalizedStatus, "PARTIALLY_SHIPPED");
assert.equal(mapEbayOrder(order({ orderFulfillmentStatus: "FULFILLED" })).normalizedStatus, "SHIPPED");
assert.equal(mapEbayOrder(order({ cancelStatus: { cancelState: "CANCELED" } })).normalizedStatus, "CANCELLED");
for (const invalid of [
  order({ orderId: "" }), order({ orderFulfillmentStatus: "NEW_UNKNOWN_STATUS" }),
  order({ lineItems: [item("DUP", 1), item("DUP", 1)] }),
  order({ lineItems: [{ ...item("Q", 1), quantity: 1.5 }] }),
  order({ pricingSummary: { total: money("7.2x") } }),
  order({ pricingSummary: { total: money("12345678901234567890.123456789") } }),
  order({ pricingSummary: { total: money("7.25", "USD") } }),
]) assert.throws(() => mapEbayOrder(invalid));

const rawKey = createHash("sha256").update("marginlab-eb2b-raw-test-key-only").digest();
const rawEncryption: EbayRawSourceEncryptionBoundary = { encryptChunk(plain) {
  const nonce = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", rawKey, nonce);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]);
} };
const rawDecryption: EbayRawSourceDecryptionBoundary = { decryptChunk(encrypted) {
  const bytes = Buffer.from(encrypted); const decipher = createDecipheriv("aes-256-gcm", rawKey, bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
} };

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-ebay-eb2b-"));
const databasePath = path.join(directory, "eb2b.sqlite");
const sqlite = new DatabaseSync(databasePath); sqlite.exec("PRAGMA foreign_keys=ON");
for (const name of readdirSync("prisma/migrations").filter((name) => /^\d{14}_/.test(name)).sort())
  sqlite.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
const db = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } } });

try {
  const account = await db.account.create({ data: {} });
  const otherAccount = await db.account.create({ data: {} });
  const channel = await db.channelConnection.create({ data: { accountId: account.id,
    channel: "EBAY", externalAccountId: "eb2b-seller" } });
  const otherChannel = await db.channelConnection.create({ data: { accountId: otherAccount.id,
    channel: "EBAY", externalAccountId: "eb2b-other" } });
  const shopify = await db.channelConnection.create({ data: { accountId: account.id,
    channel: "SHOPIFY", externalAccountId: "eb2b.myshopify.com" } });
  const tenant = { accountId: account.id, channelConnectionId: channel.id };
  await persistEbaySellerAuthorization(db, tenant, { refreshToken: "eb2b-refresh-token",
    grantedScopes: EBAY_REQUIRED_SCOPES, grantedAt: now,
    refreshTokenExpiresAt: new Date("2030-01-01T00:00:00Z") }, testEbayCredentialEncryptionProvider);
  const marketplace = await db.marketplace.create({ data: { ...tenant,
    externalMarketplaceId: "EBAY_IT", countryCode: "IT", currencyCode: "EUR" } });
  const mapping = await db.mappingVersion.create({ data: { platform: "EBAY",
    sourceContract: "sell-fulfillment-order-v1", sourceVersion: "sell-fulfillment-v1",
    mapperSemanticVersion: "eb2b-v1", formulaCompatibilityVersion: "d2a-v1",
    checksum: "eb2b-mapping", activatedAt: now } });
  const ingest = (key: string, orders: unknown[]) => ingestEbayOrdersToD1({ db, tenant,
    marketplaceId: marketplace.id, operationKey: `d1-${key}`, mappingVersionId: mapping.id, query,
    config, transport: new MockTransport([oauth, () => json({ orders })]),
    credentialEncryptionProvider: testEbayCredentialEncryptionProvider, rawEncryption,
    leaseOwner: `d1-lease-${key}`, now, clock: () => now.getTime(), sleep: async () => {} });
  const normalize = (key: string, sourceSliceId: string, overrides: Record<string, unknown> = {}) =>
    normalizeEbayOrdersFromD1({ db, tenant, marketplaceId: marketplace.id, sourceSliceId,
      operationKey: `d2a-${key}`, mappingVersionId: mapping.id, rawDecryption,
      leaseOwner: `d2a-lease-${key}`, now, ...overrides });

  const source = await ingest("initial", [order()]);
  const result = await normalize("initial", source.sliceId);
  assert.equal(result.orderCount, 1); assert.equal(result.itemCount, 2);
  const normalized = await db.normalizedOrder.findUniqueOrThrow({ where: {
    channelConnectionId_marketplaceScopeKey_sourceSystem_sourceOrderKey: {
      channelConnectionId: channel.id, marketplaceScopeKey: marketplace.id,
      sourceSystem: "EBAY", sourceOrderKey: "EBAY-ORDER-1" } },
  include: { revisions: true, items: { include: { revisions: true } } } });
  assert.equal(normalized.revisions[0].normalizedStatus, "UNSHIPPED");
  assert.equal(normalized.revisions[0].sourceStatus, "NOT_STARTED|NONE_REQUESTED");
  assert.equal(normalized.revisions[0].occurredAt?.toISOString(), "2026-09-02T10:00:00.000Z");
  assert.equal(normalized.revisions[0].postedAt?.toISOString(), "2026-09-02T11:00:00.000Z");
  assert.deepEqual(normalized.items.map((row) => row.sourceItemKey).sort(), ["id:LINE-1", "id:LINE-2"]);
  assert.deepEqual(normalized.items.map((row) => row.revisions[0].quantityAtoms).sort(), [1n, 2n]);
  const listings = await db.channelListing.findMany({ where: { channelConnectionId: channel.id },
    orderBy: { externalVariantOrListingId: "asc" } });
  assert.equal(JSON.parse(listings[0].metadataJson!).sku, "SKU-ONE");
  assert.equal(JSON.parse(listings[1].metadataJson!).sku, null);
  const provenance = await db.normalizedOrderRevision.findFirstOrThrow({ where: { orderId: normalized.id },
    include: { rawSourceRecord: true, normalizationRun: true, syncSliceEvidence: true } });
  assert.equal(provenance.rawSourceRecord.sourceSystem, "EBAY");
  assert.equal(provenance.rawSourceRecord.sourceEntityType, "ORDER");
  assert.equal(provenance.normalizationRun.parserVersion, "ebay-eb2b-v1");
  assert.equal(provenance.syncSliceEvidence.rawSourceRecordId, provenance.rawSourceRecordId);

  const sameSource = await ingest("same", [order()]);
  const same = await normalize("same", sameSource.sliceId);
  assert.equal(same.orderCount, 0); assert.equal(same.itemCount, 0);
  assert.equal(await db.normalizedOrderRevision.count({ where: { orderId: normalized.id } }), 1);
  assert.equal((await normalize("same", sameSource.sliceId)).replayed, true);

  const changedSource = await ingest("changed", [order({ orderFulfillmentStatus: "IN_PROGRESS",
    lineItems: [item("LINE-1", 3, "SKU-ONE"), item("LINE-2", 1)] })]);
  const changed = await normalize("changed", changedSource.sliceId);
  assert.equal(changed.orderCount, 1); assert.equal(changed.itemCount, 2);
  assert.equal(await db.normalizedOrderRevision.count({ where: { orderId: normalized.id } }), 2);
  const lineOne = await db.normalizedOrderItem.findUniqueOrThrow({ where: {
    orderId_sourceItemKey: { orderId: normalized.id, sourceItemKey: "id:LINE-1" } } });
  assert.equal((await db.normalizedOrderItemRevision.findFirstOrThrow({ where: { itemId: lineOne.id },
    orderBy: { revision: "desc" } })).quantityAtoms, 3n);

  const beforeMalformed = { orders: await db.normalizedOrderRevision.count(),
    items: await db.normalizedOrderItemRevision.count() };
  const malformedSource = await ingest("malformed", [order({ orderId: "VALID-BUT-PAGE-ROLLBACK" }),
    { orderId: "BROKEN", creationDate: "bad", orderFulfillmentStatus: "NOT_STARTED", lineItems: [] }]);
  await assert.rejects(normalize("malformed", malformedSource.sliceId));
  assert.deepEqual({ orders: await db.normalizedOrderRevision.count(),
    items: await db.normalizedOrderItemRevision.count() }, beforeMalformed);

  await assert.rejects(normalizeEbayOrdersFromD1({ db,
    tenant: { accountId: account.id, channelConnectionId: otherChannel.id }, marketplaceId: marketplace.id,
    sourceSliceId: source.sliceId, operationKey: "cross", mappingVersionId: mapping.id,
    rawDecryption, leaseOwner: "cross", now }));
  await assert.rejects(normalizeEbayOrdersFromD1({ db,
    tenant: { accountId: account.id, channelConnectionId: shopify.id }, marketplaceId: marketplace.id,
    sourceSliceId: source.sliceId, operationKey: "wrong-channel", mappingVersionId: mapping.id,
    rawDecryption, leaseOwner: "wrong-channel", now }));
  await assert.rejects(normalize("untrusted", "not-a-real-slice"));

  const authorization = await db.coreChannelAuthorization.findUniqueOrThrow({
    where: { channelConnectionId: channel.id } });
  const foreignRun = await db.syncRun.create({ data: { ...tenant, stream: "orders",
    authorizationVersion: authorization.authorizationVersion, mappingVersionId: mapping.id,
    status: "RUNNING", startedAt: now } });
  const foreignSlice = await db.syncSlice.create({ data: { ...tenant, runId: foreignRun.id,
    marketplaceId: marketplace.id, marketplaceScopeKey: marketplace.id, stream: "orders",
    sliceKey: "non-ebay-evidence-source-slice", authorizationVersion: authorization.authorizationVersion } });
  assert.equal(await claimSyncSlice(db, { ...tenant, sliceId: foreignSlice.id,
    authorizationVersion: authorization.authorizationVersion, leaseOwner: "foreign-source",
    now, leaseMs: 300_000 }), true);
  const foreignRaw = await storeRawSourceRecord(db, { ...tenant, sourceSystem: "AMAZON",
    sourceVersion: "foreign", sourceEntityType: "ORDER", sourceEntityId: "FOREIGN-ORDER",
    schemaVersion: "foreign", retentionClass: "COMMERCE_SOURCE", capturedAt: now,
    ingestionRunId: foreignRun.id, payload: encoder.encode('{"orderId":"FOREIGN-ORDER"}'),
    encryptChunk: rawEncryption.encryptChunk });
  const foreignNormalization = await db.normalizationRun.create({ data: { ...tenant,
    rawSourceRecordId: foreignRaw.id, mappingVersionId: mapping.id, parserVersion: "foreign",
    normalizationRevision: 1, status: "SUCCEEDED", finishedAt: now } });
  await db.$transaction(async (tx) => {
    const observation = await recordSourceObservationTx(tx, { ...tenant, runId: foreignRun.id,
      sliceId: foreignSlice.id, rawSourceRecordId: foreignRaw.id, sourceSystem: "AMAZON",
      sourceEntityType: "ORDER", sourceEntityId: "FOREIGN-ORDER", observedAt: now,
      authorizationVersion: authorization.authorizationVersion });
    await attachSourceObservationToSliceTx(tx, { ...tenant, sliceId: foreignSlice.id,
      sourceObservationId: observation.id, normalizationRunId: foreignNormalization.id,
      leaseOwner: "foreign-source", now });
  });
  await prepareSyncSlice(db, { ...tenant, sliceId: foreignSlice.id, leaseOwner: "foreign-source",
    authorizationVersion: authorization.authorizationVersion, now });
  await db.$transaction(async (tx) => {
    await completeSyncSliceWithoutCheckpointTx(tx, { ...tenant, sliceId: foreignSlice.id,
      leaseOwner: "foreign-source", authorizationVersion: authorization.authorizationVersion,
      mappingVersionId: mapping.id, now });
    await tx.syncRun.update({ where: { id: foreignRun.id }, data: { status: "SUCCEEDED", finishedAt: now } });
  });
  await assert.rejects(normalize("non-ebay", foreignSlice.id));

  assert.equal(await db.financialLedgerEntry.count(), 0);
  assert.equal(await db.inventoryEconomicEvent.count(), 0);
  assert.equal(await db.financialAuthorityDecision.count(), 0);
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((sqlite.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  console.log("eBay EB2-B trusted D1 evidence to D2A normalized commerce: PASS");
} finally {
  await db.$disconnect(); sqlite.close(); rmSync(directory, { recursive: true, force: true });
}
