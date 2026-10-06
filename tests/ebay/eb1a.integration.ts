import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import type { AuthenticatedTenantContext } from "../../app/core/authenticated-tenant-context";

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-ebay-eb1a-"));
const databasePath = path.join(directory, "eb1a.sqlite");
const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA foreign_keys=ON");
for (const name of readdirSync("prisma/migrations").filter((name) => /^\d{14}_/.test(name)).sort())
  sqlite.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
const db = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } } });

const authorization = (accountId: string, channelConnectionId: string, suffix: string) => ({
  accountId,
  channelConnectionId,
  encryptedRefreshToken: Buffer.from(`encrypted-${suffix}`),
  encryptionProvider: "test-kms",
  encryptionKeyVersion: "test-key-v1",
  credentialFingerprint: `fingerprint-${suffix}`,
  grantedScopesJson: JSON.stringify([
    "https://api.ebay.com/oauth/api_scope/sell.finances",
    "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  ]),
  authorizationVersion: `authorization-${suffix}`,
  grantedAt: new Date("2026-10-06T12:00:00Z"),
});

try {
  const accountA = await db.account.create({ data: {} });
  const accountB = await db.account.create({ data: {} });
  const ebayA = await db.channelConnection.create({ data: {
    accountId: accountA.id, channel: "EBAY", externalAccountId: "ebay-seller-a",
  } });
  const ebayB = await db.channelConnection.create({ data: {
    accountId: accountB.id, channel: "EBAY", externalAccountId: "ebay-seller-b",
  } });
  const shopifyA = await db.channelConnection.create({ data: {
    accountId: accountA.id, channel: "SHOPIFY", externalAccountId: "shop-a.myshopify.com",
  } });
  const amazonA = await db.channelConnection.create({ data: {
    accountId: accountA.id, channel: "AMAZON", externalAccountId: "amazon-seller-a",
  } });
  const context: AuthenticatedTenantContext = {
    accountId: accountA.id, channelConnectionId: ebayA.id, channel: "EBAY",
  };
  assert.equal(context.channel, "EBAY");

  const row = await db.ebaySellerAuthorization.create({ data: authorization(accountA.id, ebayA.id, "a") });
  await db.coreChannelAuthorization.create({ data: {
    accountId: accountA.id, channelConnectionId: ebayA.id,
    authorizationVersion: row.authorizationVersion,
  } });
  assert.equal(row.accountId, accountA.id);
  assert.deepEqual(JSON.parse(row.grantedScopesJson), [
    "https://api.ebay.com/oauth/api_scope/sell.finances",
    "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  ]);
  const owner = await db.channelConnection.findUniqueOrThrow({ where: { id: ebayA.id },
    include: { ebaySellerAuthorization: true } });
  assert.equal(owner.ebaySellerAuthorization?.authorizationVersion, row.authorizationVersion);
  const account = await db.account.findUniqueOrThrow({ where: { id: accountA.id },
    include: { ebaySellerAuthorizations: true } });
  assert.equal(account.ebaySellerAuthorizations.length, 1);

  await assert.rejects(db.ebaySellerAuthorization.create({
    data: authorization(accountA.id, shopifyA.id, "shopify"),
  }));
  await assert.rejects(db.ebaySellerAuthorization.create({
    data: authorization(accountA.id, amazonA.id, "amazon"),
  }));
  await assert.rejects(db.ebaySellerAuthorization.create({
    data: authorization(accountA.id, ebayB.id, "cross-account"),
  }));
  await assert.rejects(db.ebaySellerAuthorization.create({ data: {
    ...authorization(accountB.id, ebayB.id, "noncanonical-scopes"),
    grantedScopesJson: JSON.stringify([
      "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
      "https://api.ebay.com/oauth/api_scope/sell.finances",
    ]),
  } }));

  await db.channelConnection.update({ where: { id: ebayB.id }, data: { status: "INACTIVE" } });
  await assert.rejects(db.ebaySellerAuthorization.create({
    data: authorization(accountB.id, ebayB.id, "inactive-channel"),
  }));
  await db.channelConnection.update({ where: { id: ebayB.id }, data: { status: "ACTIVE" } });
  await db.account.update({ where: { id: accountB.id }, data: { status: "INACTIVE" } });
  await assert.rejects(db.ebaySellerAuthorization.create({
    data: authorization(accountB.id, ebayB.id, "inactive-account"),
  }));

  await assert.rejects(db.ebaySellerAuthorization.create({ data: {
    ...authorization(accountA.id, ebayA.id, "replace"), channelConnectionId: ebayA.id,
  } }));
  await assert.rejects(db.ebaySellerAuthorization.update({ where: { channelConnectionId: ebayA.id },
    data: { accountId: accountB.id } }));
  await assert.rejects(db.channelConnection.update({ where: { id: ebayA.id }, data: { channel: "AMAZON" } }));
  await assert.rejects(db.ebaySellerAuthorization.delete({ where: { channelConnectionId: ebayA.id } }));

  const reauthAt = new Date("2026-10-07T12:00:00Z");
  const reauth = await db.ebaySellerAuthorization.update({ where: { channelConnectionId: ebayA.id }, data: {
    status: "REAUTH_REQUIRED", reauthRequiredAt: reauthAt, authorizationVersion: "authorization-a-reauth",
  } });
  await db.coreChannelAuthorization.update({ where: { channelConnectionId: ebayA.id },
    data: { authorizationVersion: reauth.authorizationVersion } });
  assert.equal(reauth.status, "REAUTH_REQUIRED");
  await assert.rejects(db.ebaySellerAuthorization.update({ where: { channelConnectionId: ebayA.id },
    data: { status: "ACTIVE" } }));

  const columns = sqlite.prepare("PRAGMA table_info('EbaySellerAuthorization')").all() as Array<{ name: string }>;
  for (const forbidden of ["accessToken", "authorizationCode", "clientSecret", "signingPrivateKey",
    "publicJwe", "callbackState"]) assert.equal(columns.some((column) =>
      column.name.toLowerCase() === forbidden.toLowerCase()), false);
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((sqlite.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  console.log("eBay EB1-A persisted channel, authorization constraints and tenancy: PASS");
} finally {
  await db.$disconnect();
  sqlite.close();
  rmSync(directory, { recursive: true, force: true });
}
