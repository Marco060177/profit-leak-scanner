import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { persistAmazonSellerAuthorization, revokeAmazonSellerAuthorization } from
  "../../app/connectors/amazon/amazon-authorization.server";
import {
  AMAZON_FINANCES_STREAM,
  ingestAmazonFinancesToD1,
  type AmazonFinancesD1Page,
} from "../../app/connectors/amazon/amazon-finances-d1.server";
import {
  parseAmazonFinancesEvidencePage,
  type AmazonFinancesQuery,
} from "../../app/connectors/amazon/amazon-finances.server";
import { mapAmazonFinancialTransactions } from
  "../../app/connectors/amazon/amazon-finances-mapper.server";
import type { RawSourceEncryptionBoundary } from
  "../../app/connectors/amazon/amazon-orders-d1.server";
import type {
  AmazonApplicationConfig,
  AmazonHttpRequest,
  AmazonHttpResponse,
  AmazonHttpTransport,
} from "../../app/connectors/amazon/amazon-types";
import { testCredentialEncryptionProvider } from "./test-credential-encryption";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const bytes = (body: string, status = 200, headers: Record<string, string> = {}): AmazonHttpResponse =>
  ({ status, headers, body: encoder.encode(body) });
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  bytes(JSON.stringify(value), status, headers);
class MockTransport implements AmazonHttpTransport {
  requests: AmazonHttpRequest[] = [];
  private readonly handlers: Array<(request: AmazonHttpRequest) => AmazonHttpResponse | Promise<AmazonHttpResponse>>;
  constructor(handlers: Array<(request: AmazonHttpRequest) => AmazonHttpResponse | Promise<AmazonHttpResponse>>) {
    this.handlers = handlers;
  }
  async request(request: AmazonHttpRequest) {
    this.requests.push(request);
    const handler = this.handlers.shift();
    if (!handler) throw new Error("Unexpected request");
    return handler(request);
  }
}

const config: AmazonApplicationConfig = { lwaClientId: "e2d-client", lwaClientSecret: "e2d-client-secret",
  userAgent: "MarginLab/E2D", timeoutMs: 1000, maxAttempts: 1 };
const refresh = "e2d-refresh-token";
const access = "e2d-access-token";
const MARKET = "APJ6JRA9NG5V4";
const now = new Date("2026-09-28T12:00:00Z");
const retry = { now: () => now.getTime(), sleep: async () => undefined, random: () => 0 };
const lwa = () => json({ access_token: access, token_type: "bearer", expires_in: 3600 });
const transaction = (id: string, options: { status?: string; type?: string; amount?: string;
  breakdowns?: string; related?: unknown[] } = {}) => `{"transactionId":${JSON.stringify(id)},` +
  `"transactionType":${JSON.stringify(options.type ?? "Shipment")},` +
  `"transactionStatus":${JSON.stringify(options.status ?? "RELEASED")},` +
  `"postedDate":"2026-09-01T10:00:00.123Z",` +
  `"totalAmount":{"currencyAmount":${options.amount ?? "12.34"},"currencyCode":"EUR"},` +
  `"marketplaceDetails":{"marketplaceId":${JSON.stringify(MARKET)},"marketplaceName":"Amazon.it"},` +
  `"relatedIdentifiers":${JSON.stringify(options.related ?? [])},"items":[],"contexts":[],` +
  `"breakdowns":${options.breakdowns ?? "[]"}}`;
const page = (transactions: string[], nextToken?: string) =>
  `{"payload":{"transactions":[${transactions.join(",")}]${nextToken === undefined ? "" :
    `,"nextToken":${JSON.stringify(nextToken)}`}}}`;

const rawKey = createHash("sha256").update("marginlab-e2d-raw-test-key-only").digest();
const rawEncryption: RawSourceEncryptionBoundary = { encryptChunk(plain) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", rawKey, nonce);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]);
} };
const decryptRaw = async (db: PrismaClient, rawId: string) => {
  const chunks = await db.rawSourceBlobChunk.findMany({ where: { rawSourceRecordId: rawId },
    orderBy: { chunkIndex: "asc" } });
  return Buffer.concat(chunks.map((chunk) => {
    const value = Buffer.from(chunk.encryptedBytes);
    const decipher = createDecipheriv("aes-256-gcm", rawKey, value.subarray(0, 12));
    decipher.setAuthTag(value.subarray(12, 28));
    return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]);
  }));
};

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-amazon-e2d-"));
const databasePath = path.join(directory, "e2d.sqlite");
const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA foreign_keys=ON");
for (const name of readdirSync("prisma/migrations").filter((value) => /^\d{14}_/.test(value)).sort())
  sqlite.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
const db = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } } });

try {
  const account = await db.account.create({ data: {} });
  const connection = await db.channelConnection.create({ data: { accountId: account.id,
    channel: "AMAZON", externalAccountId: "seller-e2d" } });
  const tenant = { accountId: account.id, channelConnectionId: connection.id };
  await persistAmazonSellerAuthorization(db, tenant, { refreshToken: refresh, grantedAt: now },
    testCredentialEncryptionProvider);
  const marketplace = await db.marketplace.create({ data: { ...tenant,
    externalMarketplaceId: MARKET, countryCode: "IT", currencyCode: "EUR" } });
  const mapping = await db.mappingVersion.create({ data: { platform: "AMAZON",
    sourceContract: "finances-v2024-06-19", sourceVersion: "2024-06-19",
    mapperSemanticVersion: "amazon-finances-v2024-06-19-e2c-v1",
    formulaCompatibilityVersion: "d2b-v1", checksum: "e2d-mapping", activatedAt: now } });
  const defaultQuery: AmazonFinancesQuery = { postedAfter: new Date("2026-09-01T00:00:00Z"),
    postedBefore: new Date("2026-09-02T00:00:00Z") };
  const invoke = (operationKey: string,
    handlers: Array<(request: AmazonHttpRequest) => AmazonHttpResponse | Promise<AmazonHttpResponse>>,
    query: AmazonFinancesQuery = defaultQuery, encryption = rawEncryption,
    tenantOverride = tenant, marketplaceOverride = marketplace.id) => {
    const transport = new MockTransport([lwa, ...handlers]);
    return { transport, result: ingestAmazonFinancesToD1({ db, tenant: tenantOverride,
      marketplaceId: marketplaceOverride, operationKey, mappingVersionId: mapping.id,
      query, config, transport, credentialEncryptionProvider: testCredentialEncryptionProvider,
      rawEncryption: encryption, leaseOwner: `lease-${operationKey}`, now, retry }) };
  };

  const singleText = page([transaction("T-1", { related: [
    { relatedIdentifierName: "ORDER_ID", relatedIdentifierValue: "ORDER-1" },
  ] })]);
  const single = await invoke("single", [() => bytes(singleText, 200,
    { "x-amzn-requestid": "request-single" })]).result;
  assert.equal(single.replayed, false);
  assert.equal(single.pages, 1);
  const singlePage = single.evidence[0] as AmazonFinancesD1Page;
  const singleRaw = await db.rawSourceRecord.findUniqueOrThrow({ where: { id: singlePage.rawSourceRecordId } });
  assert.deepEqual(await decryptRaw(db, singleRaw.id), Buffer.from(singleText));
  assert.equal(singleRaw.payloadChecksum, createHash("sha256").update(Buffer.from(singleText)).digest("hex"));
  assert.equal(singleRaw.sourceVersion, "2024-06-19");
  assert.equal(singleRaw.sourceEntityType, "FINANCES_LIST_TRANSACTIONS_PAGE");
  assert.equal(singlePage.canonicalTransactions[0].economicEventKey, "amazon-finances:transaction:T-1");
  assert.equal(singlePage.canonicalTransactions[0].economicLeaves[0].sourceMoney.amountAtoms, 1234n);
  assert.equal((await db.syncSlice.findUniqueOrThrow({ where: { id: single.sliceId } })).status, "SUCCEEDED");
  assert.equal((await db.syncRun.findUniqueOrThrow({ where: { id: single.runId } })).stream, AMAZON_FINANCES_STREAM);

  const refs = await db.sourceReference.findMany({ where: { rawSourceRecordId: singleRaw.id } });
  const txRef = refs.find((value) => value.targetKind === "AMAZON_FINANCES_TRANSACTION");
  assert.equal(txRef?.targetKey, "T-1");
  assert.equal(txRef?.sourceLeafPath, "$.payload.transactions[0]");
  assert.equal(txRef?.sourceLeafPath + singlePage.canonicalTransactions[0].economicLeaves[0].sourceLeafPath,
    "$.payload.transactions[0]/totalAmount");
  const requestRef = refs.find((value) => value.targetKind === "AMAZON_FINANCES_REQUEST");
  assert(requestRef);
  const requestMetadata = JSON.parse(requestRef.targetKey) as Record<string, unknown>;
  assert.equal(requestMetadata.postedAfter, "2026-09-01T00:00:00.000Z");
  assert.equal(requestMetadata.postedBefore, "2026-09-02T00:00:00.000Z");
  assert.equal(requestMetadata.marketplaceId, MARKET);
  assert.equal(requestMetadata.apiVersion, "2024-06-19");
  assert.equal(requestMetadata.operation, "listTransactions");

  // Empty intermediate and final pages remain independent evidence.
  const multiTexts = [page([transaction("P-1")], "token-a"), page([], "token-b"),
    page([transaction("P-2")], "token-c"), page([])];
  const multi = await invoke("multi", multiTexts.map((text) => () => bytes(text))).result;
  assert.equal(multi.pages, 4);
  const multiEvidence = await db.syncSliceEvidence.findMany({ where: { sliceId: multi.sliceId },
    include: { rawSourceRecord: true, sourceObservation: true } });
  assert.equal(multiEvidence.length, 4);
  assert(multiEvidence.every((value) => value.sourceObservation?.runId === multi.runId));
  const pageRefs = await db.sourceReference.findMany({ where: { targetKind: "AMAZON_FINANCES_PAGE",
    rawSourceRecord: { sourceObservations: { some: { runId: multi.runId } } } } });
  assert.equal(pageRefs.length, 4);
  assert(pageRefs.some((value) => value.targetKey.includes("page:2:next:PRESENT:request:")));
  assert(pageRefs.some((value) => value.targetKey.includes("page:4:next:ABSENT:request:")));

  // Identical bytes dedupe raw content but each run has an independent observation.
  const sharedText = page([transaction("SHARED")]);
  const runA = await invoke("shared-a", [() => bytes(sharedText)]).result;
  const runB = await invoke("shared-b", [() => bytes(sharedText)]).result;
  const evidenceA = await db.syncSliceEvidence.findFirstOrThrow({ where: { sliceId: runA.sliceId } });
  const evidenceB = await db.syncSliceEvidence.findFirstOrThrow({ where: { sliceId: runB.sliceId } });
  assert.equal(evidenceA.rawSourceRecordId, evidenceB.rawSourceRecordId);
  assert.notEqual(evidenceA.sourceObservationId, evidenceB.sourceObservationId);
  const noHttp = new MockTransport([]);
  const replay = await ingestAmazonFinancesToD1({ db, tenant, marketplaceId: marketplace.id,
    operationKey: "shared-a", mappingVersionId: mapping.id, query: defaultQuery, config,
    transport: noHttp, credentialEncryptionProvider: testCredentialEncryptionProvider,
    rawEncryption, leaseOwner: "replay", now, retry });
  assert.equal(replay.replayed, true);
  assert.equal(noHttp.requests.length, 0);

  // Exact unrepresentable money and unknown semantics are valid D1 evidence and retain blockers.
  const hugeText = page([transaction("HUGE", { type: "FutureTransaction", status: "FUTURE_STATUS",
    amount: "12345678901234567890.123456789", breakdowns:
      '[{"breakdownType":"FutureBreakdown","breakdownAmount":{"currencyAmount":0.0000000000001,"currencyCode":"EUR"},"breakdowns":[]}]' })]);
  const huge = await invoke("huge", [() => bytes(hugeText)]).result;
  const hugeCanonical = huge.evidence[0].canonicalTransactions[0];
  assert.equal(hugeCanonical.transactionType, "FutureTransaction");
  assert.equal(hugeCanonical.transactionStatus, "FUTURE_STATUS");
  assert.equal(hugeCanonical.informationalMonetaryNodes[0].sourceMoney.sourceAmountText,
    "12345678901234567890.123456789");
  assert.equal(hugeCanonical.economicLeaves[0].representability, "UNREPRESENTABLE");
  if (hugeCanonical.economicLeaves[0].representability === "UNREPRESENTABLE")
    assert.equal(hugeCanonical.economicLeaves[0].reasonCode, "MONEY_SCALE_OUT_OF_RANGE");
  assert.deepEqual(await decryptRaw(db, huge.evidence[0].rawSourceRecordId), Buffer.from(hugeText));

  // Corrections and status evolution create immutable new raw states with stable economic identity.
  const deferredText = page([transaction("EVOLVE", { status: "DEFERRED", amount: "10.00" })]);
  const releasedText = page([transaction("EVOLVE", { status: "RELEASED", amount: "12.00" })]);
  const deferred = await invoke("evolve-deferred", [() => bytes(deferredText)]).result;
  const released = await invoke("evolve-released", [() => bytes(releasedText)]).result;
  const deferredTx = deferred.evidence[0].canonicalTransactions[0];
  const releasedTx = released.evidence[0].canonicalTransactions[0];
  assert.notEqual(deferred.evidence[0].rawSourceRecordId, released.evidence[0].rawSourceRecordId);
  assert.equal(deferredTx.finality, "DEFERRED");
  assert.equal(releasedTx.finality, "RELEASED");
  assert.equal(deferredTx.economicEventKey, releasedTx.economicEventKey);
  assert.equal(deferredTx.economicLeaves[0].sourceComponentKey,
    releasedTx.economicLeaves[0].sourceComponentKey);

  // Targeted request evidence is durable without pagination tokens or credentials.
  for (const [name, value] of [["ORDER_ID", "ORDER-TARGET"],
    ["FINANCIAL_EVENT_GROUP_ID", "GROUP-TARGET"]] as const) {
    const targetedQuery: AmazonFinancesQuery = { relatedIdentifier: { name, value },
      transactionStatus: "DEFERRED_RELEASED", includeMarketplaceFilter: false };
    const targeted = await invoke(`target-${name}`, [() => bytes(page([]))], targetedQuery).result;
    const rawId = targeted.evidence[0].rawSourceRecordId;
    const reference = await db.sourceReference.findFirstOrThrow({ where: {
      rawSourceRecordId: rawId, targetKind: "AMAZON_FINANCES_REQUEST" } });
    const metadata = JSON.parse(reference.targetKey) as Record<string, unknown>;
    assert.equal(metadata.relatedIdentifierName, name);
    assert.equal(metadata.relatedIdentifierValue, value);
    assert.equal(metadata.transactionStatus, "DEFERRED_RELEASED");
    assert.equal(metadata.marketplaceId, null);
  }

  // Encrypted raw bytes can be replayed through E2-B and E2-C without another Amazon request.
  const replayBytes = await decryptRaw(db, singleRaw.id);
  const parsed = parseAmazonFinancesEvidencePage(replayBytes);
  const replayMapped = mapAmazonFinancialTransactions({ pages: [{ pageIndex: 1,
    body: replayBytes, transactions: parsed.transactions, requestId: null,
    nextToken: parsed.nextToken ?? null }] });
  assert.equal(replayMapped[0].economicEventKey, "amazon-finances:transaction:T-1");

  // Conflicting duplicate identities preserve raw truth and fail normalization/slice completion.
  const conflictText = page([transaction("CONFLICT", { amount: "1.00" }),
    transaction("CONFLICT", { amount: "2.00" })]);
  await assert.rejects(invoke("conflict", [() => bytes(conflictText)]).result,
    (error: unknown) => error instanceof Error && error.message.includes("source conflict"));
  const conflictRaw = await db.rawSourceRecord.findFirstOrThrow({ where: {
    sourceEntityId: `${MARKET}:listTransactions:page:1`,
    payloadChecksum: createHash("sha256").update(conflictText).digest("hex") } });
  assert.deepEqual(await decryptRaw(db, conflictRaw.id), Buffer.from(conflictText));
  assert.equal(await db.sourceObservation.count({ where: { rawSourceRecordId: conflictRaw.id } }), 1);
  assert.equal((await db.normalizationRun.findFirstOrThrow({ where: {
    rawSourceRecordId: conflictRaw.id }, orderBy: { normalizationRevision: "desc" } })).status, "FAILED");
  const conflictSlice = await db.syncSlice.findFirstOrThrow({ where: {
    stream: AMAZON_FINANCES_STREAM, status: "FAILED" }, orderBy: { createdAt: "desc" } });
  assert.equal(await db.syncCheckpoint.count({ where: { processedSliceId: conflictSlice.id } }), 0);

  // Acquisition and raw persistence failures cannot complete a slice or checkpoint.
  const checkpointsBefore = await db.syncCheckpoint.count();
  await assert.rejects(invoke("http-failure", [() => bytes("failure", 500)]).result);
  let encryptionCalls = 0;
  const failingEncryption: RawSourceEncryptionBoundary = { encryptChunk(plain, index) {
    encryptionCalls += 1;
    if (encryptionCalls === 1) throw new Error("test raw failure");
    return rawEncryption.encryptChunk(plain, index);
  } };
  await assert.rejects(invoke("raw-failure", [() => bytes(page([transaction("RAW-FAIL")]))],
    defaultQuery, failingEncryption).result, /test raw failure/);
  assert.equal(await db.syncCheckpoint.count(), checkpointsBefore);

  // A concurrent checkpoint change rejects completion; the new slice cannot claim coverage.
  const checkpointBeforeRace = await db.syncCheckpoint.findFirstOrThrow({ where: {
    channelConnectionId: connection.id, stream: AMAZON_FINANCES_STREAM } });
  const race = invoke("completion-race", [async () => {
    await db.syncCheckpoint.update({ where: { id: checkpointBeforeRace.id },
      data: { processedSliceId: single.sliceId } });
    return bytes(page([transaction("RACE")]));
  }]);
  await assert.rejects(race.result, /checkpoint changed concurrently/);
  const raceSlice = await db.syncSlice.findFirstOrThrow({ where: {
    stream: AMAZON_FINANCES_STREAM, status: "FAILED" }, orderBy: { createdAt: "desc" } });
  assert.notEqual((await db.syncCheckpoint.findUniqueOrThrow({ where: { id: checkpointBeforeRace.id } }))
    .processedSliceId, raceSlice.id);
  await db.syncCheckpoint.update({ where: { id: checkpointBeforeRace.id },
    data: { processedSliceId: checkpointBeforeRace.processedSliceId } });

  // Ownership failures occur before network acquisition and before D1 writes.
  const foreignAccount = await db.account.create({ data: {} });
  const foreignConnection = await db.channelConnection.create({ data: { accountId: foreignAccount.id,
    channel: "AMAZON", externalAccountId: "foreign-e2d" } });
  const foreignTenant = { accountId: foreignAccount.id, channelConnectionId: foreignConnection.id };
  const beforeForeign = { raw: await db.rawSourceRecord.count(), observations: await db.sourceObservation.count() };
  const cross = invoke("cross-tenant", [], defaultQuery, rawEncryption, foreignTenant, marketplace.id);
  await assert.rejects(cross.result);
  assert.equal(cross.transport.requests.length, 0);
  const secondConnection = await db.channelConnection.create({ data: { accountId: account.id,
    channel: "AMAZON", externalAccountId: "second-e2d" } });
  const crossConnection = invoke("cross-connection", [], defaultQuery, rawEncryption,
    { accountId: account.id, channelConnectionId: secondConnection.id }, marketplace.id);
  await assert.rejects(crossConnection.result);
  assert.equal(crossConnection.transport.requests.length, 0);
  assert.deepEqual({ raw: await db.rawSourceRecord.count(), observations: await db.sourceObservation.count() }, beforeForeign);

  await revokeAmazonSellerAuthorization(db, tenant, now);
  const revoked = invoke("revoked", []);
  await assert.rejects(revoked.result);
  assert.equal(revoked.transport.requests.length, 0);

  // E2-D remains strictly dormant below D1 and does not overlap the Orders stream.
  assert.equal(await db.normalizedOrder.count(), 0);
  assert.equal(await db.normalizedOrderItem.count(), 0);
  assert.equal(await db.financialLedgerEntry.count(), 0);
  assert.equal(await db.financialAuthorityDecision.count(), 0);
  assert.equal(await db.financialAuthorityScope.count(), 0);
  assert.equal(await db.financialAuthorityEvidence.count(), 0);
  assert.equal(await db.financialComponentSelection.count(), 0);
  assert.equal(await db.costRecord.count(), 0);
  assert.equal(await db.inventoryEconomicEvent.count(), 0);
  assert.equal(await db.normalizedTaxEvidence.count(), 0);
  assert.equal(await db.currencyPolicyVersion.count(), 0);
  assert.equal(await db.syncRun.count({ where: { stream: "orders" } }), 0);

  const durable = JSON.stringify({
    references: await db.sourceReference.findMany(),
    records: await db.rawSourceRecord.findMany({ select: { sourceEntityId: true,
      sourceVersion: true, sourceSnapshotVersion: true, payloadChecksum: true } }),
  });
  for (const secret of [refresh, access, config.lwaClientSecret, "x-amz-access-token", "Authorization",
    "buyerName", "buyerEmail", "shippingAddress"])
    assert.equal(durable.includes(secret), false);
  assert.equal(decoder.decode((await db.rawSourceBlobChunk.findFirstOrThrow()).encryptedBytes).includes("T-1"), false);
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((sqlite.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  console.log("Amazon E2-D Finances D1 ingestion and immutable evidence: PASS");
} finally {
  await db.$disconnect();
  sqlite.close();
  rmSync(directory, { recursive: true, force: true });
}
