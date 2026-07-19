import * as React from "react";
import { useFetcher, useLoaderData, useNavigate } from "react-router";

import prisma from "~/db.server";
import DashboardNav from "~/components/dashboard/DashboardNav";
import BusinessPriorities from "~/components/dashboard/BusinessPriorities";

import { generateProfitAlerts } from "~/utils/profit-monitor";
import { authenticate } from "~/shopify.server";
import { loadMarginDashboardData } from "~/utils/margin.server";

import {
  generateAiMarginAnalysis,
  generateAiAnswer,
} from "~/utils/openai.server";

import type { LoaderData } from "~/utils/margin";

import {
  getStoredLanguage,
  type Language,
} from "~/utils/i18n";

import "~/styles/dashboard.css";

type SelectedQuestion =
  | "profitRisk"
  | "marginPressure"
  | "priority"
  | "fastestImprovement"
  | "productPriorities"
  | "pricingOpportunity"
  | "hiddenCosts"
  | "growthOpportunity";

export async function loader({ request }: { request: Request }) {
  const { admin, session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const period = url.searchParams.get("period") ?? "30";

  const dashboardData = await loadMarginDashboardData({
    admin,
    session,
    period,
  });

  const assumptions =
    (await prisma.profitAssumptions.findUnique({
      where: {
        shop: session.shop,
      },
    })) ?? null;

  return {
    ...dashboardData,
    assumptions,
  };
}

export async function action({ request }: { request: Request }) {
  await authenticate.admin(request);

  const formData = await request.formData();

  const intent = String(formData.get("intent") || "analysis");
  const storeSummary = String(formData.get("storeSummary") || "");

  const submittedLanguage = String(formData.get("language") || "en");

  const language: Language =
    submittedLanguage === "it" ? "it" : "en";

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
Do not generate a complete business analysis.
`;

    return generateAiAnswer({
      question,
      context,
      language,
    });
  }

  return generateAiMarginAnalysis({
    storeSummary,
    language,
  });
}

export default function AiAdvisorPage() {
  const navigate = useNavigate();
  const language = getStoredLanguage();

  const aiFetcher = useFetcher<{ text: string }>();
  const askFetcher = useFetcher<{ text: string }>();

  const [question, setQuestion] = React.useState("");
  const [selectedQuestion, setSelectedQuestion] =
    React.useState<SelectedQuestion>("profitRisk");
  const [showAiReport, setShowAiReport] = React.useState(false);

  const { summary, rows, assumptions, period } =
    useLoaderData() as LoaderData & {
      assumptions: {
        monthlyAds: number;
        monthlyShipping: number;
        monthlyOperating: number;
        paymentFeePct: number;
        transactionFeePct: number;
        taxReservePct: number;
      } | null;
    };

  React.useEffect(() => {
    if (aiFetcher.data?.text) {
      setShowAiReport(true);
    }
  }, [aiFetcher.data]);

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
          alert.severity === "critical" ||
          alert.severity === "warning",
      ),
    [profitAlerts],
  );

  const criticalAlerts = React.useMemo(
    () =>
      profitAlerts.filter(
        (alert) => alert.severity === "critical",
      ),
    [profitAlerts],
  );

  const opportunityAlerts = React.useMemo(
    () =>
      profitAlerts.filter(
        (alert) => alert.severity === "opportunity",
      ),
    [profitAlerts],
  );

  const missionAlert =
    profitAlerts.find(
      (alert) => alert.severity === "critical",
    ) ??
    profitAlerts.find(
      (alert) => alert.severity === "warning",
    ) ??
    profitAlerts.find(
      (alert) => alert.severity === "opportunity",
    ) ??
    profitAlerts[0] ??
    null;

  /*
  |--------------------------------------------------------------------------
  | CORE PRODUCT DATA
  |--------------------------------------------------------------------------
  */

  const losingProducts = rows.filter((row) => row.losing);

  const missingCostProducts = rows.filter(
    (row) => row.missingCost,
  );

  const lowMarginProducts = rows.filter(
    (row) => row.lowMargin,
  );

  const topProfitLeak =
    rows.length > 0
      ? [...rows].sort((a, b) => a.profit - b.profit)[0]
      : undefined;

  const recoverableProfit = rows.reduce(
    (sum, row) =>
      sum + Math.max(0, row.targetDelta) * row.qty,
    0,
  );

  /*
  |--------------------------------------------------------------------------
  | BUSINESS MODEL ASSUMPTIONS
  |--------------------------------------------------------------------------
  */

  const monthlyAds = assumptions?.monthlyAds ?? 0;
  const monthlyShipping = assumptions?.monthlyShipping ?? 0;
  const monthlyOperating = assumptions?.monthlyOperating ?? 0;

  const paymentFeePct = assumptions?.paymentFeePct ?? 0;
  const transactionFeePct =
    assumptions?.transactionFeePct ?? 0;
  const taxReservePct = assumptions?.taxReservePct ?? 0;

  const estimatedPaymentFees =
    summary.revenue * (paymentFeePct / 100);

  const estimatedTransactionFees =
    summary.revenue * (transactionFeePct / 100);

  const estimatedTaxReserve =
    summary.revenue * (taxReservePct / 100);

  const totalEstimatedCosts =
    monthlyAds +
    monthlyShipping +
    monthlyOperating +
    estimatedPaymentFees +
    estimatedTransactionFees +
    estimatedTaxReserve;

  const estimatedNetProfit =
    summary.profit - totalEstimatedCosts;

  const estimatedNetMargin =
    summary.revenue > 0
      ? (estimatedNetProfit / summary.revenue) * 100
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
    language === "it"
      ? healthScore < 40
        ? "Rischio elevato"
        : healthScore < 70
          ? "Rischio moderato"
          : "Sano"
      : healthScore < 40
        ? "High Risk"
        : healthScore < 70
          ? "Moderate Risk"
          : "Healthy";

  const healthColor =
    healthScore < 40
      ? "#ff6b4a"
      : healthScore < 70
        ? "#f59e0b"
        : "#22c55e";

  /*
  |--------------------------------------------------------------------------
  | PRODUCT PRIORITIZATION
  |--------------------------------------------------------------------------
  */

  const prioritizedProducts = [...rows]
    .filter((row) => row.revenue > 0)
    .map((row) => {
      const recoverableOpportunity =
        Math.max(0, row.targetDelta) * row.qty;

      const priorityScore =
        recoverableOpportunity +
        Math.max(0, -row.profit) +
        (row.revenue * Math.max(0, 20 - row.marginPct)) /
        100;

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
    (sum, product) =>
      sum + product.recoverableOpportunity,
    0,
  );

  const priorityConcentration =
    recoverableProfit > 0
      ? Math.min(
        100,
        (priorityImpact / recoverableProfit) * 100,
      )
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
      (activeRiskAlerts.some(
        (alert) => alert.severity === "warning",
      )
        ? 1
        : 0) +
      (opportunityAlerts.length > 0 ? 1 : 0),
    ),
  );

  const weeklyReport = {
    title:
      missionAlert?.title ??
      (language === "it"
        ? "Continua a monitorare la redditività dello store"
        : "Continue monitoring store profitability"),

    recommendation:
      missionAlert?.actionLabel ??
      (language === "it"
        ? "Controlla periodicamente rischi e opportunità"
        : "Review risks and opportunities regularly"),

    route:
      missionAlert?.route ?? "/app/recommendations",
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
    ? language === "it"
      ? `${primaryProfitAlert.title}. ${primaryProfitAlert.description}`
      : `${primaryProfitAlert.title}. ${primaryProfitAlert.description}`
    : language === "it"
      ? "Profit Monitor non ha rilevato rischi urgenti. La struttura di profitto appare stabile sui dati disponibili."
      : "Profit Monitor detected no urgent risks. The profit structure appears stable based on the available data.";

  /*
  |--------------------------------------------------------------------------
  | DECISION FEED
  |--------------------------------------------------------------------------
  |
  | Every feed item now comes directly from Profit Monitor.
  |
  */

  const getDecisionFeedColor = (
    severity: string,
  ): string => {
    if (severity === "critical") return "#ff6b4a";
    if (severity === "warning") return "#f59e0b";
    if (severity === "opportunity") return "#22c55e";
    return "#38bdf8";
  };

  const getDecisionFeedWhen = (
    severity: string,
  ): string => {
    if (severity === "opportunity") {
      return language === "it"
        ? "Nuova opportunità"
        : "New opportunity";
    }

    if (severity === "critical") {
      return language === "it"
        ? "Priorità immediata"
        : "Immediate priority";
    }

    if (severity === "warning") {
      return language === "it"
        ? "Da controllare"
        : "Needs review";
    }

    return language === "it"
      ? "Segnale attivo"
      : "Active signal";
  };

  const decisionFeed = profitAlerts
    .slice(0, 5)
    .map((alert) => ({
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
        100 -
        losingProducts.length * 18 -
        lowMarginProducts.length * 5,
      ),
    ),
  );

  const dataQualityScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 - missingCostProducts.length * 12,
      ),
    ),
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
        activeRiskAlerts.filter(
          (alert) => alert.severity === "warning",
        ).length *
        8 -
        (opportunityAlerts.length > 0 ? 5 : 0),
      ),
    ),
  );

  const scorecards = [
    {
      key: "health",
      label:
        language === "it"
          ? "Salute store"
          : "Store Health",
      value: healthScore,
      color: healthColor,
    },
    {
      key: "profit",
      label:
        language === "it"
          ? "Qualità profitto"
          : "Profit Quality",
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
      label:
        language === "it"
          ? "Efficienza prezzi"
          : "Pricing Efficiency",
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
      label:
        language === "it"
          ? "Qualità dei dati"
          : "Data Quality",
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
      label:
        language === "it"
          ? "Prontezza operativa"
          : "Execution Readiness",
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

Respond in ${language === "it" ? "Italian" : "English"}.

Analyze this Shopify store profitability data.

Use only the supplied data.

Do not invent numbers.

Do not invent products.

Never translate product names.

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

Revenue: ${summary.revenue}
Gross Profit: ${summary.profit}
Gross Margin: ${summary.marginPct}%

Previous Gross Margin: ${summary.previousMarginPct}
Margin Change: ${summary.marginDelta}%

Revenue Change: ${summary.revenueDeltaPct}%

Discounts: ${summary.discounts}
Refunds: ${summary.refunds}

Recoverable profit: ${recoverableProfit}

ACTIVE PROFIT MONITOR COUNTS

Critical events: ${criticalAlerts.length}
Warning events: ${activeRiskAlerts.filter(
    (alert) => alert.severity === "warning",
  ).length
    }
Opportunity events: ${opportunityAlerts.length}
Total active risks: ${activeRiskAlerts.length}

ESTIMATED NET PROFIT

Monthly advertising spend: ${monthlyAds}
Monthly shipping costs: ${monthlyShipping}
Monthly operating costs: ${monthlyOperating}

Payment processing fee percentage: ${paymentFeePct}%
Transaction fee percentage: ${transactionFeePct}%
Tax reserve percentage: ${taxReservePct}%

Estimated payment fees: ${estimatedPaymentFees}
Estimated transaction fees: ${estimatedTransactionFees}
Estimated tax reserve: ${estimatedTaxReserve}

Total estimated costs outside product costs: ${totalEstimatedCosts}

Estimated net profit: ${estimatedNetProfit}
Estimated net margin: ${estimatedNetMargin}%

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

${[...losingProducts]
      .slice(0, 3)
      .map(
        (product) =>
          `${product.productTitle} | Revenue ${product.revenue.toFixed(
            2,
          )} | Profit ${product.profit.toFixed(
            2,
          )} | Margin ${product.marginPct.toFixed(1)}%`,
      )
      .join("\n") || "None"
    }

TOP LOW-MARGIN PRODUCTS

${[...lowMarginProducts]
      .slice(0, 3)
      .map(
        (product) =>
          `${product.productTitle} | Revenue ${product.revenue.toFixed(
            2,
          )} | Profit ${product.profit.toFixed(
            2,
          )} | Margin ${product.marginPct.toFixed(1)}%`,
      )
      .join("\n") || "None"
    }

TOP RECOVERY OPPORTUNITIES

${[...rows]
      .filter((row) => row.targetDelta > 0)
      .sort(
        (a, b) =>
          b.targetDelta * b.qty -
          a.targetDelta * a.qty,
      )
      .slice(0, 3)
      .map(
        (product) =>
          `${product.productTitle} | Revenue ${product.revenue.toFixed(
            2,
          )} | Margin ${product.marginPct.toFixed(
            1,
          )}% | Potential Recovery ${(
            product.targetDelta * product.qty
          ).toFixed(0)}`,
      )
      .join("\n") || "None"
    }

PRIORITIZED PRODUCTS

${prioritizedProducts.length > 0
      ? prioritizedProducts
        .map(
          (product, index) => `
PRIORITY ${index + 1}

Product: ${product.productTitle}
Revenue: ${product.revenue}
Quantity sold: ${product.qty}
Profit: ${product.profit}
Margin: ${product.marginPct}%
Average price: ${product.avgPrice}
Average cost: ${product.avgCost}
Target price: ${product.targetPrice}
Price adjustment needed: ${product.targetDelta}
Recoverable opportunity: ${product.recoverableOpportunity}
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
- where the biggest recovery opportunity exists
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
- Mention revenue, margin and recoverable opportunity when available.
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
- Mention recoverable profit opportunities.
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
            ? "Come posso recuperare questo profitto?"
            : "How can I recover this profit?"
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
          ? "Qual è la migliore opportunità di prezzo?"
          : "What is the best pricing opportunity?",
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

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardNav active="ai-advisor" navigate={navigate} />

        <div className="hero-header">
          <div>
            <div className="alert-pill">
              <span className="alert-dot" />
              {language === "it" ? "Funzione Growth" : "Growth Feature"}
            </div>

            <div className="eyebrow">
              {language === "it" ? "PROFIT COPILOT" : "PROFIT COPILOT"}
            </div>

            <div className="hero-title">
              {language === "it"
                ? "Il briefing operativo del tuo store, già pronto"
                : "Your store briefing, already prepared"}
            </div>

            <div className="hero-description">
              {language === "it"
                ? "MarginLab analizza automaticamente redditività, rischi, opportunità e priorità. Prima ti dice cosa conta, poi risponde alle tue domande."
                : "MarginLab automatically analyzes profitability, risk, opportunities and priorities. It tells you what matters first, then answers your questions."}
            </div>
          </div>

          <button
            className="primary-button"
            onClick={() => navigate("/app/billing")}
            style={{
              boxShadow:
                "0 12px 32px rgba(255,115,80,0.28), 0 0 30px rgba(255,115,80,0.15)",
            }}
          >
            {language === "it" ? "Sblocca Growth →" : "Unlock Growth →"}
          </button>
        </div>

        <div
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
              gridTemplateColumns: "1.2fr 0.8fr",
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
                {language === "it"
                  ? "BRIEFING ESECUTIVO"
                  : "EXECUTIVE BRIEF"}
              </div>

              <div
                style={{
                  marginTop: 14,
                  color: "#f8fafc",
                  fontSize: 32,
                  fontWeight: 950,
                  lineHeight: 1.15,
                  letterSpacing: "-0.04em",
                  maxWidth: 850,
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
                      ? language === "it"
                        ? "Priorità critica"
                        : "Critical Priority"
                      : primaryProfitAlert.severity === "warning"
                        ? language === "it"
                          ? "Priorità da controllare"
                          : "Priority to Review"
                        : primaryProfitAlert.severity === "opportunity"
                          ? language === "it"
                            ? "Opportunità rilevata"
                            : "Opportunity Detected"
                          : language === "it"
                            ? "Segnale Profit Monitor"
                            : "Profit Monitor Signal"}
                  </div>

                  <div
                    style={{
                      color: "rgba(255,255,255,0.48)",
                      fontSize: 11,
                      fontWeight: 750,
                    }}
                  >
                    {language === "it"
                      ? "Priorità determinata dal Profit Monitor"
                      : "Priority determined by Profit Monitor"}
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
                    label:
                      language === "it"
                        ? "Profitto netto stimato"
                        : "Estimated Net Profit",
                    value: `$${estimatedNetProfit.toFixed(0)}`,
                    note: `${estimatedNetMargin.toFixed(1)}%`,
                    color:
                      estimatedNetProfit >= 0 ? "#22c55e" : "#ff6b4a",
                  },
                  {
                    label:
                      language === "it"
                        ? "Profitto recuperabile"
                        : "Recoverable Profit",
                    value: `+$${recoverableProfit.toFixed(0)}`,
                    note:
                      language === "it"
                        ? `${prioritizedProducts.length} priorità prodotto`
                        : `${prioritizedProducts.length} product priorities`,
                    color: "#22c55e",
                  },
                  {
                    label:
                      language === "it"
                        ? "Rischi attivi"
                        : "Active Risks",
                    value: `${activeRiskAlerts.length}`,
                    note:
                      language === "it"
                        ? `${criticalAlerts.length} critici`
                        : `${criticalAlerts.length} critical`,
                    color:
                      criticalAlerts.length > 0
                        ? "#ff6b4a"
                        : activeRiskAlerts.length > 0
                          ? "#f59e0b"
                          : "#22c55e",
                  },
                  {
                    label:
                      language === "it"
                        ? "Missione settimanale"
                        : "Weekly Mission",
                    value: `${missionActions}`,
                    note:
                      language === "it"
                        ? `${missionMinutes} minuti stimati`
                        : `${missionMinutes} estimated minutes`,
                    color: "#38bdf8",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      minWidth: 0,
                      padding: 18,
                      borderRadius: 18,
                      background: "rgba(255,255,255,0.035)",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    <div
                      style={{
                        color: "rgba(255,255,255,0.43)",
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
                        marginTop: 9,
                        color: item.color,
                        fontSize: 25,
                        fontWeight: 950,
                        lineHeight: 1,
                        letterSpacing: "-0.03em",
                      }}
                    >
                      {item.value}
                    </div>

                    <div
                      style={{
                        marginTop: 7,
                        color: "rgba(255,255,255,0.52)",
                        fontSize: 11,
                        fontWeight: 780,
                      }}
                    >
                      {item.note}
                    </div>
                  </div>
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
                  {language === "it"
                    ? "Apri il piano operativo →"
                    : "Open Action Plan →"}
                </button>

                <button
                  type="button"
                  className="apply-button"
                  onClick={() => navigate("/app/recovery-simulator")}
                >
                  {language === "it"
                    ? "Simula il recupero"
                    : "Simulate Recovery"}
                </button>

                <button
                  type="button"
                  className="apply-button"
                  onClick={() => navigate("/app/forecasting")}
                >
                  {language === "it"
                    ? "Verifica la previsione"
                    : "Open Forecast"}
                </button>
              </div>
            </div>

            <div
              style={{
                borderRadius: 26,
                padding: 24,
                background:
                  "radial-gradient(circle at center, rgba(34,197,94,0.13), transparent 42%), rgba(255,255,255,0.025)",
                border: "1px solid rgba(34,197,94,0.18)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: 188,
                    height: 188,
                    margin: "0 auto",
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    background: `conic-gradient(${healthColor} ${healthScore * 3.6
                      }deg, rgba(255,255,255,0.08) 0deg)`,
                    boxShadow: `0 0 54px ${healthColor}22`,
                  }}
                >
                  <div
                    style={{
                      width: 148,
                      height: 148,
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      background:
                        "linear-gradient(180deg, rgba(14,21,34,1), rgba(7,12,21,1))",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          color: "#f8fafc",
                          fontSize: 52,
                          fontWeight: 950,
                          lineHeight: 1,
                          letterSpacing: "-0.05em",
                        }}
                      >
                        {healthScore}
                      </div>
                      <div
                        style={{
                          marginTop: 7,
                          color: healthColor,
                          fontSize: 10,
                          fontWeight: 950,
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                        }}
                      >
                        {language === "it"
                          ? "Salute dello store"
                          : "Store Health"}
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 18,
                    color: "#f8fafc",
                    fontSize: 20,
                    fontWeight: 950,
                  }}
                >
                  {healthLabel}
                </div>

                <div
                  style={{
                    marginTop: 7,
                    color: "rgba(255,255,255,0.52)",
                    fontSize: 12,
                    fontWeight: 750,
                  }}
                >
                  {language === "it"
                    ? "Valutazione aggiornata sui dati attuali"
                    : "Updated from current store data"}
                </div>
              </div>
            </div>
          </div>
        </div>

        <BusinessPriorities
          alerts={profitAlerts}
          navigate={navigate}
          maxItems={3}
        />

        <div
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
                  color: "rgba(255,255,255,0.45)",
                  fontSize: 9,
                  fontWeight: 950,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                {card.label}
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
          style={{
            marginTop: 24,
            display: "grid",
            gridTemplateColumns: "0.9fr 1.1fr",
            gap: 22,
          }}
        >
          <div
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
              {language === "it"
                ? "MISSIONE DELLA SETTIMANA"
                : "WEEKLY MISSION"}
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
                  label: language === "it" ? "Azioni" : "Actions",
                  value: `${missionActions}`,
                  color: "#f8fafc",
                },
                {
                  label:
                    language === "it" ? "Tempo stimato" : "Estimated Time",
                  value: `${missionMinutes}m`,
                  color: "#38bdf8",
                },
                {
                  label:
                    language === "it" ? "Potenziale" : "Potential",
                  value: `+$${recoverableProfit.toFixed(0)}`,
                  color: "#22c55e",
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
                      color: "rgba(255,255,255,0.42)",
                      fontSize: 9,
                      fontWeight: 950,
                      textTransform: "uppercase",
                    }}
                  >
                    {item.label}
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
              {missionAlert?.actionLabel ??
                (language === "it"
                  ? "Apri il piano operativo →"
                  : "Open Action Plan →")}
            </button>
          </div>

          <div className="panel" style={{ margin: 0, padding: 24 }}>
            <div className="panel-eyebrow">
              {language === "it"
                ? "FEED DELLE DECISIONI"
                : "DECISION FEED"}
            </div>

            <h2 className="panel-title" style={{ marginTop: 6 }}>
              {language === "it"
                ? "I segnali che richiedono attenzione"
                : "Signals that need attention"}
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
                  {language === "it"
                    ? "Nessun nuovo segnale critico."
                    : "No new critical signals."}
                </div>
              )}
            </div>
          </div>

          <div
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
                  {language === "it"
                    ? "ANALISI APPROFONDITA"
                    : "DEEP ANALYSIS"}
                </div>

                <div
                  style={{
                    marginTop: 8,
                    color: "#f8fafc",
                    fontSize: 22,
                    fontWeight: 950,
                  }}
                >
                  {language === "it"
                    ? "Genera il report completo del consulente"
                    : "Generate the full advisor report"}
                </div>

                <div
                  style={{
                    marginTop: 6,
                    color: "rgba(255,255,255,0.54)",
                    fontSize: 12,
                    fontWeight: 730,
                  }}
                >
                  {language === "it"
                    ? "L'AI utilizzerà tutti i dati reali già caricati nella pagina."
                    : "AI will use all real store data already loaded on this page."}
                </div>
              </div>

              <aiFetcher.Form
                method="post"
                onSubmit={() => setShowAiReport(false)}
              >
                <input type="hidden" name="storeSummary" value={aiPrompt} />
                <input type="hidden" name="language" value={language} />

                <button
                  type="submit"
                  className="primary-button"
                  disabled={aiFetcher.state !== "idle"}
                >
                  {aiFetcher.state !== "idle"
                    ? language === "it"
                      ? "Analisi in corso..."
                      : "Analyzing..."
                    : language === "it"
                      ? "Genera analisi AI →"
                      : "Generate AI Analysis →"}
                </button>
              </aiFetcher.Form>
            </div>

            {showAiReport && aiFetcher.data?.text && (
              <div
                style={{
                  marginTop: 20,
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
            )}
          </div>

          <div
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
              style={{
                color: "#ff9a70",
                fontSize: 11,
                fontWeight: 950,
                letterSpacing: "0.13em",
                textTransform: "uppercase",
              }}
            >
              {language === "it" ? "CHIEDI AL COPILOTA" : "ASK THE COPILOT"}
            </div>

            <div
              style={{
                marginTop: 8,
                color: "#f8fafc",
                fontSize: 22,
                fontWeight: 950,
              }}
            >
              {language === "it"
                ? "Approfondisci una decisione specifica"
                : "Explore a specific decision"}
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
              {language === "it"
                ? "Le domande cambiano in base ai rischi e alle opportunità rilevate nello store."
                : "Questions adapt to the risks and opportunities detected in your store."}
            </div>

            <div
              style={{
                marginTop: 18,
                display: "grid",
                gridTemplateColumns: "repeat(4,minmax(0,1fr))",
                gap: 11,
              }}
            >
              {dynamicQuestions.map((presetQuestion) => (
                <button
                  key={presetQuestion.id}
                  type="button"
                  onClick={() => {
                    setSelectedQuestion(
                      presetQuestion.id as SelectedQuestion,
                    );
                    setQuestion(presetQuestion.label);

                    const formData = new FormData();
                    formData.append("intent", "ask");
                    formData.append("question", presetQuestion.label);
                    formData.append("storeSummary", aiPrompt);
                    formData.append("language", language);

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
                  {presetQuestion.label}
                </button>
              ))}
            </div>

            <askFetcher.Form method="post">
              <input type="hidden" name="intent" value="ask" />
              <input type="hidden" name="storeSummary" value={aiPrompt} />
              <input type="hidden" name="language" value={language} />

              <div
                style={{
                  marginTop: 16,
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 11,
                }}
              >
                <input
                  name="question"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder={
                    language === "it"
                      ? "Fai una domanda sulla redditività..."
                      : "Ask a profitability question..."
                  }
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
                    ? language === "it"
                      ? "Elaborazione..."
                      : "Thinking..."
                    : language === "it"
                      ? "Chiedi all'AI →"
                      : "Ask AI →"}
                </button>
              </div>
            </askFetcher.Form>

            {askFetcher.data?.text && (
              <div
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
            {language === "it"
              ? "Profit Copilot utilizza esclusivamente i dati Shopify, le ipotesi di costo e i segnali di redditività disponibili. Le raccomandazioni sono supporto decisionale e non modificano automaticamente prezzi, prodotti o campagne."
              : "Profit Copilot uses only available Shopify data, saved cost assumptions and profitability signals. Recommendations support decisions and do not automatically change products, pricing or campaigns."}
          </div>
        </div>
      </div>
    </div>
  );
}