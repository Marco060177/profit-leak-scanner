import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { refreshEbaySellerAccessToken } from "../../app/connectors/ebay/ebay-api-client.server";
import { ebayDeletionIdentityLookupToken, persistVerifiedEbayDeletionNotification,
  type EbayDeletionHmacConfig } from "../../app/connectors/ebay/ebay-deletion-notification-inbox.server";
import { acquireAndPersistEbaySellerIdentity, classifyEbaySellerIdentityCandidates,
  resolveEbayDeletionSellerIdentity } from "../../app/connectors/ebay/ebay-seller-identity.server";
import { EBAY_IDENTITY_SCOPE, EBAY_REQUIRED_SCOPES, EbayConnectorError,
  type EbayApplicationConfig, type EbayHttpTransport } from "../../app/connectors/ebay/ebay-types";

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-ebay-ed3f-"));
const databasePath = path.join(directory, "state.sqlite");
const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA foreign_keys=ON");
for (const name of readdirSync("prisma/migrations").filter((value) => /^\d{14}_/.test(value)).sort())
  sqlite.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
const db = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } } });
const now = new Date("2026-10-12T10:00:00.000Z");
const config: EbayApplicationConfig = { environment: "SANDBOX", clientId: "client", clientSecret: "secret",
  ruName: "runame", timeoutMs: 10_000, maxAttempts: 1, maxRetryAfterMs: 0 };
const keyV1 = Buffer.alloc(32, 1);
const keyV2 = Buffer.alloc(32, 2);
const hmacConfig: EbayDeletionHmacConfig = { activeKeyVersion: "v2",
  keys: new Map([["v1", keyV1], ["v2", keyV2]]) };

const response = (status: number, body: unknown) => ({ status, headers: {},
  body: new TextEncoder().encode(JSON.stringify(body)) });

async function seedAuthorization(externalAccountId: string, scopes: readonly string[]) {
  const account = await db.account.create({ data: {} });
  const channel = await db.channelConnection.create({ data: { accountId: account.id, channel: "EBAY",
    externalAccountId, status: "ACTIVE" } });
  const authorizationVersion = `${externalAccountId}-authorization-v1`;
  await db.ebaySellerAuthorization.create({ data: { accountId: account.id, channelConnectionId: channel.id,
    encryptedRefreshToken: Buffer.from("encrypted"), encryptionProvider: "TEST", encryptionKeyVersion: "v1",
    credentialFingerprint: `${externalAccountId}-fingerprint`, grantedScopesJson: JSON.stringify(scopes),
    status: "ACTIVE", authorizationVersion, grantedAt: now } });
  await db.coreChannelAuthorization.create({ data: { accountId: account.id,
    channelConnectionId: channel.id, authorizationVersion } });
  return { account, channel, tenant: { accountId: account.id, channelConnectionId: channel.id } };
}

try {
  assert.ok(EBAY_REQUIRED_SCOPES.includes(EBAY_IDENTITY_SCOPE));
  const seller = await seedAuthorization("ed3f-seller", EBAY_REQUIRED_SCOPES);
  const identityTransport: EbayHttpTransport = { request: async (request) => {
    assert.equal(request.method, "GET");
    assert.equal(new URL(request.url).pathname, "/commerce/identity/v1/user/");
    assert.equal(request.headers.authorization, "Bearer seller-access-token");
    return response(200, { userId: "immutable-user-123", username: "secondary-name",
      email: "must-not-be-persisted@example.test" });
  } };
  const acquired = await acquireAndPersistEbaySellerIdentity({ db, tenant: seller.tenant,
    accessToken: "seller-access-token", config, transport: identityTransport, hmacConfig, verifiedAt: now });
  assert.equal(acquired.username, "secondary-name");
  assert.deepEqual(acquired.keyVersions, ["v1", "v2"]);
  const bindings = await db.ebaySellerIdentityBinding.findMany({ where: {
    channelConnectionId: seller.channel.id }, orderBy: { hmacKeyVersion: "asc" } });
  assert.equal(bindings.length, 2);
  assert.equal(bindings[0].userLookupToken, ebayDeletionIdentityLookupToken(keyV1, "immutable-user-123"));
  assert.equal(bindings[1].userLookupToken, ebayDeletionIdentityLookupToken(keyV2, "immutable-user-123"));
  assert.equal(JSON.stringify(bindings).includes("immutable-user-123"), false);
  assert.equal(JSON.stringify(bindings).includes("secondary-name"), false);
  assert.equal(JSON.stringify(bindings).includes("must-not-be-persisted"), false);

  const notification = { notificationId: "ed3f-notification", topic: "MARKETPLACE_ACCOUNT_DELETION" as const,
    schemaVersion: "1.0" as const, eventDate: now.toISOString(), userId: "immutable-user-123" };
  const first = await persistVerifiedEbayDeletionNotification({ db, notification, hmacConfig, receivedAt: now });
  const duplicate = await persistVerifiedEbayDeletionNotification({ db, notification, hmacConfig, receivedAt: now });
  assert.equal(first.replayed, false);
  assert.equal(duplicate.replayed, true);
  assert.equal(await db.ebayDeletionNotificationInbox.count(), 1);
  assert.deepEqual(await resolveEbayDeletionSellerIdentity(db, first.receipt), {
    kind: "READY_FOR_REVIEW", accountId: seller.account.id, channelConnectionId: seller.channel.id });
  assert.deepEqual(await resolveEbayDeletionSellerIdentity(db, { hmacKeyVersion: "v1",
    userLookupToken: ebayDeletionIdentityLookupToken(keyV1, "immutable-user-123") }), {
    kind: "READY_FOR_REVIEW", accountId: seller.account.id, channelConnectionId: seller.channel.id });
  assert.deepEqual(await resolveEbayDeletionSellerIdentity(db, { hmacKeyVersion: "v2",
    userLookupToken: ebayDeletionIdentityLookupToken(keyV2, "unknown-user") }), {
    kind: "REVIEW_REQUIRED", diagnosticCode: "IDENTITY_UNKNOWN" });

  const candidate = { accountId: seller.account.id, channelConnectionId: seller.channel.id,
    verifiedSource: "EBAY_COMMERCE_IDENTITY_GET_USER_V1", accountStatus: "ACTIVE", channelStatus: "ACTIVE",
    channel: "EBAY", authorizationStatus: "ACTIVE", channelAccountId: seller.account.id,
    authorizationAccountId: seller.account.id };
  assert.deepEqual(classifyEbaySellerIdentityCandidates([candidate, candidate]), {
    kind: "REVIEW_REQUIRED", diagnosticCode: "IDENTITY_AMBIGUOUS" });

  const other = await seedAuthorization("ed3f-other", EBAY_REQUIRED_SCOPES);
  await assert.rejects(db.ebaySellerIdentityBinding.create({ data: { accountId: other.account.id,
    channelConnectionId: other.channel.id, hmacKeyVersion: "v2",
    userLookupToken: bindings[1].userLookupToken, verifiedSource: "EBAY_COMMERCE_IDENTITY_GET_USER_V1",
    verifiedAt: now } }));
  assert.equal(await db.ebaySellerIdentityBinding.count({ where: { hmacKeyVersion: "v2",
    userLookupToken: bindings[1].userLookupToken } }), 1);

  const legacy = await seedAuthorization("ed3f-legacy", EBAY_REQUIRED_SCOPES.filter((scope) =>
    scope !== EBAY_IDENTITY_SCOPE));
  await assert.rejects(refreshEbaySellerAccessToken({ db, tenant: legacy.tenant, config,
    transport: { request: async () => { throw new Error("must not call network"); } },
    encryptionProvider: { encrypt: async () => { throw new Error("unused"); },
      decrypt: async () => Buffer.from("unused") }, now }),
  (error: unknown) => error instanceof EbayConnectorError && error.kind === "REAUTH_REQUIRED");
  assert.equal((await db.ebaySellerAuthorization.findUniqueOrThrow({ where: {
    channelConnectionId: legacy.channel.id } })).status, "REAUTH_REQUIRED");

  const malformed = await seedAuthorization("ed3f-malformed", EBAY_REQUIRED_SCOPES);
  await assert.rejects(acquireAndPersistEbaySellerIdentity({ db, tenant: malformed.tenant,
    accessToken: "seller-access-token", config, hmacConfig, verifiedAt: now,
    transport: { request: async () => response(200, { username: "missing-user-id" }) } }),
  (error: unknown) => error instanceof EbayConnectorError && error.kind === "MALFORMED_RESPONSE");
  assert.equal(await db.ebaySellerIdentityBinding.count({ where: {
    channelConnectionId: malformed.channel.id } }), 0);

  assert.equal((await db.channelConnection.findUniqueOrThrow({ where: { id: seller.channel.id } })).status, "ACTIVE");
  assert.equal((await db.ebaySellerAuthorization.findUniqueOrThrow({ where: {
    channelConnectionId: seller.channel.id } })).status, "ACTIVE");
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((sqlite.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  console.log("ED3-F seller identity acquisition, HMAC binding and safe resolution: PASS");
} finally {
  await db.$disconnect();
  sqlite.close();
  rmSync(directory, { recursive: true, force: true });
}
