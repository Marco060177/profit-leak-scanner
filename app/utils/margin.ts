import {
  formatMoney,
  formatPercent,
} from "~/utils/formatting";
import type { EconomicSnapshot } from "~/utils/economic-snapshot";

export type Summary = {
  revenue: number;
  cogs: number;
  profit: number;
  marginPct: number;
  discounts: number;
  shipping: number;
  taxes: number;
  refunds: number;
  netRevenue: number;
  contributionProfit: number;
  contributionMarginPct: number;
  totalLeak: number;
  losingCount: number;
  missingCostCount: number;
  previousMarginPct: number;
  marginDelta: number;
  previousRevenue: number;
  revenueDeltaPct: number;
  grossProductSales?: number;
  refundedProductRevenue?: number;
  netProductRevenue?: number;
  shippingRevenue?: number;
  productCogs?: number;
  grossProfit?: number;
  grossMarginPct?: number;
  orderedQuantity?: number;
  refundedQuantity?: number;
  netQuantity?: number;
  discountRatePct?: number;
  refundRatePct?: number;
  losingProductRevenue?: number;
  lowMarginProductRevenue?: number;
  missingCostRevenue?: number;
  revenueCoveragePct?: number;
  allocatedAds?: number;
  allocatedShippingCost?: number;
  allocatedOperatingCost?: number;
  paymentFees?: number;
  transactionFees?: number;
  taxReserve?: number;
  adjustedProfit?: number;
  adjustedMarginPct?: number;
};

export type Row = {
  productId: string;
  productTitle: string;
  qty: number;
  revenue: number;
  cogs: number;
  discounts: number;
  refunds: number;
  profit: number;
  marginPct: number;
  previousMarginPct: number | null;
  productMarginDelta: number | null;
  losing: boolean;
  lowMargin: boolean;
  avgPrice: number;
  avgCost: number;
  breakEvenPrice: number;
  targetPrice: number;
  targetDelta: number;
  suggestion: string;
  missingCost: boolean;
  orderedQuantity?: number;
  refundedQuantity?: number;
  netQuantity?: number;
  grossProductSales?: number;
  netProductSales?: number;
  refundedProductRevenue?: number;
  salesTaxes?: number;
  netProductRevenue?: number;
  productCogs?: number;
  grossProfit?: number;
  grossMarginPct?: number;
  discountRatePct?: number;
  refundRatePct?: number;
  revenueSharePct?: number;
  profitSharePct?: number;
  allocatedAds?: number;
  allocatedShippingCost?: number;
  allocatedOperatingCost?: number;
  paymentFees?: number;
  transactionFees?: number;
  taxReserve?: number;
  adjustedProfit?: number;
  adjustedMarginPct?: number;
};

export type TrendPoint = {
  date: string;
  revenue: number;
  profit: number;
  grossProductSales?: number;
  discounts?: number;
  refundedProductRevenue?: number;
  netProductRevenue?: number;
  shippingRevenue?: number;
  productCogs?: number;
  grossProfit?: number;
  adjustedProfit?: number;
};

export type BillingPlan = "NONE" | "STARTER" | "GROWTH";

export type BillingStatus = {
  active: boolean;
  plan: BillingPlan;
  subscriptionName: string | null;
};

export type PeriodObservation = {
  orderCount: number;
  productCount: number;
  orderedQuantity: number;
  netQuantity: number;
  activeDays: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  hasSales: boolean;
};

export type AnalysisContext = {
  requestedDays: number;
  current: PeriodObservation;
  previous: PeriodObservation;
  comparisonAvailable: boolean;
};

export type LoaderData = {
  summary: Summary;
  rows: Row[];
  marginDeterioration: Row[];
  trend: TrendPoint[];
  billingActive: boolean;
  billing?: BillingStatus;
  period: string;
  shopHandle: string;
  currencyCode: string;
  timeZone: string;
  analysisContext?: AnalysisContext;
  economicSnapshot?: EconomicSnapshot;
};

export function money(
  n: number,
  currencyCode = "USD",
  locale = "en-US",
  digits = 2,
) {
  return formatMoney(n, { currencyCode, locale, digits });
}

export function pct(n: number, locale = "en-US", digits = 1) {
  return formatPercent(n, { locale, digits });
}

export function toYYYYMMDD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function extractNumericId(gid: string) {
  return gid.split("/").pop() || "";
}