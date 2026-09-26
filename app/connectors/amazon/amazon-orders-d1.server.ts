import type { PrismaClient } from "@prisma/client";
import { attachSourceObservationToSliceTx, claimSyncSlice, completeSyncSliceTx, deterministicSliceKey,
  prepareSyncSlice, recordSourceObservationTx, releaseSyncSlice, storeRawSourceRecord } from "~/core/data-core-d1.server";
import { marketplaceScopeKey } from "~/core/data-core-contracts";
import type { VerifiedCoreTenant } from "~/core/data-core-d2a.server";
import type { CredentialEncryptionProvider } from "~/services/credential-encryption.server";
import { assertAmazonOrdersBoundary, listAmazonOrders, type AmazonOrderAcquisition,
  type AmazonOrderQuery } from "./amazon-orders.server";
import type { AmazonRetryHooks } from "./amazon-sp-api-client.server";
import type { AmazonApplicationConfig, AmazonHttpTransport } from "./amazon-types";

const SOURCE_VERSION = "2026-01-01";
const STREAM = "amazon-orders-v2026-01-01";
const PARSER_VERSION = "amazon-e1c-v2026-01-01";

export type RawSourceEncryptionBoundary = Readonly<{
  encryptChunk(plain: Uint8Array, chunkIndex: number): Uint8Array;
}>;
type SyncContext = Readonly<{
  runId: string; sliceId: string; authorizationVersion: string; mappingVersionId: string;
  expectedProcessedSliceId: string | null; alreadySucceeded: boolean;
}>;

async function establishSlice(db: PrismaClient, input: {
  tenant: VerifiedCoreTenant; marketplaceId: string; operationKey: string; mappingVersionId: string;
  leaseOwner: string; now: Date; leaseMs: number;
}): Promise<SyncContext> {
  if (!input.operationKey.trim()) throw new Error("Amazon E1-D operation key required");
  const [authorization, mapping, marketplace] = await Promise.all([
    db.coreChannelAuthorization.findUnique({ where: { channelConnectionId: input.tenant.channelConnectionId } }),
    db.mappingVersion.findUnique({ where: { id: input.mappingVersionId } }),
    db.marketplace.findUnique({ where: { id: input.marketplaceId } }),
  ]);
  if (!authorization || authorization.accountId !== input.tenant.accountId || !mapping || mapping.platform !== "AMAZON" ||
      mapping.sourceVersion !== SOURCE_VERSION || !mapping.activatedAt || mapping.deactivatedAt || !marketplace ||
      marketplace.accountId !== input.tenant.accountId || marketplace.channelConnectionId !== input.tenant.channelConnectionId)
    throw new Error("Amazon E1-D sync context invalid");
  const scope = marketplaceScopeKey(input.marketplaceId);
  const sliceKey = deterministicSliceKey(["AMAZON_E1D", input.operationKey, input.marketplaceId]);
  const existing = await db.syncSlice.findUnique({ where: { channelConnectionId_marketplaceScopeKey_stream_sliceKey: {
    channelConnectionId: input.tenant.channelConnectionId, marketplaceScopeKey: scope, stream: STREAM, sliceKey,
  } }, include: { run: true } });
  if (existing) {
    if (existing.accountId !== input.tenant.accountId || existing.marketplaceId !== input.marketplaceId ||
        existing.authorizationVersion !== authorization.authorizationVersion || existing.run.mappingVersionId !== mapping.id)
      throw new Error("Amazon E1-D operation identity collision");
    if (existing.status === "SUCCEEDED") return { runId: existing.runId, sliceId: existing.id,
      authorizationVersion: authorization.authorizationVersion, mappingVersionId: mapping.id,
      expectedProcessedSliceId: existing.id, alreadySucceeded: true };
    const checkpoint = await db.syncCheckpoint.findUnique({ where: { channelConnectionId_marketplaceScopeKey_stream: {
      channelConnectionId: input.tenant.channelConnectionId, marketplaceScopeKey: scope, stream: STREAM,
    } } });
    if (existing.run.status === "FAILED") await db.syncRun.update({ where: { id: existing.runId },
      data: { status: "RUNNING", finishedAt: null, startedAt: input.now } });
    const claimed = await claimSyncSlice(db, { ...input.tenant, sliceId: existing.id,
      authorizationVersion: authorization.authorizationVersion, leaseOwner: input.leaseOwner, now: input.now, leaseMs: input.leaseMs });
    if (!claimed) throw new Error("Amazon E1-D slice unavailable");
    return { runId: existing.runId, sliceId: existing.id, authorizationVersion: authorization.authorizationVersion,
      mappingVersionId: mapping.id, expectedProcessedSliceId: checkpoint?.processedSliceId ?? null, alreadySucceeded: false };
  }
  const created = await db.$transaction(async (tx) => {
    const checkpoint = await tx.syncCheckpoint.findUnique({ where: { channelConnectionId_marketplaceScopeKey_stream: {
      channelConnectionId: input.tenant.channelConnectionId, marketplaceScopeKey: scope, stream: STREAM,
    } } });
    const run = await tx.syncRun.create({ data: { ...input.tenant, stream: STREAM,
      authorizationVersion: authorization.authorizationVersion, mappingVersionId: mapping.id, status: "RUNNING",
      startedAt: input.now } });
    const slice = await tx.syncSlice.create({ data: { ...input.tenant, runId: run.id, marketplaceId: input.marketplaceId,
      marketplaceScopeKey: scope, stream: STREAM, sliceKey, authorizationVersion: authorization.authorizationVersion } });
    return { run, slice, expectedProcessedSliceId: checkpoint?.processedSliceId ?? null };
  });
  const claimed = await claimSyncSlice(db, { ...input.tenant, sliceId: created.slice.id,
    authorizationVersion: authorization.authorizationVersion, leaseOwner: input.leaseOwner, now: input.now, leaseMs: input.leaseMs });
  if (!claimed) throw new Error("Amazon E1-D slice claim failed");
  return { runId: created.run.id, sliceId: created.slice.id, authorizationVersion: authorization.authorizationVersion,
    mappingVersionId: mapping.id, expectedProcessedSliceId: created.expectedProcessedSliceId, alreadySucceeded: false };
}

async function normalizationForPage(db: PrismaClient, tenant: VerifiedCoreTenant, rawSourceRecordId: string,
  mappingVersionId: string, now: Date) {
  const existing = await db.normalizationRun.findFirst({ where: { rawSourceRecordId, mappingVersionId,
    parserVersion: PARSER_VERSION, status: "SUCCEEDED" }, orderBy: { normalizationRevision: "asc" } });
  if (existing) return existing;
  const latest = await db.normalizationRun.aggregate({ where: { rawSourceRecordId, mappingVersionId },
    _max: { normalizationRevision: true } });
  return db.normalizationRun.create({ data: { ...tenant, rawSourceRecordId, mappingVersionId,
    parserVersion: PARSER_VERSION, normalizationRevision: (latest._max.normalizationRevision ?? 0) + 1,
    status: "SUCCEEDED", finishedAt: now } });
}

export async function persistAmazonOrderAcquisitionToD1(input: {
  db: PrismaClient; tenant: VerifiedCoreTenant; externalMarketplaceId: string;
  acquisition: AmazonOrderAcquisition; context: SyncContext;
  leaseOwner: string; now: Date; rawEncryption: RawSourceEncryptionBoundary;
}) {
  if (!input.rawEncryption?.encryptChunk) throw new Error("Raw payload encryption required");
  const persisted: Array<{ rawSourceRecordId: string; sourceObservationId: string; evidenceId: string; pageNumber: number }> = [];
  for (const page of [...input.acquisition.evidencePages].sort((a, b) => a.pageNumber - b.pageNumber)) {
    const sourceEntityId = `${input.externalMarketplaceId}:searchOrders:page:${page.pageNumber}`;
    const raw = await storeRawSourceRecord(input.db, { ...input.tenant, sourceSystem: "AMAZON",
      sourceVersion: SOURCE_VERSION, sourceEntityType: "ORDERS_SEARCH_PAGE", sourceEntityId,
      sourceSnapshotVersion: `page-${page.pageNumber}`, schemaVersion: SOURCE_VERSION, retentionClass: "COMMERCE_SOURCE",
      capturedAt: input.now, ingestionRunId: input.context.runId, payload: page.body,
      encryptChunk: (plain, index) => input.rawEncryption.encryptChunk(plain, index) });
    const normalization = await normalizationForPage(input.db, input.tenant, raw.id, input.context.mappingVersionId, input.now);
    const attached = await input.db.$transaction(async (tx) => {
      const observation = await recordSourceObservationTx(tx, { ...input.tenant, runId: input.context.runId,
        sliceId: input.context.sliceId, rawSourceRecordId: raw.id, sourceSystem: "AMAZON",
        sourceEntityType: "ORDERS_SEARCH_PAGE", sourceEntityId, observedAt: input.now,
        authorizationVersion: input.context.authorizationVersion });
      const evidence = await attachSourceObservationToSliceTx(tx, { ...input.tenant, sliceId: input.context.sliceId,
        sourceObservationId: observation.id, normalizationRunId: normalization.id,
        leaseOwner: input.leaseOwner, now: input.now });
      await tx.sourceReference.upsert({ where: { rawSourceRecordId_sourceLeafPath_targetKind_targetKey: {
        rawSourceRecordId: raw.id, sourceLeafPath: "$", targetKind: "AMAZON_ORDERS_PAGE",
        targetKey: `${input.externalMarketplaceId}:${page.pageNumber}:${page.requestId ?? "NO_REQUEST_ID"}`,
      } }, create: { ...input.tenant, rawSourceRecordId: raw.id, sourceLeafPath: "$",
        targetKind: "AMAZON_ORDERS_PAGE", targetKey: `${input.externalMarketplaceId}:${page.pageNumber}:${page.requestId ?? "NO_REQUEST_ID"}` },
        update: {} });
      return { observation, evidence };
    });
    persisted.push({ rawSourceRecordId: raw.id, sourceObservationId: attached.observation.id,
      evidenceId: attached.evidence.id, pageNumber: page.pageNumber });
  }
  return persisted;
}

export async function ingestAmazonOrdersToD1(input: {
  db: PrismaClient; tenant: VerifiedCoreTenant; marketplaceId: string; operationKey: string;
  mappingVersionId: string; query: AmazonOrderQuery; config: AmazonApplicationConfig;
  transport: AmazonHttpTransport; credentialEncryptionProvider: CredentialEncryptionProvider;
  rawEncryption: RawSourceEncryptionBoundary; leaseOwner: string; now: Date; leaseMs?: number;
  retry?: AmazonRetryHooks;
}) {
  const externalMarketplaceId = await assertAmazonOrdersBoundary(input.db, input.tenant, input.marketplaceId);
  const context = await establishSlice(input.db, { tenant: input.tenant, marketplaceId: input.marketplaceId,
    operationKey: input.operationKey, mappingVersionId: input.mappingVersionId, leaseOwner: input.leaseOwner,
    now: input.now, leaseMs: input.leaseMs ?? 300_000 });
  if (context.alreadySucceeded) return { replayed: true, runId: context.runId, sliceId: context.sliceId,
    pages: await input.db.syncSliceEvidence.count({ where: { sliceId: context.sliceId } }) };
  try {
    const acquisition = await listAmazonOrders({ db: input.db, tenant: input.tenant,
      marketplaceId: input.marketplaceId, query: input.query, config: input.config, transport: input.transport,
      encryptionProvider: input.credentialEncryptionProvider, retry: input.retry });
    const persisted = await persistAmazonOrderAcquisitionToD1({ db: input.db, tenant: input.tenant,
      externalMarketplaceId, acquisition, context, leaseOwner: input.leaseOwner,
      now: input.now, rawEncryption: input.rawEncryption });
    await prepareSyncSlice(input.db, { ...input.tenant, sliceId: context.sliceId, leaseOwner: input.leaseOwner,
      authorizationVersion: context.authorizationVersion, now: input.now });
    await input.db.$transaction(async (tx) => {
      await completeSyncSliceTx(tx, { ...input.tenant, sliceId: context.sliceId, leaseOwner: input.leaseOwner,
        authorizationVersion: context.authorizationVersion, mappingVersionId: context.mappingVersionId,
        windowWatermark: input.query.before, cursorValue: input.query.after.toISOString(), now: input.now,
        expectedProcessedSliceId: context.expectedProcessedSliceId });
      await tx.syncRun.update({ where: { id: context.runId }, data: { status: "SUCCEEDED", finishedAt: input.now } });
    });
    return { replayed: false, runId: context.runId, sliceId: context.sliceId, pages: persisted.length };
  } catch (error) {
    await releaseSyncSlice(input.db, { sliceId: context.sliceId, leaseOwner: input.leaseOwner }).catch(() => undefined);
    await input.db.syncRun.updateMany({ where: { id: context.runId, status: "RUNNING" },
      data: { status: "FAILED", finishedAt: input.now } }).catch(() => undefined);
    throw error;
  }
}
