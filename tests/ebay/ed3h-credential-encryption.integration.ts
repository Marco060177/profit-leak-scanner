import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import {
  createEbayCredentialEncryptionProvider,
  EBAY_CREDENTIAL_ENCRYPTION_PROVIDER,
} from "../../app/connectors/ebay/ebay-credential-encryption.server";
import {
  persistEbaySellerAuthorization,
  resolveEbayRefreshTokenForUse,
  revokeEbaySellerAuthorization,
} from "../../app/connectors/ebay/ebay-authorization.server";
import { EBAY_REQUIRED_SCOPES } from "../../app/connectors/ebay/ebay-types";

const keyV1 = randomBytes(32).toString("base64");
const keyV2 = randomBytes(32).toString("base64");
const environment = (current: string, entries: Array<{ version: string; key: string }>) => ({
  MARGINLAB_ENCRYPTION_KEYRING: JSON.stringify(entries),
  MARGINLAB_ENCRYPTION_CURRENT_KEY_VERSION: current,
});
const providerV1 = createEbayCredentialEncryptionProvider(environment("prod-v1", [
  { version: "prod-v1", key: keyV1 },
]));
const providerV2 = createEbayCredentialEncryptionProvider(environment("prod-v2", [
  { version: "prod-v1", key: keyV1 }, { version: "prod-v2", key: keyV2 },
]));
const refreshToken = "ed3h-production-shaped-refresh-token";
const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-ebay-ed3h-"));
const databasePath = path.join(directory, "ed3h.sqlite");
const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA foreign_keys=ON");
for (const name of readdirSync("prisma/migrations").filter((name) => /^\d{14}_/.test(name)).sort())
  sqlite.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
const db = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } } });

try {
  const account = await db.account.create({ data: {} });
  const channel = await db.channelConnection.create({ data: { accountId: account.id, channel: "EBAY",
    externalAccountId: "ed3h-seller" } });
  const otherChannel = await db.channelConnection.create({ data: { accountId: account.id, channel: "EBAY",
    externalAccountId: "ed3h-other-seller" } });
  const tenant = { accountId: account.id, channelConnectionId: channel.id };
  const grant = { refreshToken, grantedScopes: EBAY_REQUIRED_SCOPES,
    grantedAt: new Date("2026-10-11T12:00:00Z"), refreshTokenExpiresAt: new Date("2030-01-01T00:00:00Z") };

  await assert.rejects(persistEbaySellerAuthorization(db, tenant, grant), /encryption provider unavailable/i);
  const first = await persistEbaySellerAuthorization(db, tenant, grant, providerV1);
  const storedV1 = await db.ebaySellerAuthorization.findUniqueOrThrow({ where: { channelConnectionId: channel.id } });
  assert.equal(storedV1.encryptionProvider, EBAY_CREDENTIAL_ENCRYPTION_PROVIDER);
  assert.equal(storedV1.encryptionKeyVersion, "prod-v1");
  assert.match(storedV1.credentialFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(Buffer.from(storedV1.encryptedRefreshToken).includes(Buffer.from(refreshToken)), false);
  assert.equal(readFileSync(databasePath).includes(Buffer.from(refreshToken)), false);
  assert.equal(await resolveEbayRefreshTokenForUse(db, tenant, providerV1), refreshToken);

  const epochBeforeRead = (await db.coreChannelAuthorization.findUniqueOrThrow({
    where: { channelConnectionId: channel.id },
  })).authorizationVersion;
  assert.equal(epochBeforeRead, first.authorizationVersion);
  assert.equal((await persistEbaySellerAuthorization(db, tenant, grant, providerV1)).authorizationVersion,
    first.authorizationVersion);
  assert.equal((await db.coreChannelAuthorization.findUniqueOrThrow({
    where: { channelConnectionId: channel.id },
  })).authorizationVersion, epochBeforeRead);

  assert.equal(await resolveEbayRefreshTokenForUse(db, tenant, providerV2), refreshToken);
  const providerV2WithoutHistoricalKey = createEbayCredentialEncryptionProvider(environment("prod-v2", [
    { version: "prod-v2", key: keyV2 },
  ]));
  await assert.rejects(resolveEbayRefreshTokenForUse(db, tenant, providerV2WithoutHistoricalKey));

  const directCredential = { ciphertext: storedV1.encryptedRefreshToken,
    provider: storedV1.encryptionProvider, keyVersion: storedV1.encryptionKeyVersion };
  const context = { dataClass: "CREDENTIAL" as const, accountId: account.id,
    channelConnectionId: channel.id, recordIdentity: "EbaySellerAuthorization" };
  await assert.rejects(providerV2.decrypt(directCredential, { ...context, accountId: "wrong-account" }));
  await assert.rejects(providerV2.decrypt(directCredential,
    { ...context, channelConnectionId: otherChannel.id }));
  await assert.rejects(providerV2.decrypt({ ...directCredential, provider: "UNKNOWN" }, context));
  await assert.rejects(providerV2.decrypt({ ...directCredential, keyVersion: "unknown-v9" }, context));

  const originalConsole = { log: console.log, warn: console.warn, error: console.error };
  const logged: unknown[][] = [];
  console.log = (...values: unknown[]) => { logged.push(values); };
  console.warn = (...values: unknown[]) => { logged.push(values); };
  console.error = (...values: unknown[]) => { logged.push(values); };
  try {
    await assert.rejects(providerV2.decrypt({ ...directCredential, provider: "UNKNOWN" }, context));
    assert.equal(logged.length, 0);
  } finally {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  }

  const revoked = await revokeEbaySellerAuthorization(db, tenant, new Date("2026-10-11T13:00:00Z"));
  assert.equal(revoked.status, "REVOKED");
  assert.notEqual(revoked.authorizationVersion, first.authorizationVersion);
  await assert.rejects(resolveEbayRefreshTokenForUse(db, tenant, providerV2));
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((sqlite.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  console.log("ED3-H eBay production credential encryption tests passed");
} finally {
  await db.$disconnect();
  sqlite.close();
  rmSync(directory, { recursive: true, force: true });
}
