import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const migrations = readdirSync("prisma/migrations").filter((name) => /^\d{14}_/.test(name)).sort();
assert.equal(migrations.length, 34);
const inboxIndex = migrations.findIndex((name) => /ebay_deletion_notification_inbox$/.test(name));
assert.notEqual(inboxIndex, -1);
const sql = (name: string) => readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8");
const check = (db: DatabaseSync) => {
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((db.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
};
const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-ebay-ed3c-migration-"));

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
  for (const name of migrations.slice(0, inboxIndex)) upgrade.exec(sql(name));
  upgrade.prepare("INSERT INTO Account (id,status,createdAt,updatedAt) VALUES (?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)")
    .run("existing-account", "ACTIVE");
  upgrade.prepare("INSERT INTO ChannelConnection (id,accountId,channel,externalAccountId,status,createdAt,updatedAt) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)")
    .run("existing-ebay", "existing-account", "EBAY", "existing-seller", "ACTIVE");
  upgrade.exec(sql(migrations[inboxIndex]));
  assert.equal((upgrade.prepare("SELECT externalAccountId FROM ChannelConnection WHERE id='existing-ebay'")
    .get() as { externalAccountId: string }).externalAccountId, "existing-seller");
  assert.equal((upgrade.prepare("SELECT count(*) AS count FROM EbayDeletionNotificationInbox")
    .get() as { count: number }).count, 0);
  check(upgrade);
  upgrade.close();
  console.log("ED3-C fresh and 31-to-32 upgrade migration: PASS");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
