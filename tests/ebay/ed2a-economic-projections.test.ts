import assert from "node:assert/strict";
import { projectEbayFinancesEconomic, serializeEbayFinancesEconomicProjection }
  from "../../app/connectors/ebay/ebay-finances-economic-projection";
import { projectEbayOrderEconomic, projectEbayOrderPage, serializeEbayOrderEconomicProjection,
  serializeEbayOrderPageManifest } from "../../app/connectors/ebay/ebay-order-economic-projection";

const decoder = new TextDecoder();
const serialized = (bytes: Uint8Array) => decoder.decode(bytes);
const piiMarkers = ["Buyer Person", "buyer@example.test", "+39000111222", "Via Segreta",
  "private-buyer-name", "hidden-title", "unrelated-secret"];

const order = (orderId: string, lineItems: unknown[] = [{ lineItemId: "LINE-2", legacyItemId: "ITEM-2",
  sku: "SKU-2", title: "hidden-title", quantity: 2, lineItemFulfillmentStatus: "NOT_STARTED",
  lineItemCost: { value: "7.2500", currency: "EUR" }, total: { value: "14.5000", currency: "EUR" },
  taxes: [{ amount: { value: "1.2500", currency: "EUR" }, buyer: "ignored" }],
  buyer: { username: "private-buyer-name" } }, { lineItemId: "LINE-1", quantity: 1,
  lineItemFulfillmentStatus: "FULFILLED" }]) => ({
  orderId, creationDate: "2026-10-01T10:00:00.000Z", lastModifiedDate: "2026-10-01T11:00:00.000Z",
  orderFulfillmentStatus: "IN_PROGRESS", cancelStatus: { cancelState: "NONE_REQUESTED", extra: "ignored" },
  pricingSummary: { priceSubtotal: { value: "21.7500", currency: "EUR" },
    total: { value: "24.2500", currency: "EUR" } },
  lineItems, buyer: { username: "private-buyer-name", name: "Buyer Person", email: "buyer@example.test",
    phone: "+39000111222" }, fulfillmentStartInstructions: [{ shippingStep: { shipTo: {
      addressLine1: "Via Segreta", fullName: "Buyer Person" } } }], arbitrary: "unrelated-secret",
});

const firstOrder = projectEbayOrderEconomic(order("ORDER-1"), "EBAY_IT");
assert.deepEqual(Object.keys(firstOrder), ["projectionSchema", "sourceContract", "marketplaceId", "orderId",
  "creationDate", "lastModifiedDate", "orderFulfillmentStatus", "cancelState", "pricingSummary", "lineItems"]);
assert.deepEqual(firstOrder.lineItems.map((item) => item.lineItemId), ["LINE-1", "LINE-2"]);
assert.equal(firstOrder.lineItems[1].sku, "SKU-2");
assert.equal(firstOrder.orderFulfillmentStatus, "IN_PROGRESS");
assert.equal(firstOrder.pricingSummary?.total?.value, "24.2500");
assert.equal(firstOrder.lineItems[1].lineItemCost?.value, "7.2500");
const orderJson = serialized(serializeEbayOrderEconomicProjection(firstOrder));
for (const marker of piiMarkers) assert.equal(orderJson.includes(marker), false, marker);
assert.equal(orderJson, serialized(serializeEbayOrderEconomicProjection(
  projectEbayOrderEconomic({ ...order("ORDER-1"), ignored: { nested: "different" } }, "EBAY_IT"))));

const pageA = projectEbayOrderPage({ orders: [order("ORDER-2"), order("ORDER-1")],
  buyer: "ignored", next: "https://example.test/private" },
{ marketplaceId: "EBAY_IT", pageNumber: 1, offset: 0, nextOffset: 2 });
const pageB = projectEbayOrderPage({ orders: [order("ORDER-1"), order("ORDER-2")] },
  { marketplaceId: "EBAY_IT", pageNumber: 1, offset: 0, nextOffset: 2 });
assert.deepEqual(pageA.orders.map((entry) => entry.orderId), ["ORDER-1", "ORDER-2"]);
assert.equal(serialized(serializeEbayOrderPageManifest(pageA.manifest)),
  serialized(serializeEbayOrderPageManifest(pageB.manifest)));

assert.throws(() => projectEbayOrderEconomic(order("ORDER-1", []), "EBAY_IT"));
assert.throws(() => projectEbayOrderEconomic(order("ORDER-1", [
  { lineItemId: "DUP", quantity: 1 }, { lineItemId: "DUP", quantity: 1 }]), "EBAY_IT"));
assert.throws(() => projectEbayOrderPage({ orders: [order("DUP"), order("DUP")] },
  { marketplaceId: "EBAY_IT", pageNumber: 1, offset: 0 }));
assert.throws(() => projectEbayOrderEconomic({ ...order("ORDER-1"), creationDate: "invalid" }, "EBAY_IT"));

const financesFixture = { transactions: [{ transactionId: "TX-SALE", transactionType: "SALE",
  transactionStatus: "FUNDS_AVAILABLE_FOR_PAYOUT", transactionDate: "2026-10-01T10:00:00.000Z",
  totalFeeBasisAmount: { value: "12345678901234567890.123456789", currency: "EUR" }, orderId: "ORDER-1",
  orderLineItems: [] }, { transactionId: "TX-REFUND", transactionType: "REFUND",
  transactionStatus: "COMPLETED", bookingEntry: "DEBIT", transactionDate: "2026-10-02T10:00:00.000Z",
  amount: { value: "9007199254740993.123400", currency: "EUR", ignored: "x" }, orderId: "ORDER-1",
  username: "private-buyer-name", shippingAddress: { name: "Buyer Person", addressLine1: "Via Segreta" },
  orderLineItems: [{ lineItemId: "LINE-1", marketplaceFees: [
    { feeType: "FINAL_VALUE_FEE", amount: { value: "1.0500", currency: "EUR" } },
    { feeType: "FINAL_VALUE_FEE", amount: { value: "0.2500", currency: "EUR" } },
    { feeType: "FINAL_VALUE_FEE", amount: { value: "1.0500", currency: "EUR" } },
  ] }] }, { transactionId: "TX-ADJUST", transactionType: "ADJUSTMENT", transactionStatus: "BOOKED",
  bookingEntry: "CREDIT", transactionDate: "2026-10-03T10:00:00.000Z",
  amount: { value: "0.000100", currency: "EUR" }, personal: { email: "buyer@example.test" } }] };

const finances = projectEbayFinancesEconomic(financesFixture);
const sale = finances.transactions.find((entry) => entry.transactionId === "TX-SALE")!;
assert.equal(sale.totalFeeBasisAmount?.value, "12345678901234567890.123456789");
assert.equal(sale.transactionStatus, "FUNDS_AVAILABLE_FOR_PAYOUT");
const refund = finances.transactions.find((entry) => entry.transactionId === "TX-REFUND")!;
assert.equal(refund.amount?.value, "9007199254740993.123400");
assert.equal(refund.bookingEntry, "DEBIT");
assert.equal(refund.orderLineItems[0].marketplaceFees.length, 3);
assert.deepEqual(refund.orderLineItems[0].marketplaceFees.map((fee) => fee.amount.value),
  ["1.0500", "0.2500", "1.0500"]);
const financesJson = serialized(serializeEbayFinancesEconomicProjection(finances));
for (const marker of piiMarkers) assert.equal(financesJson.includes(marker), false, marker);
assert.equal(financesJson, serialized(serializeEbayFinancesEconomicProjection(projectEbayFinancesEconomic({
  transactions: [...financesFixture.transactions].reverse(), ignored: "different" }))));

assert.throws(() => projectEbayFinancesEconomic({ transactions: [
  financesFixture.transactions[0], financesFixture.transactions[0] ] }));
assert.throws(() => projectEbayFinancesEconomic({ transactions: [{ transactionId: "TX", transactionType: "REFUND",
  bookingEntry: "DEBIT", transactionDate: "2026-10-02T10:00:00Z" }] }));
assert.throws(() => projectEbayFinancesEconomic({ transactions: [{ transactionId: "TX", transactionType: "SALE",
  transactionDate: "2026-10-02T10:00:00Z", amount: { value: "1.00", currency: "EUR" } }] }));
assert.throws(() => projectEbayFinancesEconomic({ transactions: [{ transactionId: "TX", transactionType: "CREDIT",
  bookingEntry: "CREDIT", transactionDate: "2026-10-02T10:00:00Z",
  amount: { value: "1e3", currency: "EUR" } }] }));
assert.throws(() => projectEbayFinancesEconomic({ transactions: [{ transactionId: "TX", transactionType: "CREDIT",
  bookingEntry: "CREDIT", transactionDate: "2026-10-02T10:00:00Z", amount: { value: "1.00", currency: "EUR" },
  orderLineItems: [{ lineItemId: "DUP" }, { lineItemId: "DUP" }] }] }));

console.log("eBay ED2-A economic projection tests passed.");
