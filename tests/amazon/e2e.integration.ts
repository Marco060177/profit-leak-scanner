import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { persistAmazonSellerAuthorization } from "../../app/connectors/amazon/amazon-authorization.server";
import { ingestAmazonFinancesToD1 } from "../../app/connectors/amazon/amazon-finances-d1.server";
import { ingestAmazonFinancesD1ToD2B, type RawSourceDecryptionBoundary } from
  "../../app/connectors/amazon/amazon-finances-d2b.server";
import type { AmazonFinancesQuery } from "../../app/connectors/amazon/amazon-finances.server";
import type { RawSourceEncryptionBoundary } from "../../app/connectors/amazon/amazon-orders-d1.server";
import type { AmazonApplicationConfig, AmazonHttpRequest, AmazonHttpResponse,
  AmazonHttpTransport } from "../../app/connectors/amazon/amazon-types";
import { getEffectiveFinancialComponentsTx } from "../../app/core/effective-financial-components.server";
import { getCanonicalEconomicDatasetTx } from "../../app/core/canonical-economic-dataset.server";
import { testCredentialEncryptionProvider } from "./test-credential-encryption";

const encoder = new TextEncoder();
const response = (body: string | object, status = 200): AmazonHttpResponse => ({ status, headers: {},
  body: encoder.encode(typeof body === "string" ? body : JSON.stringify(body)) });
class MockTransport implements AmazonHttpTransport {
  requests: AmazonHttpRequest[] = [];
  private readonly handlers: Array<(request: AmazonHttpRequest) => AmazonHttpResponse>;
  constructor(handlers: Array<(request: AmazonHttpRequest) => AmazonHttpResponse>) { this.handlers = handlers; }
  async request(request: AmazonHttpRequest) {
    this.requests.push(request); const handler = this.handlers.shift();
    if (!handler) throw new Error("Unexpected HTTP request"); return handler(request);
  }
}
const MARKET = "APJ6JRA9NG5V4";
const now = new Date("2026-09-29T12:00:00Z");
const config: AmazonApplicationConfig = { lwaClientId: "e2e-client", lwaClientSecret: "e2e-secret",
  userAgent: "MarginLab/E2E", timeoutMs: 1000, maxAttempts: 1 };
const key = createHash("sha256").update("marginlab-e2e-raw-key").digest();
const rawEncryption: RawSourceEncryptionBoundary = { encryptChunk(plain) {
  const nonce = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]);
} };
const rawDecryption: RawSourceDecryptionBoundary = { decryptChunk(encrypted) {
  const value = Buffer.from(encrypted); const decipher = createDecipheriv("aes-256-gcm", key, value.subarray(0, 12));
  decipher.setAuthTag(value.subarray(12, 28));
  return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]);
} };
const money = (amount: string, currency = "EUR") =>
  `{"currencyAmount":${amount},"currencyCode":${JSON.stringify(currency)}}`;
const leaf = (type: string, amount: string, currency = "EUR") =>
  `{"breakdownType":${JSON.stringify(type)},"breakdownAmount":${money(amount, currency)},"breakdowns":[]}`;
const transaction = (id: string, options: { type?: string; status?: string; total?: string;
  marketplace?: string | null; related?: unknown[]; breakdowns?: string[] } = {}) =>
  `{"transactionId":${JSON.stringify(id)},"transactionType":${JSON.stringify(options.type ?? "Shipment")},` +
  `"transactionStatus":${JSON.stringify(options.status ?? "RELEASED")},"postedDate":"2026-09-01T10:00:00Z",` +
  `"totalAmount":${money(options.total ?? "9.00")},` +
  (options.marketplace === null ? "" : `"marketplaceDetails":{"marketplaceId":${JSON.stringify(options.marketplace ?? MARKET)}},`) +
  `"relatedIdentifiers":${JSON.stringify(options.related ?? [])},"items":[],"contexts":[],` +
  `"breakdowns":[${(options.breakdowns ?? []).join(",")}]}`;
const page = (transactions: string[], nextToken?: string) =>
  `{"payload":{"transactions":[${transactions.join(",")}]${nextToken ? `,"nextToken":${JSON.stringify(nextToken)}` : ""}}}`;

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-amazon-e2e-"));
const databasePath = path.join(directory, "e2e.sqlite");
const sqlite = new DatabaseSync(databasePath); sqlite.exec("PRAGMA foreign_keys=ON");
for (const name of readdirSync("prisma/migrations").filter((value) => /^\d{14}_/.test(value)).sort())
  sqlite.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
const db = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } } });

try {
  const account = await db.account.create({ data: {} });
  const connection = await db.channelConnection.create({ data: { accountId: account.id,
    channel: "AMAZON", externalAccountId: "seller-e2e" } });
  const tenant = { accountId: account.id, channelConnectionId: connection.id };
  await persistAmazonSellerAuthorization(db, tenant, { refreshToken: "e2e-refresh", grantedAt: now },
    testCredentialEncryptionProvider);
  const marketplace = await db.marketplace.create({ data: { ...tenant,
    externalMarketplaceId: MARKET, countryCode: "IT", currencyCode: "EUR" } });
  const mapping = await db.mappingVersion.create({ data: { platform: "AMAZON",
    sourceContract: "finances-v2024-06-19", sourceVersion: "2024-06-19",
    mapperSemanticVersion: "amazon-finances-v2024-06-19-e2c-v1",
    formulaCompatibilityVersion: "d2b-v1", checksum: "e2e-mapping", activatedAt: now } });
  const query: AmazonFinancesQuery = { postedAfter: new Date("2026-09-01T00:00:00Z"),
    postedBefore: new Date("2026-09-02T00:00:00Z") };
  const ingestD1 = async (operationKey: string, bodies: string[], customQuery = query) => {
    const handlers = [() => response({ access_token: "e2e-access", token_type: "bearer", expires_in: 3600 }),
      ...bodies.map((body) => () => response(body))];
    return ingestAmazonFinancesToD1({ db, tenant, marketplaceId: marketplace.id,
      operationKey, mappingVersionId: mapping.id, query: customQuery, config,
      transport: new MockTransport(handlers), credentialEncryptionProvider: testCredentialEncryptionProvider,
      rawEncryption, leaseOwner: `lease-${operationKey}`, now,
      retry: { now: () => now.getTime(), sleep: async () => undefined, random: () => 0 } });
  };

  const d1Before = { raw: await db.rawSourceRecord.count(), observations: await db.sourceObservation.count(),
    chunks: await db.rawSourceBlobChunk.count() };
  const normalBody = page([
    transaction("SALE-1", { total: "9.00", related: [{ relatedIdentifierName: "ORDER_ID", relatedIdentifierValue: "MISSING-ORDER" }],
      breakdowns: [leaf("ProductCharge", "10.00"), leaf("MarketplaceFee", "-1.00")] }),
    transaction("REFUND-1", { type: "Refund", total: "-4.00" }),
    transaction("REIMBURSE-1", { type: "Reimbursement", total: "3.00", related: [] }),
    transaction("ADJUST-1", { type: "Adjustment", total: "2.00" }),
    transaction("TAX-1", { total: "1.00", breakdowns: [leaf("Tax", "1.00")] }),
    transaction("PROMO-1", { total: "-1.00", breakdowns: [leaf("Promotion", "-1.00")] }),
    transaction("FULFILL-1", { total: "-2.00", breakdowns: [leaf("FulfillmentFee", "-2.00")] }),
  ]);
  const d1 = await ingestD1("normal", [normalBody]);
  const published = await ingestAmazonFinancesD1ToD2B({ db, tenant, sliceId: d1.sliceId, rawDecryption });
  assert.equal(published.transactionCount, 7);
  const saleScope = await db.financialAuthorityScope.findFirstOrThrow({ where: {
    economicEventKey: "amazon-finances:transaction:SALE-1" } });
  const saleEntries = await db.financialLedgerEntry.findMany({ where: { authorityScopeId: saleScope.id,
    state: "PRESENT" }, orderBy: { projectionKind: "asc" } });
  assert.equal(saleEntries.length, 2, "informational total must not become a ledger entry");
  assert.deepEqual(saleEntries.map((entry) => [entry.projectionKind, entry.amountAtoms, entry.amountScale]),
    [["MARKETPLACE_COMMISSION", -1n, 0], ["PRODUCT_REVENUE", 10n, 0]]);
  assert(saleEntries.every((entry) => entry.sourceLeafPath.startsWith("$.payload.transactions[0]/")));
  assert(saleEntries.every((entry) => entry.mappingVersionId === mapping.id));
  assert(saleEntries.every((entry) => entry.rawSourceRecordId === d1.evidence[0].rawSourceRecordId));
  assert.equal((await db.financialLedgerEntry.findFirstOrThrow({ where: {
    economicEventKey: "amazon-finances:transaction:REFUND-1" } })).amountAtoms, -4n);
  for (const [event, kind] of [["REIMBURSE-1", "REIMBURSEMENT"], ["ADJUST-1", "ADJUSTMENT"],
    ["TAX-1", "TAX_COMPONENT"], ["PROMO-1", "DISCOUNT_PROMOTION"],
    ["FULFILL-1", "FULFILLMENT_FEE"]] as const)
    assert.equal((await db.financialLedgerEntry.findFirstOrThrow({ where: {
      economicEventKey: `amazon-finances:transaction:${event}` } })).projectionKind, kind);
  assert.equal(await db.normalizedOrder.count(), 0, "missing ORDER_ID must not fabricate D2A");

  const effective = await db.$transaction((tx) => getEffectiveFinancialComponentsTx(tx, tenant, {
    marketplaceId: marketplace.id, effectiveWindow: { start: new Date("2026-09-01T00:00:00Z"),
      end: new Date("2026-09-02T00:00:00Z") } }));
  assert.equal(effective.status, "READY");
  if (effective.status === "READY") assert.equal(effective.components.length, 8);

  // Identical D1 replay is idempotent through entries, evidence, decisions and effective result.
  const beforeReplay = { entries: await db.financialLedgerEntry.count(), evidence: await db.financialAuthorityEvidence.count(),
    decisions: await db.financialAuthorityDecision.count() };
  const replay = await ingestAmazonFinancesD1ToD2B({ db, tenant, sliceId: d1.sliceId, rawDecryption });
  assert.equal(replay.transactionCount, 7);
  assert.deepEqual({ entries: await db.financialLedgerEntry.count(), evidence: await db.financialAuthorityEvidence.count(),
    decisions: await db.financialAuthorityDecision.count() }, beforeReplay);

  // A corrected complete observation creates revisions and withdraws a disappeared component.
  const correctionBody = page([transaction("SALE-1", { total: "12.00",
    breakdowns: [leaf("ProductCharge", "12.00")] })]);
  const correctionD1 = await ingestD1("correction", [correctionBody]);
  await ingestAmazonFinancesD1ToD2B({ db, tenant, sliceId: correctionD1.sliceId, rawDecryption });
  const heads = await db.financialComponentHead.findMany({ where: { authorityScopeId: saleScope.id },
    include: { current: true } });
  assert.equal(heads.find((head) => head.sourceComponentKey.includes("MarketplaceFee"))?.current?.state, "WITHDRAWN");
  assert.equal(heads.find((head) => head.sourceComponentKey.includes("ProductCharge"))?.current?.amountAtoms, 12n);
  assert.equal(await db.financialLedgerEntry.count({ where: { authorityScopeId: saleScope.id,
    projectionKind: "MARKETPLACE_COMMISSION" } }), 2, "withdrawn history must remain");
  assert.equal(await db.financialLedgerEntry.count({ where: { authorityScopeId: saleScope.id,
    projectionKind: "PRODUCT_REVENUE" } }), 2);

  // Unknown, unrepresentable, deferred, future status and missing marketplace all fail closed.
  const blockedBody = page([
    transaction("UNKNOWN-1", { type: "FutureType", total: "7.00" }),
    transaction("HUGE-1", { total: "12345678901234567890.123456789" }),
    transaction("SCALE-1", { total: "0.0000000000001" }),
    transaction("DEFERRED-1", { status: "DEFERRED", total: "1.00" }),
    transaction("FUTURE-1", { status: "FUTURE", total: "1.00" }),
    transaction("NO-MARKET-1", { marketplace: null, total: "1.00" }),
  ]);
  const blockedD1 = await ingestD1("blocked", [blockedBody]);
  await ingestAmazonFinancesD1ToD2B({ db, tenant, sliceId: blockedD1.sliceId, rawDecryption });
  for (const id of ["UNKNOWN-1", "HUGE-1", "SCALE-1", "DEFERRED-1", "FUTURE-1", "NO-MARKET-1"]) {
    const scope = await db.financialAuthorityScope.findFirstOrThrow({ where: {
      economicEventKey: `amazon-finances:transaction:${id}` } });
    const decision = await db.financialAuthorityDecision.findFirstOrThrow({ where: {
      authorityScopeId: scope.id }, orderBy: { revision: "desc" } });
    assert.equal(decision.selectedClass, "BLOCKED");
  }
  assert.equal(await db.financialLedgerEntry.count({ where: {
    economicEventKey: { in: ["amazon-finances:transaction:HUGE-1", "amazon-finances:transaction:SCALE-1"] } } }), 0);
  const hugeEvidence = await db.financialAuthorityEvidence.findFirstOrThrow({ where: {
    scope: { economicEventKey: "amazon-finances:transaction:HUGE-1" } } });
  assert.equal(hugeEvidence.reasonCode, "MONEY_ATOMS_OUT_OF_RANGE");
  assert(JSON.parse(hugeEvidence.boundariesJson).blockers[0].sourceAmountText.includes("123456789"));

  const currencyPolicy = await db.currencyPolicyVersion.create({ data: { version: "e2e-test-v1",
    checksum: "e2e-policy", exponentSourceVersion: "ISO-4217-test", roundingMode: "REJECT",
    toleranceAtoms: 0n, toleranceScale: 2, residualPolicy: "SEPARATE", activatedAt: now } });
  const blockedD2d = await db.$transaction((tx) => getCanonicalEconomicDatasetTx(tx, {
    tenant, scope: { kind: "CHANNEL" }, economicWindow: { startInclusive: new Date("2026-09-01T00:00:00Z"),
      endExclusive: new Date("2026-09-02T00:00:00Z") }, currencyPolicyVersionId: currencyPolicy.id }));
  assert.equal(blockedD2d.status, "BLOCKED");

  // A status correction retains identity and can move conservative evidence to released ACTUAL authority.
  const statusDeferred = await ingestD1("status-deferred", [page([
    transaction("STATUS-EVOLVE", { status: "DEFERRED", total: "5.00" })])]);
  await ingestAmazonFinancesD1ToD2B({ db, tenant, sliceId: statusDeferred.sliceId, rawDecryption });
  const statusReleased = await ingestD1("status-released", [page([
    transaction("STATUS-EVOLVE", { status: "DEFERRED_RELEASED", total: "5.00" })])]);
  await ingestAmazonFinancesD1ToD2B({ db, tenant, sliceId: statusReleased.sliceId, rawDecryption });
  const statusScope = await db.financialAuthorityScope.findFirstOrThrow({ where: {
    economicEventKey: "amazon-finances:transaction:STATUS-EVOLVE" } });
  const statusDecisions = await db.financialAuthorityDecision.findMany({ where: {
    authorityScopeId: statusScope.id }, orderBy: { revision: "asc" } });
  assert.equal(statusDecisions[0].selectedClass, "BLOCKED");
  assert.equal(statusDecisions[1].selectedClass, "ACTUAL");
  assert.equal(await db.financialComponentHead.count({ where: { authorityScopeId: statusScope.id } }), 1);

  // Mixed currencies remain separate exact components and are never converted or summed by E2-E.
  const mixedD1 = await ingestD1("mixed", [page([transaction("MIXED", { total: "9.00",
    breakdowns: [leaf("ProductCharge", "10.00", "EUR"), leaf("MarketplaceFee", "-1.00", "USD")] })])]);
  await ingestAmazonFinancesD1ToD2B({ db, tenant, sliceId: mixedD1.sliceId, rawDecryption });
  const mixedEntries = await db.financialLedgerEntry.findMany({ where: {
    economicEventKey: "amazon-finances:transaction:MIXED" } });
  assert.deepEqual(new Set(mixedEntries.map((entry) => entry.currencyCode)), new Set(["EUR", "USD"]));

  // Publication waits for the completed multi-page D1 slice, including an empty intermediate page.
  const pagedD1 = await ingestD1("paged", [page([transaction("PAGE-1")], "next-a"),
    page([], "next-b"), page([transaction("PAGE-2")])]);
  const beforePaged = await db.financialAuthorityDecision.count();
  const paged = await ingestAmazonFinancesD1ToD2B({ db, tenant, sliceId: pagedD1.sliceId, rawDecryption });
  assert.equal(paged.transactionCount, 2);
  assert.equal(await db.financialAuthorityDecision.count(), beforePaged + 2);

  // Targeted scopes only revise the transaction they contain; unrelated authority remains current.
  const unrelatedDecision = await db.financialAuthorityDecision.findFirstOrThrow({ where: {
    scope: { economicEventKey: "amazon-finances:transaction:REFUND-1" } }, orderBy: { revision: "desc" } });
  for (const [name, value, id] of [["ORDER_ID", "ORDER-T", "TARGET-ORDER"],
    ["FINANCIAL_EVENT_GROUP_ID", "GROUP-T", "TARGET-GROUP"]] as const) {
    const targetedQuery: AmazonFinancesQuery = { relatedIdentifier: { name, value }, transactionStatus: "RELEASED" };
    const targetedD1 = await ingestD1(`target-${name}`, [page([transaction(id, { related: [
      { relatedIdentifierName: name, relatedIdentifierValue: value }] })])], targetedQuery);
    await ingestAmazonFinancesD1ToD2B({ db, tenant, sliceId: targetedD1.sliceId, rawDecryption });
  }
  assert.equal((await db.financialAuthorityScope.findFirstOrThrow({ where: {
    economicEventKey: "amazon-finances:transaction:REFUND-1" } })).currentDecisionId, unrelatedDecision.id);

  // A later invalid marketplace rolls back all D2B writes from the same publication unit.
  const atomicD1 = await ingestD1("atomic", [page([
    transaction("ATOMIC-VALID", { total: "1.00" }),
    transaction("ATOMIC-INVALID", { marketplace: "NOT-OWNED", total: "2.00" }),
  ])]);
  const beforeAtomic = { scopes: await db.financialAuthorityScope.count(),
    entries: await db.financialLedgerEntry.count(), decisions: await db.financialAuthorityDecision.count() };
  await assert.rejects(ingestAmazonFinancesD1ToD2B({ db, tenant,
    sliceId: atomicD1.sliceId, rawDecryption }), /ATOMIC-INVALID/);
  assert.deepEqual({ scopes: await db.financialAuthorityScope.count(),
    entries: await db.financialLedgerEntry.count(), decisions: await db.financialAuthorityDecision.count() }, beforeAtomic);
  assert.equal(await db.financialAuthorityScope.count({ where: {
    economicEventKey: "amazon-finances:transaction:ATOMIC-VALID" } }), 0);

  // D1 is consumed immutably; D2A and D2C remain untouched.
  assert((await db.rawSourceRecord.count()) > d1Before.raw);
  assert((await db.sourceObservation.count()) > d1Before.observations);
  assert((await db.rawSourceBlobChunk.count()) > d1Before.chunks);
  const immutableChecksum = createHash("sha256").update(Buffer.from(normalBody)).digest("hex");
  assert.equal((await db.rawSourceRecord.findUniqueOrThrow({ where: {
    id: d1.evidence[0].rawSourceRecordId } })).payloadChecksum, immutableChecksum);
  assert.equal(await db.normalizedOrder.count(), 0);
  assert.equal(await db.normalizedOrderItem.count(), 0);
  assert.equal(await db.costRecord.count(), 0);
  assert.equal(await db.inventoryEconomicEvent.count(), 0);
  assert.equal(await db.normalizedTaxEvidence.count(), 0);

  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((sqlite.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  console.log("Amazon E2-E D1 to D2B actual financial authority: PASS");
} finally {
  await db.$disconnect(); sqlite.close(); rmSync(directory, { recursive: true, force: true });
}
