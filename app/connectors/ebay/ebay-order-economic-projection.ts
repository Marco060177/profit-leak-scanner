import { createHash } from "node:crypto";
import { assessFixedMoneyRepresentability, parseSourceExactMoney } from "~/core/source-exact-money";
import { EbayConnectorError } from "./ebay-types";

export const EBAY_ORDER_ECONOMIC_PROJECTION_SCHEMA = "EBAY_FULFILLMENT_ORDER_ECONOMIC_V1";
export const EBAY_ORDER_PAGE_MANIFEST_SCHEMA = "EBAY_FULFILLMENT_PAGE_MANIFEST_V1";
export const EBAY_FULFILLMENT_SOURCE_CONTRACT = "sell-fulfillment-v1";
export const EBAY_FULFILLMENT_HISTORICAL_SOURCE_VERSION = "sell-fulfillment-v1";
export const EBAY_FULFILLMENT_MINIMIZED_SOURCE_VERSION = "sell-fulfillment-economic-v1";
export const EBAY_FULFILLMENT_MINIMIZED_MAPPING_VERSION = "ebay-ed2c-economic-v1";

type JsonObject = Record<string, unknown>;
type OptionalString = string | null;
type SourceMoney = Readonly<{ value: string; currency: string }>;

export type EbayOrderEconomicProjection = Readonly<{
  projectionSchema: typeof EBAY_ORDER_ECONOMIC_PROJECTION_SCHEMA;
  sourceContract: typeof EBAY_FULFILLMENT_SOURCE_CONTRACT;
  marketplaceId: string;
  orderId: string;
  creationDate: string;
  lastModifiedDate: OptionalString;
  orderFulfillmentStatus: string;
  cancelState: OptionalString;
  pricingSummary: Readonly<{
    priceSubtotal: SourceMoney | null;
    deliveryCost: SourceMoney | null;
    tax: SourceMoney | null;
    total: SourceMoney | null;
    adjustment: SourceMoney | null;
  }> | null;
  lineItems: readonly Readonly<{
    lineItemId: string;
    legacyItemId: OptionalString;
    sku: OptionalString;
    quantity: number;
    lineItemFulfillmentStatus: OptionalString;
    lineItemCost: SourceMoney | null;
    discountedLineItemCost: SourceMoney | null;
    total: SourceMoney | null;
    deliveryCost: SourceMoney | null;
    taxes: readonly Readonly<{ amount: SourceMoney }>[];
  }>[];
}>;

export type EbayOrderPageManifest = Readonly<{
  projectionSchema: typeof EBAY_ORDER_PAGE_MANIFEST_SCHEMA;
  sourceContract: typeof EBAY_FULFILLMENT_SOURCE_CONTRACT;
  marketplaceId: string;
  pageNumber: number;
  offset: number;
  nextOffset: number | null;
  orderCount: number;
  orderProjectionChecksums: readonly string[];
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
const optionalString = (value: unknown): OptionalString =>
  value === undefined ? null : requiredString(value);
const timestamp = (value: unknown) => {
  const source = requiredString(value);
  if (!Number.isFinite(Date.parse(source)) || !/(?:Z|[+-]\d\d:\d\d)$/.test(source)) return malformed();
  return source;
};
const optionalTimestamp = (value: unknown): OptionalString => value === undefined ? null : timestamp(value);
const nonNegativeInteger = (value: unknown) => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return malformed();
  return value;
};
const positiveInteger = (value: unknown) => {
  const result = nonNegativeInteger(value);
  if (result === 0) return malformed();
  return result;
};
function money(value: unknown): SourceMoney {
  const source = object(value);
  const result = { value: requiredString(source.value), currency: requiredString(source.currency) };
  const assessed = assessFixedMoneyRepresentability(parseSourceExactMoney(result.value, result.currency));
  if (assessed.status !== "REPRESENTABLE") return malformed();
  return result;
}
const optionalMoney = (value: unknown) => value === undefined ? null : money(value);

function validateStatus(fulfillment: string, cancelState: OptionalString) {
  if (!["NOT_STARTED", "IN_PROGRESS", "FULFILLED"].includes(fulfillment)) return malformed();
  if (cancelState !== null && !["NONE_REQUESTED", "CANCEL_PENDING", "CANCELED", "CANCELLED"].includes(cancelState))
    return malformed();
}

export function projectEbayOrderEconomic(value: unknown, marketplaceId: string): EbayOrderEconomicProjection {
  const source = object(value);
  const normalizedMarketplaceId = requiredString(marketplaceId);
  const orderId = requiredString(source.orderId);
  const orderFulfillmentStatus = requiredString(source.orderFulfillmentStatus);
  const cancelStatus = source.cancelStatus === undefined ? null : object(source.cancelStatus);
  const cancelState = cancelStatus === null ? null : optionalString(cancelStatus.cancelState);
  validateStatus(orderFulfillmentStatus, cancelState);
  const rawPricing = source.pricingSummary === undefined ? null : object(source.pricingSummary);
  const pricingSummary = rawPricing === null ? null : {
    priceSubtotal: optionalMoney(rawPricing.priceSubtotal),
    deliveryCost: optionalMoney(rawPricing.deliveryCost),
    tax: optionalMoney(rawPricing.tax),
    total: optionalMoney(rawPricing.total),
    adjustment: optionalMoney(rawPricing.adjustment),
  };
  if (!Array.isArray(source.lineItems) || source.lineItems.length === 0) return malformed();
  const identities = new Set<string>();
  const lineItems = source.lineItems.map((entry) => {
    const item = object(entry);
    const lineItemId = requiredString(item.lineItemId);
    if (identities.has(lineItemId)) return malformed();
    identities.add(lineItemId);
    const rawTaxes = item.taxes === undefined ? [] : item.taxes;
    if (!Array.isArray(rawTaxes)) return malformed();
    return {
      lineItemId,
      legacyItemId: optionalString(item.legacyItemId),
      sku: optionalString(item.sku),
      quantity: positiveInteger(item.quantity),
      lineItemFulfillmentStatus: optionalString(item.lineItemFulfillmentStatus),
      lineItemCost: optionalMoney(item.lineItemCost),
      discountedLineItemCost: optionalMoney(item.discountedLineItemCost),
      total: optionalMoney(item.total),
      deliveryCost: optionalMoney(item.deliveryCost),
      taxes: rawTaxes.map((tax) => ({ amount: money(object(tax).amount) })),
    };
  }).sort((left, right) => left.lineItemId.localeCompare(right.lineItemId));
  const currencies = new Set([
    ...(pricingSummary ? Object.values(pricingSummary).flatMap((entry) => entry ? [entry.currency] : []) : []),
    ...lineItems.flatMap((item) => [item.lineItemCost, item.discountedLineItemCost, item.total, item.deliveryCost,
      ...item.taxes.map((tax) => tax.amount)].flatMap((entry) => entry ? [entry.currency] : [])),
  ]);
  if (currencies.size > 1) return malformed();
  return {
    projectionSchema: EBAY_ORDER_ECONOMIC_PROJECTION_SCHEMA,
    sourceContract: EBAY_FULFILLMENT_SOURCE_CONTRACT,
    marketplaceId: normalizedMarketplaceId,
    orderId,
    creationDate: timestamp(source.creationDate),
    lastModifiedDate: optionalTimestamp(source.lastModifiedDate),
    orderFulfillmentStatus,
    cancelState,
    pricingSummary,
    lineItems,
  };
}

export function serializeEbayOrderEconomicProjection(projection: EbayOrderEconomicProjection) {
  return new TextEncoder().encode(JSON.stringify(projection));
}

const checksum = (projection: EbayOrderEconomicProjection) => createHash("sha256")
  .update(serializeEbayOrderEconomicProjection(projection)).digest("hex");

export function projectEbayOrderPage(value: unknown, input: {
  marketplaceId: string;
  pageNumber: number;
  offset: number;
  nextOffset?: number | null;
}): Readonly<{ manifest: EbayOrderPageManifest; orders: readonly EbayOrderEconomicProjection[] }> {
  const root = object(value);
  if (!Array.isArray(root.orders)) return malformed();
  const orders = root.orders.map((order) => projectEbayOrderEconomic(order, input.marketplaceId))
    .sort((left, right) => left.orderId.localeCompare(right.orderId));
  const identities = new Set<string>();
  for (const order of orders) {
    if (identities.has(order.orderId)) return malformed();
    identities.add(order.orderId);
  }
  const manifest: EbayOrderPageManifest = {
    projectionSchema: EBAY_ORDER_PAGE_MANIFEST_SCHEMA,
    sourceContract: EBAY_FULFILLMENT_SOURCE_CONTRACT,
    marketplaceId: requiredString(input.marketplaceId),
    pageNumber: positiveInteger(input.pageNumber),
    offset: nonNegativeInteger(input.offset),
    nextOffset: input.nextOffset == null ? null : nonNegativeInteger(input.nextOffset),
    orderCount: orders.length,
    orderProjectionChecksums: orders.map(checksum),
  };
  return { manifest, orders };
}

export function serializeEbayOrderPageManifest(manifest: EbayOrderPageManifest) {
  return new TextEncoder().encode(JSON.stringify(manifest));
}

const omitNull = <T extends Record<string, unknown>>(value: T) => Object.fromEntries(
  Object.entries(value).filter(([, item]) => item !== null),
);

/** Reconstructs only the allowlisted shape consumed by the established canonical mapper. */
export function ebayOrderProjectionToMapperInput(projection: EbayOrderEconomicProjection) {
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
      ...(item.lineItemFulfillmentStatus
        ? { lineItemFulfillmentStatus: item.lineItemFulfillmentStatus } : {}),
      ...omitNull({ lineItemCost: item.lineItemCost,
        discountedLineItemCost: item.discountedLineItemCost,
        total: item.total, deliveryCost: item.deliveryCost }),
      ...(item.taxes.length ? { taxes: item.taxes } : {}),
    })),
  };
}
