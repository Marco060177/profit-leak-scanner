import { parseSourceExactMoney } from "~/core/source-exact-money";
import { EbayConnectorError } from "./ebay-types";

export const EBAY_FINANCES_ECONOMIC_PROJECTION_SCHEMA = "EBAY_FINANCES_ECONOMIC_V1";
export const EBAY_FINANCES_SOURCE_CONTRACT = "sell-finances-v1";
export const EBAY_FINANCES_HISTORICAL_SOURCE_VERSION = "sell-finances-v1";
export const EBAY_FINANCES_MINIMIZED_SOURCE_VERSION = "sell-finances-economic-v1";
export const EBAY_FINANCES_MINIMIZED_MAPPING_VERSION = "ebay-ed2d-economic-v1";

type JsonObject = Record<string, unknown>;
type OptionalString = string | null;
type SourceMoney = Readonly<{ value: string; currency: string }>;

export type EbayFinancesEconomicProjection = Readonly<{
  projectionSchema: typeof EBAY_FINANCES_ECONOMIC_PROJECTION_SCHEMA;
  sourceContract: typeof EBAY_FINANCES_SOURCE_CONTRACT;
  transactions: readonly Readonly<{
    transactionId: string;
    transactionType: string;
    transactionStatus: OptionalString;
    bookingEntry: "CREDIT" | "DEBIT" | null;
    transactionDate: OptionalString;
    amount: SourceMoney | null;
    totalFeeBasisAmount: SourceMoney | null;
    orderId: OptionalString;
    orderLineItems: readonly Readonly<{
      lineItemId: string;
      marketplaceFees: readonly Readonly<{ feeType: string; amount: SourceMoney }>[];
    }>[];
  }>[];
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
const optionalString = (value: unknown): OptionalString => value === undefined ? null : requiredString(value);
const timestamp = (value: unknown): OptionalString => {
  if (value === undefined) return null;
  const source = requiredString(value);
  if (!Number.isFinite(Date.parse(source)) || !/(?:Z|[+-]\d\d:\d\d)$/.test(source)) return malformed();
  return source;
};
function money(value: unknown): SourceMoney {
  const source = object(value);
  const result = { value: requiredString(source.value), currency: requiredString(source.currency) };
  parseSourceExactMoney(result.value, result.currency);
  return result;
}
const optionalMoney = (value: unknown) => value === undefined ? null : money(value);
const optionalBookingEntry = (value: unknown): "CREDIT" | "DEBIT" | null => {
  if (value === undefined) return null;
  const entry = requiredString(value);
  if (entry !== "CREDIT" && entry !== "DEBIT") return malformed();
  return entry;
};

function projectTransaction(value: unknown) {
  const source = object(value);
  const transactionId = requiredString(source.transactionId);
  const transactionType = requiredString(source.transactionType);
  const transactionStatus = optionalString(source.transactionStatus);
  const bookingEntry = optionalBookingEntry(source.bookingEntry);
  const transactionDate = timestamp(source.transactionDate);
  const amount = optionalMoney(source.amount);
  const totalFeeBasisAmount = optionalMoney(source.totalFeeBasisAmount);
  const orderId = optionalString(source.orderId);
  const rawItems = source.orderLineItems === undefined ? [] : source.orderLineItems;
  if (!Array.isArray(rawItems)) return malformed();
  const itemIds = new Set<string>();
  const orderLineItems = rawItems.map((entry) => {
    const item = object(entry);
    const lineItemId = requiredString(item.lineItemId);
    if (itemIds.has(lineItemId)) return malformed();
    itemIds.add(lineItemId);
    const rawFees = item.marketplaceFees === undefined ? [] : item.marketplaceFees;
    if (!Array.isArray(rawFees)) return malformed();
    const marketplaceFees = rawFees.map((fee) => {
      const row = object(fee);
      return { feeType: requiredString(row.feeType), amount: money(row.amount) };
    });
    return { lineItemId, marketplaceFees };
  });
  const normalizedType = transactionType.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
  if (!amount && !totalFeeBasisAmount) return malformed();
  if (normalizedType === "SALE" && (!totalFeeBasisAmount || !transactionDate)) return malformed();
  if (["REFUND", "NON_SALE_CHARGE", "SHIPPING_LABEL", "ADJUSTMENT", "CREDIT"].includes(normalizedType) &&
      (!amount || !bookingEntry || !transactionDate)) return malformed();
  return { transactionId, transactionType, transactionStatus, bookingEntry, transactionDate,
    amount, totalFeeBasisAmount, orderId, orderLineItems };
}

export function projectEbayFinancesEconomic(value: unknown): EbayFinancesEconomicProjection {
  const root = object(value);
  if (!Array.isArray(root.transactions)) return malformed();
  const transactions = root.transactions.map(projectTransaction)
    .sort((left, right) => left.transactionId.localeCompare(right.transactionId));
  const identities = new Set<string>();
  for (const transaction of transactions) {
    if (identities.has(transaction.transactionId)) return malformed();
    identities.add(transaction.transactionId);
  }
  return {
    projectionSchema: EBAY_FINANCES_ECONOMIC_PROJECTION_SCHEMA,
    sourceContract: EBAY_FINANCES_SOURCE_CONTRACT,
    transactions,
  };
}

export function serializeEbayFinancesEconomicProjection(projection: EbayFinancesEconomicProjection) {
  return new TextEncoder().encode(JSON.stringify(projection));
}

const omitNull = <T extends Record<string, unknown>>(value: T) => Object.fromEntries(
  Object.entries(value).filter(([, item]) => item !== null),
);

/** Reconstructs only the allowlisted shape consumed by the established financial mapper. */
export function ebayFinancesProjectionToMapperInput(projection: EbayFinancesEconomicProjection) {
  return { transactions: projection.transactions.map((transaction) => ({
    transactionId: transaction.transactionId,
    transactionType: transaction.transactionType,
    ...omitNull({ transactionStatus: transaction.transactionStatus,
      bookingEntry: transaction.bookingEntry, transactionDate: transaction.transactionDate,
      amount: transaction.amount, totalFeeBasisAmount: transaction.totalFeeBasisAmount,
      orderId: transaction.orderId }),
    ...(transaction.orderLineItems.length ? { orderLineItems: transaction.orderLineItems } : {}),
  })) };
}
