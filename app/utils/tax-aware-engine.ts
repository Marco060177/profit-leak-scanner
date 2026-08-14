import type { TaxAwarePeriodData } from "~/utils/margin";

export type TaxResolutionConfidence =
  | "none"
  | "low"
  | "medium"
  | "high";

export type TaxRevenueSource =
  | "shopify_actual_tax"
  | "shopify_zero_tax"
  | "tax_profile_fallback"
  | "insufficient_data";

export type TaxTreatmentResolution = {
  source: TaxRevenueSource;

  confidence: TaxResolutionConfidence;

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

  reasons: string[];
};

export type ResolveTaxTreatmentInput = {
  taxAwarePeriod?: TaxAwarePeriodData | null;

  taxContext?: {
    configured: boolean;
    isItalianStore: boolean;
    profile:
      | "UNCONFIGURED"
      | "NOT_APPLICABLE"
      | "ITALY_STANDARD"
      | "ITALY_FORFETTARIO"
      | "ITALY_EXEMPT";

    defaultVatRatePct: number;
    pricesIncludeVat: boolean;
    costsIncludeVat: boolean;
    recoverInputVat: boolean;
    shippingIncludeVat: boolean;
    shippingVatRatePct: number;
  } | null;
};

function finite(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

export function resolveTaxTreatment({
  taxAwarePeriod,
  taxContext,
}: ResolveTaxTreatmentInput): TaxTreatmentResolution {
  const reasons: string[] = [];

  if (!taxAwarePeriod) {
    return {
      source: "insufficient_data",
      confidence: "none",
      hasActualTax: false,
      shouldUseShopifyTax: false,
      shouldUseTaxProfileFallback: false,
      actualCollectedTax: 0,
      taxableLineCount: 0,
      taxedLineCount: 0,
      nonTaxableLineCount: 0,
      taxExemptOrderCount: 0,
      taxesIncludedOrderCount: 0,
      taxesExcludedOrderCount: 0,
      reasons: ["TAX_AWARE_PERIOD_MISSING"],
    };
  }

  const actualCollectedTax = finite(
    taxAwarePeriod.netCollectedTax,
  );

  const hasActualTax =
    taxAwarePeriod.hasActualShopifyTax &&
    actualCollectedTax > 0;

  const hasTaxableProducts =
    taxAwarePeriod.taxableLineCount > 0;

  const hasTaxedLines =
    taxAwarePeriod.taxedLineCount > 0;

  if (hasActualTax || hasTaxedLines) {
    reasons.push("SHOPIFY_ACTUAL_TAX_AVAILABLE");

    if (taxAwarePeriod.refundedTaxAmount > 0) {
      reasons.push("REFUNDED_TAX_INCLUDED");
    }

    if (taxAwarePeriod.shippingTaxAmount > 0) {
      reasons.push("SHIPPING_TAX_INCLUDED");
    }

    return {
      source: "shopify_actual_tax",
      confidence: "high",
      hasActualTax: true,
      shouldUseShopifyTax: true,
      shouldUseTaxProfileFallback: false,
      actualCollectedTax,
      taxableLineCount:
        taxAwarePeriod.taxableLineCount,
      taxedLineCount:
        taxAwarePeriod.taxedLineCount,
      nonTaxableLineCount:
        taxAwarePeriod.nonTaxableLineCount,
      taxExemptOrderCount:
        taxAwarePeriod.taxExemptOrderCount,
      taxesIncludedOrderCount:
        taxAwarePeriod.taxesIncludedOrderCount,
      taxesExcludedOrderCount:
        taxAwarePeriod.taxesExcludedOrderCount,
      reasons,
    };
  }

  if (
    hasTaxableProducts &&
    !hasActualTax &&
    !hasTaxedLines
  ) {
    reasons.push(
      "TAXABLE_PRODUCTS_WITHOUT_ACTUAL_SHOPIFY_TAX",
    );

    if (taxAwarePeriod.taxExemptOrderCount > 0) {
      reasons.push("TAX_EXEMPT_ORDERS_PRESENT");
    }

    return {
      source: "shopify_zero_tax",
      confidence: "high",
      hasActualTax: false,
      shouldUseShopifyTax: true,
      shouldUseTaxProfileFallback: false,
      actualCollectedTax: 0,
      taxableLineCount:
        taxAwarePeriod.taxableLineCount,
      taxedLineCount:
        taxAwarePeriod.taxedLineCount,
      nonTaxableLineCount:
        taxAwarePeriod.nonTaxableLineCount,
      taxExemptOrderCount:
        taxAwarePeriod.taxExemptOrderCount,
      taxesIncludedOrderCount:
        taxAwarePeriod.taxesIncludedOrderCount,
      taxesExcludedOrderCount:
        taxAwarePeriod.taxesExcludedOrderCount,
      reasons,
    };
  }

  if (
    taxContext?.configured &&
    taxContext.isItalianStore
  ) {
    reasons.push("SHOPIFY_TAX_DATA_INCOMPLETE");
    reasons.push("TAX_PROFILE_AVAILABLE");

    return {
      source: "tax_profile_fallback",
      confidence: "medium",
      hasActualTax: false,
      shouldUseShopifyTax: false,
      shouldUseTaxProfileFallback: true,
      actualCollectedTax: 0,
      taxableLineCount:
        taxAwarePeriod.taxableLineCount,
      taxedLineCount:
        taxAwarePeriod.taxedLineCount,
      nonTaxableLineCount:
        taxAwarePeriod.nonTaxableLineCount,
      taxExemptOrderCount:
        taxAwarePeriod.taxExemptOrderCount,
      taxesIncludedOrderCount:
        taxAwarePeriod.taxesIncludedOrderCount,
      taxesExcludedOrderCount:
        taxAwarePeriod.taxesExcludedOrderCount,
      reasons,
    };
  }

  reasons.push("INSUFFICIENT_TAX_DATA");

  if (!taxContext?.configured) {
    reasons.push("TAX_PROFILE_NOT_CONFIGURED");
  }

  return {
    source: "insufficient_data",
    confidence: "low",
    hasActualTax: false,
    shouldUseShopifyTax: false,
    shouldUseTaxProfileFallback: false,
    actualCollectedTax: 0,
    taxableLineCount:
      taxAwarePeriod.taxableLineCount,
    taxedLineCount:
      taxAwarePeriod.taxedLineCount,
    nonTaxableLineCount:
      taxAwarePeriod.nonTaxableLineCount,
    taxExemptOrderCount:
      taxAwarePeriod.taxExemptOrderCount,
    taxesIncludedOrderCount:
      taxAwarePeriod.taxesIncludedOrderCount,
    taxesExcludedOrderCount:
      taxAwarePeriod.taxesExcludedOrderCount,
    reasons,
  };
}