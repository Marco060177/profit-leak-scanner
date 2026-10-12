import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mapEbayFinancialTransaction, parseEbayFinancesEvidencePage }
  from "../../app/connectors/ebay/ebay-finances-mapper.server";
import { mapEbayOrder } from "../../app/connectors/ebay/ebay-order-mapper.server";
import { projectEbayFinancesEconomic }
  from "../../app/connectors/ebay/ebay-finances-economic-projection";
import { projectEbayOrderEconomic } from "../../app/connectors/ebay/ebay-order-economic-projection";

const encoder = new TextEncoder();
const body = (value: unknown) => encoder.encode(JSON.stringify(value));
const omitNull = <T extends Record<string, unknown>>(value: T) => Object.fromEntries(
  Object.entries(value).filter(([, item]) => item !== null),
);

function orderMapperInput(projection: ReturnType<typeof projectEbayOrderEconomic>) {
  return {
    orderId: projection.orderId,
    creationDate: projection.creationDate,
    ...(projection.lastModifiedDate ? { lastModifiedDate: projection.lastModifiedDate } : {}),
    orderFulfillmentStatus: projection.orderFulfillmentStatus,
    ...(projection.cancelState ? { cancelStatus: { cancelState: projection.cancelState } } : {}),
    ...(projection.pricingSummary ? { pricingSummary: omitNull({ ...projection.pricingSummary }) } : {}),
    lineItems: projection.lineItems.map((item) => ({
      lineItemId: item.lineItemId,
      ...(item.legacyItemId ? { legacyItemId: item.legacyItemId } : {}),
      ...(item.sku ? { sku: item.sku } : {}),
      quantity: item.quantity,
      ...(item.lineItemFulfillmentStatus ? { lineItemFulfillmentStatus: item.lineItemFulfillmentStatus } : {}),
      ...omitNull({ lineItemCost: item.lineItemCost, discountedLineItemCost: item.discountedLineItemCost,
        total: item.total, deliveryCost: item.deliveryCost }),
      ...(item.taxes.length ? { taxes: item.taxes } : {}),
    })),
  };
}

function financesMapperInput(projection: ReturnType<typeof projectEbayFinancesEconomic>) {
  return { transactions: projection.transactions.map((transaction) => ({
    transactionId: transaction.transactionId,
    transactionType: transaction.transactionType,
    ...omitNull({ transactionStatus: transaction.transactionStatus, bookingEntry: transaction.bookingEntry,
      transactionDate: transaction.transactionDate, amount: transaction.amount,
      totalFeeBasisAmount: transaction.totalFeeBasisAmount, orderId: transaction.orderId }),
    ...(transaction.orderLineItems.length ? { orderLineItems: transaction.orderLineItems } : {}),
  })) };
}

const money = (value: string, currency = "EUR") => ({ value, currency });
const completeOrder = {
  orderId: "ORDER-EQUIVALENT",
  creationDate: "2026-09-02T10:00:00.000Z",
  lastModifiedDate: "2026-09-02T11:00:00.000Z",
  orderFulfillmentStatus: "IN_PROGRESS",
  cancelStatus: { cancelState: "NONE_REQUESTED", cancelReason: "BUYER_REQUESTED" },
  pricingSummary: { priceSubtotal: money("9007199254740993.1250"), deliveryCost: money("4.0000"),
    tax: money("2.5000"), total: money("9007199254740999.6250"), adjustment: money("0.0000") },
  lineItems: [{ lineItemId: "LINE-2", legacyItemId: "LEGACY-2", sku: "SKU-2", title: "Private title",
    quantity: 2, lineItemFulfillmentStatus: "NOT_STARTED", lineItemCost: money("7.2500"),
    discountedLineItemCost: money("6.2500"), total: money("12.5000"), deliveryCost: money("2.0000"),
    taxes: [{ amount: money("1.2500"), jurisdiction: "ignored" }], buyer: { username: "secret" } },
  { lineItemId: "LINE-1", quantity: 1, lineItemFulfillmentStatus: "FULFILLED", total: money("3.00") }],
  buyer: { username: "secret", email: "buyer@example.test" },
  fulfillmentStartInstructions: [{ shippingStep: { shipTo: { fullName: "Private Buyer" } } }],
};

const originalOrder = mapEbayOrder(completeOrder);
const orderProjection = projectEbayOrderEconomic(completeOrder, "EBAY_IT");
const projectedOrder = mapEbayOrder(orderMapperInput(orderProjection));
const withoutTitle = <T extends { title?: string }>(value: T) => {
  const copy = { ...value }; delete copy.title; return copy;
};
assert.deepEqual({ ...projectedOrder, items: projectedOrder.items.map(withoutTitle) },
  { ...originalOrder, items: originalOrder.items.map(withoutTitle) });
assert.equal(projectedOrder.items[1].title, undefined);
assert.equal(originalOrder.items[1].title, "Private title");
assert.equal(projectedOrder.currency, "EUR");
assert.deepEqual(projectedOrder.monetaryValues, originalOrder.monetaryValues);
assert.deepEqual(projectedOrder.items.map((item) => [item.externalOrderItemId, item.quantity, item.sku]),
  originalOrder.items.map((item) => [item.externalOrderItemId, item.quantity, item.sku]));

const mixedCurrencyOrder = { ...completeOrder,
  pricingSummary: { ...completeOrder.pricingSummary, total: money("1.00", "USD") } };
assert.throws(() => mapEbayOrder(mixedCurrencyOrder));
assert.throws(() => projectEbayOrderEconomic(mixedCurrencyOrder, "EBAY_IT"));
for (const invalid of [
  { ...completeOrder, orderId: "" },
  { ...completeOrder, creationDate: "invalid" },
  { ...completeOrder, lineItems: [] },
  { ...completeOrder, pricingSummary: { total: money("1e3") } },
]) {
  assert.throws(() => mapEbayOrder(invalid));
  assert.throws(() => projectEbayOrderEconomic(invalid, "EBAY_IT"));
}

const finances = { transactions: [
  { transactionId: "SALE", transactionType: "SALE", transactionStatus: "FUNDS_AVAILABLE_FOR_PAYOUT",
    transactionDate: "2026-09-03T10:00:00.000Z", totalFeeBasisAmount: money("100.0000"),
    orderId: "ORDER-EQUIVALENT", orderLineItems: [{ lineItemId: "LINE-2", marketplaceFees: [
      { feeType: "FINAL_VALUE_FEE", amount: money("1.0500") },
      { feeType: "FINAL_VALUE_FEE", amount: money("0.2500") },
      { feeType: "FINAL_VALUE_FEE", amount: money("1.0500") },
    ] }], buyer: { username: "secret" } },
  { transactionId: "REFUND", transactionType: "REFUND", transactionStatus: "COMPLETED",
    bookingEntry: "DEBIT", transactionDate: "2026-09-04T10:00:00.000Z", amount: money("7.2500"),
    orderId: "ORDER-EQUIVALENT" },
  { transactionId: "ADJUST", transactionType: "ADJUSTMENT", transactionStatus: "COMPLETED",
    bookingEntry: "CREDIT", transactionDate: "2026-09-05T10:00:00.000Z", amount: money("0.125000") },
  { transactionId: "FUTURE", transactionType: "FUTURE_NEW_TYPE", transactionStatus: "UNKNOWN",
    bookingEntry: "DEBIT", transactionDate: "2026-09-06T10:00:00.000Z", amount: money("3.0000") },
] };
const projectedFinances = projectEbayFinancesEconomic(finances);
const originalParsed = parseEbayFinancesEvidencePage(body(finances));
const projectedParsed = parseEbayFinancesEvidencePage(body(financesMapperInput(projectedFinances)));
const fixedChecksum = createHash("sha256").update("ED2-B semantic comparison").digest("hex");
const originalCanonical = originalParsed.map((transaction) => mapEbayFinancialTransaction(transaction, fixedChecksum))
  .sort((left, right) => left.transactionId.localeCompare(right.transactionId));
const projectedCanonical = projectedParsed.map((transaction) => mapEbayFinancialTransaction(transaction, fixedChecksum))
  .sort((left, right) => left.transactionId.localeCompare(right.transactionId));
assert.deepEqual(projectedCanonical, originalCanonical);

const sale = projectedCanonical.find((entry) => entry.transactionId === "SALE")!;
assert.equal(sale.economicLeaves.length, 4);
assert.equal(sale.economicLeaves.filter((leaf) => leaf.sourceType === "FINAL_VALUE_FEE").length, 3);
assert.deepEqual(sale.economicLeaves.filter((leaf) => leaf.sourceType === "FINAL_VALUE_FEE")
  .map((leaf) => leaf.sourceMoney.sourceAmountText).sort(), ["0.2500", "1.0500", "1.0500"]);
assert.equal(projectedCanonical.find((entry) => entry.transactionId === "REFUND")?.supported, true);
assert.equal(projectedCanonical.find((entry) => entry.transactionId === "ADJUST")?.supported, true);
const future = projectedCanonical.find((entry) => entry.transactionId === "FUTURE")!;
assert.equal(future.supported, false);
assert.equal(future.economicLeaves[0].projectionKind, "UNKNOWN_UNCLASSIFIED");

const unsupportedWithoutMoney = { transactionId: "NO-MONEY", transactionType: "FUTURE_NEW_TYPE",
  transactionStatus: "UNKNOWN" };
const parsedUnsupported = parseEbayFinancesEvidencePage(body({ transactions: [unsupportedWithoutMoney] }))[0];
const canonicalUnsupported = mapEbayFinancialTransaction(parsedUnsupported, fixedChecksum);
assert.equal(canonicalUnsupported.supported, false);
assert.deepEqual(canonicalUnsupported.economicLeaves, []);
assert.throws(() => projectEbayFinancesEconomic({ transactions: [unsupportedWithoutMoney] }));

for (const invalid of [
  { transactionId: "BAD", transactionType: "REFUND", bookingEntry: "DEBIT",
    transactionDate: "2026-09-04T10:00:00.000Z" },
  { transactionId: "BAD", transactionType: "SALE", transactionDate: "2026-09-04T10:00:00.000Z",
    amount: money("1.00") },
]) {
  const parsed = parseEbayFinancesEvidencePage(body({ transactions: [invalid] }))[0];
  assert.throws(() => mapEbayFinancialTransaction(parsed, fixedChecksum));
  assert.throws(() => projectEbayFinancesEconomic({ transactions: [invalid] }));
}

const privacyText = JSON.stringify({ orderProjection, projectedFinances });
for (const forbidden of ["Private title", "secret", "buyer@example.test", "Private Buyer"])
  assert.equal(privacyText.includes(forbidden), false);

console.log("eBay ED2-B economic projection equivalence tests passed.");
