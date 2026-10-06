import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { attachSourceObservationToSliceTx, claimSyncSlice, completeSyncSliceWithoutCheckpointTx,
  deterministicSliceKey, prepareSyncSlice, recordSourceObservationTx, releaseSyncSlice }
  from "~/core/data-core-d1.server";
import { recordNormalizedOrderItemRevisionTx, recordNormalizedOrderRevisionTx,
  type VerifiedCoreTenant } from "~/core/data-core-d2a.server";
import { mapEbayOrder, type EbayCanonicalOrder } from "./ebay-order-mapper.server";
import { assertEbayOrdersBoundary } from "./ebay-orders.server";

const SOURCE_VERSION = "sell-fulfillment-v1";
const PARSER_VERSION = "ebay-eb2b-v1";
const STREAM = "orders";
const decoder = new TextDecoder("utf-8", { fatal: true });

export type EbayRawSourceDecryptionBoundary = Readonly<{
  decryptChunk(encrypted: Uint8Array, chunkIndex: number): Uint8Array;
}>;

function operation(parts: readonly string[]) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

async function establishNormalizationSlice(db: PrismaClient, input: {
  tenant: VerifiedCoreTenant;
  marketplaceId: string;
  sourceSliceId: string;
  operationKey: string;
  mappingVersionId: string;
  leaseOwner: string;
  now: Date;
  leaseMs: number;
}) {
  const boundary = await assertEbayOrdersBoundary(db, input.tenant, input.marketplaceId);
  const [sourceSlice, mapping, marketplace] = await Promise.all([
    db.syncSlice.findUnique({ where: { id: input.sourceSliceId }, include: { run: true } }),
    db.mappingVersion.findUnique({ where: { id: input.mappingVersionId } }),
    db.marketplace.findUnique({ where: { id: input.marketplaceId } }),
  ]);
  if (!sourceSlice || sourceSlice.status !== "SUCCEEDED" || sourceSlice.run.status !== "SUCCEEDED" ||
      sourceSlice.accountId !== input.tenant.accountId ||
      sourceSlice.channelConnectionId !== input.tenant.channelConnectionId ||
      sourceSlice.marketplaceId !== input.marketplaceId || sourceSlice.stream !== STREAM ||
      sourceSlice.authorizationVersion !== boundary.authorizationVersion ||
      !mapping || mapping.platform !== "EBAY" || mapping.sourceVersion !== SOURCE_VERSION ||
      !mapping.activatedAt || mapping.deactivatedAt || !marketplace || marketplace.status !== "ACTIVE" ||
      marketplace.accountId !== input.tenant.accountId ||
      marketplace.channelConnectionId !== input.tenant.channelConnectionId)
    throw new Error("eBay EB2-B source context invalid");
  const sliceKey = deterministicSliceKey(["EBAY_EB2B", input.operationKey, input.marketplaceId, input.sourceSliceId]);
  const identity = { channelConnectionId: input.tenant.channelConnectionId,
    marketplaceScopeKey: input.marketplaceId, stream: STREAM, sliceKey };
  const existing = await db.syncSlice.findUnique({ where: {
    channelConnectionId_marketplaceScopeKey_stream_sliceKey: identity }, include: { run: true } });
  if (existing) {
    if (existing.accountId !== input.tenant.accountId ||
        existing.authorizationVersion !== boundary.authorizationVersion || existing.run.mappingVersionId !== mapping.id)
      throw new Error("eBay EB2-B operation identity collision");
    if (existing.status === "SUCCEEDED") return { runId: existing.runId, sliceId: existing.id,
      authorizationVersion: boundary.authorizationVersion, mappingVersionId: mapping.id,
      expectedProcessedSliceId: existing.id, alreadySucceeded: true };
    const checkpoint = await db.syncCheckpoint.findUnique({ where: {
      channelConnectionId_marketplaceScopeKey_stream: { channelConnectionId: input.tenant.channelConnectionId,
        marketplaceScopeKey: input.marketplaceId, stream: STREAM } } });
    if (existing.run.status === "FAILED") await db.syncRun.update({ where: { id: existing.runId },
      data: { status: "RUNNING", finishedAt: null, startedAt: input.now } });
    const claimed = await claimSyncSlice(db, { ...input.tenant, sliceId: existing.id,
      authorizationVersion: boundary.authorizationVersion, leaseOwner: input.leaseOwner,
      now: input.now, leaseMs: input.leaseMs });
    if (!claimed) throw new Error("eBay EB2-B slice unavailable");
    return { runId: existing.runId, sliceId: existing.id,
      authorizationVersion: boundary.authorizationVersion, mappingVersionId: mapping.id,
      expectedProcessedSliceId: checkpoint?.processedSliceId ?? null, alreadySucceeded: false };
  }
  const created = await db.$transaction(async (tx) => {
    const checkpoint = await tx.syncCheckpoint.findUnique({ where: {
      channelConnectionId_marketplaceScopeKey_stream: { channelConnectionId: input.tenant.channelConnectionId,
        marketplaceScopeKey: input.marketplaceId, stream: STREAM } } });
    const run = await tx.syncRun.create({ data: { ...input.tenant, stream: STREAM,
      authorizationVersion: boundary.authorizationVersion, mappingVersionId: mapping.id,
      status: "RUNNING", startedAt: input.now } });
    const slice = await tx.syncSlice.create({ data: { ...input.tenant, runId: run.id,
      marketplaceId: input.marketplaceId, marketplaceScopeKey: input.marketplaceId,
      stream: STREAM, sliceKey, authorizationVersion: boundary.authorizationVersion } });
    return { run, slice, expectedProcessedSliceId: checkpoint?.processedSliceId ?? null };
  });
  const claimed = await claimSyncSlice(db, { ...input.tenant, sliceId: created.slice.id,
    authorizationVersion: boundary.authorizationVersion, leaseOwner: input.leaseOwner,
    now: input.now, leaseMs: input.leaseMs });
  if (!claimed) throw new Error("eBay EB2-B slice claim failed");
  return { runId: created.run.id, sliceId: created.slice.id,
    authorizationVersion: boundary.authorizationVersion, mappingVersionId: mapping.id,
    expectedProcessedSliceId: created.expectedProcessedSliceId, alreadySucceeded: false };
}

async function decryptRaw(db: PrismaClient, rawSourceRecordId: string,
decryption: EbayRawSourceDecryptionBoundary) {
  const chunks = await db.rawSourceBlobChunk.findMany({ where: { rawSourceRecordId },
    orderBy: { chunkIndex: "asc" } });
  if (!chunks.length) throw new Error("eBay EB2-B raw evidence unavailable");
  return Buffer.concat(chunks.map((chunk) => Buffer.from(decryption.decryptChunk(
    new Uint8Array(chunk.encryptedBytes), chunk.chunkIndex))));
}

function orderFromPage(bytes: Uint8Array, expectedOrderId: string) {
  let value: unknown;
  try { value = JSON.parse(decoder.decode(bytes)); } catch { throw new Error("eBay EB2-B raw JSON invalid"); }
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      !Array.isArray((value as { orders?: unknown }).orders)) throw new Error("eBay EB2-B raw page invalid");
  const matches = (value as { orders: unknown[] }).orders.filter((entry) => entry && typeof entry === "object" &&
    !Array.isArray(entry) && (entry as { orderId?: unknown }).orderId === expectedOrderId);
  if (matches.length !== 1) throw new Error("eBay EB2-B exact order evidence invalid");
  return mapEbayOrder(matches[0]);
}

async function createNormalizationEvidence(input: {
  db: PrismaClient;
  tenant: VerifiedCoreTenant;
  context: Awaited<ReturnType<typeof establishNormalizationSlice>>;
  rawSourceRecordId: string;
  sourceOrderKey: string;
  leaseOwner: string;
  now: Date;
}) {
  const existing = await input.db.syncSliceEvidence.findUnique({ where: {
    sliceId_rawSourceRecordId: { sliceId: input.context.sliceId,
      rawSourceRecordId: input.rawSourceRecordId } }, include: { normalizationRun: true } });
  if (existing) {
    if (existing.accountId !== input.tenant.accountId ||
        existing.channelConnectionId !== input.tenant.channelConnectionId ||
        existing.normalizationRun.mappingVersionId !== input.context.mappingVersionId ||
        existing.normalizationRun.parserVersion !== PARSER_VERSION ||
        existing.normalizationRun.status !== "SUCCEEDED")
      throw new Error("eBay EB2-B immutable normalization evidence mismatch");
    return { normalization: existing.normalizationRun, evidence: existing };
  }
  const latest = await input.db.normalizationRun.aggregate({ where: {
    rawSourceRecordId: input.rawSourceRecordId, mappingVersionId: input.context.mappingVersionId },
  _max: { normalizationRevision: true } });
  const normalization = await input.db.normalizationRun.create({ data: { ...input.tenant,
    rawSourceRecordId: input.rawSourceRecordId, mappingVersionId: input.context.mappingVersionId,
    parserVersion: PARSER_VERSION, normalizationRevision: (latest._max.normalizationRevision ?? 0) + 1,
    status: "SUCCEEDED", finishedAt: input.now } });
  return input.db.$transaction(async (tx) => {
    const observation = await recordSourceObservationTx(tx, { ...input.tenant,
      runId: input.context.runId, sliceId: input.context.sliceId,
      rawSourceRecordId: input.rawSourceRecordId, sourceSystem: "EBAY", sourceEntityType: "ORDER",
      sourceEntityId: input.sourceOrderKey, observedAt: input.now,
      authorizationVersion: input.context.authorizationVersion });
    const evidence = await attachSourceObservationToSliceTx(tx, { ...input.tenant,
      sliceId: input.context.sliceId, sourceObservationId: observation.id,
      normalizationRunId: normalization.id, leaseOwner: input.leaseOwner, now: input.now });
    return { normalization, evidence };
  });
}

export async function normalizeEbayOrdersFromD1(input: {
  db: PrismaClient;
  tenant: VerifiedCoreTenant;
  marketplaceId: string;
  sourceSliceId: string;
  operationKey: string;
  mappingVersionId: string;
  rawDecryption: EbayRawSourceDecryptionBoundary;
  leaseOwner: string;
  now: Date;
  leaseMs?: number;
}) {
  if (!input.rawDecryption?.decryptChunk) throw new Error("Raw payload decryption required");
  const context = await establishNormalizationSlice(input.db, { tenant: input.tenant,
    marketplaceId: input.marketplaceId, sourceSliceId: input.sourceSliceId,
    operationKey: input.operationKey, mappingVersionId: input.mappingVersionId,
    leaseOwner: input.leaseOwner, now: input.now, leaseMs: input.leaseMs ?? 300_000 });
  if (context.alreadySucceeded) return { replayed: true, runId: context.runId, sliceId: context.sliceId,
    orderCount: await input.db.normalizedOrderRevision.count({ where: {
      syncSliceEvidence: { sliceId: context.sliceId } } }),
    itemCount: await input.db.normalizedOrderItemRevision.count({ where: {
      syncSliceEvidence: { sliceId: context.sliceId } } }) };
  try {
    const sourceEvidence = await input.db.syncSliceEvidence.findMany({ where: {
      sliceId: input.sourceSliceId, rawSourceRecord: { sourceSystem: "EBAY",
        sourceVersion: SOURCE_VERSION, sourceEntityType: "ORDER" } },
    include: { rawSourceRecord: true }, orderBy: { rawSourceRecord: { sourceEntityId: "asc" } } });
    if (!sourceEvidence.length) throw new Error("eBay EB2-B has no trusted order evidence");
    const mapped: Array<{ order: EbayCanonicalOrder; rawSourceRecordId: string }> = [];
    const seen = new Set<string>();
    for (const source of sourceEvidence) {
      const bytes = await decryptRaw(input.db, source.rawSourceRecordId, input.rawDecryption);
      if (bytes.byteLength !== source.rawSourceRecord.payloadByteLength)
        throw new Error("eBay EB2-B raw evidence length mismatch");
      const order = orderFromPage(bytes, source.rawSourceRecord.sourceEntityId);
      if (seen.has(order.externalOrderId)) throw new Error("eBay EB2-B duplicate order evidence");
      seen.add(order.externalOrderId);
      mapped.push({ order, rawSourceRecordId: source.rawSourceRecordId });
    }
    const prepared: Array<typeof mapped[number] & { normalizationRunId: string;
      normalizationRevision: number; syncSliceEvidenceId: string }> = [];
    for (const entry of mapped) {
      const provenance = await createNormalizationEvidence({ db: input.db, tenant: input.tenant,
        context, rawSourceRecordId: entry.rawSourceRecordId,
        sourceOrderKey: entry.order.externalOrderId, leaseOwner: input.leaseOwner, now: input.now });
      prepared.push({ ...entry, normalizationRunId: provenance.normalization.id,
        normalizationRevision: provenance.normalization.normalizationRevision,
        syncSliceEvidenceId: provenance.evidence.id });
    }
    await prepareSyncSlice(input.db, { ...input.tenant, sliceId: context.sliceId,
      leaseOwner: input.leaseOwner, authorizationVersion: context.authorizationVersion, now: input.now });
    let orderCount = 0; let itemCount = 0;
    await input.db.$transaction(async (tx) => {
      for (const entry of prepared) {
        const provenance = { rawSourceRecordId: entry.rawSourceRecordId,
          normalizationRunId: entry.normalizationRunId, mappingVersionId: context.mappingVersionId,
          normalizationRevision: entry.normalizationRevision,
          syncSliceEvidenceId: entry.syncSliceEvidenceId };
        const orderOperation = operation([entry.rawSourceRecordId, context.mappingVersionId, "ORDER"]);
        const existingOrder = await tx.normalizedOrder.findUnique({ where: {
          channelConnectionId_marketplaceScopeKey_sourceSystem_sourceOrderKey: {
            channelConnectionId: input.tenant.channelConnectionId, marketplaceScopeKey: input.marketplaceId,
            sourceSystem: "EBAY", sourceOrderKey: entry.order.externalOrderId } } });
        const existingOrderRevision = existingOrder ? await tx.normalizedOrderRevision.findUnique({ where: {
          orderId_operationKey: { orderId: existingOrder.id, operationKey: orderOperation } } }) : null;
        const orderResult = existingOrder && existingOrderRevision
          ? { order: existingOrder, revision: existingOrderRevision, replay: true }
          : await recordNormalizedOrderRevisionTx(tx, input.tenant, { ...provenance,
            marketplaceId: input.marketplaceId, sourceSystem: "EBAY",
            sourceOrderKey: entry.order.externalOrderId, operationKey: orderOperation,
            normalizedStatus: entry.order.normalizedStatus, sourceStatus: entry.order.sourceStatus,
            occurredAt: entry.order.creationDate, postedAt: entry.order.lastModifiedDate ?? null });
        orderCount += orderResult.replay ? 0 : 1;
        for (const item of entry.order.items) {
          const listingKey = item.legacyItemId ? `legacy-item:${item.legacyItemId}` :
            `line-item:${item.externalOrderItemId}`;
          const listing = await tx.channelListing.upsert({ where: {
            channelConnectionId_marketplaceScopeKey_sourceEntityType_externalVariantOrListingId: {
              channelConnectionId: input.tenant.channelConnectionId,
              marketplaceScopeKey: input.marketplaceId, sourceEntityType: "EBAY_LISTING",
              externalVariantOrListingId: listingKey } }, create: { ...input.tenant,
            marketplaceId: input.marketplaceId, marketplaceScopeKey: input.marketplaceId,
            sourceEntityType: "EBAY_LISTING", externalProductId: item.legacyItemId ?? null,
            externalVariantOrListingId: listingKey,
            metadataJson: JSON.stringify({ legacyItemId: item.legacyItemId ?? null,
              sku: item.sku ?? null, title: item.title ?? null }) }, update: {} });
          const sourceItemKey = `id:${item.externalOrderItemId}`;
          const itemOperation = operation([entry.rawSourceRecordId, context.mappingVersionId,
            "ITEM", item.externalOrderItemId]);
          const existingItem = await tx.normalizedOrderItem.findUnique({ where: {
            orderId_sourceItemKey: { orderId: orderResult.order.id, sourceItemKey } } });
          const existingItemRevision = existingItem ? await tx.normalizedOrderItemRevision.findUnique({ where: {
            itemId_operationKey: { itemId: existingItem.id, operationKey: itemOperation } } }) : null;
          const itemResult = existingItem && existingItemRevision
            ? { item: existingItem, revision: existingItemRevision, replay: true }
            : await recordNormalizedOrderItemRevisionTx(tx, input.tenant, { ...provenance,
              orderId: orderResult.order.id, sourceItemKey, operationKey: itemOperation,
              quantityAtoms: BigInt(item.quantity), quantityScale: 0,
              sourceState: item.sourceState ?? null, channelListingId: listing.id,
              sourceListingEntityType: listing.sourceEntityType,
              sourceListingKey: listing.externalVariantOrListingId,
              occurredAt: entry.order.creationDate, postedAt: entry.order.lastModifiedDate ?? null });
          itemCount += itemResult.replay ? 0 : 1;
        }
      }
      await completeSyncSliceWithoutCheckpointTx(tx, { ...input.tenant, sliceId: context.sliceId,
        leaseOwner: input.leaseOwner, authorizationVersion: context.authorizationVersion,
        mappingVersionId: context.mappingVersionId, now: input.now });
      await tx.syncRun.update({ where: { id: context.runId },
        data: { status: "SUCCEEDED", finishedAt: input.now } });
    });
    return { replayed: false, runId: context.runId, sliceId: context.sliceId, orderCount, itemCount };
  } catch (error) {
    await releaseSyncSlice(input.db, { sliceId: context.sliceId, leaseOwner: input.leaseOwner }).catch(() => undefined);
    await input.db.syncRun.updateMany({ where: { id: context.runId, status: "RUNNING" },
      data: { status: "FAILED", finishedAt: input.now } }).catch(() => undefined);
    throw error;
  }
}
