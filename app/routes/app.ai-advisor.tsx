import * as React from "react";
import { useFetcher, useLoaderData, useNavigate } from "react-router";

import prisma from "~/db.server";
import DashboardNav from "~/components/dashboard/DashboardNav";
import { useI18n } from "~/components/i18n/I18nProvider";
import BusinessPriorities from "~/components/dashboard/BusinessPriorities";
import MetricTooltip from "~/components/ui/MetricTooltip";
import {
  MetricCard,
  PremiumHero,
  PremiumPanel,
  StatusChip,
  VisualButton,
} from "~/components/ui/VisualSystem";
import {
  uiMoney as formatStoreMoney,
  pct as formatStorePercent,
} from "~/utils/margin";
import { generateProfitAlerts } from "~/utils/profit-monitor";
import { authenticate } from "~/shopify.server";
import { loadMarginDashboardData } from "~/utils/margin.server";
import { getBillingStatus, hasGrowthAccess } from "~/utils/billing.server";
import { createGrowthPreviewData } from "~/utils/growth-preview.server";
import { jsPDF } from "jspdf";
import {
  generateAiMarginAnalysis,
  generateAiAnswer,
} from "~/utils/openai.server";

import type { LoaderData } from "~/utils/margin";

import { getLanguageLocale, isLanguage, type Language } from "~/utils/i18n";
import { getRequestLanguage } from "~/utils/i18n.server";
import { getAiLanguageName } from "~/utils/ai-i18n";
import { loadProfitImpactContext } from "~/services/profit-impact-context.server";

import "~/styles/dashboard.css";
import "~/styles/ai-advisor-v2.css";

function downloadAiReportPdf(reportText: string, language: Language) {
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });
  const pdfCopy = {
    en: { title: "MarginLab - AI Report", page: "Page", of: "of" },
    it: { title: "MarginLab - Report AI", page: "Pagina", of: "di" },
    fr: { title: "MarginLab - Rapport IA", page: "Page", of: "sur" },
    de: { title: "MarginLab - KI-Bericht", page: "Seite", of: "von" },
    es: { title: "MarginLab - Informe de IA", page: "Página", of: "de" },
    "pt-BR": { title: "MarginLab - Relatório de IA", page: "Página", of: "de" },
  }[language];
  const title = pdfCopy.title;
  const pdfSafeText = reportText
    .trim()
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[•●]/g, "-")
    .replace(/→/g, "->");

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 18;
  const contentWidth = pageWidth - marginX * 2;
  const bodyStartY = 39;
  const bodyEndY = pageHeight - 18;
  const lineHeight = 5.4;
  const locale = getLanguageLocale(language);
  const reportDate = new Date().toLocaleDateString(locale, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const lines = pdf.splitTextToSize(pdfSafeText, contentWidth) as string[];
  const linesPerPage = Math.max(
    1,
    Math.floor((bodyEndY - bodyStartY) / lineHeight),
  );
  const totalPages = Math.max(1, Math.ceil(lines.length / linesPerPage));

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    if (pageIndex > 0) pdf.addPage();

    pdf.setFillColor(10, 15, 24);
    pdf.rect(0, 0, pageWidth, 31, "F");
    pdf.setTextColor(255, 122, 82);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text(title, marginX, 16);

    pdf.setTextColor(190, 198, 210);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(reportDate, marginX, 23);

    pdf.setTextColor(35, 42, 52);
    pdf.setFontSize(10.5);
    const pageLines = lines.slice(
      pageIndex * linesPerPage,
      (pageIndex + 1) * linesPerPage,
    );
    pdf.text(pageLines, marginX, bodyStartY, {
      lineHeightFactor: 1.45,
    });

    pdf.setDrawColor(225, 229, 235);
    pdf.line(marginX, pageHeight - 13, pageWidth - marginX, pageHeight - 13);
    pdf.setTextColor(120, 128, 140);
    pdf.setFontSize(8);
    pdf.text(
      `MarginLab · ${pdfCopy.page} ${pageIndex + 1} ${pdfCopy.of} ${totalPages}`,
      pageWidth - marginX,
      pageHeight - 8,
      { align: "right" },
    );
  }

  pdf.save(`marginlab-ai-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

type SelectedQuestion =
  | "profitRisk"
  | "marginPressure"
  | "priority"
  | "fastestImprovement"
  | "productPriorities"
  | "pricingOpportunity"
  | "hiddenCosts"
  | "growthOpportunity";

const MONTHLY_AI_LIMIT = 100;

function getUsageMonth(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}`;
}

function normalizePeriod(value: FormDataEntryValue | null) {
  const period = String(value ?? "30");
  return period === "7" || period === "90" ? period : "30";
}

function buildServerStoreSummary({
  dashboardData,
  assumptions,
  period,
  language,
}: {
  dashboardData: any;
  assumptions: any;
  period: string;
  language: Language;
}) {
  const { summary, rows, economicSnapshot } = dashboardData;

  const economicRevenue = summary.economicRevenue ?? summary.revenue;
  const economicCogs = summary.economicCogs ?? summary.cogs;
  const economicProfit = summary.economicProfit ?? summary.profit;
  const economicMarginPct = summary.economicMarginPct ?? summary.marginPct;

  const periodDays = Number(period);
  const fixedCostFactor = periodDays / 30;
  const modelConfigured = assumptions !== null;

  const monthlyAds = assumptions?.monthlyAds ?? 0;
  const monthlyShipping = assumptions?.monthlyShipping ?? 0;
  const monthlyOperating = assumptions?.monthlyOperating ?? 0;
  const paymentFeePct = assumptions?.paymentFeePct ?? 0;
  const transactionFeePct = assumptions?.transactionFeePct ?? 0;
  const taxReservePct = assumptions?.taxReservePct ?? 0;

  const proratedFixedCosts =
    (monthlyAds + monthlyShipping + monthlyOperating) * fixedCostFactor;
  const estimatedVariableCosts =
    economicRevenue *
    ((paymentFeePct + transactionFeePct + taxReservePct) / 100);
  const totalEstimatedCosts = proratedFixedCosts + estimatedVariableCosts;
  const estimatedNetProfit = modelConfigured
    ? economicProfit - totalEstimatedCosts
    : null;
  const estimatedNetMargin =
    modelConfigured && economicRevenue > 0
      ? ((estimatedNetProfit as number) / economicRevenue) * 100
      : null;

  const profitAlerts = generateProfitAlerts({
    summary,
    rows,
    language,
    period,
    currencyCode: economicSnapshot.currencyCode,
  });

  const products = [...rows]
    .map((row: any) => ({
      ...row,
      economicRevenue: row.economicRevenue ?? row.revenue,
      economicProfit: row.economicProfit ?? row.profit,
      economicMarginPct: row.economicMarginPct ?? row.marginPct,
    }))
    .sort((a: any, b: any) => a.economicProfit - b.economicProfit)
    .slice(0, 8)
    .map(
      (row: any) =>
        `${row.productTitle} | economic revenue ${row.economicRevenue} | economic profit ${row.economicProfit} | economic margin ${row.economicMarginPct}% | quantity ${row.qty} | missing cost ${row.missingCost ? "yes" : "no"}`,
    )
    .join("\n");

  return `
SERVER-VERIFIED MARGINLAB CONTEXT

Analysis period: ${periodDays} days
Economic revenue: ${economicRevenue}
Economic COGS: ${economicCogs}
Economic profit: ${economicProfit}
Economic margin: ${economicMarginPct}%
Previous gross margin: ${summary.previousMarginPct}
Margin change: ${summary.marginDelta}%
Revenue change: ${summary.revenueDeltaPct}%
Discounts: ${summary.discounts}
Refunds: ${summary.refunds}

OFFICIAL ECONOMIC SNAPSHOT

Currency: ${economicSnapshot.currencyCode}
Monthly loss: ${economicSnapshot.totals.monthlyLoss}
Monthly exposure: ${economicSnapshot.totals.monthlyExposure}
Monthly profit gap to target: ${economicSnapshot.totals.monthlyOpportunity}
These three amounts represent different economic meanings and must never be added together.
Loss is measured negative profit. Exposure is revenue whose profitability cannot be verified because cost data is missing. Opportunity represents an estimated profit gap or modeled improvement scenario, not realized or guaranteed recovered profit.

DATA CONFIDENCE

Score: ${economicSnapshot.confidence.score}/100
Level: ${economicSnapshot.confidence.level}
COGS coverage: ${economicSnapshot.confidence.cogsCoveragePct}%
Previous-period comparison available: ${economicSnapshot.confidence.comparisonAvailable ? "yes" : "no"}
Uses current Shopify costs for historical sales: yes
Tax basis: ${economicSnapshot.confidence.taxBasis}
Refund basis: ${economicSnapshot.confidence.refundBasis}
Confidence reasons: ${economicSnapshot.confidence.reasons.join(", ") || "none"}

BUSINESS MODEL

Configuration status: ${modelConfigured ? "configured" : "not configured"}
${
  modelConfigured
    ? `Monthly advertising: ${monthlyAds}
Monthly shipping: ${monthlyShipping}
Monthly operating costs: ${monthlyOperating}
Fixed costs prorated to ${periodDays} days: ${proratedFixedCosts}
Payment fee: ${paymentFeePct}%
Transaction fee: ${transactionFeePct}%
Business tax reserve: ${taxReservePct}%
Variable costs for the selected period: ${estimatedVariableCosts}
Estimated net profit for the selected period: ${estimatedNetProfit}
Estimated net margin for the selected period: ${estimatedNetMargin}%`
    : `Net profit is unavailable because Business Model Studio has not been configured.
Do not treat zero assumptions as real costs and do not claim that the store is profitable after operating costs.`
}

PROFIT MONITOR EVENTS

${
  profitAlerts
    .map(
      (alert: any, index: number) =>
        `${index + 1}. ${alert.severity} | economic kind: ${alert.economicKind} | ${alert.title} | action: ${alert.actionLabel} | destination: ${alert.route}`,
    )
    .join("\n") || "No active events."
}

PRODUCT DATA

${products || "No product data available."}
`;
}

export async function loader({ request }: { request: Request }) {
  const { admin, session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const period = url.searchParams.get("period") ?? "30";

  const language = getRequestLanguage(request);
  const locale = getLanguageLocale(language);

  const billing = await getBillingStatus(admin);
  const growthAccess = hasGrowthAccess(billing);

  const dashboardData = growthAccess
    ? await loadMarginDashboardData({
        admin,
        session,
        period,
        locale,
        billingStatus: billing,
      })
    : createGrowthPreviewData({ billing, period, shop: session.shop });

  const assumptions = growthAccess
    ? ((await prisma.profitAssumptions.findUnique({
        where: {
          shop: session.shop,
        },
      })) ?? null)
    : null;

  const month = getUsageMonth();
  const usage = growthAccess
    ? await prisma.aiUsage.findUnique({
        where: {
          shop_month: {
            shop: session.shop,
            month,
          },
        },
      })
    : null;

  return {
    ...dashboardData,
    billing,
    growthAccess,
    assumptions,
    aiUsage: {
      used: usage?.requests ?? 0,
      limit: MONTHLY_AI_LIMIT,
    },
  };
}

export async function action({ request }: { request: Request }) {
  const { admin, session } = await authenticate.admin(request);

  const billing = await getBillingStatus(admin);
  if (!hasGrowthAccess(billing)) {
    return {
      text: "",
      growthRequired: true,
    };
  }

  const formData = await request.formData();

  const intent = String(formData.get("intent") || "analysis");
  const period = normalizePeriod(formData.get("period"));

  const submittedLanguage = String(formData.get("language") || "en");

  const language: Language = isLanguage(submittedLanguage)
    ? submittedLanguage
    : "en";

  const locale = getLanguageLocale(language);
  const dashboardData = await loadMarginDashboardData({
    admin,
    session,
    period,
    locale,
    billingStatus: billing,
  });

  const assumptions =
    (await prisma.profitAssumptions.findUnique({
      where: { shop: session.shop },
    })) ?? null;

  const baseStoreSummary = buildServerStoreSummary({
    dashboardData,
    assumptions,
    period,
    language,
  });
  const profitImpact = await loadProfitImpactContext(session.shop);
  const storeSummary = `${baseStoreSummary}\n\n${profitImpact.aiContext}`;

  const month = getUsageMonth();
  const quotaResult = await prisma.$transaction(async (tx) => {
    const current = await tx.aiUsage.findUnique({
      where: {
        shop_month: {
          shop: session.shop,
          month,
        },
      },
    });

    if ((current?.requests ?? 0) >= MONTHLY_AI_LIMIT) {
      return false;
    }

    await tx.aiUsage.upsert({
      where: {
        shop_month: {
          shop: session.shop,
          month,
        },
      },
      create: {
        shop: session.shop,
        month,
        requests: 1,
      },
      update: {
        requests: {
          increment: 1,
        },
      },
    });

    return true;
  });

  if (!quotaResult) {
    return {
      text: {
        en: "You have reached the limit of 100 AI requests for this month. Your allowance will reset automatically next month.",
        it: "Hai raggiunto il limite di 100 richieste AI per questo mese. La quota si rinnoverà automaticamente il mese prossimo.",
        fr: "Vous avez atteint la limite de 100 requêtes IA pour ce mois-ci. Votre quota sera automatiquement réinitialisé le mois prochain.",
        de: "Sie haben das Limit von 100 KI-Anfragen für diesen Monat erreicht. Ihr Kontingent wird im nächsten Monat automatisch zurückgesetzt.",
        es: "Has alcanzado el límite de 100 solicitudes de IA de este mes. Tu cuota se restablecerá automáticamente el próximo mes.",
        "pt-BR":
          "Você atingiu o limite de 100 solicitações de IA deste mês. Sua cota será renovada automaticamente no próximo mês.",
      }[language],
      quotaExceeded: true,
    };
  }

  try {
    if (intent === "ask") {
      const question = String(formData.get("question") || "");

      const context = `
Current store profitability data and Profit Monitor events:

${storeSummary}

The user is asking a specific question.

Use Profit Monitor events as the primary source for:
- active risks
- business priorities
- recommended actions
- recovery opportunities

Do not contradict the severity, priority or recommended destination
of the supplied Profit Monitor events.

Use only the supplied store data.

Never describe profit gaps, target gaps, pricing gaps or modeled recovery amounts as "profit opportunity", "recoverable profit" or guaranteed profit.
Use "estimated profit gap to target", "estimated pricing gap to target" or "modeled scenario impact" as appropriate.
State that these amounts are estimates, not guaranteed recovered profit.

Do not generate a complete business analysis.
`;

      return await generateAiAnswer({
        question,
        context,
        language,
      });
    }

    const economicSnapshot = dashboardData.economicSnapshot;

    if (!economicSnapshot) {
      throw new Error("Economic Snapshot is not available.");
    }

    return await generateAiMarginAnalysis({
      storeSummary,
      language,
      economicSnapshot: {
        currencyCode: economicSnapshot.currencyCode,
        monthlyOpportunity: economicSnapshot.totals.monthlyOpportunity,
        confidenceScore: economicSnapshot.confidence.score,
        confidenceLevel: economicSnapshot.confidence.level,
        cogsCoveragePct: economicSnapshot.confidence.cogsCoveragePct,
      },
    });
  } catch (error) {
    await prisma.aiUsage.updateMany({
      where: {
        shop: session.shop,
        month,
        requests: { gt: 0 },
      },
      data: {
        requests: { decrement: 1 },
      },
    });

    throw error;
  }
}

export default function AiAdvisorPage() {
  const navigate = useNavigate();
  const { language, locale, messages, t } = useI18n();
  const copy = messages.aiAdvisorPage;

  const money = (value: number) =>
    formatStoreMoney(value, currencyCode, locale);

  const pct = (value: number) => formatStorePercent(value, locale);

  const aiFetcher = useFetcher<{
    text: string;
    quotaExceeded?: boolean;
    growthRequired?: boolean;
  }>();
  const askFetcher = useFetcher<{
    text: string;
    quotaExceeded?: boolean;
    growthRequired?: boolean;
  }>();

  const [question, setQuestion] = React.useState("");
  const [selectedQuestion, setSelectedQuestion] =
    React.useState<SelectedQuestion>("profitRisk");
  const [showAiReport, setShowAiReport] = React.useState(false);

  const {
    summary,
    rows,
    assumptions,
    period,
    currencyCode,
    aiUsage,
    growthAccess,
  } = useLoaderData() as LoaderData & {
    growthAccess: boolean;
    assumptions: {
      monthlyAds: number;
      monthlyShipping: number;
      monthlyOperating: number;
      paymentFeePct: number;
      transactionFeePct: number;
      taxReservePct: number;
    } | null;
    aiUsage: {
      used: number;
      limit: number;
    };
  };

  React.useEffect(() => {
    if (aiFetcher.data?.text) {
      setShowAiReport(true);
    }
  }, [aiFetcher.data]);

  const economicRevenue = summary.economicRevenue ?? summary.revenue;
  const economicCogs = summary.economicCogs ?? summary.cogs;
  const economicProfit = summary.economicProfit ?? summary.profit;
  const economicMarginPct = summary.economicMarginPct ?? summary.marginPct;

  const economicRows = React.useMemo(
    () =>
      rows.map((row) => {
        const rowRevenue = row.economicRevenue ?? row.revenue;
        const rowCogs = row.economicCogs ?? row.cogs;
        const rowProfit = row.economicProfit ?? row.profit;
        const rowMargin = row.economicMarginPct ?? row.marginPct;

        return {
          ...row,
          revenue: rowRevenue,
          cogs: rowCogs,
          profit: rowProfit,
          marginPct: rowMargin,
          losing: rowProfit < 0,
          lowMargin: rowMargin > 0 && rowMargin < 10,
        };
      }),
    [rows],
  );

  /*
  |--------------------------------------------------------------------------
  | PROFIT MONITOR
  |--------------------------------------------------------------------------
  |
  | Profit Monitor is the single source of truth for active business events.
  | Dashboard, Alert Center, Profit Copilot and Action Center must consume
  | the same events instead of recreating independent alert logic.
  |
  */

  const profitAlerts = React.useMemo(
    () =>
      generateProfitAlerts({
        summary,
        rows,
        language,
        period,
      }),
    [summary, rows, language, period],
  );

  const primaryProfitAlert = profitAlerts[0] ?? null;

  const activeRiskAlerts = React.useMemo(
    () =>
      profitAlerts.filter(
        (alert) =>
          alert.severity === "critical" || alert.severity === "warning",
      ),
    [profitAlerts],
  );

  const criticalAlerts = React.useMemo(
    () => profitAlerts.filter((alert) => alert.severity === "critical"),
    [profitAlerts],
  );

  const opportunityAlerts = React.useMemo(
    () => profitAlerts.filter((alert) => alert.severity === "opportunity"),
    [profitAlerts],
  );

  const missionAlert =
    profitAlerts.find((alert) => alert.severity === "critical") ??
    profitAlerts.find((alert) => alert.severity === "warning") ??
    profitAlerts.find((alert) => alert.severity === "opportunity") ??
    profitAlerts[0] ??
    null;

  /*
  |--------------------------------------------------------------------------
  | CORE PRODUCT DATA
  |--------------------------------------------------------------------------
  */

  const losingProducts = economicRows.filter((row) => row.losing);

  const missingCostProducts = rows.filter((row) => row.missingCost);

  const lowMarginProducts = economicRows.filter((row) => row.lowMargin);

  const topProfitLeak =
    economicRows.length > 0
      ? [...economicRows].sort((a, b) => a.profit - b.profit)[0]
      : undefined;

  const recoverableProfit = economicRows.reduce((sum, row) => {
    if (row.revenue <= 0 || row.marginPct >= 20) {
      return sum;
    }

    const targetProfit = row.revenue * 0.2;
    return sum + Math.max(0, targetProfit - row.profit);
  }, 0);

  /*
  |--------------------------------------------------------------------------
  | BUSINESS MODEL ASSUMPTIONS
  |--------------------------------------------------------------------------
  */

  const monthlyAds = assumptions?.monthlyAds ?? 0;
  const monthlyShipping = assumptions?.monthlyShipping ?? 0;
  const monthlyOperating = assumptions?.monthlyOperating ?? 0;
  const modelConfigured = assumptions !== null;
  const periodDays = Number(period);
  const fixedCostFactor = periodDays / 30;

  const paymentFeePct = assumptions?.paymentFeePct ?? 0;
  const transactionFeePct = assumptions?.transactionFeePct ?? 0;
  const taxReservePct = assumptions?.taxReservePct ?? 0;

  const estimatedPaymentFees = economicRevenue * (paymentFeePct / 100);

  const estimatedTransactionFees = economicRevenue * (transactionFeePct / 100);

  const estimatedTaxReserve = economicRevenue * (taxReservePct / 100);

  const totalEstimatedCosts =
    (monthlyAds + monthlyShipping + monthlyOperating) * fixedCostFactor +
    estimatedPaymentFees +
    estimatedTransactionFees +
    estimatedTaxReserve;

  const estimatedNetProfit = modelConfigured
    ? economicProfit - totalEstimatedCosts
    : 0;

  const estimatedNetMargin =
    modelConfigured && economicRevenue > 0
      ? (estimatedNetProfit / economicRevenue) * 100
      : 0;

  /*
  |--------------------------------------------------------------------------
  | STORE HEALTH
  |--------------------------------------------------------------------------
  |
  | Health and quality scores remain deterministic calculations.
  | They are measurements, not Profit Monitor events.
  |
  */

  const healthScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 -
          losingProducts.length * 15 -
          missingCostProducts.length * 10 -
          lowMarginProducts.length * 4,
      ),
    ),
  );

  const healthLabel =
    healthScore < 40
      ? copy.high_risk
      : healthScore < 70
        ? copy.moderate_risk
        : copy.healthy;

  const healthColor =
    healthScore < 40 ? "#ff6b4a" : healthScore < 70 ? "#f59e0b" : "#22c55e";

  /*
  |--------------------------------------------------------------------------
  | PRODUCT PRIORITIZATION
  |--------------------------------------------------------------------------
  */

  const prioritizedProducts = [...economicRows]
    .filter((row) => row.revenue > 0)
    .map((row) => {
      const recoverableOpportunity =
        row.revenue > 0 && row.marginPct < 20
          ? Math.max(0, row.revenue * 0.2 - row.profit)
          : 0;

      const priorityScore =
        recoverableOpportunity +
        Math.max(0, -row.profit) +
        (row.revenue * Math.max(0, 20 - row.marginPct)) / 100;

      return {
        ...row,
        recoverableOpportunity,
        priorityScore,
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 5);

  const topPriorityProducts = prioritizedProducts.slice(0, 3);

  const priorityImpact = topPriorityProducts.reduce(
    (sum, product) => sum + product.recoverableOpportunity,
    0,
  );

  const priorityConcentration =
    recoverableProfit > 0
      ? Math.min(100, (priorityImpact / recoverableProfit) * 100)
      : 0;

  /*
  |--------------------------------------------------------------------------
  | WEEKLY MISSION
  |--------------------------------------------------------------------------
  |
  | The mission now follows the highest-priority Profit Monitor event.
  |
  */

  const missionMinutes =
    5 +
    Math.min(20, missingCostProducts.length * 2) +
    Math.min(20, losingProducts.length * 4);

  const missionActions = Math.max(
    1,
    Math.min(
      3,
      criticalAlerts.length +
        (activeRiskAlerts.some((alert) => alert.severity === "warning")
          ? 1
          : 0) +
        (opportunityAlerts.length > 0 ? 1 : 0),
    ),
  );

  const weeklyReport = {
    title: missionAlert?.title ?? copy.continue_monitoring_store_profitability,

    recommendation:
      missionAlert?.actionLabel ??
      copy.review_risks_and_opportunities_regularly,

    route: missionAlert?.route ?? "/app/recommendations",
  };

  /*
  |--------------------------------------------------------------------------
  | EXECUTIVE BRIEF
  |--------------------------------------------------------------------------
  |
  | The brief starts from the primary Profit Monitor event.
  | It no longer independently decides which issue matters most.
  |
  */

  const executiveBrief = primaryProfitAlert
    ? `${primaryProfitAlert.title}. ${primaryProfitAlert.description}`
    : copy.profit_monitor_detected_no_urgent_risks;

  /*
  |--------------------------------------------------------------------------
  | DECISION FEED
  |--------------------------------------------------------------------------
  |
  | Every feed item now comes directly from Profit Monitor.
  |
  */

  const getDecisionFeedColor = (severity: string): string => {
    if (severity === "critical") return "#ff6b4a";
    if (severity === "warning") return "#f59e0b";
    if (severity === "opportunity") return "#22c55e";
    return "#38bdf8";
  };

  const getDecisionFeedWhen = (severity: string): string => {
    if (severity === "opportunity") {
      return copy.new_opportunity;
    }

    if (severity === "critical") {
      return copy.immediate_priority;
    }

    if (severity === "warning") {
      return copy.needs_review;
    }

    return copy.active_signal;
  };

  const decisionFeed = profitAlerts.slice(0, 5).map((alert) => ({
    when: getDecisionFeedWhen(alert.severity),
    title: alert.title,
    detail: alert.description,
    actionLabel: alert.actionLabel,
    route: alert.route,
    color: getDecisionFeedColor(alert.severity),
  }));

  /*
  |--------------------------------------------------------------------------
  | QUALITY SCORECARDS
  |--------------------------------------------------------------------------
  */

  const pricingScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 - losingProducts.length * 18 - lowMarginProducts.length * 5,
      ),
    ),
  );

  const dataQualityScore = Math.max(
    0,
    Math.min(100, Math.round(100 - missingCostProducts.length * 12)),
  );

  const profitQualityScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 -
          losingProducts.length * 16 -
          lowMarginProducts.length * 4 -
          (summary.refunds > 0 ? 6 : 0) -
          (summary.discounts > 0 ? 4 : 0),
      ),
    ),
  );

  const executionScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 -
          criticalAlerts.length * 16 -
          activeRiskAlerts.filter((alert) => alert.severity === "warning")
            .length *
            8 -
          (opportunityAlerts.length > 0 ? 5 : 0),
      ),
    ),
  );

  const scorecards = [
    {
      key: "health",
      label: copy.store_health,
      value: healthScore,
      color: healthColor,
    },
    {
      key: "profit",
      label: copy.profit_quality,
      value: profitQualityScore,
      color:
        profitQualityScore < 40
          ? "#ff6b4a"
          : profitQualityScore < 70
            ? "#f59e0b"
            : "#22c55e",
    },
    {
      key: "pricing",
      label: copy.pricing_efficiency,
      value: pricingScore,
      color:
        pricingScore < 40
          ? "#ff6b4a"
          : pricingScore < 70
            ? "#f59e0b"
            : "#22c55e",
    },
    {
      key: "data",
      label: copy.data_quality,
      value: dataQualityScore,
      color:
        dataQualityScore < 40
          ? "#ff6b4a"
          : dataQualityScore < 70
            ? "#f59e0b"
            : "#22c55e",
    },
    {
      key: "execution",
      label: copy.execution_readiness,
      value: executionScore,
      color:
        executionScore < 40
          ? "#ff6b4a"
          : executionScore < 70
            ? "#f59e0b"
            : "#22c55e",
    },
  ];

  /*
  |--------------------------------------------------------------------------
  | PROFIT MONITOR CONTEXT FOR AI
  |--------------------------------------------------------------------------
  */

  const profitMonitorContext =
    profitAlerts.length > 0
      ? profitAlerts
          .map(
            (alert, index) => `
EVENT ${index + 1}

Severity: ${alert.severity}
Title: ${alert.title}
Description: ${alert.description}
Recommended action: ${alert.actionLabel}
Destination module: ${alert.route}
`,
          )
          .join("\n")
      : "No active Profit Monitor events detected.";

  /*
  |--------------------------------------------------------------------------
  | AI PROMPT
  |--------------------------------------------------------------------------
  |
  | OpenAI explains and contextualizes deterministic MarginLab events.
  | It must not independently redefine their priority or severity.
  |
  */

  const aiPrompt = `
You are MarginLab AI Advisor.

Respond in ${getAiLanguageName(language)}.

Analyze this Shopify store profitability data.

Use only the supplied data.

Do not invent numbers.

Do not invent products.

Never translate product names.

PROFIT GAP LANGUAGE RULES

Never describe profit gaps, target gaps, pricing gaps or modeled recovery amounts as:
- profit opportunity
- recoverable profit
- guaranteed profit
- profit already available to recover

Use wording such as:
- estimated profit gap to target
- estimated pricing gap to target
- modeled scenario impact

Always make clear that these values are estimates based on current data and assumptions, not guaranteed recovered profit.

PROFIT MONITOR INSTRUCTIONS

Profit Monitor is MarginLab's deterministic intelligence engine.

Use the supplied Profit Monitor events as the primary source for:

- active business risks
- business priorities
- recommended actions
- recovery opportunities
- destination modules

Do not contradict:

- event severity
- event ranking
- recommended action
- destination module

Do not declare the store healthy when Profit Monitor reports a critical event.

Do not promote a lower-ranked issue above the primary Profit Monitor event
unless the supplied data clearly demonstrates a larger financial impact.

Your job is to explain, contextualize and prioritize the supplied events.

Your job is not to recreate the alert engine.

PROFIT MONITOR EVENTS

${profitMonitorContext}

STORE SUMMARY

Analysis period: ${period} days

Economic Revenue: ${economicRevenue}
Economic COGS: ${economicCogs}
Economic Profit: ${economicProfit}
Economic Margin: ${economicMarginPct}%

Previous Gross Margin: ${summary.previousMarginPct}
Margin Change: ${summary.marginDelta}%

Revenue Change: ${summary.revenueDeltaPct}%

Discounts: ${summary.discounts}
Refunds: ${summary.refunds}

Profit gap to 20% target: ${recoverableProfit}

ACTIVE PROFIT MONITOR COUNTS

Critical events: ${criticalAlerts.length}
Warning events: ${
    activeRiskAlerts.filter((alert) => alert.severity === "warning").length
  }
Opportunity events: ${opportunityAlerts.length}
Total active risks: ${activeRiskAlerts.length}

ESTIMATED NET PROFIT

Business Model Studio status: ${modelConfigured ? "configured" : "not configured"}
Fixed-cost period factor: ${fixedCostFactor}
Monthly advertising spend: ${monthlyAds}
Monthly shipping costs: ${monthlyShipping}
Monthly operating costs: ${monthlyOperating}

Payment processing fee percentage: ${paymentFeePct}%
Transaction fee percentage: ${transactionFeePct}%
Business tax reserve percentage: ${taxReservePct}%

Estimated payment fees: ${estimatedPaymentFees}
Estimated transaction fees: ${estimatedTransactionFees}
Estimated business tax reserve: ${estimatedTaxReserve}

Total estimated costs outside product costs: ${totalEstimatedCosts}

${
  modelConfigured
    ? `Estimated net profit: ${estimatedNetProfit}
Estimated net margin: ${estimatedNetMargin}%`
    : `Estimated net profit: unavailable
Estimated net margin: unavailable
Do not interpret missing assumptions as zero costs.`
}

PRODUCT RISKS

Products selling below cost: ${losingProducts.length}
Products with missing costs: ${missingCostProducts.length}
Low-margin products: ${lowMarginProducts.length}

Top profitability risk:
${topProfitLeak ? topProfitLeak.productTitle : "None"}

Top risk profit impact:
${topProfitLeak ? topProfitLeak.profit : "N/A"}

Top risk margin:
${topProfitLeak ? `${topProfitLeak.marginPct}%` : "N/A"}

TOP LOSING PRODUCTS

${
  [...losingProducts]
    .slice(0, 3)
    .map(
      (product) =>
        `${product.productTitle} | Revenue ${money(
          product.revenue,
        )} | Profit ${money(
          product.profit,
        )} | Margin ${pct(product.marginPct)}`,
    )
    .join("\n") || "None"
}

TOP LOW-MARGIN PRODUCTS

${
  [...lowMarginProducts]
    .slice(0, 3)
    .map(
      (product) =>
        `${product.productTitle} | Revenue ${money(
          product.revenue,
        )} | Profit ${money(
          product.profit,
        )} | Margin ${pct(product.marginPct)}`,
    )
    .join("\n") || "None"
}

TOP RECOVERY OPPORTUNITIES

${
  [...prioritizedProducts]
    .filter((row) => row.recoverableOpportunity > 0)
    .slice(0, 3)
    .map(
      (product) =>
        `${product.productTitle} | Economic Revenue ${money(
          product.revenue,
        )} | Economic Margin ${pct(
          product.marginPct,
        )} | Profit Gap to Target ${money(product.recoverableOpportunity)}`,
    )
    .join("\n") || "None"
}

PRIORITIZED PRODUCTS

${
  prioritizedProducts.length > 0
    ? prioritizedProducts
        .map(
          (product, index) => `
PRIORITY ${index + 1}

Product: ${product.productTitle}
Economic revenue: ${product.revenue}
Quantity sold: ${product.qty}
Economic profit: ${product.profit}
Economic margin: ${product.marginPct}%
Average price: ${product.avgPrice}
Average cost: ${product.avgCost}
Target price: ${product.targetPrice}
Price adjustment needed: ${product.targetDelta}
Profit gap to 20% target: ${product.recoverableOpportunity}
Selling below cost: ${product.losing ? "Yes" : "No"}
Missing cost: ${product.missingCost ? "Yes" : "No"}
Low margin: ${product.lowMargin ? "Yes" : "No"}
`,
        )
        .join("\n")
    : "No product data available."
}

TASK

Act like a profitability consultant reviewing a Shopify business.

Start from the primary Profit Monitor event.

Your objective is not to repeat metrics.

Your objective is to explain:

- why the primary Profit Monitor event matters
- whether the store is profitable after estimated operating assumptions
- what is creating profitability pressure
- what should be reviewed first
- where the biggest estimated profit gap to target exists
- which MarginLab module should be opened next

When recommending a destination:

- Products is used for missing cost data and individual product review.
- Profit Intelligence is used for margin trends, deterioration, discounts and refunds.
- Recovery Simulator is used to test pricing and recovery scenarios.
- Profit Action Center is used to execute prioritized actions.
- Business Model Studio is used to review operating assumptions.
- Profit Forecast is used to evaluate future profitability scenarios.

When the merchant asks which products should be reviewed first:

- Use the prioritized product list.
- Rank products by business impact.
- Explain why each product is a priority.
- Mention economic revenue, economic margin and profit gap when available.
- Recommend one clear action for each product.
- Give greater priority to high-revenue products with weak margins.
- Give greater priority to products selling below cost.
- Clearly identify missing product costs.
- Do not recommend a large price increase without also suggesting a cost review.

Rules:

- Do not invent numbers.
- Do not invent products.
- Use only supplied data.
- Be concise.
- Use short bullet points.
- Prioritize actions by business impact.
- Mention estimated net profit when assumptions are provided.
- Mention estimated net margin when assumptions are provided.
- Mention the primary Profit Monitor event first.
- Mention the most important product risks.
- Mention profit gaps and pricing scenarios without presenting them as guaranteed recovered profit.
- Never use "profit opportunity" or "recoverable profit" for a modeled target gap.
- Prefer "estimated profit gap to target" and "modeled scenario impact".
- Do not contradict Profit Monitor.
`;

  /*
  |--------------------------------------------------------------------------
  | DYNAMIC COPILOT QUESTIONS
  |--------------------------------------------------------------------------
  */

  const dynamicQuestions = [
    {
      id: "profitRisk",
      label: primaryProfitAlert
        ? language === "it"
          ? `Perché “${primaryProfitAlert.title}” è la priorità principale?`
          : `Why is “${primaryProfitAlert.title}” the main priority?`
        : language === "it"
          ? "Qual è il rischio principale per il mio profitto?"
          : "What is the main risk to my profit?",
    },
    {
      id: "marginPressure",
      label:
        summary.refunds > 0
          ? language === "it"
            ? "Quanto stanno incidendo i rimborsi?"
            : "How much are refunds affecting profit?"
          : language === "it"
            ? "Cosa sta riducendo i miei margini?"
            : "What is hurting my margin?",
    },
    {
      id: "priority",
      label: missionAlert
        ? language === "it"
          ? `Perché devo intervenire prima su “${missionAlert.title}”?`
          : `Why should I address “${missionAlert.title}” first?`
        : language === "it"
          ? "Cosa dovrei controllare per prima cosa?"
          : "What should I check first?",
    },
    {
      id: "fastestImprovement",
      label:
        recoverableProfit > 0
          ? language === "it"
            ? "Come posso ridurre questo gap di profitto?"
            : "How can I reduce this profit gap?"
          : language === "it"
            ? "Qual è il modo più rapido per migliorare?"
            : "What would improve profit fastest?",
    },
    {
      id: "productPriorities",
      label:
        language === "it"
          ? "Quali prodotti devo sistemare per primi?"
          : "Which products should I fix first?",
    },
    {
      id: "pricingOpportunity",
      label:
        language === "it"
          ? "Qual è il maggiore gap di prezzo verso il target?"
          : "What is the largest pricing gap to target?",
    },
    {
      id: "hiddenCosts",
      label:
        language === "it"
          ? "Qual è il costo nascosto più importante?"
          : "What is my biggest hidden cost?",
    },
    {
      id: "growthOpportunity",
      label:
        language === "it"
          ? "Dove posso aumentare il profitto più rapidamente?"
          : "Where can I increase profit the fastest?",
    },
  ];

  const visibleQuestions = dynamicQuestions.map((question) => ({
    ...question,
    promptText: question.label,
    displayLabel:
      language === "fr"
        ? (
            {
              profitRisk: primaryProfitAlert
                ? `Pourquoi « ${primaryProfitAlert.title} » est-elle la priorité principale ?`
                : "Quel est le principal risque pour mon bénéfice ?",
              marginPressure:
                summary.refunds > 0
                  ? "Dans quelle mesure les remboursements affectent-ils le bénéfice ?"
                  : "Qu'est-ce qui réduit ma marge ?",
              priority: missionAlert
                ? `Pourquoi dois-je traiter « ${missionAlert.title} » en priorité ?`
                : "Que dois-je vérifier en premier ?",
              fastestImprovement:
                recoverableProfit > 0
                  ? "Comment puis-je réduire cet écart de bénéfice ?"
                  : "Quelle action améliorerait le bénéfice le plus rapidement ?",
              productPriorities: "Quels produits dois-je corriger en premier ?",
              pricingOpportunity:
                "Quel est le plus grand écart de prix par rapport à l'objectif ?",
              hiddenCosts: "Quel est mon principal coût caché ?",
              growthOpportunity:
                "Où puis-je augmenter le bénéfice le plus rapidement ?",
            } as Record<string, string>
          )[question.id]
        : language === "de"
          ? (
              {
                profitRisk: primaryProfitAlert
                  ? `Warum hat „${primaryProfitAlert.title}“ die höchste Priorität?`
                  : "Was ist das größte Risiko für meinen Gewinn?",
                marginPressure:
                  summary.refunds > 0
                    ? "Wie stark belasten Erstattungen meinen Gewinn?"
                    : "Was verringert meine Marge?",
                priority: missionAlert
                  ? `Warum sollte ich „${missionAlert.title}“ zuerst bearbeiten?`
                  : "Was sollte ich zuerst prüfen?",
                fastestImprovement:
                  recoverableProfit > 0
                    ? "Wie kann ich diese Gewinnlücke verringern?"
                    : "Welche Maßnahme verbessert den Gewinn am schnellsten?",
                productPriorities:
                  "Welche Produkte sollte ich zuerst korrigieren?",
                pricingOpportunity:
                  "Wo besteht die größte Preislücke zum Zielwert?",
                hiddenCosts: "Was sind meine größten versteckten Kosten?",
                growthOpportunity:
                  "Wo kann ich den Gewinn am schnellsten steigern?",
              } as Record<string, string>
            )[question.id]
          : language === "es"
            ? (
                {
                  profitRisk: primaryProfitAlert
                    ? `¿Por qué «${primaryProfitAlert.title}» es la prioridad principal?`
                    : "¿Cuál es el principal riesgo para mi beneficio?",
                  marginPressure:
                    summary.refunds > 0
                      ? "¿Cuánto afectan los reembolsos al beneficio?"
                      : "¿Qué está reduciendo mi margen?",
                  priority: missionAlert
                    ? `¿Por qué debo abordar primero «${missionAlert.title}»?`
                    : "¿Qué debería revisar primero?",
                  fastestImprovement:
                    recoverableProfit > 0
                      ? "¿Cómo puedo reducir esta diferencia de beneficio?"
                      : "¿Qué acción mejoraría el beneficio más rápidamente?",
                  productPriorities: "¿Qué productos debo corregir primero?",
                  pricingOpportunity:
                    "¿Cuál es la mayor diferencia de precio respecto al objetivo?",
                  hiddenCosts: "¿Cuál es mi mayor coste oculto?",
                  growthOpportunity:
                    "¿Dónde puedo aumentar el beneficio más rápidamente?",
                } as Record<string, string>
              )[question.id]
            : language === "pt-BR"
              ? (
                  {
                    profitRisk: primaryProfitAlert
                      ? `Por que “${primaryProfitAlert.title}” é a principal prioridade?`
                      : "Qual é o principal risco para o meu lucro?",
                    marginPressure:
                      summary.refunds > 0
                        ? "Quanto os reembolsos estão afetando o lucro?"
                        : "O que está reduzindo minha margem?",
                    priority: missionAlert
                      ? `Por que devo tratar “${missionAlert.title}” primeiro?`
                      : "O que devo revisar primeiro?",
                    fastestImprovement:
                      recoverableProfit > 0
                        ? "Como posso reduzir essa diferença de lucro?"
                        : "Qual ação melhoraria o lucro mais rapidamente?",
                    productPriorities: "Quais produtos devo corrigir primeiro?",
                    pricingOpportunity:
                      "Qual é a maior diferença de preço em relação à meta?",
                    hiddenCosts: "Qual é o meu maior custo oculto?",
                    growthOpportunity:
                      "Onde posso aumentar o lucro mais rapidamente?",
                  } as Record<string, string>
                )[question.id]
              : question.label,
  }));

  return (
    <div className="dashboard-shell advisor-v2-page">
      <div className="dashboard-container">
        <DashboardNav active="ai-advisor" navigate={navigate} />

        <PremiumHero
          className="advisor-v2-hero"
          tone="orange"
          eyebrow={copy.profit_copilot}
          title={copy.your_store_briefing_already_prepared}
          description={
            copy.marginlab_automatically_analyzes_profitability_risk_opportunities
          }
          actions={
            <>
              <StatusChip
                tone={growthAccess ? "green" : "orange"}
                pulse={growthAccess}
              >
                {growthAccess ? copy.growth_plan_active : copy.growth_feature}
              </StatusChip>
              <StatusChip tone="green">
                {copy.tax_aware_economic_basis}
              </StatusChip>
              {!growthAccess && (
                <VisualButton onClick={() => navigate("/app/billing")}>
                  {copy.unlock_growth}
                </VisualButton>
              )}
            </>
          }
          visual={
            <div className="advisor-v2-hero-health">
              <div
                className="advisor-v2-hero-health-ring"
                style={{
                  background: `conic-gradient(${healthColor} ${
                    healthScore * 3.6
                  }deg, rgba(255,255,255,0.08) 0deg)`,
                  boxShadow: `0 0 54px ${healthColor}22`,
                }}
              >
                <div className="advisor-v2-hero-health-core">
                  <div className="advisor-v2-hero-health-score">
                    {healthScore}
                  </div>
                  <div
                    className="advisor-v2-hero-health-label"
                    style={{ color: healthColor }}
                  >
                    <span>{copy.store_health_2}</span>
                    <MetricTooltip
                      content={{
                        title: copy.store_health_3,
                        description: copy.a_0_100_score_summarizing_the,
                        note: copy.it_considers_loss_making_products_missing,
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="advisor-v2-hero-health-status">{healthLabel}</div>
              <div className="advisor-v2-hero-health-detail">
                {copy.updated_from_current_store_data}
              </div>
            </div>
          }
        />

        <div
          style={{
            position: "relative",
            ...(growthAccess ? {} : { overflow: "hidden", borderRadius: 30 }),
          }}
        >
          {!growthAccess && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 80,
                display: "grid",
                placeItems: "start center",
                paddingTop: 140,
                background:
                  "linear-gradient(180deg, rgba(5,9,16,0.24), rgba(5,9,16,0.78) 22%, rgba(5,9,16,0.93))",
                backdropFilter: "blur(2px)",
              }}
            >
              <div
                style={{
                  width: "min(580px, calc(100% - 40px))",
                  padding: 28,
                  borderRadius: 24,
                  textAlign: "center",
                  background:
                    "linear-gradient(180deg, rgba(17,24,39,0.99), rgba(7,12,21,0.99))",
                  border: "1px solid rgba(255,115,60,0.30)",
                  boxShadow: "0 24px 70px rgba(0,0,0,0.44)",
                }}
              >
                <div
                  style={{
                    color: "#ff9a70",
                    fontSize: 11,
                    fontWeight: 950,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  {copy.growth_feature_2}
                </div>

                <div
                  style={{
                    marginTop: 10,
                    color: "#f8fafc",
                    fontSize: 25,
                    lineHeight: 1.25,
                    fontWeight: 950,
                  }}
                >
                  {copy.profit_copilot_is_included_with_growth}
                </div>

                <div
                  style={{
                    marginTop: 10,
                    color: "rgba(255,255,255,0.62)",
                    fontSize: 13,
                    lineHeight: 1.65,
                    fontWeight: 750,
                  }}
                >
                  {copy.upgrade_to_growth_for_ai_briefings}
                </div>

                <button
                  type="button"
                  className="primary-button"
                  onClick={() => navigate("/app/billing")}
                  style={{ marginTop: 18 }}
                >
                  {copy.unlock_growth}
                </button>
              </div>
            </div>
          )}

          <div
            aria-hidden={!growthAccess}
            style={
              growthAccess
                ? undefined
                : {
                    pointerEvents: "none",
                    userSelect: "none",
                    opacity: 0.5,
                  }
            }
          >
            <PremiumPanel
              className="advisor-v2-executive"
              tone={
                criticalAlerts.length > 0
                  ? "red"
                  : activeRiskAlerts.length > 0
                    ? "amber"
                    : "green"
              }
              style={{
                borderRadius: 30,
                padding: 28,
                background:
                  "radial-gradient(circle at 12% 14%, rgba(255,115,80,0.14), transparent 30%), radial-gradient(circle at 88% 18%, rgba(34,197,94,0.13), transparent 32%), linear-gradient(135deg, rgba(15,23,36,0.99), rgba(6,11,20,0.99))",
                border: "1px solid rgba(255,115,60,0.22)",
                boxShadow:
                  "0 28px 90px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.03)",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr)",
                  gap: 28,
                  alignItems: "stretch",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 950,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "#ff9a70",
                    }}
                  >
                    {copy.executive_brief}
                  </div>

                  <div
                    style={{
                      marginTop: 14,
                      color: "#f8fafc",
                      fontSize: 27,
                      fontWeight: 950,
                      lineHeight: 1.2,
                      letterSpacing: "-0.035em",
                      maxWidth: 760,
                    }}
                  >
                    {executiveBrief}
                  </div>

                  {primaryProfitAlert && (
                    <div
                      style={{
                        marginTop: 18,
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <div
                        style={{
                          padding: "7px 11px",
                          borderRadius: 999,
                          color:
                            primaryProfitAlert.severity === "critical"
                              ? "#ff8a6b"
                              : primaryProfitAlert.severity === "warning"
                                ? "#fbbf24"
                                : primaryProfitAlert.severity === "opportunity"
                                  ? "#4ade80"
                                  : "#7dd3fc",
                          background:
                            primaryProfitAlert.severity === "critical"
                              ? "rgba(255,107,74,0.10)"
                              : primaryProfitAlert.severity === "warning"
                                ? "rgba(245,158,11,0.10)"
                                : primaryProfitAlert.severity === "opportunity"
                                  ? "rgba(34,197,94,0.10)"
                                  : "rgba(56,189,248,0.10)",
                          border:
                            primaryProfitAlert.severity === "critical"
                              ? "1px solid rgba(255,107,74,0.24)"
                              : primaryProfitAlert.severity === "warning"
                                ? "1px solid rgba(245,158,11,0.24)"
                                : primaryProfitAlert.severity === "opportunity"
                                  ? "1px solid rgba(34,197,94,0.24)"
                                  : "1px solid rgba(56,189,248,0.24)",
                          fontSize: 9,
                          fontWeight: 950,
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                        }}
                      >
                        {primaryProfitAlert.severity === "critical"
                          ? copy.critical_priority
                          : primaryProfitAlert.severity === "warning"
                            ? copy.priority_to_review
                            : primaryProfitAlert.severity === "opportunity"
                              ? copy.opportunity_detected
                              : copy.profit_monitor_signal}
                      </div>

                      <div
                        style={{
                          color: "rgba(255,255,255,0.48)",
                          fontSize: 11,
                          fontWeight: 750,
                        }}
                      >
                        {copy.priority_determined_by_profit_monitor}
                      </div>
                    </div>
                  )}

                  <div
                    style={{
                      marginTop: 22,
                      display: "grid",
                      gridTemplateColumns: "repeat(4,minmax(0,1fr))",
                      gap: 12,
                    }}
                  >
                    {[
                      {
                        label: copy.estimated_net_profit,
                        value: modelConfigured
                          ? money(estimatedNetProfit)
                          : copy.not_configured,
                        note: modelConfigured
                          ? pct(estimatedNetMargin)
                          : "Business Model Studio",
                        color: !modelConfigured
                          ? "#f59e0b"
                          : estimatedNetProfit >= 0
                            ? "#22c55e"
                            : "#ff6b4a",
                        tone: !modelConfigured
                          ? ("amber" as const)
                          : estimatedNetProfit >= 0
                            ? ("green" as const)
                            : ("red" as const),

                        tooltip: {
                          title: copy.estimated_net_profit_2,

                          description:
                            copy.estimated_profit_remaining_after_applying_the,

                          note: copy.this_is_a_management_estimate_based,
                        },
                      },
                      {
                        label: copy.profit_gap_to_target,
                        value:
                          recoverableProfit > 0
                            ? `+${money(recoverableProfit)}`
                            : money(recoverableProfit),
                        note: t("aiAdvisorPage.product_priorities_count", {
                          count: prioritizedProducts.length,
                        }),
                        color: "#22c55e",
                        tone: "green" as const,

                        tooltip: {
                          title: copy.profit_gap_to_target_2,

                          description:
                            copy.estimated_additional_profit_required_to_bring,

                          note: copy.this_is_a_modeled_estimate_not,
                        },
                      },
                      {
                        label: copy.active_risks,
                        value: `${activeRiskAlerts.length}`,
                        note: t("aiAdvisorPage.critical_count", {
                          count: criticalAlerts.length,
                        }),
                        color:
                          criticalAlerts.length > 0
                            ? "#ff6b4a"
                            : activeRiskAlerts.length > 0
                              ? "#f59e0b"
                              : "#22c55e",
                        tone:
                          criticalAlerts.length > 0
                            ? ("red" as const)
                            : activeRiskAlerts.length > 0
                              ? ("amber" as const)
                              : ("green" as const),
                      },
                      {
                        label: copy.weekly_mission,
                        value: `${missionActions}`,
                        note: t("aiAdvisorPage.estimated_minutes_count", {
                          count: missionMinutes,
                        }),
                        color: "#38bdf8",
                        tone: "blue" as const,
                      },
                    ].map((item) => (
                      <MetricCard
                        key={item.label}
                        className="advisor-v2-kpi"
                        tone={item.tone}
                        label={
                          <span className="advisor-v2-kpi-label">
                            {item.label}
                            {"tooltip" in item && item.tooltip ? (
                              <MetricTooltip content={item.tooltip} />
                            ) : null}
                          </span>
                        }
                        value={item.value}
                        detail={item.note}
                      />
                    ))}
                  </div>

                  <div
                    style={{
                      marginTop: 20,
                      display: "flex",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => navigate("/app/recommendations")}
                    >
                      {copy.open_action_plan}
                    </button>

                    <button
                      type="button"
                      className="apply-button"
                      onClick={() => navigate("/app/recovery-simulator")}
                    >
                      {copy.simulate_recovery}
                    </button>

                    <button
                      type="button"
                      className="apply-button"
                      onClick={() => navigate("/app/forecasting")}
                    >
                      {copy.open_forecast}
                    </button>
                  </div>
                </div>
              </div>
            </PremiumPanel>

            <BusinessPriorities
              alerts={profitAlerts}
              navigate={navigate}
              maxItems={3}
            />

            <div
              className="advisor-v2-scorecards"
              style={{
                marginTop: 24,
                display: "grid",
                gridTemplateColumns: "repeat(5,minmax(0,1fr))",
                gap: 14,
              }}
            >
              {scorecards.map((card) => (
                <div
                  key={card.key}
                  style={{
                    padding: 18,
                    borderRadius: 20,
                    background:
                      "linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))",
                    border: "1px solid rgba(255,115,60,0.14)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      color: "rgba(255,255,255,0.45)",
                      fontSize: 9,
                      fontWeight: 950,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                    }}
                  >
                    <span>{card.label}</span>

                    <MetricTooltip
                      content={
                        card.key === "health"
                          ? {
                              title: copy.store_health_3,
                              description:
                                copy.summarizes_the_overall_health_of_the,
                              note: copy.considers_losses_missing_costs_and_weak,
                            }
                          : card.key === "profit"
                            ? {
                                title: copy.profit_quality_2,
                                description:
                                  copy.measures_how_healthy_the_margins_are,
                                note: copy.a_higher_score_indicates_more_products,
                              }
                            : card.key === "pricing"
                              ? {
                                  title: copy.pricing_efficiency_2,
                                  description:
                                    copy.shows_how_effectively_current_prices_support,
                                  note: copy.a_lower_score_indicates_a_larger,
                                }
                              : card.key === "data"
                                ? {
                                    title: copy.data_quality_2,
                                    description:
                                      copy.measures_how_complete_the_available_data,
                                    note: copy.product_cost_coverage_is_one_of,
                                  }
                                : {
                                    title: copy.execution_readiness_2,
                                    description:
                                      copy.shows_how_much_actionable_evidence_marginlab,
                                    note: copy.higher_scores_indicate_more_opportunities_to,
                                  }
                      }
                    />
                  </div>

                  <div
                    style={{
                      marginTop: 11,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "end",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        color: card.color,
                        fontSize: 30,
                        fontWeight: 950,
                        lineHeight: 1,
                      }}
                    >
                      {card.value}
                    </div>

                    <div
                      style={{
                        color: "rgba(255,255,255,0.35)",
                        fontSize: 10,
                        fontWeight: 850,
                      }}
                    >
                      /100
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 12,
                      height: 7,
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.08)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${card.value}%`,
                        height: "100%",
                        borderRadius: 999,
                        background: card.color,
                        boxShadow: `0 0 14px ${card.color}55`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div
              className="advisor-v2-workspace"
              style={{
                marginTop: 24,
                display: "grid",
                gridTemplateColumns: "0.9fr 1.1fr",
                gap: 22,
                alignItems: "start",
              }}
            >
              <PremiumPanel
                className="advisor-v2-mission"
                tone="blue"
                style={{
                  borderRadius: 26,
                  padding: "24px 24px 32px",
                  background:
                    "radial-gradient(circle at top right, rgba(56,189,248,0.10), transparent 40%), linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))",
                  border: "1px solid rgba(56,189,248,0.18)",
                }}
              >
                <div
                  style={{
                    color: "#7dd3fc",
                    fontSize: 11,
                    fontWeight: 950,
                    letterSpacing: "0.13em",
                    textTransform: "uppercase",
                  }}
                >
                  {copy.weekly_mission_2}
                </div>

                <div
                  style={{
                    marginTop: 11,
                    color: "#f8fafc",
                    fontSize: 23,
                    fontWeight: 950,
                    lineHeight: 1.25,
                  }}
                >
                  {weeklyReport.title}
                </div>

                <div
                  style={{
                    marginTop: 9,
                    color: "rgba(255,255,255,0.58)",
                    fontSize: 12,
                    fontWeight: 740,
                    lineHeight: 1.55,
                  }}
                >
                  {weeklyReport.recommendation}
                </div>

                <div
                  style={{
                    marginTop: 18,
                    display: "grid",
                    gridTemplateColumns: "repeat(3,1fr)",
                    gap: 10,
                  }}
                >
                  {[
                    {
                      label: copy.actions,
                      value: `${missionActions}`,
                      color: "#f8fafc",
                    },
                    {
                      label: copy.estimated_time,
                      value: `${missionMinutes}m`,
                      color: "#38bdf8",
                    },
                    {
                      label: copy.potential,
                      value:
                        recoverableProfit > 0
                          ? `+${money(recoverableProfit)}`
                          : money(recoverableProfit),
                      color: "#22c55e",

                      tooltip: {
                        title: copy.mission_potential,

                        description:
                          copy.estimated_profit_opportunity_associated_with_the,

                        note: copy.this_is_modeled_potential_based_on,
                      },
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      style={{
                        padding: 14,
                        borderRadius: 15,
                        background: "rgba(255,255,255,0.035)",
                        border: "1px solid rgba(255,255,255,0.07)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          color: "rgba(255,255,255,0.42)",
                          fontSize: 9,
                          fontWeight: 950,
                          textTransform: "uppercase",
                        }}
                      >
                        <span>{item.label}</span>

                        {"tooltip" in item && item.tooltip ? (
                          <MetricTooltip content={item.tooltip} />
                        ) : null}
                      </div>

                      <div
                        style={{
                          marginTop: 7,
                          color: item.color,
                          fontSize: 21,
                          fontWeight: 950,
                        }}
                      >
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="primary-button"
                  style={{
                    width: "100%",
                    marginTop: 20,
                    padding: "16px 20px",
                  }}
                  onClick={() => navigate(weeklyReport.route)}
                >
                  {missionAlert?.actionLabel ?? copy.open_action_plan}
                </button>
              </PremiumPanel>

              <PremiumPanel
                className="panel advisor-v2-feed"
                tone="orange"
                style={{ margin: 0, padding: 24 }}
              >
                <div className="panel-eyebrow">{copy.decision_feed}</div>

                <h2 className="panel-title" style={{ marginTop: 6 }}>
                  {copy.signals_that_need_attention}
                </h2>

                <div
                  style={{
                    display: "grid",
                    gap: 11,
                    marginTop: 19,
                  }}
                >
                  {decisionFeed.length > 0 ? (
                    decisionFeed.map((item) => (
                      <button
                        key={`${item.when}-${item.title}`}
                        type="button"
                        onClick={() => navigate(item.route)}
                        style={{
                          width: "100%",
                          display: "grid",
                          gridTemplateColumns: "10px minmax(0,1fr) auto",
                          gap: 13,
                          padding: 14,
                          borderRadius: 16,
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.07)",
                          cursor: "pointer",
                          textAlign: "left",
                          fontFamily: "inherit",
                        }}
                      >
                        <div
                          style={{
                            width: 9,
                            height: 9,
                            marginTop: 5,
                            borderRadius: "50%",
                            background: item.color,
                            boxShadow: `0 0 14px ${item.color}88`,
                          }}
                        />

                        <div>
                          <div
                            style={{
                              color: item.color,
                              fontSize: 9,
                              fontWeight: 950,
                              textTransform: "uppercase",
                              letterSpacing: "0.1em",
                            }}
                          >
                            {item.when}
                          </div>

                          <div
                            style={{
                              marginTop: 5,
                              color: "#f8fafc",
                              fontSize: 14,
                              fontWeight: 900,
                            }}
                          >
                            {item.title}
                          </div>

                          <div
                            style={{
                              marginTop: 4,
                              color: "rgba(255,255,255,0.52)",
                              fontSize: 11,
                              fontWeight: 730,
                              lineHeight: 1.45,
                            }}
                          >
                            {item.detail}
                          </div>

                          <div
                            style={{
                              marginTop: 8,
                              color: item.color,
                              fontSize: 10,
                              fontWeight: 900,
                            }}
                          >
                            {item.actionLabel}
                          </div>
                        </div>

                        <div
                          style={{
                            alignSelf: "center",
                            color: item.color,
                            fontSize: 16,
                            fontWeight: 950,
                          }}
                        >
                          →
                        </div>
                      </button>
                    ))
                  ) : (
                    <div
                      style={{
                        padding: 20,
                        borderRadius: 17,
                        color: "#86efac",
                        background: "rgba(34,197,94,0.08)",
                        border: "1px solid rgba(34,197,94,0.20)",
                        fontWeight: 800,
                      }}
                    >
                      {copy.no_new_critical_signals}
                    </div>
                  )}
                </div>
              </PremiumPanel>

              <div
                className="advisor-v2-analysis"
                style={{
                  marginTop: 24,
                  borderRadius: 26,
                  padding: 24,
                  background:
                    "linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))",
                  border: "1px solid rgba(255,115,60,0.20)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: "#ff9a70",
                        fontSize: 11,
                        fontWeight: 950,
                        letterSpacing: "0.13em",
                        textTransform: "uppercase",
                      }}
                    >
                      {copy.deep_analysis}
                    </div>

                    <div
                      style={{
                        marginTop: 8,
                        color: "#f8fafc",
                        fontSize: 22,
                        fontWeight: 950,
                      }}
                    >
                      {copy.generate_the_full_advisor_report}
                    </div>

                    <div
                      style={{
                        marginTop: 6,
                        color: "rgba(255,255,255,0.54)",
                        fontSize: 12,
                        fontWeight: 730,
                      }}
                    >
                      {copy.ai_will_use_all_real_store}
                    </div>

                    <div
                      style={{
                        marginTop: 18,
                        display: "grid",
                        gap: 8,
                      }}
                    >
                      {[
                        copy.analyzes_the_highest_priority_business_risk,

                        copy.identifies_the_first_products_to_fix,

                        copy.estimates_profit_gaps_and_recommended_actions,
                      ].map((item) => (
                        <div
                          key={item}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            color: "rgba(255,255,255,0.70)",
                            fontSize: 12,
                            fontWeight: 720,
                          }}
                        >
                          <div
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: "#22c55e",
                              boxShadow: "0 0 10px rgba(34,197,94,0.5)",
                              flexShrink: 0,
                            }}
                          />

                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <aiFetcher.Form
                    method="post"
                    onSubmit={() => setShowAiReport(false)}
                  >
                    <input type="hidden" name="language" value={language} />
                    <input type="hidden" name="period" value={period} />

                    <button
                      type="submit"
                      className="primary-button"
                      disabled={aiFetcher.state !== "idle"}
                    >
                      {aiFetcher.state !== "idle"
                        ? copy.analyzing
                        : copy.generate_ai_analysis}
                    </button>

                    <div
                      style={{
                        marginTop: 9,
                        color: "rgba(255,255,255,0.42)",
                        fontSize: 10,
                        fontWeight: 750,
                      }}
                    >
                      {t("aiAdvisorPage.ai_requests_used", {
                        used: aiUsage.used,
                        limit: aiUsage.limit,
                      })}
                    </div>
                  </aiFetcher.Form>
                </div>

                {showAiReport && aiFetcher.data?.text && (
                  <div
                    className="advisor-v2-response"
                    style={{ marginTop: 20 }}
                  >
                    <div
                      style={{
                        padding: 22,
                        borderRadius: 19,
                        background: "rgba(255,255,255,0.035)",
                        border: "1px solid rgba(34,197,94,0.20)",
                        color: "rgba(255,255,255,0.84)",
                        fontSize: 14,
                        lineHeight: 1.85,
                        fontWeight: 720,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {aiFetcher.data.text}
                    </div>

                    <div
                      style={{
                        marginTop: 14,
                        display: "flex",
                        justifyContent: "flex-end",
                      }}
                    >
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() =>
                          downloadAiReportPdf(
                            String(aiFetcher.data?.text),
                            language,
                          )
                        }
                      >
                        {copy.download_pdf_report}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div
                className="advisor-v2-ask"
                style={{
                  marginTop: 24,
                  borderRadius: 26,
                  padding: 24,
                  background:
                    "radial-gradient(circle at top left, rgba(255,115,80,0.10), transparent 38%), linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))",
                  border: "1px solid rgba(255,115,60,0.20)",
                }}
              >
                <div
                  className="advisor-v2-questions"
                  style={{
                    color: "#ff9a70",
                    fontSize: 11,
                    fontWeight: 950,
                    letterSpacing: "0.13em",
                    textTransform: "uppercase",
                  }}
                >
                  {copy.ask_the_copilot}
                </div>

                <div
                  style={{
                    marginTop: 8,
                    color: "#f8fafc",
                    fontSize: 22,
                    fontWeight: 950,
                  }}
                >
                  {copy.explore_a_specific_decision}
                </div>

                <div
                  style={{
                    marginTop: 6,
                    color: "rgba(255,255,255,0.54)",
                    fontSize: 12,
                    fontWeight: 730,
                    lineHeight: 1.5,
                  }}
                >
                  {copy.questions_adapt_to_the_risks_and}
                </div>

                <div
                  style={{
                    marginTop: 18,
                    display: "grid",
                    gridTemplateColumns: "repeat(4,minmax(0,1fr))",
                    gap: 11,
                  }}
                >
                  {visibleQuestions.map((presetQuestion) => (
                    <button
                      key={presetQuestion.id}
                      type="button"
                      onClick={() => {
                        setSelectedQuestion(
                          presetQuestion.id as SelectedQuestion,
                        );
                        setQuestion(presetQuestion.displayLabel);

                        const formData = new FormData();
                        formData.append("intent", "ask");
                        formData.append("question", presetQuestion.promptText);
                        formData.append("language", language);
                        formData.append("period", period);

                        askFetcher.submit(formData, {
                          method: "post",
                        });
                      }}
                      style={{
                        padding: "14px 15px",
                        minHeight: 76,
                        borderRadius: 15,
                        cursor: "pointer",
                        textAlign: "left",
                        color: "#f8fafc",
                        background:
                          selectedQuestion === presetQuestion.id
                            ? "rgba(255,115,80,0.14)"
                            : "rgba(255,255,255,0.035)",
                        border:
                          selectedQuestion === presetQuestion.id
                            ? "1px solid rgba(255,115,80,0.42)"
                            : "1px solid rgba(255,255,255,0.07)",
                        fontSize: 12,
                        fontWeight: 850,
                        lineHeight: 1.4,
                      }}
                    >
                      {presetQuestion.displayLabel}
                    </button>
                  ))}
                </div>

                <askFetcher.Form method="post">
                  <input type="hidden" name="intent" value="ask" />
                  <input type="hidden" name="language" value={language} />
                  <input type="hidden" name="period" value={period} />

                  <div
                    style={{
                      marginTop: 16,
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 11,
                    }}
                  >
                    <input
                      className="advisor-v2-composer"
                      name="question"
                      value={question}
                      onChange={(event) => setQuestion(event.target.value)}
                      placeholder={copy.ask_a_profitability_question}
                      style={{
                        width: "100%",
                        padding: "15px 16px",
                        borderRadius: 14,
                        color: "#ffffff",
                        background: "rgba(255,255,255,0.035)",
                        border: "1px solid rgba(255,115,60,0.18)",
                        outline: "none",
                        fontWeight: 800,
                      }}
                    />

                    <button
                      type="submit"
                      className="primary-button"
                      disabled={askFetcher.state !== "idle" || !question.trim()}
                    >
                      {askFetcher.state !== "idle"
                        ? copy.thinking
                        : copy.ask_ai}
                    </button>
                  </div>
                </askFetcher.Form>

                {askFetcher.data?.text && (
                  <div
                    className="advisor-v2-response advisor-v2-answer"
                    style={{
                      marginTop: 18,
                      padding: 21,
                      borderRadius: 18,
                      background: "rgba(34,197,94,0.055)",
                      border: "1px solid rgba(34,197,94,0.20)",
                      color: "rgba(255,255,255,0.84)",
                      lineHeight: 1.8,
                      fontSize: 14,
                      fontWeight: 730,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {askFetcher.data.text}
                  </div>
                )}
              </div>

              <div
                className="advisor-v2-methodology"
                style={{
                  marginTop: 22,
                  padding: 18,
                  borderRadius: 18,
                  background: "rgba(255,115,60,0.07)",
                  border: "1px solid rgba(255,115,60,0.18)",
                  color: "rgba(255,255,255,0.64)",
                  lineHeight: 1.6,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {copy.profit_copilot_uses_the_tax_aware}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
