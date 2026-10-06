import { assessFixedMoneyRepresentability, parseSourceExactMoney } from "~/core/source-exact-money";
import type { FixedMoney } from "~/core/fixed-money";
import { EbayConnectorError } from "./ebay-types";

type JsonObject = Record<string, unknown>;
export type EbayNormalizedOrderStatus = "PENDING" | "UNSHIPPED" | "PARTIALLY_SHIPPED" | "SHIPPED" | "CANCELLED";
export type EbayCanonicalOrderItem = Readonly<{
  externalOrderItemId: string;
  legacyItemId?: string;
  sku?: string;
  title?: string;
  quantity: number;
  sourceState?: string;
  monetaryValues: readonly FixedMoney[];
}>;
export type EbayCanonicalOrder = Readonly<{
  externalOrderId: string;
  creationDate: Date;
  lastModifiedDate?: Date;
  sourceStatus: string;
  normalizedStatus: EbayNormalizedOrderStatus;
  currency?: string;
  monetaryValues: readonly FixedMoney[];
  items: readonly EbayCanonicalOrderItem[];
}>;

const malformed = (): never => { throw new EbayConnectorError("MALFORMED_RESPONSE"); };
const object = (value: unknown): JsonObject => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return malformed();
  return value as JsonObject;
};
const requiredString = (value: unknown) => {
  if (typeof value !== "string" || !value || value !== value.trim()) return malformed();
  return value;
};
const optionalString = (value: unknown) => value === undefined ? undefined : requiredString(value);
const timestamp = (value: unknown) => {
  const source = requiredString(value); const millis = Date.parse(source);
  if (!Number.isFinite(millis) || !/(?:Z|[+-]\d\d:\d\d)$/.test(source)) return malformed();
  return new Date(millis);
};
const optionalTimestamp = (value: unknown) => value === undefined ? undefined : timestamp(value);

function exactMoney(value: unknown): FixedMoney {
  const source = object(value);
  const parsed = parseSourceExactMoney(requiredString(source.value), requiredString(source.currency));
  const assessed = assessFixedMoneyRepresentability(parsed);
  if (assessed.status !== "REPRESENTABLE") return malformed();
  return assessed.fixedMoney;
}

function collectMoney(source: JsonObject, names: readonly string[]) {
  return names.flatMap((name) => source[name] === undefined ? [] : [exactMoney(source[name])]);
}

function normalizedStatus(fulfillment: string, cancel: string | undefined): EbayNormalizedOrderStatus {
  if (cancel === "CANCELED" || cancel === "CANCELLED") return "CANCELLED";
  if (cancel !== undefined && cancel !== "NONE_REQUESTED" && cancel !== "CANCEL_PENDING")
    throw new EbayConnectorError("MALFORMED_RESPONSE");
  if (cancel === "CANCEL_PENDING") return "PENDING";
  const statuses: Record<string, EbayNormalizedOrderStatus> = {
    NOT_STARTED: "UNSHIPPED", IN_PROGRESS: "PARTIALLY_SHIPPED", FULFILLED: "SHIPPED",
  };
  const result = statuses[fulfillment];
  if (!result) throw new EbayConnectorError("MALFORMED_RESPONSE");
  return result;
}

export function mapEbayOrder(value: unknown): EbayCanonicalOrder {
  const source = object(value);
  const externalOrderId = requiredString(source.orderId);
  const fulfillment = requiredString(source.orderFulfillmentStatus);
  const cancelStatus = source.cancelStatus === undefined ? undefined : object(source.cancelStatus);
  const cancelState = optionalString(cancelStatus?.cancelState);
  if (!Array.isArray(source.lineItems) || source.lineItems.length === 0) return malformed();
  const items: EbayCanonicalOrderItem[] = source.lineItems.map((entry) => {
    const item = object(entry);
    if (typeof item.quantity !== "number" || !Number.isSafeInteger(item.quantity) || item.quantity < 1)
      return malformed();
    const monetaryValues = collectMoney(item,
      ["lineItemCost", "discountedLineItemCost", "total", "deliveryCost"]);
    if (item.taxes !== undefined) {
      if (!Array.isArray(item.taxes)) return malformed();
      for (const tax of item.taxes) {
        const taxObject = object(tax);
        if (taxObject.amount !== undefined) monetaryValues.push(exactMoney(taxObject.amount));
      }
    }
    return { externalOrderItemId: requiredString(item.lineItemId), legacyItemId: optionalString(item.legacyItemId),
      sku: optionalString(item.sku), title: optionalString(item.title), quantity: item.quantity,
      sourceState: optionalString(item.lineItemFulfillmentStatus), monetaryValues };
  });
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.externalOrderItemId)) throw new EbayConnectorError("MALFORMED_RESPONSE");
    ids.add(item.externalOrderItemId);
  }
  const pricing = source.pricingSummary === undefined ? undefined : object(source.pricingSummary);
  const monetaryValues = pricing ? collectMoney(pricing,
    ["priceSubtotal", "deliveryCost", "tax", "total", "adjustment"]) : [];
  const allMoney = [...monetaryValues, ...items.flatMap((item) => item.monetaryValues)];
  const currencies = new Set(allMoney.map((value) => value.currencyCode));
  if (currencies.size > 1) throw new EbayConnectorError("MALFORMED_RESPONSE");
  const sourceStatus = cancelState ? `${fulfillment}|${cancelState}` : fulfillment;
  return { externalOrderId, creationDate: timestamp(source.creationDate),
    lastModifiedDate: optionalTimestamp(source.lastModifiedDate), sourceStatus,
    normalizedStatus: normalizedStatus(fulfillment, cancelState),
    currency: currencies.values().next().value, monetaryValues,
    items: items.sort((a, b) => a.externalOrderItemId.localeCompare(b.externalOrderItemId)) };
}

export function ebayOrderSemantic(value: unknown) {
  return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? `${item}n` :
    item instanceof Date ? item.toISOString() : item);
}
