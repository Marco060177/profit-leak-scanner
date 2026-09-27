import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { marketplaceScopeKey } from "~/core/data-core-contracts";
import { releaseSyncSlice } from "~/core/data-core-d1.server";
import type { VerifiedCoreTenant } from "~/core/data-core-d2a.server";
import type { CredentialEncryptionProvider } from "~/services/credential-encryption.server";
import { ingestAmazonFinancesToD1, AMAZON_FINANCES_STREAM } from "./amazon-finances-d1.server";
import { ingestAmazonFinancesD1ToD2B, type RawSourceDecryptionBoundary } from "./amazon-finances-d2b.server";
import type { AmazonFinancesQuery } from "./amazon-finances.server";
import type { RawSourceEncryptionBoundary } from "./amazon-orders-d1.server";
import type { AmazonRetryHooks } from "./amazon-sp-api-client.server";
import type { AmazonApplicationConfig, AmazonHttpTransport } from "./amazon-types";

export const AMAZON_FINANCES_SYNC_POLICY_VERSION = "E2F_V1";
export const AMAZON_FINANCES_SAFETY_LAG_MS = 5 * 60 * 1_000;
export const AMAZON_FINANCES_MAX_WINDOW_MS = 180 * 24 * 60 * 60 * 1_000;
export const AMAZON_FINANCES_OVERLAP_MS = 7 * 24 * 60 * 60 * 1_000;

export type AmazonFinancesWindow = Readonly<{ postedAfter: Date; postedBefore: Date }>;
export type AmazonFinancesPlan = Readonly<{
  kind: "NO_WORK" | "BACKFILL" | "INCREMENTAL";
  safeUpperBound: Date;
  checkpointBefore: Date | null;
  windows: readonly AmazonFinancesWindow[];
  noWorkReason: "BACKFILL_START_NOT_BEFORE_SAFE_UPPER_BOUND" | "SAFE_UPPER_BOUND_ALREADY_COVERED" | null;
}>;

function validInstant(value: Date) { return Number.isFinite(value.getTime()); }

export function planAmazonFinancesSync(input: {
  now: Date;
  backfillStart: Date;
  checkpointWatermark: Date | null;
  safetyLagMs?: number;
  overlapMs?: number;
}): AmazonFinancesPlan {
  const safetyLagMs = input.safetyLagMs ?? AMAZON_FINANCES_SAFETY_LAG_MS;
  const overlapMs = input.overlapMs ?? AMAZON_FINANCES_OVERLAP_MS;
  if (!validInstant(input.now) || !validInstant(input.backfillStart) ||
      (input.checkpointWatermark && !validInstant(input.checkpointWatermark)) ||
      !Number.isSafeInteger(safetyLagMs) || safetyLagMs <= 2 * 60 * 1_000 ||
      !Number.isSafeInteger(overlapMs) || overlapMs < 0 || overlapMs >= AMAZON_FINANCES_MAX_WINDOW_MS)
    throw new Error("Amazon E2-F invalid synchronization policy");
  const safeUpperBound = new Date(input.now.getTime() - safetyLagMs);
  if (!input.checkpointWatermark && input.backfillStart >= safeUpperBound)
    return { kind: "NO_WORK", safeUpperBound, checkpointBefore: null, windows: [],
      noWorkReason: "BACKFILL_START_NOT_BEFORE_SAFE_UPPER_BOUND" };
  if (input.checkpointWatermark && input.checkpointWatermark >= safeUpperBound)
    return { kind: "NO_WORK", safeUpperBound, checkpointBefore: input.checkpointWatermark,
      windows: [], noWorkReason: "SAFE_UPPER_BOUND_ALREADY_COVERED" };
  const kind = input.checkpointWatermark ? "INCREMENTAL" : "BACKFILL";
  const start = input.checkpointWatermark
    ? new Date(Math.max(input.backfillStart.getTime(), input.checkpointWatermark.getTime() - overlapMs))
    : new Date(input.backfillStart);
  const windows: AmazonFinancesWindow[] = [];
  for (let cursor = start.getTime(); cursor < safeUpperBound.getTime();) {
    const end = Math.min(cursor + AMAZON_FINANCES_MAX_WINDOW_MS, safeUpperBound.getTime());
    windows.push(Object.freeze({ postedAfter: new Date(cursor), postedBefore: new Date(end) }));
    cursor = end;
  }
  return { kind, safeUpperBound, checkpointBefore: input.checkpointWatermark,
    windows: Object.freeze(windows), noWorkReason: null };
}

function operationKey(marketplaceId: string, window: AmazonFinancesWindow, mappingVersionId: string) {
  return createHash("sha256").update(JSON.stringify([AMAZON_FINANCES_SYNC_POLICY_VERSION,
    marketplaceId, window.postedAfter.toISOString(), window.postedBefore.toISOString(), mappingVersionId])).digest("hex");
}

type ExecutionBoundary = Readonly<{
  db: PrismaClient;
  tenant: VerifiedCoreTenant;
  marketplaceId: string;
  mappingVersionId: string;
  config: AmazonApplicationConfig;
  transport: AmazonHttpTransport;
  credentialEncryptionProvider: CredentialEncryptionProvider;
  rawEncryption: RawSourceEncryptionBoundary;
  rawDecryption: RawSourceDecryptionBoundary;
  leaseOwner: string;
  clock: () => Date;
  leaseMs?: number;
  retry?: AmazonRetryHooks;
}>;

async function executeQuery(input: ExecutionBoundary & {
  query: AmazonFinancesQuery;
  operationKey: string;
  advanceCheckpoint: boolean;
  maxOperationAttempts: number;
}) {
  let restarts = 0;
  for (let attempt = 1; attempt <= input.maxOperationAttempts; attempt += 1) {
    const now = input.clock();
    let d1: Awaited<ReturnType<typeof ingestAmazonFinancesToD1>> | undefined;
    try {
      d1 = await ingestAmazonFinancesToD1({ ...input, now, deferCompletion: true });
      if (d1.replayed) {
        return { pages: d1.pages, transactions: 0, published: 0, blocked: 0, restarts, replayed: true };
      }
      if (!d1.context) throw new Error("Amazon E2-F missing prepared D1 context");
      const d2b = await ingestAmazonFinancesD1ToD2B({ db: input.db, tenant: input.tenant,
        sliceId: d1.sliceId, rawDecryption: input.rawDecryption, completion: {
          leaseOwner: input.leaseOwner, authorizationVersion: d1.context.authorizationVersion,
          mappingVersionId: d1.context.mappingVersionId, now, advanceCheckpoint: input.advanceCheckpoint,
          expectedProcessedSliceId: d1.context.expectedProcessedSliceId,
          cursorValue: d1.requestFingerprint, windowWatermark: input.query.postedBefore,
        } });
      return { pages: d1.pages, transactions: d2b.transactionCount,
        published: d2b.results.filter((value) => !value.blocked).length,
        blocked: d2b.results.filter((value) => value.blocked).length, restarts, replayed: false };
    } catch (error) {
      if (d1 && !d1.replayed) {
        await releaseSyncSlice(input.db, { sliceId: d1.sliceId, leaseOwner: input.leaseOwner }).catch(() => undefined);
        await input.db.syncRun.updateMany({ where: { id: d1.runId, status: "RUNNING" },
          data: { status: "FAILED", finishedAt: now } }).catch(() => undefined);
      }
      if (attempt === input.maxOperationAttempts) throw error;
      restarts += 1;
    }
  }
  throw new Error("Amazon E2-F unreachable retry state");
}

export async function synchronizeAmazonFinances(input: ExecutionBoundary & {
  backfillStart: Date;
  maxOperationAttempts?: number;
  safetyLagMs?: number;
  overlapMs?: number;
}) {
  const now = input.clock();
  const checkpoint = await input.db.syncCheckpoint.findUnique({ where: {
    channelConnectionId_marketplaceScopeKey_stream: {
      channelConnectionId: input.tenant.channelConnectionId,
      marketplaceScopeKey: marketplaceScopeKey(input.marketplaceId), stream: AMAZON_FINANCES_STREAM,
    } } });
  if (checkpoint && checkpoint.accountId !== input.tenant.accountId)
    throw new Error("Amazon E2-F checkpoint ownership mismatch");
  const plan = planAmazonFinancesSync({ now, backfillStart: input.backfillStart,
    checkpointWatermark: checkpoint?.windowWatermark ?? null,
    safetyLagMs: input.safetyLagMs, overlapMs: input.overlapMs });
  const maxOperationAttempts = input.maxOperationAttempts ?? 2;
  if (!Number.isSafeInteger(maxOperationAttempts) || maxOperationAttempts < 1 || maxOperationAttempts > 3)
    throw new Error("Amazon E2-F invalid operation retry policy");
  let pagesAcquired = 0, transactionsObserved = 0, published = 0, blocked = 0, retryRestarts = 0;
  for (const window of plan.windows) {
    const result = await executeQuery({ ...input, query: { postedAfter: window.postedAfter,
      postedBefore: window.postedBefore }, operationKey: operationKey(input.marketplaceId, window, input.mappingVersionId),
      advanceCheckpoint: true, maxOperationAttempts });
    pagesAcquired += result.pages;
    transactionsObserved += result.transactions;
    published += result.published;
    blocked += result.blocked;
    retryRestarts += result.restarts;
  }
  const after = plan.windows.at(-1)?.postedBefore ?? plan.checkpointBefore;
  return Object.freeze({ policyVersion: AMAZON_FINANCES_SYNC_POLICY_VERSION, planKind: plan.kind,
    windowsPlanned: plan.windows.length, windowsCompleted: plan.windows.length,
    pagesAcquired, transactionsObserved, d2bPublished: published, d2bBlocked: blocked,
    checkpointBefore: plan.checkpointBefore, checkpointAfter: after,
    noWorkReason: plan.noWorkReason, retryRestarts });
}

/** Targeted enrichment is durable evidence, but never chronological coverage. */
export async function synchronizeTargetedAmazonFinances(input: ExecutionBoundary & {
  relatedIdentifier: NonNullable<AmazonFinancesQuery["relatedIdentifier"]>;
  transactionStatus?: AmazonFinancesQuery["transactionStatus"];
  maxOperationAttempts?: number;
}) {
  const key = createHash("sha256").update(JSON.stringify([AMAZON_FINANCES_SYNC_POLICY_VERSION,
    "TARGETED", input.marketplaceId, input.relatedIdentifier, input.transactionStatus ?? null,
    input.mappingVersionId])).digest("hex");
  return executeQuery({ ...input, operationKey: key, advanceCheckpoint: false,
    maxOperationAttempts: input.maxOperationAttempts ?? 2,
    query: { relatedIdentifier: input.relatedIdentifier, transactionStatus: input.transactionStatus } });
}
