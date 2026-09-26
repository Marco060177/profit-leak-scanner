import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { persistAmazonSellerAuthorization, revokeAmazonSellerAuthorization } from "../../app/connectors/amazon/amazon-authorization.server";
import { ingestAmazonOrdersToD1, type RawSourceEncryptionBoundary } from "../../app/connectors/amazon/amazon-orders-d1.server";
import type { AmazonApplicationConfig, AmazonHttpRequest, AmazonHttpResponse,
  AmazonHttpTransport } from "../../app/connectors/amazon/amazon-types";
import { testCredentialEncryptionProvider } from "./test-credential-encryption";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const json = (value: unknown, headers: Record<string, string> = {}): AmazonHttpResponse =>
  ({ status: 200, headers, body: encoder.encode(JSON.stringify(value)) });
class MockTransport implements AmazonHttpTransport {
  requests: AmazonHttpRequest[] = [];
  private handlers: Array<(request: AmazonHttpRequest) => AmazonHttpResponse>;
  constructor(handlers: Array<(request: AmazonHttpRequest) => AmazonHttpResponse>) { this.handlers = handlers; }
  async request(request: AmazonHttpRequest) {
    this.requests.push(request); const next = this.handlers.shift();
    if (!next) throw new Error("Unexpected HTTP request"); return next(request);
  }
}
const config: AmazonApplicationConfig = { lwaClientId: "e1d-client", lwaClientSecret: "e1d-client-secret",
  userAgent: "MarginLab/E1D", timeoutMs: 1000, maxAttempts: 1 };
const refreshToken = "e1d-refresh-token"; const accessToken = "e1d-access-token";
const MARKET = "APJ6JRA9NG5V4"; const now = new Date("2026-09-27T12:00:00Z");
const query = { kind: "LAST_UPDATED" as const, after: new Date("2026-09-01T00:00:00Z"),
  before: new Date("2026-09-27T11:00:00Z") };
const lwa = () => json({ access_token: accessToken, token_type: "bearer", expires_in: 3600 });
const item = (id: string) => ({ orderItemId: id, quantityOrdered: 1, product: { asin: "B00E1D", sellerSku: `SKU-${id}` },
  fulfillment: { quantityFulfilled: 0, quantityUnfulfilled: 1 } });
const order = (id: string) => ({ orderId: id, createdTime: "2026-09-01T10:00:00Z",
  lastUpdatedTime: "2026-09-01T11:00:00Z", salesChannel: { channelName: "AMAZON", marketplaceId: MARKET },
  fulfillment: { fulfillmentStatus: "UNSHIPPED", fulfilledBy: "MERCHANT" }, orderItems: [item(`${id}-I`)] });
const page = (orders: unknown[], nextToken?: string) => ({ orders, ...(nextToken ? { pagination: { nextToken } } : {}) });
const rawKey = createHash("sha256").update("marginlab-e1d-raw-test-key-only").digest();
const rawEncryption: RawSourceEncryptionBoundary = { encryptChunk(plain) {
  const nonce = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", rawKey, nonce);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]);
} };
const decryptRaw = async (db: PrismaClient, rawId: string) => {
  const chunks = await db.rawSourceBlobChunk.findMany({ where: { rawSourceRecordId: rawId }, orderBy: { chunkIndex: "asc" } });
  return Buffer.concat(chunks.map((chunk) => {
    const bytes = Buffer.from(chunk.encryptedBytes); const decipher = createDecipheriv("aes-256-gcm", rawKey, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28)); return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
  }));
};

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-amazon-e1d-"));
const databasePath = path.join(directory, "e1d.sqlite");
const sqlite = new DatabaseSync(databasePath); sqlite.exec("PRAGMA foreign_keys=ON");
for (const name of readdirSync("prisma/migrations").filter((name) => /^\d{14}_/.test(name)).sort())
  sqlite.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
const db = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } } });

try {
  const account = await db.account.create({ data: {} });
  const channel = await db.channelConnection.create({ data: { accountId: account.id, channel: "AMAZON", externalAccountId: "e1d-seller" } });
  const tenant = { accountId: account.id, channelConnectionId: channel.id };
  await persistAmazonSellerAuthorization(db, tenant, { refreshToken, grantedAt: now }, testCredentialEncryptionProvider);
  const marketplace = await db.marketplace.create({ data: { ...tenant, externalMarketplaceId: MARKET, countryCode: "IT", currencyCode: "EUR" } });
  const mapping = await db.mappingVersion.create({ data: { platform: "AMAZON", sourceContract: "orders-v2026-01-01",
    sourceVersion: "2026-01-01", mapperSemanticVersion: "e1d", formulaCompatibilityVersion: "d2a-v1",
    checksum: "e1d-mapping", activatedAt: now } });
  const invoke = (operationKey: string, transport: AmazonHttpTransport, encryption = rawEncryption) =>
    ingestAmazonOrdersToD1({ db, tenant, marketplaceId: marketplace.id, operationKey, mappingVersionId: mapping.id,
      query, config, transport, credentialEncryptionProvider: testCredentialEncryptionProvider,
      rawEncryption: encryption, leaseOwner: `lease-${operationKey}`, now,
      retry: { now: () => now.getTime(), sleep: async () => undefined, random: () => 0 } });

  const singleBody = page([order("ORDER-1")]);
  const single = await invoke("single", new MockTransport([lwa, () => json(singleBody, { "x-amzn-requestid": "safe-1" })]));
  assert.equal(single.pages, 1); assert.equal(single.replayed, false);
  const singleEvidence = await db.syncSliceEvidence.findFirstOrThrow({ where: { sliceId: single.sliceId },
    include: { sourceObservation: true, rawSourceRecord: true } });
  assert(singleEvidence.sourceObservation); assert.equal(singleEvidence.sourceObservation.runId, single.runId);
  assert.deepEqual(await decryptRaw(db, singleEvidence.rawSourceRecordId), Buffer.from(JSON.stringify(singleBody)));
  assert.equal(singleEvidence.rawSourceRecord.ingestionRunId, single.runId);
  assert.equal((await db.syncSlice.findUniqueOrThrow({ where: { id: single.sliceId } })).status, "SUCCEEDED");

  const bodies = [page([order("ORDER-A")], "T1"), page([order("ORDER-B")], "T2"), page([order("ORDER-C")])];
  const multi = await invoke("multi", new MockTransport([lwa, ...bodies.map((body, index) =>
    () => json(body, { "x-amzn-requestid": `safe-${index + 2}` }))]));
  const multiEvidence = await db.syncSliceEvidence.findMany({ where: { sliceId: multi.sliceId },
    include: { rawSourceRecord: true, sourceObservation: true } });
  assert.equal(multiEvidence.length, 3);
  const ordered = multiEvidence.sort((a, b) => a.rawSourceRecord.sourceSnapshotVersion!.localeCompare(b.rawSourceRecord.sourceSnapshotVersion!));
  for (let index = 0; index < 3; index += 1) {
    assert.deepEqual(await decryptRaw(db, ordered[index].rawSourceRecordId), Buffer.from(JSON.stringify(bodies[index])));
    assert.equal(ordered[index].sourceObservation?.runId, multi.runId);
  }

  const sharedBody = page([order("ORDER-SHARED")]);
  const runA = await invoke("cross-run-a", new MockTransport([lwa, () => json(sharedBody)]));
  const runB = await invoke("cross-run-b", new MockTransport([lwa, () => json(sharedBody)]));
  const evidenceA = await db.syncSliceEvidence.findFirstOrThrow({ where: { sliceId: runA.sliceId }, include: { sourceObservation: true } });
  const evidenceB = await db.syncSliceEvidence.findFirstOrThrow({ where: { sliceId: runB.sliceId }, include: { sourceObservation: true } });
  assert.equal(evidenceA.rawSourceRecordId, evidenceB.rawSourceRecordId);
  assert.notEqual(evidenceA.sourceObservationId, evidenceB.sourceObservationId);
  assert.equal(evidenceA.sourceObservation?.runId, runA.runId); assert.equal(evidenceB.sourceObservation?.runId, runB.runId);
  const rawCountBeforeChange = await db.rawSourceRecord.count();
  await invoke("changed", new MockTransport([lwa, () => json(page([order("ORDER-CHANGED")]))]));
  assert.equal(await db.rawSourceRecord.count(), rawCountBeforeChange + 1);

  const noReplayHttp = new MockTransport([]);
  const replay = await invoke("single", noReplayHttp);
  assert.equal(replay.replayed, true); assert.equal(replay.sliceId, single.sliceId); assert.equal(noReplayHttp.requests.length, 0);

  const checkpointsBeforeFailure = await db.syncCheckpoint.count();
  await assert.rejects(invoke("http-failure", new MockTransport([lwa, () => ({ status: 500, headers: {}, body: encoder.encode("failure") })])));
  const failedHttpSlice = await db.syncSlice.findFirstOrThrow({ where: { sliceKey: { not: "" } }, orderBy: { createdAt: "desc" } });
  assert.equal(failedHttpSlice.status, "FAILED"); assert.equal(await db.syncCheckpoint.count(), checkpointsBeforeFailure);
  let chunks = 0;
  const failureBodies = [page([order("FAIL-A")], "F1"), page([order("FAIL-B")], "F2"), page([order("FAIL-C")])];
  await assert.rejects(invoke("encryption-failure", new MockTransport([lwa, ...failureBodies.map((body) => () => json(body))]), {
    encryptChunk(plain, index) { chunks += 1; if (chunks === 2) throw new Error("test encryption failure"); return rawEncryption.encryptChunk(plain, index); },
  }), /test encryption failure/);
  const failedEncryption = await db.syncSlice.findFirstOrThrow({ where: { status: "FAILED" }, orderBy: { createdAt: "desc" } });
  assert.equal(await db.syncCheckpoint.count({ where: { processedSliceId: failedEncryption.id } }), 0);
  const recovered = await invoke("encryption-failure", new MockTransport([lwa, ...failureBodies.map((body) => () => json(body))]));
  assert.equal(recovered.sliceId, failedEncryption.id); assert.equal(recovered.pages, 3);
  assert.equal((await db.syncSlice.findUniqueOrThrow({ where: { id: recovered.sliceId } })).status, "SUCCEEDED");
  assert.equal(await db.syncSliceEvidence.count({ where: { sliceId: recovered.sliceId } }), 3);

  const beforeBoundary = { raw: await db.rawSourceRecord.count(), observations: await db.sourceObservation.count(), evidence: await db.syncSliceEvidence.count() };
  await revokeAmazonSellerAuthorization(db, tenant, now);
  const boundaryTransport = new MockTransport([]);
  await assert.rejects(invoke("revoked", boundaryTransport)); assert.equal(boundaryTransport.requests.length, 0);
  assert.deepEqual({ raw: await db.rawSourceRecord.count(), observations: await db.sourceObservation.count(), evidence: await db.syncSliceEvidence.count() }, beforeBoundary);

  assert.equal(await db.normalizedOrder.count(), 0); assert.equal(await db.normalizedOrderItem.count(), 0);
  assert.equal(await db.financialLedgerEntry.count(), 0); assert.equal(await db.inventoryEconomicEvent.count(), 0);
  const references = await db.sourceReference.findMany();
  const durableMetadata = JSON.stringify(references);
  for (const secret of [refreshToken, accessToken, config.lwaClientSecret, "x-amz-access-token", "Authorization"])
    assert.equal(durableMetadata.includes(secret), false);
  assert.equal(decoder.decode((await db.rawSourceBlobChunk.findFirstOrThrow()).encryptedBytes).includes("ORDER-"), false);
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((sqlite.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  console.log("Amazon E1-D D1 ingestion, provenance, encryption, replay and dormancy: PASS");
} finally {
  await db.$disconnect(); sqlite.close(); rmSync(directory, { recursive: true, force: true });
}
