import type { PrismaClient } from "@prisma/client";
import { attachSourceObservationToSliceTx, claimSyncSlice, completeSyncSliceTx, deterministicSliceKey,
  prepareSyncSlice, recordSourceObservationTx, releaseSyncSlice, storeRawSourceRecord }
  from "~/core/data-core-d1.server";
import { marketplaceScopeKey } from "~/core/data-core-contracts";
import type { VerifiedCoreTenant } from "~/core/data-core-d2a.server";
import type { CredentialEncryptionProvider } from "~/services/credential-encryption.server";
import type { EbaySigningKeyProvider } from "./ebay-http-signature.server";
import { assertEbayOrdersBoundary, listEbayOrderPages, type EbayOrderEvidencePage, type EbayOrderQuery }
  from "./ebay-orders.server";
import type { EbayApplicationConfig, EbayHttpTransport } from "./ebay-types";

const SOURCE_VERSION = "sell-fulfillment-v1";
const STREAM = "orders";
const PARSER_VERSION = "ebay-eb2a-sell-fulfillment-v1";

export type EbayRawSourceEncryptionBoundary = Readonly<{
  encryptChunk(plain: Uint8Array, chunkIndex: number): Uint8Array;
}>;
export type EbayOrdersSyncContext = Readonly<{
  runId: string;
  sliceId: string;
  authorizationVersion: string;
  mappingVersionId: string;
  expectedProcessedSliceId: string | null;
  alreadySucceeded: boolean;
}>;

export async function establishEbayOrdersSlice(db: PrismaClient, input: {
  tenant: VerifiedCoreTenant;
  marketplaceId: string;
  operationKey: string;
  mappingVersionId: string;
  leaseOwner: string;
  now: Date;
  leaseMs: number;
}): Promise<EbayOrdersSyncContext> {
  if (!input.operationKey.trim()) throw new Error("eBay EB2-A operation key required");
  const boundary = await assertEbayOrdersBoundary(db, input.tenant, input.marketplaceId);
  const [mapping, marketplace] = await Promise.all([
    db.mappingVersion.findUnique({ where: { id: input.mappingVersionId } }),
    db.marketplace.findUnique({ where: { id: input.marketplaceId } }),
  ]);
  if (!mapping || mapping.platform !== "EBAY" || mapping.sourceVersion !== SOURCE_VERSION ||
      !mapping.activatedAt || mapping.deactivatedAt || !marketplace || marketplace.accountId !== input.tenant.accountId ||
      marketplace.channelConnectionId !== input.tenant.channelConnectionId)
    throw new Error("eBay EB2-A sync context invalid");
  const scope = marketplaceScopeKey(input.marketplaceId);
  const sliceKey = deterministicSliceKey(["EBAY_EB2A", input.operationKey, input.marketplaceId]);
  const existing = await db.syncSlice.findUnique({ where: {
    channelConnectionId_marketplaceScopeKey_stream_sliceKey: { channelConnectionId: input.tenant.channelConnectionId,
      marketplaceScopeKey: scope, stream: STREAM, sliceKey } }, include: { run: true } });
  if (existing) {
    if (existing.accountId !== input.tenant.accountId || existing.marketplaceId !== input.marketplaceId ||
        existing.authorizationVersion !== boundary.authorizationVersion || existing.run.mappingVersionId !== mapping.id)
      throw new Error("eBay EB2-A operation identity collision");
    if (existing.status === "SUCCEEDED") return { runId: existing.runId, sliceId: existing.id,
      authorizationVersion: boundary.authorizationVersion, mappingVersionId: mapping.id,
      expectedProcessedSliceId: existing.id, alreadySucceeded: true };
    const checkpoint = await db.syncCheckpoint.findUnique({ where: {
      channelConnectionId_marketplaceScopeKey_stream: { channelConnectionId: input.tenant.channelConnectionId,
        marketplaceScopeKey: scope, stream: STREAM } } });
    if (existing.run.status === "FAILED") await db.syncRun.update({ where: { id: existing.runId },
      data: { status: "RUNNING", finishedAt: null, startedAt: input.now } });
    const claimed = await claimSyncSlice(db, { ...input.tenant, sliceId: existing.id,
      authorizationVersion: boundary.authorizationVersion, leaseOwner: input.leaseOwner,
      now: input.now, leaseMs: input.leaseMs });
    if (!claimed) throw new Error("eBay EB2-A slice unavailable");
    return { runId: existing.runId, sliceId: existing.id, authorizationVersion: boundary.authorizationVersion,
      mappingVersionId: mapping.id, expectedProcessedSliceId: checkpoint?.processedSliceId ?? null,
      alreadySucceeded: false };
  }
  const created = await db.$transaction(async (tx) => {
    const checkpoint = await tx.syncCheckpoint.findUnique({ where: {
      channelConnectionId_marketplaceScopeKey_stream: { channelConnectionId: input.tenant.channelConnectionId,
        marketplaceScopeKey: scope, stream: STREAM } } });
    const run = await tx.syncRun.create({ data: { ...input.tenant, stream: STREAM,
      authorizationVersion: boundary.authorizationVersion, mappingVersionId: mapping.id,
      status: "RUNNING", startedAt: input.now } });
    const slice = await tx.syncSlice.create({ data: { ...input.tenant, runId: run.id,
      marketplaceId: input.marketplaceId, marketplaceScopeKey: scope, stream: STREAM, sliceKey,
      authorizationVersion: boundary.authorizationVersion } });
    return { run, slice, expectedProcessedSliceId: checkpoint?.processedSliceId ?? null };
  });
  const claimed = await claimSyncSlice(db, { ...input.tenant, sliceId: created.slice.id,
    authorizationVersion: boundary.authorizationVersion, leaseOwner: input.leaseOwner,
    now: input.now, leaseMs: input.leaseMs });
  if (!claimed) throw new Error("eBay EB2-A slice claim failed");
  return { runId: created.run.id, sliceId: created.slice.id,
    authorizationVersion: boundary.authorizationVersion, mappingVersionId: mapping.id,
    expectedProcessedSliceId: created.expectedProcessedSliceId, alreadySucceeded: false };
}

async function normalizationForPage(db: PrismaClient, tenant: VerifiedCoreTenant,
rawSourceRecordId: string, mappingVersionId: string, now: Date) {
  const existing = await db.normalizationRun.findFirst({ where: { rawSourceRecordId, mappingVersionId,
    parserVersion: PARSER_VERSION, status: "SUCCEEDED" }, orderBy: { normalizationRevision: "asc" } });
  if (existing) return existing;
  const latest = await db.normalizationRun.aggregate({ where: { rawSourceRecordId, mappingVersionId },
    _max: { normalizationRevision: true } });
  return db.normalizationRun.create({ data: { ...tenant, rawSourceRecordId, mappingVersionId,
    parserVersion: PARSER_VERSION, normalizationRevision: (latest._max.normalizationRevision ?? 0) + 1,
    status: "SUCCEEDED", finishedAt: now } });
}

async function persistPage(input: {
  db: PrismaClient;
  tenant: VerifiedCoreTenant;
  marketplaceId: string;
  externalMarketplaceId: string;
  query: EbayOrderQuery;
  page: EbayOrderEvidencePage;
  context: EbayOrdersSyncContext;
  leaseOwner: string;
  now: Date;
  rawEncryption: EbayRawSourceEncryptionBoundary;
}) {
  const window = `${input.query.createdAfter.toISOString()}..${input.query.createdBefore.toISOString()}`;
  const offset = new URL(input.page.requestUrl).searchParams.get("offset");
  if (offset === null || !/^\d+$/.test(offset)) throw new Error("eBay EB2-A page provenance invalid");
  const sourceEntityId = `${input.externalMarketplaceId}:getOrders:${window}:offset:${offset}:page:${input.page.pageNumber}`;
  const raw = await storeRawSourceRecord(input.db, { ...input.tenant, sourceSystem: "EBAY",
    sourceVersion: SOURCE_VERSION, sourceEntityType: "FULFILLMENT_ORDERS_PAGE", sourceEntityId,
    sourceSnapshotVersion: `page-${input.page.pageNumber}`, schemaVersion: SOURCE_VERSION,
    retentionClass: "COMMERCE_SOURCE", capturedAt: input.now, ingestionRunId: input.context.runId,
    payload: input.page.body, encryptChunk: (plain, index) => input.rawEncryption.encryptChunk(plain, index) });
  const normalization = await normalizationForPage(input.db, input.tenant, raw.id,
    input.context.mappingVersionId, input.now);
  const pageAttached = await input.db.$transaction(async (tx) => {
    const observation = await recordSourceObservationTx(tx, { ...input.tenant, runId: input.context.runId,
      sliceId: input.context.sliceId, rawSourceRecordId: raw.id, sourceSystem: "EBAY",
      sourceEntityType: "FULFILLMENT_ORDERS_PAGE", sourceEntityId, observedAt: input.now,
      authorizationVersion: input.context.authorizationVersion });
    const evidence = await attachSourceObservationToSliceTx(tx, { ...input.tenant,
      sliceId: input.context.sliceId, sourceObservationId: observation.id,
      normalizationRunId: normalization.id, leaseOwner: input.leaseOwner, now: input.now });
    await tx.sourceReference.upsert({ where: {
      rawSourceRecordId_sourceLeafPath_targetKind_targetKey: { rawSourceRecordId: raw.id,
        sourceLeafPath: "$", targetKind: "EBAY_FULFILLMENT_ORDERS_PAGE",
        targetKey: `${input.externalMarketplaceId}:offset:${offset}:page:${input.page.pageNumber}:${input.page.requestId ?? "NO_REQUEST_ID"}` } },
    create: { ...input.tenant, rawSourceRecordId: raw.id, sourceLeafPath: "$",
      targetKind: "EBAY_FULFILLMENT_ORDERS_PAGE",
      targetKey: `${input.externalMarketplaceId}:offset:${offset}:page:${input.page.pageNumber}:${input.page.requestId ?? "NO_REQUEST_ID"}` },
    update: {} });
    return { raw, observation, evidence };
  });
  for (const orderId of input.page.orderIds) {
    const orderRaw = await storeRawSourceRecord(input.db, { ...input.tenant, sourceSystem: "EBAY",
      sourceVersion: SOURCE_VERSION, sourceEntityType: "ORDER", sourceEntityId: orderId,
      sourceSnapshotVersion: `page-${input.page.pageNumber}`, schemaVersion: SOURCE_VERSION,
      retentionClass: "COMMERCE_SOURCE", capturedAt: input.now, ingestionRunId: input.context.runId,
      payload: input.page.body, encryptChunk: (plain, index) => input.rawEncryption.encryptChunk(plain, index) });
    const orderNormalization = await normalizationForPage(input.db, input.tenant, orderRaw.id,
      input.context.mappingVersionId, input.now);
    await input.db.$transaction(async (tx) => {
      const observation = await recordSourceObservationTx(tx, { ...input.tenant, runId: input.context.runId,
        sliceId: input.context.sliceId, rawSourceRecordId: orderRaw.id, sourceSystem: "EBAY",
        sourceEntityType: "ORDER", sourceEntityId: orderId, observedAt: input.now,
        authorizationVersion: input.context.authorizationVersion });
      await attachSourceObservationToSliceTx(tx, { ...input.tenant, sliceId: input.context.sliceId,
        sourceObservationId: observation.id, normalizationRunId: orderNormalization.id,
        leaseOwner: input.leaseOwner, now: input.now });
    });
  }
  return pageAttached;
}

export async function ingestEbayOrdersToD1(input: {
  db: PrismaClient;
  tenant: VerifiedCoreTenant;
  marketplaceId: string;
  operationKey: string;
  mappingVersionId: string;
  query: EbayOrderQuery;
  config: EbayApplicationConfig;
  transport: EbayHttpTransport;
  credentialEncryptionProvider: CredentialEncryptionProvider;
  signingKeyProvider?: EbaySigningKeyProvider;
  rawEncryption: EbayRawSourceEncryptionBoundary;
  leaseOwner: string;
  now: Date;
  leaseMs?: number;
  clock?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}) {
  if (!input.rawEncryption?.encryptChunk) throw new Error("Raw payload encryption required");
  const boundary = await assertEbayOrdersBoundary(input.db, input.tenant, input.marketplaceId);
  const context = await establishEbayOrdersSlice(input.db, { tenant: input.tenant,
    marketplaceId: input.marketplaceId, operationKey: input.operationKey,
    mappingVersionId: input.mappingVersionId, leaseOwner: input.leaseOwner,
    now: input.now, leaseMs: input.leaseMs ?? 300_000 });
  if (context.alreadySucceeded) return { replayed: true, runId: context.runId, sliceId: context.sliceId,
    pages: await input.db.syncSliceEvidence.count({ where: { sliceId: context.sliceId,
      rawSourceRecord: { sourceEntityType: "FULFILLMENT_ORDERS_PAGE" } } }) };
  try {
    for await (const page of listEbayOrderPages({ db: input.db, tenant: input.tenant,
      marketplaceId: input.marketplaceId, query: input.query, config: input.config,
      transport: input.transport, credentialEncryptionProvider: input.credentialEncryptionProvider,
      signingKeyProvider: input.signingKeyProvider, expectedAuthorizationVersion: context.authorizationVersion,
      now: input.clock, sleep: input.sleep }))
      await persistPage({ db: input.db, tenant: input.tenant, marketplaceId: input.marketplaceId,
        externalMarketplaceId: boundary.externalMarketplaceId, query: input.query, page, context,
        leaseOwner: input.leaseOwner, now: input.now, rawEncryption: input.rawEncryption });
    await prepareSyncSlice(input.db, { ...input.tenant, sliceId: context.sliceId,
      leaseOwner: input.leaseOwner, authorizationVersion: context.authorizationVersion, now: input.now });
    await input.db.$transaction(async (tx) => {
      await completeSyncSliceTx(tx, { ...input.tenant, sliceId: context.sliceId,
        leaseOwner: input.leaseOwner, authorizationVersion: context.authorizationVersion,
        mappingVersionId: context.mappingVersionId, windowWatermark: input.query.createdBefore,
        cursorValue: input.query.createdAfter.toISOString(), now: input.now,
        expectedProcessedSliceId: context.expectedProcessedSliceId });
      await tx.syncRun.update({ where: { id: context.runId },
        data: { status: "SUCCEEDED", finishedAt: input.now } });
    });
    return { replayed: false, runId: context.runId, sliceId: context.sliceId,
      pages: await input.db.syncSliceEvidence.count({ where: { sliceId: context.sliceId,
        rawSourceRecord: { sourceEntityType: "FULFILLMENT_ORDERS_PAGE" } } }) };
  } catch (error) {
    await releaseSyncSlice(input.db, { sliceId: context.sliceId, leaseOwner: input.leaseOwner }).catch(() => undefined);
    await input.db.syncRun.updateMany({ where: { id: context.runId, status: "RUNNING" },
      data: { status: "FAILED", finishedAt: input.now } }).catch(() => undefined);
    throw error;
  }
}
