import { loadMarginDashboardData } from "~/utils/margin.server";
import { generateProfitAlerts } from "~/utils/profit-monitor";
import {
  createWeeklyReportDelivery,
  getNotificationPreferences,
} from "~/services/notification.server";

type WeeklyReportLanguage = "it" | "en";

function languageFromPreference(value: string | null | undefined): WeeklyReportLanguage {
  return value === "it" ? "it" : "en";
}

function datePartsInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);

  const year = Number(parts.find((part) => part.type === "year")?.value ?? 0);
  const month = Number(parts.find((part) => part.type === "month")?.value ?? 0);
  const day = Number(parts.find((part) => part.type === "day")?.value ?? 0);

  return { year, month, day };
}

function isoWeekKey(date: Date, timeZone: string) {
  const { year, month, day } = datePartsInTimeZone(date, timeZone);

  if (!year || !month || !day) {
    return date.toISOString().slice(0, 10);
  }

  const localDate = new Date(Date.UTC(year, month - 1, day));
  const dayNumber = localDate.getUTCDay() || 7;

  localDate.setUTCDate(localDate.getUTCDate() + 4 - dayNumber);

  const isoYear = localDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const weekNumber = Math.ceil(
    ((localDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );

  return `${isoYear}-W${String(weekNumber).padStart(2, "0")}`;
}

function reportPeriodLabel(language: WeeklyReportLanguage) {
  return language === "it"
    ? "Ultimi 7 giorni"
    : "Last 7 days";
}

function normalizeEconomicSnapshot(data: any) {
  const snapshot = data?.economicSnapshot;

  return {
    monthlyLoss:
      Number(snapshot?.totals?.monthlyLoss ?? 0),
    monthlyExposure:
      Number(snapshot?.totals?.monthlyExposure ?? 0),
    monthlyProfitGapToTarget:
      Number(snapshot?.totals?.monthlyOpportunity ?? 0),
  };
}

function buildTopAlerts(alerts: ReturnType<typeof generateProfitAlerts>) {
  return alerts
    .filter((alert) => alert.severity !== "info")
    .slice(0, 3)
    .map((alert) => ({
      title: alert.title,
      severity: alert.severity,
      description: alert.description,
      route: alert.route,
    }));
}

function buildNextActions(alerts: ReturnType<typeof generateProfitAlerts>) {
  return alerts
    .filter((alert) => alert.severity !== "info")
    .slice(0, 3)
    .map((alert) => ({
      title: alert.actionLabel,
      description: alert.title,
      route: alert.route,
      module: alert.recommendedModule,
    }));
}

export async function prepareWeeklyProfitReport({
  admin,
  session,
  now = new Date(),
}: {
  admin: any;
  session: any;
  now?: Date;
}) {
  const preferences = await getNotificationPreferences(session.shop);

  if (!preferences) {
    return {
      prepared: false as const,
      reason: "missing_preferences",
    };
  }

  if (!preferences.weeklyReportEnabled) {
    return {
      prepared: false as const,
      reason: "weekly_report_disabled",
    };
  }

  if (!preferences.recipientEmail) {
    return {
      prepared: false as const,
      reason: "missing_recipient",
    };
  }

  const language = languageFromPreference(preferences.language);
  const locale = language === "it" ? "it-IT" : "en-US";

  const data = await loadMarginDashboardData({
    admin,
    session,
    period: "7",
    locale,
  });

  const alerts = generateProfitAlerts({
    summary: data.summary,
    rows: data.rows,
    language,
    period: "7",
    currencyCode: data.currencyCode,
  });

  const economics = normalizeEconomicSnapshot(data);

  const alertCounts = {
    critical: alerts.filter((alert) => alert.severity === "critical").length,
    warning: alerts.filter((alert) => alert.severity === "warning").length,
    opportunity: alerts.filter((alert) => alert.severity === "opportunity").length,
  };

  const economicRevenue =
    data.summary.economicRevenue ?? data.summary.revenue;

  const economicProfit =
    data.summary.economicProfit ?? data.summary.profit;

  const economicMarginPct =
    data.summary.economicMarginPct ?? data.summary.marginPct;

  const timeZone =
    preferences.timezone?.trim() ||
    data.timeZone ||
    "UTC";

  const weekKey = isoWeekKey(now, timeZone);

  const payload = {
    source: "weekly-profit-report" as const,
    language,
    currencyCode: data.currencyCode,
    periodLabel: reportPeriodLabel(language),
    generatedAt: now.toISOString(),

    summary: {
      economicRevenue,
      economicProfit,
      economicMarginPct,
      revenueDeltaPct: data.summary.revenueDeltaPct,
      marginDelta: data.summary.marginDelta,
    },

    economics,

    alertCounts,

    topAlerts: buildTopAlerts(alerts),
    nextActions: buildNextActions(alerts),
  };

  const result = await createWeeklyReportDelivery({
    shop: session.shop,
    recipient: preferences.recipientEmail,
    weekKey,
    payload,
  });

  return {
    prepared: result.created,
    reason: result.created ? "created" : "already_prepared",
    weekKey,
    delivery: result.delivery,
  } as const;
}