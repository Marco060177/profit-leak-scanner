import assert from "node:assert/strict";
import { assertEbayFinancesProjectionPersistence } from
  "../../app/connectors/ebay/ebay-economic-projection-guard";
import { projectEbayFinancesEconomic, serializeEbayFinancesEconomicProjection } from
  "../../app/connectors/ebay/ebay-finances-economic-projection";
import { mapEbayFinancialTransaction, parseEbayFinancesEvidencePage } from
  "../../app/connectors/ebay/ebay-finances-mapper.server";
import { EbayConnectorError } from "../../app/connectors/ebay/ebay-types";

const transaction = (transactionType: unknown, currency = "EUR") => ({
  transactionId: transactionType === undefined ? "MISSING" : transactionType === null ? "NULL" : "KNOWN",
  ...(transactionType === undefined ? {} : { transactionType }),
  transactionStatus: "COMPLETED",
  bookingEntry: "CREDIT",
  transactionDate: "2026-10-20T10:00:00.000Z",
  amount: { value: "7.00", currency },
});

const projection = projectEbayFinancesEconomic({ transactions: [
  transaction(undefined), transaction(null), transaction("FUTURE_TYPE"),
] });
assert.equal(projection.transactions.length, 3);
assert.deepEqual(projection.transactions.map((row) => row.transactionType), ["FUTURE_TYPE", null, null]);
const bytes = serializeEbayFinancesEconomicProjection(projection);
assert.doesNotThrow(() => assertEbayFinancesProjectionPersistence(bytes));

const mapped = parseEbayFinancesEvidencePage(bytes).map((row) =>
  mapEbayFinancialTransaction(row, "a".repeat(64)));
assert(mapped.every((row) => row.supported === false));
assert(mapped.every((row) => row.economicLeaves.every((leaf) =>
  leaf.projectionKind === "UNKNOWN_UNCLASSIFIED")));

for (const malformed of [
  transaction(7),
  { ...transaction(undefined), amount: { value: "", currency: "EUR" } },
  { ...transaction(undefined), amount: null },
]) assert.throws(() => projectEbayFinancesEconomic({ transactions: [malformed] }),
  (error) => error instanceof EbayConnectorError && error.kind === "MALFORMED_RESPONSE");

const parseOne = (value: unknown) => parseEbayFinancesEvidencePage(
  Buffer.from(JSON.stringify({ transactions: [value] })))[0];

const sale = mapEbayFinancialTransaction(parseOne(
  { transactionId: "SALE", transactionType: "SALE", transactionStatus: "COMPLETED",
    transactionDate: "2026-10-20T10:00:00.000Z", amount: { value: "100.00", currency: "GBP" },
    totalFeeBasisAmount: { value: "100.00", currency: "USD" }, orderLineItems: [{ lineItemId: "LINE",
      marketplaceFees: [{ feeType: "FINAL_VALUE_FEE", amount: { value: "10.00", currency: "USD" } }] }] }),
  "b".repeat(64));
assert.equal(sale.supported, true);
assert.deepEqual([...new Set(sale.economicLeaves.map((leaf) => leaf.sourceMoney.currencyCode))], ["USD"]);

assert.throws(() => mapEbayFinancialTransaction(parseOne(
  { transactionId: "SALE-CONFLICT", transactionType: "SALE", transactionStatus: "COMPLETED",
    transactionDate: "2026-10-20T10:00:00.000Z", totalFeeBasisAmount: { value: "100.00", currency: "USD" },
    orderLineItems: [{ lineItemId: "LINE", marketplaceFees: [{ feeType: "FINAL_VALUE_FEE",
      amount: { value: "10.00", currency: "EUR" } }] }] }), "c".repeat(64)), /currency conflict/);

assert.throws(() => mapEbayFinancialTransaction(parseOne(
  { transactionId: "REFUND-CONFLICT", transactionType: "REFUND", transactionStatus: "COMPLETED",
    bookingEntry: "DEBIT", transactionDate: "2026-10-20T10:00:00.000Z",
    amount: { value: "20.00", currency: "USD" }, orderLineItems: [{ lineItemId: "LINE",
      marketplaceFees: [{ feeType: "FINAL_VALUE_FEE", amount: { value: "1.00", currency: "EUR" } }] }] }),
  "d".repeat(64)), /currency conflict/);

console.log("eBay Production Batch 1 gateways/parser/currency regression: PASS");
