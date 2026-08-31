import type { Session } from "@shopify/shopify-api";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import prisma from "~/db.server";
import {
  claimProfitImpactMeasurement,
  createImmutableProfitImpactMeasurement,
  getProfitImpactActionForShop,
  releaseProfitImpactMeasurementClaim,
} from "~/services/profit-impact.server";
import {
  localMidnightUtc,
  safeTimeZone,
  shiftDateOnly,
  zonedParts,
} from "~/services/profit-impact-baseline.server";
import { getBillingStatus, hasGrowthAccess } from "~/utils/billing.server";
import type { BillingStatus } from "~/utils/margin";
import { getLanguageLocale } from "~/utils/i18n";
import { loadMarginDashboardData } from "~/utils/margin.server";

export type PostMeasurementSnapshot = {
  revenue: number;
  economicProfit: number;
  economicMarginPct: number;
  units: number;
  cogs: number;
  discounts: number;
  refunds: number;
  averageUnitRevenue: number | null;
  averageUnitCost: number | null;
  discountRatePct: number | null;
  grossProductSales: number | null;
  dataConfidenceScore: number;
  confidenceReasons: string[];
  missingCogs: boolean;
  truncated: boolean;
  sourceCompleteness: Record<string, unknown>;
};

type BaselineLike = {
  observedDays: number;
  revenue: number;
  economicProfit: number;
  economicMarginPct: number;
  units: number;
  cogs: number;
  averageUnitRevenue: number | null;
  averageUnitCost: number | null;
  discountRatePct: number | null;
  sourceCompletenessJson: string | null;
};

function finite(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function parseJson(value: string | null) {
  if (!value) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function calculateMeasuredChanges({
  baseline,
  post,
}: {
  baseline: BaselineLike;
  post: PostMeasurementSnapshot;
}) {
  const baselineDays = Math.max(1, baseline.observedDays);
  const postDays = Math.max(1, post.sourceCompleteness.observedDays as number || 1);
  const normalized = (postValue: number, baselineValue: number) =>
    (postValue / postDays - baselineValue / baselineDays) * postDays;
  return {
    measuredProfitChange: normalized(post.economicProfit, baseline.economicProfit),
    measuredMarginChange: post.economicMarginPct - baseline.economicMarginPct,
    measuredRevenueChange: normalized(post.revenue, baseline.revenue),
    measuredUnitsChange: normalized(post.units, baseline.units),
    measuredCogsChange: normalized(post.cogs, baseline.cogs),
  };
}

export function calculateAttribution({
  actionType,
  previousValue,
  appliedValue,
  baseline,
  post,
  measuredProfitChange,
}: {
  actionType: string;
  previousValue: number | null;
  appliedValue: number | null;
  baseline: BaselineLike;
  post: PostMeasurementSnapshot;
  measuredProfitChange: number;
}) {
  const positiveProfit = Math.max(0, measuredProfitChange);
  if (actionType === "PRICE_CHANGE") {
    const priceComponent =
      (finite(post.averageUnitRevenue) - finite(baseline.averageUnitRevenue)) *
      post.units;
    const intentionalReduction =
      previousValue !== null && appliedValue !== null && appliedValue < previousValue;
    return {
      estimatedAttributableImpact: intentionalReduction
        ? 0
        : Math.min(positiveProfit, Math.max(0, priceComponent)),
      attributionMethod: "PRICE_COMPONENT_CAPPED_BY_MEASURED_PROFIT",
    };
  }
  if (actionType === "COGS_CHANGE") {
    const costComponent =
      (finite(baseline.averageUnitCost) - finite(post.averageUnitCost)) * post.units;
    return {
      estimatedAttributableImpact: Math.min(
        positiveProfit,
        Math.max(0, costComponent),
      ),
      attributionMethod: "COGS_COMPONENT_CAPPED_BY_MEASURED_PROFIT",
    };
  }
  if (actionType === "DISCOUNT_CHANGE") {
    const baselineCompleteness = parseJson(baseline.sourceCompletenessJson);
    const baselineGrossSales = baselineCompleteness.grossProductSales;
    if (
      baseline.discountRatePct !== null &&
      post.discountRatePct !== null &&
      typeof baselineGrossSales === "number" &&
      post.grossProductSales !== null
    ) {
      const discountComponent =
        ((baseline.discountRatePct - post.discountRatePct) / 100) *
        post.grossProductSales;
      return {
        estimatedAttributableImpact: Math.min(
          positiveProfit,
          Math.max(0, discountComponent),
        ),
        attributionMethod: "DISCOUNT_COMPONENT_CAPPED_BY_MEASURED_PROFIT",
      };
    }
  }
  return {
    estimatedAttributableImpact: null,
    attributionMethod: "NOT_ESTIMATED",
  };
}

export function calculateAttributionConfidence({
  actionType,
  dataConfidenceScore,
  observedDays,
  postUnits,
  baselineUnits,
  missingCogs,
  truncated,
  changeVerified,
  interference = false,
}: {
  actionType: string;
  dataConfidenceScore: number;
  observedDays: number;
  postUnits: number;
  baselineUnits: number;
  missingCogs: boolean;
  truncated: boolean;
  changeVerified: boolean;
  interference?: boolean;
}) {
  const reasons: string[] = [];
  const dataPoints = clamp(dataConfidenceScore, 0, 100) * 0.4;
  const durationPoints = observedDays >= 14 ? 15 : observedDays >= 7 ? 8 : 0;
  const volumePoints = postUnits >= 10 ? 15 : postUnits >= 5 ? 8 : postUnits > 0 ? 3 : 0;
  const stabilityPoints = baselineUnits >= 10 ? 10 : baselineUnits >= 5 ? 6 : baselineUnits > 0 ? 3 : 0;
  const isolationPoints = interference ? 0 : 15;
  const verificationPoints = changeVerified ? 5 : 0;
  let score = Math.round(
    dataPoints + durationPoints + volumePoints + stabilityPoints + isolationPoints + verificationPoints,
  );
  if (missingCogs) {
    score = Math.min(score, 39);
    reasons.push("COGS_INSUFFICIENT");
  }
  if (truncated) {
    score = Math.min(score, 49);
    reasons.push("CURRENT_PERIOD_TRUNCATED");
  }
  if (observedDays < 7) {
    score = Math.min(score, 49);
    reasons.push("LESS_THAN_7_OBSERVED_DAYS");
  }
  if (interference) {
    score = Math.min(score, 49);
    reasons.push("ACTION_INTERFERENCE");
  }
  if (actionType === "PRODUCT_ACTION" || actionType === "OTHER") {
    score = Math.min(score, 39);
    reasons.push("ATTRIBUTION_NOT_AUTOMATIC_FOR_ACTION_TYPE");
  }
  if (baselineUnits <= 0) {
    score = Math.min(score, 54);
    reasons.push("BASELINE_INSUFFICIENT");
  }
  if (postUnits < 10) reasons.push("LOW_POST_VOLUME");
  if (!changeVerified) reasons.push("CHANGE_NOT_VERIFIED");
  return {
    score: clamp(score, 0, 100),
    level: score >= 80 ? "HIGH" as const : score >= 55 ? "MEDIUM" as const : "LOW" as const,
    reasons,
    factors: {
      data: Math.round(dataPoints),
      duration: durationPoints,
      volume: volumePoints,
      baselineStability: stabilityPoints,
      actionIsolation: isolationPoints,
      changeVerification: verificationPoints,
    },
  };
}

function isChangeVerified({
  actionType,
  previousValue,
  appliedValue,
  baseline,
  post,
}: {
  actionType: string;
  previousValue: number | null;
  appliedValue: number | null;
  baseline: BaselineLike;
  post: PostMeasurementSnapshot;
}) {
  if (previousValue === null || appliedValue === null) return false;
  if (actionType === "PRICE_CHANGE") {
    const expected = Math.sign(appliedValue - previousValue);
    const observed = Math.sign(
      finite(post.averageUnitRevenue) - finite(baseline.averageUnitRevenue),
    );
    return expected !== 0 && expected === observed;
  }
  if (actionType === "COGS_CHANGE") {
    const expected = Math.sign(appliedValue - previousValue);
    const observed = Math.sign(
      finite(post.averageUnitCost) - finite(baseline.averageUnitCost),
    );
    return expected !== 0 && expected === observed;
  }
  return false;
}

function localDateOnly(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

async function capturePostSnapshot({
  admin,
  session,
  billing,
  productId,
  appliedAt,
  observedDays,
}: {
  admin: AdminApiContext;
  session: Session;
  billing: BillingStatus;
  productId: string;
  appliedAt: Date;
  observedDays: 7 | 14;
}) {
  const shopResponse = await admin.graphql(`
    #graphql
    query ProfitImpactMeasurementShopContext { shop { ianaTimezone } }
  `);
  const shopJson: Awaited<ReturnType<typeof shopResponse.json>> & {
    errors?: unknown[];
  } = await shopResponse.json();
  if (shopJson?.errors?.length) throw new Error("Unable to load store timezone.");
  const timeZone = safeTimeZone(shopJson?.data?.shop?.ianaTimezone);
  const startDate = localDateOnly(appliedAt, timeZone);
  const endDate = shiftDateOnly(startDate, observedDays);
  const data = await loadMarginDashboardData({
    admin,
    session,
    period: String(observedDays),
    locale: getLanguageLocale("en"),
    billingStatus: billing,
    analysisEndDate: endDate,
  });
  const row = data.rows.find((candidate) => candidate.productId === productId);
  const confidence = data.economicSnapshot?.confidence;
  const truncated =
    !(data.analysisContext?.dataCompleteness?.currentPeriodComplete ?? true);
  const post: PostMeasurementSnapshot = row
    ? {
      revenue: row.economicRevenue ?? row.revenue,
      economicProfit: row.economicProfit ?? row.profit,
      economicMarginPct: row.economicMarginPct ?? row.marginPct,
      units: Math.max(0, row.qty),
      cogs: row.economicCogs ?? row.cogs,
      discounts: row.discounts,
      refunds: row.refunds,
      averageUnitRevenue: row.qty > 0
        ? (row.economicRevenue ?? row.revenue) / row.qty
        : null,
      averageUnitCost: row.qty > 0
        ? (row.economicCogs ?? row.cogs) / row.qty
        : null,
      discountRatePct: row.discountRatePct ?? null,
      grossProductSales: row.grossProductSales ?? null,
      dataConfidenceScore: confidence?.score ?? 0,
      confidenceReasons: confidence?.reasons ?? [],
      missingCogs: row.missingCost,
      truncated,
      sourceCompleteness: {},
    }
    : {
      revenue: 0,
      economicProfit: 0,
      economicMarginPct: 0,
      units: 0,
      cogs: 0,
      discounts: 0,
      refunds: 0,
      averageUnitRevenue: null,
      averageUnitCost: null,
      discountRatePct: null,
      grossProductSales: null,
      dataConfidenceScore: 0,
      confidenceReasons: ["PRODUCT_NOT_OBSERVED_IN_WINDOW"],
      missingCogs: false,
      truncated,
      sourceCompleteness: {},
    };
  post.sourceCompleteness = {
    observedDays,
    timeZone,
    policy: `${observedDays}_COMPLETE_LOCAL_DAYS_AFTER_APPLICATION`,
    cogsCoveragePct: confidence?.cogsCoveragePct ?? 0,
    sourceDataComplete: confidence?.sourceDataComplete ?? false,
    truncatedConnections:
      data.analysisContext?.dataCompleteness?.truncatedConnections ?? [],
    missingCogs: post.missingCogs,
    grossProductSales: post.grossProductSales,
  };
  return {
    post,
    windowStart: localMidnightUtc(startDate, timeZone),
    windowEnd: localMidnightUtc(endDate, timeZone),
  };
}

export async function processProfitImpactMeasurement({
  admin,
  session,
  billing,
  actionId,
  measurementType,
  now = new Date(),
}: {
  admin: AdminApiContext;
  session: Session;
  billing: BillingStatus;
  actionId: string;
  measurementType: "PROVISIONAL_7D" | "FINAL_14D";
  now?: Date;
}) {
  const shop = session.shop;
  const claimed = await claimProfitImpactMeasurement({
    shop,
    actionId,
    measurementType,
    now,
  });
  if (!claimed) return { processed: false, reason: "not_claimed" as const };
  try {
    const action = await getProfitImpactActionForShop({ shop, actionId });
    if (!action || action.status !== "MEASURING" || !action.appliedAt || !action.productId) {
      await releaseProfitImpactMeasurementClaim({ shop, actionId, measurementType });
      return { processed: false, reason: "not_measurable" as const };
    }
    const baseline = action.measurements.find(
      (measurement) => measurement.measurementType === "BASELINE",
    );
    if (!baseline) throw new Error("MEASURING action is missing BASELINE.");
    const observedDays = measurementType === "PROVISIONAL_7D" ? 7 : 14;
    const captured = await capturePostSnapshot({
      admin,
      session,
      billing,
      productId: action.productId,
      appliedAt: action.appliedAt,
      observedDays,
    });
    const changes = calculateMeasuredChanges({ baseline, post: captured.post });
    const attribution = calculateAttribution({
      actionType: action.actionType,
      previousValue: action.previousValue,
      appliedValue: action.appliedValue,
      baseline,
      post: captured.post,
      measuredProfitChange: changes.measuredProfitChange,
    });
    const confidence = calculateAttributionConfidence({
      actionType: action.actionType,
      dataConfidenceScore: captured.post.dataConfidenceScore,
      observedDays,
      postUnits: captured.post.units,
      baselineUnits: baseline.units,
      missingCogs: captured.post.missingCogs,
      truncated: captured.post.truncated,
      changeVerified: isChangeVerified({
        actionType: action.actionType,
        previousValue: action.previousValue,
        appliedValue: action.appliedValue,
        baseline,
        post: captured.post,
      }),
    });
    const insufficient =
      measurementType === "FINAL_14D" &&
      (captured.post.units <= 0 || captured.post.missingCogs || captured.post.truncated);
    const measurement = await createImmutableProfitImpactMeasurement({
      shop,
      actionId,
      measurementType,
      windowStart: captured.windowStart,
      windowEnd: captured.windowEnd,
      observedDays,
      revenue: captured.post.revenue,
      economicProfit: captured.post.economicProfit,
      economicMarginPct: captured.post.economicMarginPct,
      units: captured.post.units,
      cogs: captured.post.cogs,
      discounts: captured.post.discounts,
      refunds: captured.post.refunds,
      averageUnitRevenue: captured.post.averageUnitRevenue,
      averageUnitCost: captured.post.averageUnitCost,
      discountRatePct: captured.post.discountRatePct,
      ...changes,
      ...attribution,
      dataConfidenceScore: captured.post.dataConfidenceScore,
      attributionConfidenceScore: confidence.score,
      confidenceLevel: confidence.level,
      confidenceReasons: [
        ...captured.post.confidenceReasons,
        ...confidence.reasons,
      ],
      sourceCompleteness: {
        ...captured.post.sourceCompleteness,
        attributionFactors: confidence.factors,
      },
      finalStatus: measurementType === "FINAL_14D"
        ? insufficient ? "INSUFFICIENT_DATA" : "COMPLETED"
        : undefined,
      eventSource: "measurement-engine",
      eventNote: insufficient ? "FINAL_14D_DATA_INSUFFICIENT" : null,
    });
    return { processed: true, measurement, insufficient };
  } catch (error) {
    await releaseProfitImpactMeasurementClaim({ shop, actionId, measurementType });
    throw error;
  }
}

export async function processDueProfitImpactMeasurements({
  now = new Date(),
  limit = 25,
}: {
  now?: Date;
  limit?: number;
} = {}) {
  const actions = await prisma.profitImpactAction.findMany({
    where: { status: "MEASURING", appliedAt: { not: null } },
    include: {
      measurements: {
        select: { measurementType: true, sourceCompletenessJson: true },
      },
    },
    orderBy: { measurementStart: "asc" },
    take: Math.max(1, Math.min(100, limit)),
  });
  let processed = 0;
  let skipped = 0;
  const errors: Array<{ actionId: string; message: string }> = [];
  const { unauthenticated } = await import("~/shopify.server");
  for (const action of actions) {
    try {
      const { admin, session } = await unauthenticated.admin(action.shop);
      const billing = await getBillingStatus(admin);
      if (!hasGrowthAccess(billing)) {
        skipped += 1;
        continue;
      }
      const existing = new Set(action.measurements.map((item) => item.measurementType));
      const baseline = action.measurements.find(
        (item) => item.measurementType === "BASELINE",
      );
      const baselineCompleteness = parseJson(baseline?.sourceCompletenessJson ?? null);
      const timeZone = safeTimeZone(
        typeof baselineCompleteness.timeZone === "string"
          ? baselineCompleteness.timeZone
          : "UTC",
      );
      const provisionalDueAt = action.appliedAt
        ? localMidnightUtc(
          shiftDateOnly(localDateOnly(action.appliedAt, timeZone), 7),
          timeZone,
        )
        : null;
      const provisionalDue = provisionalDueAt ? now >= provisionalDueAt : false;
      const finalDue = action.measurementEnd
        ? now >= action.measurementEnd
        : false;
      if (provisionalDue && !existing.has("PROVISIONAL_7D")) {
        const result = await processProfitImpactMeasurement({
          admin, session, billing, actionId: action.id,
          measurementType: "PROVISIONAL_7D", now,
        });
        if (result.processed) processed += 1;
      }
      if (finalDue && !existing.has("FINAL_14D")) {
        const result = await processProfitImpactMeasurement({
          admin, session, billing, actionId: action.id,
          measurementType: "FINAL_14D", now,
        });
        if (result.processed) processed += 1;
      }
    } catch (error) {
      errors.push({
        actionId: action.id,
        message: error instanceof Error ? error.message : "Unknown measurement error",
      });
    }
  }
  return { eligible: actions.length, processed, skipped, failed: errors.length, errors };
}
