import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { MAX_ATOMS, MIN_ATOMS, money, normalizeQuantityScale, quantity } from "../../app/core/fixed-money";

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-d2a-"));
const databasePath = path.join(directory, "d2a.sqlite");
const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA foreign_keys = ON");
try {
  const migrations = path.join(process.cwd(), "prisma/migrations");
  for (const name of readdirSync(migrations).filter(name => /^\d{14}_/.test(name)).sort()) {
    if (name === "20260925120000_data_core_d2a_normalized_orders") {
      // Simulate an already activated record in the applied D1 database.
      sqlite.exec(`INSERT INTO MappingVersion
        (id, platform, sourceContract, sourceVersion, mapperSemanticVersion, formulaCompatibilityVersion, checksum, activatedAt)
        VALUES ('pre-d2a-activated', 'SHOPIFY', 'upgrade', '1', '1', 'legacy', 'upgrade', CURRENT_TIMESTAMP)`);
    }
    sqlite.exec(readFileSync(path.join(migrations, name, "migration.sql"), "utf8"));
  }
  assert.throws(() => sqlite.exec("UPDATE MappingVersion SET activatedAt = NULL WHERE id = 'pre-d2a-activated'"),
    /Activated MappingVersion semantics are immutable/);
  process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;
  const [{ PrismaClient }, d2a] = await Promise.all([
    import("@prisma/client"), import("../../app/core/data-core-d2a.server"),
  ]);
  const db = new PrismaClient();
  try {
    const account = await db.account.create({ data: {} });
    const otherAccount = await db.account.create({ data: {} });
    const channel = await db.channelConnection.create({ data: { accountId: account.id, channel: "SHOPIFY", externalAccountId: "d2a-one.myshopify.com" } });
    const channelTwo = await db.channelConnection.create({ data: { accountId: account.id, channel: "SHOPIFY", externalAccountId: "d2a-two.myshopify.com" } });
    const otherChannel = await db.channelConnection.create({ data: { accountId: otherAccount.id, channel: "SHOPIFY", externalAccountId: "d2a-other.myshopify.com" } });
    const marketplace = await db.marketplace.create({ data: { accountId: account.id, channelConnectionId: channel.id, externalMarketplaceId: "US" } });
    const marketplaceB = await db.marketplace.create({ data: { accountId: account.id, channelConnectionId: channel.id, externalMarketplaceId: "CA" } });
    const badMarketplace = await db.marketplace.create({ data: { accountId: otherAccount.id, channelConnectionId: otherChannel.id, externalMarketplaceId: "US" } });
    const mapping = await db.mappingVersion.create({ data: { platform: "SHOPIFY", sourceContract: "d2a-orders", sourceVersion: "1", mapperSemanticVersion: "1", formulaCompatibilityVersion: "legacy", checksum: "m1" } });
    const wrongMapping = await db.mappingVersion.create({ data: { platform: "SHOPIFY", sourceContract: "d2a-orders", sourceVersion: "1", mapperSemanticVersion: "2", formulaCompatibilityVersion: "legacy", checksum: "m2" } });
    const syncRun = await db.syncRun.create({ data: { accountId: account.id, channelConnectionId: channel.id, stream: "orders", authorizationVersion: "auth", mappingVersionId: mapping.id } });
    const slice = await db.syncSlice.create({ data: { accountId: account.id, channelConnectionId: channel.id, runId: syncRun.id, stream: "orders", marketplaceScopeKey: "@none", sliceKey: "none", authorizationVersion: "auth", status: "LEASED" } });
    const scopedSlice = await db.syncSlice.create({ data: { accountId: account.id, channelConnectionId: channel.id, runId: syncRun.id, stream: "orders", marketplaceId: marketplace.id, marketplaceScopeKey: marketplace.id, sliceKey: "us", authorizationVersion: "auth", status: "LEASED" } });
    const raw = await db.rawSourceRecord.create({ data: { accountId: account.id, channelConnectionId: channel.id, ingestionRunId: syncRun.id, sourceSystem: "SHOPIFY", sourceVersion: "1", sourceEntityType: "ORDER", sourceEntityId: "order-1", capturedAt: new Date("2026-01-01"), schemaVersion: "1", payloadChecksum: "raw-1", payloadByteLength: 0, retentionClass: "TEST" } });
    const otherRaw = await db.rawSourceRecord.create({ data: { accountId: otherAccount.id, channelConnectionId: otherChannel.id, sourceSystem: "SHOPIFY", sourceVersion: "1", sourceEntityType: "ORDER", sourceEntityId: "order-1", capturedAt: new Date("2026-01-01"), schemaVersion: "1", payloadChecksum: "raw-other", payloadByteLength: 0, retentionClass: "TEST" } });
    const rawTwo = await db.rawSourceRecord.create({ data: { accountId: account.id, channelConnectionId: channel.id, ingestionRunId: syncRun.id, sourceSystem: "SHOPIFY", sourceVersion: "1", sourceEntityType: "ORDER", sourceEntityId: "order-2", capturedAt: new Date("2026-01-01"), schemaVersion: "1", payloadChecksum: "raw-2", payloadByteLength: 0, retentionClass: "TEST" } });
    const scopedRaw = await db.rawSourceRecord.create({ data: { accountId: account.id, channelConnectionId: channel.id, ingestionRunId: syncRun.id, sourceSystem: "SHOPIFY", sourceVersion: "1", sourceEntityType: "ORDER", sourceEntityId: "order-1", capturedAt: new Date("2026-01-01"), schemaVersion: "1", payloadChecksum: "raw-scoped", payloadByteLength: 0, retentionClass: "TEST" } });
    const norm = await db.normalizationRun.create({ data: { accountId: account.id, channelConnectionId: channel.id, rawSourceRecordId: raw.id, mappingVersionId: mapping.id, parserVersion: "1", normalizationRevision: 1 } });
    const normTwo = await db.normalizationRun.create({ data: { accountId: account.id, channelConnectionId: channel.id, rawSourceRecordId: rawTwo.id, mappingVersionId: mapping.id, parserVersion: "1", normalizationRevision: 1 } });
    const scopedNorm = await db.normalizationRun.create({ data: { accountId: account.id, channelConnectionId: channel.id, rawSourceRecordId: scopedRaw.id, mappingVersionId: mapping.id, parserVersion: "1", normalizationRevision: 1 } });
    const sliceEvidence = await db.syncSliceEvidence.create({ data: { accountId: account.id, channelConnectionId: channel.id, sliceId: slice.id, runId: syncRun.id, rawSourceRecordId: raw.id, normalizationRunId: norm.id } });
    const evidenceTwo = await db.syncSliceEvidence.create({ data: { accountId: account.id, channelConnectionId: channel.id, sliceId: slice.id, runId: syncRun.id, rawSourceRecordId: rawTwo.id, normalizationRunId: normTwo.id } });
    const scopedEvidence = await db.syncSliceEvidence.create({ data: { accountId: account.id, channelConnectionId: channel.id, sliceId: scopedSlice.id, runId: syncRun.id, rawSourceRecordId: scopedRaw.id, normalizationRunId: scopedNorm.id } });
    const tenant = { accountId: account.id, channelConnectionId: channel.id };
    const evidence = { rawSourceRecordId: raw.id, normalizationRunId: norm.id, mappingVersionId: mapping.id, normalizationRevision: 1, syncSliceEvidenceId: sliceEvidence.id };
    const base = { ...evidence, marketplaceId: null, sourceSystem: "SHOPIFY", sourceOrderKey: "order-1", operationKey: "snapshot-1", normalizedStatus: "PAID", sourceStatus: "paid", occurredAt: new Date("2026-01-01T00:00:00Z") };
    const orderWrite = (input: Parameters<typeof d2a.recordNormalizedOrderRevisionTx>[2] = base, owner = tenant) => db.$transaction(tx => d2a.recordNormalizedOrderRevisionTx(tx, owner, input));
    await assert.rejects(orderWrite()); // PENDING normalization is not durable evidence.
    assert.equal(await db.normalizedOrderRevision.count(), 0);
    await db.normalizationRun.update({ where: { id: norm.id }, data: { status: "SUCCEEDED" } });
    await assert.rejects(orderWrite()); // An unactivated mapping can still change semantics.
    assert.equal(await db.normalizedOrderRevision.count(), 0);
    await db.mappingVersion.update({ where: { id: mapping.id }, data: { activatedAt: new Date("2026-01-02T00:00:00Z") } });
    const first = await orderWrite();
    await assert.rejects(db.syncSlice.update({ where: { id: slice.id }, data: { marketplaceId: marketplace.id, marketplaceScopeKey: marketplace.id } }));
    await assert.rejects(db.mappingVersion.update({ where: { id: mapping.id }, data: { checksum: "mutated" } }));
    assert.equal((await db.mappingVersion.findUniqueOrThrow({ where: { id: mapping.id } })).checksum, "m1");
    assert.equal(first.revision.revision, 1);
    assert.equal(first.order.marketplaceScopeKey, "@none");
    const replay = await orderWrite();
    assert.equal(replay.order.id, first.order.id);
    assert.equal(replay.revision.id, first.revision.id);
    assert.equal(replay.replay, true);
    await assert.rejects(orderWrite({ ...base, normalizedStatus: "REFUNDED" }));
    const second = await orderWrite({ ...base, operationKey: "snapshot-2", normalizedStatus: "REFUNDED" });
    assert.equal(second.revision.revision, 2);
    const directOrderRevision = { accountId: account.id, channelConnectionId: channel.id, orderId: first.order.id,
      inputChecksum: "direct", normalizedStatus: "PAID", rawSourceRecordId: raw.id, normalizationRunId: norm.id,
      mappingVersionId: mapping.id, normalizationRevision: 1, syncSliceEvidenceId: sliceEvidence.id };
    await assert.rejects(db.normalizedOrderRevision.create({ data: { ...directOrderRevision, revision: 3, operationKey: first.revision.operationKey } }));
    await assert.rejects(db.normalizedOrderRevision.create({ data: { ...directOrderRevision, revision: 2, operationKey: "other-operation" } }));
    assert.equal(await db.normalizedOrderRevision.count({ where: { orderId: first.order.id } }), 2);
    assert.equal((await db.normalizedOrderRevision.findUniqueOrThrow({ where: { id: first.revision.id } })).normalizedStatus, "PAID");
    await assert.rejects(db.normalizedOrderRevision.update({ where: { id: first.revision.id }, data: { normalizedStatus: "X" } }));
    await assert.rejects(db.normalizedOrderRevision.delete({ where: { id: first.revision.id } }));
    await assert.rejects(db.normalizedOrder.update({ where: { id: first.order.id }, data: { sourceOrderKey: "changed" } }));
    await assert.rejects(db.normalizedOrder.delete({ where: { id: first.order.id } }));
    await assert.rejects(orderWrite(base, { accountId: otherAccount.id, channelConnectionId: channel.id }));
    await assert.rejects(orderWrite({ ...base, marketplaceId: badMarketplace.id }));
    await assert.rejects(orderWrite({ ...base, rawSourceRecordId: otherRaw.id }));
    await assert.rejects(orderWrite({ ...base, normalizationRunId: normTwo.id }));
    await db.mappingVersion.update({ where: { id: wrongMapping.id }, data: { activatedAt: new Date("2026-01-02T00:00:00Z") } });
    await assert.rejects(orderWrite({ ...base, mappingVersionId: wrongMapping.id }));
    const failedNorm = await db.normalizationRun.create({ data: { accountId: account.id, channelConnectionId: channel.id,
      rawSourceRecordId: raw.id, mappingVersionId: mapping.id, parserVersion: "1", normalizationRevision: 2, status: "FAILED" } });
    const failedSlice = await db.syncSlice.create({ data: { accountId: account.id, channelConnectionId: channel.id,
      runId: syncRun.id, stream: "orders", marketplaceScopeKey: "@none", sliceKey: "failed", authorizationVersion: "auth", status: "LEASED" } });
    const failedEvidence = await db.syncSliceEvidence.create({ data: { accountId: account.id, channelConnectionId: channel.id,
      sliceId: failedSlice.id, runId: syncRun.id, rawSourceRecordId: raw.id, normalizationRunId: failedNorm.id } });
    const beforeFailed = await db.normalizedOrderRevision.count();
    await assert.rejects(orderWrite({ ...base, operationKey: "failed-run", normalizationRunId: failedNorm.id,
      normalizationRevision: 2, syncSliceEvidenceId: failedEvidence.id }));
    assert.equal(await db.normalizedOrderRevision.count(), beforeFailed);
    const txNorm = await db.normalizationRun.create({ data: { accountId: account.id, channelConnectionId: channel.id,
      rawSourceRecordId: raw.id, mappingVersionId: mapping.id, parserVersion: "1", normalizationRevision: 3 } });
    const txSlice = await db.syncSlice.create({ data: { accountId: account.id, channelConnectionId: channel.id,
      runId: syncRun.id, stream: "orders", marketplaceScopeKey: "@none", sliceKey: "tx", authorizationVersion: "auth", status: "LEASED" } });
    const txEvidence = await db.syncSliceEvidence.create({ data: { accountId: account.id, channelConnectionId: channel.id,
      sliceId: txSlice.id, runId: syncRun.id, rawSourceRecordId: raw.id, normalizationRunId: txNorm.id } });
    const txInput = { ...base, operationKey: "same-transaction", normalizationRunId: txNorm.id,
      normalizationRevision: 3, syncSliceEvidenceId: txEvidence.id };
    await assert.rejects(db.$transaction(async tx => {
      await tx.normalizationRun.update({ where: { id: txNorm.id }, data: { status: "SUCCEEDED" } });
      await d2a.recordNormalizedOrderRevisionTx(tx, tenant, txInput);
      throw new Error("rollback normalization and output together");
    }));
    assert.equal((await db.normalizationRun.findUniqueOrThrow({ where: { id: txNorm.id } })).status, "PENDING");
    assert.equal(await db.normalizedOrderRevision.count(), beforeFailed);
    const inOneTransaction = await db.$transaction(async tx => {
      await tx.normalizationRun.update({ where: { id: txNorm.id }, data: { status: "SUCCEEDED" } });
      return d2a.recordNormalizedOrderRevisionTx(tx, tenant, txInput);
    });
    assert.equal(inOneTransaction.revision.operationKey, "same-transaction");
    await assert.rejects(orderWrite({ ...base, marketplaceId: marketplace.id }));
    await db.normalizationRun.update({ where: { id: scopedNorm.id }, data: { status: "SUCCEEDED" } });
    const scoped = await orderWrite({ ...base, marketplaceId: marketplace.id, rawSourceRecordId: scopedRaw.id,
      normalizationRunId: scopedNorm.id, syncSliceEvidenceId: scopedEvidence.id });
    assert.notEqual(scoped.order.id, first.order.id);
    await assert.rejects(orderWrite({ ...base, rawSourceRecordId: scopedRaw.id, normalizationRunId: scopedNorm.id, syncSliceEvidenceId: scopedEvidence.id }));
    await assert.rejects(orderWrite({ ...base, marketplaceId: marketplaceB.id, rawSourceRecordId: scopedRaw.id,
      normalizationRunId: scopedNorm.id, syncSliceEvidenceId: scopedEvidence.id }));
    await assert.rejects(orderWrite({ ...base, syncSliceEvidenceId: scopedEvidence.id }));
    const syncRunOther = await db.syncRun.create({ data: { accountId: account.id, channelConnectionId: channelTwo.id, stream: "orders", authorizationVersion: "auth", mappingVersionId: mapping.id } });
    const sliceOther = await db.syncSlice.create({ data: { accountId: account.id, channelConnectionId: channelTwo.id, runId: syncRunOther.id, stream: "orders", marketplaceScopeKey: "@none", sliceKey: "other", authorizationVersion: "auth", status: "LEASED" } });
    const rawOtherChannel = await db.rawSourceRecord.create({ data: { accountId: account.id, channelConnectionId: channelTwo.id, ingestionRunId: syncRunOther.id, sourceSystem: "SHOPIFY", sourceVersion: "1", sourceEntityType: "ORDER", sourceEntityId: "order-1", capturedAt: new Date("2026-01-01"), schemaVersion: "1", payloadChecksum: "raw-other-channel", payloadByteLength: 0, retentionClass: "TEST" } });
    const normOtherChannel = await db.normalizationRun.create({ data: { accountId: account.id, channelConnectionId: channelTwo.id, rawSourceRecordId: rawOtherChannel.id, mappingVersionId: mapping.id, parserVersion: "1", normalizationRevision: 1 } });
    const otherEvidence = await db.syncSliceEvidence.create({ data: { accountId: account.id, channelConnectionId: channelTwo.id, sliceId: sliceOther.id, runId: syncRunOther.id, rawSourceRecordId: rawOtherChannel.id, normalizationRunId: normOtherChannel.id } });
    await db.normalizationRun.update({ where: { id: normOtherChannel.id }, data: { status: "SUCCEEDED" } });
    await assert.rejects(orderWrite({ ...base, syncSliceEvidenceId: otherEvidence.id }));
    const otherChannelWrite = await orderWrite({ ...base, rawSourceRecordId: rawOtherChannel.id, normalizationRunId: normOtherChannel.id, syncSliceEvidenceId: otherEvidence.id }, { accountId: account.id, channelConnectionId: channelTwo.id });
    assert.notEqual(otherChannelWrite.order.id, first.order.id);
    await assert.rejects(orderWrite({ ...base, rawSourceRecordId: rawTwo.id, normalizationRunId: normTwo.id,
      syncSliceEvidenceId: evidenceTwo.id, sourceOrderKey: "order-2" }));
    await db.normalizationRun.update({ where: { id: normTwo.id }, data: { status: "SUCCEEDED" } });
    const secondOrder = await orderWrite({ ...base, rawSourceRecordId: rawTwo.id, normalizationRunId: normTwo.id,
      syncSliceEvidenceId: evidenceTwo.id, sourceOrderKey: "order-2" });
    const sku = await db.sku.create({ data: { accountId: account.id, sellerSku: "EXPLICIT" } });
    const wrongSku = await db.sku.create({ data: { accountId: otherAccount.id, sellerSku: "EXPLICIT" } });
    const listing = await db.channelListing.create({ data: { accountId: account.id, channelConnectionId: channel.id, marketplaceScopeKey: "@none", sourceEntityType: "VARIANT", externalVariantOrListingId: "v1", skuId: sku.id } });
    const candidate = await db.productMappingCandidate.create({ data: { accountId: account.id, listingId: listing.id, candidateSkuId: sku.id, ruleVersion: "explicit-v1", confidence: 100, state: "ACCEPTED" } });
    const decision = await db.productMappingDecision.create({ data: { accountId: account.id, candidateId: candidate.id, decision: "ACCEPT", actorRef: "test-approval" } });
    const pendingCandidate = await db.productMappingCandidate.create({ data: { accountId: account.id, listingId: listing.id, candidateSkuId: sku.id, ruleVersion: "pending", confidence: 100, state: "PENDING" } });
    const pendingDecision = await db.productMappingDecision.create({ data: { accountId: account.id, candidateId: pendingCandidate.id, decision: "ACCEPT", actorRef: "test-pending" } });
    const rejectedCandidate = await db.productMappingCandidate.create({ data: { accountId: account.id, listingId: listing.id, candidateSkuId: sku.id, ruleVersion: "rejected", confidence: 100, state: "ACCEPTED" } });
    const rejectedDecision = await db.productMappingDecision.create({ data: { accountId: account.id, candidateId: rejectedCandidate.id, decision: "REJECT", actorRef: "test-reject" } });
    const supersededCandidate = await db.productMappingCandidate.create({ data: { accountId: account.id, listingId: listing.id, candidateSkuId: sku.id, ruleVersion: "superseded", confidence: 100, state: "SUPERSEDED" } });
    const supersededDecision = await db.productMappingDecision.create({ data: { accountId: account.id, candidateId: supersededCandidate.id, decision: "ACCEPT", actorRef: "test-superseded" } });
    const unmappedListing = await db.channelListing.create({ data: { accountId: account.id, channelConnectionId: channel.id, marketplaceScopeKey: "@none", sourceEntityType: "VARIANT", externalVariantOrListingId: "v-unmapped" } });
    const wrongListing = await db.channelListing.create({ data: { accountId: account.id, channelConnectionId: channelTwo.id, marketplaceScopeKey: "@none", sourceEntityType: "VARIANT", externalVariantOrListingId: "v2" } });
    const scopedListing = await db.channelListing.create({ data: { accountId: account.id, channelConnectionId: channel.id, marketplaceId: marketplace.id, marketplaceScopeKey: marketplace.id, sourceEntityType: "VARIANT", externalVariantOrListingId: "v3" } });
    const wrongChannelCandidate = await db.productMappingCandidate.create({ data: { accountId: account.id, listingId: wrongListing.id, candidateSkuId: sku.id, ruleVersion: "wrong-channel", confidence: 100, state: "ACCEPTED" } });
    const wrongChannelDecision = await db.productMappingDecision.create({ data: { accountId: account.id, candidateId: wrongChannelCandidate.id, decision: "ACCEPT", actorRef: "test" } });
    const wrongScopeCandidate = await db.productMappingCandidate.create({ data: { accountId: account.id, listingId: scopedListing.id, candidateSkuId: sku.id, ruleVersion: "wrong-scope", confidence: 100, state: "ACCEPTED" } });
    const wrongScopeDecision = await db.productMappingDecision.create({ data: { accountId: account.id, candidateId: wrongScopeCandidate.id, decision: "ACCEPT", actorRef: "test" } });
    const otherAccountListing = await db.channelListing.create({ data: { accountId: otherAccount.id, channelConnectionId: otherChannel.id, marketplaceScopeKey: "@none", sourceEntityType: "VARIANT", externalVariantOrListingId: "v4" } });
    const otherAccountCandidate = await db.productMappingCandidate.create({ data: { accountId: otherAccount.id, listingId: otherAccountListing.id, candidateSkuId: wrongSku.id, ruleVersion: "other-account", confidence: 100, state: "ACCEPTED" } });
    const otherAccountDecision = await db.productMappingDecision.create({ data: { accountId: otherAccount.id, candidateId: otherAccountCandidate.id, decision: "ACCEPT", actorRef: "test" } });
    const itemBase = { ...evidence, orderId: first.order.id, sourceItemKey: "id:line-1", operationKey: "item-snapshot-1", quantityAtoms: 125n, quantityScale: 2, skuId: sku.id, channelListingId: listing.id, mappingDecisionId: decision.id, sourceListingEntityType: "VARIANT", sourceListingKey: "v1" };
    const itemWrite = (input: Parameters<typeof d2a.recordNormalizedOrderItemRevisionTx>[2] = itemBase, owner = tenant) => db.$transaction(tx => d2a.recordNormalizedOrderItemRevisionTx(tx, owner, input));
    const itemFirst = await itemWrite();
    await assert.rejects(db.channelListing.update({ where: { id: listing.id }, data: { externalVariantOrListingId: "changed-v1" } }));
    await assert.rejects(db.productMappingCandidate.update({ where: { id: candidate.id }, data: { ruleVersion: "mutated" } }));
    assert.equal(itemFirst.revision.quantityAtoms, 125n);
    assert.equal(itemFirst.revision.quantityScale, 2);
    assert.equal((await itemWrite()).revision.id, itemFirst.revision.id);
    await assert.rejects(itemWrite({ ...itemBase, quantityAtoms: 126n }));
    const itemSecond = await itemWrite({ ...itemBase, operationKey: "item-snapshot-2", quantityAtoms: 200n });
    assert.equal(itemSecond.revision.revision, 2);
    assert.equal((await db.normalizedOrderItemRevision.findUniqueOrThrow({ where: { id: itemFirst.revision.id } })).quantityAtoms, 125n);
    await assert.rejects(db.normalizedOrderItemRevision.update({ where: { id: itemFirst.revision.id }, data: { quantityAtoms: 999n } }));
    await assert.rejects(db.normalizedOrderItemRevision.delete({ where: { id: itemFirst.revision.id } }));
    await assert.rejects(db.normalizedOrderItem.update({ where: { id: itemFirst.item.id }, data: { sourceItemKey: "id:changed" } }));
    await assert.rejects(db.normalizedOrderItem.delete({ where: { id: itemFirst.item.id } }));
    const itemOtherOrder = await itemWrite({ ...itemBase, orderId: secondOrder.order.id, rawSourceRecordId: rawTwo.id, normalizationRunId: normTwo.id, syncSliceEvidenceId: evidenceTwo.id });
    assert.notEqual(itemOtherOrder.item.id, itemFirst.item.id);
    await assert.rejects(itemWrite(itemBase, { accountId: otherAccount.id, channelConnectionId: channel.id }));
    await assert.rejects(itemWrite({ ...itemBase, skuId: wrongSku.id, channelListingId: null }));
    await assert.rejects(itemWrite({ ...itemBase, mappingDecisionId: null }));
    await assert.rejects(itemWrite({ ...itemBase, sourceListingKey: "different-source-variant" }));
    await assert.rejects(itemWrite({ ...itemBase, mappingDecisionId: pendingDecision.id }));
    await assert.rejects(itemWrite({ ...itemBase, mappingDecisionId: rejectedDecision.id }));
    await assert.rejects(itemWrite({ ...itemBase, mappingDecisionId: supersededDecision.id }));
    const competingCandidate = await db.productMappingCandidate.create({ data: { accountId: account.id, listingId: listing.id,
      candidateSkuId: sku.id, ruleVersion: "competing", confidence: 100, state: "ACCEPTED" } });
    await db.productMappingDecision.create({ data: { accountId: account.id, candidateId: competingCandidate.id, decision: "ACCEPT", actorRef: "test-competing" } });
    await assert.rejects(itemWrite({ ...itemBase, sourceItemKey: "id:ambiguous" }));
    await db.productMappingCandidate.update({ where: { id: competingCandidate.id }, data: { state: "SUPERSEDED" } });
    const unmappedItem = await itemWrite({ ...itemBase, sourceItemKey: "id:unmapped", skuId: null, mappingDecisionId: null, channelListingId: null, sourceListingEntityType: null, sourceListingKey: null });
    assert.equal(unmappedItem.revision.skuId, null);
    await assert.rejects(itemWrite({ ...itemBase, channelListingId: wrongListing.id }));
    await assert.rejects(itemWrite({ ...itemBase, channelListingId: scopedListing.id }));
    await assert.rejects(itemWrite({ ...itemBase, channelListingId: wrongListing.id, mappingDecisionId: wrongChannelDecision.id, sourceListingKey: "v2" }));
    await assert.rejects(itemWrite({ ...itemBase, channelListingId: scopedListing.id, mappingDecisionId: wrongScopeDecision.id, sourceListingKey: "v3" }));
    await assert.rejects(itemWrite({ ...itemBase, channelListingId: otherAccountListing.id, mappingDecisionId: otherAccountDecision.id, skuId: wrongSku.id, sourceListingKey: "v4" }));
    await assert.rejects(itemWrite({ ...itemBase, rawSourceRecordId: otherRaw.id }));
    await assert.rejects(itemWrite({ ...itemBase, normalizationRunId: normTwo.id }));
    await assert.rejects(itemWrite({ ...itemBase, mappingVersionId: wrongMapping.id }));
    await assert.rejects(itemWrite({ ...itemBase, sourceItemKey: "0" }));
    await assert.rejects(itemWrite({ ...itemBase, sourceItemKey: "id:line-unsafe", quantityAtoms: MAX_ATOMS + 1n }));
    assert.equal(await db.normalizedOrderItem.count({ where: { sourceItemKey: "id:line-unsafe" } }), 0);
    assert.deepEqual(normalizeQuantityScale(quantity(125n, 2), 3), { quantityAtoms: 1250n, quantityScale: 3 });
    assert.throws(() => normalizeQuantityScale(quantity(125n, 2), 1));
    assert.throws(() => quantity(-1n, 0));
    assert.deepEqual(quantity(MAX_ATOMS, 0), { quantityAtoms: MAX_ATOMS, quantityScale: 0 });
    assert.throws(() => quantity(MAX_ATOMS + 1n, 0));
    assert.throws(() => quantity(MIN_ATOMS, 0)); // order-item quantity is nonnegative.
    assert.throws(() => quantity(MIN_ATOMS - 1n, 0));
    assert.equal(money(MIN_ATOMS, 0, "USD").amountAtoms, MIN_ATOMS);
    assert.equal(money(MAX_ATOMS, 0, "USD").amountAtoms, MAX_ATOMS);
    assert.throws(() => money(MIN_ATOMS - 1n, 0, "USD"));
    assert.throws(() => money(MAX_ATOMS + 1n, 0, "USD"));
    assert.throws(() => normalizeQuantityScale(quantity(MAX_ATOMS, 0), 1));
    assert.deepEqual(normalizeQuantityScale(quantity(120n, 2), 1), { quantityAtoms: 12n, quantityScale: 1 });
    const before = await db.normalizedOrderRevision.count();
    await assert.rejects(db.$transaction(async tx => {
      await tx.normalizedOrder.create({ data: { accountId: account.id, channelConnectionId: channel.id,
        marketplaceScopeKey: "@none", sourceSystem: "SHOPIFY", sourceOrderKey: "transaction-identity" } });
      await d2a.recordNormalizedOrderRevisionTx(tx, tenant, { ...base, sourceOrderKey: "transaction-identity", operationKey: "invalid-provenance" });
    }));
    assert.equal(await db.normalizedOrder.count({ where: { sourceOrderKey: "transaction-identity" } }), 0);
    await assert.rejects(db.$transaction(async tx => {
      await d2a.recordNormalizedOrderRevisionTx(tx, tenant, { ...base, operationKey: "rollback" });
      throw new Error("caller rollback");
    }));
    assert.equal(await db.normalizedOrderRevision.count(), before);
    const composed = await db.$transaction(async tx => {
      const orderResult = await d2a.recordNormalizedOrderRevisionTx(tx, tenant, { ...base, operationKey: "composed" });
      const itemResult = await d2a.recordNormalizedOrderItemRevisionTx(tx, tenant, { ...itemBase, operationKey: "composed" });
      return [orderResult.revision.id, itemResult.revision.id];
    });
    assert.equal(composed.length, 2);
    // DB-level FK and scope protections apply even if a future writer bypasses the service.
    await assert.rejects(db.normalizedOrder.create({ data: { accountId: account.id, channelConnectionId: channel.id,
      marketplaceId: marketplace.id, marketplaceScopeKey: "@none", sourceSystem: "SHOPIFY", sourceOrderKey: "invalid-scope" } }));
    await assert.rejects(db.normalizedOrderItem.create({ data: { accountId: otherAccount.id, channelConnectionId: channel.id, orderId: first.order.id, sourceItemKey: "cross-tenant" } }));
    const directRevision = { accountId: account.id, channelConnectionId: channel.id, itemId: itemFirst.item.id, revision: 999,
      operationKey: "direct-invalid", inputChecksum: "direct", quantityAtoms: 1n, quantityScale: 0,
      rawSourceRecordId: raw.id, normalizationRunId: norm.id, mappingVersionId: mapping.id, normalizationRevision: 1, syncSliceEvidenceId: sliceEvidence.id };
    await assert.rejects(db.normalizedOrderItemRevision.create({ data: { ...directRevision, marketplaceScopeKey: marketplace.id } }));
    await assert.rejects(db.normalizedOrderItemRevision.create({ data: { ...directRevision, marketplaceScopeKey: "@none", skuId: sku.id, channelListingId: wrongListing.id } }));
    await assert.rejects(db.normalizedOrderItemRevision.create({ data: { ...directRevision, marketplaceScopeKey: "@none", skuId: sku.id, channelListingId: unmappedListing.id } }));
    // Adversarial persisted invariants: intentionally bypass the D2A service.
    let adversarialSequence = 1000;
    const directOrder = (overrides: Partial<typeof directOrderRevision> = {}) => {
      const sequence = ++adversarialSequence;
      return db.normalizedOrderRevision.create({ data: {
        ...directOrderRevision, revision: sequence, operationKey: `db-order-${sequence}`, ...overrides,
      } });
    };
    const directItemBase = { ...directRevision, marketplaceScopeKey: "@none",
      skuId: sku.id as string | null, channelListingId: listing.id as string | null,
      mappingDecisionId: decision.id as string | null, sourceListingEntityType: "VARIANT" as string | null,
      sourceListingKey: "v1" as string | null };
    const directItem = (overrides: Partial<typeof directItemBase> = {}) => {
      const sequence = ++adversarialSequence;
      return db.normalizedOrderItemRevision.create({ data: {
        ...directItemBase, revision: sequence, operationKey: `db-item-${sequence}`, ...overrides,
      } });
    };
    const rawClone = (table: "NormalizedOrderRevision" | "NormalizedOrderItemRevision", id: string,
      overrides: Record<string, string | number | null | undefined>) => {
      const sequence = ++adversarialSequence;
      const original = sqlite.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(id)!;
      const row = { ...original, id: `raw-audit-${sequence}`, revision: sequence,
        operationKey: `raw-audit-${sequence}`, ...overrides };
      const columns = Object.keys(row);
      return sqlite.prepare(`INSERT INTO "${table}" (${columns.map(key => `"${key}"`).join(",")})
        VALUES (${columns.map(() => "?").join(",")})`).run(...Object.values(row).map(value => value ?? null));
    };

    const pendingNorm = await db.normalizationRun.create({ data: { accountId: account.id,
      channelConnectionId: channel.id, rawSourceRecordId: raw.id, mappingVersionId: mapping.id,
      parserVersion: "1", normalizationRevision: 100 } });
    const pendingSlice = await db.syncSlice.create({ data: { accountId: account.id, channelConnectionId: channel.id,
      runId: syncRun.id, stream: "orders", marketplaceScopeKey: "@none", sliceKey: "db-pending",
      authorizationVersion: "auth", status: "LEASED" } });
    const pendingEvidence = await db.syncSliceEvidence.create({ data: { accountId: account.id,
      channelConnectionId: channel.id, runId: syncRun.id, sliceId: pendingSlice.id,
      rawSourceRecordId: raw.id, normalizationRunId: pendingNorm.id } });
    for (const invalid of [
      { normalizationRunId: pendingNorm.id, normalizationRevision: 100, syncSliceEvidenceId: pendingEvidence.id },
      { normalizationRunId: failedNorm.id, normalizationRevision: 2, syncSliceEvidenceId: failedEvidence.id },
    ]) {
      await assert.rejects(directOrder(invalid));
      await assert.rejects(directItem(invalid));
      assert.throws(() => rawClone("NormalizedOrderRevision", first.revision.id, invalid), /D2A requires successful/);
      assert.throws(() => rawClone("NormalizedOrderItemRevision", itemFirst.revision.id, invalid), /D2A requires successful/);
    }
    await directOrder();
    await directItem();
    for (const status of ["PENDING", "FAILED"]) {
      assert.throws(() => sqlite.prepare('UPDATE NormalizationRun SET status = ? WHERE id = ?').run(status, norm.id),
        /Successful NormalizationRun is immutable/);
    }
    const beforeTransition = await db.normalizedOrderItemRevision.count();
    await assert.rejects(db.$transaction(async tx => {
      await tx.normalizationRun.update({ where: { id: pendingNorm.id }, data: { status: "SUCCEEDED" } });
      await d2a.recordNormalizedOrderItemRevisionTx(tx, tenant, { ...itemBase, normalizationRunId: pendingNorm.id,
        normalizationRevision: 100, syncSliceEvidenceId: pendingEvidence.id, operationKey: "db-tx-rollback" });
      throw new Error("rollback transition and item");
    }), /rollback transition and item/);
    assert.equal(await db.normalizedOrderItemRevision.count(), beforeTransition);
    assert.equal((await db.normalizationRun.findUniqueOrThrow({ where: { id: pendingNorm.id } })).status, "PENDING");

    // Exact relational scope, including valid none/A and both invalid directions plus A -> B.
    const scopeEvidence = { rawSourceRecordId: scopedRaw.id, normalizationRunId: scopedNorm.id, syncSliceEvidenceId: scopedEvidence.id };
    await directOrder({ ...scopeEvidence, orderId: scoped.order.id });
    const scopedItemIdentity = await db.normalizedOrderItem.create({ data: { accountId: account.id,
      channelConnectionId: channel.id, orderId: scoped.order.id, sourceItemKey: "id:db-scoped" } });
    const noMapping = { skuId: null, channelListingId: null, mappingDecisionId: null,
      sourceListingEntityType: null, sourceListingKey: null };
    await directItem({ ...scopeEvidence, ...noMapping, itemId: scopedItemIdentity.id, marketplaceScopeKey: marketplace.id });
    const orderB = await db.normalizedOrder.create({ data: { accountId: account.id, channelConnectionId: channel.id,
      marketplaceId: marketplaceB.id, marketplaceScopeKey: marketplaceB.id, sourceSystem: "SHOPIFY", sourceOrderKey: "order-1" } });
    const itemB = await db.normalizedOrderItem.create({ data: { accountId: account.id,
      channelConnectionId: channel.id, orderId: orderB.id, sourceItemKey: "id:db-b" } });
    for (const invalid of [{ orderId: scoped.order.id }, scopeEvidence, { ...scopeEvidence, orderId: orderB.id }]) {
      await assert.rejects(directOrder(invalid));
      assert.throws(() => rawClone("NormalizedOrderRevision", first.revision.id, invalid), /D2A requires successful/);
    }
    for (const invalid of [
      { itemId: scopedItemIdentity.id, marketplaceScopeKey: marketplace.id },
      scopeEvidence, { ...scopeEvidence, itemId: itemB.id, marketplaceScopeKey: marketplaceB.id },
    ]) {
      await assert.rejects(directItem({ ...noMapping, ...invalid }));
      assert.throws(() => rawClone("NormalizedOrderItemRevision", unmappedItem.revision.id, invalid), /D2A requires successful/);
    }
    for (const invalid of [
      { rawSourceRecordId: rawTwo.id }, { normalizationRunId: normTwo.id },
      { syncSliceEvidenceId: evidenceTwo.id }, { syncSliceEvidenceId: otherEvidence.id },
      { accountId: otherAccount.id }, { channelConnectionId: channelTwo.id },
    ]) {
      await assert.rejects(directOrder(invalid));
      await assert.rejects(directItem(invalid));
    }
    // Individually real run/slice IDs cannot manufacture a new coherent evidence row.
    const sameChannelWrongRun = await db.syncRun.create({ data: { accountId: account.id,
      channelConnectionId: channel.id, stream: "orders", authorizationVersion: "auth", mappingVersionId: mapping.id } });
    const sameChannelWrongSlice = await db.syncSlice.create({ data: { accountId: account.id,
      channelConnectionId: channel.id, runId: sameChannelWrongRun.id, stream: "orders",
      marketplaceScopeKey: "@none", sliceKey: "wrong-run-empty", authorizationVersion: "auth", status: "LEASED" } });
    // Empty slice avoids a UNIQUE collision masking the run/raw and slice/run FK failures.
    for (const runId of [sameChannelWrongRun.id, syncRun.id]) {
      await assert.rejects(db.syncSliceEvidence.create({ data: { accountId: account.id, channelConnectionId: channel.id,
        sliceId: sameChannelWrongSlice.id, runId, rawSourceRecordId: raw.id, normalizationRunId: norm.id } }));
    }
    await assert.rejects(db.syncSliceEvidence.create({ data: { accountId: account.id, channelConnectionId: channel.id,
      sliceId: pendingSlice.id, runId: syncRunOther.id, rawSourceRecordId: raw.id, normalizationRunId: norm.id } }));
    await assert.rejects(db.syncSliceEvidence.create({ data: { accountId: account.id, channelConnectionId: channel.id,
      sliceId: sliceOther.id, runId: syncRun.id, rawSourceRecordId: raw.id, normalizationRunId: norm.id } }));
    await assert.rejects(db.syncSliceEvidence.create({ data: { accountId: account.id, channelConnectionId: channel.id,
      sliceId: pendingSlice.id, runId: syncRun.id, rawSourceRecordId: rawTwo.id, normalizationRunId: norm.id } }));
    assert.throws(() => sqlite.prepare('UPDATE SyncSlice SET marketplaceScopeKey = ?, marketplaceId = ? WHERE id = ?')
      .run(marketplace.id, marketplace.id, slice.id), /Cited sync slice/);
    await db.syncSlice.update({ where: { id: slice.id }, data: { status: "PREPARED" } });
    await db.syncSlice.update({ where: { id: slice.id }, data: { status: "SUCCEEDED", leaseOwner: null, leaseExpiresAt: null } });

    // The exact NULL escape from the audit and every mapping semantic field.
    for (const [field, value] of Object.entries({
      activatedAt: null, platform: "AMAZON", sourceContract: "changed", sourceVersion: "changed",
      mapperSemanticVersion: "changed", formulaCompatibilityVersion: "changed", checksum: "changed",
    })) {
      assert.throws(() => sqlite.prepare(`UPDATE MappingVersion SET "${field}" = ? WHERE id = ?`).run(value, mapping.id),
        /Activated MappingVersion semantics are immutable/);
    }
    assert.throws(() => sqlite.prepare("UPDATE MappingVersion SET activatedAt = '2099-01-01' WHERE id = ?").run(mapping.id),
      /Activated MappingVersion semantics are immutable/);
    await assert.rejects(db.mappingVersion.update({ where: { id: mapping.id }, data: { activatedAt: null } }));
    await db.mappingVersion.update({ where: { id: mapping.id }, data: { deactivatedAt: new Date() } });
    await db.mappingVersion.update({ where: { id: mapping.id }, data: { deactivatedAt: null } });
    assert.equal((await db.mappingVersion.findUniqueOrThrow({ where: { id: mapping.id } })).checksum, "m1");
    await assert.rejects(directOrder({ mappingVersionId: wrongMapping.id }));
    await assert.rejects(directItem({ mappingVersionId: wrongMapping.id }));
    const unactivated = await db.mappingVersion.create({ data: { platform: "SHOPIFY", sourceContract: "db-unactivated",
      sourceVersion: "1", mapperSemanticVersion: "1", formulaCompatibilityVersion: "legacy", checksum: "u" } });
    const unactivatedNorm = await db.normalizationRun.create({ data: { accountId: account.id, channelConnectionId: channel.id,
      rawSourceRecordId: raw.id, mappingVersionId: unactivated.id, parserVersion: "1", normalizationRevision: 1, status: "SUCCEEDED" } });
    const unactivatedSlice = await db.syncSlice.create({ data: { accountId: account.id, channelConnectionId: channel.id,
      runId: syncRun.id, stream: "orders", marketplaceScopeKey: "@none", sliceKey: "unactivated", authorizationVersion: "auth", status: "LEASED" } });
    const unactivatedEvidence = await db.syncSliceEvidence.create({ data: { accountId: account.id, channelConnectionId: channel.id,
      runId: syncRun.id, sliceId: unactivatedSlice.id, rawSourceRecordId: raw.id, normalizationRunId: unactivatedNorm.id } });
    const unactivatedInput = { mappingVersionId: unactivated.id, normalizationRunId: unactivatedNorm.id,
      syncSliceEvidenceId: unactivatedEvidence.id };
    await assert.rejects(directOrder(unactivatedInput));
    await assert.rejects(directItem(unactivatedInput));

    // SKU ownership is insufficient: bypass every part of approval, listing and source identity.
    const alternateSku = await db.sku.create({ data: { accountId: account.id, sellerSku: "EXPLICIT" } });
    for (const invalid of [
      { ...noMapping, skuId: sku.id },
      { mappingDecisionId: null },
      { channelListingId: null, sourceListingEntityType: null, sourceListingKey: null },
      { mappingDecisionId: rejectedDecision.id }, { mappingDecisionId: pendingDecision.id },
      { mappingDecisionId: supersededDecision.id },
      { skuId: alternateSku.id }, { sourceListingKey: "not-v1" }, { sourceListingEntityType: null },
      { channelListingId: unmappedListing.id, sourceListingKey: "v-unmapped" },
      { channelListingId: wrongListing.id, mappingDecisionId: wrongChannelDecision.id, sourceListingKey: "v2" },
      { channelListingId: scopedListing.id, mappingDecisionId: wrongScopeDecision.id, sourceListingKey: "v3" },
      { channelListingId: otherAccountListing.id, mappingDecisionId: otherAccountDecision.id, skuId: wrongSku.id, sourceListingKey: "v4" },
    ]) {
      await assert.rejects(directItem(invalid));
      assert.throws(() => rawClone("NormalizedOrderItemRevision", itemFirst.revision.id, invalid), /D2A requires exact current/);
    }
    await directItem();
    await directItem(noMapping);
    // Mapping validation now follows historical replay lookup: a new identity still rolls back on rejection.
    await assert.rejects(itemWrite({ ...itemBase, sourceItemKey: "id:rejected-stable", mappingDecisionId: null }));
    assert.equal(await db.normalizedOrderItem.count({ where: { sourceItemKey: "id:rejected-stable" } }), 0);
    await db.productMappingCandidate.update({ where: { id: competingCandidate.id }, data: { state: "ACCEPTED" } });
    await assert.rejects(directItem());
    await db.productMappingCandidate.update({ where: { id: competingCandidate.id }, data: { state: "SUPERSEDED" } });
    const supersedingDecision = await db.productMappingDecision.create({ data: { accountId: account.id,
      candidateId: candidate.id, decision: "REJECT", actorRef: "correction", createdAt: new Date("2099-01-01") } });
    await assert.rejects(directItem());
    await assert.rejects(itemWrite({ ...itemBase, operationKey: "noncurrent" }));
    assert.equal((await itemWrite()).revision.id, itemFirst.revision.id); // Historical replay survives new decisions.
    await assert.rejects(db.productMappingDecision.update({ where: { id: supersedingDecision.id }, data: { decision: "ACCEPT" } }));

    // Lifecycle: unmapped -> approved A -> corrected B, with independently immutable history.
    const lifecycleBase = { ...itemBase, ...noMapping, sourceItemKey: "id:lifecycle", channelListingId: unmappedListing.id,
      sourceListingEntityType: "VARIANT", sourceListingKey: "v-unmapped", operationKey: "life-unmapped" };
    const lifeUnmapped = await itemWrite(lifecycleBase);
    const lifeCandidateA = await db.productMappingCandidate.create({ data: { accountId: account.id,
      listingId: unmappedListing.id, candidateSkuId: sku.id, ruleVersion: "life-A", confidence: 100, state: "ACCEPTED" } });
    const lifeDecisionA = await db.productMappingDecision.create({ data: { accountId: account.id,
      candidateId: lifeCandidateA.id, decision: "ACCEPT", actorRef: "approve-A" } });
    await db.channelListing.update({ where: { id: unmappedListing.id }, data: { skuId: sku.id } });
    const lifeAInput = { ...lifecycleBase, operationKey: "life-A", skuId: sku.id, mappingDecisionId: lifeDecisionA.id };
    const lifeA = await itemWrite(lifeAInput);
    await db.productMappingCandidate.update({ where: { id: lifeCandidateA.id }, data: { state: "SUPERSEDED" } });
    await db.channelListing.update({ where: { id: unmappedListing.id }, data: { skuId: alternateSku.id } });
    // Changing only the current pointer cannot authorize an insertion.
    await assert.rejects(directItem({ itemId: lifeA.item.id, channelListingId: unmappedListing.id,
      sourceListingKey: "v-unmapped", skuId: alternateSku.id, mappingDecisionId: lifeDecisionA.id }));
    const lifeCandidateB = await db.productMappingCandidate.create({ data: { accountId: account.id,
      listingId: unmappedListing.id, candidateSkuId: alternateSku.id, ruleVersion: "life-B", confidence: 100, state: "ACCEPTED" } });
    const lifeDecisionB = await db.productMappingDecision.create({ data: { accountId: account.id,
      candidateId: lifeCandidateB.id, decision: "ACCEPT", actorRef: "approve-B" } });
    const lifeB = await itemWrite({ ...lifecycleBase, operationKey: "life-B", skuId: alternateSku.id, mappingDecisionId: lifeDecisionB.id });
    assert.equal(lifeB.item.id, lifeA.item.id);
    assert.equal(lifeB.revision.revision, lifeA.revision.revision + 1);
    assert.equal((await itemWrite(lifeAInput)).revision.id, lifeA.revision.id);
    assert.equal((await itemWrite(lifecycleBase)).revision.id, lifeUnmapped.revision.id);
    await assert.rejects(itemWrite({ ...lifeAInput, quantityAtoms: 999n }));
    for (const [revisionId, expectedSku, expectedDecision] of [
      [lifeA.revision.id, sku.id, lifeDecisionA.id], [lifeB.revision.id, alternateSku.id, lifeDecisionB.id],
    ]) {
      const history = await db.normalizedOrderItemRevision.findUniqueOrThrow({ where: { id: revisionId },
        include: { mappingDecision: { include: { candidate: true } } } });
      assert.equal(history.skuId, expectedSku);
      assert.equal(history.mappingDecisionId, expectedDecision);
      assert.equal(history.mappingDecision?.decision, "ACCEPT");
      assert.equal(history.mappingDecision?.candidate.candidateSkuId, expectedSku);
      assert.equal(history.mappingDecision?.candidate.listingId, unmappedListing.id);
    }
    assert.equal((await db.normalizedOrderItemRevision.findUniqueOrThrow({ where: { id: lifeUnmapped.revision.id } })).skuId, null);
    for (const [field, value] of Object.entries({ accountId: otherAccount.id, listingId: listing.id,
      candidateSkuId: alternateSku.id, ruleVersion: "changed" })) {
      assert.throws(() => sqlite.prepare(`UPDATE ProductMappingCandidate SET "${field}" = ? WHERE id = ?`)
        .run(value, lifeCandidateA.id), /Cited mapping candidate semantics/);
    }
    assert.throws(() => sqlite.prepare("DELETE FROM ProductMappingCandidate WHERE id = ?").run(lifeCandidateA.id),
      /Cited mapping candidate cannot be deleted/);
    assert.throws(() => sqlite.prepare("UPDATE ProductMappingDecision SET decision = 'REJECT' WHERE id = ?").run(lifeDecisionA.id),
      /ProductMappingDecision is immutable/);
    assert.throws(() => sqlite.prepare("UPDATE NormalizedOrderItemRevision SET skuId = ? WHERE id = ?").run(alternateSku.id, lifeA.revision.id),
      /NormalizedOrderItemRevision is immutable/);
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
    console.log("D2A adversarial DB PASS: normalization, scope chain, activation NULL escape, approved mapping and A-to-B lifecycle");
    console.log("D2A integration PASS: full migration history, tenant/provenance, identities, revisions, replay, fixed quantity, rollback");
  } finally {
    await db.$disconnect();
  }
} finally {
  sqlite.close();
  rmSync(directory, { recursive: true, force: true });
}
