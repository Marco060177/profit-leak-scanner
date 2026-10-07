import type { FinancialLedgerEntry, Prisma } from "@prisma/client";
import { projectCanonicalOrderProfit } from "~/connectors/amazon/amazon-cogs-profit.server";
import { getCanonicalEconomicDatasetTx } from "~/core/canonical-economic-dataset.server";
import type { CanonicalEconomicDatasetReady } from "~/core/data-core-d2d-contracts";
import type { FeatureData, FeatureEconomicPeriod, FeatureMoney, FeatureOptionalMoney,
  FeaturePeriodData, FeatureProductEconomics, FeatureSummaryEconomics } from "./feature-data-contract";
import { addFeatureMoney, assertFeatureMoney } from "./feature-money";

export const AMAZON_FEATURE_ADAPTER_VERSION = "amazon-canonical-d2d-v1";
type CanonicalReader = typeof getCanonicalEconomicDatasetTx;
const unavailable = (...reasonCodes: string[]): FeatureOptionalMoney => ({ status: "UNAVAILABLE", reasonCodes });
const available = (value: FeatureMoney): FeatureOptionalMoney => ({ status: "AVAILABLE", value: assertFeatureMoney(value) });
const money = (value: { amountAtoms: bigint; amountScale: number; currencyCode: string }): FeatureMoney =>
  assertFeatureMoney({ amountAtoms: value.amountAtoms, amountScale: value.amountScale, currencyCode: value.currencyCode });
const zero = (currencyCode: string): FeatureMoney => ({ amountAtoms: 0n, amountScale: 0, currencyCode });
const addAll = (values: readonly FeatureMoney[], currencyCode: string) =>
  values.reduce(addFeatureMoney, zero(currencyCode));

function validatePeriods(current: FeatureEconomicPeriod, previous: FeatureEconomicPeriod | null) {
  for (const period of [current, previous].filter((value): value is FeatureEconomicPeriod => value !== null))
    if (!Number.isFinite(period.startInclusive.getTime()) || !Number.isFinite(period.endExclusive.getTime()) ||
        period.startInclusive >= period.endExclusive) throw new RangeError("INVALID_FEATURE_PERIOD");
  if (previous && previous.endExclusive > current.startInclusive)
    throw new RangeError("FEATURE_PERIODS_OVERLAP");
}

function blocked(identity: { accountId: string; channelConnectionId: string; source: {
  channel: string; sourceSystem: string; adapterVersion: string } }, reasonCodes: readonly string[],
diagnosticContext?: Readonly<Record<string, string | number | boolean | null>>): FeatureData {
  return { ...identity, status: "BLOCKED", reasonCodes, ...(diagnosticContext ? { diagnosticContext } : {}) };
}

function canonicalReferences(dataset: CanonicalEconomicDatasetReady) {
  return [
    ...dataset.commerce.orders.map((row) => ({ kind: "NORMALIZED_ORDER", id: row.id })),
    ...dataset.commerce.items.map((row) => ({ kind: "NORMALIZED_ORDER_ITEM", id: row.id })),
    ...dataset.financialComponents.map((row) => ({ kind: "FINANCIAL_LEDGER_ENTRY", id: row.id })),
    ...dataset.cogs.map((row) => ({ kind: "INVENTORY_ECONOMIC_LOT", id: row.lotId })),
    ...dataset.inventoryEvents.map((row) => ({ kind: "INVENTORY_ECONOMIC_EVENT", id: row.id })),
    ...dataset.taxEvidence.map((row) => ({ kind: "NORMALIZED_TAX_EVIDENCE", id: row.id })),
  ];
}

function itemComponents(dataset: CanonicalEconomicDatasetReady, itemId: string, projectionKind: string) {
  return dataset.financialComponents.filter((entry) => entry.itemId === itemId && entry.projectionKind === projectionKind);
}

function sumEntries(entries: readonly FinancialLedgerEntry[], currencyCode: string) {
  return addAll(entries.map((entry) => money(entry)), currencyCode);
}

function cogsForItem(dataset: CanonicalEconomicDatasetReady, itemId: string, currencyCode: string) {
  return addAll(dataset.cogs.filter((row) => row.itemId === itemId).map((row) => {
    const amountScale = row.unitCostScale + row.quantityScale;
    return assertFeatureMoney({ amountAtoms: row.unitCostAtoms * row.quantityAtoms, amountScale,
      currencyCode: row.currencyCode });
  }), currencyCode);
}

async function productsForDataset(tx: Prisma.TransactionClient, accountId: string,
dataset: CanonicalEconomicDatasetReady, currencyCode: string): Promise<FeatureProductEconomics[]> {
  const economicItemIds = new Set([
    ...dataset.financialComponents.flatMap((entry) => entry.itemId ? [entry.itemId] : []),
    ...dataset.cogs.flatMap((row) => row.itemId ? [row.itemId] : []),
  ]);
  const items = dataset.commerce.items.filter((item) => economicItemIds.has(item.id));
  const skuIds = [...new Set(items.flatMap((item) => item.skuId ? [item.skuId] : []))];
  const skus = await tx.sku.findMany({ where: { accountId, id: { in: skuIds } }, include: { product: true } });
  const skuById = new Map(skus.map((sku) => [sku.id, sku]));
  return items.map((item) => {
    const sku = item.skuId ? skuById.get(item.skuId) : null;
    const revenueEntries = itemComponents(dataset, item.id, "PRODUCT_REVENUE");
    const itemCogs = cogsForItem(dataset, item.id, currencyCode);
    return { productId: sku?.productId ?? null, skuId: item.skuId, title: sku?.product?.title ?? null,
      quantity: { quantityAtoms: item.quantityAtoms, quantityScale: item.quantityScale },
      revenue: revenueEntries.length ? available(sumEntries(revenueEntries, currencyCode)) :
        unavailable("AMAZON_PRODUCT_REVENUE_NOT_CANONICALLY_ALLOCATED"), cogs: available(itemCogs),
      profit: unavailable("AMAZON_PRODUCT_PROFIT_UNAVAILABLE_WITHOUT_ORDER_LEVEL_ALLOCATION"),
      discounts: unavailable("AMAZON_PRODUCT_DISCOUNTS_NOT_CANONICALLY_ALLOCATED"),
      refunds: unavailable("AMAZON_PRODUCT_REFUNDS_NOT_CANONICALLY_ALLOCATED"),
      fees: unavailable("AMAZON_ORDER_LEVEL_FEES_NOT_ALLOCATED_TO_PRODUCT"),
      tax: unavailable("AMAZON_PRODUCT_TAX_NOT_CANONICALLY_ALLOCATED") };
  });
}

async function projectPeriod(tx: Prisma.TransactionClient, tenant: { accountId: string; channelConnectionId: string },
period: FeatureEconomicPeriod, currencyPolicyVersionId: string, dataset: CanonicalEconomicDatasetReady,
readCanonical: CanonicalReader, fallbackCurrency: string | null): Promise<FeaturePeriodData | { blocked: readonly string[] }> {
  const currencyCode = dataset.currency.currencyCode ?? fallbackCurrency;
  if (!currencyCode) return { blocked: ["NO_MONETARY_OBSERVATIONS"] };
  const orderless = dataset.financialComponents.filter((entry) => entry.orderId === null && entry.economicRole === "ECONOMIC");
  if (orderless.length) return { blocked: ["AMAZON_ORDERLESS_ECONOMICS_NOT_SUPPORTED_BY_ORDER_PROJECTION"] };
  const projections = [];
  const economicOrderIds = new Set([
    ...dataset.financialComponents.flatMap((entry) => entry.orderId ? [entry.orderId] : []),
    ...dataset.cogs.flatMap((row) => row.orderId ? [row.orderId] : []),
  ]);
  for (const order of dataset.commerce.orders.filter((row) => economicOrderIds.has(row.id))) {
    const orderDataset = await readCanonical(tx, { tenant, scope: { kind: "ORDER", orderId: order.id },
      economicWindow: period, currencyPolicyVersionId });
    const projection = projectCanonicalOrderProfit(orderDataset);
    if (projection.status === "BLOCKED") return { blocked: projection.reasonCodes };
    projections.push(projection);
  }
  const summary: FeatureSummaryEconomics = {
    revenue: available(addAll(projections.map((row) => money(row.revenue)), currencyCode)),
    fees: available(addAll(projections.map((row) => money(row.amazonFees)), currencyCode)),
    cogs: available(addAll(projections.map((row) => money(row.cogs)), currencyCode)),
    tax: available(addAll(projections.map((row) => money(row.tax)), currencyCode)),
    profit: available(addAll(projections.map((row) => money(row.profit)), currencyCode)),
    otherContribution: available(addAll(projections.map((row) => money(row.otherContribution)), currencyCode)),
    discounts: unavailable("AMAZON_DISCOUNTS_NOT_SEPARATED_FROM_OTHER_CONTRIBUTION"),
    refunds: unavailable("AMAZON_REFUND_FEATURE_SEMANTICS_NOT_AVAILABLE"),
    shippingRevenue: unavailable("AMAZON_SHIPPING_REVENUE_NOT_SEPARATED_FROM_OTHER_CONTRIBUTION"),
  };
  return { period, summary, products: await productsForDataset(tx, tenant.accountId, dataset, currencyCode), trend: [] };
}

export async function loadAmazonFeatureDataTx(tx: Prisma.TransactionClient, input: {
  accountId: string; channelConnectionId: string; currentPeriod: FeatureEconomicPeriod;
  previousPeriod: FeatureEconomicPeriod | null; readCanonical?: CanonicalReader;
}): Promise<FeatureData> {
  const identity = { accountId: input.accountId, channelConnectionId: input.channelConnectionId,
    source: { channel: "AMAZON", sourceSystem: "DATA_CORE_D2D", adapterVersion: AMAZON_FEATURE_ADAPTER_VERSION } } as const;
  try { validatePeriods(input.currentPeriod, input.previousPeriod); } catch (error) {
    return blocked(identity, [error instanceof Error ? error.message : "INVALID_FEATURE_PERIOD"]);
  }
  const policy = await tx.currencyPolicyVersion.findFirst({ where: { activatedAt: { not: null }, deactivatedAt: null },
    orderBy: [{ activatedAt: "desc" }, { id: "desc" }] });
  if (!policy) return blocked(identity, ["INVALID_CURRENCY_POLICY"]);
  const tenant = { accountId: input.accountId, channelConnectionId: input.channelConnectionId };
  const readCanonical = input.readCanonical ?? getCanonicalEconomicDatasetTx;
  const currentDataset = await readCanonical(tx, { tenant, scope: { kind: "CHANNEL" },
    economicWindow: input.currentPeriod, currencyPolicyVersionId: policy.id });
  if (currentDataset.status === "BLOCKED") return blocked(identity, currentDataset.reasonCodes,
    { fingerprint: currentDataset.fingerprint, completeness: currentDataset.completeness });
  const current = await projectPeriod(tx, tenant, input.currentPeriod, policy.id, currentDataset, readCanonical,
    currentDataset.currency.currencyCode);
  if ("blocked" in current) return blocked(identity, current.blocked, { fingerprint: currentDataset.fingerprint });
  let previous: FeaturePeriodData | null = null;
  let previousDataset: CanonicalEconomicDatasetReady | null = null;
  if (input.previousPeriod) {
    const result = await readCanonical(tx, { tenant, scope: { kind: "CHANNEL" },
      economicWindow: input.previousPeriod, currencyPolicyVersionId: policy.id });
    if (result.status === "BLOCKED") return blocked(identity, result.reasonCodes,
      { fingerprint: result.fingerprint, completeness: result.completeness, period: "previous" });
    previousDataset = result;
    const projected = await projectPeriod(tx, tenant, input.previousPeriod, policy.id, result, readCanonical,
      currentDataset.currency.currencyCode);
    if ("blocked" in projected) return blocked(identity, projected.blocked,
      { fingerprint: result.fingerprint, period: "previous" });
    previous = projected;
  }
  const completenessStates = [currentDataset.completeness, previousDataset?.completeness].filter(Boolean);
  return { ...identity, status: "READY", currencyCode: currentDataset.currency.currencyCode!, current, previous,
    completeness: { status: completenessStates.includes("PROVISIONAL") ? "PROVISIONAL" :
      completenessStates.every((value) => value === "NO_OBSERVATIONS") ? "NO_OBSERVATIONS" : "COMPLETE",
      reasonCodes: [] }, capabilities: {
      productEconomics: { status: "AVAILABLE" },
      trend: { status: "UNAVAILABLE", reasonCodes: ["AMAZON_CANONICAL_TREND_TIMESTAMP_RULE_UNDEFINED"] },
      periodComparison: previous ? { status: "AVAILABLE" } :
        { status: "UNAVAILABLE", reasonCodes: ["PREVIOUS_PERIOD_NOT_PROVIDED"] },
      fees: { status: "AVAILABLE" }, tax: { status: "AVAILABLE" },
      refunds: { status: "UNAVAILABLE", reasonCodes: ["AMAZON_REFUND_FEATURE_SEMANTICS_NOT_AVAILABLE"] },
      assumptions: { status: "NOT_APPLICABLE", reasonCodes: ["ASSUMPTIONS_OUTSIDE_FEATURE_DATA_ADAPTER"] },
      orderLevelAllocation: { status: "UNAVAILABLE",
        reasonCodes: ["AMAZON_ORDER_LEVEL_ECONOMICS_NOT_ALLOCATED_TO_PRODUCT"] },
    }, provenance: { fingerprints: [currentDataset.fingerprint,
      ...(previousDataset ? [previousDataset.fingerprint] : [])], references: [
      ...canonicalReferences(currentDataset), ...(previousDataset ? canonicalReferences(previousDataset) : [])] } };
}
