import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { persistEbaySellerAuthorization, revokeEbaySellerAuthorization,
  markEbayAuthorizationReauthRequired } from "../../app/connectors/ebay/ebay-authorization.server";
import { ingestEbayOrdersToD1, type EbayRawSourceEncryptionBoundary }
  from "../../app/connectors/ebay/ebay-orders-d1.server";
import { EBAY_REQUIRED_SCOPES, EbayConnectorError, type EbayApplicationConfig,
  type EbayHttpRequest, type EbayHttpResponse, type EbayHttpTransport }
  from "../../app/connectors/ebay/ebay-types";
import { testEbayCredentialEncryptionProvider } from "./test-credential-encryption";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const json = (value: unknown, headers: Record<string, string> = {}): EbayHttpResponse =>
  ({ status: 200, headers, body: encoder.encode(JSON.stringify(value)) });
class MockTransport implements EbayHttpTransport {
  readonly requests: EbayHttpRequest[] = [];
  private readonly handlers: Array<(request: EbayHttpRequest) => EbayHttpResponse | Promise<EbayHttpResponse>>;
  constructor(handlers: Array<(request: EbayHttpRequest) => EbayHttpResponse | Promise<EbayHttpResponse>>) {
    this.handlers = handlers;
  }
  async request(request: EbayHttpRequest) {
    this.requests.push(request);
    const handler = this.handlers.shift();
    if (!handler) throw new Error("Unexpected real/unmocked request");
    return handler(request);
  }
}

const config: EbayApplicationConfig = { environment: "SANDBOX", clientId: "eb2a-client",
  clientSecret: "eb2a-client-secret", ruName: "eb2a-runame", timeoutMs: 1000,
  maxAttempts: 1, maxRetryAfterMs: 0 };
const refreshToken = "eb2a-refresh-token";
const accessToken = "eb2a-access-token";
const now = new Date("2026-10-06T12:00:00Z");
const query = { createdAfter: new Date("2026-09-01T00:00:00Z"),
  createdBefore: new Date("2026-09-30T00:00:00Z"), pageSize: 2 };
const oauth = () => json({ access_token: accessToken, token_type: "bearer", expires_in: 7200 });
const order = (id: string) => ({ orderId: id, creationDate: "2026-09-02T10:00:00.000Z",
  pricingSummary: { total: { value: "7.25", currency: "EUR" } } });
const nextFor = (request: EbayHttpRequest, offset: number) => {
  const url = new URL(request.url); url.searchParams.set("offset", String(offset)); return url.toString();
};
const rawKey = createHash("sha256").update("marginlab-eb2a-raw-test-key-only").digest();
const rawEncryption: EbayRawSourceEncryptionBoundary = { encryptChunk(plain) {
  const nonce = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", rawKey, nonce);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]);
} };
const decryptRaw = async (db: PrismaClient, rawId: string) => {
  const chunks = await db.rawSourceBlobChunk.findMany({ where: { rawSourceRecordId: rawId },
    orderBy: { chunkIndex: "asc" } });
  return Buffer.concat(chunks.map((chunk) => {
    const bytes = Buffer.from(chunk.encryptedBytes);
    const decipher = createDecipheriv("aes-256-gcm", rawKey, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
  }));
};

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-ebay-eb2a-"));
const databasePath = path.join(directory, "eb2a.sqlite");
const sqlite = new DatabaseSync(databasePath); sqlite.exec("PRAGMA foreign_keys=ON");
for (const name of readdirSync("prisma/migrations").filter((name) => /^\d{14}_/.test(name)).sort())
  sqlite.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
const db = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } } });

try {
  const account = await db.account.create({ data: {} });
  const otherAccount = await db.account.create({ data: {} });
  const channel = await db.channelConnection.create({ data: { accountId: account.id,
    channel: "EBAY", externalAccountId: "eb2a-seller" } });
  const otherChannel = await db.channelConnection.create({ data: { accountId: otherAccount.id,
    channel: "EBAY", externalAccountId: "eb2a-other" } });
  const shopify = await db.channelConnection.create({ data: { accountId: account.id,
    channel: "SHOPIFY", externalAccountId: "eb2a.myshopify.com" } });
  const tenant = { accountId: account.id, channelConnectionId: channel.id };
  await persistEbaySellerAuthorization(db, tenant, { refreshToken,
    grantedScopes: EBAY_REQUIRED_SCOPES, grantedAt: now,
    refreshTokenExpiresAt: new Date("2030-01-01T00:00:00Z") }, testEbayCredentialEncryptionProvider);
  const marketplace = await db.marketplace.create({ data: { ...tenant,
    externalMarketplaceId: "EBAY_IT", countryCode: "IT", currencyCode: "EUR" } });
  const otherMarketplace = await db.marketplace.create({ data: { accountId: otherAccount.id,
    channelConnectionId: otherChannel.id, externalMarketplaceId: "EBAY_DE", countryCode: "DE", currencyCode: "EUR" } });
  const mapping = await db.mappingVersion.create({ data: { platform: "EBAY",
    sourceContract: "sell-fulfillment-order-v1", sourceVersion: "sell-fulfillment-v1",
    mapperSemanticVersion: "eb2a", formulaCompatibilityVersion: "d2a-v1",
    checksum: "eb2a-mapping", activatedAt: now } });
  const invoke = (operationKey: string, transport: EbayHttpTransport, overrides: Record<string, unknown> = {}) =>
    ingestEbayOrdersToD1({ db, tenant, marketplaceId: marketplace.id, operationKey,
      mappingVersionId: mapping.id, query, config, transport,
      credentialEncryptionProvider: testEbayCredentialEncryptionProvider, rawEncryption,
      leaseOwner: `lease-${operationKey}`, now, clock: () => now.getTime(), sleep: async () => {}, ...overrides });

  const singleBody = { href: "page-one", total: 1, limit: 2, offset: 0, orders: [order("ORDER-1")] };
  const singleTransport = new MockTransport([oauth, (request) => {
    assert.equal(new URL(request.url).pathname, "/sell/fulfillment/v1/order");
    assert.equal(new URL(request.url).searchParams.get("filter"),
      `creationdate:[${query.createdAfter.toISOString()}..${query.createdBefore.toISOString()}]`);
    assert.equal(request.headers["x-ebay-c-marketplace-id"], "EBAY_IT");
    return json(singleBody, { "x-ebay-c-request-id": "eb2a-request-1" });
  }]);
  const single = await invoke("single", singleTransport);
  assert.equal(single.pages, 1); assert.equal(single.replayed, false);
  const evidence = await db.syncSliceEvidence.findFirstOrThrow({ where: { sliceId: single.sliceId },
    include: { rawSourceRecord: true, sourceObservation: true } });
  assert.deepEqual(await decryptRaw(db, evidence.rawSourceRecordId), Buffer.from(JSON.stringify(singleBody)));
  assert.equal(evidence.rawSourceRecord.sourceSystem, "EBAY");
  assert.equal(evidence.rawSourceRecord.sourceEntityType, "FULFILLMENT_ORDERS_PAGE");
  assert.equal(evidence.sourceObservation?.authorizationVersion,
    (await db.ebaySellerAuthorization.findUniqueOrThrow({ where: { channelConnectionId: channel.id } })).authorizationVersion);

  const multiBodies: unknown[] = [];
  const multiTransport = new MockTransport([oauth,
    (request) => { const value = { orders: [order("ORDER-A")], next: nextFor(request, 2) };
      multiBodies.push(value); return json(value, { "x-ebay-c-request-id": "page-a" }); },
    (request) => { const value = { orders: [order("ORDER-B")], next: nextFor(request, 4) };
      multiBodies.push(value); return json(value, { "x-ebay-c-request-id": "page-b" }); },
    () => { const value = { orders: [order("ORDER-C")] }; multiBodies.push(value); return json(value); },
  ]);
  const multi = await invoke("multi", multiTransport);
  assert.equal(multi.pages, 3);
  const multiEvidence = await db.syncSliceEvidence.findMany({ where: { sliceId: multi.sliceId },
    include: { rawSourceRecord: true } });
  assert.deepEqual(multiEvidence.filter((row) => row.rawSourceRecord.sourceEntityType === "FULFILLMENT_ORDERS_PAGE")
    .map((row) => row.rawSourceRecord.sourceSnapshotVersion).sort(),
    ["page-1", "page-2", "page-3"]);
  assert.equal(new Set(multiEvidence.map((row) => row.rawSourceRecord.sourceEntityId)).size, 6);

  const repeated = new MockTransport([oauth, (request) => json({ orders: [order("R1")], next: request.url })]);
  await assert.rejects(invoke("repeated", repeated),
    (error) => error instanceof EbayConnectorError && error.kind === "MALFORMED_RESPONSE");
  const repeatedSlice = await db.syncSlice.findFirstOrThrow({ where: { run: { status: "FAILED" } },
    orderBy: { createdAt: "desc" } });
  assert.equal(await db.syncSliceEvidence.count({ where: { sliceId: repeatedSlice.id,
    rawSourceRecord: { sourceEntityType: "FULFILLMENT_ORDERS_PAGE" } } }), 1);

  const bounded = new MockTransport([oauth, (request) => json({ orders: [order("BOUND")], next: nextFor(request, 2) })]);
  await assert.rejects(invoke("bounded", bounded, { query: { ...query, maxPages: 1 } }));
  const boundedSlice = await db.syncSlice.findFirstOrThrow({ where: { run: { status: "FAILED" } },
    orderBy: { createdAt: "desc" } });
  assert.equal(await db.syncCheckpoint.count({ where: { processedSliceId: boundedSlice.id } }), 0);

  const failedTransport = new MockTransport([oauth,
    (request) => json({ orders: [order("RECOVER-A")], next: nextFor(request, 2) }),
    () => response500()]);
  const rawBeforeFailure = await db.rawSourceRecord.count();
  await assert.rejects(invoke("recover", failedTransport), (error) => {
    const serialized = JSON.stringify(error);
    return error instanceof EbayConnectorError && !serialized.includes("upstream-sensitive-body") &&
      !serialized.includes(accessToken) && !serialized.includes(refreshToken) && !serialized.includes(config.clientSecret);
  });
  const failedSlice = await db.syncSlice.findFirstOrThrow({ where: { run: { status: "FAILED" } },
    orderBy: { createdAt: "desc" } });
  assert.equal(await db.syncSliceEvidence.count({ where: { sliceId: failedSlice.id,
    rawSourceRecord: { sourceEntityType: "FULFILLMENT_ORDERS_PAGE" } } }), 1);
  assert.equal(await db.syncCheckpoint.count({ where: { processedSliceId: failedSlice.id } }), 0);
  const recovered = await invoke("recover", new MockTransport([oauth,
    (request) => json({ orders: [order("RECOVER-A")], next: nextFor(request, 2) }),
    () => json({ orders: [order("RECOVER-B")] })]));
  assert.equal(recovered.sliceId, failedSlice.id); assert.equal(recovered.pages, 2);
  assert.equal(await db.rawSourceRecord.count(), rawBeforeFailure + 4);

  const replay = await invoke("single", new MockTransport([]));
  assert.equal(replay.replayed, true); assert.equal(replay.sliceId, single.sliceId);
  const rawBeforeIdentical = await db.rawSourceRecord.count();
  await invoke("identical-cross-run", new MockTransport([oauth, () => json(singleBody)]));
  assert.equal(await db.rawSourceRecord.count(), rawBeforeIdentical);
  await invoke("changed", new MockTransport([oauth, () => json({ ...singleBody, orders: [order("ORDER-CHANGED")] })]));
  assert.equal(await db.rawSourceRecord.count(), rawBeforeIdentical + 2);

  const boundaryCalls = async (operationKey: string, overrides: Record<string, unknown>) => {
    const transport = new MockTransport([]); await assert.rejects(invoke(operationKey, transport, overrides));
    assert.equal(transport.requests.length, 0);
  };
  await boundaryCalls("cross-tenant", { tenant: { accountId: account.id,
    channelConnectionId: otherChannel.id }, marketplaceId: otherMarketplace.id });
  await boundaryCalls("wrong-channel", { tenant: { accountId: account.id,
    channelConnectionId: shopify.id } });
  await db.channelConnection.update({ where: { id: channel.id }, data: { status: "INACTIVE" } });
  await boundaryCalls("inactive-channel", {});
  await db.channelConnection.update({ where: { id: channel.id }, data: { status: "ACTIVE" } });
  await db.account.update({ where: { id: account.id }, data: { status: "INACTIVE" } });
  await boundaryCalls("inactive-account", {});
  await db.account.update({ where: { id: account.id }, data: { status: "ACTIVE" } });

  const epochTransport = new MockTransport([oauth,
    (request) => json({ orders: [order("EPOCH-A")], next: nextFor(request, 2) }),
    async () => { await db.coreChannelAuthorization.update({ where: { channelConnectionId: channel.id },
      data: { authorizationVersion: "changed-during-sync" } }); return json({ orders: [order("EPOCH-B")] }); }]);
  await assert.rejects(invoke("epoch-change", epochTransport));
  const epochSlice = await db.syncSlice.findFirstOrThrow({ where: { run: { status: "FAILED" } },
    orderBy: { createdAt: "desc" } });
  assert.equal(await db.syncCheckpoint.count({ where: { processedSliceId: epochSlice.id } }), 0);
  const authorization = await db.ebaySellerAuthorization.findUniqueOrThrow({ where: { channelConnectionId: channel.id } });
  await db.coreChannelAuthorization.update({ where: { channelConnectionId: channel.id },
    data: { authorizationVersion: authorization.authorizationVersion } });
  await db.coreChannelAuthorization.update({ where: { channelConnectionId: channel.id }, data: { authorizationVersion: "stale" } });
  await boundaryCalls("stale", {});
  await db.coreChannelAuthorization.update({ where: { channelConnectionId: channel.id },
    data: { authorizationVersion: authorization.authorizationVersion } });
  await markEbayAuthorizationReauthRequired(db, tenant, now);
  await boundaryCalls("reauth", {});
  await persistEbaySellerAuthorization(db, tenant, { refreshToken, grantedScopes: EBAY_REQUIRED_SCOPES,
    grantedAt: now, refreshTokenExpiresAt: new Date("2030-01-01T00:00:00Z") }, testEbayCredentialEncryptionProvider);
  await revokeEbaySellerAuthorization(db, tenant, now);
  await boundaryCalls("revoked", {});

  await persistEbaySellerAuthorization(db, tenant, { refreshToken, grantedScopes: EBAY_REQUIRED_SCOPES,
    grantedAt: now, refreshTokenExpiresAt: new Date("2030-01-01T00:00:00Z") }, testEbayCredentialEncryptionProvider);
  for (const [operationKey, body] of [["malformed", { unexpected: [] }],
    ["oversized", "x".repeat(2 * 1024 * 1024 + 1)]] as const) {
    const transport = new MockTransport([oauth, () => typeof body === "string"
      ? { status: 200, headers: {}, body: encoder.encode(body) } : json(body)]);
    await assert.rejects(invoke(operationKey, transport));
  }

  assert.equal(await db.normalizedOrder.count(), 0);
  assert.equal(await db.normalizedOrderItem.count(), 0);
  assert.equal(await db.financialLedgerEntry.count(), 0);
  assert.equal(await db.inventoryEconomicEvent.count(), 0);
  assert.equal(await db.financialAuthorityDecision.count(), 0);
  const durable = JSON.stringify(await db.sourceReference.findMany());
  for (const secret of [refreshToken, accessToken, config.clientSecret, "Signature-Input", "Bearer "])
    assert.equal(durable.includes(secret), false);
  assert.equal(decoder.decode((await db.rawSourceBlobChunk.findFirstOrThrow()).encryptedBytes).includes("ORDER-"), false);
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((sqlite.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  console.log("eBay EB2-A Fulfillment Orders to encrypted D1 evidence: PASS");
} finally {
  await db.$disconnect(); sqlite.close(); rmSync(directory, { recursive: true, force: true });
}

function response500(): EbayHttpResponse {
  return { status: 500, headers: {}, body: encoder.encode("upstream-sensitive-body") };
}
