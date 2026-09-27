import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
  attachSourceObservationToSliceTx,
  claimSyncSlice,
  completeSyncSliceTx,
  deterministicSliceKey,
  prepareSyncSlice,
  recordSourceObservationTx,
  releaseSyncSlice,
  storeRawSourceRecord,
} from "~/core/data-core-d1.server";
import { marketplaceScopeKey } from "~/core/data-core-contracts";
import type { VerifiedCoreTenant } from "~/core/data-core-d2a.server";
import type { CredentialEncryptionProvider } from "~/services/credential-encryption.server";
import {
  listAmazonFinancialTransactions,
  type AmazonFinancesAcquisition,
  type AmazonFinancesQuery,
} from "./amazon-finances.server";
import {
  AMAZON_FINANCES_MAPPING_VERSION,
  mapAmazonFinancialTransactions,
  type AmazonCanonicalFinancialTransaction,
} from "./amazon-finances-mapper.server";
import { assertAmazonOrdersBoundary } from "./amazon-orders.server";
import type { RawSourceEncryptionBoundary } from "./amazon-orders-d1.server";
import type { AmazonRetryHooks } from "./amazon-sp-api-client.server";
import type { AmazonApplicationConfig, AmazonHttpTransport } from "./amazon-types";

export const AMAZON_FINANCES_SOURCE_VERSION = "2024-06-19";
export const AMAZON_FINANCES_STREAM = "amazon-finances-v2024-06-19";
const PARSER_VERSION = AMAZON_FINANCES_MAPPING_VERSION;
const SOURCE_ENTITY_TYPE = "FINANCES_LIST_TRANSACTIONS_PAGE";

export type AmazonFinancesSyncContext = Readonly<{
  runId: string;
  sliceId: string;
  authorizationVersion: string;
  mappingVersionId: string;
  expectedProcessedSliceId: string | null;
  alreadySucceeded: boolean;
}>;

export type AmazonFinancesD1Page = Readonly<{
  pageIndex: number;
  rawSourceRecordId: string;
  sourceObservationId: string;
  normalizationRunId: string;
  evidenceId: string;
  sourceEntityId: string;
  canonicalTransactions: readonly AmazonCanonicalFinancialTransaction[];
}>;

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function requestEvidence(query: AmazonFinancesQuery, externalMarketplaceId: string) {
  return JSON.stringify({
    apiVersion: AMAZON_FINANCES_SOURCE_VERSION,
    operation: "listTransactions",
    postedAfter: query.postedAfter?.toISOString() ?? null,
    postedBefore: query.postedBefore?.toISOString() ?? null,
    marketplaceId: query.includeMarketplaceFilter === false ? null : externalMarketplaceId,
    transactionStatus: query.transactionStatus ?? null,
    relatedIdentifierName: query.relatedIdentifier?.name ?? null,
    relatedIdentifierValue: query.relatedIdentifier?.value ?? null,
  });
}

export async function establishAmazonFinancesSlice(db: PrismaClient, input: {
  tenant: VerifiedCoreTenant;
  marketplaceId: string;
  operationKey: string;
  mappingVersionId: string;
  leaseOwner: string;
  now: Date;
  leaseMs: number;
}): Promise<AmazonFinancesSyncContext> {
  if (!input.operationKey.trim()) throw new Error("Amazon E2-D operation key required");
  const [authorization, mapping, marketplace] = await Promise.all([
    db.coreChannelAuthorization.findUnique({ where: { channelConnectionId: input.tenant.channelConnectionId } }),
    db.mappingVersion.findUnique({ where: { id: input.mappingVersionId } }),
    db.marketplace.findUnique({ where: { id: input.marketplaceId } }),
  ]);
  if (!authorization || authorization.accountId !== input.tenant.accountId ||
      !mapping || mapping.platform !== "AMAZON" || mapping.sourceVersion !== AMAZON_FINANCES_SOURCE_VERSION ||
      !mapping.activatedAt || mapping.deactivatedAt || !marketplace ||
      marketplace.accountId !== input.tenant.accountId ||
      marketplace.channelConnectionId !== input.tenant.channelConnectionId)
    throw new Error("Amazon E2-D sync context invalid");

  const scope = marketplaceScopeKey(input.marketplaceId);
  const sliceKey = deterministicSliceKey(["AMAZON_E2D_FINANCES", input.operationKey, input.marketplaceId]);
  const existing = await db.syncSlice.findUnique({
    where: { channelConnectionId_marketplaceScopeKey_stream_sliceKey: {
      channelConnectionId: input.tenant.channelConnectionId,
      marketplaceScopeKey: scope,
      stream: AMAZON_FINANCES_STREAM,
      sliceKey,
    } },
    include: { run: true },
  });
  if (existing) {
    if (existing.accountId !== input.tenant.accountId || existing.marketplaceId !== input.marketplaceId ||
        existing.authorizationVersion !== authorization.authorizationVersion ||
        existing.run.mappingVersionId !== mapping.id)
      throw new Error("Amazon E2-D operation identity collision");
    if (existing.status === "SUCCEEDED") return {
      runId: existing.runId,
      sliceId: existing.id,
      authorizationVersion: authorization.authorizationVersion,
      mappingVersionId: mapping.id,
      expectedProcessedSliceId: existing.id,
      alreadySucceeded: true,
    };
    const checkpoint = await db.syncCheckpoint.findUnique({
      where: { channelConnectionId_marketplaceScopeKey_stream: {
        channelConnectionId: input.tenant.channelConnectionId,
        marketplaceScopeKey: scope,
        stream: AMAZON_FINANCES_STREAM,
      } },
    });
    if (existing.run.status === "FAILED") await db.syncRun.update({
      where: { id: existing.runId },
      data: { status: "RUNNING", finishedAt: null, startedAt: input.now },
    });
    const claimed = await claimSyncSlice(db, { ...input.tenant, sliceId: existing.id,
      authorizationVersion: authorization.authorizationVersion, leaseOwner: input.leaseOwner,
      now: input.now, leaseMs: input.leaseMs });
    if (!claimed) throw new Error("Amazon E2-D slice unavailable");
    return { runId: existing.runId, sliceId: existing.id,
      authorizationVersion: authorization.authorizationVersion, mappingVersionId: mapping.id,
      expectedProcessedSliceId: checkpoint?.processedSliceId ?? null, alreadySucceeded: false };
  }

  const created = await db.$transaction(async (tx) => {
    const checkpoint = await tx.syncCheckpoint.findUnique({
      where: { channelConnectionId_marketplaceScopeKey_stream: {
        channelConnectionId: input.tenant.channelConnectionId,
        marketplaceScopeKey: scope,
        stream: AMAZON_FINANCES_STREAM,
      } },
    });
    const run = await tx.syncRun.create({ data: { ...input.tenant,
      stream: AMAZON_FINANCES_STREAM, authorizationVersion: authorization.authorizationVersion,
      mappingVersionId: mapping.id, status: "RUNNING", startedAt: input.now } });
    const slice = await tx.syncSlice.create({ data: { ...input.tenant, runId: run.id,
      marketplaceId: input.marketplaceId, marketplaceScopeKey: scope,
      stream: AMAZON_FINANCES_STREAM, sliceKey,
      authorizationVersion: authorization.authorizationVersion } });
    return { run, slice, expectedProcessedSliceId: checkpoint?.processedSliceId ?? null };
  });
  const claimed = await claimSyncSlice(db, { ...input.tenant, sliceId: created.slice.id,
    authorizationVersion: authorization.authorizationVersion, leaseOwner: input.leaseOwner,
    now: input.now, leaseMs: input.leaseMs });
  if (!claimed) throw new Error("Amazon E2-D slice claim failed");
  return { runId: created.run.id, sliceId: created.slice.id,
    authorizationVersion: authorization.authorizationVersion, mappingVersionId: mapping.id,
    expectedProcessedSliceId: created.expectedProcessedSliceId, alreadySucceeded: false };
}

async function pendingNormalization(db: PrismaClient, tenant: VerifiedCoreTenant,
  rawSourceRecordId: string, mappingVersionId: string) {
  const succeeded = await db.normalizationRun.findFirst({ where: { rawSourceRecordId,
    mappingVersionId, parserVersion: PARSER_VERSION, status: "SUCCEEDED" },
  orderBy: { normalizationRevision: "asc" } });
  if (succeeded) return { normalization: succeeded, alreadySucceeded: true };
  const latest = await db.normalizationRun.aggregate({ where: { rawSourceRecordId, mappingVersionId },
    _max: { normalizationRevision: true } });
  const normalization = await db.normalizationRun.create({ data: { ...tenant,
    rawSourceRecordId, mappingVersionId, parserVersion: PARSER_VERSION,
    normalizationRevision: (latest._max.normalizationRevision ?? 0) + 1,
    status: "PENDING" } });
  return { normalization, alreadySucceeded: false };
}

/** Raw-first D1 persistence followed by pure E2-C validation. No financial economics are written. */
export async function persistAmazonFinancesAcquisitionToD1(input: {
  db: PrismaClient;
  tenant: VerifiedCoreTenant;
  externalMarketplaceId: string;
  query: AmazonFinancesQuery;
  acquisition: AmazonFinancesAcquisition;
  context: AmazonFinancesSyncContext;
  leaseOwner: string;
  now: Date;
  rawEncryption: RawSourceEncryptionBoundary;
}): Promise<readonly AmazonFinancesD1Page[]> {
  if (!input.rawEncryption?.encryptChunk) throw new Error("Raw payload encryption required");
  const request = requestEvidence(input.query, input.externalMarketplaceId);
  const requestFingerprint = sha256(request);
  const staged: Array<{
    page: AmazonFinancesAcquisition["pages"][number];
    rawSourceRecordId: string;
    sourceObservationId: string;
    normalizationRunId: string;
    normalizationAlreadySucceeded: boolean;
    sourceEntityId: string;
  }> = [];

  for (const page of [...input.acquisition.pages].sort((left, right) => left.pageIndex - right.pageIndex)) {
    const sourceEntityId = `${input.externalMarketplaceId}:listTransactions:page:${page.pageIndex}`;
    const raw = await storeRawSourceRecord(input.db, { ...input.tenant,
      sourceSystem: "AMAZON", sourceVersion: AMAZON_FINANCES_SOURCE_VERSION,
      sourceEntityType: SOURCE_ENTITY_TYPE, sourceEntityId,
      sourceSnapshotVersion: `page-${page.pageIndex}`, schemaVersion: AMAZON_FINANCES_SOURCE_VERSION,
      retentionClass: "FINANCIAL_SOURCE", capturedAt: input.now,
      ingestionRunId: input.context.runId, payload: page.body,
      encryptChunk: (plain, index) => input.rawEncryption.encryptChunk(plain, index) });
    const pending = await pendingNormalization(input.db, input.tenant, raw.id, input.context.mappingVersionId);
    const observation = await input.db.$transaction((tx) => recordSourceObservationTx(tx, {
      ...input.tenant, runId: input.context.runId, sliceId: input.context.sliceId,
      rawSourceRecordId: raw.id, sourceSystem: "AMAZON", sourceEntityType: SOURCE_ENTITY_TYPE,
      sourceEntityId, observedAt: input.now,
      authorizationVersion: input.context.authorizationVersion,
    }));
    staged.push({ page, rawSourceRecordId: raw.id, sourceObservationId: observation.id,
      normalizationRunId: pending.normalization.id,
      normalizationAlreadySucceeded: pending.alreadySucceeded, sourceEntityId });
  }

  let canonical: readonly AmazonCanonicalFinancialTransaction[];
  try {
    canonical = mapAmazonFinancialTransactions(input.acquisition);
  } catch (error) {
    await input.db.normalizationRun.updateMany({
      where: { id: { in: staged.filter((entry) => !entry.normalizationAlreadySucceeded)
        .map((entry) => entry.normalizationRunId) }, status: "PENDING" },
      data: { status: "FAILED", safeErrorCode: "SOURCE_CONFLICT", finishedAt: input.now },
    });
    throw error;
  }

  const canonicalByTransaction = new Map(canonical.map((value) => [value.transactionId, value]));
  const persisted: AmazonFinancesD1Page[] = [];
  for (const entry of staged) {
    const pageTransactions = entry.page.transactions.map((transaction) => {
      const mapped = canonicalByTransaction.get(transaction.transactionId);
      if (!mapped) throw new Error("Amazon E2-D canonical transaction missing");
      return mapped;
    });
    const attached = await input.db.$transaction(async (tx) => {
      if (!entry.normalizationAlreadySucceeded) {
        const changed = await tx.normalizationRun.updateMany({
          where: { id: entry.normalizationRunId, accountId: input.tenant.accountId,
            channelConnectionId: input.tenant.channelConnectionId, status: "PENDING" },
          data: { status: "SUCCEEDED", safeErrorCode: null, finishedAt: input.now },
        });
        if (changed.count !== 1) throw new Error("Amazon E2-D normalization changed concurrently");
      }
      const evidence = await attachSourceObservationToSliceTx(tx, { ...input.tenant,
        sliceId: input.context.sliceId, sourceObservationId: entry.sourceObservationId,
        normalizationRunId: entry.normalizationRunId, leaseOwner: input.leaseOwner, now: input.now });
      await tx.sourceReference.upsert({
        where: { rawSourceRecordId_sourceLeafPath_targetKind_targetKey: {
          rawSourceRecordId: entry.rawSourceRecordId, sourceLeafPath: "$",
          targetKind: "AMAZON_FINANCES_PAGE",
          targetKey: `${requestFingerprint}:page:${entry.page.pageIndex}:next:${entry.page.nextToken ? "PRESENT" : "ABSENT"}:request:${entry.page.requestId ?? "ABSENT"}`,
        } },
        create: { ...input.tenant, rawSourceRecordId: entry.rawSourceRecordId,
          sourceLeafPath: "$", targetKind: "AMAZON_FINANCES_PAGE",
          targetKey: `${requestFingerprint}:page:${entry.page.pageIndex}:next:${entry.page.nextToken ? "PRESENT" : "ABSENT"}:request:${entry.page.requestId ?? "ABSENT"}` },
        update: {},
      });
      await tx.sourceReference.upsert({
        where: { rawSourceRecordId_sourceLeafPath_targetKind_targetKey: {
          rawSourceRecordId: entry.rawSourceRecordId, sourceLeafPath: "$.request",
          targetKind: "AMAZON_FINANCES_REQUEST", targetKey: request,
        } },
        create: { ...input.tenant, rawSourceRecordId: entry.rawSourceRecordId,
          sourceLeafPath: "$.request", targetKind: "AMAZON_FINANCES_REQUEST", targetKey: request },
        update: {},
      });
      for (let index = 0; index < entry.page.transactions.length; index += 1) {
        const transaction = entry.page.transactions[index];
        await tx.sourceReference.upsert({
          where: { rawSourceRecordId_sourceLeafPath_targetKind_targetKey: {
            rawSourceRecordId: entry.rawSourceRecordId,
            sourceLeafPath: `$.payload.transactions[${index}]`,
            targetKind: "AMAZON_FINANCES_TRANSACTION", targetKey: transaction.transactionId,
          } },
          create: { ...input.tenant, rawSourceRecordId: entry.rawSourceRecordId,
            sourceLeafPath: `$.payload.transactions[${index}]`,
            targetKind: "AMAZON_FINANCES_TRANSACTION", targetKey: transaction.transactionId },
          update: {},
        });
      }
      return evidence;
    });
    persisted.push({ pageIndex: entry.page.pageIndex,
      rawSourceRecordId: entry.rawSourceRecordId, sourceObservationId: entry.sourceObservationId,
      normalizationRunId: entry.normalizationRunId, evidenceId: attached.id,
      sourceEntityId: entry.sourceEntityId, canonicalTransactions: pageTransactions });
  }
  return persisted;
}

export async function ingestAmazonFinancesToD1(input: {
  db: PrismaClient;
  tenant: VerifiedCoreTenant;
  marketplaceId: string;
  operationKey: string;
  mappingVersionId: string;
  query: AmazonFinancesQuery;
  config: AmazonApplicationConfig;
  transport: AmazonHttpTransport;
  credentialEncryptionProvider: CredentialEncryptionProvider;
  rawEncryption: RawSourceEncryptionBoundary;
  leaseOwner: string;
  now: Date;
  leaseMs?: number;
  retry?: AmazonRetryHooks;
}) {
  const externalMarketplaceId = await assertAmazonOrdersBoundary(input.db, input.tenant, input.marketplaceId);
  const context = await establishAmazonFinancesSlice(input.db, {
    tenant: input.tenant, marketplaceId: input.marketplaceId,
    operationKey: input.operationKey, mappingVersionId: input.mappingVersionId,
    leaseOwner: input.leaseOwner, now: input.now, leaseMs: input.leaseMs ?? 300_000,
  });
  if (context.alreadySucceeded) return { replayed: true, runId: context.runId,
    sliceId: context.sliceId,
    pages: await input.db.syncSliceEvidence.count({ where: { sliceId: context.sliceId } }),
    evidence: [] as readonly AmazonFinancesD1Page[] };
  try {
    const acquisition = await listAmazonFinancialTransactions({ db: input.db, tenant: input.tenant,
      marketplaceId: input.marketplaceId, query: input.query, config: input.config,
      transport: input.transport, encryptionProvider: input.credentialEncryptionProvider,
      retry: input.retry });
    const persisted = await persistAmazonFinancesAcquisitionToD1({ db: input.db,
      tenant: input.tenant, externalMarketplaceId, query: input.query, acquisition, context,
      leaseOwner: input.leaseOwner, now: input.now, rawEncryption: input.rawEncryption });
    await prepareSyncSlice(input.db, { ...input.tenant, sliceId: context.sliceId,
      leaseOwner: input.leaseOwner, authorizationVersion: context.authorizationVersion, now: input.now });
    const request = requestEvidence(input.query, externalMarketplaceId);
    await input.db.$transaction(async (tx) => {
      await completeSyncSliceTx(tx, { ...input.tenant, sliceId: context.sliceId,
        leaseOwner: input.leaseOwner, authorizationVersion: context.authorizationVersion,
        mappingVersionId: context.mappingVersionId,
        cursorValue: sha256(request), windowWatermark: input.query.postedBefore,
        now: input.now, expectedProcessedSliceId: context.expectedProcessedSliceId });
      await tx.syncRun.update({ where: { id: context.runId },
        data: { status: "SUCCEEDED", finishedAt: input.now } });
    });
    return { replayed: false, runId: context.runId, sliceId: context.sliceId,
      pages: persisted.length, evidence: persisted };
  } catch (error) {
    await releaseSyncSlice(input.db, { sliceId: context.sliceId,
      leaseOwner: input.leaseOwner }).catch(() => undefined);
    await input.db.syncRun.updateMany({ where: { id: context.runId, status: "RUNNING" },
      data: { status: "FAILED", finishedAt: input.now } }).catch(() => undefined);
    throw error;
  }
}
