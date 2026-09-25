import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { addMoney, MAX_ATOMS, MIN_ATOMS, money, normalizeMoneyScale } from "../../app/core/fixed-money";
import { marketplaceScopeKey, selectFinancialAuthority, validateCoverageState } from "../../app/core/data-core-contracts";

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-d1-"));
const databasePath = path.join(directory, "d1.sqlite");
const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA foreign_keys = ON");
try {
  const migrations = path.join(process.cwd(), "prisma/migrations");
  for (const name of readdirSync(migrations).filter(name => /^\d{14}_/.test(name)).sort()) {
    sqlite.exec(readFileSync(path.join(migrations, name, "migration.sql"), "utf8"));
  }
  sqlite.close();
  process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;
  const [{ PrismaClient }, d1] = await Promise.all([
    import("@prisma/client"), import("../../app/core/data-core-d1.server"),
  ]);
  const db = new PrismaClient();
  try {
    const a = await db.account.create({ data: {} });
    const b = await db.account.create({ data: {} });
    const c1 = await db.channelConnection.create({ data: { accountId: a.id, channel: "SHOPIFY", externalAccountId: "one.myshopify.com" } });
    const c2 = await db.channelConnection.create({ data: { accountId: a.id, channel: "AMAZON", externalAccountId: "seller-two" } });
    await assert.rejects(db.marketplace.create({ data: { accountId: b.id, channelConnectionId: c1.id, externalMarketplaceId: "US" } }));
    const market = await db.marketplace.create({ data: { accountId: a.id, channelConnectionId: c1.id, externalMarketplaceId: "US" } });
    await assert.rejects(db.marketplace.create({ data: { accountId: a.id, channelConnectionId: c1.id, externalMarketplaceId: "US" } }));
    const product = await db.product.create({ data: { accountId: a.id, title: "Internal product" } });
    const sku1 = await db.sku.create({ data: { accountId: a.id, productId: product.id, sellerSku: "SAME" } });
    const sku2 = await db.sku.create({ data: { accountId: a.id, sellerSku: "SAME" } });
    assert.notEqual(sku1.id, sku2.id);
    await assert.rejects(db.sku.create({ data: { accountId: b.id, productId: product.id, sellerSku: "CROSS" } }));
    const listing = await db.channelListing.create({ data: { accountId: a.id, channelConnectionId: c1.id,
      marketplaceScopeKey: marketplaceScopeKey(null), sourceEntityType: "VARIANT", externalVariantOrListingId: "v1", skuId: sku1.id } });
    await assert.rejects(db.channelListing.create({ data: { accountId: a.id, channelConnectionId: c1.id,
      marketplaceScopeKey: marketplaceScopeKey(null), sourceEntityType: "VARIANT", externalVariantOrListingId: "v1" } }));
    await assert.rejects(db.channelListing.create({ data: { accountId: b.id, channelConnectionId: c1.id,
      marketplaceScopeKey: marketplaceScopeKey(null), sourceEntityType: "VARIANT", externalVariantOrListingId: "bad" } }));
    await assert.rejects(db.channelListing.create({ data: { accountId: a.id, channelConnectionId: c1.id,
      marketplaceId: market.id, marketplaceScopeKey: "@none", sourceEntityType: "VARIANT", externalVariantOrListingId: "bad" } }));
    const candidate = await db.productMappingCandidate.create({ data: { accountId: a.id, listingId: listing.id,
      candidateSkuId: sku2.id, ruleVersion: "manual-v1", confidence: 100 } });
    const decision = await db.productMappingDecision.create({ data: { accountId: a.id, candidateId: candidate.id,
      decision: "REJECT", actorRef: "test" } });
    await assert.rejects(db.productMappingDecision.update({ where: { id: decision.id }, data: { decision: "ACCEPT" } }));

    const mapping = await db.mappingVersion.create({ data: { platform: "SHOPIFY", sourceContract: "orders",
      sourceVersion: "1", mapperSemanticVersion: "1", formulaCompatibilityVersion: "legacy-v1", checksum: "abc" } });
    await d1.activateMappingVersion(db, mapping.id, "abc");
    await assert.rejects(db.mappingVersion.update({ where: { id: mapping.id }, data: { checksum: "changed" } }));
    await assert.rejects(db.mappingVersion.delete({ where: { id: mapping.id } }));
    await d1.deactivateMappingVersion(db, mapping.id);
    const policy = await db.currencyPolicyVersion.create({ data: { version: "v1", checksum: "p", exponentSourceVersion: "iso-1",
      roundingMode: "HALF_EVEN", toleranceAtoms: 1n, toleranceScale: 2, residualPolicy: "SEPARATE", activatedAt: new Date() } });
    await assert.rejects(db.currencyPolicyVersion.update({ where: { id: policy.id }, data: { roundingMode: "HALF_UP" } }));
    await assert.rejects(db.currencyPolicyVersion.delete({ where: { id: policy.id } }));

    const run = await db.syncRun.create({ data: { accountId: a.id, channelConnectionId: c1.id,
      stream: "orders", authorizationVersion: "auth-1", mappingVersionId: mapping.id } });
    await db.coreChannelAuthorization.create({ data: { accountId: a.id, channelConnectionId: c1.id, authorizationVersion: "auth-1" } });

    const payload = new TextEncoder().encode("fixture");
    const rawInput = { accountId: a.id, channelConnectionId: c1.id, sourceSystem: "SHOPIFY", sourceVersion: "1",
      sourceEntityType: "ORDER", sourceEntityId: "o1", schemaVersion: "1", retentionClass: "TEST",
      capturedAt: new Date("2026-01-01T00:00:00Z"), ingestionRunId: run.id, payload,
      encryptChunk: (plain: Uint8Array) => plain /* isolated fixture only */ };
    const raw = await d1.storeRawSourceRecord(db, rawInput);
    assert.equal((await d1.storeRawSourceRecord(db, rawInput)).id, raw.id);
    assert.equal(await db.rawSourceRecord.count(), 1);
    assert.deepEqual((await db.rawSourceBlobChunk.findMany({ where: { rawSourceRecordId: raw.id }, orderBy: { chunkIndex: "asc" } })).map(x => x.chunkIndex), [0]);
    const multi = await d1.storeRawSourceRecord(db, { ...rawInput, sourceEntityId: "o2", payload: new Uint8Array(d1.RAW_CHUNK_BYTES + 1) });
    assert.deepEqual((await db.rawSourceBlobChunk.findMany({ where: { rawSourceRecordId: multi.id }, orderBy: { chunkIndex: "asc" } })).map(x => x.chunkIndex), [0, 1]);
    await assert.rejects(db.rawSourceBlobChunk.create({ data: { accountId: a.id, channelConnectionId: c1.id,
      rawSourceRecordId: raw.id, chunkIndex: 0, encryptedBytes: new Uint8Array([1]) } }));
    await assert.rejects(db.rawSourceRecord.update({ where: { id: raw.id }, data: { sourceVersion: "2" } }));
    await assert.rejects(d1.storeRawSourceRecord(db, { ...rawInput, payload: new Uint8Array(d1.RAW_TOTAL_BYTES + 1) }));
    await db.sourceReference.create({ data: { accountId: a.id, channelConnectionId: c1.id,
      rawSourceRecordId: raw.id, sourceLeafPath: "$.items[0]", targetKind: "ORDER_ITEM", targetKey: "future:1" } });
    const normalization = await db.normalizationRun.create({ data: { accountId: a.id, channelConnectionId: c1.id,
      rawSourceRecordId: raw.id, mappingVersionId: mapping.id, parserVersion: "1", normalizationRevision: 1 } });
    await assert.rejects(db.normalizationRun.create({ data: { accountId: a.id, channelConnectionId: c1.id,
      rawSourceRecordId: raw.id, mappingVersionId: mapping.id, parserVersion: "1", normalizationRevision: 1 } }));

    const sliceKey = d1.deterministicSliceKey([c1.id, "@none", "orders", "2026-01"]);
    assert.equal(sliceKey, d1.deterministicSliceKey([c1.id, "@none", "orders", "2026-01"]));
    const slice = await db.syncSlice.create({ data: { accountId: a.id, channelConnectionId: c1.id, runId: run.id,
      marketplaceScopeKey: "@none", stream: "orders", sliceKey, authorizationVersion: "auth-1" } });
    await assert.rejects(db.syncSlice.create({ data: { accountId: a.id, channelConnectionId: c1.id, runId: run.id,
      marketplaceScopeKey: "@none", stream: "orders", sliceKey, authorizationVersion: "auth-1" } }));
    await assert.rejects(d1.completeSyncSlice(db, { sliceId: slice.id, accountId: a.id, channelConnectionId: c1.id,
      leaseOwner: "worker", authorizationVersion: "auth-1", mappingVersionId: mapping.id, now: new Date(), expectedProcessedSliceId: null }));
    assert.equal(await db.syncCheckpoint.count(), 0);
    const now = new Date();
    assert.equal(await d1.claimSyncSlice(db, { sliceId: slice.id, accountId: a.id, channelConnectionId: c1.id,
      authorizationVersion: "auth-1", leaseOwner: "worker", now, leaseMs: 60000 }), true);
    await assert.rejects(d1.completeSyncSlice(db, { sliceId: slice.id, accountId: a.id, channelConnectionId: c1.id,
      leaseOwner: "worker", authorizationVersion: "auth-1", mappingVersionId: mapping.id, now, expectedProcessedSliceId: null }));
    await assert.rejects(d1.releaseSyncSlice(db, { sliceId: slice.id, leaseOwner: "other" }));
    await assert.rejects(d1.completeSyncSlice(db, { sliceId: slice.id, accountId: a.id, channelConnectionId: c1.id,
      leaseOwner: "worker", authorizationVersion: "auth-wrong", mappingVersionId: mapping.id, now, expectedProcessedSliceId: null }));
    assert.equal(await db.syncCheckpoint.count(), 0);
    await db.syncSlice.update({ where: { id: slice.id }, data: { leaseExpiresAt: new Date(now.getTime() - 1000) } });
    assert.equal(await d1.claimSyncSlice(db, { sliceId: slice.id, accountId: a.id, channelConnectionId: c1.id,
      authorizationVersion: "auth-1", leaseOwner: "worker-2", now, leaseMs: 60000 }), true);
    await db.channelConnection.update({ where: { id: c1.id }, data: { status: "DISCONNECTED" } });
    await assert.rejects(d1.completeSyncSlice(db, { sliceId: slice.id, accountId: a.id, channelConnectionId: c1.id,
      leaseOwner: "worker-2", authorizationVersion: "auth-1", mappingVersionId: mapping.id, now, expectedProcessedSliceId: null }));
    await assert.rejects(d1.claimSyncSlice(db, { sliceId: slice.id, accountId: a.id, channelConnectionId: c1.id,
      authorizationVersion: "auth-1", leaseOwner: "worker-3", now, leaseMs: 60000 }));
    await db.channelConnection.update({ where: { id: c1.id }, data: { status: "ACTIVE" } });
    await db.coreChannelAuthorization.update({ where: { channelConnectionId: c1.id }, data: { authorizationVersion: "auth-2" } });
    await assert.rejects(d1.completeSyncSlice(db, { sliceId: slice.id, accountId: a.id, channelConnectionId: c1.id,
      leaseOwner: "worker-2", authorizationVersion: "auth-1", mappingVersionId: mapping.id, now, expectedProcessedSliceId: null }));
    await db.coreChannelAuthorization.update({ where: { channelConnectionId: c1.id }, data: { authorizationVersion: "auth-1" } });
    const otherRun = await db.syncRun.create({ data: { accountId: a.id, channelConnectionId: c1.id,
      stream: "orders", authorizationVersion: "auth-1", mappingVersionId: mapping.id } });
    const otherRunRaw = await d1.storeRawSourceRecord(db, { ...rawInput, sourceEntityId: "other-run",
      ingestionRunId: otherRun.id });
    const otherRunNormalization = await db.normalizationRun.create({ data: { accountId: a.id,
      channelConnectionId: c1.id, rawSourceRecordId: otherRunRaw.id, mappingVersionId: mapping.id,
      parserVersion: "1", normalizationRevision: 1, status: "SUCCEEDED" } });
    await assert.rejects(d1.attachRawEvidenceToSlice(db, { accountId: a.id, channelConnectionId: c1.id,
      sliceId: slice.id, rawSourceRecordId: otherRunRaw.id, normalizationRunId: otherRunNormalization.id,
      leaseOwner: "worker-2", now }));
    await assert.rejects(db.syncSliceEvidence.create({ data: { accountId: a.id, channelConnectionId: c1.id,
      sliceId: slice.id, runId: run.id, rawSourceRecordId: otherRunRaw.id,
      normalizationRunId: otherRunNormalization.id } }));
    const otherChannelRaw = await d1.storeRawSourceRecord(db, { ...rawInput, channelConnectionId: c2.id,
      sourceEntityId: "other-channel", ingestionRunId: undefined });
    await assert.rejects(d1.attachRawEvidenceToSlice(db, { accountId: a.id, channelConnectionId: c1.id,
      sliceId: slice.id, rawSourceRecordId: otherChannelRaw.id, normalizationRunId: normalization.id,
      leaseOwner: "worker-2", now }));
    const c3 = await db.channelConnection.create({ data: { accountId: b.id, channel: "SHOPIFY", externalAccountId: "other.myshopify.com" } });
    const otherAccountRaw = await d1.storeRawSourceRecord(db, { ...rawInput, accountId: b.id,
      channelConnectionId: c3.id, sourceEntityId: "other-account", ingestionRunId: undefined });
    await assert.rejects(d1.attachRawEvidenceToSlice(db, { accountId: a.id, channelConnectionId: c1.id,
      sliceId: slice.id, rawSourceRecordId: otherAccountRaw.id, normalizationRunId: normalization.id,
      leaseOwner: "worker-2", now }));
    const otherMapping = await db.mappingVersion.create({ data: { platform: "SHOPIFY", sourceContract: "orders",
      sourceVersion: "1", mapperSemanticVersion: "2", formulaCompatibilityVersion: "legacy-v1", checksum: "other" } });
    const wrongMappingNormalization = await db.normalizationRun.create({ data: { accountId: a.id,
      channelConnectionId: c1.id, rawSourceRecordId: raw.id, mappingVersionId: otherMapping.id,
      parserVersion: "1", normalizationRevision: 1, status: "SUCCEEDED" } });
    await assert.rejects(d1.attachRawEvidenceToSlice(db, { accountId: a.id, channelConnectionId: c1.id,
      sliceId: slice.id, rawSourceRecordId: raw.id, normalizationRunId: wrongMappingNormalization.id,
      leaseOwner: "worker-2", now }));
    const wrongRawNormalization = await db.normalizationRun.create({ data: { accountId: a.id,
      channelConnectionId: c1.id, rawSourceRecordId: multi.id, mappingVersionId: mapping.id,
      parserVersion: "1", normalizationRevision: 1, status: "SUCCEEDED" } });
    await assert.rejects(d1.attachRawEvidenceToSlice(db, { accountId: a.id, channelConnectionId: c1.id,
      sliceId: slice.id, rawSourceRecordId: raw.id, normalizationRunId: wrongRawNormalization.id,
      leaseOwner: "worker-2", now }));
    assert.equal(await db.syncCheckpoint.count(), 0);
    await d1.attachRawEvidenceToSlice(db, { accountId: a.id, channelConnectionId: c1.id,
      sliceId: slice.id, rawSourceRecordId: raw.id, normalizationRunId: normalization.id, leaseOwner: "worker-2", now });
    const evidence = await db.syncSliceEvidence.findFirstOrThrow({ where: { sliceId: slice.id } });
    assert.equal((await d1.attachRawEvidenceToSlice(db, { accountId: a.id, channelConnectionId: c1.id,
      sliceId: slice.id, rawSourceRecordId: raw.id, normalizationRunId: normalization.id,
      leaseOwner: "worker-2", now })).id, evidence.id);
    await assert.rejects(db.syncSliceEvidence.create({ data: { accountId: b.id, channelConnectionId: c1.id,
      sliceId: slice.id, runId: run.id, rawSourceRecordId: raw.id, normalizationRunId: normalization.id } }));
    await assert.rejects(db.syncSliceEvidence.create({ data: { accountId: a.id, channelConnectionId: c1.id,
      sliceId: slice.id, runId: otherRun.id, rawSourceRecordId: raw.id, normalizationRunId: normalization.id } }));
    const siblingSlice = await db.syncSlice.create({ data: { accountId: a.id, channelConnectionId: c1.id,
      runId: run.id, marketplaceScopeKey: "@none", stream: "orders", sliceKey: "sibling", authorizationVersion: "auth-1" } });
    assert.equal(await d1.claimSyncSlice(db, { sliceId: siblingSlice.id, accountId: a.id,
      channelConnectionId: c1.id, authorizationVersion: "auth-1", leaseOwner: "sibling-worker", now, leaseMs: 60000 }), true);
    const siblingEvidence = await d1.attachRawEvidenceToSlice(db, { accountId: a.id,
      channelConnectionId: c1.id, sliceId: siblingSlice.id, rawSourceRecordId: raw.id,
      normalizationRunId: normalization.id, leaseOwner: "sibling-worker", now });
    await assert.rejects(db.syncSliceEvidence.update({ where: { id: siblingEvidence.id }, data: { sliceId: slice.id } }));
    assert.equal(await db.syncCheckpoint.count(), 0);
    await assert.rejects(d1.prepareSyncSlice(db, { accountId: a.id, channelConnectionId: c1.id,
      sliceId: slice.id, leaseOwner: "worker-2", authorizationVersion: "auth-1", now }));
    await db.normalizationRun.updateMany({ where: { rawSourceRecordId: raw.id }, data: { status: "SUCCEEDED", finishedAt: now } });
    await d1.prepareSyncSlice(db, { accountId: a.id, channelConnectionId: c1.id,
      sliceId: slice.id, leaseOwner: "worker-2", authorizationVersion: "auth-1", now });
    await assert.rejects(db.syncSliceEvidence.delete({ where: { id: evidence.id } }));
    await assert.rejects(db.syncSliceEvidence.update({ where: { id: evidence.id }, data: { normalizationRunId: wrongMappingNormalization.id } }));
    await assert.rejects(db.syncSliceEvidence.create({ data: { accountId: a.id, channelConnectionId: c1.id,
      sliceId: slice.id, runId: run.id, rawSourceRecordId: multi.id,
      normalizationRunId: wrongRawNormalization.id } }));
    await assert.rejects(db.normalizationRun.update({ where: { id: normalization.id }, data: { status: "FAILED" } }));
    await assert.rejects(db.normalizationRun.delete({ where: { id: normalization.id } }));
    await assert.rejects(d1.completeSyncSlice(db, { sliceId: slice.id, accountId: a.id, channelConnectionId: c1.id,
      leaseOwner: "wrong-worker", authorizationVersion: "auth-1", mappingVersionId: mapping.id, now, expectedProcessedSliceId: null }));
    await assert.rejects(d1.completeSyncSlice(db, { sliceId: slice.id, accountId: a.id, channelConnectionId: c1.id,
      leaseOwner: "worker-2", authorizationVersion: "auth-1", mappingVersionId: mapping.id,
      now: new Date(now.getTime() + 61000), expectedProcessedSliceId: null }));
    await db.channelConnection.update({ where: { id: c1.id }, data: { status: "DISCONNECTED" } });
    await assert.rejects(d1.completeSyncSlice(db, { sliceId: slice.id, accountId: a.id, channelConnectionId: c1.id,
      leaseOwner: "worker-2", authorizationVersion: "auth-1", mappingVersionId: mapping.id, now, expectedProcessedSliceId: null }));
    await db.channelConnection.update({ where: { id: c1.id }, data: { status: "ACTIVE" } });
    await db.coreChannelAuthorization.update({ where: { channelConnectionId: c1.id }, data: { authorizationVersion: "auth-2" } });
    await assert.rejects(d1.completeSyncSlice(db, { sliceId: slice.id, accountId: a.id, channelConnectionId: c1.id,
      leaseOwner: "worker-2", authorizationVersion: "auth-1", mappingVersionId: mapping.id, now, expectedProcessedSliceId: null }));
    await db.coreChannelAuthorization.update({ where: { channelConnectionId: c1.id }, data: { authorizationVersion: "auth-1" } });
    assert.equal(await db.syncCheckpoint.count(), 0);
    await db.$executeRawUnsafe("CREATE TRIGGER D1_test_checkpoint_abort BEFORE INSERT ON SyncCheckpoint BEGIN SELECT RAISE(ABORT, 'test rollback'); END");
    await assert.rejects(d1.completeSyncSlice(db, { sliceId: slice.id, accountId: a.id, channelConnectionId: c1.id,
      leaseOwner: "worker-2", authorizationVersion: "auth-1", mappingVersionId: mapping.id, now, expectedProcessedSliceId: null }));
    assert.equal((await db.syncSlice.findUniqueOrThrow({ where: { id: slice.id } })).status, "PREPARED");
    assert.equal(await db.syncCheckpoint.count(), 0);
    await db.$executeRawUnsafe("DROP TRIGGER D1_test_checkpoint_abort");
    await d1.completeSyncSlice(db, { sliceId: slice.id, accountId: a.id, channelConnectionId: c1.id,
      leaseOwner: "worker-2", authorizationVersion: "auth-1", mappingVersionId: mapping.id, cursorValue: "next", now, expectedProcessedSliceId: null });
    assert.equal((await db.syncCheckpoint.findFirstOrThrow()).processedSliceId, slice.id);
    assert.equal((await db.syncSlice.findUniqueOrThrow({ where: { id: slice.id } })).status, "SUCCEEDED");
    await db.dataCoverage.create({ data: { accountId: a.id, channelConnectionId: c1.id,
      marketplaceScopeKey: "@none", datasetKey: "orders", windowStart: new Date("2026-01-01"),
      windowEnd: new Date("2026-02-01"), revision: 1, capabilityStatus: "NOT_AUTHORIZED",
      datasetQualityStatus: "ERROR", reasonCode: "NO_SCOPE" } });
    await db.dataCoverage.create({ data: { accountId: a.id, channelConnectionId: c2.id,
      marketplaceScopeKey: "@none", datasetKey: "orders", windowStart: new Date("2026-01-01"),
      windowEnd: new Date("2026-02-01"), revision: 1, capabilityStatus: "NOT_SUPPORTED",
      datasetQualityStatus: "ERROR", reasonCode: "NO_ADAPTER" } });
    await db.dataCoverage.create({ data: { accountId: a.id, channelConnectionId: c1.id,
      marketplaceScopeKey: "@none", datasetKey: "products", windowStart: new Date("2026-01-01"),
      windowEnd: new Date("2026-02-01"), revision: 1, capabilityStatus: "AVAILABLE",
      datasetQualityStatus: "COMPLETE", completenessBps: 10000 } });
    assert.deepEqual((await db.dataCoverage.findMany({ orderBy: { capabilityStatus: "asc" } })).map(x => x.capabilityStatus), ["AVAILABLE", "NOT_AUTHORIZED", "NOT_SUPPORTED"]);
    assert.equal(validateCoverageState({ capabilityStatus: "NOT_AUTHORIZED", datasetQualityStatus: "ERROR", completenessBps: null }).completenessBps, null);
    assert.throws(() => validateCoverageState({ capabilityStatus: "NOT_AUTHORIZED", datasetQualityStatus: "COMPLETE", completenessBps: 0 }));
    assert.equal(selectFinancialAuthority({ authorityScopeKey: "order:o1:revenue", economicComponentFamily: "REVENUE",
      provisionalSourceAuthority: "ORDERS", actualSourceAuthority: "FINANCES", coverageState: "ACTUAL_COMPLETE" }), "ACTUAL");
    assert.equal(selectFinancialAuthority({ authorityScopeKey: "order:o1:revenue", economicComponentFamily: "REVENUE",
      provisionalSourceAuthority: "ORDERS", actualSourceAuthority: "FINANCES", coverageState: "ACTUAL_INCOMPLETE" }), "PROVISIONAL");
    assert.equal(selectFinancialAuthority({ authorityScopeKey: "order:o1:revenue", economicComponentFamily: "REVENUE",
      provisionalSourceAuthority: "ORDERS", actualSourceAuthority: "FINANCES", coverageState: "ACTUAL_UNKNOWN" }), "BLOCKED");
    assert.equal(money(MIN_ATOMS, 0, "USD").amountAtoms, MIN_ATOMS);
    assert.equal(money(MAX_ATOMS, 0, "USD").amountAtoms, MAX_ATOMS);
    assert.throws(() => money(MAX_ATOMS + 1n, 0, "USD"));
    assert.throws(() => money(1n, 13, "USD"));
    assert.throws(() => money(1n, 2, "usd"));
    assert.throws(() => addMoney(money(1n, 2, "USD"), money(1n, 2, "EUR"), { policyVersion: "v1", mode: "REJECT" }));
    assert.equal(normalizeMoneyScale(money(155n, 2, "USD"), 1, { policyVersion: "v1", mode: "HALF_EVEN" }).amountAtoms, 16n);
    assert.throws(() => normalizeMoneyScale(money(155n, 2, "USD"), 1, { policyVersion: "v1", mode: "REJECT" }));
    console.log("D1 isolated SQLite integration PASS");
  } finally {
    await db.$disconnect();
  }
} finally {
  try { sqlite.close(); } catch { /* already closed */ }
  rmSync(directory, { recursive: true, force: true });
}
