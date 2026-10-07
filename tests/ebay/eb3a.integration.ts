import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { markEbayAuthorizationReauthRequired, persistEbaySellerAuthorization,
  revokeEbaySellerAuthorization } from "../../app/connectors/ebay/ebay-authorization.server";
import { ingestEbayFinancesToD1 } from "../../app/connectors/ebay/ebay-finances-d1.server";
import type { EbaySigningKeyProvider } from "../../app/connectors/ebay/ebay-http-signature.server";
import type { EbayRawSourceEncryptionBoundary } from "../../app/connectors/ebay/ebay-orders-d1.server";
import { EBAY_REQUIRED_SCOPES, type EbayApplicationConfig,
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
    this.requests.push(request); const handler = this.handlers.shift();
    if (!handler) throw new Error("Unexpected real/unmocked request"); return handler(request);
  }
}
const config: EbayApplicationConfig = { environment: "SANDBOX", clientId: "eb3a-client",
  clientSecret: "eb3a-secret", ruName: "eb3a-runame", timeoutMs: 1000,
  maxAttempts: 1, maxRetryAfterMs: 0 };
const now = new Date("2026-10-06T12:00:00Z");
const query = { transactionDateFrom: new Date("2026-09-01T00:00:00Z"),
  transactionDateTo: new Date("2026-09-30T00:00:00Z"), pageSize: 2 };
const refreshToken = "eb3a-refresh-token"; const accessToken = "eb3a-access-token";
const oauth = () => json({ access_token: accessToken, token_type: "bearer", expires_in: 7200 });
const { privateKey } = generateKeyPairSync("ed25519");
const signingKeyProvider: EbaySigningKeyProvider = { async getSigningMaterial() {
  return { privateKey, publicKeyJwe: "eb3a-test-public-jwe", keyVersion: "test-v1" };
} };
const tx = (id: string, type: string, extras: Record<string, unknown> = {}) => ({ transactionId: id,
  transactionType: type, transactionStatus: "FUNDS_AVAILABLE_FOR_PAYOUT",
  transactionDate: "2026-09-03T10:00:00.000Z", amount: { value: "7.2500", currency: "EUR" }, ...extras });
const fixtures = [tx("TX-SALE", "SALE", { orderId: "ORDER-EXACT",
  orderLineItems: [{ lineItemId: "LINE-EXACT", marketplaceFees: [{ feeType: "FINAL_VALUE_FEE",
    amount: { value: "-1.05", currency: "EUR" } }] }] }),
tx("TX-FEE", "NON_SALE_CHARGE"), tx("TX-REFUND", "REFUND"), tx("TX-FUTURE", "FUTURE_NEW_TYPE")];
const nextFor = (request: EbayHttpRequest, offset: number) => {
  const url = new URL(request.url); url.searchParams.set("offset", String(offset)); return url.toString();
};
const rawKey = createHash("sha256").update("marginlab-eb3a-raw-test-key-only").digest();
const rawEncryption: EbayRawSourceEncryptionBoundary = { encryptChunk(plain) {
  const nonce = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", rawKey, nonce);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]);
} };
const decryptRaw = async (db: PrismaClient, rawId: string) => {
  const chunks = await db.rawSourceBlobChunk.findMany({ where: { rawSourceRecordId: rawId },
    orderBy: { chunkIndex: "asc" } });
  return Buffer.concat(chunks.map((chunk) => { const bytes = Buffer.from(chunk.encryptedBytes);
    const decipher = createDecipheriv("aes-256-gcm", rawKey, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]); }));
};

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-ebay-eb3a-"));
const databasePath = path.join(directory, "eb3a.sqlite");
const sqlite = new DatabaseSync(databasePath); sqlite.exec("PRAGMA foreign_keys=ON");
for (const name of readdirSync("prisma/migrations").filter((name) => /^\d{14}_/.test(name)).sort())
  sqlite.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
const db = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } } });

try {
  const account = await db.account.create({ data: {} }); const other = await db.account.create({ data: {} });
  const channel = await db.channelConnection.create({ data: { accountId: account.id,
    channel: "EBAY", externalAccountId: "eb3a-seller" } });
  const otherChannel = await db.channelConnection.create({ data: { accountId: other.id,
    channel: "EBAY", externalAccountId: "eb3a-other" } });
  const shopify = await db.channelConnection.create({ data: { accountId: account.id,
    channel: "SHOPIFY", externalAccountId: "eb3a.myshopify.com" } });
  const tenant = { accountId: account.id, channelConnectionId: channel.id };
  await persistEbaySellerAuthorization(db, tenant, { refreshToken, grantedScopes: EBAY_REQUIRED_SCOPES,
    grantedAt: now, refreshTokenExpiresAt: new Date("2030-01-01T00:00:00Z") },
  testEbayCredentialEncryptionProvider);
  const marketplace = await db.marketplace.create({ data: { ...tenant,
    externalMarketplaceId: "EBAY_IT", countryCode: "IT", currencyCode: "EUR" } });
  const otherMarketplace = await db.marketplace.create({ data: { accountId: other.id,
    channelConnectionId: otherChannel.id, externalMarketplaceId: "EBAY_DE", countryCode: "DE", currencyCode: "EUR" } });
  const mapping = await db.mappingVersion.create({ data: { platform: "EBAY",
    sourceContract: "sell-finances-transaction-v1", sourceVersion: "sell-finances-v1",
    mapperSemanticVersion: "eb3a", formulaCompatibilityVersion: "d2b-v1",
    checksum: "eb3a-mapping", activatedAt: now } });
  const invoke = (key: string, transport: EbayHttpTransport, overrides: Record<string, unknown> = {}) =>
    ingestEbayFinancesToD1({ db, tenant, marketplaceId: marketplace.id, operationKey: key,
      mappingVersionId: mapping.id, query, config, transport,
      credentialEncryptionProvider: testEbayCredentialEncryptionProvider, signingKeyProvider,
      rawEncryption, leaseOwner: `lease-${key}`, now, clock: () => now.getTime(), sleep: async () => {}, ...overrides });

  const body = { href: "synthetic", total: 4, limit: 2, offset: 0, transactions: fixtures };
  const transport = new MockTransport([oauth, (request) => {
    assert.equal(new URL(request.url).pathname, "/sell/finances/v1/transaction");
    assert.ok(request.headers.signature); assert.ok(request.headers["signature-input"]);
    assert.equal(request.headers["content-digest"], undefined);
    assert.equal(new URL(request.url).searchParams.get("filter"),
      `transactionDate:[${query.transactionDateFrom.toISOString()}..${query.transactionDateTo.toISOString()}]`);
    return json(body, { "x-ebay-c-request-id": "finance-safe-1" });
  }]);
  const single = await invoke("single", transport);
  assert.equal(single.pages, 1);
  const evidence = await db.syncSliceEvidence.findFirstOrThrow({ where: { sliceId: single.sliceId },
    include: { rawSourceRecord: true, sourceObservation: true } });
  assert.deepEqual(await decryptRaw(db, evidence.rawSourceRecordId), Buffer.from(JSON.stringify(body)));
  assert.equal(evidence.rawSourceRecord.retentionClass, "FINANCIAL_SOURCE");
  assert.equal(evidence.sourceObservation?.authorizationVersion,
    (await db.ebaySellerAuthorization.findUniqueOrThrow({ where: { channelConnectionId: channel.id } })).authorizationVersion);
  const references = await db.sourceReference.findMany({ where: { rawSourceRecordId: evidence.rawSourceRecordId } });
  assert(references.some((row) => row.targetKind === "EBAY_FINANCES_PAGE" &&
    row.targetKey.includes("request:finance-safe-1")));
  assert(references.some((row) => row.targetKind === "EBAY_FINANCES_TRANSACTION" && row.targetKey === "TX-SALE"));
  assert(references.some((row) => row.targetKind === "EBAY_ORDER_ID" && row.targetKey === "ORDER-EXACT"));
  assert(references.some((row) => row.targetKind === "EBAY_ORDER_LINE_ITEM_ID" && row.targetKey === "LINE-EXACT"));
  assert.equal(references.filter((row) => row.targetKind === "EBAY_ORDER_ID").length, 1);
  assert.deepEqual(fixtures.map((entry) => entry.transactionType),
    ["SALE", "NON_SALE_CHARGE", "REFUND", "FUTURE_NEW_TYPE"]);

  const unsigned = new MockTransport([]);
  await assert.rejects(invoke("unsigned", unsigned, { signingKeyProvider: undefined }));
  assert.equal(unsigned.requests.length, 0);

  const multi = await invoke("multi", new MockTransport([oauth,
    (request) => json({ transactions: [fixtures[0]], next: nextFor(request, 2) }),
    (request) => json({ transactions: [fixtures[1]], next: nextFor(request, 4) }),
    () => json({ transactions: [fixtures[2]] })]));
  assert.equal(multi.pages, 3);
  const multiRows = await db.syncSliceEvidence.findMany({ where: { sliceId: multi.sliceId },
    include: { rawSourceRecord: true } });
  assert.deepEqual(multiRows.map((row) => row.rawSourceRecord.sourceSnapshotVersion).sort(),
    ["page-1", "page-2", "page-3"]);

  const repeated = new MockTransport([oauth,
    (request) => json({ transactions: [fixtures[0]], next: request.url })]);
  await assert.rejects(invoke("repeated", repeated));
  const repeatedSlice = await db.syncSlice.findFirstOrThrow({ where: { run: { status: "FAILED" } },
    orderBy: { createdAt: "desc" } });
  assert.equal(await db.syncSliceEvidence.count({ where: { sliceId: repeatedSlice.id } }), 1);
  await assert.rejects(invoke("bounded", new MockTransport([oauth,
    (request) => json({ transactions: [fixtures[0]], next: nextFor(request, 2) })]),
  { query: { ...query, maxPages: 1 } }));

  const rawBeforeFailure = await db.rawSourceRecord.count();
  await assert.rejects(invoke("recover", new MockTransport([oauth,
    (request) => json({ transactions: [fixtures[0]], next: nextFor(request, 2) }),
    () => ({ status: 500, headers: {}, body: encoder.encode("sensitive-upstream-body") })])),
  (error) => !JSON.stringify(error).includes("sensitive-upstream-body"));
  const failed = await db.syncSlice.findFirstOrThrow({ where: { run: { status: "FAILED" } },
    orderBy: { createdAt: "desc" } });
  assert.equal(await db.syncSliceEvidence.count({ where: { sliceId: failed.id } }), 1);
  assert.equal(await db.syncCheckpoint.count({ where: { processedSliceId: failed.id } }), 0);
  const recovered = await invoke("recover", new MockTransport([oauth,
    (request) => json({ transactions: [fixtures[0]], next: nextFor(request, 2) }),
    () => json({ transactions: [fixtures[1]] })]));
  assert.equal(recovered.sliceId, failed.id); assert.equal(recovered.pages, 2);
  assert.equal(await db.rawSourceRecord.count(), rawBeforeFailure + 1);

  const replay = await invoke("single", new MockTransport([]));
  assert.equal(replay.replayed, true);
  const beforeSame = await db.rawSourceRecord.count();
  await invoke("same-cross-run", new MockTransport([oauth, () => json(body)]));
  assert.equal(await db.rawSourceRecord.count(), beforeSame);
  await invoke("changed", new MockTransport([oauth, () => json({ ...body,
    transactions: [...fixtures, tx("TX-NEW", "OTHER")] })]));
  assert.equal(await db.rawSourceRecord.count(), beforeSame + 1);
  const differentWindowTransport = new MockTransport([oauth, () => json(body)]);
  const differentWindow = await invoke("single", differentWindowTransport, { query: { ...query,
    transactionDateFrom: new Date("2026-02-01T00:00:00.000Z"),
    transactionDateTo: new Date("2026-03-01T00:00:00.000Z") } });
  assert.equal(differentWindow.replayed, false);
  assert.equal(differentWindowTransport.requests.length, 2);

  const boundary = async (key: string, overrides: Record<string, unknown>) => {
    const noHttp = new MockTransport([]); await assert.rejects(invoke(key, noHttp, overrides));
    assert.equal(noHttp.requests.length, 0);
  };
  await boundary("cross", { tenant: { accountId: account.id, channelConnectionId: otherChannel.id },
    marketplaceId: otherMarketplace.id });
  await boundary("wrong", { tenant: { accountId: account.id, channelConnectionId: shopify.id } });
  await db.channelConnection.update({ where: { id: channel.id }, data: { status: "INACTIVE" } });
  await boundary("inactive-channel", {});
  await db.channelConnection.update({ where: { id: channel.id }, data: { status: "ACTIVE" } });
  await db.account.update({ where: { id: account.id }, data: { status: "INACTIVE" } });
  await boundary("inactive-account", {});
  await db.account.update({ where: { id: account.id }, data: { status: "ACTIVE" } });

  const epochTransport = new MockTransport([oauth,
    (request) => json({ transactions: [fixtures[0]], next: nextFor(request, 2) }),
    async () => { await db.coreChannelAuthorization.update({ where: { channelConnectionId: channel.id },
      data: { authorizationVersion: "changed-during-finances" } }); return json({ transactions: [fixtures[1]] }); }]);
  await assert.rejects(invoke("epoch", epochTransport));
  const auth = await db.ebaySellerAuthorization.findUniqueOrThrow({ where: { channelConnectionId: channel.id } });
  await db.coreChannelAuthorization.update({ where: { channelConnectionId: channel.id },
    data: { authorizationVersion: auth.authorizationVersion } });
  await db.coreChannelAuthorization.update({ where: { channelConnectionId: channel.id },
    data: { authorizationVersion: "stale" } });
  await boundary("stale", {});
  await db.coreChannelAuthorization.update({ where: { channelConnectionId: channel.id },
    data: { authorizationVersion: auth.authorizationVersion } });
  await db.ebaySellerAuthorization.update({ where: { channelConnectionId: channel.id },
    data: { grantedScopesJson: JSON.stringify(EBAY_REQUIRED_SCOPES.filter((scope) => !scope.endsWith("sell.finances"))) } });
  await boundary("missing-scope", {});
  await db.ebaySellerAuthorization.update({ where: { channelConnectionId: channel.id },
    data: { grantedScopesJson: JSON.stringify(EBAY_REQUIRED_SCOPES) } });
  await markEbayAuthorizationReauthRequired(db, tenant, now); await boundary("reauth", {});
  await persistEbaySellerAuthorization(db, tenant, { refreshToken, grantedScopes: EBAY_REQUIRED_SCOPES,
    grantedAt: now, refreshTokenExpiresAt: new Date("2030-01-01T00:00:00Z") }, testEbayCredentialEncryptionProvider);
  await revokeEbaySellerAuthorization(db, tenant, now); await boundary("revoked", {});
  await persistEbaySellerAuthorization(db, tenant, { refreshToken, grantedScopes: EBAY_REQUIRED_SCOPES,
    grantedAt: now, refreshTokenExpiresAt: new Date("2030-01-01T00:00:00Z") }, testEbayCredentialEncryptionProvider);

  for (const [key, value] of [["bad-root", { wrong: [] }],
    ["bad-next", { transactions: [fixtures[0]], next: "https://evil.invalid/sell/finances/v1/transaction?offset=2" }]] as const)
    await assert.rejects(invoke(key, new MockTransport([oauth, () => json(value)])));

  assert.equal(await db.financialLedgerEntry.count(), 0);
  assert.equal(await db.inventoryEconomicEvent.count(), 0);
  assert.equal(await db.financialAuthorityDecision.count(), 0);
  const durable = JSON.stringify(await db.sourceReference.findMany());
  for (const secret of [refreshToken, accessToken, config.clientSecret, "eb3a-test-public-jwe",
    "Signature-Input", "sig1=:"]) assert.equal(durable.includes(secret), false);
  assert.equal(decoder.decode((await db.rawSourceBlobChunk.findFirstOrThrow()).encryptedBytes).includes("TX-SALE"), false);
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((sqlite.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  console.log("eBay EB3-A signed Finances to encrypted D1 evidence: PASS");
} finally {
  await db.$disconnect(); sqlite.close(); rmSync(directory, { recursive: true, force: true });
}
