import type { EbayDeletionNotificationInbox, PrismaClient } from "@prisma/client";

const OWNER_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const DIAGNOSTIC_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

export type EbayDeletionProcessingPolicy = Readonly<{
  leaseMs: number;
  maximumAttempts: number;
  initialBackoffMs: number;
  maximumBackoffMs: number;
}>;

export const DEFAULT_EBAY_DELETION_PROCESSING_POLICY: EbayDeletionProcessingPolicy = Object.freeze({
  leaseMs: 60_000,
  maximumAttempts: 5,
  initialBackoffMs: 60_000,
  maximumBackoffMs: 3_600_000,
});

type ClaimedReceipt = EbayDeletionNotificationInbox & { processingStatus: "PROCESSING"; leaseOwner: string };

export type EbayDeletionProcessingOutcome =
  | Readonly<{ kind: "READY_FOR_REVIEW"; diagnosticCode: string }>
  | Readonly<{ kind: "REVIEW_REQUIRED"; diagnosticCode: string }>
  | Readonly<{ kind: "RETRYABLE_FAILURE"; diagnosticCode: string }>
  | Readonly<{ kind: "TERMINAL_FAILURE"; diagnosticCode: string }>;

function validDate(value: Date) {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function validatePolicy(policy: EbayDeletionProcessingPolicy) {
  if (!Number.isInteger(policy.leaseMs) || policy.leaseMs < 1_000 || policy.leaseMs > 300_000 ||
      !Number.isInteger(policy.maximumAttempts) || policy.maximumAttempts < 1 || policy.maximumAttempts > 20 ||
      !Number.isInteger(policy.initialBackoffMs) || policy.initialBackoffMs < 1_000 ||
      !Number.isInteger(policy.maximumBackoffMs) || policy.maximumBackoffMs < policy.initialBackoffMs ||
      policy.maximumBackoffMs > 86_400_000) throw new Error("Invalid eBay deletion processing policy");
}

function validateTransitionInput(leaseOwner: string, diagnosticCode: string, now: Date) {
  if (!OWNER_PATTERN.test(leaseOwner) || !DIAGNOSTIC_PATTERN.test(diagnosticCode) || !validDate(now))
    throw new Error("Invalid eBay deletion processing transition");
}

function retryDelay(attempt: number, policy: EbayDeletionProcessingPolicy) {
  const exponent = Math.max(0, attempt - 1);
  return Math.min(policy.maximumBackoffMs, policy.initialBackoffMs * (2 ** exponent));
}

export async function claimNextEbayDeletionNotification(input: {
  db: PrismaClient;
  leaseOwner: string;
  now: Date;
  policy?: EbayDeletionProcessingPolicy;
}): Promise<ClaimedReceipt | null> {
  const policy = input.policy ?? DEFAULT_EBAY_DELETION_PROCESSING_POLICY;
  validatePolicy(policy);
  if (!OWNER_PATTERN.test(input.leaseOwner) || !validDate(input.now)) throw new Error("Invalid eBay deletion lease");

  await input.db.ebayDeletionNotificationInbox.updateMany({
    where: { processingStatus: "PROCESSING", leaseExpiresAt: { lte: input.now },
      retryCount: { gte: policy.maximumAttempts } },
    data: { processingStatus: "FAILED", leaseOwner: null, leaseExpiresAt: null,
      nextAttemptAt: null, diagnosticCode: "MAXIMUM_ATTEMPTS_EXHAUSTED" },
  });

  for (let scan = 0; scan < 25; scan += 1) {
    const candidate = await input.db.ebayDeletionNotificationInbox.findFirst({
      where: { retryCount: { lt: policy.maximumAttempts }, OR: [
        { processingStatus: "PENDING_UNRESOLVED" },
        { processingStatus: "RETRY_PENDING", nextAttemptAt: { lte: input.now } },
        { processingStatus: "PROCESSING", leaseExpiresAt: { lte: input.now } },
      ] },
      orderBy: [{ receivedAt: "asc" }, { notificationId: "asc" }],
    });
    if (!candidate) return null;
    const eligibility = candidate.processingStatus === "PENDING_UNRESOLVED"
      ? { processingStatus: "PENDING_UNRESOLVED" }
      : candidate.processingStatus === "RETRY_PENDING"
        ? { processingStatus: "RETRY_PENDING", nextAttemptAt: { lte: input.now } }
        : { processingStatus: "PROCESSING", leaseExpiresAt: { lte: input.now } };
    const claimed = await input.db.ebayDeletionNotificationInbox.updateMany({
      where: { notificationId: candidate.notificationId, retryCount: candidate.retryCount, ...eligibility },
      data: { processingStatus: "PROCESSING", leaseOwner: input.leaseOwner,
        leaseExpiresAt: new Date(input.now.getTime() + policy.leaseMs), lastAttemptAt: input.now,
        nextAttemptAt: null, diagnosticCode: null, retryCount: { increment: 1 } },
    });
    if (claimed.count === 1) return await input.db.ebayDeletionNotificationInbox.findUniqueOrThrow({
      where: { notificationId: candidate.notificationId },
    }) as ClaimedReceipt;
  }
  return null;
}

async function finishClaim(input: { db: PrismaClient; notificationId: string; leaseOwner: string;
  now: Date; diagnosticCode: string; status: "READY_FOR_REVIEW" | "REVIEW_REQUIRED" | "FAILED" }) {
  validateTransitionInput(input.leaseOwner, input.diagnosticCode, input.now);
  const result = await input.db.ebayDeletionNotificationInbox.updateMany({ where: {
    notificationId: input.notificationId, processingStatus: "PROCESSING", leaseOwner: input.leaseOwner,
    leaseExpiresAt: { gt: input.now },
  }, data: { processingStatus: input.status, leaseOwner: null, leaseExpiresAt: null,
    nextAttemptAt: null, diagnosticCode: input.diagnosticCode } });
  if (result.count !== 1) throw new Error("eBay deletion processing lease unavailable");
}

export function markEbayDeletionReviewRequired(input: { db: PrismaClient; notificationId: string;
  leaseOwner: string; now: Date; diagnosticCode: string }) {
  return finishClaim({ ...input, status: "REVIEW_REQUIRED" });
}

export function markEbayDeletionReadyForReview(input: { db: PrismaClient; notificationId: string;
  leaseOwner: string; now: Date; diagnosticCode: string }) {
  return finishClaim({ ...input, status: "READY_FOR_REVIEW" });
}

export function markEbayDeletionTerminalFailure(input: { db: PrismaClient; notificationId: string;
  leaseOwner: string; now: Date; diagnosticCode: string }) {
  return finishClaim({ ...input, status: "FAILED" });
}

export async function markEbayDeletionRetryableFailure(input: { db: PrismaClient; notificationId: string;
  leaseOwner: string; now: Date; diagnosticCode: string; policy?: EbayDeletionProcessingPolicy }) {
  const policy = input.policy ?? DEFAULT_EBAY_DELETION_PROCESSING_POLICY;
  validatePolicy(policy);
  validateTransitionInput(input.leaseOwner, input.diagnosticCode, input.now);
  const receipt = await input.db.ebayDeletionNotificationInbox.findFirst({ where: {
    notificationId: input.notificationId, processingStatus: "PROCESSING", leaseOwner: input.leaseOwner,
    leaseExpiresAt: { gt: input.now },
  } });
  if (!receipt) throw new Error("eBay deletion processing lease unavailable");
  const exhausted = receipt.retryCount >= policy.maximumAttempts;
  const result = await input.db.ebayDeletionNotificationInbox.updateMany({ where: {
    notificationId: receipt.notificationId, processingStatus: "PROCESSING", leaseOwner: input.leaseOwner,
    leaseExpiresAt: { gt: input.now }, retryCount: receipt.retryCount,
  }, data: { processingStatus: exhausted ? "FAILED" : "RETRY_PENDING", leaseOwner: null,
    leaseExpiresAt: null, nextAttemptAt: exhausted ? null :
      new Date(input.now.getTime() + retryDelay(receipt.retryCount, policy)),
    diagnosticCode: exhausted ? "MAXIMUM_ATTEMPTS_EXHAUSTED" : input.diagnosticCode } });
  if (result.count !== 1) throw new Error("eBay deletion processing lease unavailable");
}

export async function runEbayDeletionNotificationWorker(input: {
  db: PrismaClient;
  leaseOwner: string;
  now?: () => Date;
  limit?: number;
  policy?: EbayDeletionProcessingPolicy;
  process: (receipt: ClaimedReceipt) => Promise<EbayDeletionProcessingOutcome>;
}) {
  const limit = input.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("Invalid eBay deletion worker limit");
  const counts = { claimed: 0, readyForReview: 0, reviewRequired: 0, retryPending: 0, failed: 0 };
  for (let index = 0; index < limit; index += 1) {
    const claimTime = (input.now ?? (() => new Date()))();
    const receipt = await claimNextEbayDeletionNotification({ db: input.db, leaseOwner: input.leaseOwner,
      now: claimTime, policy: input.policy });
    if (!receipt) break;
    counts.claimed += 1;
    let outcome: EbayDeletionProcessingOutcome;
    try { outcome = await input.process(receipt); }
    catch { outcome = { kind: "RETRYABLE_FAILURE", diagnosticCode: "PROCESSOR_EXCEPTION" }; }
    const finishTime = (input.now ?? (() => new Date()))();
    if (outcome.kind === "READY_FOR_REVIEW") {
      await markEbayDeletionReadyForReview({ db: input.db, notificationId: receipt.notificationId,
        leaseOwner: input.leaseOwner, now: finishTime, diagnosticCode: outcome.diagnosticCode });
      counts.readyForReview += 1;
    } else if (outcome.kind === "REVIEW_REQUIRED") {
      await markEbayDeletionReviewRequired({ db: input.db, notificationId: receipt.notificationId,
        leaseOwner: input.leaseOwner, now: finishTime, diagnosticCode: outcome.diagnosticCode });
      counts.reviewRequired += 1;
    } else if (outcome.kind === "TERMINAL_FAILURE") {
      await markEbayDeletionTerminalFailure({ db: input.db, notificationId: receipt.notificationId,
        leaseOwner: input.leaseOwner, now: finishTime, diagnosticCode: outcome.diagnosticCode });
      counts.failed += 1;
    } else {
      await markEbayDeletionRetryableFailure({ db: input.db, notificationId: receipt.notificationId,
        leaseOwner: input.leaseOwner, now: finishTime, diagnosticCode: outcome.diagnosticCode,
        policy: input.policy });
      const current = await input.db.ebayDeletionNotificationInbox.findUniqueOrThrow({
        where: { notificationId: receipt.notificationId }, select: { processingStatus: true } });
      if (current.processingStatus === "FAILED") counts.failed += 1; else counts.retryPending += 1;
    }
  }
  return counts;
}
