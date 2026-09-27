import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { persistAmazonSellerAuthorization } from "../../app/connectors/amazon/amazon-authorization.server";
import { AMAZON_FINANCES_MAX_WINDOW_MS, AMAZON_FINANCES_SAFETY_LAG_MS,
  planAmazonFinancesSync, synchronizeAmazonFinances, synchronizeTargetedAmazonFinances } from
  "../../app/connectors/amazon/amazon-finances-sync.server";
import type { RawSourceEncryptionBoundary } from "../../app/connectors/amazon/amazon-orders-d1.server";
import type { RawSourceDecryptionBoundary } from "../../app/connectors/amazon/amazon-finances-d2b.server";
import type { AmazonApplicationConfig, AmazonHttpRequest, AmazonHttpResponse, AmazonHttpTransport } from
  "../../app/connectors/amazon/amazon-types";
import { testCredentialEncryptionProvider } from "./test-credential-encryption";

const now = new Date("2026-09-30T12:00:00Z");
const days = (value: number) => value * 24 * 60 * 60 * 1_000;
const longPlan = planAmazonFinancesSync({ now, backfillStart: new Date(now.getTime() - days(400)),
  checkpointWatermark: null });
assert.equal(longPlan.kind, "BACKFILL");
assert.equal(longPlan.safeUpperBound.getTime(), now.getTime() - AMAZON_FINANCES_SAFETY_LAG_MS);
assert.equal(longPlan.windows.length, 3);
assert.equal(longPlan.windows[0].postedBefore.getTime() - longPlan.windows[0].postedAfter.getTime(),
  AMAZON_FINANCES_MAX_WINDOW_MS);
for (let index = 1; index < longPlan.windows.length; index += 1)
  assert.equal(longPlan.windows[index - 1].postedBefore.getTime(), longPlan.windows[index].postedAfter.getTime());
assert(longPlan.windows.every((window) => window.postedBefore <= longPlan.safeUpperBound &&
  window.postedBefore > window.postedAfter &&
  window.postedBefore.getTime() - window.postedAfter.getTime() <= AMAZON_FINANCES_MAX_WINDOW_MS));
const checkpoint = new Date(now.getTime() - days(1));
const incremental = planAmazonFinancesSync({ now, backfillStart: new Date(now.getTime() - days(365)),
  checkpointWatermark: checkpoint });
assert.equal(incremental.kind, "INCREMENTAL");
assert(incremental.windows[0].postedAfter < checkpoint, "incremental plan deliberately overlaps");
assert.equal(planAmazonFinancesSync({ now, backfillStart: now, checkpointWatermark: null }).kind, "NO_WORK");
assert.equal(planAmazonFinancesSync({ now, backfillStart: new Date(0),
  checkpointWatermark: new Date(now.getTime()) }).kind, "NO_WORK");
assert.deepEqual(planAmazonFinancesSync({ now, backfillStart: new Date(now.getTime() - days(400)),
  checkpointWatermark: null }), longPlan, "planning is deterministic");

const encoder = new TextEncoder();
const reply = (value: unknown): AmazonHttpResponse => ({ status: 200, headers: {},
  body: encoder.encode(typeof value === "string" ? value : JSON.stringify(value)) });
class Transport implements AmazonHttpTransport {
  requests: AmazonHttpRequest[] = [];
  private readonly handlers: Array<() => AmazonHttpResponse>;
  constructor(handlers: Array<() => AmazonHttpResponse>) { this.handlers = handlers; }
  async request(request: AmazonHttpRequest) { this.requests.push(request); const next = this.handlers.shift();
    if (!next) throw new Error("Unexpected request"); return next(); }
}
const MARKET = "APJ6JRA9NG5V4";
const transaction = `{"transactionId":"E2F-T1","transactionType":"UnknownFutureType",` +
  `"transactionStatus":"RELEASED","postedDate":"2026-09-29T10:00:00Z",` +
  `"totalAmount":{"currencyAmount":7,"currencyCode":"EUR"},` +
  `"marketplaceDetails":{"marketplaceId":"${MARKET}"},"relatedIdentifiers":[],"items":[],"contexts":[],"breakdowns":[]}`;
const page = (items: string, token?: string) => `{"payload":{"transactions":[${items}]${token ? `,"nextToken":"${token}"` : ""}}}`;
const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-amazon-e2f-"));
const databasePath = path.join(directory, "e2f.sqlite");
const sqlite = new DatabaseSync(databasePath); sqlite.exec("PRAGMA foreign_keys=ON");
for (const name of readdirSync("prisma/migrations").filter((value) => /^\d{14}_/.test(value)).sort())
  sqlite.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
const db = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } } });
const key = createHash("sha256").update("e2f-test-key").digest();
const rawEncryption: RawSourceEncryptionBoundary = { encryptChunk(plain) { const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce); const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]); } };
const rawDecryption: RawSourceDecryptionBoundary = { decryptChunk(encrypted) { const value = Buffer.from(encrypted);
  const decipher = createDecipheriv("aes-256-gcm", key, value.subarray(0, 12));
  decipher.setAuthTag(value.subarray(12, 28)); return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]); } };
try {
  const account = await db.account.create({ data: {} });
  const connection = await db.channelConnection.create({ data: { accountId: account.id,
    channel: "AMAZON", externalAccountId: "e2f-seller" } });
  const tenant = { accountId: account.id, channelConnectionId: connection.id };
  await persistAmazonSellerAuthorization(db, tenant, { refreshToken: "refresh", grantedAt: now },
    testCredentialEncryptionProvider);
  const marketplace = await db.marketplace.create({ data: { ...tenant, externalMarketplaceId: MARKET,
    countryCode: "IT", currencyCode: "EUR" } });
  const mapping = await db.mappingVersion.create({ data: { platform: "AMAZON", sourceContract: "finances-v2024-06-19",
    sourceVersion: "2024-06-19", mapperSemanticVersion: "amazon-finances-v2024-06-19-e2c-v1",
    formulaCompatibilityVersion: "d2b-v1", checksum: "e2f", activatedAt: now } });
  const config: AmazonApplicationConfig = { lwaClientId: "client", lwaClientSecret: "secret",
    userAgent: "MarginLab/E2F", timeoutMs: 1000, maxAttempts: 1 };
  const boundary = { db, tenant, marketplaceId: marketplace.id, mappingVersionId: mapping.id, config,
    credentialEncryptionProvider: testCredentialEncryptionProvider, rawEncryption, rawDecryption,
    leaseOwner: "e2f-worker", clock: () => now,
    retry: { now: () => now.getTime(), sleep: async () => undefined, random: () => 0 } };
  const transport = new Transport([() => reply({ access_token: "access", token_type: "bearer", expires_in: 3600 }),
    () => reply(page("", "NEXT")), () => reply(page(transaction))]);
  const result = await synchronizeAmazonFinances({ ...boundary, transport,
    backfillStart: new Date("2026-09-29T00:00:00Z"), maxOperationAttempts: 1 });
  assert.equal(result.windowsCompleted, 1);
  assert.equal(result.pagesAcquired, 2, "empty page with next token is retained and followed");
  assert.equal(result.transactionsObserved, 1);
  assert.equal(result.d2bBlocked, 1, "semantic blocking does not prevent source coverage");
  assert.equal((await db.syncCheckpoint.findFirstOrThrow()).windowWatermark?.getTime(), result.checkpointAfter?.getTime());
  const beforeTargeted = await db.syncCheckpoint.findFirstOrThrow();
  const targetedTransport = new Transport([() => reply({ access_token: "access", token_type: "bearer", expires_in: 3600 }),
    () => reply(page(transaction))]);
  await synchronizeTargetedAmazonFinances({ ...boundary, transport: targetedTransport,
    relatedIdentifier: { name: "ORDER_ID", value: "ORDER-1" }, maxOperationAttempts: 1 });
  const afterTargeted = await db.syncCheckpoint.findFirstOrThrow();
  assert.equal(afterTargeted.processedSliceId, beforeTargeted.processedSliceId);
  assert.equal(afterTargeted.windowWatermark?.getTime(), beforeTargeted.windowWatermark?.getTime());
  assert.equal(await db.rawSourceRecord.count(), 3, "targeted evidence is preserved without false broad coverage");
  assert.equal(readdirSync("prisma/migrations").filter((value) => /^\d{14}_/.test(value)).length, 25);
  console.log("Amazon E2-F integration tests passed");
} finally {
  await db.$disconnect(); sqlite.close(); rmSync(directory, { recursive: true, force: true });
}
