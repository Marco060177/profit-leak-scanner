import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const migrations = readdirSync("prisma/migrations").filter((name) => /^\d{14}_/.test(name)).sort();
assert.equal(migrations.length, 34);
const processingIndex = migrations.findIndex((name) => /ebay_deletion_processing_state$/.test(name));
assert.notEqual(processingIndex, -1);
const sql = (name: string) => readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8");
const check = (db: DatabaseSync) => {
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((db.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
};
const directory = mkdtempSync(path.join(process.cwd(), ".tmp-ed3e-migration-"));
try {
  const fresh = new DatabaseSync(path.join(directory, "fresh.sqlite"));
  fresh.exec("PRAGMA foreign_keys=ON");
  for (const name of migrations) fresh.exec(sql(name));
  assert.equal((fresh.prepare("SELECT count(*) AS count FROM pragma_table_info('EbayDeletionNotificationInbox')")
    .get() as { count: number }).count, 17);
  check(fresh);
  fresh.close();

  const upgrade = new DatabaseSync(path.join(directory, "upgrade.sqlite"));
  upgrade.exec("PRAGMA foreign_keys=ON");
  for (const name of migrations.slice(0, processingIndex)) upgrade.exec(sql(name));
  upgrade.prepare(`INSERT INTO EbayDeletionNotificationInbox
    (notificationId,topic,schemaVersion,eventAt,receivedAt,processingStatus,retryCount,diagnosticCode,
     payloadChecksum,userLookupToken,hmacKeyVersion,createdAt,updatedAt)
    VALUES (?,?,?,?,?,'PENDING_UNRESOLVED',0,'IDENTITY_UNRESOLVED',?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`)
    .run("existing-receipt", "MARKETPLACE_ACCOUNT_DELETION", "1.0", "2026-10-11T12:00:00.000Z",
      "2026-10-11T12:01:00.000Z", "a".repeat(64), "b".repeat(64), "v1");
  upgrade.exec(sql(migrations[processingIndex]));
  const preserved = upgrade.prepare(`SELECT processingStatus,retryCount,leaseOwner,leaseExpiresAt,nextAttemptAt,lastAttemptAt
    FROM EbayDeletionNotificationInbox WHERE notificationId='existing-receipt'`).get() as Record<string, unknown>;
  assert.deepEqual({ ...preserved }, { processingStatus: "PENDING_UNRESOLVED", retryCount: 0,
    leaseOwner: null, leaseExpiresAt: null, nextAttemptAt: null, lastAttemptAt: null });
  assert.throws(() => upgrade.prepare(`UPDATE EbayDeletionNotificationInbox SET processingStatus='PROCESSING'
    WHERE notificationId='existing-receipt'`).run(), /invalid processing state/);
  check(upgrade);
  upgrade.close();
  console.log("ED3-E fresh and 32-to-33 upgrade migration: PASS");
} finally {
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
