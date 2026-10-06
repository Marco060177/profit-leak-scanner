import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const migrations = readdirSync("prisma/migrations").filter((name) => /^\d{14}_/.test(name)).sort();
assert.equal(migrations.length, 31);
assert.match(migrations.at(-1)!, /ebay_eb1a_tenancy_foundation$/);
const sql = (name: string) => readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8");
const check = (db: DatabaseSync) => {
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((db.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
};
const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-ebay-eb1a-migration-"));

try {
  const fresh = new DatabaseSync(path.join(directory, "fresh.sqlite"));
  fresh.exec("PRAGMA foreign_keys=ON");
  for (const name of migrations) fresh.exec(sql(name));
  assert.equal((fresh.prepare("SELECT count(*) AS count FROM pragma_table_info('EbaySellerAuthorization')")
    .get() as { count: number }).count > 0, true);
  fresh.prepare("INSERT INTO Account (id,status,createdAt,updatedAt) VALUES (?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)")
    .run("fresh-account", "ACTIVE");
  fresh.prepare("INSERT INTO ChannelConnection (id,accountId,channel,externalAccountId,status,createdAt,updatedAt) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)")
    .run("fresh-ebay", "fresh-account", "EBAY", "fresh-seller", "ACTIVE");
  check(fresh);
  fresh.close();

  const upgrade = new DatabaseSync(path.join(directory, "upgrade.sqlite"));
  upgrade.exec("PRAGMA foreign_keys=ON");
  for (const name of migrations.slice(0, -1)) upgrade.exec(sql(name));
  upgrade.prepare("INSERT INTO Account (id,status,createdAt,updatedAt) VALUES (?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)")
    .run("existing-account", "ACTIVE");
  upgrade.prepare("INSERT INTO ChannelConnection (id,accountId,channel,externalAccountId,status,createdAt,updatedAt) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)")
    .run("existing-shopify", "existing-account", "SHOPIFY", "existing.myshopify.com", "ACTIVE");
  upgrade.prepare("INSERT INTO ChannelConnection (id,accountId,channel,externalAccountId,status,createdAt,updatedAt) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)")
    .run("existing-amazon", "existing-account", "AMAZON", "existing-amazon-seller", "ACTIVE");
  upgrade.prepare("INSERT INTO LegacyShopMapping (shopDomain,accountId,channelConnectionId,createdAt) VALUES (?,?,?,CURRENT_TIMESTAMP)")
    .run("existing.myshopify.com", "existing-account", "existing-shopify");
  upgrade.prepare("INSERT INTO CoreChannelAuthorization (channelConnectionId,accountId,authorizationVersion,updatedAt) VALUES (?,?,?,CURRENT_TIMESTAMP)")
    .run("existing-amazon", "existing-account", "existing-amazon-auth");
  upgrade.prepare(`INSERT INTO AmazonSellerAuthorization
    (channelConnectionId,accountId,encryptedRefreshToken,encryptionProvider,encryptionKeyVersion,credentialFingerprint,
     status,authorizationVersion,grantedAt,createdAt,updatedAt)
    VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`)
    .run("existing-amazon", "existing-account", Buffer.from("encrypted"), "test", "v1", "fingerprint",
      "ACTIVE", "existing-amazon-auth");
  check(upgrade);
  upgrade.exec(sql(migrations.at(-1)!));
  assert.equal((upgrade.prepare("SELECT externalAccountId FROM ChannelConnection WHERE id='existing-shopify'")
    .get() as { externalAccountId: string }).externalAccountId, "existing.myshopify.com");
  assert.equal((upgrade.prepare("SELECT externalAccountId FROM ChannelConnection WHERE id='existing-amazon'")
    .get() as { externalAccountId: string }).externalAccountId, "existing-amazon-seller");
  assert.equal((upgrade.prepare("SELECT shopDomain FROM LegacyShopMapping WHERE channelConnectionId='existing-shopify'")
    .get() as { shopDomain: string }).shopDomain, "existing.myshopify.com");
  assert.equal((upgrade.prepare("SELECT authorizationVersion FROM AmazonSellerAuthorization WHERE channelConnectionId='existing-amazon'")
    .get() as { authorizationVersion: string }).authorizationVersion, "existing-amazon-auth");
  assert.equal((upgrade.prepare("SELECT authorizationVersion FROM CoreChannelAuthorization WHERE channelConnectionId='existing-amazon'")
    .get() as { authorizationVersion: string }).authorizationVersion, "existing-amazon-auth");
  check(upgrade);
  upgrade.close();
  console.log("eBay EB1-A fresh and migration-30 upgrade safety: PASS");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
