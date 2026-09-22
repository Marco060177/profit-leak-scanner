import type { NormalizedCommerceDataset } from "~/core/normalized-commerce";

export const CANONICAL_PROFIT_RESULT_VERSION = 1 as const;
export const PROFIT_FORMULA_VERSION = "shopify-legacy-v1" as const;

/**
 * Canonical sign convention: inflows are positive; costs, discounts and
 * refunds are negative. Reported tax is evidence, not an extra deduction.
 *
 * V1 deliberately carries finite JS numbers from the existing Shopify
 * calculation. Fixed-precision arithmetic is a separate migration.
 */
export type FixedPrecisionMoney = {
  amountAtoms: bigint;
  amountScale: number;
  currencyCode: string;
};

export type CapabilityStatus =
  | "AVAILABLE"
  | "NOT_APPLICABLE"
  | "NOT_AUTHORIZED"
  | "NOT_SUPPORTED"
  | "TEMPORARILY_UNAVAILABLE";
export type DatasetQualityStatus =
  | "SYNCING"
  | "PROVISIONAL"
  | "COMPLETE"
  | "DEGRADED"
  | "ERROR";
export type ReconciliationStatus =
  | "NOT_ATTEMPTED"
  | "PENDING"
  | "RECONCILED"
  | "RECONCILED_WITH_ROUNDING_RESIDUAL"
  | "UNRECONCILED"
  | "BLOCKED_BY_UNKNOWN";

export type CanonicalProfitResult = {
  version: typeof CANONICAL_PROFIT_RESULT_VERSION;
  formulaVersion: typeof PROFIT_FORMULA_VERSION;
  scope: {
    sourceCurrencyCode: string;
    reportingCurrencyCode: string;
    requestedDays: number;
    currentPeriodStart: string;
    currentPeriodEndExclusive: string | null;
    previousPeriodStart: string;
  };
  /** Signed compatibility components in source/shop currency. */
  components: {
    grossProductSales: number;
    discounts: number;
    productRefunds: number;
    productCogs: number;
    shippingRevenue: number;
  };
  totals: {
    netSales: number;
    grossProfit: number;
    grossMarginPct: number;
    /** Gross product profit plus customer-paid shipping; no carrier cost. */
    legacyShippingContribution: number;
    legacyShippingContributionMarginPct: number;
    marketplaceContribution: null;
    fulfillmentContribution: null;
    acquisitionContribution: null;
    fullyLoadedResult: null;
  };
  tax: {
    source: string;
    reportedTax: number;
    netCollectedTax: number;
    economicRevenue: number;
    economicCogs: number;
    economicProfit: number;
    economicMarginPct: number;
  };
  coverage: {
    revenueCoveragePct: number;
    currentPeriodComplete: boolean;
    previousPeriodComplete: boolean;
    truncatedConnections: string[];
  };
  quality: DatasetQualityStatus;
  reconciliation: ReconciliationStatus;
  /** No ledger classification or rounding process exists in this path yet. */
  unknownAmount: null;
  roundingResidual: null;
  mappingVersions: null;
  sourceWatermarks: null;
};

export function buildCanonicalProfitResult({
  dataset,
  currencyCode,
  requestedDays,
  currentPeriodStart,
  currentPeriodEndExclusive,
  previousPeriodStart,
  grossProfit,
  grossMarginPct,
  legacyShippingContribution,
  legacyShippingContributionMarginPct,
  revenueCoveragePct,
  tax,
}: {
  dataset: NormalizedCommerceDataset;
  currencyCode: string;
  requestedDays: number;
  currentPeriodStart: string;
  currentPeriodEndExclusive: string | null;
  previousPeriodStart: string;
  grossProfit: number;
  grossMarginPct: number;
  legacyShippingContribution: number;
  legacyShippingContributionMarginPct: number;
  revenueCoveragePct: number;
  tax: CanonicalProfitResult["tax"];
}): CanonicalProfitResult {
  const { current, previous } = dataset;
  const currentPeriodComplete = current.truncatedConnections.length === 0;
  const previousPeriodComplete = previous.truncatedConnections.length === 0;
  const truncatedConnections = [
    ...current.truncatedConnections.map((connection) => `current:${connection}`),
    ...previous.truncatedConnections.map((connection) => `previous:${connection}`),
  ];

  return {
    version: CANONICAL_PROFIT_RESULT_VERSION,
    formulaVersion: PROFIT_FORMULA_VERSION,
    scope: {
      sourceCurrencyCode: currencyCode,
      reportingCurrencyCode: currencyCode,
      requestedDays,
      currentPeriodStart,
      currentPeriodEndExclusive,
      previousPeriodStart,
    },
    components: {
      grossProductSales: current.grossProductSales,
      discounts: -current.discounts,
      productRefunds: -current.productRefunds,
      productCogs: -current.productCogs,
      shippingRevenue: current.shippingRevenue,
    },
    totals: {
      netSales: current.netProductRevenue,
      grossProfit,
      grossMarginPct,
      legacyShippingContribution,
      legacyShippingContributionMarginPct,
      marketplaceContribution: null,
      fulfillmentContribution: null,
      acquisitionContribution: null,
      fullyLoadedResult: null,
    },
    tax,
    coverage: {
      revenueCoveragePct,
      currentPeriodComplete,
      previousPeriodComplete,
      truncatedConnections,
    },
    quality:
      !currentPeriodComplete || !previousPeriodComplete || revenueCoveragePct < 100
        ? "DEGRADED"
        : "PROVISIONAL",
    reconciliation: "NOT_ATTEMPTED",
    unknownAmount: null,
    roundingResidual: null,
    mappingVersions: null,
    sourceWatermarks: null,
  };
}
