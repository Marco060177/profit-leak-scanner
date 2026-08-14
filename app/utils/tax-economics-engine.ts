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

  /*
   * Special regimes:
   * forfettario and exempt currently treat input VAT
   * as non-recoverable economic cost.
   */
  const inputVatRecoverable =
    taxContext.profile === "ITALY_STANDARD" &&
    taxContext.recoverInputVat;

  const recoverableInputVat =
    inputVatRecoverable ? inputVat : 0;

  const nonRecoverableInputVat =
    inputVat - recoverableInputVat;

  const netCost = cost - inputVat;

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
  let netRevenue = grossRevenue;

  /*
   * 1. Shopify actually applied tax.
   *
   * We trust the real transaction tax amount.
   */
  if (taxTreatment.source === "shopify_actual_tax") {
    outputVat = finite(
      taxTreatment.actualCollectedTax,
    );

    /*
     * If Shopify reports taxes included, the product
     * revenue contains the tax and it must be removed.
     *
     * If taxes are excluded, the current product revenue
     * is already pre-tax, therefore we do not subtract
     * the tax from product revenue.
     */
    if (taxTreatment.taxesIncludedOrderCount > 0) {
      netRevenue = Math.max(
        0,
        grossRevenue - outputVat,
      );

      reasons.push(
        "SHOPIFY_INCLUDED_TAX_REMOVED_FROM_REVENUE",
      );
    } else {
      netRevenue = grossRevenue;

      reasons.push(
        "SHOPIFY_EXCLUDED_TAX_REVENUE_ALREADY_PRE_TAX",
      );
    }
  }

  /*
   * 2. Shopify confirms zero tax.
   *
   * Never manufacture VAT just because the Tax Profile
   * contains a 22% default rate.
   */
  else if (
    taxTreatment.source === "shopify_zero_tax"
  ) {
    outputVat = 0;
    netRevenue = grossRevenue;

    reasons.push(
      "NO_OUTPUT_VAT_APPLIED_BY_SHOPIFY",
    );
  }

  /*
   * 3. Tax Profile fallback.
   *
   * This is intentionally conservative and should only
   * be used where the resolver explicitly permits it.
   */
  else if (
    taxTreatment.source === "tax_profile_fallback" &&
    taxTreatment.shouldUseTaxProfileFallback &&
    taxContext.configured &&
    taxContext.isItalianStore
  ) {
    if (
      taxContext.profile === "ITALY_STANDARD" &&
      taxContext.pricesIncludeVat
    ) {
      outputVat = extractVatFromGross(
        grossRevenue,
        taxContext.defaultVatRatePct,
      );

      netRevenue = grossRevenue - outputVat;

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
  }

  /*
   * 4. Insufficient data.
   *
   * Revenue is left untouched.
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