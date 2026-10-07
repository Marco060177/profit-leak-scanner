import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { attachSourceObservationToSliceTx, claimSyncSlice, completeSyncSliceTx, deterministicSliceKey,
  prepareSyncSlice, recordSourceObservationTx, releaseSyncSlice, storeRawSourceRecord }
  from "~/core/data-core-d1.server";
import { marketplaceScopeKey } from "~/core/data-core-contracts";
import type { VerifiedCoreTenant } from "~/core/data-core-d2a.server";
import type { CredentialEncryptionProvider } from "~/services/credential-encryption.server";
import { assertEbayFinancesBoundary, listEbayFinancesPages,
  type EbayFinancesEvidencePage, type EbayFinancesQuery } from "./ebay-finances.server";
import type { EbaySigningKeyProvider } from "./ebay-http-signature.server";
import type { EbayRawSourceEncryptionBoundary } from "./ebay-orders-d1.server";
import type { EbayApplicationConfig, EbayHttpTransport } from "./ebay-types";

export const EBAY_FINANCES_SOURCE_VERSION = "sell-finances-v1";
export const EBAY_FINANCES_STREAM = "ebay-finances-v1";
const PARSER_VERSION = "ebay-eb3a-sell-finances-v1";
const SOURCE_ENTITY_TYPE = "FINANCES_TRANSACTIONS_PAGE";

function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }
function requestEvidence(query: EbayFinancesQuery, externalMarketplaceId: string) {
  return JSON.stringify({ operation: "getTransactions", sourceVersion: EBAY_FINANCES_SOURCE_VERSION,
    marketplace: externalMarketplaceId, transactionDateFrom: query.transactionDateFrom.toISOString(),
    transactionDateTo: query.transactionDateTo.toISOString(), pageSize: query.pageSize ?? 200 });
}

async function establishSlice(db: PrismaClient, input: {
  tenant: VerifiedCoreTenant; marketplaceId: string; operationKey: string; mappingVersionId: string;
  query: EbayFinancesQuery; leaseOwner: string; now: Date; leaseMs: number;
}) {
  if (!input.operationKey.trim()) throw new Error("eBay EB3-A operation key required");
  const boundary = await assertEbayFinancesBoundary(db, input.tenant, input.marketplaceId);
  const mapping = await db.mappingVersion.findUnique({ where: { id: input.mappingVersionId } });
  if (!mapping || mapping.platform !== "EBAY" || mapping.sourceVersion !== EBAY_FINANCES_SOURCE_VERSION ||
      !mapping.activatedAt || mapping.deactivatedAt) throw new Error("eBay EB3-A mapping invalid");
  const scope = marketplaceScopeKey(input.marketplaceId);
  const requestFingerprint = sha256(requestEvidence(input.query, boundary.externalMarketplaceId));
  const sliceKey = deterministicSliceKey([
    "EBAY_EB3A", input.operationKey, input.marketplaceId, requestFingerprint,
  ]);
  const existing = await db.syncSlice.findUnique({ where: {
    channelConnectionId_marketplaceScopeKey_stream_sliceKey: { channelConnectionId: input.tenant.channelConnectionId,
      marketplaceScopeKey: scope, stream: EBAY_FINANCES_STREAM, sliceKey } }, include: { run: true } });
  if (existing) {
    if (existing.accountId !== input.tenant.accountId || existing.marketplaceId !== input.marketplaceId ||
        existing.authorizationVersion !== boundary.authorizationVersion || existing.run.mappingVersionId !== mapping.id)
      throw new Error("eBay EB3-A operation identity collision");
    if (existing.status === "SUCCEEDED") return { runId: existing.runId, sliceId: existing.id,
      authorizationVersion: boundary.authorizationVersion, mappingVersionId: mapping.id,
      expectedProcessedSliceId: existing.id, alreadySucceeded: true };
    const checkpoint = await db.syncCheckpoint.findUnique({ where: {
      channelConnectionId_marketplaceScopeKey_stream: { channelConnectionId: input.tenant.channelConnectionId,
        marketplaceScopeKey: scope, stream: EBAY_FINANCES_STREAM } } });
    if (existing.run.status === "FAILED") await db.syncRun.update({ where: { id: existing.runId },
      data: { status: "RUNNING", finishedAt: null, startedAt: input.now } });
    const claimed = await claimSyncSlice(db, { ...input.tenant, sliceId: existing.id,
      authorizationVersion: boundary.authorizationVersion, leaseOwner: input.leaseOwner,
      now: input.now, leaseMs: input.leaseMs });
    if (!claimed) throw new Error("eBay EB3-A slice unavailable");
    return { runId: existing.runId, sliceId: existing.id,
      authorizationVersion: boundary.authorizationVersion, mappingVersionId: mapping.id,
      expectedProcessedSliceId: checkpoint?.processedSliceId ?? null, alreadySucceeded: false };
  }
  const created = await db.$transaction(async (tx) => {
    const checkpoint = await tx.syncCheckpoint.findUnique({ where: {
      channelConnectionId_marketplaceScopeKey_stream: { channelConnectionId: input.tenant.channelConnectionId,
        marketplaceScopeKey: scope, stream: EBAY_FINANCES_STREAM } } });
    const run = await tx.syncRun.create({ data: { ...input.tenant, stream: EBAY_FINANCES_STREAM,
      authorizationVersion: boundary.authorizationVersion, mappingVersionId: mapping.id,
      status: "RUNNING", startedAt: input.now } });
    const slice = await tx.syncSlice.create({ data: { ...input.tenant, runId: run.id,
      marketplaceId: input.marketplaceId, marketplaceScopeKey: scope, stream: EBAY_FINANCES_STREAM,
      sliceKey, authorizationVersion: boundary.authorizationVersion } });
    return { run, slice, expectedProcessedSliceId: checkpoint?.processedSliceId ?? null };
  });
  const claimed = await claimSyncSlice(db, { ...input.tenant, sliceId: created.slice.id,
    authorizationVersion: boundary.authorizationVersion, leaseOwner: input.leaseOwner,
    now: input.now, leaseMs: input.leaseMs });
  if (!claimed) throw new Error("eBay EB3-A slice claim failed");
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
  db: PrismaClient; tenant: VerifiedCoreTenant; externalMarketplaceId: string;
  query: EbayFinancesQuery; page: EbayFinancesEvidencePage;
  context: Awaited<ReturnType<typeof establishSlice>>; leaseOwner: string; now: Date;
  rawEncryption: EbayRawSourceEncryptionBoundary;
}) {
  const request = requestEvidence(input.query, input.externalMarketplaceId);
  const fingerprint = sha256(request);
  const offset = new URL(input.page.requestUrl).searchParams.get("offset");
  if (offset === null || !/^\d+$/.test(offset)) throw new Error("eBay EB3-A page provenance invalid");
  const sourceEntityId = `${input.externalMarketplaceId}:getTransactions:${fingerprint}:offset:${offset}:page:${input.page.pageNumber}`;
  const raw = await storeRawSourceRecord(input.db, { ...input.tenant, sourceSystem: "EBAY",
    sourceVersion: EBAY_FINANCES_SOURCE_VERSION, sourceEntityType: SOURCE_ENTITY_TYPE, sourceEntityId,
    sourceSnapshotVersion: `page-${input.page.pageNumber}`, schemaVersion: EBAY_FINANCES_SOURCE_VERSION,
    retentionClass: "FINANCIAL_SOURCE", capturedAt: input.now, ingestionRunId: input.context.runId,
    payload: input.page.body, encryptChunk: (plain, index) => input.rawEncryption.encryptChunk(plain, index) });
  const normalization = await normalizationForPage(input.db, input.tenant, raw.id,
    input.context.mappingVersionId, input.now);
  return input.db.$transaction(async (tx) => {
    const observation = await recordSourceObservationTx(tx, { ...input.tenant,
      runId: input.context.runId, sliceId: input.context.sliceId, rawSourceRecordId: raw.id,
      sourceSystem: "EBAY", sourceEntityType: SOURCE_ENTITY_TYPE, sourceEntityId,
      observedAt: input.now, authorizationVersion: input.context.authorizationVersion });
    const evidence = await attachSourceObservationToSliceTx(tx, { ...input.tenant,
      sliceId: input.context.sliceId, sourceObservationId: observation.id,
      normalizationRunId: normalization.id, leaseOwner: input.leaseOwner, now: input.now });
    await tx.sourceReference.upsert({ where: {
      rawSourceRecordId_sourceLeafPath_targetKind_targetKey: { rawSourceRecordId: raw.id,
        sourceLeafPath: "$", targetKind: "EBAY_FINANCES_PAGE",
        targetKey: `${input.externalMarketplaceId}:offset:${offset}:page:${input.page.pageNumber}:request:${input.page.requestId ?? "ABSENT"}` } },
    create: { ...input.tenant, rawSourceRecordId: raw.id, sourceLeafPath: "$",
      targetKind: "EBAY_FINANCES_PAGE",
      targetKey: `${input.externalMarketplaceId}:offset:${offset}:page:${input.page.pageNumber}:request:${input.page.requestId ?? "ABSENT"}` },
    update: {} });
    await tx.sourceReference.upsert({ where: {
      rawSourceRecordId_sourceLeafPath_targetKind_targetKey: { rawSourceRecordId: raw.id,
        sourceLeafPath: "$.request", targetKind: "EBAY_FINANCES_REQUEST", targetKey: request } },
    create: { ...input.tenant, rawSourceRecordId: raw.id, sourceLeafPath: "$.request",
      targetKind: "EBAY_FINANCES_REQUEST", targetKey: request }, update: {} });
    for (let index = 0; index < input.page.transactions.length; index += 1) {
      const transaction = input.page.transactions[index];
      await tx.sourceReference.upsert({ where: {
        rawSourceRecordId_sourceLeafPath_targetKind_targetKey: { rawSourceRecordId: raw.id,
          sourceLeafPath: `$.transactions[${index}]`, targetKind: "EBAY_FINANCES_TRANSACTION",
          targetKey: transaction.transactionId } }, create: { ...input.tenant,
        rawSourceRecordId: raw.id, sourceLeafPath: `$.transactions[${index}]`,
        targetKind: "EBAY_FINANCES_TRANSACTION", targetKey: transaction.transactionId }, update: {} });
      if (transaction.orderId) await tx.sourceReference.upsert({ where: {
        rawSourceRecordId_sourceLeafPath_targetKind_targetKey: { rawSourceRecordId: raw.id,
          sourceLeafPath: `$.transactions[${index}].orderId`, targetKind: "EBAY_ORDER_ID",
          targetKey: transaction.orderId } }, create: { ...input.tenant, rawSourceRecordId: raw.id,
        sourceLeafPath: `$.transactions[${index}].orderId`, targetKind: "EBAY_ORDER_ID",
        targetKey: transaction.orderId }, update: {} });
      for (let itemIndex = 0; itemIndex < transaction.orderLineItemIds.length; itemIndex += 1)
        await tx.sourceReference.upsert({ where: {
          rawSourceRecordId_sourceLeafPath_targetKind_targetKey: { rawSourceRecordId: raw.id,
            sourceLeafPath: `$.transactions[${index}].orderLineItems[${itemIndex}].lineItemId`,
            targetKind: "EBAY_ORDER_LINE_ITEM_ID", targetKey: transaction.orderLineItemIds[itemIndex] } },
        create: { ...input.tenant, rawSourceRecordId: raw.id,
          sourceLeafPath: `$.transactions[${index}].orderLineItems[${itemIndex}].lineItemId`,
          targetKind: "EBAY_ORDER_LINE_ITEM_ID", targetKey: transaction.orderLineItemIds[itemIndex] }, update: {} });
    }
    return { raw, observation, evidence };
  });
}

export async function ingestEbayFinancesToD1(input: {
  db: PrismaClient; tenant: VerifiedCoreTenant; marketplaceId: string; operationKey: string;
  mappingVersionId: string; query: EbayFinancesQuery; config: EbayApplicationConfig;
  transport: EbayHttpTransport; credentialEncryptionProvider: CredentialEncryptionProvider;
  signingKeyProvider?: EbaySigningKeyProvider; rawEncryption: EbayRawSourceEncryptionBoundary;
  leaseOwner: string; now: Date; leaseMs?: number; clock?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}) {
  if (!input.rawEncryption?.encryptChunk) throw new Error("Raw payload encryption required");
  if (!input.signingKeyProvider) throw new Error("eBay Finances signing material required");
  const boundary = await assertEbayFinancesBoundary(input.db, input.tenant, input.marketplaceId);
  const context = await establishSlice(input.db, { tenant: input.tenant,
    marketplaceId: input.marketplaceId, operationKey: input.operationKey,
    mappingVersionId: input.mappingVersionId, query: input.query, leaseOwner: input.leaseOwner,
    now: input.now, leaseMs: input.leaseMs ?? 300_000 });
  if (context.alreadySucceeded) return { replayed: true, runId: context.runId,
    sliceId: context.sliceId, pages: await input.db.syncSliceEvidence.count({ where: { sliceId: context.sliceId } }) };
  try {
    for await (const page of listEbayFinancesPages({ db: input.db, tenant: input.tenant,
      marketplaceId: input.marketplaceId, query: input.query, config: input.config,
      transport: input.transport, credentialEncryptionProvider: input.credentialEncryptionProvider,
      signingKeyProvider: input.signingKeyProvider, expectedAuthorizationVersion: context.authorizationVersion,
      now: input.clock, sleep: input.sleep }))
      await persistPage({ db: input.db, tenant: input.tenant,
        externalMarketplaceId: boundary.externalMarketplaceId, query: input.query, page, context,
        leaseOwner: input.leaseOwner, now: input.now, rawEncryption: input.rawEncryption });
    await prepareSyncSlice(input.db, { ...input.tenant, sliceId: context.sliceId,
      leaseOwner: input.leaseOwner, authorizationVersion: context.authorizationVersion, now: input.now });
    const request = requestEvidence(input.query, boundary.externalMarketplaceId);
    await input.db.$transaction(async (tx) => {
      await completeSyncSliceTx(tx, { ...input.tenant, sliceId: context.sliceId,
        leaseOwner: input.leaseOwner, authorizationVersion: context.authorizationVersion,
        mappingVersionId: context.mappingVersionId, cursorValue: sha256(request),
        windowWatermark: input.query.transactionDateTo, now: input.now,
        expectedProcessedSliceId: context.expectedProcessedSliceId });
      await tx.syncRun.update({ where: { id: context.runId },
        data: { status: "SUCCEEDED", finishedAt: input.now } });
    });
    return { replayed: false, runId: context.runId, sliceId: context.sliceId,
      pages: await input.db.syncSliceEvidence.count({ where: { sliceId: context.sliceId } }) };
  } catch (error) {
    await releaseSyncSlice(input.db, { sliceId: context.sliceId, leaseOwner: input.leaseOwner }).catch(() => undefined);
    await input.db.syncRun.updateMany({ where: { id: context.runId, status: "RUNNING" },
      data: { status: "FAILED", finishedAt: input.now } }).catch(() => undefined);
    throw error;
  }
}
