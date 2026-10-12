import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { persistEbaySellerAuthorization } from "../../app/connectors/ebay/ebay-authorization.server";
import { ingestEbayOrdersToD1 } from "../../app/connectors/ebay/ebay-orders-d1.server";
import { EBAY_FULFILLMENT_MINIMIZED_MAPPING_VERSION, EBAY_FULFILLMENT_MINIMIZED_SOURCE_VERSION }
  from "../../app/connectors/ebay/ebay-order-economic-projection";
import { normalizeEbayOrdersFromD1 } from "../../app/connectors/ebay/ebay-orders-d2a.server";
import { ingestEbayFinancesToD1 } from "../../app/connectors/ebay/ebay-finances-d1.server";
import { EBAY_FINANCES_MINIMIZED_MAPPING_VERSION, EBAY_FINANCES_MINIMIZED_SOURCE_VERSION }
  from "../../app/connectors/ebay/ebay-finances-economic-projection";
import { ingestEbayFinancesD1ToD2B } from "../../app/connectors/ebay/ebay-finances-d2b.server";
import { approveEbayListingSkuMappingTx, getEbayCanonicalEconomicDatasetTx,
  recognizeEbayOrderItemCogsTx } from "../../app/connectors/ebay/ebay-economic-composition.server";
import { recordCostRecordRevisionTx } from "../../app/core/cost-record.server";
import type { EbaySigningKeyProvider } from "../../app/connectors/ebay/ebay-http-signature.server";
import { EBAY_REQUIRED_SCOPES, type EbayApplicationConfig, type EbayHttpRequest,
  type EbayHttpResponse, type EbayHttpTransport } from "../../app/connectors/ebay/ebay-types";
import { testEbayCredentialEncryptionProvider } from "./test-credential-encryption";

const encoder = new TextEncoder();
const response = (body: unknown): EbayHttpResponse => ({ status: 200, headers: {},
  body: encoder.encode(JSON.stringify(body)) });
class Transport implements EbayHttpTransport { requests: EbayHttpRequest[] = [];
  private handlers: Array<(request: EbayHttpRequest) => EbayHttpResponse>;
  constructor(handlers: Array<(request: EbayHttpRequest) => EbayHttpResponse>) { this.handlers = handlers; }
  async request(request: EbayHttpRequest) { this.requests.push(request); const handler = this.handlers.shift();
    if (!handler) throw new Error("Unexpected network request"); return handler(request); } }
const now = new Date("2026-10-07T12:00:00Z");
const config: EbayApplicationConfig = { environment: "SANDBOX", clientId: "eb4-client",
  clientSecret: "eb4-secret", ruName: "eb4-runame", timeoutMs: 1000, maxAttempts: 1, maxRetryAfterMs: 0 };
const oauth = () => response({ access_token: "eb4-access", token_type: "bearer", expires_in: 7200 });
const { privateKey } = generateKeyPairSync("ed25519");
const signingKeyProvider: EbaySigningKeyProvider = { async getSigningMaterial() {
  return { privateKey, publicKeyJwe: "eb4-jwe", keyVersion: "eb4" }; } };
const key = createHash("sha256").update("eb4-test-key").digest();
const rawEncryption = { encryptChunk(plain: Uint8Array) { const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]); } };
const rawDecryption = { decryptChunk(encrypted: Uint8Array) { const value = Buffer.from(encrypted);
  const decipher = createDecipheriv("aes-256-gcm", key, value.subarray(0, 12));
  decipher.setAuthTag(value.subarray(12, 28));
  return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]); } };
const order = { orderId: "EB4-ORDER", creationDate: "2026-09-02T10:00:00.000Z",
  lastModifiedDate: "2026-09-02T11:00:00.000Z", orderFulfillmentStatus: "FULFILLED",
  cancelStatus: { cancelState: "NONE_REQUESTED" }, pricingSummary: {
    priceSubtotal: { value: "100.00", currency: "EUR" }, total: { value: "100.00", currency: "EUR" } },
  lineItems: [{ lineItemId: "EB4-LINE", legacyItemId: "EB4-LEGACY", sku: "EB4-SKU",
    title: "EB4 product", quantity: 1, lineItemFulfillmentStatus: "FULFILLED",
    lineItemCost: { value: "100.00", currency: "EUR" }, total: { value: "100.00", currency: "EUR" } }] };
const sale = { transactionId: "EB4-SALE", transactionType: "SALE",
  transactionStatus: "FUNDS_AVAILABLE_FOR_PAYOUT", transactionDate: "2026-09-02T12:00:00.000Z",
  bookingEntry: "CREDIT", amount: { value: "82.00", currency: "EUR" },
  totalFeeBasisAmount: { value: "100.00", currency: "EUR" }, orderId: "EB4-ORDER",
  orderLineItems: [{ lineItemId: "EB4-LINE", marketplaceFees: [{ feeType: "FINAL_VALUE_FEE",
    amount: { value: "18.00", currency: "EUR" } }] }] };

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-eb4-"));
const databasePath = path.join(directory, "eb4.sqlite");
const sqlite = new DatabaseSync(databasePath); sqlite.exec("PRAGMA foreign_keys=ON");
for (const name of readdirSync("prisma/migrations").filter((value) => /^\d{14}_/.test(value)).sort())
  sqlite.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
const db = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } } });
try {
  const account = await db.account.create({ data: {} });
  const channel = await db.channelConnection.create({ data: { accountId: account.id,
    channel: "EBAY", externalAccountId: "eb4-seller" } });
  const tenant = { accountId: account.id, channelConnectionId: channel.id };
  await persistEbaySellerAuthorization(db, tenant, { refreshToken: "eb4-refresh",
    grantedScopes: EBAY_REQUIRED_SCOPES, grantedAt: now,
    refreshTokenExpiresAt: new Date("2030-01-01T00:00:00Z") }, testEbayCredentialEncryptionProvider);
  const marketplace = await db.marketplace.create({ data: { ...tenant, externalMarketplaceId: "EBAY_IT",
    countryCode: "IT", currencyCode: "EUR" } });
  const orderMapping = await db.mappingVersion.create({ data: { platform: "EBAY",
    sourceContract: "sell-fulfillment-order-economic-v1",
    sourceVersion: EBAY_FULFILLMENT_MINIMIZED_SOURCE_VERSION,
    mapperSemanticVersion: EBAY_FULFILLMENT_MINIMIZED_MAPPING_VERSION, formulaCompatibilityVersion: "d2a-v1",
    checksum: "eb4-orders", activatedAt: now } });
  const financeMapping = await db.mappingVersion.create({ data: { platform: "EBAY",
    sourceContract: "sell-finances-transaction-economic-v1",
    sourceVersion: EBAY_FINANCES_MINIMIZED_SOURCE_VERSION,
    mapperSemanticVersion: EBAY_FINANCES_MINIMIZED_MAPPING_VERSION, formulaCompatibilityVersion: "d2b-v1",
    checksum: "eb4-finances", activatedAt: now } });
  const orderD1 = await ingestEbayOrdersToD1({ db, tenant, marketplaceId: marketplace.id,
    operationKey: "eb4-order-d1", mappingVersionId: orderMapping.id,
    query: { createdAfter: new Date("2026-09-01T00:00:00Z"), createdBefore: new Date("2026-10-01T00:00:00Z") },
    config, transport: new Transport([oauth, () => response({ orders: [order] })]),
    credentialEncryptionProvider: testEbayCredentialEncryptionProvider, rawEncryption,
    leaseOwner: "eb4-order-d1", now, clock: () => now.getTime(), sleep: async () => {} });
  await normalizeEbayOrdersFromD1({ db, tenant, marketplaceId: marketplace.id,
    sourceSliceId: orderD1.sliceId, operationKey: "eb4-d2a", mappingVersionId: orderMapping.id,
    rawDecryption, leaseOwner: "eb4-d2a", now });
  const normalized = await db.normalizedOrder.findFirstOrThrow({ where: { ...tenant,
    sourceSystem: "EBAY", sourceOrderKey: "EB4-ORDER" }, include: { items: true } });
  const financesD1 = await ingestEbayFinancesToD1({ db, tenant, marketplaceId: marketplace.id,
    operationKey: "eb4-finances-d1", mappingVersionId: financeMapping.id,
    query: { transactionDateFrom: new Date("2026-09-01T00:00:00Z"),
      transactionDateTo: new Date("2026-10-01T00:00:00Z") }, config,
    transport: new Transport([oauth, () => response({ transactions: [sale] })]),
    credentialEncryptionProvider: testEbayCredentialEncryptionProvider, signingKeyProvider,
    rawEncryption, leaseOwner: "eb4-finances", now, clock: () => now.getTime(), sleep: async () => {} });
  await ingestEbayFinancesD1ToD2B({ db, tenant, sliceId: financesD1.sliceId, rawDecryption });
  const linked = await db.financialLedgerEntry.findMany({ where: { orderId: normalized.id },
    orderBy: { projectionKind: "asc" } });
  assert.equal(linked.length, 2);
  assert.equal(linked.find((entry) => entry.projectionKind === "MARKETPLACE_COMMISSION")?.itemId,
    normalized.items[0].id);
  assert.equal(linked.find((entry) => entry.projectionKind === "PRODUCT_REVENUE")?.itemId, null);
  const product = await db.product.create({ data: { accountId: account.id, title: "EB4" } });
  const sku = await db.sku.create({ data: { accountId: account.id, sellerSku: "EB4-SKU", productId: product.id } });
  assert.equal((await db.$transaction((tx) => recognizeEbayOrderItemCogsTx(tx, tenant,
    { itemId: normalized.items[0].id, currencyCode: "EUR" }))).status, "UNAVAILABLE");
  await db.$transaction((tx) => approveEbayListingSkuMappingTx(tx, tenant,
    { itemId: normalized.items[0].id, skuId: sku.id, actorRef: "eb4-test" }));
  await db.$transaction((tx) => recordCostRecordRevisionTx(tx, tenant, { skuId: sku.id,
    sourceKind: "MANUAL", costKey: "base", operationKey: "eb4-cost-35",
    authorityTier: "MANUAL_OVERRIDE", effectiveFrom: new Date("2026-01-01T00:00:00Z"),
    unitCost: { amountAtoms: 35n, amountScale: 0, currencyCode: "EUR" }, evidenceKind: "MANUAL",
    manual: { actorRef: "eb4-test", manualReasonCode: "KNOWN_COST" } }));
  assert.equal((await db.$transaction((tx) => recognizeEbayOrderItemCogsTx(tx, tenant,
    { itemId: normalized.items[0].id, currencyCode: "EUR" }))).status, "READY");
  const policy = await db.currencyPolicyVersion.create({ data: { version: "eb4", checksum: "eb4",
    exponentSourceVersion: "iso", roundingMode: "REJECT", toleranceAtoms: 0n, toleranceScale: 0,
    residualPolicy: "REJECT", activatedAt: now } });
  const dataset = await db.$transaction((tx) => getEbayCanonicalEconomicDatasetTx(tx, { tenant,
    scope: { kind: "ORDER", orderId: normalized.id }, startInclusive: new Date("2026-09-01T00:00:00Z"),
    endExclusive: new Date("2026-10-01T00:00:00Z"), currencyPolicyVersionId: policy.id }));
  assert.equal(dataset.status, "READY"); if (dataset.status !== "READY") throw new Error("EB4 expected READY");
  assert.deepEqual(dataset.financialComponents.map((entry) => [entry.projectionKind, entry.amountAtoms])
    .sort(([left], [right]) => String(left).localeCompare(String(right))),
    [["MARKETPLACE_COMMISSION", -18n], ["PRODUCT_REVENUE", 100n]]);
  assert.equal(dataset.cogs.length, 1); assert.equal(dataset.cogs[0].unitCostAtoms, 35n);
  assert.equal(100n - 18n - 35n, 47n);
  const repeated = await db.$transaction((tx) => getEbayCanonicalEconomicDatasetTx(tx, { tenant,
    scope: { kind: "ORDER", orderId: normalized.id }, startInclusive: new Date("2026-09-01T00:00:00Z"),
    endExclusive: new Date("2026-10-01T00:00:00Z"), currencyPolicyVersionId: policy.id }));
  assert.equal(repeated.fingerprint, dataset.fingerprint);
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((sqlite.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  console.log("eBay EB4 D2A + D2B + D2C to canonical D2D economics: PASS");
} finally { await db.$disconnect(); sqlite.close(); rmSync(directory, { recursive: true, force: true }); }
