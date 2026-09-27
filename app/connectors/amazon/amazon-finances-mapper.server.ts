import { createHash } from "node:crypto";
import type { ProjectionKind } from "~/core/data-core-d2b-contracts";
import type { FixedMoney } from "~/core/fixed-money";
import {
  assessFixedMoneyRepresentability,
  createUnrepresentableMoneyBlocker,
  parseSourceExactMoney,
  type MoneyRepresentabilityReason,
  type SourceExactMoney,
  type UnrepresentableMoneyBlocker,
} from "~/core/source-exact-money";
import { AmazonConnectorError } from "./amazon-types";
import type {
  AmazonFinancesAcquisition,
  AmazonFinancesBreakdown,
  AmazonFinancesContext,
  AmazonFinancesItem,
  AmazonFinancesMoney,
  AmazonFinancesRelatedIdentifier,
  AmazonFinancesTransaction,
  AmazonLosslessJson,
} from "./amazon-finances.server";

export const AMAZON_FINANCES_MAPPING_VERSION = "amazon-finances-v2024-06-19-e2c-v1";
export const AMAZON_FINANCES_SOURCE_AUTHORITY = "amazon-finances-v2024-06-19";

export type AmazonFinancialOwnership = "ECONOMIC" | "INFORMATIONAL";
export type AmazonFinancialValidation =
  | "MATCH"
  | "MISMATCH"
  | "NOT_COMPARABLE"
  | "NO_CHILDREN";
export type AmazonFinancialFinality = "DEFERRED" | "RELEASED" | "UNKNOWN";

export type AmazonFinancialCorrelation = Readonly<{
  orderId: string | null;
  itemIdentifiers: readonly AmazonFinancesRelatedIdentifier[];
  /** SKU/ASIN and source item identifiers are evidence, never a D2A identity. */
  d2aOrderItemId: null;
}>;

type CanonicalMoneyCommon = Readonly<{
  ownership: AmazonFinancialOwnership;
  sourceNodeKind: "TRANSACTION_TOTAL" | "ITEM_TOTAL" | "BREAKDOWN";
  sourceType: string;
  ancestry: readonly string[];
  sourceLeafPath: string;
  sourceComponentKey: string;
  economicEventKey: string;
  projectionKind: ProjectionKind;
  sourceAuthority: typeof AMAZON_FINANCES_SOURCE_AUTHORITY;
  mappingVersion: typeof AMAZON_FINANCES_MAPPING_VERSION;
  postedDate: Date;
  marketplaceId: string | null;
  correlation: AmazonFinancialCorrelation;
  sourceMoney: SourceExactMoney;
  childValidation: AmazonFinancialValidation;
}>;

export type AmazonCanonicalFinancialMoneyNode =
  | (CanonicalMoneyCommon & Readonly<{
      representability: "REPRESENTABLE";
      fixedMoney: FixedMoney;
      blocker: null;
    }>)
  | (CanonicalMoneyCommon & Readonly<{
      representability: "UNREPRESENTABLE";
      reasonCode: MoneyRepresentabilityReason;
      fixedMoney: null;
      blocker: UnrepresentableMoneyBlocker;
    }>);

export type AmazonCanonicalFinancialTransaction = Readonly<{
  transactionId: string;
  transactionType: string;
  transactionStatus: string | null;
  finality: AmazonFinancialFinality;
  postedDate: Date;
  economicEventKey: string;
  marketplace: AmazonFinancesTransaction["marketplace"];
  sellingPartner: AmazonFinancesTransaction["sellingPartner"];
  marketplaceId: string | null;
  relatedIdentifiers: readonly AmazonFinancesRelatedIdentifier[];
  contexts: readonly AmazonFinancesContext[];
  items: readonly Readonly<{
    itemKey: string;
    description: string | null;
    relatedIdentifiers: readonly AmazonFinancesRelatedIdentifier[];
    contexts: readonly AmazonFinancesContext[];
  }>[];
  informationalMonetaryNodes: readonly AmazonCanonicalFinancialMoneyNode[];
  economicLeaves: readonly AmazonCanonicalFinancialMoneyNode[];
  unresolvedEconomicLeaves: readonly Extract<AmazonCanonicalFinancialMoneyNode, { representability: "UNREPRESENTABLE" }>[];
  mappingVersion: typeof AMAZON_FINANCES_MAPPING_VERSION;
  sourceAuthority: typeof AMAZON_FINANCES_SOURCE_AUTHORITY;
  sourcePayloadChecksum: string;
}>;

export type AmazonFinancesMappingContext = Readonly<{
  sourcePayloadChecksum: string;
}>;

const projectionBySemantic: Readonly<Record<string, ProjectionKind>> = Object.freeze({
  PRODUCT: "PRODUCT_REVENUE",
  PRODUCT_CHARGE: "PRODUCT_REVENUE",
  PRINCIPAL: "PRODUCT_REVENUE",
  ORDER_REVENUE: "PRODUCT_REVENUE",
  SALE: "PRODUCT_REVENUE",
  SHIPMENT: "PRODUCT_REVENUE",
  SHIPPING: "SHIPPING_REVENUE",
  SHIPPING_CHARGE: "SHIPPING_REVENUE",
  SHIPPING_REVENUE: "SHIPPING_REVENUE",
  SHIPPING_COST: "SHIPPING_EXPENSE",
  SHIPPING_EXPENSE: "SHIPPING_EXPENSE",
  TAX: "TAX_COMPONENT",
  TAX_COMPONENT: "TAX_COMPONENT",
  MARKETPLACE_FEE: "MARKETPLACE_COMMISSION",
  MARKETPLACE_COMMISSION: "MARKETPLACE_COMMISSION",
  REFERRAL_FEE: "MARKETPLACE_COMMISSION",
  COMMISSION: "MARKETPLACE_COMMISSION",
  SERVICE_FEE: "MARKETPLACE_COMMISSION",
  PERIODIC_FEE: "MARKETPLACE_COMMISSION",
  FULFILLMENT_FEE: "FULFILLMENT_FEE",
  FBA_FEE: "FULFILLMENT_FEE",
  STORAGE_FEE: "STORAGE_FEE",
  PROMOTION: "DISCOUNT_PROMOTION",
  PROMOTIONAL_DISCOUNT: "DISCOUNT_PROMOTION",
  DISCOUNT: "DISCOUNT_PROMOTION",
  REFUND: "REFUND",
  REFUND_CHARGE: "REFUND",
  REIMBURSEMENT: "REIMBURSEMENT",
  ADJUSTMENT: "ADJUSTMENT",
});

function normalizedSemantic(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
}

export function classifyAmazonFinancialSemantic(value: string): ProjectionKind {
  return projectionBySemantic[normalizedSemantic(value)] ?? "UNKNOWN_UNCLASSIFIED";
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (typeof value === "object") return "{" + Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => JSON.stringify(key) + ":" + stableJson(item)).join(",") + "}";
  return JSON.stringify(value);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function semanticBreakdown(value: AmazonFinancesBreakdown): string {
  return stableJson({
    breakdownType: value.breakdownType,
    breakdownAmount: value.breakdownAmount ? {
      currencyCode: value.breakdownAmount.currencyCode,
      amount: value.breakdownAmount.amount.sourceText,
    } : null,
    breakdowns: value.breakdowns.map(semanticBreakdown).sort(),
  });
}

function canonicalSiblings(values: readonly AmazonFinancesBreakdown[]) {
  return values.map((value, originalIndex) => ({ value, originalIndex, semantic: semanticBreakdown(value) }))
    .sort((left, right) => left.semantic.localeCompare(right.semantic) || left.originalIndex - right.originalIndex)
    .map((entry, index, sorted) => ({
      value: entry.value,
      occurrence: sorted.slice(0, index).filter((prior) => prior.value.breakdownType === entry.value.breakdownType).length + 1,
    }));
}

function encoded(value: string): string { return encodeURIComponent(value); }

function identifierValue(values: readonly AmazonFinancesRelatedIdentifier[], name: string): string | null {
  const matches = [...new Set(values.filter((item) => item.name === name).map((item) => item.value))];
  if (matches.length > 1) throw new AmazonConnectorError("SOURCE_CONFLICT");
  return matches[0] ?? null;
}

function itemKey(item: AmazonFinancesItem, index: number): string {
  for (const name of ["ORDER_ITEM_ID", "ITEM_ID", "TRANSACTION_ITEM_ID"]) {
    const value = identifierValue(item.relatedIdentifiers, name);
    if (value) return `${normalizedSemantic(name)}:${encoded(value)}`;
  }
  return `occurrence:${index + 1}`;
}

function marketplaceId(transaction: AmazonFinancesTransaction): string | null {
  const candidates = [...new Set([
    transaction.marketplace?.marketplaceId,
    transaction.sellingPartner?.marketplaceId,
  ].filter((value): value is string => !!value))];
  if (candidates.length > 1) throw new AmazonConnectorError("SOURCE_CONFLICT");
  return candidates[0] ?? null;
}

function exactCompare(
  parent: SourceExactMoney,
  children: readonly SourceExactMoney[],
): AmazonFinancialValidation {
  if (!children.length) return "NO_CHILDREN";
  if (children.some((child) => child.currencyCode !== parent.currencyCode)) return "NOT_COMPARABLE";
  const scale = Math.max(parent.amountScale, ...children.map((child) => child.amountScale));
  const parentAtoms = parent.amountAtoms * 10n ** BigInt(scale - parent.amountScale);
  const childAtoms = children.reduce((sum, child) =>
    sum + child.amountAtoms * 10n ** BigInt(scale - child.amountScale), 0n);
  return parentAtoms === childAtoms ? "MATCH" : "MISMATCH";
}

function sourceMoney(value: AmazonFinancesMoney): SourceExactMoney {
  return parseSourceExactMoney(value.amount.sourceText, value.currencyCode);
}

function descendantComparisonMoney(value: AmazonFinancesBreakdown): SourceExactMoney[] {
  if (value.breakdownAmount) return [sourceMoney(value.breakdownAmount)];
  return value.breakdowns.flatMap(descendantComparisonMoney);
}

function hasMonetaryDescendant(values: readonly AmazonFinancesBreakdown[]): boolean {
  return values.some((value) => !!value.breakdownAmount || hasMonetaryDescendant(value.breakdowns));
}

function finality(status: string | undefined): AmazonFinancialFinality {
  if (status === "DEFERRED") return "DEFERRED";
  if (status === "RELEASED" || status === "DEFERRED_RELEASED") return "RELEASED";
  return "UNKNOWN";
}

function totalProjection(transactionType: string): ProjectionKind {
  return classifyAmazonFinancialSemantic(transactionType);
}

type BuildContext = Readonly<{
  transaction: AmazonFinancesTransaction;
  sourcePayloadChecksum: string;
  economicEventKey: string;
  marketplaceId: string | null;
  orderId: string | null;
}>;

function buildNode(input: {
  context: BuildContext;
  sourceNodeKind: CanonicalMoneyCommon["sourceNodeKind"];
  sourceType: string;
  ancestry: readonly string[];
  path: string;
  ownership: AmazonFinancialOwnership;
  projectionKind: ProjectionKind;
  money: AmazonFinancesMoney;
  children: readonly SourceExactMoney[];
  itemIdentifiers?: readonly AmazonFinancesRelatedIdentifier[];
}): AmazonCanonicalFinancialMoneyNode {
  const parsed = sourceMoney(input.money);
  const assessment = assessFixedMoneyRepresentability(parsed);
  const common: CanonicalMoneyCommon = {
    ownership: input.ownership,
    sourceNodeKind: input.sourceNodeKind,
    sourceType: input.sourceType,
    ancestry: input.ancestry,
    sourceLeafPath: input.path,
    sourceComponentKey: `${input.context.economicEventKey}:${input.path}`,
    economicEventKey: input.context.economicEventKey,
    projectionKind: input.projectionKind,
    sourceAuthority: AMAZON_FINANCES_SOURCE_AUTHORITY,
    mappingVersion: AMAZON_FINANCES_MAPPING_VERSION,
    postedDate: new Date(input.context.transaction.postedDate),
    marketplaceId: input.context.marketplaceId,
    correlation: {
      orderId: input.context.orderId,
      itemIdentifiers: input.itemIdentifiers ?? [],
      d2aOrderItemId: null,
    },
    sourceMoney: parsed,
    childValidation: exactCompare(parsed, input.children),
  };
  if (assessment.status === "REPRESENTABLE") return {
    ...common,
    representability: "REPRESENTABLE",
    fixedMoney: assessment.fixedMoney,
    blocker: null,
  };
  const blocker = createUnrepresentableMoneyBlocker({
    sourceSystem: "AMAZON",
    sourceEventNamespace: "finances-v2024-06-19",
    sourceEventIdentity: input.context.transaction.transactionId,
    sourcePayloadChecksum: input.context.sourcePayloadChecksum,
    sourceLeafPath: input.path,
    economicEventKey: input.context.economicEventKey,
    money: parsed,
  }, assessment);
  return {
    ...common,
    representability: "UNREPRESENTABLE",
    reasonCode: assessment.reasonCode,
    fixedMoney: null,
    blocker,
  };
}

function walkBreakdowns(input: {
  context: BuildContext;
  breakdowns: readonly AmazonFinancesBreakdown[];
  parentPath: string;
  ancestry: readonly string[];
  itemIdentifiers?: readonly AmazonFinancesRelatedIdentifier[];
}): AmazonCanonicalFinancialMoneyNode[] {
  const nodes: AmazonCanonicalFinancialMoneyNode[] = [];
  for (const sibling of canonicalSiblings(input.breakdowns)) {
    const value = sibling.value;
    const segment = `${encoded(value.breakdownType)}~${sibling.occurrence}`;
    const path = `${input.parentPath}/breakdowns/${segment}`;
    const ancestry = [...input.ancestry, value.breakdownType];
    const decomposed = hasMonetaryDescendant(value.breakdowns);
    if (value.breakdownAmount) nodes.push(buildNode({
      context: input.context,
      sourceNodeKind: "BREAKDOWN",
      sourceType: value.breakdownType,
      ancestry,
      path: `${path}/breakdownAmount`,
      ownership: decomposed ? "INFORMATIONAL" : "ECONOMIC",
      projectionKind: classifyAmazonFinancialSemantic(value.breakdownType),
      money: value.breakdownAmount,
      children: value.breakdowns.flatMap(descendantComparisonMoney),
      itemIdentifiers: input.itemIdentifiers,
    }));
    nodes.push(...walkBreakdowns({
      context: input.context,
      breakdowns: value.breakdowns,
      parentPath: path,
      ancestry,
      itemIdentifiers: input.itemIdentifiers,
    }));
  }
  return nodes;
}

function canonicalItemOrder(items: readonly AmazonFinancesItem[]) {
  return items.map((value, originalIndex) => ({ value, originalIndex, semantic: stableJson(value) }))
    .sort((left, right) => left.semantic.localeCompare(right.semantic) || left.originalIndex - right.originalIndex);
}

/** Pure E2-C mapping. It performs no Prisma or Data Core writes. */
export function mapAmazonFinancialTransaction(
  transaction: AmazonFinancesTransaction,
  mappingContext: AmazonFinancesMappingContext,
): AmazonCanonicalFinancialTransaction {
  if (!/^[a-f0-9]{64}$/.test(mappingContext.sourcePayloadChecksum))
    throw new AmazonConnectorError("MALFORMED_RESPONSE");
  const economicEventKey = `amazon-finances:transaction:${transaction.transactionId}`;
  const resolvedMarketplaceId = marketplaceId(transaction);
  const orderId = identifierValue(transaction.relatedIdentifiers, "ORDER_ID");
  const context: BuildContext = {
    transaction,
    sourcePayloadChecksum: mappingContext.sourcePayloadChecksum,
    economicEventKey,
    marketplaceId: resolvedMarketplaceId,
    orderId,
  };
  const nodes: AmazonCanonicalFinancialMoneyNode[] = [];
  const transactionDecomposed = hasMonetaryDescendant(transaction.breakdowns) ||
    transaction.items.some((item) => !!item.totalAmount || hasMonetaryDescendant(item.breakdowns));
  if (transaction.totalAmount) nodes.push(buildNode({
    context,
    sourceNodeKind: "TRANSACTION_TOTAL",
    sourceType: transaction.transactionType,
    ancestry: [transaction.transactionType],
    path: "/totalAmount",
    ownership: transactionDecomposed ? "INFORMATIONAL" : "ECONOMIC",
    projectionKind: totalProjection(transaction.transactionType),
    money: transaction.totalAmount,
    children: [
      ...transaction.breakdowns.flatMap(descendantComparisonMoney),
      ...transaction.items.flatMap((item) => item.totalAmount ? [sourceMoney(item.totalAmount)] :
        item.breakdowns.flatMap(descendantComparisonMoney)),
    ],
  }));
  nodes.push(...walkBreakdowns({ context, breakdowns: transaction.breakdowns,
    parentPath: "", ancestry: [transaction.transactionType] }));

  const canonicalItems = canonicalItemOrder(transaction.items);
  const itemMetadata: AmazonCanonicalFinancialTransaction["items"][number][] = [];
  for (let itemIndex = 0; itemIndex < canonicalItems.length; itemIndex += 1) {
    const item = canonicalItems[itemIndex].value;
    const key = itemKey(item, itemIndex);
    const parentPath = `/items/${encoded(key)}`;
    itemMetadata.push({ itemKey: key, description: item.description ?? null,
      relatedIdentifiers: item.relatedIdentifiers, contexts: item.contexts });
    const decomposed = hasMonetaryDescendant(item.breakdowns);
    if (item.totalAmount) nodes.push(buildNode({
      context,
      sourceNodeKind: "ITEM_TOTAL",
      sourceType: transaction.transactionType,
      ancestry: [transaction.transactionType, "ITEM_TOTAL"],
      path: `${parentPath}/totalAmount`,
      ownership: decomposed ? "INFORMATIONAL" : "ECONOMIC",
      projectionKind: totalProjection(transaction.transactionType),
      money: item.totalAmount,
      children: item.breakdowns.flatMap(descendantComparisonMoney),
      itemIdentifiers: item.relatedIdentifiers,
    }));
    nodes.push(...walkBreakdowns({ context, breakdowns: item.breakdowns, parentPath,
      ancestry: [transaction.transactionType, "ITEM"], itemIdentifiers: item.relatedIdentifiers }));
  }

  const informationalMonetaryNodes = nodes.filter((node) => node.ownership === "INFORMATIONAL")
    .sort((left, right) => left.sourceComponentKey.localeCompare(right.sourceComponentKey));
  const economicLeaves = nodes.filter((node) => node.ownership === "ECONOMIC")
    .sort((left, right) => left.sourceComponentKey.localeCompare(right.sourceComponentKey));
  const unresolvedEconomicLeaves = economicLeaves.filter(
    (node): node is Extract<AmazonCanonicalFinancialMoneyNode, { representability: "UNREPRESENTABLE" }> =>
      node.representability === "UNREPRESENTABLE",
  );
  return {
    transactionId: transaction.transactionId,
    transactionType: transaction.transactionType,
    transactionStatus: transaction.transactionStatus ?? null,
    finality: finality(transaction.transactionStatus),
    postedDate: new Date(transaction.postedDate),
    economicEventKey,
    marketplace: transaction.marketplace,
    sellingPartner: transaction.sellingPartner,
    marketplaceId: resolvedMarketplaceId,
    relatedIdentifiers: transaction.relatedIdentifiers,
    contexts: transaction.contexts,
    items: itemMetadata,
    informationalMonetaryNodes,
    economicLeaves,
    unresolvedEconomicLeaves,
    mappingVersion: AMAZON_FINANCES_MAPPING_VERSION,
    sourceAuthority: AMAZON_FINANCES_SOURCE_AUTHORITY,
    sourcePayloadChecksum: mappingContext.sourcePayloadChecksum,
  };
}

/** Maps all acquired pages and fails closed on conflicting transaction replays. */
export function mapAmazonFinancialTransactions(
  acquisition: AmazonFinancesAcquisition,
): readonly AmazonCanonicalFinancialTransaction[] {
  const byId = new Map<string, AmazonCanonicalFinancialTransaction>();
  const sourceById = new Map<string, string>();
  for (const page of acquisition.pages) {
    const checksum = sha256(page.body);
    for (const transaction of page.transactions) {
      const sourceSemantic = stableJson(transaction);
      const priorSource = sourceById.get(transaction.transactionId);
      if (priorSource) {
        if (priorSource !== sourceSemantic) throw new AmazonConnectorError("SOURCE_CONFLICT");
        continue;
      }
      const mapped = mapAmazonFinancialTransaction(transaction, { sourcePayloadChecksum: checksum });
      sourceById.set(mapped.transactionId, sourceSemantic);
      byId.set(mapped.transactionId, mapped);
    }
  }
  return [...byId.values()].sort((left, right) => left.transactionId.localeCompare(right.transactionId));
}

export function amazonFinancialSemanticFingerprint(value: unknown): string {
  return sha256(stableJson(value));
}

export type { AmazonLosslessJson };
