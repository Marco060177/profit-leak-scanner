import type { Session } from "@shopify/shopify-api";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { loadMarginDashboardData } from "~/utils/margin.server";
import type { BillingStatus } from "~/utils/margin";

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function zonedParts(date: Date, timeZone: string): DateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

export function safeTimeZone(value: string | null | undefined) {
  const candidate = value?.trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: candidate }).format();
    return candidate;
  } catch {
    return "UTC";
  }
}

export function localMidnightUtc(
  dateOnly: string,
  timeZone: string,
) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const desired = Date.UTC(year, month - 1, day);
  let candidate = desired;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const local = zonedParts(new Date(candidate), timeZone);
    const represented = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
    );
    candidate += desired - represented;
  }
  return new Date(candidate);
}

export function shiftDateOnly(dateOnly: string, days: number) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

export function getProfitImpactWindow({
  now = new Date(),
  timeZone,
}: {
  now?: Date;
  timeZone: string | null | undefined;
}) {
  const normalizedTimeZone = safeTimeZone(timeZone);
  const local = zonedParts(now, normalizedTimeZone);
  const appliedDate = [
    String(local.year).padStart(4, "0"),
    String(local.month).padStart(2, "0"),
    String(local.day).padStart(2, "0"),
  ].join("-");
  const baselineStartDate = shiftDateOnly(appliedDate, -14);
  const measurementEndDate = shiftDateOnly(appliedDate, 14);
  return {
    timeZone: normalizedTimeZone,
    appliedDate,
    baselineStartDate,
    appliedAt: localMidnightUtc(appliedDate, normalizedTimeZone),
    baselineStart: localMidnightUtc(baselineStartDate, normalizedTimeZone),
    measurementEnd: localMidnightUtc(measurementEndDate, normalizedTimeZone),
  };
}

export async function captureProductProfitImpactBaseline({
  admin,
  session,
  productId,
  locale,
  billingStatus,
  now = new Date(),
}: {
  admin: AdminApiContext;
  session: Session;
  productId: string;
  locale: string;
  billingStatus: BillingStatus;
  now?: Date;
}) {
  const shopResponse = await admin.graphql(`
    #graphql
    query ProfitImpactShopContext {
      shop { ianaTimezone }
    }
  `);
  const shopJson: Awaited<ReturnType<typeof shopResponse.json>> & {
    errors?: unknown[];
  } = await shopResponse.json();
  if (shopJson?.errors?.length) {
    throw new Response("Unable to load store timezone.", { status: 502 });
  }
  const window = getProfitImpactWindow({
    now,
    timeZone: shopJson?.data?.shop?.ianaTimezone,
  });
  const data = await loadMarginDashboardData({
    admin,
    session,
    period: "14",
    locale,
    billingStatus,
    analysisEndDate: window.appliedDate,
  });
  const row = data.rows.find((candidate) => candidate.productId === productId);
  if (!row) {
    throw new Response("Product has no baseline data in the previous 14 complete days.", {
      status: 409,
    });
  }
  if (row.missingCost) {
    throw new Response(
      "Baseline cannot start while this product has incomplete COGS data.",
      { status: 409 },
    );
  }
  const revenue = row.economicRevenue ?? row.revenue;
  const cogs = row.economicCogs ?? row.cogs;
  const economicProfit = row.economicProfit ?? row.profit;
  const economicMarginPct = row.economicMarginPct ?? row.marginPct;
  const units = Math.max(0, row.qty);
  const confidence = data.economicSnapshot?.confidence;
  return {
    window,
    productTitle: row.productTitle,
    baseline: {
      windowStart: window.baselineStart,
      windowEnd: window.appliedAt,
      observedDays: 14,
      revenue,
      economicProfit,
      economicMarginPct,
      units,
      cogs,
      discounts: row.discounts,
      refunds: row.refunds,
      averageUnitRevenue: units > 0 ? revenue / units : null,
      averageUnitCost: units > 0 ? cogs / units : null,
      discountRatePct: row.discountRatePct ?? null,
      dataConfidenceScore: confidence?.score ?? 0,
      confidenceReasons: confidence?.reasons ?? [],
      sourceCompleteness: {
        cogsCoveragePct: confidence?.cogsCoveragePct ?? 0,
        sourceDataComplete: confidence?.sourceDataComplete ?? false,
        truncatedConnections:
          data.analysisContext?.dataCompleteness?.truncatedConnections ?? [],
        missingCost: row.missingCost,
        usesCurrentShopifyCosts: true,
        timeZone: window.timeZone,
        policy: "14_COMPLETE_LOCAL_DAYS_BEFORE_APPLICATION",
        grossProductSales: row.grossProductSales ?? null,
      },
    },
  };
}
