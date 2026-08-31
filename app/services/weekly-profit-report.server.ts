import type { Session } from "@shopify/shopify-api";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { loadMarginDashboardData } from "~/utils/margin.server";
import type { LoaderData } from "~/utils/margin";
import { generateProfitAlerts } from "~/utils/profit-monitor";
import {
  createWeeklyReportDelivery,
  getNotificationPreferences,
  normalizeNotificationLanguage,
  type NotificationLanguage,
} from "~/services/notification.server";
import { getLanguageLocale } from "~/utils/i18n";
import {
  getBillingStatus,
  hasGrowthAccess,
  hasStarterAccess,
} from "~/utils/billing.server";
import { buildWeeklyProfitImpactSummary } from "~/services/profit-impact-context.server";
import { listProfitImpactActionsForShop } from "~/services/profit-impact.server";

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

function reportPeriodLabel(language: NotificationLanguage) {
  return {
    en: "Last 7 days",
    it: "Ultimi 7 giorni",
    fr: "7 derniers jours",
    de: "Letzte 7 Tage",
    es: "Últimos 7 días",
    "pt-BR": "Últimos 7 dias",
  }[language];
}

function normalizeEconomicSnapshot(data: LoaderData) {
  const snapshot = data?.economicSnapshot;

  const lossAmount = snapshot?.amounts?.find(
    (amount) => amount?.id === "product-losses",
  );

  const exposureAmount = snapshot?.amounts?.find(
    (amount) => amount?.id === "missing-cogs-revenue",
  );

  const opportunityAmount = snapshot?.amounts?.find(
    (amount) => amount?.id === "pricing-recovery",
  );

  return {
    periodLoss: Number(lossAmount?.periodAmount ?? 0),
    periodExposure: Number(exposureAmount?.periodAmount ?? 0),
    periodProfitGapToTarget: Number(
      opportunityAmount?.periodAmount ?? 0,
    ),
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
      estimatedMinutes: alert.estimatedMinutes,
    }));
}

export async function prepareWeeklyProfitReport({
  admin,
  session,
  now = new Date(),
  deliveryMode = "scheduled",
}: {
  admin: AdminApiContext;
  session: Session;
  now?: Date;
  deliveryMode?: "scheduled" | "test";
}) {
  const billing = await getBillingStatus(admin);

  if (!hasStarterAccess(billing)) {
    return {
      prepared: false as const,
      reason: "starter_access_required",
    };
  }

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

  const language = normalizeNotificationLanguage(preferences.language);
  const locale = getLanguageLocale(language);
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
  const impact = hasGrowthAccess(billing)
    ? buildWeeklyProfitImpactSummary(await listProfitImpactActionsForShop({ shop: session.shop, take: 100 }), now)
    : null;

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
    profitImpact: impact?.relevant ? impact : null,
  };

  const result = await createWeeklyReportDelivery({
    shop: session.shop,
    recipient: preferences.recipientEmail,
    weekKey:
      deliveryMode === "test"
        ? `${weekKey}-${now.getTime()}`
        : weekKey,
    payload,
    deduplicationNamespace:
      deliveryMode === "test" ? "weekly-test" : "weekly",
  });

  const retried = "retried" in result && result.retried;

  return {
    prepared: result.created || retried,
    reason: result.created
      ? "created"
      : retried
        ? "retry_prepared"
        : "already_prepared",
    weekKey,
    delivery: result.delivery,
  } as const;
}
