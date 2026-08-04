import type {
  AnalysisContext,
  Row,
  Summary,
} from "~/utils/margin";

export type EconomicAmountKind =
  | "loss"
  | "exposure"
  | "opportunity"
  | "qualitative";

export type EconomicAmount = {
  id: string;
  kind: EconomicAmountKind;
  periodAmount: number | null;
  monthlyAmount: number | null;
  affectedProductIds: string[];
};

export type DataConfidenceLevel = "low" | "medium" | "high";

export type DataConfidence = {
  score: number;
  level: DataConfidenceLevel;
  reasons: string[];
  cogsCoveragePct: number;
  comparisonAvailable: boolean;
  usesCurrentShopifyCosts: true;
  taxBasis: "shopify_reported_not_allocated";
  refundBasis: "order_period";
};

export type EconomicSnapshot = {
  version: 1;
  periodDays: number;
  currencyCode: string;
  facts: {
    grossProductSales: number;
    discounts: number;
    productRefunds: number;
    netProductRevenue: number;
    productCogs: number;
    grossProductProfit: number;
    grossProductMarginPct: number;
    shippingRevenue: number;
    reportedTaxes: number;
  };
  amounts: EconomicAmount[];
  totals: {
    monthlyLoss: number;
    monthlyExposure: number;
    monthlyOpportunity: number;
  };
  confidence: DataConfidence;
};

export type BuildEconomicSnapshotInput = {
  summary: Summary;
  rows: Row[];
  period: string | number;
  currencyCode: string;
  analysisContext?: AnalysisContext;
};

function finite(value: number | null | undefined, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function periodDays(value: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

function monthly(value: number, days: number) {
  return value * (30 / days);
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function buildConfidence(
  summary: Summary,
  analysisContext?: AnalysisContext,
): DataConfidence {
  const coverage = clamp(
    finite(summary.revenueCoveragePct, summary.missingCostCount > 0 ? 0 : 100),
    0,
    100,
  );
  const current = analysisContext?.current;
  const reasons: string[] = [
    "CURRENT_SHOPIFY_COSTS_APPLIED_TO_HISTORICAL_SALES",
    "TAX_NOT_ALLOCATED_TO_PRODUCT_REVENUE",
    "REFUNDS_ATTRIBUTED_TO_ORDER_PERIOD",
  ];

  let score = 25;
  score += coverage * 0.45;

  if (current) {
    score += Math.min(15, current.orderCount * 0.5);
    score += Math.min(10, current.activeDays * 0.5);
    if (current.orderCount < 3) reasons.push("VERY_FEW_ORDERS");
    else if (current.orderCount < 10) reasons.push("FEW_ORDERS");
  } else {
    reasons.push("ANALYSIS_CONTEXT_MISSING");
  }

  if (coverage < 100) reasons.push("INCOMPLETE_COGS_COVERAGE");
  if (!analysisContext?.comparisonAvailable) {
    reasons.push("COMPARISON_UNAVAILABLE");
  }

  const normalizedScore = Math.round(clamp(score, 0, 100));

  return {
    score: normalizedScore,
    level:
      normalizedScore >= 80
        ? "high"
        : normalizedScore >= 55
          ? "medium"
          : "low",
    reasons: unique(reasons),
    cogsCoveragePct: coverage,
    comparisonAvailable: analysisContext?.comparisonAvailable ?? false,
    usesCurrentShopifyCosts: true,
    taxBasis: "shopify_reported_not_allocated",
    refundBasis: "order_period",
  };
}

export function buildEconomicSnapshot({
  summary,
  rows,
  period,
  currencyCode,
  analysisContext,
}: BuildEconomicSnapshotInput): EconomicSnapshot {
  const days = periodDays(period);
  const losingRows = rows.filter((row) => row.profit < 0);
  const missingCostRows = rows.filter((row) => row.missingCost);
  const lossForPeriod = losingRows.reduce(
    (sum, row) => sum + Math.max(0, -finite(row.profit)),
    0,
  );
  const missingCostExposure = missingCostRows.reduce(
    (sum, row) => sum + Math.max(0, finite(row.revenue)),
    0,
  );
  const pricingOpportunity = rows.reduce(
    (sum, row) =>
      sum + Math.max(0, finite(row.targetDelta)) * Math.max(0, finite(row.qty)),
    0,
  );

  const amounts: EconomicAmount[] = [
    {
      id: "product-losses",
      kind: "loss",
      periodAmount: lossForPeriod,
      monthlyAmount: monthly(lossForPeriod, days),
      affectedProductIds: losingRows.map((row) => row.productId),
    },
    {
      id: "missing-cogs-revenue",
      kind: "exposure",
      periodAmount: missingCostExposure,
      monthlyAmount: monthly(missingCostExposure, days),
      affectedProductIds: missingCostRows.map((row) => row.productId),
    },
    {
      id: "pricing-recovery",
      kind: "opportunity",
      periodAmount: pricingOpportunity,
      monthlyAmount: monthly(pricingOpportunity, days),
      affectedProductIds: rows
        .filter((row) => finite(row.targetDelta) > 0)
        .map((row) => row.productId),
    },
  ];

  const total = (kind: EconomicAmountKind) =>
    amounts
      .filter((amount) => amount.kind === kind)
      .reduce((sum, amount) => sum + Math.max(0, finite(amount.monthlyAmount)), 0);

  const netProductRevenue = finite(
    summary.netProductRevenue ?? summary.revenue,
  );
  const productCogs = finite(summary.productCogs ?? summary.cogs);
  const grossProductProfit = finite(summary.grossProfit ?? summary.profit);

  return {
    version: 1,
    periodDays: days,
    currencyCode,
    facts: {
      grossProductSales: finite(summary.grossProductSales),
      discounts: finite(summary.discounts),
      productRefunds: finite(summary.refundedProductRevenue ?? summary.refunds),
      netProductRevenue,
      productCogs,
      grossProductProfit,
      grossProductMarginPct: finite(
        summary.grossMarginPct ?? summary.marginPct,
        netProductRevenue > 0
          ? (grossProductProfit / netProductRevenue) * 100
          : 0,
      ),
      shippingRevenue: finite(summary.shippingRevenue ?? summary.shipping),
      reportedTaxes: finite(summary.taxes),
    },
    amounts,
    totals: {
      monthlyLoss: total("loss"),
      monthlyExposure: total("exposure"),
      monthlyOpportunity: total("opportunity"),
    },
    confidence: buildConfidence(summary, analysisContext),
  };
}

export function getEconomicAmount(
  snapshot: EconomicSnapshot,
  id: string,
) {
  return snapshot.amounts.find((amount) => amount.id === id) ?? null;
}