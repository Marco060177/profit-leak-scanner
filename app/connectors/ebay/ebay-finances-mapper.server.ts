import { createHash } from "node:crypto";
import type { ProjectionKind } from "~/core/data-core-d2b-contracts";
import type { FixedMoney } from "~/core/fixed-money";
import { money } from "~/core/fixed-money";
import { assessFixedMoneyRepresentability, createUnrepresentableMoneyBlocker,
  parseSourceExactMoney, type MoneyRepresentabilityReason, type SourceExactMoney,
  type UnrepresentableMoneyBlocker } from "~/core/source-exact-money";
import { EbayConnectorError } from "./ebay-types";

export const EBAY_FINANCES_MAPPING_VERSION = "ebay-sell-finances-v1-eb3b-v1";
export const EBAY_FINANCES_SOURCE_AUTHORITY = "ebay-finances-v1";

type SourceMoney = Readonly<{ value: string; currency: string }>;
export type EbayFinancialSourceTransaction = Readonly<{
  transactionId: string;
  transactionType: string | null;
  transactionStatus: string | null;
  bookingEntry: "CREDIT" | "DEBIT" | null;
  transactionDate: string | null;
  amount: SourceMoney | null;
  totalFeeBasisAmount: SourceMoney | null;
  orderId: string | null;
  orderLineItems: readonly Readonly<{
    lineItemId: string;
    marketplaceFees: readonly Readonly<{ feeType: string; amount: SourceMoney }>[];
  }>[];
}>;

type CommonNode = Readonly<{
  sourceComponentKey: string;
  sourceLeafPath: string;
  sourceType: string;
  projectionKind: ProjectionKind;
  sourceMoney: SourceExactMoney;
  orderId: string | null;
  lineItemId: string | null;
}>;
export type EbayCanonicalFinancialNode =
  | (CommonNode & Readonly<{ representability: "REPRESENTABLE"; fixedMoney: FixedMoney; blocker: null }>)
  | (CommonNode & Readonly<{ representability: "UNREPRESENTABLE"; fixedMoney: null;
      reasonCode: MoneyRepresentabilityReason; blocker: UnrepresentableMoneyBlocker }>);
export type EbayCanonicalFinancialTransaction = Readonly<{
  transactionId: string;
  transactionType: string | null;
  transactionStatus: string | null;
  bookingEntry: "CREDIT" | "DEBIT" | null;
  postedDate: Date | null;
  economicEventKey: string;
  orderId: string | null;
  supported: boolean;
  economicLeaves: readonly EbayCanonicalFinancialNode[];
  mappingVersion: typeof EBAY_FINANCES_MAPPING_VERSION;
  sourceAuthority: typeof EBAY_FINANCES_SOURCE_AUTHORITY;
  sourcePayloadChecksum: string;
}>;

function requiredString(value: unknown) {
  if (typeof value !== "string" || !value || value !== value.trim())
    throw new EbayConnectorError("MALFORMED_RESPONSE");
  return value;
}
function optionalString(value: unknown) {
  return value === undefined || value === null ? null : requiredString(value);
}
function sourceMoney(value: unknown): SourceMoney {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new EbayConnectorError("MALFORMED_RESPONSE");
  const record = value as Record<string, unknown>;
  return { value: requiredString(record.value), currency: requiredString(record.currency) };
}

export function parseEbayFinancesEvidencePage(body: Uint8Array) {
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)); }
  catch { throw new EbayConnectorError("MALFORMED_RESPONSE"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new EbayConnectorError("MALFORMED_RESPONSE");
  const root = parsed as Record<string, unknown>;
  if (!Array.isArray(root.transactions)) throw new EbayConnectorError("MALFORMED_RESPONSE");
  return root.transactions.map((entry): EbayFinancialSourceTransaction => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      throw new EbayConnectorError("MALFORMED_RESPONSE");
    const value = entry as Record<string, unknown>;
    const items = value.orderLineItems === undefined ? [] : value.orderLineItems;
    if (!Array.isArray(items)) throw new EbayConnectorError("MALFORMED_RESPONSE");
    return {
      transactionId: requiredString(value.transactionId),
      transactionType: value.transactionType === undefined || value.transactionType === null ? null :
        requiredString(value.transactionType),
      transactionStatus: optionalString(value.transactionStatus),
      transactionDate: optionalString(value.transactionDate),
      bookingEntry: value.bookingEntry === undefined || value.bookingEntry === null ? null :
        requiredString(value.bookingEntry) as "CREDIT" | "DEBIT",
      amount: value.amount === undefined || value.amount === null ? null : sourceMoney(value.amount),
      totalFeeBasisAmount: value.totalFeeBasisAmount === undefined || value.totalFeeBasisAmount === null ? null :
        sourceMoney(value.totalFeeBasisAmount),
      orderId: optionalString(value.orderId),
      orderLineItems: items.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item))
          throw new EbayConnectorError("MALFORMED_RESPONSE");
        const row = item as Record<string, unknown>;
        const fees = row.marketplaceFees === undefined ? [] : row.marketplaceFees;
        if (!Array.isArray(fees)) throw new EbayConnectorError("MALFORMED_RESPONSE");
        return { lineItemId: requiredString(row.lineItemId), marketplaceFees: fees.map((fee) => {
          if (!fee || typeof fee !== "object" || Array.isArray(fee))
            throw new EbayConnectorError("MALFORMED_RESPONSE");
          const leaf = fee as Record<string, unknown>;
          return { feeType: requiredString(leaf.feeType), amount: sourceMoney(leaf.amount) };
        }) };
      }),
    };
  });
}

const projectionByTransaction: Readonly<Record<string, ProjectionKind>> = Object.freeze({
  SALE: "PRODUCT_REVENUE",
  REFUND: "REFUND",
  NON_SALE_CHARGE: "MARKETPLACE_COMMISSION",
  SHIPPING_LABEL: "SHIPPING_EXPENSE",
  ADJUSTMENT: "ADJUSTMENT",
  CREDIT: "ADJUSTMENT",
});
const normalized = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
  .replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

function node(input: { transaction: EbayFinancialSourceTransaction; checksum: string; path: string;
  type: string; projection: ProjectionKind; money: SourceMoney; lineItemId: string | null;
  sign: "CREDIT" | "DEBIT" }) {
  const parsed = parseSourceExactMoney(input.money.value, input.money.currency);
  if (parsed.amountAtoms < 0n) throw new EbayConnectorError("MALFORMED_RESPONSE");
  const assessment = assessFixedMoneyRepresentability(parsed);
  const economicEventKey = `ebay-finances:transaction:${input.transaction.transactionId}`;
  const common: CommonNode = { sourceComponentKey: `${economicEventKey}:${input.path}`,
    sourceLeafPath: input.path, sourceType: input.type, projectionKind: input.projection,
    sourceMoney: parsed, orderId: input.transaction.orderId, lineItemId: input.lineItemId };
  if (assessment.status === "REPRESENTABLE")
    return { ...common, representability: "REPRESENTABLE" as const,
      fixedMoney: money(input.sign === "DEBIT" ? -assessment.fixedMoney.amountAtoms :
        assessment.fixedMoney.amountAtoms, assessment.fixedMoney.amountScale,
      assessment.fixedMoney.currencyCode), blocker: null };
  return { ...common, representability: "UNREPRESENTABLE" as const, fixedMoney: null,
    reasonCode: assessment.reasonCode,
    blocker: createUnrepresentableMoneyBlocker({ sourceSystem: "EBAY",
      sourceEventNamespace: "sell-finances-v1", sourceEventIdentity: input.transaction.transactionId,
      sourcePayloadChecksum: input.checksum, sourceLeafPath: input.path, economicEventKey,
      money: parsed }, assessment) };
}

export function mapEbayFinancialTransaction(transaction: EbayFinancialSourceTransaction,
sourcePayloadChecksum: string): EbayCanonicalFinancialTransaction {
  if (!/^[a-f0-9]{64}$/.test(sourcePayloadChecksum))
    throw new EbayConnectorError("MALFORMED_RESPONSE");
  const semantic = transaction.transactionType === null ? null : normalized(transaction.transactionType);
  const projection = semantic === null ? "UNKNOWN_UNCLASSIFIED" :
    projectionByTransaction[semantic] ?? "UNKNOWN_UNCLASSIFIED";
  const supported = projection !== "UNKNOWN_UNCLASSIFIED";
  if (supported && (!transaction.transactionDate ||
      (semantic === "SALE" ? !transaction.totalFeeBasisAmount : !transaction.amount || !transaction.bookingEntry)))
    throw new EbayConnectorError("MALFORMED_RESPONSE");
  if (transaction.bookingEntry !== null && !["CREDIT", "DEBIT"].includes(transaction.bookingEntry))
    throw new EbayConnectorError("MALFORMED_RESPONSE");
  const postedDate = transaction.transactionDate ? new Date(transaction.transactionDate) : null;
  if (postedDate && !Number.isFinite(postedDate.getTime()))
    throw new EbayConnectorError("MALFORMED_RESPONSE");
  const leaves: EbayCanonicalFinancialNode[] = [];
  if (semantic === "SALE" && transaction.totalFeeBasisAmount) leaves.push(node({ transaction,
    checksum: sourcePayloadChecksum, path: "/totalFeeBasisAmount",
    type: transaction.transactionType ?? "EBAY_TRANSACTION_TYPE_MISSING",
    projection, money: transaction.totalFeeBasisAmount, lineItemId: null, sign: "CREDIT" }));
  else if (transaction.amount && transaction.bookingEntry) leaves.push(node({ transaction,
    checksum: sourcePayloadChecksum, path: "/amount",
    type: transaction.transactionType ?? "EBAY_TRANSACTION_TYPE_MISSING",
    projection, money: transaction.amount, lineItemId: null, sign: transaction.bookingEntry }));
  for (let itemIndex = 0; itemIndex < transaction.orderLineItems.length; itemIndex += 1) {
    const item = transaction.orderLineItems[itemIndex];
    for (let feeIndex = 0; feeIndex < item.marketplaceFees.length; feeIndex += 1) {
      const fee = item.marketplaceFees[feeIndex];
      leaves.push(node({ transaction, checksum: sourcePayloadChecksum,
        path: `/orderLineItems/${itemIndex}/marketplaceFees/${feeIndex}/amount`,
        type: fee.feeType, projection: "MARKETPLACE_COMMISSION", money: fee.amount,
        lineItemId: item.lineItemId, sign: "DEBIT" }));
    }
  }
  const currencies = new Set(leaves.map((leaf) => leaf.sourceMoney.currencyCode));
  if (currencies.size > 1) throw new Error("eBay Finances transaction currency conflict");
  return { transactionId: transaction.transactionId, transactionType: transaction.transactionType,
    transactionStatus: transaction.transactionStatus, bookingEntry: transaction.bookingEntry, postedDate,
    economicEventKey: `ebay-finances:transaction:${transaction.transactionId}`,
    orderId: transaction.orderId, supported, economicLeaves: leaves,
    mappingVersion: EBAY_FINANCES_MAPPING_VERSION,
    sourceAuthority: EBAY_FINANCES_SOURCE_AUTHORITY, sourcePayloadChecksum };
}

export function mapEbayFinancialTransactions(pages: readonly Readonly<{ body: Uint8Array }>[] ) {
  const byId = new Map<string, EbayCanonicalFinancialTransaction>();
  const sourceById = new Map<string, string>();
  for (const page of pages) {
    const checksum = sha256(page.body);
    for (const source of parseEbayFinancesEvidencePage(page.body)) {
      const mapped = mapEbayFinancialTransaction(source, checksum);
      const semantic = JSON.stringify(source);
      const prior = sourceById.get(mapped.transactionId);
      if (prior && prior !== semantic)
        throw new Error("eBay Finances source transaction conflict");
      if (!prior) { sourceById.set(mapped.transactionId, semantic); byId.set(mapped.transactionId, mapped); }
    }
  }
  return [...byId.values()].sort((left, right) => left.transactionId.localeCompare(right.transactionId));
}
