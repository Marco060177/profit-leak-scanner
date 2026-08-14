import * as React from "react";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "~/shopify.server";
import { getStoredLanguage } from "~/utils/i18n";
import dashboardStylesUrl from "~/styles/dashboard.css?url";

import ScoreCard from "~/components/dashboard/ScoreCard";
import TrendChart from "~/components/dashboard/TrendChart";
import KpiGrid from "~/components/dashboard/KpiGrid";
import TopLeaksPanel from "~/components/dashboard/TopLeaksPanel";
import DashboardHero from "~/components/dashboard/DashboardHero";
import AIProfitMonitor from "~/components/dashboard/AIProfitMonitor";

import { loadMarginDashboardData } from "~/utils/margin.server";
import { generateProfitAlerts, type ProfitAlert } from "~/utils/profit-monitor";
import { syncProfitMonitor } from "~/services/profit-monitor.server";
import {
  buildMarginAssessment,
  type DecisionSignal,
  type MarginAssessment,
} from "~/utils/margin-decision-engine";

import {
  type LoaderData,
  type Row,
  money as formatStoreMoney,
  pct as formatStorePercent,
} from "~/utils/margin";

export const links = () => [
  {
    rel: "stylesheet",
    href: dashboardStylesUrl,
  },
];

function metricValue(signal: DecisionSignal, key: string) {
  return signal.metrics.find((metric) => metric.key === key)?.value ?? 0;
}

function decisionSignalToAlert({
  signal,
  assessment,
  language,
  period,
  money,
  pct,
}: {
  signal: DecisionSignal;
  assessment: MarginAssessment;
  language: "it" | "en";
  period: string;
  money: (value: number) => string;
  pct: (value: number) => string;
}): ProfitAlert {
  const periodDays = Math.max(1, Number(period) || 30);
  const monthlyImpact =
    signal.code === "MISSING_COSTS" || signal.impactAmount === null
      ? 0
      : signal.impactAmount * (30 / periodDays);
  const affectedProducts = metricValue(signal, "products");

  const common = {
    id: signal.id,
    severity:
      signal.kind === "opportunity"
        ? ("opportunity" as const)
        : signal.severity,
    monthlyImpact,
    priority: signal.priority,
  };

  switch (signal.code) {
    case "REAL_LOSSES": {
      const loss = metricValue(signal, "loss");
      const lossShare = metricValue(signal, "lossShare");
      return {
        ...common,
        category: "margin",
        economicKind: "opportunity",
        title:
          language === "it" ? "Perdite reali rilevate" : "Real losses detected",
        description:
          language === "it"
            ? `${affectedProducts} prodotti hanno generato ${money(loss)} di perdita, pari al ${pct(lossShare)} dei ricavi analizzati.`
            : `${affectedProducts} products generated ${money(loss)} in losses, equal to ${pct(lossShare)} of analyzed revenue.`,
        actionLabel:
          language === "it" ? "Controlla i prodotti" : "Review products",
        route: "/app/products",
        businessAction: "action",
        effort: "medium",
        estimatedMinutes: 15,
        recommendedModule: "Products",
        metadata: { affectedProducts, periodImpact: loss },
      };
    }

    case "MISSING_COSTS": {
      const exposedRevenue = metricValue(signal, "revenue");
      const revenueShare = metricValue(signal, "revenueShare");
      return {
        ...common,
        category: "data-quality",
        economicKind: "exposure",
        title:
          language === "it"
            ? "Costi prodotto mancanti"
            : "Missing product costs",
        description:
          language === "it"
            ? `${affectedProducts} prodotti, pari a ${money(exposedRevenue)} di ricavi (${pct(revenueShare)}), non hanno una copertura COGS completa. Non si tratta di una perdita accertata.`
            : `${affectedProducts} products representing ${money(exposedRevenue)} in revenue (${pct(revenueShare)}) do not have complete COGS coverage. This is not a confirmed loss.`,
        actionLabel: language === "it" ? "Completa i costi" : "Complete costs",
        route: "/app/products",
        businessAction: "review",
        effort: affectedProducts <= 5 ? "easy" : "medium",
        estimatedMinutes: Math.min(30, Math.max(5, affectedProducts * 2)),
        recommendedModule: "Products",
        metadata: { affectedProducts, revenue: exposedRevenue },
      };
    }

    case "WEAK_MARGIN": {
      const margin = metricValue(signal, "margin");
      const target = metricValue(signal, "target");
      return {
        ...common,
        category: "margin",
        economicKind: "exposure",
        title:
          language === "it"
            ? "Margine sotto il livello obiettivo"
            : "Margin below target level",
        description:
          language === "it"
            ? `Il margine osservato è ${pct(margin)}, rispetto al riferimento operativo del ${pct(target)}. Con i dati attuali è un segnale del periodo, non ancora un giudizio generale sullo store.`
            : `Observed margin is ${pct(margin)}, compared with the ${pct(target)} operating reference. With the current evidence this is a period signal, not yet a store-wide assessment.`,
        actionLabel:
          language === "it" ? "Analizza il margine" : "Analyze margin",
        route: "/app/profit-intelligence",
        businessAction: "review",
        effort: "medium",
        estimatedMinutes: 15,
        recommendedModule: "Profit Intelligence",
        metadata: { currentMargin: margin, affectedProducts },
      };
    }

    case "MARGIN_DETERIORATION": {
      const marginChange = metricValue(signal, "marginDelta");
      return {
        ...common,
        category: "margin",
        economicKind: "exposure",
        title:
          language === "it"
            ? "Margine in deterioramento"
            : "Margin deterioration detected",
        description:
          language === "it"
            ? `Il margine è diminuito di ${pct(Math.abs(marginChange))} rispetto a un periodo precedente considerato comparabile.`
            : `Margin declined by ${pct(Math.abs(marginChange))} versus a previous period considered comparable.`,
        actionLabel:
          language === "it" ? "Esamina il confronto" : "Review comparison",
        route: "/app/profit-intelligence",
        businessAction: "review",
        effort: "medium",
        estimatedMinutes: 15,
        recommendedModule: "Profit Intelligence",
        metadata: { marginChange },
      };
    }

    case "HIGH_DISCOUNT_RATE": {
      const discountRate = metricValue(signal, "discountRate");
      const discounts = metricValue(signal, "discounts");
      return {
        ...common,
        category: "discounts",
        economicKind: "loss",
        title:
          language === "it"
            ? "Pressione elevata degli sconti"
            : "High discount pressure",
        description:
          language === "it"
            ? `Gli sconti ammontano a ${money(discounts)} e incidono per il ${pct(discountRate)} sui ricavi prima degli sconti.`
            : `Discounts total ${money(discounts)} and represent ${pct(discountRate)} of revenue before discounts.`,
        actionLabel:
          language === "it" ? "Analizza gli sconti" : "Analyze discounts",
        route: "/app/profit-intelligence",
        businessAction: "optimize",
        effort: "medium",
        estimatedMinutes: 20,
        recommendedModule: "Profit Intelligence",
        metadata: { periodImpact: discounts },
      };
    }

    case "HIGH_REFUND_RATE": {
      const refundRate = metricValue(signal, "refundRate");
      const refunds = metricValue(signal, "refunds");
      return {
        ...common,
        category: "refunds",
        economicKind: "loss",
        title:
          language === "it"
            ? "Incidenza elevata dei rimborsi"
            : "High refund rate",
        description:
          language === "it"
            ? `I rimborsi ammontano a ${money(refunds)} e incidono per il ${pct(refundRate)} sui ricavi analizzati.`
            : `Refunds total ${money(refunds)} and represent ${pct(refundRate)} of analyzed revenue.`,
        actionLabel:
          language === "it" ? "Analizza i rimborsi" : "Analyze refunds",
        route: "/app/profit-intelligence",
        businessAction: "review",
        effort: "advanced",
        estimatedMinutes: 30,
        recommendedModule: "Profit Intelligence",
        metadata: { periodImpact: refunds },
      };
    }

    case "RISK_CONCENTRATION": {
      const revenueShare = metricValue(signal, "revenueShare");
      return {
        ...common,
        category: "margin",
        economicKind: "exposure",
        title:
          language === "it"
            ? "Rischio concentrato su pochi prodotti"
            : "Risk concentrated in few products",
        description:
          language === "it"
            ? `Un prodotto a margine debole o negativo concentra il ${pct(revenueShare)} dei ricavi analizzati.`
            : `A weak- or negative-margin product represents ${pct(revenueShare)} of analyzed revenue.`,
        actionLabel:
          language === "it" ? "Controlla i prodotti" : "Review products",
        route: "/app/products",
        businessAction: "review",
        effort: "medium",
        estimatedMinutes: 15,
        recommendedModule: "Products",
        metadata: { revenue: assessment.facts.revenue },
      };
    }

    case "PRICE_RECOVERY": {
      const recovery = metricValue(signal, "theoreticalRecovery");
      return {
        ...common,
        category: "pricing",
        economicKind: "opportunity",
        title:
          language === "it"
            ? "Opportunità di recupero del margine"
            : "Margin recovery opportunity",
        description:
          language === "it"
            ? `${affectedProducts} prodotti mostrano un potenziale teorico di recupero pari a ${money(recovery)} nel periodo selezionato.`
            : `${affectedProducts} products show theoretical recovery potential of ${money(recovery)} in the selected period.`,
        actionLabel:
          language === "it" ? "Simula il recupero" : "Simulate recovery",
        route: "/app/recovery-simulator",
        businessAction: "optimize",
        effort: "easy",
        estimatedMinutes: 10,
        recommendedModule: "Recovery Simulator",
        metadata: { affectedProducts, periodImpact: recovery },
      };
    }

    default:
      return {
        ...common,
        category: "margin",
        economicKind: "exposure",
        title:
          language === "it" ? "Segnale di redditività" : "Profitability signal",
        description:
          language === "it"
            ? "MarginLab ha rilevato un segnale da verificare nel periodo selezionato."
            : "MarginLab detected a signal to review in the selected period.",
        actionLabel: language === "it" ? "Apri l'analisi" : "Open analysis",
        route: "/app/profit-intelligence",
        businessAction: "monitor",
        effort: "medium",
        estimatedMinutes: 15,
        recommendedModule: "Profit Intelligence",
      };
  }
}

export const loader = async ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  const period = url.searchParams.get("period") || "30";

  const language = url.searchParams.get("lang") === "it" ? "it" : "en";

  const locale = language === "it" ? "it-IT" : "en-US";

  const { admin, session } = await authenticate.admin(request);

  try {
    await admin.graphql(`query { shop { id } }`);
  } catch {
    throw new Response("Auth/scopes not ready. Reinstall the app.", {
      status: 401,
    });
  }

  const data = await loadMarginDashboardData({
    admin,
    session,
    period,
    locale,
  });
  const alerts = generateProfitAlerts({
    summary: data.summary,
    rows: data.rows,
    language,
    period,
    currencyCode: data.currencyCode,
  });
  const alertStates = await syncProfitMonitor({
    shop: session.shop,
    period,
    alerts,
    snapshot: {
      summary: data.summary,
      economicSnapshot: data.economicSnapshot,
      alertIds: alerts.map((alert) => alert.id),
    },
  });
  return { ...data, alerts, alertStates };
};

export default function DashboardV2() {
  const {
    summary,
    rows,
    trend,
    period,
    currencyCode,
    timeZone,
    analysisContext,
    alerts,
    taxContext,
    
    taxAwareEconomics,
  } = useLoaderData<typeof loader>();

  const navigate = useNavigate();
  const [onlyLosing, setOnlyLosing] = React.useState(false);
  const [analysisLoading, setAnalysisLoading] = React.useState(false);

  const language = getStoredLanguage();

  const locale = language === "it" ? "it-IT" : "en-US";

  const economicRevenue =
    summary.economicRevenue ?? summary.revenue;

  const economicCogs =
    summary.economicCogs ?? summary.cogs;

  const economicProfit =
    summary.economicProfit ?? summary.profit;

  const economicMarginPct =
    summary.economicMarginPct ?? summary.marginPct;

  const economicAdjustment =
    economicProfit - summary.profit;

  const marginAssessment = React.useMemo(
    () =>
      buildMarginAssessment({
        summary,
        rows,
        trend,
        analysisContext,
      }),
    [summary, rows, trend, analysisContext],
  );

  const money = React.useCallback(
    (value: number) => formatStoreMoney(value, currencyCode, locale),
    [currencyCode, locale],
  );

  const pct = React.useCallback(
    (value: number) => formatStorePercent(value, locale),
    [locale],
  );

  const alertCounts = React.useMemo(
    () => ({
      critical: alerts.filter((alert) => alert.severity === "critical").length,
      warning: alerts.filter((alert) => alert.severity === "warning").length,
      opportunity: alerts.filter((alert) => alert.severity === "opportunity")
        .length,
      info: alerts.filter((alert) => alert.severity === "info").length,
    }),
    [alerts],
  );

  const primaryAlert = alerts[0] ?? null;

  const analysisSteps =
    language === "it"
      ? [
        "Analisi ordini Shopify...",
        "Controllo costi prodotto...",
        "Ricerca perdite di margine...",
        "Analisi completata...",
      ]
      : [
        "Scanning Shopify orders...",
        "Checking product costs...",
        "Detecting pricing leaks...",
        "Analysis complete...",
      ];

  const [analysisText, setAnalysisText] = React.useState(analysisSteps[0]);

  const dashboardLoading = false;
  const marginDelta = summary.marginDelta;

  const productsAtRisk = rows.filter(
    (row) => row.losing || row.lowMargin || row.missingCost,
  ).length;

  const lowMarginCount = rows.filter(
    (row) => row.lowMargin && !row.losing,
  ).length;

  const sourceRows = rows;

  const visualRevenue = sourceRows.reduce((acc, row) => acc + row.revenue, 0);
  const visualCogs = sourceRows.reduce((acc, row) => acc + row.cogs, 0);
  const visualProfit = visualRevenue - visualCogs;

  const visualLeak = Math.abs(
    sourceRows.reduce((acc, row) => acc + (row.profit < 0 ? row.profit : 0), 0),
  );

  const visualMarginPct =
    visualRevenue > 0 ? (visualProfit / visualRevenue) * 100 : 0;

  const profitPercentage =
    visualRevenue > 0 ? (visualProfit / visualRevenue) * 100 : 0;

  const cogsPercentage =
    visualRevenue > 0 ? (visualCogs / visualRevenue) * 100 : 0;

  const leakPercentage =
    visualRevenue > 0 ? (visualLeak / visualRevenue) * 100 : 0;

  const visualMissingCostCount = sourceRows.filter(
    (row) => row.missingCost,
  ).length;

  const visualProductsAtRisk = sourceRows.filter(
    (row) => row.losing || row.lowMargin || row.missingCost,
  ).length;

  const criticalCount = sourceRows.filter((row) => row.losing).length;

  const warningCount = sourceRows.filter(
    (row) => row.lowMargin && !row.losing,
  ).length;

  const missingCount = sourceRows.filter((row) => row.missingCost).length;

  const healthyCount = sourceRows.filter(
    (row) => !row.losing && !row.lowMargin && !row.missingCost,
  ).length;

  const riskTotal = Math.max(sourceRows.length, 1);

  const filteredRows = onlyLosing
    ? sourceRows.filter((row) => row.losing)
    : sourceRows;

  const totalRevenue = Math.max(
    sourceRows.reduce((acc, row) => acc + row.revenue, 0),
    1,
  );

  const productRiskScore = (row: Row) => {
    const revenueShare =
      totalRevenue > 0 ? (row.revenue / totalRevenue) * 100 : 0;

    let score = 0;

    if (row.losing) score += 40;
    if (row.missingCost) score += 25;
    if (row.lowMargin) score += 20;

    score += Math.min(15, revenueShare);

    if (row.marginPct < 5) score += 10;
    if (row.targetDelta > 0) score += Math.min(10, row.targetDelta / 10);

    return Math.min(100, Math.round(score));
  };

  const getRiskLevel = (score: number) => {
    if (score >= 75) {
      return {
        label: "Critical",
        color: "#ff6b4a",
        background: "rgba(255,107,74,0.14)",
      };
    }

    if (score >= 50) {
      return {
        label: "High",
        color: "#ffb347",
        background: "rgba(255,179,71,0.14)",
      };
    }

    return {
      label: "Moderate",
      color: "#4ade80",
      background: "rgba(74,222,128,0.14)",
    };
  };

  const sortedRiskRows = filteredRows
    .slice()
    .sort((a, b) => productRiskScore(b) - productRiskScore(a))
    .slice(0, 12);

  const weakBestSeller = [...sourceRows]
    .filter((p) => p.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)[0];

  const weakBestSellerMargin =
    weakBestSeller && weakBestSeller.revenue > 0
      ? (weakBestSeller.profit / weakBestSeller.revenue) * 100
      : 0;

  const hasWeakBestSeller =
    weakBestSeller &&
    weakBestSeller.revenue > 1000 &&
    weakBestSellerMargin < 30;

  const topLeaks = [
    sourceRows.filter((row) => row.losing).length > 0
      ? {
        icon: "⚠️",
        issue:
          language === "it"
            ? "Prodotti venduti sotto costo"
            : "Products selling below cost",
        severity: language === "it" ? "Alta" : "High",
        loss: money(visualLeak),
      }
      : null,

    visualMissingCostCount > 0
      ? {
        icon: "📦",
        issue:
          language === "it"
            ? "Prodotti senza costo"
            : "Products missing cost data",
        severity: language === "it" ? "Moderata" : "Moderate",
        loss:
          language === "it"
            ? `${visualMissingCostCount} prodotti`
            : `${visualMissingCostCount} products`,
      }
      : null,

    lowMarginCount > 0
      ? {
        icon: "🏷️",
        issue:
          language === "it"
            ? "Prodotti a basso margine rilevati"
            : "Low-margin products detected",
        severity: language === "it" ? "Moderata" : "Moderate",
        loss:
          language === "it"
            ? `${lowMarginCount} prodotti`
            : `${lowMarginCount} products`,
      }
      : null,

    productsAtRisk > 0
      ? {
        icon: "🔥",
        issue:
          language === "it"
            ? "Prodotti da controllare"
            : "Products requiring margin review",
        severity: language === "it" ? "Minore" : "Low",
        loss:
          language === "it"
            ? `${productsAtRisk} a rischio`
            : `${productsAtRisk} at risk`,
      }
      : null,
  ].filter(Boolean) as {
    icon: string;
    issue: string;
    severity: string;
    loss: string;
  }[];

  const riskyRows = sourceRows.filter(
    (row) => row.losing || row.lowMargin || row.missingCost,
  );

  const riskyRevenue = riskyRows.reduce((acc, row) => acc + row.revenue, 0);

  const riskyRevenueShare = (riskyRevenue / totalRevenue) * 100;

  const topRevenueProducts = [...sourceRows]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 3);

  const topRevenueTotal = topRevenueProducts.reduce(
    (acc, row) => acc + row.revenue,
    0,
  );

  const topRevenueShare = (topRevenueTotal / totalRevenue) * 100;

  const weakTopProducts = topRevenueProducts.filter(
    (row) => row.marginPct < 15 || row.lowMargin || row.losing,
  );

  const contributionInsights = [
    riskyRevenueShare > 25
      ? {
        title:
          "High-risk products are driving a significant share of revenue",
        value: `${pct(riskyRevenueShare)} of revenue`,
        description:
          "A meaningful portion of store revenue is coming from products with margin risk, missing costs or weak profitability.",
        severity: "Critical",
        confidence: "High confidence",
      }
      : null,

    topRevenueShare > 50
      ? {
        title: "Revenue is concentrated in a small group of products",
        value: `${pct(topRevenueShare)} from top 3 products`,
        description:
          "Your store depends heavily on a few products. If these products weaken, total profitability may be exposed.",
        severity: "High",
        confidence: "High confidence",
      }
      : null,

    weakTopProducts.length > 0
      ? {
        title: "Top-selling products show weak contribution quality",
        value: `${weakTopProducts.length} top products at risk`,
        description:
          "Some of your highest-revenue products may not be contributing enough profit relative to their sales volume.",
        severity: "Medium",
        confidence: "Moderate confidence",
      }
      : null,
  ].filter(Boolean) as {
    title: string;
    value: string;
    description: string;
    severity: string;
    confidence: string;
  }[];

  const prioritizedInsights = [...contributionInsights]
    .sort((a, b) => {
      const severityWeight = {
        Critical: 3,
        High: 2,
        Medium: 1,
      };

      return (
        severityWeight[b.severity as keyof typeof severityWeight] -
        severityWeight[a.severity as keyof typeof severityWeight]
      );
    })
    .slice(0, 3);

  const worstProduct =
    sourceRows.length > 0
      ? ([...sourceRows]
        .filter((row) => row.profit < 0)
        .sort((a, b) => a.profit - b.profit)[0] ?? null)
      : null;

  const bestProduct =
    sourceRows.length > 0
      ? ([...sourceRows]
        .filter((row) => !row.missingCost)
        .sort((a, b) => b.marginPct - a.marginPct)[0] ?? null)
      : null;

  const recoverableProfit = sourceRows.reduce((acc, row) => {
    return acc + (row.targetDelta > 0 ? row.targetDelta * row.qty : 0);
  }, 0);

  const recoveryProducts = sourceRows.filter(
    (row) => row.targetDelta > 0 && row.qty > 0,
  );

  const hasRecoveryOpportunity =
    recoveryProducts.length > 0 && recoverableProfit > 0;

  const recommendations = [
    sourceRows.filter((row) => row.losing).length > 0
      ? {
        title: `Fix ${sourceRows.filter((row) => row.losing).length
          } underpriced products selling below cost`,
        impact: `${money(visualLeak)} potential recovery`,
        confidence: "High confidence",
        actionLabel: "Review pricing",
        actionLink: "#products-section",
      }
      : null,
    summary.missingCostCount > 0
      ? {
        title: "Update missing product costs in Shopify",
        impact: `${summary.missingCostCount} products affected`,
        confidence: "Critical issue",
        actionLabel: "Update costs",
        actionLink: "#products-section",
      }
      : null,
    lowMarginCount > 0
      ? {
        title: "Review low-margin products below 10%",
        impact: `${lowMarginCount} products need attention`,
        confidence: "Medium confidence",
        actionLabel: "Analyze products",
        actionLink: "#products-section",
      }
      : null,
    rows.length > 0
      ? {
        title: "Review target prices for worst-performing products",
        impact: "20% margin target available",
        confidence: "Rule-based insight",
        actionLabel: "Review",
        actionLink: "#products-section",
      }
      : null,
  ].filter(Boolean) as {
    title: string;
    impact: string;
    confidence: string;
    actionLabel: string;
    actionLink: string;
  }[];

  const insights = [
    hasWeakBestSeller
      ? {
        eyebrow:
          getStoredLanguage() === "it"
            ? "INSIGHT CRITICO"
            : "CRITICAL INSIGHT",
        title:
          getStoredLanguage() === "it"
            ? "Il tuo prodotto più venduto potrebbe ridurre la redditività"
            : "Your best-selling product may be reducing profitability",
        badge: getStoredLanguage() === "it" ? "Margine basso" : "Low margin",
        description: (
          <>
            <strong>{weakBestSeller.productTitle}</strong>{" "}
            {getStoredLanguage() === "it" ? "ha generato" : "generated"}{" "}
            <strong>{money(weakBestSeller.revenue)}</strong>{" "}
            {getStoredLanguage() === "it"
              ? "di ricavi con solo"
              : "revenue with only"}{" "}
            <strong>{pct(weakBestSellerMargin)}</strong>{" "}
            {getStoredLanguage() === "it"
              ? "di margine. Questo prodotto potrebbe ridurre la redditività complessiva del negozio."
              : "margin. This product may be reducing your overall store profitability."}
          </>
        ),
      }
      : null,

    marginDelta < -3
      ? {
        eyebrow:
          getStoredLanguage() === "it"
            ? "PEGGIORAMENTO MARGINE"
            : "MARGIN DETERIORATION",
        title:
          getStoredLanguage() === "it"
            ? "La redditività del negozio sta diminuendo"
            : "Store profitability is decreasing",
        badge: pct(marginDelta),
        description: (
          <>
            {getStoredLanguage() === "it"
              ? "Il margine del negozio è sceso da"
              : "Your store margin dropped from"}{" "}
            <strong>{pct(summary.previousMarginPct)}</strong>{" "}
            {getStoredLanguage() === "it" ? "a" : "to"}{" "}
            <strong>{pct(summary.marginPct)}</strong>{" "}
            {getStoredLanguage() === "it"
              ? "rispetto al periodo precedente. Controlla prezzi, sconti e costi prodotto per evitare ulteriore erosione dei margini."
              : "compared to the previous period. Review pricing, discounts and product costs to avoid further margin erosion."}
          </>
        ),
      }
      : null,

    hasRecoveryOpportunity
      ? {
        eyebrow:
          getStoredLanguage() === "it"
            ? "OPPORTUNITÀ DI RECUPERO"
            : "RECOVERY OPPORTUNITY",
        title:
          getStoredLanguage() === "it"
            ? "MarginLab ha rilevato opportunità di profitto recuperabile"
            : "MarginLab detected recoverable profit opportunities",
        badge: money(recoverableProfit),
        description: (
          <>
            {getStoredLanguage() === "it"
              ? "Profit Leak Scanner ha rilevato"
              : "Profit Leak Scanner detected"}{" "}
            <strong>
              {recoveryProducts.length}{" "}
              {getStoredLanguage() === "it" ? "prodotti" : "products"}
            </strong>{" "}
            {getStoredLanguage() === "it"
              ? "con gap di prezzo. Adeguare i prezzi verso i margini target potrebbe recuperare circa"
              : "with pricing gaps. Adjusting prices toward target margins could recover approximately"}{" "}
            <strong>{money(recoverableProfit)}</strong>{" "}
            {getStoredLanguage() === "it"
              ? "di profitto aggiuntivo."
              : "in additional profit."}
          </>
        ),
      }
      : null,

    summary.revenueDeltaPct > 10 && summary.marginDelta < 0
      ? {
        eyebrow:
          getStoredLanguage() === "it" ? "AVVISO CRESCITA" : "GROWTH WARNING",
        title:
          getStoredLanguage() === "it"
            ? "La crescita dei ricavi sta superando la crescita dei margini"
            : "Revenue growth is outpacing margin growth",
        badge:
          getStoredLanguage() === "it"
            ? `${pct(summary.revenueDeltaPct)} ricavi`
            : `${pct(summary.revenueDeltaPct)} revenue`,
        description: (
          <>
            {getStoredLanguage() === "it"
              ? "I ricavi del negozio sono aumentati del"
              : "Store revenue increased by"}{" "}
            <strong>{pct(summary.revenueDeltaPct)}</strong>
            {getStoredLanguage() === "it"
              ? ", ma il margine è sceso del"
              : ", but margin dropped by"}{" "}
            <strong>{pct(Math.abs(summary.marginDelta))}</strong>
            {getStoredLanguage() === "it"
              ? ". Una crescita rapida con margini in calo può indicare sconti aggressivi, costi in aumento o bestseller sottoprezzati."
              : ". Rapid growth combined with weakening margins may indicate aggressive discounts, rising costs or underpriced best sellers."}
          </>
        ),
      }
      : null,
  ].filter(Boolean);

  function setPeriod(next: "7" | "30" | "90") {
    const params = new URLSearchParams(window.location.search);

    params.set("period", next);
    params.set("lang", language);

    navigate(`/app?${params.toString()}`);
  }

  function scrollToSection(id: string) {
    const section = document.getElementById(id);

    if (section) {
      section.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }

  const riskColor = (row: Row) => {
    if (row.losing) return "#ef4444";
    if (row.missingCost) return "#f59e0b";
    if (row.lowMargin) return "#ff6b4a";
    return "#22c55e";
  };

  const riskBackground = (row: Row) => {
    if (row.losing) return "rgba(239,68,68,0.16)";
    if (row.missingCost) return "rgba(245,158,11,0.14)";
    if (row.lowMargin) return "rgba(255,90,54,0.14)";
    return "rgba(34,197,94,0.12)";
  };

  const chartData = trend;

  const maxChartValue = Math.max(
    ...chartData.map((d) => Math.max(d.revenue, d.profit)),
    1,
  );

  const revenuePoints = chartData
    .map((point, index) => {
      const x =
        chartData.length === 1 ? 0 : (index / (chartData.length - 1)) * 1000;

      const y = 230 - (point.revenue / maxChartValue) * 170;

      return `${x},${y}`;
    })
    .join(" ");

  const profitPoints = chartData
    .map((point, index) => {
      const x =
        chartData.length === 1 ? 0 : (index / (chartData.length - 1)) * 1000;

      const y = 230 - (point.profit / maxChartValue) * 170;

      return `${x},${y}`;
    })
    .join(" ");

  const riskLabel = (row: Row) => {
    if (row.losing) return "Critical";
    if (row.missingCost) return "Missing cost";
    if (row.lowMargin) return "High";
    return "Healthy";
  };

  const severityColor = (severity: string) => {
    if (severity === "High") return "#ff6b4a";
    if (severity === "Medium") return "#f59e0b";
    return "#9ca3af";
  };

  const severityBackground = (severity: string) => {
    if (severity === "High") return "rgba(255,90,54,0.14)";
    if (severity === "Medium") return "rgba(245,158,11,0.14)";
    return "rgba(156,163,175,0.12)";
  };

  const severityBorder = (severity: string) => {
    if (severity === "High") return "1px solid rgba(255,90,54,0.25)";
    if (severity === "Medium") return "1px solid rgba(245,158,11,0.22)";
    return "1px solid rgba(156,163,175,0.18)";
  };

  if (dashboardLoading) {
    return (
      <div className="dashboard-shell loading-shell">
        <div className="dashboard-container">
          <div className="loading-stack">
            <div className="loading-navbar" />
            <div className="loading-hero" />

            <div className="loading-kpi-grid">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="loading-kpi-card" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardHero
          period={period}
          setPeriod={setPeriod}
          navigate={navigate}
          scrollToSection={scrollToSection}
          analysisLoading={analysisLoading}
          analysisText={analysisText}
          analysisSteps={analysisSteps}
          setAnalysisLoading={setAnalysisLoading}
          setAnalysisText={setAnalysisText}
        />

        {taxContext?.isItalianStore && !taxContext?.configured ? (
          <div
            style={{
              marginBottom: 24,
              padding: 20,
              borderRadius: 20,
              background:
                "linear-gradient(135deg, rgba(255,115,60,0.12), rgba(8,13,22,0.96))",
              border: "1px solid rgba(255,115,60,0.24)",
              boxShadow: "0 18px 50px rgba(0,0,0,0.18)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 18,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  color: "#ff9a70",
                  fontSize: 10,
                  fontWeight: 950,
                  textTransform: "uppercase",
                  letterSpacing: "0.11em",
                }}
              >
                {language === "it"
                  ? "PROFILO FISCALE"
                  : "TAX PROFILE"}
              </div>

              <div
                style={{
                  marginTop: 7,
                  color: "#f8fafc",
                  fontSize: 18,
                  fontWeight: 950,
                }}
              >
                {language === "it"
                  ? "Completa il profilo fiscale"
                  : "Complete your Tax Profile"}
              </div>

              <div
                style={{
                  marginTop: 6,
                  color: "rgba(226,232,240,0.62)",
                  fontSize: 12,
                  lineHeight: 1.55,
                  fontWeight: 720,
                  maxWidth: 760,
                }}
              >
                {language === "it"
                  ? "Il tuo store può utilizzare l’analisi di redditività con trattamento IVA. Configura regime, prezzi, costi e spedizioni."
                  : "Your store is eligible for tax-aware profitability analysis. Configure VAT treatment for prices, costs and shipping."}
              </div>
            </div>

            <button
              type="button"
              className="primary-button"
              onClick={() => navigate("/app/tax-profile")}
              style={{
                whiteSpace: "nowrap",
              }}
            >
              {language === "it"
                ? "Configura Tax Profile →"
                : "Configure Tax Profile →"}
            </button>
          </div>
        ) : null}


        {/* {!billingActive ? (
          <div className="billing-banner">
            <div>
              <strong>Margin Intelligence preview mode</strong>

              <span>
                Activate your plan to unlock full margin analysis, product
                risk detection, pricing insights and recovery opportunities.
              </span>
            </div>

            <button onClick={() => navigate("/app/billing")}>
              Activate plan
            </button>
          </div>
        ) : null} */}

        <ScoreCard
          assessment={marginAssessment}
          visualLeak={visualLeak}
          visualProductsAtRisk={visualProductsAtRisk}
          visualMarginPct={visualMarginPct}
        />

        <AIProfitMonitor
          alerts={alerts}
          assessment={marginAssessment}
          navigate={navigate}
        />

        <KpiGrid
          items={[
            {
              label:
                language === "it"
                  ? "Ricavi economici"
                  : "Economic revenue",
              value: money(economicRevenue),
              note:
                language === "it"
                  ? `Base tax-aware · ultimi ${period} giorni`
                  : `Tax-aware basis · last ${period} days`,
              icon: "¤",
              tone: "positive",
            },
            {
              label:
                language === "it"
                  ? "Profitto economico"
                  : "Economic profit",
              value: money(economicProfit),
              note:
                language === "it"
                  ? `${pct(economicMarginPct)} margine economico`
                  : `${pct(economicMarginPct)} economic margin`,
              icon: "+",
              tone: economicProfit >= 0 ? "positive" : "danger",
            },
            {
              label:
                language === "it"
                  ? "Margine economico"
                  : "Economic margin",
              value: pct(economicMarginPct),
              note:
                language === "it"
                  ? `${money(economicAdjustment)} vs profitto prodotto`
                  : `${money(economicAdjustment)} vs product profit`,
              icon: "%",
              tone: economicMarginPct >= 20 ? "positive" : "warning",
            },
            {
              label:
                language === "it"
                  ? "Prodotti analizzati"
                  : "Products analyzed",
              value: String(sourceRows.length),
              note:
                language === "it"
                  ? `${visualProductsAtRisk} da controllare`
                  : `${visualProductsAtRisk} require review`,
              icon: "◈",
              tone: visualProductsAtRisk > 0 ? "warning" : "positive",
            },
          ]}
        />

        <KpiGrid
          marginBottom={24}
          items={[
            {
              label:
                language === "it"
                  ? "Perdita principale"
                  : "Biggest profit leak",
              value: worstProduct
                ? worstProduct.productTitle
                : language === "it"
                  ? "Nessuna perdita rilevata"
                  : "No losses detected",
              note: worstProduct
                ? language === "it"
                  ? `${money(Math.abs(worstProduct.profit))} perdita stimata`
                  : `${money(Math.abs(worstProduct.profit))} estimated loss`
                : language === "it"
                  ? "Tutti i prodotti sono profittevoli"
                  : "All products are profitable",
              icon: worstProduct ? "↓" : "✓",
              tone: worstProduct ? "danger" : "positive",
            },
            {
              label:
                language === "it"
                  ? "Prodotti a basso margine"
                  : "Low margin products",
              value: String(sourceRows.filter((row) => row.lowMargin).length),
              note:
                language === "it"
                  ? "Margine prodotto sotto il 10%"
                  : "Product margin below 10%",
              icon: "↓",
              tone: "warning",
            },
            {
              label:
                language === "it"
                  ? "Costi mancanti"
                  : "Missing costs",
              value: String(visualMissingCostCount),
              note:
                language === "it"
                  ? "Da correggere per una lettura affidabile"
                  : "Fix required for reliable analysis",
              icon: "⚠",
              tone: visualMissingCostCount > 0 ? "danger" : "positive",
            },
            {
              label:
                language === "it"
                  ? "Profitto recuperabile"
                  : "Recoverable profit",
              value: money(recoverableProfit),
              note:
                language === "it"
                  ? "Potenziale recupero da pricing"
                  : "Potential pricing recovery",
              icon: "+",
              tone: "warning",
            },
          ]}
        />

        <TrendChart
          chartData={chartData}
          maxChartValue={maxChartValue}
          revenuePoints={revenuePoints}
          profitPoints={profitPoints}
          visualMarginPct={visualMarginPct}
        />

        {taxContext?.isItalianStore &&
          taxContext?.configured &&
          taxAwareEconomics ? (
          <section
            className="panel"
            style={{
              marginTop: 24,
              marginBottom: 24,
              padding: 22,
              borderRadius: 22,
              background:
                "radial-gradient(circle at top left, rgba(34,197,94,0.08), transparent 35%), linear-gradient(180deg, rgba(16,23,37,0.96), rgba(7,12,21,0.98))",
              border: "1px solid rgba(34,197,94,0.20)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 18,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div
                  style={{
                    color: "#4ade80",
                    fontSize: 10,
                    fontWeight: 950,
                    textTransform: "uppercase",
                    letterSpacing: "0.11em",
                  }}
                >
                  {language === "it"
                    ? "BASE DI REDDITIVITÀ"
                    : "PROFITABILITY BASIS"}
                </div>

                <div
                  style={{
                    marginTop: 7,
                    color: "#f8fafc",
                    fontSize: 20,
                    fontWeight: 950,
                  }}
                >
                  {language === "it"
                    ? "Normalizzazione fiscale e dei costi"
                    : "Tax & cost normalization"}
                </div>

                <div
                  style={{
                    marginTop: 6,
                    color: "rgba(226,232,240,0.55)",
                    fontSize: 11,
                    lineHeight: 1.55,
                    fontWeight: 720,
                    maxWidth: 820,
                  }}
                >
                  {language === "it"
                    ? "Questa sezione spiega come MarginLab passa dal profitto prodotto osservato al profitto economico tax-aware, utilizzando i dati fiscali Shopify per le vendite e il Tax Profile configurato per i costi."
                    : "This section explains how MarginLab moves from observed product profit to tax-aware economic profit, using Shopify tax data for sales and the configured Tax Profile for costs."}
                </div>
              </div>

              <div
                style={{
                  padding: "8px 11px",
                  borderRadius: 999,
                  background: "rgba(34,197,94,0.09)",
                  border: "1px solid rgba(34,197,94,0.20)",
                  color: "#4ade80",
                  fontSize: 10,
                  fontWeight: 900,
                }}
              >
                {taxAwareEconomics.source === "shopify_actual_tax"
                  ? language === "it"
                    ? "Imposte Shopify rilevate"
                    : "Shopify tax detected"
                  : taxAwareEconomics.source === "shopify_zero_tax"
                    ? language === "it"
                      ? "Nessuna imposta applicata"
                      : "No tax applied"
                    : `${taxContext.defaultVatRatePct}% VAT`}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3,minmax(0,1fr))",
                gap: 12,
                marginTop: 18,
              }}
            >
              <div
                style={{
                  padding: 17,
                  borderRadius: 17,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <div
                  style={{
                    color: "rgba(226,232,240,0.46)",
                    fontSize: 9,
                    fontWeight: 950,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {language === "it"
                    ? "Profitto prima della normalizzazione"
                    : "Profit before normalization"}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    color: "#f8fafc",
                    fontSize: 25,
                    fontWeight: 950,
                  }}
                >
                  {money(taxAwareEconomics.profitBeforeTaxAdjustment)}
                </div>
              </div>

              <div
                style={{
                  padding: 17,
                  borderRadius: 17,
                  background: "rgba(34,197,94,0.055)",
                  border: "1px solid rgba(34,197,94,0.16)",
                }}
              >
                <div
                  style={{
                    color: "rgba(226,232,240,0.46)",
                    fontSize: 9,
                    fontWeight: 950,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {language === "it" ? "Profitto economico" : "Economic profit"}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    color:
                      taxAwareEconomics.realProfit >= 0
                        ? "#4ade80"
                        : "#ff9a70",
                    fontSize: 25,
                    fontWeight: 950,
                  }}
                >
                  {money(taxAwareEconomics.realProfit)}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    color: "rgba(226,232,240,0.48)",
                    fontSize: 10,
                    fontWeight: 750,
                  }}
                >
                  {pct(taxAwareEconomics.realMarginPct)}{" "}
                  {language === "it" ? "margine economico" : "economic margin"}
                </div>
              </div>

              <div
                style={{
                  padding: 17,
                  borderRadius: 17,
                  background:
                    taxAwareEconomics.vatImpactOnProfit < 0
                      ? "rgba(255,115,60,0.045)"
                      : "rgba(34,197,94,0.045)",
                  border:
                    taxAwareEconomics.vatImpactOnProfit < 0
                      ? "1px solid rgba(255,115,60,0.16)"
                      : "1px solid rgba(34,197,94,0.16)",
                }}
              >
                <div
                  style={{
                    color: "rgba(226,232,240,0.46)",
                    fontSize: 9,
                    fontWeight: 950,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {language === "it"
                    ? "Impatto della normalizzazione"
                    : "Normalization impact"}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    color:
                      taxAwareEconomics.vatImpactOnProfit < 0
                        ? "#ff9a70"
                        : "#4ade80",
                    fontSize: 25,
                    fontWeight: 950,
                  }}
                >
                  {money(taxAwareEconomics.vatImpactOnProfit)}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    color: "rgba(226,232,240,0.48)",
                    fontSize: 10,
                    fontWeight: 750,
                  }}
                >
                  {language === "it"
                    ? "Differenza rispetto al profitto prodotto osservato"
                    : "Difference versus observed product profit"}
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginTop: 14,
              }}
            >
              <div
                style={{
                  padding: "7px 10px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  color: "rgba(226,232,240,0.60)",
                  fontSize: 9,
                  fontWeight: 850,
                }}
              >
                {language === "it"
                  ? "IVA acquisti recuperabile"
                  : "Input VAT recovery"}
                {" · "}
                {taxContext.inputVatRecoveryPct}%
              </div>

              <div
                style={{
                  padding: "7px 10px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  color: "rgba(226,232,240,0.60)",
                  fontSize: 9,
                  fontWeight: 850,
                }}
              >
                {language === "it" ? "Affidabilità" : "Confidence"}
                {" · "}
                {taxAwareEconomics.confidence === "high"
                  ? language === "it"
                    ? "Alta"
                    : "High"
                  : taxAwareEconomics.confidence}
              </div>

              <div
                style={{
                  padding: "7px 10px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  color: "rgba(226,232,240,0.60)",
                  fontSize: 9,
                  fontWeight: 850,
                }}
              >
                {language === "it" ? "COGS economici" : "Economic COGS"}
                {" · "}
                {money(taxAwareEconomics.economicCogs)}
              </div>
            </div>
          </section>
        ) : null}

        <section
          className="panel"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1.25fr) minmax(280px,0.75fr)",
            gap: 22,
            alignItems: "stretch",
          }}
        >
          <div>
            <div className="section-eyebrow">
              {language === "it" ? "RIEPILOGO ESECUTIVO" : "EXECUTIVE SUMMARY"}
            </div>

            <div
              className="section-title"
              style={{ marginTop: 8, fontSize: 28 }}
            >
              {language === "it"
                ? "Le informazioni che contano oggi"
                : "What matters today"}
            </div>

            <div
              style={{
                marginTop: 11,
                maxWidth: 760,
                color: "rgba(226,232,240,0.72)",
                fontSize: 14,
                lineHeight: 1.7,
                fontWeight: 720,
              }}
            >
              {language === "it"
                ? `MarginLab ha rilevato ${alertCounts.critical} rischi critici, ${alertCounts.warning} avvisi e ${alertCounts.opportunity} opportunità. Il profitto recuperabile stimato nel periodo è ${money(recoverableProfit)}.`
                : `MarginLab detected ${alertCounts.critical} critical risks, ${alertCounts.warning} warnings and ${alertCounts.opportunity} opportunities. Estimated recoverable profit for the period is ${money(recoverableProfit)}.`}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4,minmax(0,1fr))",
                gap: 11,
                marginTop: 20,
              }}
            >
              {[
                {
                  label: language === "it" ? "Critici" : "Critical",
                  value: alertCounts.critical,
                  color: "#ff6b4a",
                },
                {
                  label: language === "it" ? "Avvisi" : "Warnings",
                  value: alertCounts.warning,
                  color: "#f59e0b",
                },
                {
                  label: language === "it" ? "Opportunità" : "Opportunities",
                  value: alertCounts.opportunity,
                  color: "#22c55e",
                },
                {
                  label: language === "it" ? "A rischio" : "At risk",
                  value: visualProductsAtRisk,
                  color: "#38bdf8",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    padding: 15,
                    borderRadius: 16,
                    background: "rgba(255,255,255,0.035)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <div
                    style={{
                      color: "rgba(226,232,240,0.48)",
                      fontSize: 9,
                      fontWeight: 950,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                    }}
                  >
                    {item.label}
                  </div>
                  <div
                    style={{
                      marginTop: 7,
                      color: item.color,
                      fontSize: 24,
                      lineHeight: 1,
                      fontWeight: 950,
                    }}
                  >
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              padding: 20,
              borderRadius: 20,
              background:
                "radial-gradient(circle at top right, rgba(255,115,60,0.10), transparent 42%), rgba(5,10,18,0.55)",
              border: "1px solid rgba(255,115,60,0.20)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div
                style={{
                  color: "#ff9a70",
                  fontSize: 10,
                  fontWeight: 950,
                  textTransform: "uppercase",
                  letterSpacing: "0.11em",
                }}
              >
                {language === "it" ? "PROSSIMA DECISIONE" : "NEXT DECISION"}
              </div>

              <div
                style={{
                  marginTop: 10,
                  color: "#f8fafc",
                  fontSize: 19,
                  lineHeight: 1.35,
                  fontWeight: 950,
                }}
              >
                {primaryAlert?.title ??
                  (language === "it"
                    ? "Nessuna azione urgente rilevata"
                    : "No urgent action detected")}
              </div>

              <div
                style={{
                  marginTop: 8,
                  color: "rgba(226,232,240,0.56)",
                  fontSize: 12,
                  lineHeight: 1.55,
                  fontWeight: 720,
                }}
              >
                {primaryAlert?.description ??
                  (language === "it"
                    ? "Continua a monitorare margini, costi e opportunità."
                    : "Continue monitoring margins, costs and opportunities.")}
              </div>
            </div>

            <button
              type="button"
              className="primary-button"
              style={{ width: "100%", justifyContent: "center", marginTop: 18 }}
              onClick={() => navigate(primaryAlert?.route ?? "/app/ai-advisor")}
            >
              {primaryAlert?.actionLabel ??
                (language === "it"
                  ? "Apri Profit Copilot"
                  : "Open Profit Copilot")}
              {" →"}
            </button>
          </div>
        </section>

        <TopLeaksPanel
          topLeaks={topLeaks}
          severityColor={severityColor}
          severityBackground={severityBackground}
          severityBorder={severityBorder}
        />
      </div>
    </div>
  );
}