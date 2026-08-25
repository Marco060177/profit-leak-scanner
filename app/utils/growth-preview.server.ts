import type { BillingStatus, LoaderData } from "~/utils/margin";

export function createGrowthPreviewData({
  billing,
  period,
  shop,
}: {
  billing: BillingStatus;
  period: string;
  shop: string;
}): LoaderData {
  return {
    summary: {
      revenue: 0,
      cogs: 0,
      profit: 0,
      marginPct: 0,
      discounts: 0,
      shipping: 0,
      taxes: 0,
      refunds: 0,
      netRevenue: 0,
      contributionProfit: 0,
      contributionMarginPct: 0,
      totalLeak: 0,
      losingCount: 0,
      missingCostCount: 0,
      previousMarginPct: 0,
      marginDelta: 0,
      previousRevenue: 0,
      revenueDeltaPct: 0,
    },
    rows: [],
    marginDeterioration: [],
    trend: [],
    billingActive: billing.active,
    billing,
    period,
    shopHandle: shop.replace(/\.myshopify\.com$/i, ""),
    currencyCode: "USD",
    timeZone: "UTC",
  };
}
