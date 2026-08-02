import type {
  AnalysisContext,
  Row,
  Summary,
  TrendPoint,
} from "~/utils/margin";

export type EvidenceLevel = "limited" | "moderate" | "strong";
export type ComparisonQuality = "unavailable" | "limited" | "usable";
export type EconomicStatus =
  | "insufficient_data"
  | "healthy"
  | "monitor"
  | "at_risk"
  | "critical";
export type ObservedStatus =
  | "no_sales_observed"
  | "profitable_observed"
  | "margin_pressure_observed"
  | "incomplete_costs_observed"
  | "losses_observed";
export type AssessmentScope = "store_assessment" | "period_observation";
export type ActionReasonCode =
  | "REAL_LOSSES_OBSERVED"
  | "MATERIAL_MISSING_COSTS";
export type SignalKind = "risk" | "opportunity" | "information";
export type SignalSeverity = "critical" | "warning" | "info";

export type DecisionMetric = {
  key: string;
  value: number;
  unit: "money" | "percent" | "count" | "days";
};

export type DecisionSignal = {
  id: string;
  kind: SignalKind;
  severity: SignalSeverity;
  code:
    | "REAL_LOSSES"
    | "MISSING_COSTS"
    | "WEAK_MARGIN"
    | "MARGIN_DETERIORATION"
    | "HIGH_DISCOUNT_RATE"
    | "HIGH_REFUND_RATE"
    | "RISK_CONCENTRATION"
    | "PRICE_RECOVERY"
    | "LIMITED_EVIDENCE"
    | "COMPARISON_UNAVAILABLE";
  titleKey: string;
  explanationKey: string;
  affectedProductIds: string[];
  metrics: DecisionMetric[];
  impactAmount: number | null;
  priority: number;
};

export type EvidenceAssessment = {
  level: EvidenceLevel;
  score: number;
  reasons: string[];
  orderCount: number;
  productCount: number;
  activeDays: number;
  requestedDays: number;
  revenueCoveragePct: number;
};

export type ComparisonAssessment = {
  quality: ComparisonQuality;
  reasons: string[];
};

export type MarginAssessment = {
  version: 1;
  economicStatus: EconomicStatus;
  observedStatus: ObservedStatus;
  assessmentScope: AssessmentScope;
  evidence: EvidenceAssessment;
  comparison: ComparisonAssessment;
  healthScore: number | null;
  healthScoreAvailable: boolean;
  risks: DecisionSignal[];
  opportunities: DecisionSignal[];
  information: DecisionSignal[];
  primaryRisk: DecisionSignal | null;
  primaryOpportunity: DecisionSignal | null;
  requiresAction: boolean;
  actionReasonCodes: ActionReasonCode[];
  facts: {
    revenue: number;
    profit: number;
    marginPct: number;
    losingProductCount: number;
    missingCostProductCount: number;
    lowMarginProductCount: number;
    lossAmount: number;
  };
};

export type BuildMarginAssessmentInput = {
  summary: Summary;
  rows: Row[];
  trend?: TrendPoint[];
  analysisContext?: AnalysisContext;
};

const TARGET_MARGIN_PCT = 20;
const WEAK_MARGIN_PCT = 15;
const CRITICAL_MARGIN_PCT = 0;
const HIGH_DISCOUNT_RATE_PCT = 15;
const HIGH_REFUND_RATE_PCT = 10;
const MATERIAL_REVENUE_SHARE_PCT = 10;
const MATERIAL_LOSS_SHARE_PCT = 5;
const MATERIAL_DETERIORATION_POINTS = 3;

function finite(value: number | undefined | null, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function ratioPct(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function assessEvidence(
  summary: Summary,
  analysisContext?: AnalysisContext,
): EvidenceAssessment {
  const current = analysisContext?.current;
  const requestedDays = Math.max(1, finite(analysisContext?.requestedDays, 0));
  const orderCount = Math.max(0, finite(current?.orderCount));
  const productCount = Math.max(0, finite(current?.productCount));
  const activeDays = Math.max(0, finite(current?.activeDays));
  const revenueCoveragePct = clamp(
    finite(summary.revenueCoveragePct, summary.missingCostCount > 0 ? 0 : 100),
    0,
    100,
  );

  const reasons: string[] = [];
  let score = 0;

  if (!analysisContext) {
    reasons.push("ANALYSIS_CONTEXT_MISSING");
  } else {
    if (orderCount >= 30) score += 35;
    else if (orderCount >= 10) score += 26;
    else if (orderCount >= 3) score += 14;
    else if (orderCount > 0) score += 5;

    if (activeDays >= 30) score += 25;
    else if (activeDays >= 14) score += 20;
    else if (activeDays >= 5) score += 12;
    else if (activeDays > 0) score += 4;

    if (productCount >= 10) score += 15;
    else if (productCount >= 3) score += 10;
    else if (productCount > 0) score += 4;

    if (orderCount === 0) reasons.push("NO_ORDERS");
    else if (orderCount < 3) reasons.push("VERY_FEW_ORDERS");
    else if (orderCount < 10) reasons.push("FEW_ORDERS");

    if (activeDays <= 1) reasons.push("SINGLE_ACTIVE_DAY");
    else if (activeDays < Math.min(7, requestedDays)) {
      reasons.push("LOW_TIME_COVERAGE");
    }

    if (productCount <= 1 && orderCount > 0) {
      reasons.push("SINGLE_PRODUCT_OBSERVED");
    }
  }

  if (revenueCoveragePct >= 98) score += 25;
  else if (revenueCoveragePct >= 90) score += 20;
  else if (revenueCoveragePct >= 75) score += 10;
  else reasons.push("LOW_COGS_COVERAGE");

  score = clamp(Math.round(score), 0, 100);

  let level: EvidenceLevel = "limited";
  if (score >= 75 && orderCount >= 10 && activeDays >= 5) level = "strong";
  else if (score >= 45 && orderCount >= 3) level = "moderate";

  return {
    level,
    score,
    reasons: unique(reasons),
    orderCount,
    productCount,
    activeDays,
    requestedDays,
    revenueCoveragePct,
  };
}

function assessComparison(
  analysisContext: AnalysisContext | undefined,
  evidence: EvidenceAssessment,
): ComparisonAssessment {
  if (!analysisContext?.comparisonAvailable) {
    return { quality: "unavailable", reasons: ["PREVIOUS_PERIOD_HAS_NO_SALES"] };
  }

  const previous = analysisContext.previous;
  const reasons: string[] = [];
  const currentOrders = evidence.orderCount;
  const previousOrders = Math.max(0, finite(previous.orderCount));
  const currentDays = evidence.activeDays;
  const previousDays = Math.max(0, finite(previous.activeDays));

  if (currentOrders < 3 || previousOrders < 3) reasons.push("TOO_FEW_ORDERS");
  if (currentDays < 3 || previousDays < 3) reasons.push("TOO_FEW_ACTIVE_DAYS");

  const largerOrderCount = Math.max(currentOrders, previousOrders);
  if (
    largerOrderCount > 0 &&
    Math.min(currentOrders, previousOrders) / largerOrderCount < 0.25
  ) {
    reasons.push("ORDER_VOLUMES_NOT_COMPARABLE");
  }

  return {
    quality: reasons.length === 0 ? "usable" : "limited",
    reasons,
  };
}

function makeSignal(
  signal: Omit<DecisionSignal, "priority"> & { priority: number },
): DecisionSignal {
  return { ...signal, priority: clamp(Math.round(signal.priority), 0, 100) };
}

function sortSignals(signals: DecisionSignal[]) {
  return [...signals].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return (b.impactAmount ?? 0) - (a.impactAmount ?? 0);
  });
}

export function buildMarginAssessment({
  summary,
  rows,
  analysisContext,
}: BuildMarginAssessmentInput): MarginAssessment {
  const revenue = Math.max(0, finite(summary.netProductRevenue, summary.revenue));
  const profit = finite(summary.grossProfit, summary.profit);
  const marginPct = finite(summary.grossMarginPct, summary.marginPct);
  const discountRatePct = Math.max(0, finite(summary.discountRatePct));
  const refundRatePct = Math.max(0, finite(summary.refundRatePct));
  const evidence = assessEvidence(summary, analysisContext);
  const comparison = assessComparison(analysisContext, evidence);

  const losingRows = rows.filter(
    (row) => finite(row.grossProfit, row.profit) < 0,
  );
  const missingCostRows = rows.filter((row) => row.missingCost);
  const lowMarginRows = rows.filter((row) => {
    if (row.missingCost) return false;
    const rowProfit = finite(row.grossProfit, row.profit);
    const rowMargin = finite(row.grossMarginPct, row.marginPct);
    return rowProfit >= 0 && rowMargin < TARGET_MARGIN_PCT;
  });

  const lossAmount = losingRows.reduce(
    (total, row) => total + Math.abs(Math.min(0, finite(row.grossProfit, row.profit))),
    0,
  );
  const losingRevenue = Math.max(
    0,
    finite(
      summary.losingProductRevenue,
      losingRows.reduce(
        (total, row) => total + Math.max(0, finite(row.netProductRevenue, row.revenue)),
        0,
      ),
    ),
  );
  const missingCostRevenue = Math.max(
    0,
    finite(
      summary.missingCostRevenue,
      missingCostRows.reduce(
        (total, row) => total + Math.max(0, finite(row.netProductRevenue, row.revenue)),
        0,
      ),
    ),
  );
  const losingRevenueSharePct = ratioPct(losingRevenue, revenue);
  const missingCostRevenueSharePct = ratioPct(missingCostRevenue, revenue);
  const lossSharePct = ratioPct(lossAmount, revenue);

  const risks: DecisionSignal[] = [];
  const opportunities: DecisionSignal[] = [];
  const information: DecisionSignal[] = [];

  if (evidence.level === "limited") {
    information.push(
      makeSignal({
        id: "limited-evidence",
        kind: "information",
        severity: "info",
        code: "LIMITED_EVIDENCE",
        titleKey: "decision.limitedEvidence.title",
        explanationKey: "decision.limitedEvidence.explanation",
        affectedProductIds: [],
        metrics: [
          { key: "orders", value: evidence.orderCount, unit: "count" },
          { key: "activeDays", value: evidence.activeDays, unit: "days" },
          { key: "products", value: evidence.productCount, unit: "count" },
        ],
        impactAmount: null,
        priority: 100,
      }),
    );
  }

  if (comparison.quality === "unavailable") {
    information.push(
      makeSignal({
        id: "comparison-unavailable",
        kind: "information",
        severity: "info",
        code: "COMPARISON_UNAVAILABLE",
        titleKey: "decision.comparisonUnavailable.title",
        explanationKey: "decision.comparisonUnavailable.explanation",
        affectedProductIds: [],
        metrics: [],
        impactAmount: null,
        priority: 20,
      }),
    );
  }

  if (losingRows.length > 0) {
    const critical = lossSharePct >= MATERIAL_LOSS_SHARE_PCT;
    risks.push(
      makeSignal({
        id: "real-losses",
        kind: "risk",
        severity: critical ? "critical" : "warning",
        code: "REAL_LOSSES",
        titleKey: "decision.realLosses.title",
        explanationKey: "decision.realLosses.explanation",
        affectedProductIds: losingRows.map((row) => row.productId),
        metrics: [
          { key: "products", value: losingRows.length, unit: "count" },
          { key: "loss", value: lossAmount, unit: "money" },
          { key: "lossShare", value: lossSharePct, unit: "percent" },
        ],
        impactAmount: lossAmount,
        priority: critical ? 100 : 85,
      }),
    );
  }

  if (missingCostRows.length > 0) {
    const critical = missingCostRevenueSharePct >= 25;
    risks.push(
      makeSignal({
        id: "missing-costs",
        kind: "risk",
        severity: critical ? "critical" : "warning",
        code: "MISSING_COSTS",
        titleKey: "decision.missingCosts.title",
        explanationKey: "decision.missingCosts.explanation",
        affectedProductIds: missingCostRows.map((row) => row.productId),
        metrics: [
          { key: "products", value: missingCostRows.length, unit: "count" },
          { key: "revenue", value: missingCostRevenue, unit: "money" },
          {
            key: "revenueShare",
            value: missingCostRevenueSharePct,
            unit: "percent",
          },
        ],
        impactAmount: missingCostRevenue,
        priority: critical ? 95 : 75,
      }),
    );
  }

  if (revenue > 0 && marginPct < TARGET_MARGIN_PCT) {
    const critical =
      evidence.level !== "limited" && marginPct < CRITICAL_MARGIN_PCT;
    risks.push(
      makeSignal({
        id: "weak-margin",
        kind: "risk",
        severity: critical ? "critical" : "warning",
        code: "WEAK_MARGIN",
        titleKey: "decision.weakMargin.title",
        explanationKey: "decision.weakMargin.explanation",
        affectedProductIds: lowMarginRows.map((row) => row.productId),
        metrics: [
          { key: "margin", value: marginPct, unit: "percent" },
          { key: "target", value: TARGET_MARGIN_PCT, unit: "percent" },
          { key: "products", value: lowMarginRows.length, unit: "count" },
        ],
        impactAmount: null,
        priority:
          evidence.level === "limited"
            ? 35
            : marginPct < WEAK_MARGIN_PCT
              ? 80
              : 55,
      }),
    );
  }

  if (
    comparison.quality === "usable" &&
    finite(summary.marginDelta) <= -MATERIAL_DETERIORATION_POINTS
  ) {
    const deterioration = Math.abs(finite(summary.marginDelta));
    risks.push(
      makeSignal({
        id: "margin-deterioration",
        kind: "risk",
        severity: deterioration >= 10 ? "critical" : "warning",
        code: "MARGIN_DETERIORATION",
        titleKey: "decision.marginDeterioration.title",
        explanationKey: "decision.marginDeterioration.explanation",
        affectedProductIds: rows
          .filter((row) => finite(row.productMarginDelta) <= -MATERIAL_DETERIORATION_POINTS)
          .map((row) => row.productId),
        metrics: [
          { key: "marginDelta", value: finite(summary.marginDelta), unit: "percent" },
          {
            key: "previousMargin",
            value: finite(summary.previousMarginPct),
            unit: "percent",
          },
        ],
        impactAmount: null,
        priority: deterioration >= 10 ? 90 : 65,
      }),
    );
  }

  if (discountRatePct >= HIGH_DISCOUNT_RATE_PCT) {
    risks.push(
      makeSignal({
        id: "high-discount-rate",
        kind: "risk",
        severity: "warning",
        code: "HIGH_DISCOUNT_RATE",
        titleKey: "decision.highDiscountRate.title",
        explanationKey: "decision.highDiscountRate.explanation",
        affectedProductIds: rows
          .filter((row) => finite(row.discountRatePct) >= HIGH_DISCOUNT_RATE_PCT)
          .map((row) => row.productId),
        metrics: [
          { key: "discountRate", value: discountRatePct, unit: "percent" },
          { key: "discounts", value: finite(summary.discounts), unit: "money" },
        ],
        impactAmount: Math.max(0, finite(summary.discounts)),
        priority: 60,
      }),
    );
  }

  if (refundRatePct >= HIGH_REFUND_RATE_PCT) {
    risks.push(
      makeSignal({
        id: "high-refund-rate",
        kind: "risk",
        severity: "warning",
        code: "HIGH_REFUND_RATE",
        titleKey: "decision.highRefundRate.title",
        explanationKey: "decision.highRefundRate.explanation",
        affectedProductIds: rows
          .filter((row) => finite(row.refundRatePct) >= HIGH_REFUND_RATE_PCT)
          .map((row) => row.productId),
        metrics: [
          { key: "refundRate", value: refundRatePct, unit: "percent" },
          {
            key: "refunds",
            value: finite(summary.refundedProductRevenue, summary.refunds),
            unit: "money",
          },
        ],
        impactAmount: Math.max(
          0,
          finite(summary.refundedProductRevenue, summary.refunds),
        ),
        priority: 65,
      }),
    );
  }

  const highestRiskRevenueShare = rows.reduce(
    (highest, row) =>
      Math.max(
        highest,
        row.losing || row.lowMargin
          ? finite(
              row.revenueSharePct,
              ratioPct(finite(row.netProductRevenue, row.revenue), revenue),
            )
          : 0,
      ),
    0,
  );
  if (highestRiskRevenueShare >= 50 && rows.length > 1) {
    risks.push(
      makeSignal({
        id: "risk-concentration",
        kind: "risk",
        severity: "warning",
        code: "RISK_CONCENTRATION",
        titleKey: "decision.riskConcentration.title",
        explanationKey: "decision.riskConcentration.explanation",
        affectedProductIds: rows
          .filter(
            (row) =>
              (row.losing || row.lowMargin) &&
              finite(
                row.revenueSharePct,
                ratioPct(finite(row.netProductRevenue, row.revenue), revenue),
              ) >= 50,
          )
          .map((row) => row.productId),
        metrics: [
          {
            key: "revenueShare",
            value: highestRiskRevenueShare,
            unit: "percent",
          },
        ],
        impactAmount: null,
        priority: 58,
      }),
    );
  }

  const priceRecoveryRows = rows.filter(
    (row) =>
      !row.missingCost &&
      finite(row.grossProfit, row.profit) >= 0 &&
      finite(row.targetDelta) > 0 &&
      finite(row.netProductRevenue, row.revenue) > 0,
  );
  const theoreticalRecovery = priceRecoveryRows.reduce(
    (total, row) => total + finite(row.targetDelta) * Math.max(0, finite(row.netQuantity, row.qty)),
    0,
  );
  if (theoreticalRecovery > 0) {
    opportunities.push(
      makeSignal({
        id: "price-recovery",
        kind: "opportunity",
        severity: "info",
        code: "PRICE_RECOVERY",
        titleKey: "decision.priceRecovery.title",
        explanationKey: "decision.priceRecovery.explanation",
        affectedProductIds: priceRecoveryRows.map((row) => row.productId),
        metrics: [
          { key: "products", value: priceRecoveryRows.length, unit: "count" },
          {
            key: "theoreticalRecovery",
            value: theoreticalRecovery,
            unit: "money",
          },
        ],
        impactAmount: theoreticalRecovery,
        priority: 45,
      }),
    );
  }

  const sortedRisks = sortSignals(risks);
  const sortedOpportunities = sortSignals(opportunities);
  const sortedInformation = sortSignals(information);
  const scoreAvailable =
    evidence.level !== "limited" &&
    evidence.revenueCoveragePct >= 75 &&
    evidence.orderCount > 0;

  let healthScore: number | null = null;
  if (scoreAvailable) {
    let penalty = 0;
    penalty += clamp(lossSharePct * 2.5, 0, 40);
    penalty += clamp(missingCostRevenueSharePct * 0.35, 0, 25);
    penalty += clamp(Math.max(0, TARGET_MARGIN_PCT - marginPct) * 1.25, 0, 25);
    if (comparison.quality === "usable") {
      penalty += clamp(Math.max(0, -finite(summary.marginDelta)) * 0.8, 0, 15);
    }
    penalty += clamp(Math.max(0, discountRatePct - HIGH_DISCOUNT_RATE_PCT) * 0.4, 0, 8);
    penalty += clamp(Math.max(0, refundRatePct - HIGH_REFUND_RATE_PCT) * 0.5, 0, 10);
    healthScore = clamp(Math.round(100 - penalty), 0, 100);
  }

  let economicStatus: EconomicStatus = "insufficient_data";
  if (scoreAvailable && healthScore !== null) {
    if (profit < 0 || healthScore < 40) economicStatus = "critical";
    else if (healthScore < 60) economicStatus = "at_risk";
    else if (healthScore < 80 || sortedRisks.length > 0) economicStatus = "monitor";
    else economicStatus = "healthy";
  }

  const primaryRisk = sortedRisks[0] ?? null;
  let observedStatus: ObservedStatus;
  if (evidence.orderCount === 0 || revenue <= 0) {
    observedStatus = "no_sales_observed";
  } else if (losingRows.length > 0 || profit < 0) {
    observedStatus = "losses_observed";
  } else if (missingCostRows.length > 0) {
    observedStatus = "incomplete_costs_observed";
  } else if (marginPct < TARGET_MARGIN_PCT) {
    observedStatus = "margin_pressure_observed";
  } else {
    observedStatus = "profitable_observed";
  }

  const assessmentScope: AssessmentScope = scoreAvailable
    ? "store_assessment"
    : "period_observation";

  const actionReasonCodes: ActionReasonCode[] = [];
  if (losingRows.length > 0 && lossAmount > 0) {
    actionReasonCodes.push("REAL_LOSSES_OBSERVED");
  }
  if (
    missingCostRows.length > 0 &&
    missingCostRevenueSharePct >= MATERIAL_REVENUE_SHARE_PCT
  ) {
    actionReasonCodes.push("MATERIAL_MISSING_COSTS");
  }
  const requiresAction = actionReasonCodes.length > 0;

  return {
    version: 1,
    economicStatus,
    observedStatus,
    assessmentScope,
    evidence,
    comparison,
    healthScore,
    healthScoreAvailable: scoreAvailable,
    risks: sortedRisks,
    opportunities: sortedOpportunities,
    information: sortedInformation,
    primaryRisk,
    primaryOpportunity: sortedOpportunities[0] ?? null,
    requiresAction,
    actionReasonCodes,
    facts: {
      revenue,
      profit,
      marginPct,
      losingProductCount: losingRows.length,
      missingCostProductCount: missingCostRows.length,
      lowMarginProductCount: lowMarginRows.length,
      lossAmount,
    },
  };
}

export const marginDecisionPolicy = {
  targetMarginPct: TARGET_MARGIN_PCT,
  weakMarginPct: WEAK_MARGIN_PCT,
  highDiscountRatePct: HIGH_DISCOUNT_RATE_PCT,
  highRefundRatePct: HIGH_REFUND_RATE_PCT,
  materialRevenueSharePct: MATERIAL_REVENUE_SHARE_PCT,
  materialLossSharePct: MATERIAL_LOSS_SHARE_PCT,
  materialDeteriorationPoints: MATERIAL_DETERIORATION_POINTS,
} as const;