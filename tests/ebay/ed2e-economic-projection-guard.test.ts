import assert from "node:assert/strict";
import { assertEbayFinancesProjectionPersistence, assertEbayOrderPageManifestPersistence,
  assertEbayOrderProjectionPersistence }
  from "../../app/connectors/ebay/ebay-economic-projection-guard";
import { projectEbayFinancesEconomic, serializeEbayFinancesEconomicProjection }
  from "../../app/connectors/ebay/ebay-finances-economic-projection";
import { projectEbayOrderPage, serializeEbayOrderEconomicProjection, serializeEbayOrderPageManifest }
  from "../../app/connectors/ebay/ebay-order-economic-projection";

const encoder = new TextEncoder();
const bytes = (value: unknown) => encoder.encode(JSON.stringify(value));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const money = (value: string) => ({ value, currency: "EUR" });
const orderSource = { orderId: "ORDER-1", creationDate: "2026-10-01T10:00:00.000Z",
  lastModifiedDate: "2026-10-01T11:00:00.000Z", orderFulfillmentStatus: "NOT_STARTED",
  cancelStatus: { cancelState: "NONE_REQUESTED" }, pricingSummary: { total: money("14.5000") },
  lineItems: [{ lineItemId: "LINE-1", legacyItemId: "ITEM-1", sku: "SKU-1", quantity: 2,
    lineItemFulfillmentStatus: "NOT_STARTED", lineItemCost: money("7.2500"),
    taxes: [{ amount: money("1.2500") }] }] };
const projectedPage = projectEbayOrderPage({ orders: [orderSource] },
  { marketplaceId: "EBAY_IT", pageNumber: 1, offset: 0 });
const finances = projectEbayFinancesEconomic({ transactions: [{ transactionId: "TX-1",
  transactionType: "SALE", transactionStatus: "FUNDS_AVAILABLE_FOR_PAYOUT",
  transactionDate: "2026-10-01T12:00:00.000Z", totalFeeBasisAmount: money("14.5000"),
  orderId: "ORDER-1", orderLineItems: [{ lineItemId: "LINE-1", marketplaceFees: [
    { feeType: "FINAL_VALUE_FEE", amount: money("1.0500") },
    { feeType: "FINAL_VALUE_FEE", amount: money("1.0500") },
  ] }] }] });

assert.doesNotThrow(() => assertEbayOrderProjectionPersistence(
  serializeEbayOrderEconomicProjection(projectedPage.orders[0])));
assert.doesNotThrow(() => assertEbayOrderPageManifestPersistence(
  serializeEbayOrderPageManifest(projectedPage.manifest)));
assert.doesNotThrow(() => assertEbayFinancesProjectionPersistence(
  serializeEbayFinancesEconomicProjection(finances)));

const orderCases: unknown[] = [];
const rootBuyer = clone(projectedPage.orders[0]) as Record<string, unknown>;
rootBuyer.buyer = { name: "Private Buyer" }; orderCases.push(rootBuyer);
const nestedAddress = clone(projectedPage.orders[0]);
(nestedAddress.pricingSummary as Record<string, unknown>).address = { street: "Private Street" };
orderCases.push(nestedAddress);
const lineEmail = clone(projectedPage.orders[0]);
(lineEmail.lineItems[0] as unknown as Record<string, unknown>).email = "private@example.invalid";
orderCases.push(lineEmail);
const nestedUnknown = clone(projectedPage.orders[0]);
(nestedUnknown.lineItems[0].taxes[0] as unknown as Record<string, unknown>).metadata = { unknown: true };
orderCases.push(nestedUnknown);
const wrongOrderSchema = clone(projectedPage.orders[0]) as Record<string, unknown>;
wrongOrderSchema.projectionSchema = "EBAY_FULFILLMENT_ORDER_ECONOMIC_V2"; orderCases.push(wrongOrderSchema);
const missingOrderField = clone(projectedPage.orders[0]) as unknown as Record<string, unknown>;
delete missingOrderField.orderId; orderCases.push(missingOrderField);
const invalidQuantity = clone(projectedPage.orders[0]);
(invalidQuantity.lineItems[0] as unknown as Record<string, unknown>).quantity = "2";
orderCases.push(invalidQuantity);
for (const value of orderCases)
  assert.throws(() => assertEbayOrderProjectionPersistence(bytes(value)));

const wrongManifest = clone(projectedPage.manifest) as Record<string, unknown>;
wrongManifest.projectionSchema = "EBAY_FULFILLMENT_PAGE_MANIFEST_V2";
assert.throws(() => assertEbayOrderPageManifestPersistence(bytes(wrongManifest)));
const injectedManifest = clone(projectedPage.manifest) as Record<string, unknown>;
injectedManifest.orders = [orderSource];
assert.throws(() => assertEbayOrderPageManifestPersistence(bytes(injectedManifest)));

const financeCases: unknown[] = [];
const username = clone(finances); (username.transactions[0] as unknown as Record<string, unknown>).username = "private";
financeCases.push(username);
const phone = clone(finances);
(phone.transactions[0].orderLineItems[0].marketplaceFees[0] as unknown as Record<string, unknown>).phone = "+39000";
financeCases.push(phone);
const wrongFinanceSchema = clone(finances) as unknown as Record<string, unknown>;
wrongFinanceSchema.projectionSchema = "EBAY_FINANCES_ECONOMIC_V2"; financeCases.push(wrongFinanceSchema);
const missingAmount = clone(finances) as unknown as { transactions: Array<Record<string, unknown>> };
delete missingAmount.transactions[0].totalFeeBasisAmount; financeCases.push(missingAmount);
const invalidFeeType = clone(finances);
(invalidFeeType.transactions[0].orderLineItems[0].marketplaceFees[0] as unknown as Record<string, unknown>)
  .feeType = 12; financeCases.push(invalidFeeType);
const objectInsteadOfFees = clone(finances) as unknown as { transactions: Array<{ orderLineItems: Array<Record<string, unknown>> }> };
objectInsteadOfFees.transactions[0].orderLineItems[0].marketplaceFees = {}; financeCases.push(objectInsteadOfFees);
for (const value of financeCases)
  assert.throws(() => assertEbayFinancesProjectionPersistence(bytes(value)));

let persistenceCalls = 0;
const guardedPersist = (payload: Uint8Array) => {
  assertEbayFinancesProjectionPersistence(payload);
  persistenceCalls += 1;
};
assert.throws(() => guardedPersist(bytes(username)));
assert.equal(persistenceCalls, 0);
guardedPersist(serializeEbayFinancesEconomicProjection(finances));
assert.equal(persistenceCalls, 1);

assert.throws(() => assertEbayFinancesProjectionPersistence(
  encoder.encode(` ${JSON.stringify(finances)}`)));

console.log("eBay ED2-E economic projection persistence guard tests passed.");
