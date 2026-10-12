import { EBAY_FINANCES_ECONOMIC_PROJECTION_SCHEMA, EBAY_FINANCES_SOURCE_CONTRACT }
  from "./ebay-finances-economic-projection";
import { EBAY_FULFILLMENT_SOURCE_CONTRACT, EBAY_ORDER_ECONOMIC_PROJECTION_SCHEMA,
  EBAY_ORDER_PAGE_MANIFEST_SCHEMA } from "./ebay-order-economic-projection";

type JsonObject = Record<string, unknown>;

// This guard limits structure, not meaning. Allowed identifiers and SKU strings can remain
// personal or linkable if a provider or merchant places personal data in those fields.

const reject = (): never => { throw new Error("eBay economic projection persistence rejected"); };
const object = (value: unknown): JsonObject => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return reject();
  return value as JsonObject;
};
function exactKeys(value: JsonObject, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) reject();
}
const string = (value: unknown) => {
  if (typeof value !== "string" || !value || value !== value.trim()) reject();
};
const nullableString = (value: unknown) => { if (value !== null) string(value); };
const integer = (value: unknown, positive = false) => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < (positive ? 1 : 0)) reject();
};
const array = (value: unknown) => { if (!Array.isArray(value)) reject(); return value as unknown[]; };

function money(value: unknown) {
  const row = object(value);
  exactKeys(row, ["value", "currency"]);
  string(row.value); string(row.currency);
}
function nullableMoney(value: unknown) { if (value !== null) money(value); }

function orderProjection(value: unknown) {
  const row = object(value);
  exactKeys(row, ["projectionSchema", "sourceContract", "marketplaceId", "orderId", "creationDate",
    "lastModifiedDate", "orderFulfillmentStatus", "cancelState", "pricingSummary", "lineItems"]);
  if (row.projectionSchema !== EBAY_ORDER_ECONOMIC_PROJECTION_SCHEMA ||
      row.sourceContract !== EBAY_FULFILLMENT_SOURCE_CONTRACT) reject();
  string(row.marketplaceId); string(row.orderId); string(row.creationDate);
  nullableString(row.lastModifiedDate); string(row.orderFulfillmentStatus); nullableString(row.cancelState);
  if (row.pricingSummary !== null) {
    const pricing = object(row.pricingSummary);
    exactKeys(pricing, ["priceSubtotal", "deliveryCost", "tax", "total", "adjustment"]);
    for (const field of Object.values(pricing)) nullableMoney(field);
  }
  for (const value of array(row.lineItems)) {
    const item = object(value);
    exactKeys(item, ["lineItemId", "legacyItemId", "sku", "quantity", "lineItemFulfillmentStatus",
      "lineItemCost", "discountedLineItemCost", "total", "deliveryCost", "taxes"]);
    string(item.lineItemId); nullableString(item.legacyItemId); nullableString(item.sku);
    integer(item.quantity, true); nullableString(item.lineItemFulfillmentStatus);
    nullableMoney(item.lineItemCost); nullableMoney(item.discountedLineItemCost);
    nullableMoney(item.total); nullableMoney(item.deliveryCost);
    for (const value of array(item.taxes)) {
      const tax = object(value); exactKeys(tax, ["amount"]); money(tax.amount);
    }
  }
}

function pageManifest(value: unknown) {
  const row = object(value);
  exactKeys(row, ["projectionSchema", "sourceContract", "marketplaceId", "pageNumber", "offset",
    "nextOffset", "orderCount", "orderProjectionChecksums"]);
  if (row.projectionSchema !== EBAY_ORDER_PAGE_MANIFEST_SCHEMA ||
      row.sourceContract !== EBAY_FULFILLMENT_SOURCE_CONTRACT) reject();
  string(row.marketplaceId); integer(row.pageNumber, true); integer(row.offset);
  if (row.nextOffset !== null) integer(row.nextOffset);
  integer(row.orderCount);
  const checksums = array(row.orderProjectionChecksums);
  if (checksums.length !== row.orderCount) reject();
  for (const checksum of checksums)
    if (typeof checksum !== "string" || !/^[a-f0-9]{64}$/.test(checksum)) reject();
}

function financesProjection(value: unknown) {
  const row = object(value);
  exactKeys(row, ["projectionSchema", "sourceContract", "transactions"]);
  if (row.projectionSchema !== EBAY_FINANCES_ECONOMIC_PROJECTION_SCHEMA ||
      row.sourceContract !== EBAY_FINANCES_SOURCE_CONTRACT) reject();
  for (const value of array(row.transactions)) {
    const transaction = object(value);
    exactKeys(transaction, ["transactionId", "transactionType", "transactionStatus", "bookingEntry",
      "transactionDate", "amount", "totalFeeBasisAmount", "orderId", "orderLineItems"]);
    string(transaction.transactionId); string(transaction.transactionType);
    nullableString(transaction.transactionStatus); nullableString(transaction.transactionDate);
    nullableString(transaction.orderId);
    if (transaction.bookingEntry !== null && transaction.bookingEntry !== "CREDIT" &&
        transaction.bookingEntry !== "DEBIT") reject();
    nullableMoney(transaction.amount); nullableMoney(transaction.totalFeeBasisAmount);
    for (const value of array(transaction.orderLineItems)) {
      const item = object(value);
      exactKeys(item, ["lineItemId", "marketplaceFees"]); string(item.lineItemId);
      for (const value of array(item.marketplaceFees)) {
        const fee = object(value);
        exactKeys(fee, ["feeType", "amount"]); string(fee.feeType); money(fee.amount);
      }
    }
  }
}

function parseCanonical(bytes: Uint8Array) {
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { return reject(); }
  if (!Buffer.from(new TextEncoder().encode(JSON.stringify(value))).equals(Buffer.from(bytes))) reject();
  return value;
}

export function assertEbayOrderProjectionPersistence(bytes: Uint8Array) {
  orderProjection(parseCanonical(bytes));
}

export function assertEbayOrderPageManifestPersistence(bytes: Uint8Array) {
  pageManifest(parseCanonical(bytes));
}

export function assertEbayFinancesProjectionPersistence(bytes: Uint8Array) {
  financesProjection(parseCanonical(bytes));
}
