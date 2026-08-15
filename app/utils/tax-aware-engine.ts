import type { TaxAwarePeriodData } from "~/utils/margin";
import type { TaxContext } from "~/utils/tax-profile.server";

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
  taxContext?: TaxContext | null;
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
  };

  const hasActualTax =
    taxAwarePeriod.hasActualShopifyTax &&
    (
      actualCollectedTax > 0 ||
      taxAwarePeriod.taxedLineCount > 0
    );

  const hasTaxableProducts =
    taxAwarePeriod.taxableLineCount > 0;

  /*
   * GLOBAL PATH 1
   * Shopify has real transaction-level tax data.
   *
   * This path is country-agnostic:
   * VAT, GST, GST/HST and sales-tax stores all use the
   * actual tax data Shopify recorded on the orders.
   */
  if (hasActualTax) {
    reasons.push("SHOPIFY_ACTUAL_TAX_AVAILABLE");

    if (taxContext?.taxSystem) {
      reasons.push(
        `TAX_SYSTEM_${taxContext.taxSystem}`,
      );
    }

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

  /*
   * GLOBAL PATH 2
   * Shopify reports taxable products but no tax was
   * actually applied to the analyzed transactions.
   *
   * Never manufacture tax from a country default here.
   */
  if (
    hasTaxableProducts &&
    taxAwarePeriod.taxedLineCount === 0 &&
    actualCollectedTax === 0
  ) {
    reasons.push(
      "TAXABLE_PRODUCTS_WITHOUT_ACTUAL_SHOPIFY_TAX",
    );

    if (taxContext?.taxSystem) {
      reasons.push(
        `TAX_SYSTEM_${taxContext.taxSystem}`,
      );
    }

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

  /*
   * ADVANCED COUNTRY PROFILE FALLBACK
   *
   * This is no longer tied to Italy.
   * A fallback is allowed only when MarginLab explicitly
   * supports an advanced profile for that jurisdiction
   * and the merchant has configured it.
   *
   * Today Italy is the first advanced profile, but the
   * resolver itself is already country-agnostic.
   */
  if (
    taxContext?.configured &&
    taxContext.advancedProfileAvailable &&
    taxContext.profile !== "UNCONFIGURED" &&
    taxContext.profile !== "NOT_APPLICABLE"
  ) {
    reasons.push("SHOPIFY_TAX_DATA_INCOMPLETE");
    reasons.push("ADVANCED_TAX_PROFILE_AVAILABLE");

    if (taxContext.taxSystem) {
      reasons.push(
        `TAX_SYSTEM_${taxContext.taxSystem}`,
      );
    }

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

  /*
   * GLOBAL SAFE FALLBACK
   *
   * If Shopify does not provide enough tax evidence and
   * MarginLab has no advanced profile for the store's
   * jurisdiction, revenue must remain untouched.
   */
  reasons.push("INSUFFICIENT_TAX_DATA");

  if (taxContext?.taxSystem) {
    reasons.push(
      `TAX_SYSTEM_${taxContext.taxSystem}`,
    );
  }

  if (!taxContext) {
    reasons.push("TAX_CONTEXT_MISSING");
  } else if (
    taxContext.advancedProfileAvailable &&
    !taxContext.configured
  ) {
    reasons.push("TAX_PROFILE_NOT_CONFIGURED");
  } else if (!taxContext.advancedProfileAvailable) {
    reasons.push("ADVANCED_TAX_PROFILE_NOT_AVAILABLE");
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