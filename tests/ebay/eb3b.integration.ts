import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { attachSourceObservationToSliceTx, claimSyncSlice, completeSyncSliceWithoutCheckpointTx,
  prepareSyncSlice, recordSourceObservationTx, storeRawSourceRecord }
  from "../../app/core/data-core-d1.server";
import { markEbayAuthorizationReauthRequired, persistEbaySellerAuthorization,
  revokeEbaySellerAuthorization } from "../../app/connectors/ebay/ebay-authorization.server";
import { ingestEbayFinancesToD1 } from "../../app/connectors/ebay/ebay-finances-d1.server";
import { EBAY_FINANCES_MINIMIZED_MAPPING_VERSION, EBAY_FINANCES_MINIMIZED_SOURCE_VERSION,
  projectEbayFinancesEconomic, serializeEbayFinancesEconomicProjection }
  from "../../app/connectors/ebay/ebay-finances-economic-projection";
import { ingestEbayFinancesD1ToD2B } from "../../app/connectors/ebay/ebay-finances-d2b.server";
import { mapEbayFinancialTransaction, parseEbayFinancesEvidencePage } from
  "../../app/connectors/ebay/ebay-finances-mapper.server";
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
  transactionDate: "2026-09-03T10:00:00.000Z", bookingEntry: "CREDIT",
  amount: { value: "7.2500", currency: "EUR" }, ...extras });
const fixtures = [tx("TX-SALE", "SALE", { orderId: "ORDER-EXACT",
  totalFeeBasisAmount: { value: "8.3000", currency: "EUR" },
  buyer: { username: "private-buyer", fullName: "Private Buyer",
    address: { addressLine1: "Secret Street" }, phone: "+390000", email: "buyer@example.invalid" },
  orderLineItems: [{ lineItemId: "LINE-EXACT", marketplaceFees: [{ feeType: "FINAL_VALUE_FEE",
    amount: { value: "1.05", currency: "EUR" } }, { feeType: "FINAL_VALUE_FEE",
    amount: { value: "1.05", currency: "EUR" } }, { feeType: "FINAL_VALUE_FEE",
    amount: { value: "0.25", currency: "EUR" } }] }] }),
tx("TX-FEE", "NON_SALE_CHARGE", { bookingEntry: "DEBIT", amount: { value: "2.50", currency: "EUR" } }),
tx("TX-REFUND", "REFUND", { bookingEntry: "DEBIT", amount: { value: "7.25", currency: "EUR" } }),
tx("TX-CREDIT", "CREDIT", { amount: { value: "1.2300", currency: "EUR" } }),
tx("TX-FUTURE", "FUTURE_NEW_TYPE"),
{ transactionId: "ZZ-MISSING-TYPE", transactionStatus: "COMPLETED", bookingEntry: "CREDIT",
  transactionDate: "2026-09-03T10:00:00.000Z", amount: { value: "4.20", currency: "EUR" } }];
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
const rawDecryption = { decryptChunk(encrypted: Uint8Array) {
  const bytes = Buffer.from(encrypted); const decipher = createDecipheriv("aes-256-gcm", rawKey,
    bytes.subarray(0, 12)); decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
} };

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
    sourceContract: "sell-finances-transaction-economic-v1",
    sourceVersion: EBAY_FINANCES_MINIMIZED_SOURCE_VERSION,
    mapperSemanticVersion: EBAY_FINANCES_MINIMIZED_MAPPING_VERSION, formulaCompatibilityVersion: "d2b-v1",
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
  assert.deepEqual(await decryptRaw(db, evidence.rawSourceRecordId), Buffer.from(
    serializeEbayFinancesEconomicProjection(projectEbayFinancesEconomic(body))));
  const persistedText = decoder.decode(await decryptRaw(db, evidence.rawSourceRecordId));
  for (const pii of ["private-buyer", "Private Buyer", "Secret Street", "+390000",
    "buyer@example.invalid"])
    assert.equal(persistedText.includes(pii), false);
  assert.equal(evidence.rawSourceRecord.payloadChecksum,
    createHash("sha256").update(persistedText).digest("hex"));
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
  assert.deepEqual(fixtures.map((entry) => "transactionType" in entry ? entry.transactionType : null),
    ["SALE", "NON_SALE_CHARGE", "REFUND", "CREDIT", "FUTURE_NEW_TYPE", null]);
  const canonical = parseEbayFinancesEvidencePage(Buffer.from(JSON.stringify(body)))
    .map((value) => mapEbayFinancialTransaction(value, evidence.rawSourceRecord.payloadChecksum));
  assert.equal(canonical[0].economicLeaves[0].sourceMoney.amountAtoms, 83000n);
  assert.equal(canonical[0].economicLeaves[0].sourceMoney.amountScale, 4);
  assert.equal(canonical[0].economicLeaves[0].fixedMoney?.amountAtoms, 83n);
  assert.equal(canonical[0].economicLeaves[0].fixedMoney?.amountScale, 1);
  const published = await ingestEbayFinancesD1ToD2B({ db, tenant, sliceId: single.sliceId, rawDecryption });
  assert.equal(published.transactionCount, fixtures.length);
  const ledger = await db.financialLedgerEntry.findMany({ where: {
    binding: { sourceAuthority: "ebay-finances-v1" }, state: "PRESENT" } });
  assert(ledger.some((row) => row.projectionKind === "PRODUCT_REVENUE" && row.amountAtoms === 83n && row.amountScale === 1));
  assert(ledger.some((row) => row.projectionKind === "MARKETPLACE_COMMISSION" && row.amountAtoms === -105n));
  const saleFees = ledger.filter((row) => row.economicEventKey.includes("TX-SALE") &&
    row.projectionKind === "MARKETPLACE_COMMISSION");
  assert.equal(saleFees.length, 3);
  assert.deepEqual(saleFees.map((row) => row.sourceLeafPath).sort(), [
    "$.transactions[4]/orderLineItems/0/marketplaceFees/0/amount",
    "$.transactions[4]/orderLineItems/0/marketplaceFees/1/amount",
    "$.transactions[4]/orderLineItems/0/marketplaceFees/2/amount",
  ]);
  assert(ledger.some((row) => row.projectionKind === "MARKETPLACE_COMMISSION" && row.amountAtoms === -25n));
  assert(ledger.some((row) => row.projectionKind === "REFUND" && row.amountAtoms === -725n));
  assert(ledger.some((row) => row.projectionKind === "ADJUSTMENT" && row.amountAtoms === 123n));
  assert(ledger.some((row) => row.projectionKind === "UNKNOWN_UNCLASSIFIED"));
  const missingTypeEvidence = (await db.financialAuthorityEvidence.findMany({ where: {
    accountId: account.id, channelConnectionId: channel.id } })).find((row) => {
      const boundaries = JSON.parse(row.boundariesJson) as { transactionId?: string };
      return boundaries.transactionId === "ZZ-MISSING-TYPE";
    });
  assert(missingTypeEvidence);
  assert.equal(missingTypeEvidence.coverageState, "UNKNOWN");
  assert.equal(missingTypeEvidence.reasonCode, "UNKNOWN_UNCLASSIFIED");
  assert.equal(JSON.parse(missingTypeEvidence.boundariesJson).transactionType, null);
  assert(ledger.every((row) => row.currencyCode === "EUR"));
  assert(ledger.every((row) => row.orderId === null && row.itemId === null));
  assert((await db.financialAuthorityBinding.findMany({ where: {
    sourceAuthority: "ebay-finances-v1" } })).every((row) => row.rawSourceRecordId === evidence.rawSourceRecordId));
  const ledgerCount = await db.financialLedgerEntry.count();
  await ingestEbayFinancesD1ToD2B({ db, tenant, sliceId: single.sliceId, rawDecryption });
  assert.equal(await db.financialLedgerEntry.count(), ledgerCount);

  const parseOne = (value: unknown) => parseEbayFinancesEvidencePage(
    Buffer.from(JSON.stringify({ transactions: [value] })))[0];
  for (const invalid of [tx("BAD-MONEY", "SALE", { totalFeeBasisAmount: { value: "1e3", currency: "EUR" } }),
    tx("BAD-CURRENCY", "SALE", { totalFeeBasisAmount: { value: "1.00", currency: "eur" } })])
    assert.throws(() => mapEbayFinancialTransaction(parseOne(invalid), "a".repeat(64)));
  const outOfRange = mapEbayFinancialTransaction(parseOne(tx("BAD-RANGE", "SALE", {
    totalFeeBasisAmount: { value: "9223372036854775808", currency: "EUR" } })), "a".repeat(64));
  assert.equal(outOfRange.economicLeaves[0].representability, "UNREPRESENTABLE");
  assert.throws(() => mapEbayFinancialTransaction(parseOne(tx("MIXED", "SALE", {
    totalFeeBasisAmount: { value: "8.30", currency: "USD" }, orderLineItems: [{ lineItemId: "L",
      marketplaceFees: [{ feeType: "FINAL_VALUE_FEE", amount: { value: "1.05", currency: "EUR" } }] }],
  })), "a".repeat(64)));

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
  assert.equal(await db.rawSourceRecord.count(), rawBeforeFailure);

  const replay = await invoke("single", new MockTransport([]));
  assert.equal(replay.replayed, true);
  const beforeSame = await db.rawSourceRecord.count();
  await invoke("same-cross-run", new MockTransport([oauth, () => json(body)]));
  assert.equal(await db.rawSourceRecord.count(), beforeSame);
  const correctedBody = { ...body, transactions: fixtures.map((value) => value.transactionId === "TX-SALE" ?
    { ...value, totalFeeBasisAmount: { value: "9.3000", currency: "EUR" } } : value) };
  const correctedD1 = await invoke("changed", new MockTransport([oauth, () => json(correctedBody)]));
  assert.equal(await db.rawSourceRecord.count(), beforeSame + 1);
  await ingestEbayFinancesD1ToD2B({ db, tenant, sliceId: correctedD1.sliceId, rawDecryption });
  const saleHead = await db.financialComponentHead.findFirstOrThrow({ where: {
    sourceComponentKey: { contains: "TX-SALE:/totalFeeBasisAmount" } }, include: { current: true } });
  assert.equal(saleHead.revision, 2);
  assert.equal(saleHead.current?.amountAtoms, 93n);
  assert.equal(saleHead.current?.amountScale, 1);
  const differentWindowTransport = new MockTransport([oauth, () => json(body)]);
  const differentWindow = await invoke("single", differentWindowTransport, { query: { ...query,
    transactionDateFrom: new Date("2026-02-01T00:00:00.000Z"),
    transactionDateTo: new Date("2026-03-01T00:00:00.000Z") } });
  assert.equal(differentWindow.replayed, false);
  assert.equal(differentWindowTransport.requests.length, 2);

  const historicalMapping = await db.mappingVersion.create({ data: { platform: "EBAY",
    sourceContract: "sell-finances-transaction-v1", sourceVersion: "sell-finances-v1",
    mapperSemanticVersion: "eb3b-historical", formulaCompatibilityVersion: "d2b-v1",
    checksum: "eb3b-historical-mapping", activatedAt: now } });
  const historicalAuthorization = await db.coreChannelAuthorization.findUniqueOrThrow({
    where: { channelConnectionId: channel.id } });
  const historicalRun = await db.syncRun.create({ data: { ...tenant, stream: "ebay-finances-v1",
    authorizationVersion: historicalAuthorization.authorizationVersion,
    mappingVersionId: historicalMapping.id, status: "RUNNING", startedAt: now } });
  const historicalSlice = await db.syncSlice.create({ data: { ...tenant, runId: historicalRun.id,
    marketplaceId: marketplace.id, marketplaceScopeKey: marketplace.id, stream: "ebay-finances-v1",
    sliceKey: "historical-finances-full-page", authorizationVersion: historicalAuthorization.authorizationVersion } });
  assert.equal(await claimSyncSlice(db, { ...tenant, sliceId: historicalSlice.id,
    authorizationVersion: historicalAuthorization.authorizationVersion, leaseOwner: "historical-finances",
    now, leaseMs: 300_000 }), true);
  const historicalBody = encoder.encode(JSON.stringify({ href: "historical", transactions: [
    tx("HISTORICAL-SALE", "SALE", { totalFeeBasisAmount: { value: "4.2000", currency: "EUR" },
      buyer: { username: "historical-private-buyer" } }),
  ] }));
  const historicalRaw = await storeRawSourceRecord(db, { ...tenant, sourceSystem: "EBAY",
    sourceVersion: "sell-finances-v1", sourceEntityType: "FINANCES_TRANSACTIONS_PAGE",
    sourceEntityId: "EBAY_IT:historical:page:1", sourceSnapshotVersion: "page-1",
    schemaVersion: "sell-finances-v1", retentionClass: "FINANCIAL_SOURCE", capturedAt: now,
    ingestionRunId: historicalRun.id, payload: historicalBody, encryptChunk: rawEncryption.encryptChunk });
  const historicalNormalization = await db.normalizationRun.create({ data: { ...tenant,
    rawSourceRecordId: historicalRaw.id, mappingVersionId: historicalMapping.id,
    parserVersion: "ebay-eb3a-sell-finances-v1", normalizationRevision: 1,
    status: "SUCCEEDED", finishedAt: now } });
  await db.$transaction(async (database) => {
    const observation = await recordSourceObservationTx(database, { ...tenant, runId: historicalRun.id,
      sliceId: historicalSlice.id, rawSourceRecordId: historicalRaw.id, sourceSystem: "EBAY",
      sourceEntityType: "FINANCES_TRANSACTIONS_PAGE", sourceEntityId: "EBAY_IT:historical:page:1",
      observedAt: now, authorizationVersion: historicalAuthorization.authorizationVersion });
    await attachSourceObservationToSliceTx(database, { ...tenant, sliceId: historicalSlice.id,
      sourceObservationId: observation.id, normalizationRunId: historicalNormalization.id,
      leaseOwner: "historical-finances", now });
    await database.sourceReference.create({ data: { ...tenant, rawSourceRecordId: historicalRaw.id,
      sourceLeafPath: "$.transactions[0]", targetKind: "EBAY_FINANCES_TRANSACTION",
      targetKey: "HISTORICAL-SALE" } });
  });
  await prepareSyncSlice(db, { ...tenant, sliceId: historicalSlice.id, leaseOwner: "historical-finances",
    authorizationVersion: historicalAuthorization.authorizationVersion, now });
  await db.$transaction(async (database) => {
    await completeSyncSliceWithoutCheckpointTx(database, { ...tenant, sliceId: historicalSlice.id,
      leaseOwner: "historical-finances", authorizationVersion: historicalAuthorization.authorizationVersion,
      mappingVersionId: historicalMapping.id, now });
    await database.syncRun.update({ where: { id: historicalRun.id },
      data: { status: "SUCCEEDED", finishedAt: now } });
  });
  const historicalPublished = await ingestEbayFinancesD1ToD2B({ db, tenant,
    sliceId: historicalSlice.id, rawDecryption });
  assert.equal(historicalPublished.transactionCount, 1);
  assert(await db.financialLedgerEntry.findFirstOrThrow({ where: {
    economicEventKey: "ebay-finances:transaction:HISTORICAL-SALE",
    sourceLeafPath: "$.transactions[0]/totalFeeBasisAmount",
    amountAtoms: 42n, amountScale: 1 } }));

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
    ["unsupported-no-money", { transactions: [{ transactionId: "NO-MONEY",
      transactionType: "FUTURE_NEW_TYPE", transactionStatus: "UNKNOWN" }] }],
    ["bad-next", { transactions: [fixtures[0]], next: "https://evil.invalid/sell/finances/v1/transaction?offset=2" }]] as const)
    await assert.rejects(invoke(key, new MockTransport([oauth, () => json(value)])));

  assert.equal(await db.inventoryEconomicEvent.count(), 0);
  const durable = JSON.stringify(await db.sourceReference.findMany());
  for (const secret of [refreshToken, accessToken, config.clientSecret, "eb3a-test-public-jwe",
    "Signature-Input", "sig1=:"]) assert.equal(durable.includes(secret), false);
  assert.equal(decoder.decode((await db.rawSourceBlobChunk.findFirstOrThrow()).encryptedBytes).includes("TX-SALE"), false);
  assert.equal((sqlite.prepare(`SELECT COUNT(*) AS count FROM FinancialAuthorityScope s
    JOIN FinancialDecisionValidity v ON v.id=s.currentDecisionId WHERE v.valid<>1`).get() as { count: number }).count, 0);
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((sqlite.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  console.log("eBay EB3-B trusted Finances D1 evidence to D2B ledger: PASS");
} finally {
  await db.$disconnect(); sqlite.close(); rmSync(directory, { recursive: true, force: true });
}
