import type { Session } from "@shopify/shopify-api";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { NormalizedCommerceDataset } from "~/core/normalized-commerce";
import type { BillingStatus, LoaderData, Row, TrendPoint } from "~/utils/margin";
import { buildCanonicalProfitResult } from "~/core/canonical-profit-result";
import { projectLegacyMarginV1 } from "~/core/legacy-margin-projection";

import {
  fetchShopifyMarginAppData,
  fetchShopifyMarginOrders,
} from "~/connectors/shopify/shopify-margin-source.server";
import { mapShopifyOrdersToNormalizedPeriod } from "~/connectors/shopify/shopify-margin-mapper";
import { toYYYYMMDD } from "~/utils/margin";
import { formatMoney } from "~/utils/formatting";
import { getBillingStatus } from "~/utils/billing.server";
import { getStoreTaxContext } from "~/utils/tax-profile.server";
import { resolveTaxTreatment } from "~/utils/tax-aware-engine";
import { calculateTaxAwareEconomics } from "~/utils/tax-economics-engine";

export async function loadMarginDashboardData({
  admin,
  session,
  period,
  locale = "en-US",
  billingStatus,
  analysisEndDate,
}: {
  admin: AdminApiContext;
  session: Session;
  period: string;
  locale?: string;
  billingStatus?: BillingStatus;
  analysisEndDate?: string;
}): Promise<LoaderData> {
  const days = Number.parseInt(period, 10);
  const safeDays = Number.isFinite(days) && days > 0 ? days : 30;

  const explicitEndDate =
    analysisEndDate && /^\d{4}-\d{2}-\d{2}$/.test(analysisEndDate)
      ? analysisEndDate
      : null;
  const subtractCalendarDays = (dateOnly: string, daysToSubtract: number) => {
    const [year, month, day] = dateOnly.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day - daysToSubtract));
    return date.toISOString().slice(0, 10);
  };

  const fromYYYYMMDD = explicitEndDate
    ? subtractCalendarDays(explicitEndDate, safeDays)
    : (() => {
      const date = new Date();
      date.setDate(date.getDate() - safeDays);
      return toYYYYMMDD(date);
    })();
  const previousFromYYYYMMDD = explicitEndDate
    ? subtractCalendarDays(fromYYYYMMDD, safeDays)
    : (() => {
      const date = new Date(`${fromYYYYMMDD}T00:00:00`);
      date.setDate(date.getDate() - safeDays);
      return toYYYYMMDD(date);
    })();

  const queryString = explicitEndDate
    ? `processed_at:>=${fromYYYYMMDD} processed_at:<${explicitEndDate}`
    : `processed_at:>=${fromYYYYMMDD}`;
  const previousQueryString =
    `processed_at:>=${previousFromYYYYMMDD} processed_at:<${fromYYYYMMDD}`;

  const [shopAppData, billing] = await Promise.all([
    fetchShopifyMarginAppData(admin),
    billingStatus ?? getBillingStatus(admin),
  ]);

  const billingActive = billing.active;
  const currencyCode = shopAppData?.currencyCode || "USD";
  const timeZone = shopAppData?.ianaTimezone || "UTC";
  const shopCountryCode =
    shopAppData?.billingAddress?.countryCodeV2 || "";
  const taxContext = await getStoreTaxContext({
    shop: session.shop,
    shopCountryCode,
  });


  const storeMoney = (value: number) =>
    formatMoney(value, { currencyCode, locale, timeZone });

  const [currentOrderEdges, previousOrderEdges] = await Promise.all([
    fetchShopifyMarginOrders(admin, queryString),
    fetchShopifyMarginOrders(admin, previousQueryString),
  ]);

  const normalizedDataset: NormalizedCommerceDataset = {
    current: mapShopifyOrdersToNormalizedPeriod(currentOrderEdges),
    previous: mapShopifyOrdersToNormalizedPeriod(previousOrderEdges),
  };
  const { current, previous } = normalizedDataset;

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

  const economicRevenue = taxAwareEconomics.netRevenue;
  const economicCogs = taxAwareEconomics.economicCogs;
  const economicProfit = taxAwareEconomics.realProfit;
  const economicMarginPct = taxAwareEconomics.realMarginPct;



  const previousMargins = new Map<string, number>();

  for (const [key, product] of Object.entries(previous.byProduct)) {
    const revenue =
      product.grossSales - product.discounts - product.refunds;
    const cogs = Math.max(0, product.grossCogs - product.refundedCogs);
    const profit = revenue - cogs;

    if (revenue > 0) {
      previousMargins.set(key, (profit / revenue) * 100);
    }
  }

  const rows: Row[] = Object.entries(current.byProduct)
    .map(([key, product]) => {
      const qty = Math.max(0, product.orderedQty - product.refundedQty);
      const revenue =
        product.grossSales - product.discounts - product.refunds;
      const netProductSales = product.grossSales - product.discounts;
      const cogs = Math.max(0, product.grossCogs - product.refundedCogs);
      const profit = revenue - cogs;
      const marginPct = revenue > 0 ? (profit / revenue) * 100 : 0;

      const productTaxAwarePeriod = {
        totalShopifyTax: Math.max(
          0,
          product.productTaxAmount - product.refundedTaxAmount,
        ),

        productTaxAmount: product.productTaxAmount,
        shippingTaxAmount: 0,
        refundedTaxAmount: product.refundedTaxAmount,

        includedProductTaxAmount:
          product.includedProductTaxAmount,
        excludedProductTaxAmount:
          product.excludedProductTaxAmount,
        includedShippingTaxAmount: 0,
        excludedShippingTaxAmount: 0,
        includedRefundedTaxAmount:
          product.includedRefundedTaxAmount,
        excludedRefundedTaxAmount:
          product.excludedRefundedTaxAmount,

        netCollectedTax: Math.max(
          0,
          product.productTaxAmount -
            product.refundedTaxAmount,
        ),

        taxableLineCount: product.taxableLineCount,
        nonTaxableLineCount: product.nonTaxableLineCount,
        taxedLineCount: product.taxedLineCount,

        taxExemptOrderCount: product.taxExemptLineCount,
        taxesIncludedOrderCount:
          product.taxesIncludedLineCount,
        taxesExcludedOrderCount:
          product.taxesExcludedLineCount,

        hasActualShopifyTax:
          product.productTaxAmount > 0 ||
          product.taxedLineCount > 0,

        hasTaxableProducts:
          product.taxableLineCount > 0,

        hasTaxExemptOrders:
          product.taxExemptLineCount > 0,

        taxDataCoverage:
          product.taxableLineCount +
            product.nonTaxableLineCount >
          0
            ? "complete"
            : "partial",
      } as const;

      const productTaxTreatment = resolveTaxTreatment({
        taxAwarePeriod: productTaxAwarePeriod,
        taxContext,
      });

      const productTaxAwareEconomics =
        calculateTaxAwareEconomics({
          revenue,
          cogs,
          taxContext,
          taxTreatment: productTaxTreatment,
        });

      const economicRevenue =
        productTaxAwareEconomics.netRevenue;
      const economicCogs =
        productTaxAwareEconomics.economicCogs;
      const economicProfit =
        productTaxAwareEconomics.realProfit;
      const economicMarginPct =
        productTaxAwareEconomics.realMarginPct;

      const previousMarginPct = previousMargins.get(key) ?? null;
      const productMarginDelta =
        previousMarginPct === null ? null : marginPct - previousMarginPct;

      const avgPrice = qty > 0 ? revenue / qty : 0;
      const avgCost = qty > 0 ? cogs / qty : 0;
      const breakEvenPrice = avgCost;
      const targetMargin = 0.2;
      const targetPrice =
        avgCost > 0 ? avgCost / (1 - targetMargin) : avgPrice;
      const targetDelta = targetPrice - avgPrice;
      const aggressiveIncrease =
        avgPrice > 0 && targetDelta / avgPrice > 0.3;

      const suggestion =
        profit < 0
          ? aggressiveIncrease
            ? "Current margins are critically below target. Review product costs, pricing structure and discounts."
            : `Increase price to ${storeMoney(targetPrice)} (${targetDelta >= 0 ? "+" : ""}${storeMoney(targetDelta)} per unit) to reach a healthier margin.`
          : targetDelta > 0
            ? aggressiveIncrease
              ? "Margin improvement opportunity detected. Review pricing and operational costs."
              : `Consider increasing price to ${storeMoney(targetPrice)} to improve product margins.`
            : "Current pricing and margins appear stable based on available cost data.";

      return {
        productId: product.productId,
        productTitle: product.productTitle,
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
        suggestion,
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
        discountRatePct:
          product.grossSales > 0
            ? (product.discounts / product.grossSales) * 100
            : 0,
        refundRatePct:
          netProductSales > 0
            ? (product.refunds / netProductSales) * 100
            : 0,

        // Parallel product-level economic basis.
        // Legacy revenue/cogs/profit/marginPct remain unchanged.
        economicRevenue,
        economicCogs,
        economicProfit,
        economicMarginPct,

        salesTaxes: Math.max(
          0,
          product.productTaxAmount -
            product.refundedTaxAmount,
        ),
      };
    })
    .sort((a, b) => a.profit - b.profit);

  const marginDeterioration = rows
    .filter(
      (row): row is Row & { productMarginDelta: number } =>
        row.productMarginDelta !== null,
    )
    .filter((row) => row.productMarginDelta < -3)
    .sort((a, b) => a.productMarginDelta - b.productMarginDelta)
    .slice(0, 5);

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
    rows.reduce((sum, row) => sum + (row.profit < 0 ? row.profit : 0), 0),
  );
  const losingCount = rows.filter((row) => row.losing).length;
  const missingCostCount = rows.filter((row) => row.missingCost).length;

  const orderedQuantity = rows.reduce(
    (sum, row) => sum + (row.orderedQuantity ?? row.qty),
    0,
  );
  const refundedQuantity = rows.reduce(
    (sum, row) => sum + (row.refundedQuantity ?? 0),
    0,
  );
  const netQuantity = rows.reduce((sum, row) => sum + row.qty, 0);

  const losingProductRevenue = rows.reduce(
    (sum, row) => sum + (row.losing ? row.revenue : 0),
    0,
  );
  const lowMarginProductRevenue = rows.reduce(
    (sum, row) => sum + (row.lowMargin ? row.revenue : 0),
    0,
  );
  const missingCostRevenue = rows.reduce(
    (sum, row) => sum + (row.missingCost ? row.revenue : 0),
    0,
  );
  const revenueCoveragePct =
    totalRevenue > 0
      ? (Math.max(0, totalRevenue - missingCostRevenue) / totalRevenue) * 100
      : 100;

  for (const row of rows) {
    row.revenueSharePct =
      totalRevenue > 0 ? (row.revenue / totalRevenue) * 100 : 0;
    row.profitSharePct =
      totalProfit !== 0 ? (row.profit / totalProfit) * 100 : 0;
  }

  const trend: TrendPoint[] = Object.entries(current.byDay)
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
      grossProfit:
        values.netProductRevenue - Math.max(0, values.productCogs),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const canonicalResult = buildCanonicalProfitResult({
    dataset: normalizedDataset,
    currencyCode,
    requestedDays: safeDays,
    currentPeriodStart: fromYYYYMMDD,
    currentPeriodEndExclusive: explicitEndDate,
    previousPeriodStart: previousFromYYYYMMDD,
    grossProfit: totalProfit,
    grossMarginPct: marginPct,
    legacyShippingContribution: contributionProfit,
    legacyShippingContributionMarginPct: contributionMarginPct,
    revenueCoveragePct,
    tax: {
      source: taxTreatment.source,
      reportedTax: current.taxes,
      netCollectedTax: taxAwarePeriod.netCollectedTax,
      economicRevenue,
      economicCogs,
      economicProfit,
      economicMarginPct,
    },
  });

  const loaderData: LoaderData = {
    summary: {
      // Compatibility aliases used by the current UI:
      // revenue = net product revenue after discounts and product refunds
      // profit = gross product profit after net product COGS
      // marginPct = gross product margin
      revenue: totalRevenue,
      cogs: totalCogs,
      profit: totalProfit,
      marginPct,
      discounts: current.discounts,
      shipping: current.shippingRevenue,
      taxes: current.taxes,
      refunds: current.productRefunds,
      netRevenue: totalRevenue,
      contributionProfit,
      contributionMarginPct,
      totalLeak,
      losingCount,
      missingCostCount,
      previousMarginPct,
      marginDelta,
      previousRevenue,
      revenueDeltaPct,
      grossProductSales: current.grossProductSales,
      refundedProductRevenue: current.productRefunds,
      netProductRevenue: totalRevenue,
      shippingRevenue: current.shippingRevenue,
      productCogs: totalCogs,
      grossProfit: totalProfit,
      grossMarginPct: marginPct,
      orderedQuantity,
      refundedQuantity,
      netQuantity,
      discountRatePct:
        current.grossProductSales > 0
          ? (current.discounts / current.grossProductSales) * 100
          : 0,
      refundRatePct:
        current.grossProductSales - current.discounts > 0
          ?
          (current.productRefunds /
            (current.grossProductSales - current.discounts)) *
          100
          : 0,
      losingProductRevenue,
      lowMarginProductRevenue,
      missingCostRevenue,
      revenueCoveragePct,
      economicRevenue,
      economicCogs,
      economicProfit,
      economicMarginPct,
    },
    rows,
    marginDeterioration,
    trend,
    billingActive,
    period: String(safeDays),
    shopHandle: session.shop.replace(".myshopify.com", ""),
    currencyCode,
    timeZone,
    analysisContext: {
      requestedDays: safeDays,
      current: {
        orderCount: current.orderCount,
        productCount: rows.length,
        orderedQuantity,
        netQuantity,
        activeDays: current.activeDays,
        firstOrderAt: current.firstOrderAt,
        lastOrderAt: current.lastOrderAt,
        hasSales: current.orderCount > 0,
      },
      previous: {
        orderCount: previous.orderCount,
        productCount: Object.keys(previous.byProduct).length,
        orderedQuantity: Object.values(previous.byProduct).reduce(
          (sum, product) => sum + product.orderedQty,
          0,
        ),
        netQuantity: Object.values(previous.byProduct).reduce(
          (sum, product) =>
            sum + Math.max(0, product.orderedQty - product.refundedQty),
          0,
        ),
        activeDays: previous.activeDays,
        firstOrderAt: previous.firstOrderAt,
        lastOrderAt: previous.lastOrderAt,
        hasSales: previous.orderCount > 0,
      },
      comparisonAvailable:
        current.orderCount > 0 && previous.orderCount > 0,
      dataCompleteness: {
        currentPeriodComplete: current.truncatedConnections.length === 0,
        previousPeriodComplete: previous.truncatedConnections.length === 0,
        truncatedConnections: [
          ...current.truncatedConnections.map(
            (connection) => `current:${connection}`,
          ),
          ...previous.truncatedConnections.map(
            (connection) => `previous:${connection}`,
          ),
        ],
      },
    },
  };

  return projectLegacyMarginV1(canonicalResult, {
    ...loaderData,
    taxContext,
    taxAwarePeriod,
    taxTreatment,
    taxAwareEconomics,
  });
}
