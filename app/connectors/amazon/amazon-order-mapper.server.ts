import { money, type FixedMoney } from "~/core/fixed-money";
import { AmazonConnectorError } from "./amazon-types";

export type AmazonNormalizedOrderStatus =
  | "PENDING" | "UNSHIPPED" | "PARTIALLY_SHIPPED" | "SHIPPED" | "CANCELLED" | "UNFULFILLABLE";
export type AmazonNormalizedFulfillment = "MERCHANT" | "AMAZON";

export type AmazonCanonicalMoneyBreakdown = Readonly<{
  type: string;
  subtotal?: FixedMoney;
  details: ReadonlyArray<Readonly<{ subtype: string; value: FixedMoney }>>;
}>;
export type AmazonCanonicalOrderItem = Readonly<{
  externalOrderItemId: string;
  externalOrderId: string;
  externalMarketplaceId: string;
  asin?: string;
  sellerSku?: string;
  title?: string;
  conditionType?: string;
  conditionSubtype?: string;
  quantityOrdered: number;
  quantityShipped?: number;
  quantityUnshipped?: number;
  unitPrice?: FixedMoney;
  proceedsTotal?: FixedMoney;
  proceedsBreakdowns: ReadonlyArray<AmazonCanonicalMoneyBreakdown>;
}>;
export type AmazonCanonicalOrder = Readonly<{
  externalOrderId: string;
  externalMarketplaceId: string;
  sellerOrderId?: string;
  purchaseDate: Date;
  lastUpdatedAt: Date;
  sourceStatus: string;
  normalizedStatus: AmazonNormalizedOrderStatus;
  sourceFulfillmentChannel: string;
  fulfillmentChannel: AmazonNormalizedFulfillment;
  salesChannel: string;
  programs: ReadonlyArray<string>;
  replacedOrderId?: string;
  orderTotal?: FixedMoney;
  currency?: string;
  proceedsBreakdowns: ReadonlyArray<AmazonCanonicalMoneyBreakdown>;
  numberOfItemsShipped?: number;
  numberOfItemsUnshipped?: number;
  earliestShipDate?: Date;
  latestShipDate?: Date;
  earliestDeliveryDate?: Date;
  latestDeliveryDate?: Date;
  items: ReadonlyArray<AmazonCanonicalOrderItem>;
}>;

type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject => !!value && typeof value === "object" && !Array.isArray(value);
const malformed = (): never => { throw new AmazonConnectorError("MALFORMED_RESPONSE"); };
function object(value: unknown): JsonObject { if (!isObject(value)) malformed(); return value as JsonObject; }
function requiredString(value: unknown): string {
  if (typeof value !== "string" || !value || value !== value.trim()) return malformed();
  return value as string;
}
function optionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value);
}
function timestamp(value: unknown): Date {
  const raw = requiredString(value);
  const millis = Date.parse(raw);
  if (!Number.isFinite(millis) || !/(?:Z|[+-]\d\d:\d\d)$/.test(raw)) malformed();
  return new Date(millis);
}
function optionalTimestamp(value: unknown): Date | undefined { return value === undefined ? undefined : timestamp(value); }
function integer(value: unknown, required = false): number | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) malformed();
  return value as number;
}
function exactMoney(value: unknown): FixedMoney {
  const source = object(value);
  const amount = requiredString(source.amount);
  const currency = requiredString(source.currencyCode);
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d{1,12})?$/.test(amount) || !/^[A-Z]{3}$/.test(currency)) malformed();
  const negative = amount.startsWith("-");
  const [whole, fraction = ""] = (negative ? amount.slice(1) : amount).split(".");
  const atoms = BigInt(whole + fraction) * (negative ? -1n : 1n);
  try { return money(atoms, fraction.length, currency); } catch { return malformed(); }
}
function optionalMoney(value: unknown): FixedMoney | undefined { return value === undefined ? undefined : exactMoney(value); }
function array(value: unknown): unknown[] { if (!Array.isArray(value)) return malformed(); return value as unknown[]; }

function breakdowns(value: unknown): AmazonCanonicalMoneyBreakdown[] {
  if (value === undefined) return [];
  return array(value).map((entry) => {
    const source = object(entry);
    const details = (source.detailedBreakdowns === undefined ? [] : array(source.detailedBreakdowns).map((detail) => {
      const child = object(detail);
      return { subtype: requiredString(child.subtype), value: exactMoney(child.value) };
    })).sort((a, b) => semantic(a).localeCompare(semantic(b)));
    return { type: requiredString(source.type), subtotal: optionalMoney(source.subtotal), details };
  }).sort((a, b) => semantic(a).localeCompare(semantic(b)));
}

const statuses = new Set(["PENDING_AVAILABILITY", "PENDING", "UNSHIPPED", "PARTIALLY_SHIPPED", "SHIPPED", "CANCELLED", "UNFULFILLABLE"]);
function status(value: unknown): AmazonNormalizedOrderStatus {
  const source = requiredString(value);
  if (!statuses.has(source)) throw new AmazonConnectorError("UNSUPPORTED_SOURCE_VALUE");
  return source === "PENDING_AVAILABILITY" ? "PENDING" : source as AmazonNormalizedOrderStatus;
}
function fulfillment(value: unknown): AmazonNormalizedFulfillment {
  const source = requiredString(value);
  if (source !== "MERCHANT" && source !== "AMAZON") throw new AmazonConnectorError("UNSUPPORTED_SOURCE_VALUE");
  return source;
}

function mapItem(value: unknown, orderId: string, marketplaceId: string): AmazonCanonicalOrderItem {
  const source = object(value);
  const product = source.product === undefined ? undefined : object(source.product);
  const condition = product?.condition === undefined ? undefined : object(product.condition);
  const price = product?.price === undefined ? undefined : object(product.price);
  const proceeds = source.proceeds === undefined ? undefined : object(source.proceeds);
  const itemFulfillment = source.fulfillment === undefined ? undefined : object(source.fulfillment);
  return {
    externalOrderItemId: requiredString(source.orderItemId), externalOrderId: orderId,
    externalMarketplaceId: marketplaceId, asin: optionalString(product?.asin), sellerSku: optionalString(product?.sellerSku),
    title: optionalString(product?.title), conditionType: optionalString(condition?.conditionType),
    conditionSubtype: optionalString(condition?.conditionSubtype), quantityOrdered: integer(source.quantityOrdered, true)!,
    quantityShipped: integer(itemFulfillment?.quantityFulfilled), quantityUnshipped: integer(itemFulfillment?.quantityUnfulfilled),
    unitPrice: optionalMoney(price?.unitPrice), proceedsTotal: optionalMoney(proceeds?.proceedsTotal),
    proceedsBreakdowns: breakdowns(proceeds?.breakdowns),
  };
}

export function mapAmazonOrder(value: unknown, requestedMarketplaceId: string): AmazonCanonicalOrder {
  const source = object(value);
  const orderId = requiredString(source.orderId);
  const salesChannel = object(source.salesChannel);
  const marketplaceId = requiredString(salesChannel.marketplaceId);
  if (marketplaceId !== requestedMarketplaceId) throw new AmazonConnectorError("SOURCE_CONFLICT");
  const fulfillmentSource = object(source.fulfillment);
  const sourceStatus = requiredString(fulfillmentSource.fulfillmentStatus);
  const sourceFulfillment = requiredString(fulfillmentSource.fulfilledBy);
  const proceeds = source.proceeds === undefined ? undefined : object(source.proceeds);
  const ship = fulfillmentSource.shipByWindow === undefined ? undefined : object(fulfillmentSource.shipByWindow);
  const deliver = fulfillmentSource.deliverByWindow === undefined ? undefined : object(fulfillmentSource.deliverByWindow);
  const aliases = source.orderAliases === undefined ? [] : array(source.orderAliases);
  const associated = source.associatedOrders === undefined ? [] : array(source.associatedOrders);
  const alias = aliases.find((x) => isObject(x) && x.aliasType === "SELLER_ORDER_ID") as JsonObject | undefined;
  const original = associated.find((x) => isObject(x) && x.associationType === "REPLACEMENT_ORIGINAL_ID") as JsonObject | undefined;
  const items = array(source.orderItems).map((item) => mapItem(item, orderId, marketplaceId));
  const unique = new Map<string, AmazonCanonicalOrderItem>();
  for (const item of items) {
    const prior = unique.get(item.externalOrderItemId);
    if (prior && semantic(prior) !== semantic(item)) throw new AmazonConnectorError("SOURCE_CONFLICT");
    unique.set(item.externalOrderItemId, item);
  }
  const programs = source.programs === undefined ? [] : array(source.programs).map(requiredString).sort();
  const orderTotal = optionalMoney(proceeds?.grandTotal);
  const orderBreakdowns = breakdowns(proceeds?.breakdowns);
  const monetaryValues = [orderTotal, ...orderBreakdowns.flatMap((entry) =>
    [entry.subtotal, ...entry.details.map((detail) => detail.value)]), ...[...unique.values()].flatMap((item) =>
    [item.unitPrice, item.proceedsTotal, ...item.proceedsBreakdowns.flatMap((entry) =>
      [entry.subtotal, ...entry.details.map((detail) => detail.value)])])].filter((entry): entry is FixedMoney => !!entry);
  const currencies = new Set(monetaryValues.map((entry) => entry.currencyCode));
  if (currencies.size > 1) throw new AmazonConnectorError("SOURCE_CONFLICT");
  return {
    externalOrderId: orderId, externalMarketplaceId: marketplaceId, sellerOrderId: optionalString(alias?.aliasId),
    purchaseDate: timestamp(source.createdTime), lastUpdatedAt: timestamp(source.lastUpdatedTime), sourceStatus,
    normalizedStatus: status(sourceStatus), sourceFulfillmentChannel: sourceFulfillment,
    fulfillmentChannel: fulfillment(sourceFulfillment), salesChannel: requiredString(salesChannel.channelName), programs,
    replacedOrderId: optionalString(original?.orderId),
    orderTotal, currency: currencies.values().next().value, proceedsBreakdowns: orderBreakdowns,
    numberOfItemsShipped: integer(fulfillmentSource.numberOfItemsShipped),
    numberOfItemsUnshipped: integer(fulfillmentSource.numberOfItemsUnshipped),
    earliestShipDate: optionalTimestamp(ship?.earliestDateTime), latestShipDate: optionalTimestamp(ship?.latestDateTime),
    earliestDeliveryDate: optionalTimestamp(deliver?.earliestDateTime), latestDeliveryDate: optionalTimestamp(deliver?.latestDateTime),
    items: [...unique.values()].sort((a, b) => a.externalOrderItemId.localeCompare(b.externalOrderItemId)),
  };
}

export function semantic(value: unknown): string {
  return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? `${item}n` : item instanceof Date ? item.toISOString() : item,
    0);
}
