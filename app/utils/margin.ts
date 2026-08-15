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

  economicRevenue?: number;
  economicCogs?: number;
  economicProfit?: number;
  economicMarginPct?: number;
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

export type TaxSystem =
  | "VAT"
  | "GST"
  | "GST_HST"
  | "SALES_TAX"
  | "UNKNOWN";

export type TaxProfile =
  | "UNCONFIGURED"
  | "NOT_APPLICABLE"
  | "ITALY_STANDARD"
  | "ITALY_FORFETTARIO"
  | "ITALY_EXEMPT"
  | "UK_VAT_STANDARD"
  | "UK_VAT_EXEMPT"
  | "UK_VAT_UNREGISTERED"
  | "CANADA_GST_HST_REGISTERED"
  | "CANADA_GST_HST_EXEMPT"
  | "CANADA_GST_HST_UNREGISTERED"
  | "AUSTRALIA_GST_REGISTERED"
  | "AUSTRALIA_GST_FREE"
  | "AUSTRALIA_GST_UNREGISTERED"
  | "GERMANY_VAT_STANDARD"
  | "GERMANY_VAT_EXEMPT"
  | "GERMANY_VAT_UNREGISTERED"
  | "FRANCE_VAT_STANDARD"
  | "FRANCE_VAT_EXEMPT"
  | "FRANCE_VAT_UNREGISTERED"
  | "SPAIN_VAT_STANDARD"
  | "SPAIN_VAT_EXEMPT"
  | "SPAIN_VAT_UNREGISTERED"
  | "NETHERLANDS_VAT_STANDARD"
  | "NETHERLANDS_VAT_EXEMPT"
  | "NETHERLANDS_VAT_UNREGISTERED"
  | "IRELAND_VAT_STANDARD"
  | "IRELAND_VAT_EXEMPT"
  | "IRELAND_VAT_UNREGISTERED"
  | "NEW_ZEALAND_GST_REGISTERED"
  | "NEW_ZEALAND_GST_EXEMPT"
  | "NEW_ZEALAND_GST_UNREGISTERED";

export type TaxAwarePeriodData = {
  totalShopifyTax: number;

  productTaxAmount: number;
  shippingTaxAmount: number;
  refundedTaxAmount: number;

  netCollectedTax: number;

  taxableLineCount: number;
  nonTaxableLineCount: number;
  taxedLineCount: number;

  taxExemptOrderCount: number;
  taxesIncludedOrderCount: number;
  taxesExcludedOrderCount: number;

  hasActualShopifyTax: boolean;
  hasTaxableProducts: boolean;
  hasTaxExemptOrders: boolean;

  includedProductTaxAmount: number;
  excludedProductTaxAmount: number;
  includedShippingTaxAmount: number;
  excludedShippingTaxAmount: number;
  includedRefundedTaxAmount: number;
  excludedRefundedTaxAmount: number;

  taxDataCoverage: "none" | "partial" | "complete";
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
  taxAwarePeriod?: TaxAwarePeriodData;

  taxTreatment?: {
    source:
      | "shopify_actual_tax"
      | "shopify_zero_tax"
      | "tax_profile_fallback"
      | "insufficient_data";

    confidence:
      | "none"
      | "low"
      | "medium"
      | "high";

    hasActualTax: boolean;
    shouldUseShopifyTax: boolean;
    shouldUseTaxProfileFallback: boolean;

    actualCollectedTax: number;

    taxableLineCount: number;
    taxedLineCount: number;
    nonTaxableLineCount: number;

    taxExemptOrderCount: number;
    taxesIncludedOrderCount: number;
    taxesExcludedOrderCount: number;

    includedProductTaxAmount: number;
    excludedProductTaxAmount: number;
    includedShippingTaxAmount: number;
    excludedShippingTaxAmount: number;
    includedRefundedTaxAmount: number;
    excludedRefundedTaxAmount: number;

    reasons: string[];
  };

  taxAwareEconomics?: {
    source:
      | "shopify_actual_tax"
      | "shopify_zero_tax"
      | "tax_profile_fallback"
      | "insufficient_data";

    confidence:
      | "none"
      | "low"
      | "medium"
      | "high";

    grossRevenue: number;
    outputVat: number;
    netRevenue: number;

    grossCogs: number;
    inputVat: number;
    recoverableInputVat: number;
    nonRecoverableInputVat: number;
    economicCogs: number;

    profitBeforeTaxAdjustment: number;
    realProfit: number;
    realMarginPct: number;

    vatImpactOnProfit: number;

    includedProductVatAdjustment: number;
    excludedProductVat: number;
    shippingVat: number;

    reasons: string[];
  };

  economicSnapshot?: EconomicSnapshot;

  taxContext?: {
    shopCountryCode: string;
    effectiveCountryCode: string;

    taxSystem: TaxSystem;
    advancedProfileAvailable: boolean;
    supportsRecoverableInputTaxModel: boolean;

    // Temporary compatibility field while Italy-specific
    // UI checks are migrated to the international architecture.
    isItalianStore: boolean;

    profile: TaxProfile;

    defaultVatRatePct: number;
    pricesIncludeVat: boolean;
    costsIncludeVat: boolean;
    recoverInputVat: boolean;
    inputVatRecoveryPct: number;
    shippingIncludeVat: boolean;
    shippingVatRatePct: number;
    configured: boolean;
  };
};

export function money(
  n: number,
  currencyCode = "USD",
  locale = "en-US",
  _digits = 2,
) {
  return formatMoney(n, {
    currencyCode,
    locale,
  });
}

export function pct(
  n: number,
  locale = "en-US",
  _digits = 1,
) {
  return formatPercent(n, {
    locale,
  });
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