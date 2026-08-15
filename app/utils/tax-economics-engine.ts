import type { TaxContext } from "~/utils/tax-profile.server";
import type { TaxTreatmentResolution } from "~/utils/tax-aware-engine";

export type TaxEconomicsInput = {
  revenue: number;
  cogs: number;

  taxContext: TaxContext;
  taxTreatment: TaxTreatmentResolution;
};

export type TaxEconomicsResult = {
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

  /**
   * Legacy VAT-named output fields are intentionally retained for
   * compatibility with the current MarginLab UI and LoaderData types.
   *
   * Semantically these values now represent transaction tax generally:
   * VAT, GST, GST/HST or sales tax depending on the store jurisdiction.
   */
  outputVat: number;
  includedProductVatAdjustment: number;
  excludedProductVat: number;
  shippingVat: number;

  netRevenue: number;

  grossCogs: number;

  /**
   * These fields also retain their VAT names for compatibility.
   * They represent recoverable/non-recoverable input tax only when an
   * advanced country profile explicitly supports that economic model.
   */
  inputVat: number;
  recoverableInputVat: number;
  nonRecoverableInputVat: number;
  economicCogs: number;

  profitBeforeTaxAdjustment: number;
  realProfit: number;
  realMarginPct: number;

  vatImpactOnProfit: number;

  reasons: string[];
};

function finite(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function safeRate(value: number | null | undefined) {
  const parsed = finite(value);
  return Math.min(100, Math.max(0, parsed));
}

function extractTaxFromGross(
  grossAmount: number,
  taxRatePct: number,
) {
  const amount = finite(grossAmount);
  const rate = safeRate(taxRatePct);

  if (amount <= 0 || rate <= 0) {
    return 0;
  }

  return amount - amount / (1 + rate / 100);
}

function canUseRecoverableInputTaxModel(
  taxContext: TaxContext,
) {
  if (
    !taxContext.configured ||
    !taxContext.advancedProfileAvailable ||
    !taxContext.supportsRecoverableInputTaxModel ||
    !taxContext.costsIncludeVat
  ) {
    return false;
  }

  return (
    taxContext.taxSystem === "VAT" ||
    taxContext.taxSystem === "GST" ||
    taxContext.taxSystem === "GST_HST"
  );
}

function canEstimateIncludedOutputTax(
  taxContext: TaxContext,
) {
  if (
    !taxContext.configured ||
    !taxContext.advancedProfileAvailable ||
    !taxContext.pricesIncludeVat ||
    safeRate(taxContext.defaultVatRatePct) <= 0
  ) {
    return false;
  }

  /**
   * MarginLab may estimate tax embedded in gross prices only for
   * tax families that support tax-inclusive price normalization.
   *
   * US SALES_TAX is deliberately excluded. When Shopify does not
   * provide enough US transaction tax evidence, MarginLab must not
   * manufacture sales tax from a country default.
   */
  return (
    taxContext.taxSystem === "VAT" ||
    taxContext.taxSystem === "GST" ||
    taxContext.taxSystem === "GST_HST"
  );
}

function calculateInputTax({
  grossCost,
  taxContext,
}: {
  grossCost: number;
  taxContext: TaxContext;
}) {
  const cost = finite(grossCost);

  if (!canUseRecoverableInputTaxModel(taxContext)) {
    return {
      inputVat: 0,
      recoverableInputVat: 0,
      nonRecoverableInputVat: 0,
      economicCogs: cost,
      reasons: [
        taxContext.taxSystem === "SALES_TAX"
          ? "INPUT_TAX_RECOVERY_NOT_USED_FOR_SALES_TAX"
          : taxContext.advancedProfileAvailable
            ? "INPUT_TAX_MODEL_NOT_ENABLED_BY_PROFILE"
            : "ADVANCED_INPUT_TAX_PROFILE_NOT_AVAILABLE",
      ],
    };
  }

  const inputTax = extractTaxFromGross(
    cost,
    taxContext.defaultVatRatePct,
  );

  const recoveryPct =
    taxContext.recoverInputVat
      ? safeRate(taxContext.inputVatRecoveryPct)
      : 0;

  const recoverableInputTax =
    inputTax * (recoveryPct / 100);

  const nonRecoverableInputTax =
    inputTax - recoverableInputTax;

  const netCost =
    cost - inputTax;

  const economicCogs =
    netCost + nonRecoverableInputTax;

  return {
    inputVat: inputTax,
    recoverableInputVat: recoverableInputTax,
    nonRecoverableInputVat: nonRecoverableInputTax,
    economicCogs,
    reasons: [
      "ADVANCED_INPUT_TAX_PROFILE_APPLIED",
      `TAX_SYSTEM_${taxContext.taxSystem}`,
    ],
  };
}

export function calculateTaxAwareEconomics({
  revenue,
  cogs,
  taxContext,
  taxTreatment,
}: TaxEconomicsInput): TaxEconomicsResult {
  const grossRevenue = finite(revenue);
  const grossCogs = finite(cogs);

  const reasons = [...taxTreatment.reasons];

  let outputVat = 0;
  let includedProductVatAdjustment = 0;
  let excludedProductVat = 0;
  let shippingVat = 0;
  let netRevenue = grossRevenue;

  /*
   * GLOBAL PATH 1
   * Shopify actually applied transaction tax.
   *
   * This logic is country-agnostic: MarginLab trusts the
   * real Shopify tax lines rather than reconstructing tax
   * from a country rate.
   */
  if (taxTreatment.source === "shopify_actual_tax") {
    const netIncludedProductTax = Math.max(
      0,
      finite(taxTreatment.includedProductTaxAmount) -
        finite(taxTreatment.includedRefundedTaxAmount),
    );

    const netExcludedProductTax = Math.max(
      0,
      finite(taxTreatment.excludedProductTaxAmount) -
        finite(taxTreatment.excludedRefundedTaxAmount),
    );

    const totalShippingTax =
      finite(taxTreatment.includedShippingTaxAmount) +
      finite(taxTreatment.excludedShippingTaxAmount);

    outputVat = Math.max(
      0,
      netIncludedProductTax +
        netExcludedProductTax +
        totalShippingTax,
    );

    includedProductVatAdjustment =
      netIncludedProductTax;

    excludedProductVat =
      netExcludedProductTax;

    shippingVat =
      totalShippingTax;

    /**
     * Only tax embedded in product prices is removed from
     * product revenue.
     *
     * Tax added on top of product prices is outside the
     * current product-revenue base and must not be removed.
     *
     * Shipping tax remains separate because this engine
     * currently receives product revenue, not shipping revenue.
     */
    netRevenue = Math.max(
      0,
      grossRevenue - includedProductVatAdjustment,
    );

    if (includedProductVatAdjustment > 0) {
      reasons.push(
        "SHOPIFY_INCLUDED_PRODUCT_TAX_REMOVED_FROM_REVENUE",
      );
    }

    if (excludedProductVat > 0) {
      reasons.push(
        "SHOPIFY_EXCLUDED_PRODUCT_TAX_LEFT_OUTSIDE_REVENUE",
      );
    }

    if (shippingVat > 0) {
      reasons.push(
        "SHOPIFY_SHIPPING_TAX_TRACKED_SEPARATELY",
      );
    }
  }

  /*
   * GLOBAL PATH 2
   * Shopify confirms that taxable products were present but
   * no transaction tax was actually applied.
   *
   * Never manufacture tax from a country default.
   */
  else if (
    taxTreatment.source === "shopify_zero_tax"
  ) {
    outputVat = 0;
    netRevenue = grossRevenue;

    reasons.push(
      "NO_OUTPUT_TAX_APPLIED_BY_SHOPIFY",
    );
  }

  /*
   * ADVANCED COUNTRY PROFILE FALLBACK
   *
   * This is now tax-family based rather than Italy-specific.
   * The fallback is permitted only when the resolver explicitly
   * allows it and the country profile supports included-tax
   * normalization.
   */
  else if (
    taxTreatment.source === "tax_profile_fallback" &&
    taxTreatment.shouldUseTaxProfileFallback
  ) {
    if (canEstimateIncludedOutputTax(taxContext)) {
      includedProductVatAdjustment =
        extractTaxFromGross(
          grossRevenue,
          taxContext.defaultVatRatePct,
        );

      outputVat =
        includedProductVatAdjustment;

      netRevenue =
        grossRevenue - includedProductVatAdjustment;

      reasons.push(
        "OUTPUT_TAX_ESTIMATED_FROM_ADVANCED_PROFILE",
      );
    } else {
      outputVat = 0;
      netRevenue = grossRevenue;

      reasons.push(
        taxContext.taxSystem === "SALES_TAX"
          ? "SALES_TAX_FALLBACK_NOT_ESTIMATED"
          : "NO_OUTPUT_TAX_ESTIMATION_APPLIED",
      );
    }
  }

  /*
   * GLOBAL SAFE FALLBACK
   *
   * If MarginLab cannot prove or safely estimate tax treatment,
   * revenue remains untouched.
   */
  else {
    outputVat = 0;
    netRevenue = grossRevenue;

    reasons.push(
      "REVENUE_LEFT_UNCHANGED_DUE_TO_INSUFFICIENT_TAX_DATA",
    );
  }

  const {
    inputVat,
    recoverableInputVat,
    nonRecoverableInputVat,
    economicCogs,
    reasons: inputTaxReasons,
  } = calculateInputTax({
    grossCost: grossCogs,
    taxContext,
  });

  reasons.push(...inputTaxReasons);

  const profitBeforeTaxAdjustment =
    grossRevenue - grossCogs;

  const realProfit =
    netRevenue - economicCogs;

  const realMarginPct =
    netRevenue > 0
      ? (realProfit / netRevenue) * 100
      : 0;

  const vatImpactOnProfit =
    realProfit - profitBeforeTaxAdjustment;

  return {
    source: taxTreatment.source,
    confidence: taxTreatment.confidence,

    grossRevenue,

    outputVat,
    includedProductVatAdjustment,
    excludedProductVat,
    shippingVat,

    netRevenue,

    grossCogs,
    inputVat,
    recoverableInputVat,
    nonRecoverableInputVat,
    economicCogs,

    profitBeforeTaxAdjustment,
    realProfit,
    realMarginPct,

    vatImpactOnProfit,

    reasons: [...new Set(reasons)],
  };
}