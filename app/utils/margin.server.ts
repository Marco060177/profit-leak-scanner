import type { Session } from "@shopify/shopify-api";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { NormalizedCommerceDataset } from "~/core/normalized-commerce";
import type { BillingStatus, LoaderData, Row } from "~/utils/margin";
import { projectLegacyMarginV1 } from "~/core/legacy-margin-projection";
import { calculateProductEconomics, calculateProfitEngine } from "~/core/profit-engine";

import {
  fetchShopifyMarginAppData,
  fetchShopifyMarginOrders,
} from "~/connectors/shopify/shopify-margin-source.server";
import { mapShopifyOrdersToNormalizedPeriod } from "~/connectors/shopify/shopify-margin-mapper";
import { toYYYYMMDD } from "~/utils/margin";
import { formatMoney } from "~/utils/formatting";
import { getBillingStatus } from "~/utils/billing.server";
import { getStoreTaxContext } from "~/utils/tax-profile.server";

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

  const rows: Row[] = Object.entries(current.byProduct)
    .map(([key, product]) => {
      const economics = calculateProductEconomics({
        product,
        previousProduct: previous.byProduct[key],
        taxContext,
      });
      const { profit, avgPrice, targetPrice, targetDelta } = economics;
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
        ...economics,
        suggestion,
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

  const canonicalResult = calculateProfitEngine({
    dataset: normalizedDataset,
    productRows: rows,
    taxContext,
    currencyCode,
    requestedDays: safeDays,
    currentPeriodStart: fromYYYYMMDD,
    currentPeriodEndExclusive: explicitEndDate,
    previousPeriodStart: previousFromYYYYMMDD,
  });
  const { taxAwarePeriod, taxTreatment, taxAwareEconomics } = canonicalResult;
  const {
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
    economicRevenue,
    economicCogs,
    economicProfit,
    economicMarginPct,
    discountRatePct,
    refundRatePct,
  } = canonicalResult.legacyMetrics;
  for (const row of rows) {
    row.revenueSharePct =
      totalRevenue > 0 ? (row.revenue / totalRevenue) * 100 : 0;
    row.profitSharePct =
      totalProfit !== 0 ? (row.profit / totalProfit) * 100 : 0;
  }

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
      discountRatePct,
      refundRatePct,
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
    trend: canonicalResult.trend,
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
        currentPeriodComplete: canonicalResult.coverage.currentPeriodComplete,
        previousPeriodComplete: canonicalResult.coverage.previousPeriodComplete,
        truncatedConnections: canonicalResult.coverage.truncatedConnections,
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
