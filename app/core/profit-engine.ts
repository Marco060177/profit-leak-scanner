import type {
  NormalizedCommerceDataset,
  NormalizedProductAggregate,
} from "~/core/normalized-commerce";
import { buildCanonicalProfitResult } from "~/core/canonical-profit-result";
import { resolveTaxTreatment } from "~/utils/tax-aware-engine";
import { calculateTaxAwareEconomics } from "~/utils/tax-economics-engine";

export type ProfitEngineProductMetrics = {
  profit: number;
  losing: boolean;
  missingCost: boolean;
  qty: number;
  orderedQuantity?: number;
  refundedQuantity?: number;
  revenue: number;
  lowMargin: boolean;
};

export function calculateProductEconomics({
  product,
  previousProduct,
  taxContext,
}: {
  product: NormalizedProductAggregate;
  previousProduct?: NormalizedProductAggregate;
  taxContext: Parameters<typeof calculateTaxAwareEconomics>[0]["taxContext"];
}) {
  const qty = Math.max(0, product.orderedQty - product.refundedQty);
  const revenue = product.grossSales - product.discounts - product.refunds;
  const netProductSales = product.grossSales - product.discounts;
  const cogs = Math.max(0, product.grossCogs - product.refundedCogs);
  const profit = revenue - cogs;
  const marginPct = revenue > 0 ? (profit / revenue) * 100 : 0;

  const productTaxAwarePeriod = {
    totalShopifyTax: Math.max(0, product.productTaxAmount - product.refundedTaxAmount),
    productTaxAmount: product.productTaxAmount,
    shippingTaxAmount: 0,
    refundedTaxAmount: product.refundedTaxAmount,
    includedProductTaxAmount: product.includedProductTaxAmount,
    excludedProductTaxAmount: product.excludedProductTaxAmount,
    includedShippingTaxAmount: 0,
    excludedShippingTaxAmount: 0,
    includedRefundedTaxAmount: product.includedRefundedTaxAmount,
    excludedRefundedTaxAmount: product.excludedRefundedTaxAmount,
    netCollectedTax: Math.max(0, product.productTaxAmount - product.refundedTaxAmount),
    taxableLineCount: product.taxableLineCount,
    nonTaxableLineCount: product.nonTaxableLineCount,
    taxedLineCount: product.taxedLineCount,
    taxExemptOrderCount: product.taxExemptLineCount,
    taxesIncludedOrderCount: product.taxesIncludedLineCount,
    taxesExcludedOrderCount: product.taxesExcludedLineCount,
    hasActualShopifyTax: product.productTaxAmount > 0 || product.taxedLineCount > 0,
    hasTaxableProducts: product.taxableLineCount > 0,
    hasTaxExemptOrders: product.taxExemptLineCount > 0,
    taxDataCoverage:
      product.taxableLineCount + product.nonTaxableLineCount > 0
        ? "complete"
        : "partial",
  } as const;
  const productTaxTreatment = resolveTaxTreatment({
    taxAwarePeriod: productTaxAwarePeriod,
    taxContext,
  });
  const productTaxAwareEconomics = calculateTaxAwareEconomics({
    revenue,
    cogs,
    taxContext,
    taxTreatment: productTaxTreatment,
  });

  let previousMarginPct: number | null = null;
  if (previousProduct) {
    const previousRevenue = previousProduct.grossSales - previousProduct.discounts - previousProduct.refunds;
    const previousCogs = Math.max(0, previousProduct.grossCogs - previousProduct.refundedCogs);
    const previousProfit = previousRevenue - previousCogs;
    if (previousRevenue > 0) previousMarginPct = (previousProfit / previousRevenue) * 100;
  }
  const productMarginDelta = previousMarginPct === null ? null : marginPct - previousMarginPct;
  const avgPrice = qty > 0 ? revenue / qty : 0;
  const avgCost = qty > 0 ? cogs / qty : 0;
  const breakEvenPrice = avgCost;
  const targetMargin = 0.2;
  const targetPrice = avgCost > 0 ? avgCost / (1 - targetMargin) : avgPrice;
  const targetDelta = targetPrice - avgPrice;

  return {
    qty,
    revenue,
    cogs,
    discounts: product.discounts,
    refunds: product.refunds,
    profit,
    marginPct,
    previousMarginPct,
    productMarginDelta,
    losing: profit < 0,
    lowMargin: marginPct > 0 && marginPct < 10,
    avgPrice,
    avgCost,
    breakEvenPrice,
    targetPrice,
    targetDelta,
    missingCost: product.missingCost,
    orderedQuantity: product.orderedQty,
    refundedQuantity: product.refundedQty,
    netQuantity: qty,
    grossProductSales: product.grossSales,
    netProductSales,
    refundedProductRevenue: product.refunds,
    netProductRevenue: revenue,
    productCogs: cogs,
    grossProfit: profit,
    grossMarginPct: marginPct,
    discountRatePct: product.grossSales > 0 ? (product.discounts / product.grossSales) * 100 : 0,
    refundRatePct: netProductSales > 0 ? (product.refunds / netProductSales) * 100 : 0,
    economicRevenue: productTaxAwareEconomics.netRevenue,
    economicCogs: productTaxAwareEconomics.economicCogs,
    economicProfit: productTaxAwareEconomics.realProfit,
    economicMarginPct: productTaxAwareEconomics.realMarginPct,
    salesTaxes: Math.max(0, product.productTaxAmount - product.refundedTaxAmount),
  };
}

export function calculateProfitEngine({
  dataset,
  productRows,
  taxContext,
  currencyCode,
  requestedDays,
  currentPeriodStart,
  currentPeriodEndExclusive,
  previousPeriodStart,
}: {
  dataset: NormalizedCommerceDataset;
  productRows: ProfitEngineProductMetrics[];
  taxContext: Parameters<typeof calculateTaxAwareEconomics>[0]["taxContext"];
  currencyCode: string;
  requestedDays: number;
  currentPeriodStart: string;
  currentPeriodEndExclusive: string | null;
  previousPeriodStart: string;
}) {
  const { current, previous } = dataset;
  const taxAwarePeriod = {
    totalShopifyTax: current.taxes,

    productTaxAmount: current.productTaxAmount,
    shippingTaxAmount: current.shippingTaxAmount,
    refundedTaxAmount: current.refundedTaxAmount,

    includedProductTaxAmount: current.includedProductTaxAmount,
    excludedProductTaxAmount: current.excludedProductTaxAmount,
    includedShippingTaxAmount: current.includedShippingTaxAmount,
    excludedShippingTaxAmount: current.excludedShippingTaxAmount,
    includedRefundedTaxAmount: current.includedRefundedTaxAmount,
    excludedRefundedTaxAmount: current.excludedRefundedTaxAmount,

    netCollectedTax: Math.max(
      0,
      current.productTaxAmount +
      current.shippingTaxAmount -
      current.refundedTaxAmount,
    ),

    taxableLineCount: current.taxableLineCount,
    nonTaxableLineCount: current.nonTaxableLineCount,
    taxedLineCount: current.taxedLineCount,

    taxExemptOrderCount: current.taxExemptOrderCount,
    taxesIncludedOrderCount: current.taxesIncludedOrderCount,
    taxesExcludedOrderCount: current.taxesExcludedOrderCount,

    hasActualShopifyTax:
      current.taxes > 0 ||
      current.productTaxAmount > 0 ||
      current.shippingTaxAmount > 0,

    hasTaxableProducts: current.taxableLineCount > 0,

    hasTaxExemptOrders: current.taxExemptOrderCount > 0,

    taxDataCoverage:
      current.orderCount === 0
        ? "none"
        : current.taxableLineCount +
          current.nonTaxableLineCount >
          0
          ? "complete"
          : "partial",
  } as const;

  const taxTreatment = resolveTaxTreatment({
    taxAwarePeriod,
    taxContext,
  });

  const taxAwareEconomics = calculateTaxAwareEconomics({
    revenue: current.netProductRevenue,
    cogs: current.productCogs,
    taxContext,
    taxTreatment,
  });
  const totalRevenue = current.netProductRevenue;
  const totalCogs = current.productCogs;
  const totalProfit = totalRevenue - totalCogs;
  const marginPct = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const previousRevenue = previous.netProductRevenue;
  const previousProfit = previousRevenue - previous.productCogs;
  const previousMarginPct =
    previousRevenue > 0 ? (previousProfit / previousRevenue) * 100 : 0;

  const marginDelta = marginPct - previousMarginPct;
  const revenueDeltaPct =
    previousRevenue > 0
      ? ((totalRevenue - previousRevenue) / previousRevenue) * 100
      : 0;

  // Until actual carrier costs are supplied by the Growth model, this is a
  // gross contribution view: customer-paid shipping is revenue, not expense.
  const contributionProfit = totalProfit + current.shippingRevenue;
  const contributionRevenue = totalRevenue + current.shippingRevenue;
  const contributionMarginPct =
    contributionRevenue > 0
      ? (contributionProfit / contributionRevenue) * 100
      : 0;

  const totalLeak = Math.abs(
    productRows.reduce((sum, row) => sum + (row.profit < 0 ? row.profit : 0), 0),
  );
  const losingCount = productRows.filter((row) => row.losing).length;
  const missingCostCount = productRows.filter((row) => row.missingCost).length;

  const orderedQuantity = productRows.reduce(
    (sum, row) => sum + (row.orderedQuantity ?? row.qty),
    0,
  );
  const refundedQuantity = productRows.reduce(
    (sum, row) => sum + (row.refundedQuantity ?? 0),
    0,
  );
  const netQuantity = productRows.reduce((sum, row) => sum + row.qty, 0);

  const losingProductRevenue = productRows.reduce(
    (sum, row) => sum + (row.losing ? row.revenue : 0),
    0,
  );
  const lowMarginProductRevenue = productRows.reduce(
    (sum, row) => sum + (row.lowMargin ? row.revenue : 0),
    0,
  );
  const missingCostRevenue = productRows.reduce(
    (sum, row) => sum + (row.missingCost ? row.revenue : 0),
    0,
  );
  const revenueCoveragePct =
    totalRevenue > 0
      ? (Math.max(0, totalRevenue - missingCostRevenue) / totalRevenue) * 100
      : 100;

  const discountRatePct =
    current.grossProductSales > 0
      ? (current.discounts / current.grossProductSales) * 100
      : 0;
  const refundRatePct =
    current.grossProductSales - current.discounts > 0
      ? (current.productRefunds / (current.grossProductSales - current.discounts)) * 100
      : 0;
  const trend = Object.entries(current.byDay)
    .map(([date, values]) => ({
      date,
      revenue: values.netProductRevenue,
      profit: values.netProductRevenue - values.productCogs,
      grossProductSales: values.grossProductSales,
      discounts: values.discounts,
      refundedProductRevenue: values.refundedProductRevenue,
      netProductRevenue: values.netProductRevenue,
      shippingRevenue: values.shippingRevenue,
      productCogs: Math.max(0, values.productCogs),
      grossProfit: values.netProductRevenue - Math.max(0, values.productCogs),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const canonicalResult = buildCanonicalProfitResult({
    dataset,
    currencyCode,
    requestedDays,
    currentPeriodStart,
    currentPeriodEndExclusive,
    previousPeriodStart,
    grossProfit: totalProfit,
    grossMarginPct: marginPct,
    legacyShippingContribution: contributionProfit,
    legacyShippingContributionMarginPct: contributionMarginPct,
    revenueCoveragePct,
    tax: {
      source: taxTreatment.source,
      reportedTax: current.taxes,
      netCollectedTax: taxAwarePeriod.netCollectedTax,
      economicRevenue: taxAwareEconomics.netRevenue,
      economicCogs: taxAwareEconomics.economicCogs,
      economicProfit: taxAwareEconomics.realProfit,
      economicMarginPct: taxAwareEconomics.realMarginPct,
    },
  });
  return {
    ...canonicalResult,
    taxAwarePeriod,
    taxTreatment,
    taxAwareEconomics,
    trend,
    legacyMetrics: {
      totalRevenue,
      totalCogs,
      totalProfit,
      marginPct,
      previousRevenue,
      previousMarginPct,
      marginDelta,
      revenueDeltaPct,
      contributionProfit,
      contributionMarginPct,
      totalLeak,
      losingCount,
      missingCostCount,
      orderedQuantity,
      refundedQuantity,
      netQuantity,
      losingProductRevenue,
      lowMarginProductRevenue,
      missingCostRevenue,
      revenueCoveragePct,
      discountRatePct,
      refundRatePct,
      economicRevenue: taxAwareEconomics.netRevenue,
      economicCogs: taxAwareEconomics.economicCogs,
      economicProfit: taxAwareEconomics.realProfit,
      economicMarginPct: taxAwareEconomics.realMarginPct,
    },
  };
}
