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

  outputVat: number;
  includedProductVatAdjustment: number;
  excludedProductVat: number;
  shippingVat: number;

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

  reasons: string[];
};

function finite(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function safeRate(value: number | null | undefined) {
  const parsed = finite(value);
  return Math.min(100, Math.max(0, parsed));
}

function extractVatFromGross(
  grossAmount: number,
  vatRatePct: number,
) {
  const amount = finite(grossAmount);
  const rate = safeRate(vatRatePct);

  if (amount <= 0 || rate <= 0) {
    return 0;
  }

  return amount - amount / (1 + rate / 100);
}

function calculateInputVat({
  grossCost,
  taxContext,
}: {
  grossCost: number;
  taxContext: TaxContext;
}) {
  const cost = finite(grossCost);

  if (
    !taxContext.configured ||
    !taxContext.isItalianStore ||
    !taxContext.costsIncludeVat
  ) {
    return {
      inputVat: 0,
      recoverableInputVat: 0,
      nonRecoverableInputVat: 0,
      economicCogs: cost,
    };
  }

  const inputVat = extractVatFromGross(
    cost,
    taxContext.defaultVatRatePct,
  );

  const recoveryPct =
    taxContext.profile === "ITALY_STANDARD"
      ? safeRate(taxContext.inputVatRecoveryPct)
      : 0;

  const recoverableInputVat =
    inputVat * (recoveryPct / 100);

  const nonRecoverableInputVat =
    inputVat - recoverableInputVat;

  const netCost =
    cost - inputVat;

  const economicCogs =
    netCost + nonRecoverableInputVat;

  return {
    inputVat,
    recoverableInputVat,
    nonRecoverableInputVat,
    economicCogs,
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
  } else if (
    taxTreatment.source === "shopify_zero_tax"
  ) {
    outputVat = 0;
    netRevenue = grossRevenue;

    reasons.push(
      "NO_OUTPUT_VAT_APPLIED_BY_SHOPIFY",
    );
  } else if (
    taxTreatment.source === "tax_profile_fallback" &&
    taxTreatment.shouldUseTaxProfileFallback &&
    taxContext.configured &&
    taxContext.isItalianStore
  ) {
    if (
      taxContext.profile === "ITALY_STANDARD" &&
      taxContext.pricesIncludeVat
    ) {
      includedProductVatAdjustment =
        extractVatFromGross(
          grossRevenue,
          taxContext.defaultVatRatePct,
        );

      outputVat =
        includedProductVatAdjustment;

      netRevenue =
        grossRevenue - includedProductVatAdjustment;

      reasons.push(
        "OUTPUT_VAT_ESTIMATED_FROM_TAX_PROFILE",
      );
    } else {
      outputVat = 0;
      netRevenue = grossRevenue;

      reasons.push(
        "NO_OUTPUT_VAT_ESTIMATION_APPLIED",
      );
    }
  } else {
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
  } = calculateInputVat({
    grossCost: grossCogs,
    taxContext,
  });

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