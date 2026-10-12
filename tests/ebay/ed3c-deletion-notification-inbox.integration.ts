import assert from "node:assert/strict";
import { createSign, generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { handleEbayDeletionNotificationPost, resolveEbayDeletionHmacConfig,
  type EbayDeletionHmacConfig } from "../../app/connectors/ebay/ebay-deletion-notification-inbox.server";
import { createEbayNotificationSignatureVerifier } from
  "../../app/connectors/ebay/ebay-notification-signature.server";

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-ebay-ed3c-"));
const databasePath = path.join(directory, "ed3c.sqlite");
const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA foreign_keys=ON");
for (const name of readdirSync("prisma/migrations").filter((value) => /^\d{14}_/.test(value)).sort())
  sqlite.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
const db = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } } });
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();
const hmacKey = randomBytes(32);
const hmacConfig: EbayDeletionHmacConfig = { activeKeyVersion: "test-v1",
  keys: new Map([["test-v1", hmacKey]]) };
const verifier = createEbayNotificationSignatureVerifier({
  publicKeyProvider: { async getPublicKey() { return publicKeyPem; } },
});

const message = (overrides: Record<string, unknown> = {}) => ({
  metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION", schemaVersion: "1.0", deprecated: false },
  notification: { notificationId: "notification-ed3c-1", eventDate: "2026-10-11T12:00:00.000Z",
    publishDate: "2026-10-11T12:00:01.000Z", publishAttemptCount: 1,
    data: { username: "plaintext-username-must-not-persist", userId: "plaintext-user-id-must-not-persist",
      eiasToken: "plaintext-eias-must-not-persist" }, ...overrides },
});
function signature(value: unknown) {
  const signer = createSign("ssl3-sha1");
  signer.update(JSON.stringify(value), "utf8");
  signer.end();
  return Buffer.from(JSON.stringify({ kid: "ed3c-key", signature: signer.sign(privateKey).toString("base64") }))
    .toString("base64");
}
const request = (value: unknown, signatureHeader = signature(value), body = JSON.stringify(value)) => new Request(
  "https://marginlab.example/ebay/marketplace-account-deletion",
  { method: "POST", headers: { "content-type": "application/json; charset=utf-8",
    "x-ebay-signature": signatureHeader }, body },
);
const handle = (value: unknown, signatureHeader?: string, body?: string, database = db) =>
  handleEbayDeletionNotificationPost({ request: request(value, signatureHeader ?? signature(value), body),
    db: database, verifier, hmacConfig, now: () => new Date("2026-10-11T12:01:00.000Z") });

try {
  const account = await db.account.create({ data: {} });
  const channel = await db.channelConnection.create({ data: {
    accountId: account.id, channel: "EBAY", externalAccountId: "seller-before-ed3c", status: "ACTIVE",
  } });

  const first = await handle(message());
  assert.equal(first.status, 204);
  const receipt = await db.ebayDeletionNotificationInbox.findUniqueOrThrow({
    where: { notificationId: "notification-ed3c-1" },
  });
  assert.equal(receipt.processingStatus, "PENDING_UNRESOLVED");
  assert.equal(receipt.retryCount, 0);
  assert.equal(receipt.diagnosticCode, "IDENTITY_UNRESOLVED");
  assert.equal(receipt.hmacKeyVersion, "test-v1");
  assert.match(receipt.payloadChecksum, /^[0-9a-f]{64}$/);
  assert.match(receipt.userLookupToken, /^[0-9a-f]{64}$/);

  const replayValue = message({ publishDate: "2026-10-11T12:05:00.000Z", publishAttemptCount: 2 });
  const replay = await handle(replayValue, signature(replayValue), ` \n${JSON.stringify(replayValue)} `);
  assert.equal(replay.status, 204);
  assert.equal(await db.ebayDeletionNotificationInbox.count(), 1);
  const afterReplay = await db.ebayDeletionNotificationInbox.findUniqueOrThrow({
    where: { notificationId: "notification-ed3c-1" },
  });
  assert.equal(afterReplay.receivedAt.toISOString(), "2026-10-11T12:01:00.000Z");
  assert.equal(afterReplay.processingStatus, "PENDING_UNRESOLVED");

  const conflictValue = message({ data: { userId: "different-user-id" } });
  const conflict = await handle(conflictValue);
  assert.equal(conflict.status, 409);
  assert.equal(await db.ebayDeletionNotificationInbox.count(), 1);

  const invalidSignature = await handle(message({ notificationId: "invalid-signature" }), signature(message()));
  assert.equal(invalidSignature.status, 412);
  assert.equal(await db.ebayDeletionNotificationInbox.count({ where: { notificationId: "invalid-signature" } }), 0);

  const wrongMethod = await handleEbayDeletionNotificationPost({ request: new Request(
    "https://marginlab.example/ebay/marketplace-account-deletion", { method: "PUT",
      headers: { "content-type": "application/json" }, body: "{}" }), db, verifier, hmacConfig });
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "POST");
  const wrongMediaType = await handleEbayDeletionNotificationPost({ request: new Request(
    "https://marginlab.example/ebay/marketplace-account-deletion", { method: "POST",
      headers: { "content-type": "text/plain" }, body: "{}" }), db, verifier, hmacConfig });
  assert.equal(wrongMediaType.status, 415);
  const oversized = await handleEbayDeletionNotificationPost({ request: new Request(
    "https://marginlab.example/ebay/marketplace-account-deletion", { method: "POST",
      headers: { "content-type": "application/json", "content-length": "262145" }, body: "{}" }),
    db, verifier, hmacConfig });
  assert.equal(oversized.status, 413);
  assert.equal(await db.ebayDeletionNotificationInbox.count(), 1);

  const databaseFailure = { ebayDeletionNotificationInbox: {
    async findUnique() { return null; }, async create() { throw new Error("database unavailable"); },
  } } as unknown as PrismaClient;
  const failureValue = message({ notificationId: "database-failure" });
  assert.equal((await handle(failureValue, undefined, undefined, databaseFailure)).status, 503);

  assert.throws(() => resolveEbayDeletionHmacConfig({}), /configuration/i);
  assert.throws(() => resolveEbayDeletionHmacConfig({
    EBAY_MARKETPLACE_ACCOUNT_DELETION_HMAC_ACTIVE_KEY_VERSION: "v1",
    EBAY_MARKETPLACE_ACCOUNT_DELETION_HMAC_KEYS_JSON: JSON.stringify({ v1: "not-base64" }),
  }), /configuration/i);
  const resolved = resolveEbayDeletionHmacConfig({
    EBAY_MARKETPLACE_ACCOUNT_DELETION_HMAC_ACTIVE_KEY_VERSION: "v1",
    EBAY_MARKETPLACE_ACCOUNT_DELETION_HMAC_KEYS_JSON: JSON.stringify({ v1: randomBytes(32).toString("base64") }),
  });
  assert.equal(resolved.activeKeyVersion, "v1");

  const persisted = JSON.stringify(sqlite.prepare("SELECT * FROM EbayDeletionNotificationInbox").all());
  for (const plaintext of ["plaintext-username", "plaintext-user-id", "plaintext-eias", "different-user-id"])
    assert.equal(persisted.includes(plaintext), false);
  const untouchedChannel = await db.channelConnection.findUniqueOrThrow({ where: { id: channel.id } });
  assert.equal(untouchedChannel.status, "ACTIVE");
  assert.equal(await db.ebaySellerAuthorization.count(), 0);
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((sqlite.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  console.log("ED3-C verified durable idempotent deletion notification inbox: PASS");
} finally {
  await db.$disconnect();
  sqlite.close();
  rmSync(directory, { recursive: true, force: true });
}
