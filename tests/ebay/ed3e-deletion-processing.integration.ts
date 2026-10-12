import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { claimNextEbayDeletionNotification, markEbayDeletionRetryableFailure,
  markEbayDeletionReviewRequired, runEbayDeletionNotificationWorker,
  type EbayDeletionProcessingPolicy } from
  "../../app/connectors/ebay/ebay-deletion-notification-processor.server";

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-ebay-ed3e-"));
const databasePath = path.join(directory, "state.sqlite");
const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA foreign_keys=ON");
for (const name of readdirSync("prisma/migrations").filter((value) => /^\d{14}_/.test(value)).sort())
  sqlite.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
const url = `file:${databasePath.replace(/\\/g, "/")}`;
let db = new PrismaClient({ datasources: { db: { url } } });
const start = new Date("2026-10-11T12:00:00.000Z");
const policy: EbayDeletionProcessingPolicy = { leaseMs: 1_000, maximumAttempts: 3,
  initialBackoffMs: 1_000, maximumBackoffMs: 8_000 };
let sequence = 0;
const seed = async () => {
  sequence += 1;
  return db.ebayDeletionNotificationInbox.create({ data: { notificationId: `notification-${sequence}`,
    topic: "MARKETPLACE_ACCOUNT_DELETION", schemaVersion: "1.0", eventAt: start,
    receivedAt: new Date(start.getTime() + sequence), diagnosticCode: "IDENTITY_UNRESOLVED",
    payloadChecksum: sequence.toString(16).padStart(64, "0"),
    userLookupToken: (sequence + 100).toString(16).padStart(64, "0"), hmacKeyVersion: "v1" } });
};

try {
  const account = await db.account.create({ data: {} });
  const channel = await db.channelConnection.create({ data: { accountId: account.id, channel: "EBAY",
    externalAccountId: "seller-unchanged", status: "ACTIVE" } });

  const concurrent = await seed();
  const claims = await Promise.all([
    claimNextEbayDeletionNotification({ db, leaseOwner: "worker-a", now: start, policy }),
    claimNextEbayDeletionNotification({ db, leaseOwner: "worker-b", now: start, policy }),
  ]);
  assert.equal(claims.filter(Boolean).length, 1, "only one concurrent worker obtains the receipt");
  const owner = claims.find(Boolean)!.leaseOwner;
  await markEbayDeletionReviewRequired({ db, notificationId: concurrent.notificationId, leaseOwner: owner,
    now: new Date(start.getTime() + 500), diagnosticCode: "IDENTITY_BINDING_UNAVAILABLE" });
  assert.equal((await db.ebayDeletionNotificationInbox.findUniqueOrThrow({ where: {
    notificationId: concurrent.notificationId } })).processingStatus, "REVIEW_REQUIRED");

  const interrupted = await seed();
  assert.ok(await claimNextEbayDeletionNotification({ db, leaseOwner: "interrupted-worker", now: start, policy }));
  assert.equal(await claimNextEbayDeletionNotification({ db, leaseOwner: "early-worker",
    now: new Date(start.getTime() + 999), policy }), null);
  await db.$disconnect();
  db = new PrismaClient({ datasources: { db: { url } } });
  const recovered = await claimNextEbayDeletionNotification({ db, leaseOwner: "recovery-worker",
    now: new Date(start.getTime() + 1_001), policy });
  assert.equal(recovered?.notificationId, interrupted.notificationId);
  assert.equal(recovered?.retryCount, 2);
  await markEbayDeletionReviewRequired({ db, notificationId: interrupted.notificationId,
    leaseOwner: "recovery-worker", now: new Date(start.getTime() + 1_500),
    diagnosticCode: "IDENTITY_BINDING_UNAVAILABLE" });

  const retry = await seed();
  let claimed = await claimNextEbayDeletionNotification({ db, leaseOwner: "retry-worker",
    now: new Date(start.getTime() + 2_000), policy });
  assert.equal(claimed?.notificationId, retry.notificationId);
  await markEbayDeletionRetryableFailure({ db, notificationId: retry.notificationId,
    leaseOwner: "retry-worker", now: new Date(start.getTime() + 2_100), diagnosticCode: "DATABASE_TEMPORARY",
    policy });
  let row = await db.ebayDeletionNotificationInbox.findUniqueOrThrow({ where: { notificationId: retry.notificationId } });
  assert.equal(row.processingStatus, "RETRY_PENDING");
  assert.equal(row.nextAttemptAt?.toISOString(), "2026-10-11T12:00:03.100Z");
  assert.equal(await claimNextEbayDeletionNotification({ db, leaseOwner: "too-early",
    now: new Date(start.getTime() + 3_099), policy }), null);
  claimed = await claimNextEbayDeletionNotification({ db, leaseOwner: "retry-worker",
    now: new Date(start.getTime() + 3_100), policy });
  assert.equal(claimed?.retryCount, 2);
  await markEbayDeletionRetryableFailure({ db, notificationId: retry.notificationId,
    leaseOwner: "retry-worker", now: new Date(start.getTime() + 3_200), diagnosticCode: "DATABASE_TEMPORARY",
    policy });
  row = await db.ebayDeletionNotificationInbox.findUniqueOrThrow({ where: { notificationId: retry.notificationId } });
  assert.equal(row.nextAttemptAt?.toISOString(), "2026-10-11T12:00:05.200Z");
  claimed = await claimNextEbayDeletionNotification({ db, leaseOwner: "retry-worker",
    now: new Date(start.getTime() + 5_200), policy });
  assert.equal(claimed?.retryCount, 3);
  await markEbayDeletionRetryableFailure({ db, notificationId: retry.notificationId,
    leaseOwner: "retry-worker", now: new Date(start.getTime() + 5_300), diagnosticCode: "DATABASE_TEMPORARY",
    policy });
  row = await db.ebayDeletionNotificationInbox.findUniqueOrThrow({ where: { notificationId: retry.notificationId } });
  assert.equal(row.processingStatus, "FAILED");
  assert.equal(row.diagnosticCode, "MAXIMUM_ATTEMPTS_EXHAUSTED");
  assert.equal(row.nextAttemptAt, null);

  const workerReceipt = await seed();
  const result = await runEbayDeletionNotificationWorker({ db, leaseOwner: "bounded-worker",
    now: () => new Date(start.getTime() + 10_000), limit: 1, policy,
    process: async () => ({ kind: "REVIEW_REQUIRED", diagnosticCode: "IDENTITY_BINDING_UNAVAILABLE" }) });
  assert.deepEqual(result, { claimed: 1, readyForReview: 0, reviewRequired: 1, retryPending: 0, failed: 0 });
  assert.equal((await db.ebayDeletionNotificationInbox.findUniqueOrThrow({ where: {
    notificationId: workerReceipt.notificationId } })).processingStatus, "REVIEW_REQUIRED");

  const untouched = await db.channelConnection.findUniqueOrThrow({ where: { id: channel.id } });
  assert.equal(untouched.status, "ACTIVE");
  assert.equal(await db.ebaySellerAuthorization.count(), 0);
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((sqlite.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  console.log("ED3-E atomic leases, recovery, retry bounds and review state: PASS");
} finally {
  await db.$disconnect();
  sqlite.close();
  rmSync(directory, { recursive: true, force: true });
}
