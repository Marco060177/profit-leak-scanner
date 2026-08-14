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

  includedProductTaxAmount: number;
  excludedProductTaxAmount: number;
  includedShippingTaxAmount: number;
  excludedShippingTaxAmount: number;
  includedRefundedTaxAmount: number;
  excludedRefundedTaxAmount: number;

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
    inputVatRecoveryPct: number;
    shippingIncludeVat: boolean;
    shippingVatRatePct: number;
  } | null;
};

function finite(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function emptyResolution(
  source: TaxRevenueSource,
  confidence: TaxResolutionConfidence,
  reasons: string[],
): TaxTreatmentResolution {
  return {
    source,
    confidence,
    hasActualTax: false,
    shouldUseShopifyTax: false,
    shouldUseTaxProfileFallback: false,
    actualCollectedTax: 0,

    includedProductTaxAmount: 0,
    excludedProductTaxAmount: 0,
    includedShippingTaxAmount: 0,
    excludedShippingTaxAmount: 0,
    includedRefundedTaxAmount: 0,
    excludedRefundedTaxAmount: 0,

    taxableLineCount: 0,
    taxedLineCount: 0,
    nonTaxableLineCount: 0,

    taxExemptOrderCount: 0,
    taxesIncludedOrderCount: 0,
    taxesExcludedOrderCount: 0,

    reasons,
  };
}

export function resolveTaxTreatment({
  taxAwarePeriod,
  taxContext,
}: ResolveTaxTreatmentInput): TaxTreatmentResolution {
  if (!taxAwarePeriod) {
    return emptyResolution(
      "insufficient_data",
      "none",
      ["TAX_AWARE_PERIOD_MISSING"],
    );
  }

  const actualCollectedTax = finite(
    taxAwarePeriod.netCollectedTax,
  );

  const includedProductTaxAmount = finite(
    taxAwarePeriod.includedProductTaxAmount,
  );
  const excludedProductTaxAmount = finite(
    taxAwarePeriod.excludedProductTaxAmount,
  );
  const includedShippingTaxAmount = finite(
    taxAwarePeriod.includedShippingTaxAmount,
  );
  const excludedShippingTaxAmount = finite(
    taxAwarePeriod.excludedShippingTaxAmount,
  );
  const includedRefundedTaxAmount = finite(
    taxAwarePeriod.includedRefundedTaxAmount,
  );
  const excludedRefundedTaxAmount = finite(
    taxAwarePeriod.excludedRefundedTaxAmount,
  );

  const reasons: string[] = [];

  const base = {
    actualCollectedTax,

    includedProductTaxAmount,
    excludedProductTaxAmount,
    includedShippingTaxAmount,
    excludedShippingTaxAmount,
    includedRefundedTaxAmount,
    excludedRefundedTaxAmount,

    taxableLineCount: taxAwarePeriod.taxableLineCount,
    taxedLineCount: taxAwarePeriod.taxedLineCount,
    nonTaxableLineCount: taxAwarePeriod.nonTaxableLineCount,

    taxExemptOrderCount: taxAwarePeriod.taxExemptOrderCount,
    taxesIncludedOrderCount: taxAwarePeriod.taxesIncludedOrderCount,
    taxesExcludedOrderCount: taxAwarePeriod.taxesExcludedOrderCount,
  };

  const hasActualTax =
    taxAwarePeriod.hasActualShopifyTax &&
    (
      actualCollectedTax > 0 ||
      taxAwarePeriod.taxedLineCount > 0
    );

  const hasTaxableProducts =
    taxAwarePeriod.taxableLineCount > 0;

  if (hasActualTax) {
    reasons.push("SHOPIFY_ACTUAL_TAX_AVAILABLE");

    if (
      includedProductTaxAmount > 0 ||
      includedShippingTaxAmount > 0
    ) {
      reasons.push("SHOPIFY_INCLUDED_TAX_PRESENT");
    }

    if (
      excludedProductTaxAmount > 0 ||
      excludedShippingTaxAmount > 0
    ) {
      reasons.push("SHOPIFY_EXCLUDED_TAX_PRESENT");
    }

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
      ...base,
      reasons,
    };
  }

  if (
    hasTaxableProducts &&
    taxAwarePeriod.taxedLineCount === 0 &&
    actualCollectedTax === 0
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
      ...base,
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
      ...base,
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
    ...base,
    reasons,
  };
}