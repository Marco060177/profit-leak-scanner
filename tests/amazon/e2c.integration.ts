import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type {
  AmazonFinancesAcquisition,
  AmazonFinancesBreakdown,
  AmazonFinancesItem,
  AmazonFinancesMoney,
  AmazonFinancesTransaction,
} from "../../app/connectors/amazon/amazon-finances.server";
import {
  AMAZON_FINANCES_MAPPING_VERSION,
  AMAZON_FINANCES_SOURCE_AUTHORITY,
  amazonFinancialSemanticFingerprint,
  classifyAmazonFinancialSemantic,
  mapAmazonFinancialTransaction,
  mapAmazonFinancialTransactions,
} from "../../app/connectors/amazon/amazon-finances-mapper.server";
import { AmazonConnectorError } from "../../app/connectors/amazon/amazon-types";
import { fixture } from "../data-core/d2d.fixtures";

const checksum = "a".repeat(64);
const money = (sourceText: string, currencyCode = "EUR"): AmazonFinancesMoney => ({
  currencyCode,
  amount: { sourceText },
});
const breakdown = (
  breakdownType: string,
  amount?: string,
  breakdowns: readonly AmazonFinancesBreakdown[] = [],
  currencyCode = "EUR",
): AmazonFinancesBreakdown => ({
  breakdownType,
  breakdownAmount: amount === undefined ? undefined : money(amount, currencyCode),
  breakdowns,
});
const item = (overrides: Partial<AmazonFinancesItem> = {}): AmazonFinancesItem => ({
  relatedIdentifiers: [], contexts: [], breakdowns: [], ...overrides,
});
const transaction = (
  overrides: Partial<AmazonFinancesTransaction> = {},
): AmazonFinancesTransaction => ({
  transactionId: "T-1",
  transactionType: "Sale",
  transactionStatus: "RELEASED",
  postedDate: new Date("2026-01-15T00:00:00.000Z"),
  marketplace: { marketplaceId: "A1PA6795UKMFR9", marketplaceName: "Amazon.de" },
  relatedIdentifiers: [{ name: "ORDER_ID", value: "ORDER-1" }],
  items: [], contexts: [], breakdowns: [], ...overrides,
});
const map = (value: AmazonFinancesTransaction) =>
  mapAmazonFinancialTransaction(value, { sourcePayloadChecksum: checksum });

function acquisition(...transactions: AmazonFinancesTransaction[]): AmazonFinancesAcquisition {
  return { pages: [{ pageIndex: 1, body: new TextEncoder().encode("page"), transactions,
    requestId: "request", nextToken: null }] };
}

async function main() {
  // A permitted undecomposed total is the sole economic owner.
  const simple = map(transaction({ totalAmount: money("12.34") }));
  assert.equal(simple.economicLeaves.length, 1);
  assert.equal(simple.informationalMonetaryNodes.length, 0);
  assert.equal(simple.economicLeaves[0].projectionKind, "PRODUCT_REVENUE");
  assert.equal(simple.economicLeaves[0].fixedMoney?.amountAtoms, 1234n);
  assert.equal(simple.economicLeaves[0].sourceMoney.sourceAmountText, "12.34");
  assert.equal(simple.economicLeaves[0].sourceAuthority, AMAZON_FINANCES_SOURCE_AUTHORITY);
  assert.equal(simple.mappingVersion, AMAZON_FINANCES_MAPPING_VERSION);

  // Parent and item totals remain informational when terminal child economics exist.
  const decomposed = map(transaction({
    totalAmount: money("9.00"),
    breakdowns: [breakdown("ProductCharge", "10.00"), breakdown("MarketplaceFee", "-1.00")],
    items: [item({
      totalAmount: money("4.00"),
      relatedIdentifiers: [{ name: "ORDER_ITEM_ID", value: "ITEM-1" },
        { name: "SKU", value: "SKU-1" }, { name: "ASIN", value: "ASIN-1" }],
      breakdowns: [breakdown("ProductCharge", "5.00"), breakdown("Promotion", "-1.00")],
    })],
  }));
  assert.equal(decomposed.informationalMonetaryNodes.length, 2);
  assert.equal(decomposed.economicLeaves.length, 4);
  assert.equal(decomposed.informationalMonetaryNodes.find((node) => node.sourceNodeKind === "TRANSACTION_TOTAL")?.childValidation,
    "MISMATCH");
  assert.equal(decomposed.informationalMonetaryNodes.find((node) => node.sourceNodeKind === "ITEM_TOTAL")?.childValidation,
    "MATCH");
  assert.equal(decomposed.economicLeaves.reduce((sum, node) => {
    const value = node.fixedMoney;
    return sum + (value ? value.amountAtoms * 10n ** BigInt(2 - value.amountScale) : 0n);
  }, 0n), 1300n);
  assert.equal(decomposed.items[0].relatedIdentifiers.length, 3);
  assert.equal(decomposed.economicLeaves.find((node) => node.correlation.itemIdentifiers.length > 0)?.correlation.d2aOrderItemId, null);

  const nested = map(transaction({ totalAmount: money("9.00"), breakdowns: [
    breakdown("Product", "9.00", [breakdown("ProductCharge", "10.00"), breakdown("Promotion", "-1.00")]),
  ] }));
  const parent = nested.informationalMonetaryNodes.find((node) => node.sourceType === "Product");
  assert.equal(parent?.childValidation, "MATCH");
  assert.equal(nested.economicLeaves.length, 2);
  assert(nested.economicLeaves.every((node) => node.sourceLeafPath.includes("/breakdowns/")));

  const mismatch = map(transaction({ totalAmount: money("8.00"), breakdowns: [breakdown("Product", "9.00")] }));
  assert.equal(mismatch.informationalMonetaryNodes[0].childValidation, "MISMATCH");
  const mixed = map(transaction({ totalAmount: money("9.00"), breakdowns: [
    breakdown("Product", "9.00", [], "USD"),
  ] }));
  assert.equal(mixed.informationalMonetaryNodes[0].childValidation, "NOT_COMPARABLE");
  assert.equal(simple.economicLeaves[0].childValidation, "NO_CHILDREN");

  // Exact-money matrix; none of these pass through Number.
  for (const [text, atoms, scale] of [
    ["0", 0n, 0], ["0.00", 0n, 2], ["12.34", 1234n, 2],
    ["-12.34", -1234n, 2], ["0.1", 1n, 1],
    ["9007199254740993.01", 900719925474099301n, 2],
    ["-0.00000001", -1n, 8], ["0.000000000001", 1n, 12],
  ] as const) {
    const mapped = map(transaction({ transactionId: `money-${text}`, totalAmount: money(text) }));
    const leaf = mapped.economicLeaves[0];
    assert.equal(leaf.sourceMoney.amountAtoms, atoms);
    assert.equal(leaf.sourceMoney.amountScale, scale);
    assert.equal(leaf.representability, "REPRESENTABLE");
  }
  const trailing = map(transaction({ totalAmount: money("12.3400") })).economicLeaves[0];
  assert.equal(trailing.sourceMoney.amountAtoms, 123400n);
  assert.equal(trailing.sourceMoney.amountScale, 4);
  assert.equal(trailing.fixedMoney?.amountAtoms, 1234n);
  assert.equal(trailing.fixedMoney?.amountScale, 2);

  const hugeText = "12345678901234567890.123456789";
  const hugeTx = map(transaction({ transactionId: "HUGE", totalAmount: money(hugeText) }));
  const huge = hugeTx.economicLeaves[0];
  assert.equal(huge.representability, "UNREPRESENTABLE");
  assert.equal(huge.sourceMoney.sourceAmountText, hugeText);
  assert.equal(huge.sourceMoney.amountAtoms, 12345678901234567890123456789n);
  assert.equal(huge.fixedMoney, null);
  assert.equal(hugeTx.unresolvedEconomicLeaves.length, 1);
  if (huge.representability === "UNREPRESENTABLE") {
    assert.equal(huge.reasonCode, "MONEY_ATOMS_OUT_OF_RANGE");
    assert.equal(huge.blocker.source.sourceLeafPath, "/totalAmount");
    assert.equal(huge.blocker.source.sourcePayloadChecksum, checksum);
  }
  const scaleOverflow = map(transaction({ transactionId: "SCALE", totalAmount: money("0.0000000000001") }))
    .economicLeaves[0];
  assert.equal(scaleOverflow.representability, "UNREPRESENTABLE");
  if (scaleOverflow.representability === "UNREPRESENTABLE")
    assert.equal(scaleOverflow.reasonCode, "MONEY_SCALE_OUT_OF_RANGE");
  assert.equal(hugeTx.economicLeaves.length, 1, "unrepresentable leaf must survive mapping");

  // Explicit versioned classification remains open and conservative.
  const classifications = {
    ProductCharge: "PRODUCT_REVENUE", ShippingCharge: "SHIPPING_REVENUE", Tax: "TAX_COMPONENT",
    ReferralFee: "MARKETPLACE_COMMISSION", FulfillmentFee: "FULFILLMENT_FEE", StorageFee: "STORAGE_FEE",
    ServiceFee: "MARKETPLACE_COMMISSION", PeriodicFee: "MARKETPLACE_COMMISSION",
    Promotion: "DISCOUNT_PROMOTION", Refund: "REFUND", Reimbursement: "REIMBURSEMENT",
    Adjustment: "ADJUSTMENT", FutureEconomicType: "UNKNOWN_UNCLASSIFIED",
  } as const;
  for (const [sourceType, expected] of Object.entries(classifications))
    assert.equal(classifyAmazonFinancialSemantic(sourceType), expected);
  const unknown = map(transaction({ transactionId: "UNKNOWN", transactionType: "FutureTransaction",
    breakdowns: [breakdown("FutureBreakdown", "7.00")] }));
  assert.equal(unknown.transactionType, "FutureTransaction");
  assert.equal(unknown.economicLeaves[0].sourceType, "FutureBreakdown");
  assert.equal(unknown.economicLeaves[0].projectionKind, "UNKNOWN_UNCLASSIFIED");
  const unknownTotal = map(transaction({ transactionId: "UNKNOWN-TOTAL", transactionType: "FutureTransaction",
    totalAmount: money("7.00") }));
  assert.equal(unknownTotal.economicLeaves.length, 1);
  assert.equal(unknownTotal.economicLeaves[0].projectionKind, "UNKNOWN_UNCLASSIFIED");

  const refund = map(transaction({ transactionId: "REFUND", transactionType: "Refund", totalAmount: money("-12.34") }));
  assert.equal(refund.economicLeaves[0].projectionKind, "REFUND");
  assert.equal(refund.economicLeaves[0].fixedMoney?.amountAtoms, -1234n);
  assert.equal("inventory" in refund, false);
  assert.equal("cogs" in refund, false);
  const reimbursement = map(transaction({ transactionId: "REIMBURSE", transactionType: "Reimbursement",
    totalAmount: money("5.00"), relatedIdentifiers: [] }));
  assert.equal(reimbursement.economicLeaves[0].projectionKind, "REIMBURSEMENT");
  assert.equal(reimbursement.economicLeaves[0].correlation.orderId, null);

  assert.equal(simple.marketplaceId, "A1PA6795UKMFR9");
  assert.equal(map(transaction({ marketplace: undefined, sellingPartner: undefined })).marketplaceId, null);
  assert.throws(() => map(transaction({ marketplace: { marketplaceId: "A" },
    sellingPartner: { marketplaceId: "B" } })), (error: unknown) =>
    error instanceof AmazonConnectorError && error.kind === "SOURCE_CONFLICT");
  assert.equal(simple.relatedIdentifiers[0].value, "ORDER-1");
  assert.equal(map(transaction({ relatedIdentifiers: [], totalAmount: money("1") }))
    .economicLeaves[0].correlation.orderId, null);

  for (const [status, expected] of [["DEFERRED", "DEFERRED"], ["RELEASED", "RELEASED"],
    ["DEFERRED_RELEASED", "RELEASED"], ["FUTURE", "UNKNOWN"]] as const) {
    const value = map(transaction({ transactionStatus: status, totalAmount: money("1") }));
    assert.equal(value.transactionStatus, status);
    assert.equal(value.finality, expected);
  }

  // Replay, corrections and repeated siblings retain deterministic semantic identity.
  const replaySource = transaction({ totalAmount: money("10.00"), breakdowns: [
    breakdown("MarketplaceFee", "-2.00"), breakdown("MarketplaceFee", "-1.00"), breakdown("Product", "13.00"),
  ] });
  const replay1 = map(replaySource);
  const replay2 = map({ ...replaySource, breakdowns: [...replaySource.breakdowns].reverse() });
  assert.deepEqual(replay2.economicLeaves.map((leaf) => leaf.sourceComponentKey),
    replay1.economicLeaves.map((leaf) => leaf.sourceComponentKey));
  assert.deepEqual(replay2.economicLeaves.map((leaf) => leaf.sourceMoney.sourceAmountText),
    replay1.economicLeaves.map((leaf) => leaf.sourceMoney.sourceAmountText));
  assert.equal(new Set(replay1.economicLeaves.map((leaf) => leaf.sourceComponentKey)).size, 3);
  const corrected = map(transaction({ transactionStatus: "DEFERRED", totalAmount: money("11.00") }));
  assert.equal(corrected.economicEventKey, simple.economicEventKey);
  assert.equal(corrected.economicLeaves[0].sourceComponentKey, simple.economicLeaves[0].sourceComponentKey);
  assert.notEqual(corrected.economicLeaves[0].sourceMoney.sourceAmountText, simple.economicLeaves[0].sourceMoney.sourceAmountText);

  const pageBody = new TextEncoder().encode("same raw page");
  const acquired = mapAmazonFinancialTransactions({ pages: [{ pageIndex: 1, body: pageBody,
    transactions: [replaySource, replaySource], requestId: null, nextToken: null }] });
  assert.equal(acquired.length, 1);
  assert.throws(() => mapAmazonFinancialTransactions(acquisition(replaySource,
    { ...replaySource, totalAmount: money("99.00") })), (error: unknown) =>
    error instanceof AmazonConnectorError && error.kind === "SOURCE_CONFLICT");
  assert.equal(amazonFinancialSemanticFingerprint(replay1), amazonFinancialSemanticFingerprint(map(replaySource)));

  // The mapper is pure: exercising it does not write any Data Core layer.
  const f = await fixture();
  try {
    const before = {
      raw: await f.db.rawSourceRecord.count(), order: await f.db.normalizedOrder.count(),
      ledger: await f.db.financialLedgerEntry.count(), cost: await f.db.costRecord.count(),
      inventory: await f.db.inventoryEconomicEvent.count(), tax: await f.db.normalizedTaxEvidence.count(),
    };
    mapAmazonFinancialTransactions(acquisition(transaction({ totalAmount: money("1.00") })));
    assert.deepEqual({
      raw: await f.db.rawSourceRecord.count(), order: await f.db.normalizedOrder.count(),
      ledger: await f.db.financialLedgerEntry.count(), cost: await f.db.costRecord.count(),
      inventory: await f.db.inventoryEconomicEvent.count(), tax: await f.db.normalizedTaxEvidence.count(),
    }, before);
  } finally { await f.cleanup(); }

  // Canonical acquisition checksums are derived from exact raw bytes.
  assert.equal(mapAmazonFinancialTransactions(acquisition(transaction({ totalAmount: money("1") })))[0]
    .sourcePayloadChecksum, createHash("sha256").update("page").digest("hex"));
  console.log("Amazon E2-C canonical financial leaf mapper: PASS");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
