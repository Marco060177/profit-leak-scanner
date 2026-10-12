import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes, verify } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import {
  rawSourceEncryptionContext,
  storeRawSourceRecord,
} from "../../app/core/data-core-d1.server";
import { resolveEbayRefreshTokenForUse } from "../../app/connectors/ebay/ebay-authorization.server";
import { ebaySignatureBase } from "../../app/connectors/ebay/ebay-http-signature.server";
import { createEbayProductionConnectorComposition } from
  "../../app/connectors/ebay/ebay-production-composition.server";
import { EBAY_REQUIRED_SCOPES, type EbayHttpRequest, type EbayHttpTransport } from
  "../../app/connectors/ebay/ebay-types";

const signingKeys = generateKeyPairSync("ed25519");
const privateKeyPem = signingKeys.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const publicKeyJwe = "ed3k-production-public-key-jwe";
const masterKey = randomBytes(32).toString("base64");
const environment = {
  EBAY_PRODUCTION_CONNECTOR_ENABLED: "true",
  EBAY_ENVIRONMENT: "PRODUCTION",
  EBAY_CLIENT_ID: "ed3k-client",
  EBAY_CLIENT_SECRET: "ed3k-secret",
  EBAY_RUNAME: "ed3k-runame",
  EBAY_HTTP_MAX_ATTEMPTS: "1",
  MARGINLAB_ENCRYPTION_KEYRING: JSON.stringify([{ version: "prod-v1", key: masterKey }]),
  MARGINLAB_ENCRYPTION_CURRENT_KEY_VERSION: "prod-v1",
  EBAY_ED25519_PRIVATE_KEY_PEM: privateKeyPem,
  EBAY_ED25519_PUBLIC_KEY_JWE: publicKeyJwe,
  EBAY_ED25519_KEY_VERSION: "prod-signing-v1",
};

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-ebay-ed3k-"));
const databasePath = path.join(directory, "ed3k.sqlite");
const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA foreign_keys=ON");
for (const name of readdirSync("prisma/migrations").filter((name) => /^\d{14}_/.test(name)).sort())
  sqlite.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
const db = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } } });

let capturedRequest: EbayHttpRequest | null = null;
const transport: EbayHttpTransport = {
  async request(request) {
    capturedRequest = request;
    return { status: 200, headers: {}, body: new TextEncoder().encode("{}") };
  },
};

try {
  assert.throws(() => createEbayProductionConnectorComposition({ db, transport, environment: {
    ...environment, EBAY_PRODUCTION_CONNECTOR_ENABLED: undefined,
  } }));
  assert.throws(() => createEbayProductionConnectorComposition({ db, transport, environment: {
    ...environment, EBAY_ENVIRONMENT: "SANDBOX",
  } }));
  assert.throws(() => createEbayProductionConnectorComposition({ db, transport, environment: {
    ...environment, MARGINLAB_ENCRYPTION_KEYRING: "invalid",
  } }));
  assert.throws(() => createEbayProductionConnectorComposition({ db, transport, environment: {
    ...environment, EBAY_ED25519_PRIVATE_KEY_PEM: "invalid",
  } }));

  const composition = createEbayProductionConnectorComposition({ db, transport, environment });
  assert.deepEqual(composition.readiness, { environment: "PRODUCTION", activationEnabled: true });

  const account = await db.account.create({ data: {} });
  const channel = await db.channelConnection.create({ data: { accountId: account.id, channel: "EBAY",
    externalAccountId: "ed3k-seller" } });
  const otherAccount = await db.account.create({ data: {} });
  const otherChannel = await db.channelConnection.create({ data: { accountId: otherAccount.id, channel: "EBAY",
    externalAccountId: "ed3k-other-seller" } });
  const tenant = { accountId: account.id, channelConnectionId: channel.id };
  const refreshToken = "ed3k-production-shaped-refresh-token";
  const authorization = await composition.persistSellerAuthorization(tenant, { refreshToken,
    grantedScopes: EBAY_REQUIRED_SCOPES, grantedAt: new Date("2026-10-11T16:00:00Z") });
  const epoch = await db.coreChannelAuthorization.findUniqueOrThrow({ where: { channelConnectionId: channel.id } });
  assert.equal(epoch.authorizationVersion, authorization.authorizationVersion);
  assert.equal(await resolveEbayRefreshTokenForUse(db, tenant,
    composition.providers.credentialEncryptionProvider), refreshToken);
  await assert.rejects(resolveEbayRefreshTokenForUse(db,
    { accountId: otherAccount.id, channelConnectionId: channel.id },
    composition.providers.credentialEncryptionProvider));
  assert.equal(readFileSync(databasePath).includes(Buffer.from(refreshToken)), false);

  const economicProjection = Buffer.from('{"projectionSchema":"TEST","orderId":"ORDER-1"}');
  const raw = await storeRawSourceRecord(db, { ...tenant, sourceSystem: "EBAY", sourceVersion: "ed3k-test-v1",
    sourceEntityType: "ORDER", sourceEntityId: "ORDER-1", schemaVersion: "ed3k-test-v1",
    retentionClass: "COMMERCE_SOURCE", capturedAt: new Date("2026-10-11T16:01:00Z"),
    payload: economicProjection,
    encryptChunk: (plain, index, context) => composition.providers.d1EncryptionProvider
      .encryptChunk(plain, index, context) });
  const stored = await db.rawSourceRecord.findUniqueOrThrow({ where: { id: raw.id },
    include: { chunks: { orderBy: { chunkIndex: "asc" } } } });
  assert(stored.chunks.every((chunk) => !Buffer.from(chunk.encryptedBytes).includes(economicProjection)));
  const context = rawSourceEncryptionContext(stored);
  const recovered = Buffer.concat(stored.chunks.map((chunk) => Buffer.from(
    composition.providers.d1EncryptionProvider.decryptChunk(
      new Uint8Array(chunk.encryptedBytes), chunk.chunkIndex, context))));
  assert.deepEqual(recovered, economicProjection);
  assert.throws(() => composition.providers.d1EncryptionProvider.decryptChunk(
    new Uint8Array(stored.chunks[0].encryptedBytes), 0, { ...context, accountId: otherAccount.id }));
  assert.notEqual(otherChannel.id, channel.id);

  await composition.executeApiRequest({ accessToken: "access-token", method: "GET",
    path: "/sell/finances/v1/transaction", operation: "FINANCES", now: () => 1_700_000_000_000 });
  assert(capturedRequest);
  const request = capturedRequest as EbayHttpRequest;
  assert.equal(request.headers["x-ebay-signature-key"], publicKeyJwe);
  const signatureInput = request.headers["signature-input"];
  const signature = request.headers.signature;
  assert(signatureInput && signature);
  const built = ebaySignatureBase({ method: request.method, url: new URL(request.url), publicKeyJwe,
    created: 1_700_000_000 });
  assert.equal(signatureInput, built.signatureInput);
  assert.equal(verify(null, Buffer.from(built.signatureBase, "utf8"), signingKeys.publicKey,
    Buffer.from(signature.slice("sig1=:".length, -1), "base64")), true);

  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((sqlite.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  console.log("ED3-K eBay production connector composition tests passed");
} finally {
  await db.$disconnect();
  sqlite.close();
  rmSync(directory, { recursive: true, force: true });
}
