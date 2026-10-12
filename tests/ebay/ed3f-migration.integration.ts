import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const directory = mkdtempSync(path.join(process.cwd(), ".tmp-ed3f-migration-"));
const migrations = readdirSync("prisma/migrations").filter((value) => /^\d{14}_/.test(value)).sort();
const apply = (db: DatabaseSync, names: readonly string[]) => {
  db.exec("PRAGMA foreign_keys=ON");
  for (const name of names) db.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
};
let fresh: DatabaseSync | undefined;
let upgrade: DatabaseSync | undefined;
try {
  fresh = new DatabaseSync(path.join(directory, "fresh.sqlite"));
  apply(fresh, migrations);
  assert.deepEqual(fresh.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((fresh.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  fresh.close();
  fresh = undefined;

  upgrade = new DatabaseSync(path.join(directory, "upgrade.sqlite"));
  apply(upgrade, migrations.slice(0, -1));
  upgrade.prepare("INSERT INTO Account (id,status,createdAt,updatedAt) VALUES ('a','ACTIVE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").run();
  upgrade.prepare("INSERT INTO ChannelConnection (id,accountId,channel,externalAccountId,status,createdAt,updatedAt) VALUES ('c','a','EBAY','seller','ACTIVE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").run();
  upgrade.prepare("INSERT INTO EbaySellerAuthorization (channelConnectionId,accountId,encryptedRefreshToken,encryptionProvider,encryptionKeyVersion,credentialFingerprint,grantedScopesJson,status,authorizationVersion,grantedAt,createdAt,updatedAt) VALUES ('c','a',X'01','TEST','v1','fp','[\"scope\"]','ACTIVE','epoch',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").run();
  apply(upgrade, migrations.slice(-1));
  assert.equal((upgrade.prepare("SELECT externalAccountId FROM ChannelConnection WHERE id='c'").get() as
    { externalAccountId: string }).externalAccountId, "seller");
  assert.deepEqual(upgrade.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((upgrade.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  upgrade.close();
  upgrade = undefined;
  console.log("ED3-F fresh and 33-to-34 upgrade migration: PASS");
} finally {
  try { fresh?.close(); } catch { /* best-effort test cleanup */ }
  try { upgrade?.close(); } catch { /* best-effort test cleanup */ }
  await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
