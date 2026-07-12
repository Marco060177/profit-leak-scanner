import * as React from "react";
import { useFetcher, useLoaderData, useNavigate } from "react-router";

import prisma from "~/db.server";
import DashboardNav from "~/components/dashboard/DashboardNav";
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
Current store profitability data:

${storeSummary}

The user is asking a specific question.
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

  const { summary, rows, assumptions } = useLoaderData() as LoaderData & {
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

  const losingProducts = rows.filter((row) => row.losing);
  const missingCostProducts = rows.filter((row) => row.missingCost);
  const lowMarginProducts = rows.filter((row) => row.lowMargin);

  const topProfitLeak =
    rows.length > 0
      ? [...rows].sort((a, b) => a.profit - b.profit)[0]
      : undefined;

  const recoverableProfit = rows.reduce(
    (sum, row) => sum + Math.max(0, row.targetDelta) * row.qty,
    0,
  );

  const monthlyAds = assumptions?.monthlyAds ?? 0;
  const monthlyShipping = assumptions?.monthlyShipping ?? 0;
  const monthlyOperating = assumptions?.monthlyOperating ?? 0;

  const paymentFeePct = assumptions?.paymentFeePct ?? 0;
  const transactionFeePct = assumptions?.transactionFeePct ?? 0;
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

  const weeklyReport = {
    health: healthLabel,

    mainRisk: topProfitLeak
      ? topProfitLeak.productTitle
      : language === "it"
        ? "Nessun rischio critico rilevato"
        : "No critical product risk detected",

    opportunity:
      recoverableProfit > 0
        ? language === "it"
          ? `$${recoverableProfit.toFixed(0)} di profitto recuperabile individuato`
          : `$${recoverableProfit.toFixed(0)} recoverable profit identified`
        : language === "it"
          ? "Nessuna opportunità di recupero significativa rilevata"
          : "No significant recovery opportunity detected",

    recommendation:
      missingCostProducts.length > 0
        ? language === "it"
          ? `Completa i costi mancanti di ${missingCostProducts.length} prodotti`
          : `Complete cost data for ${missingCostProducts.length} products`
        : topProfitLeak
          ? language === "it"
            ? `Controlla prezzi e costi di ${topProfitLeak.productTitle}`
            : `Review pricing and costs for ${topProfitLeak.productTitle}`
          : language === "it"
            ? "Continua a monitorare l'andamento della redditività"
            : "Continue monitoring profitability trends",
  };

  const marginAlerts = [
    losingProducts.length > 0
      ? {
        level: "Critical",
        levelLabel: language === "it" ? "Critico" : "Critical",
        message:
          language === "it"
            ? `${losingProducts.length} prodotti sono attualmente venduti sotto costo.`
            : `${losingProducts.length} products are currently selling below cost.`,
      }
      : null,

    missingCostProducts.length > 0
      ? {
        level: "Warning",
        levelLabel: language === "it" ? "Avviso" : "Warning",
        message:
          language === "it"
            ? `${missingCostProducts.length} prodotti non hanno un costo registrato.`
            : `${missingCostProducts.length} products are missing cost data.`,
      }
      : null,

    summary.refunds > 0
      ? {
        level: "Notice",
        levelLabel: language === "it" ? "Segnalazione" : "Notice",
        message:
          language === "it"
            ? `I rimborsi hanno ridotto i ricavi di $${summary.refunds.toFixed(2)}.`
            : `Refunds reduced revenue by $${summary.refunds.toFixed(2)}.`,
      }
      : null,

    recoverableProfit > 0
      ? {
        level: "Opportunity",
        levelLabel: language === "it" ? "Opportunità" : "Opportunity",
        message:
          language === "it"
            ? `Rilevata un'opportunità di recupero pari a $${recoverableProfit.toFixed(
              0,
            )}.`
            : `$${recoverableProfit.toFixed(
              0,
            )} recoverable profit opportunity detected.`,
      }
      : null,
  ].filter(
    (
      alert,
    ): alert is { level: string; levelLabel: string; message: string } =>
      alert !== null,
  );

  const healthColor =
    healthScore < 40 ? "#ff6b4a" : healthScore < 70 ? "#f59e0b" : "#22c55e";

  const aiFindings = [
    losingProducts.length > 0
      ? language === "it"
        ? `${losingProducts.length} prodotti sono attualmente venduti sotto costo.`
        : `${losingProducts.length} products are currently selling below cost.`
      : null,
    missingCostProducts.length > 0
      ? language === "it"
        ? `${missingCostProducts.length} prodotti non hanno un costo registrato.`
        : `${missingCostProducts.length} products are missing cost data.`
      : null,
    lowMarginProducts.length > 0
      ? language === "it"
        ? `${lowMarginProducts.length} prodotti lavorano con un margine troppo basso.`
        : `${lowMarginProducts.length} products are operating below healthy margin.`
      : null,
    summary.discounts > 0
      ? language === "it"
        ? `Nel periodo selezionato gli sconti hanno ridotto i ricavi di $${summary.discounts.toFixed(
          2,
        )}.`
        : `Discounts reduced revenue by $${summary.discounts.toFixed(
          2,
        )} during this period.`
      : null,
    summary.refunds > 0
      ? language === "it"
        ? `Nel periodo selezionato i rimborsi hanno ridotto i ricavi netti di $${summary.refunds.toFixed(
          2,
        )}.`
        : `Refunds reduced net revenue by $${summary.refunds.toFixed(
          2,
        )} during this period.`
      : null,
    recoverableProfit > 0
      ? language === "it"
        ? `MarginLab ha individuato circa $${recoverableProfit.toFixed(
          0,
        )} di profitto potenzialmente recuperabile.`
        : `MarginLab detected approximately $${recoverableProfit.toFixed(
          0,
        )} in recoverable profit opportunities.`
      : null,
  ]
    .filter(Boolean)
    .slice(0, 3) as string[];

  const prioritizedProducts = [...rows]
    .filter((row) => row.revenue > 0)
    .map((row) => {
      const recoverableOpportunity =
        Math.max(0, row.targetDelta) * row.qty;

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

  const aiPrompt = `
You are MarginLab AI Advisor.

Respond in ${language === "it" ? "Italian" : "English"}.

Analyze this Shopify store profitability data.

Use only the supplied data.

Do not invent numbers.

Do not invent products.

Never translate product names.

STORE SUMMARY

Revenue: ${summary.revenue}
Gross Profit: ${summary.profit}
Gross Margin: ${summary.marginPct}%

Discounts: ${summary.discounts}
Refunds: ${summary.refunds}

Recoverable profit: ${recoverableProfit}

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

Your objective is not to repeat metrics.

Your objective is to explain:

- Whether the store is profitable after estimated operating assumptions.
- What matters most.
- What is creating profitability pressure.
- What should be reviewed first.
- Where the biggest recovery opportunity exists.

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
- Mention the most important product risks.
- Mention recoverable profit opportunities.
`;

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardNav active="ai-advisor" navigate={navigate} />

        <div className="hero-header">
          <div>
            <div className="alert-pill">
              <span className="alert-dot" />
              {language === "it" ? "Anteprima Piano Growth" : "Growth Plan Preview"}
            </div>

            <div className="eyebrow">
              {language === "it" ? "CONSULENTE AI PER I MARGINI" : "AI MARGIN ADVISOR"}
            </div>

            <div className="hero-title">
              {language === "it"
                ? "Chiedi a MarginLab cosa sta riducendo i tuoi profitti"
                : "Ask MarginLab what is hurting your profits"}
            </div>

            <div className="hero-description">
              {language === "it"
                ? "Il consulente AI analizza i dati di redditività del tuo store Shopify, spiega i problemi di margine, individua perdite nascoste e consiglia cosa correggere per primo."
                : "AI Advisor analyzes your Shopify profitability data, explains margin issues, identifies hidden profit leaks and recommends what to fix first."}
            </div>
          </div>

          <button
            className="primary-button"
            onClick={() => navigate("/app/billing")}
          >
            {language === "it" ? "Passa a Growth →" : "Upgrade to Growth →"}
          </button>
        </div>

        <div className="panel">
          <div className="section-header">
            <div>
              {language === "it" ? "Anteprima Consulente AI" : "AI Advisor Preview"}

              <div className="section-subtitle">
                {language === "it"
                  ? "L'anteprima Growth trasforma i dati sui margini in decisioni operative chiare."
                  : "Growth feature preview. Built to turn margin data into clear business decisions."}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.05fr 0.95fr",
              gap: 24,
              marginTop: 24,
            }}
          >
            <div
              style={{
                borderRadius: 28,
                padding: 28,
                background:
                  "radial-gradient(circle at top left, rgba(255,115,60,0.08), transparent 36%), linear-gradient(135deg, rgba(17,24,39,0.98), rgba(6,12,24,0.98))",
                border: "1px solid rgba(255,115,60,0.22)",
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.035), 0 24px 70px rgba(0,0,0,0.32)",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "#ff9a70",
                }}
              >
                {language === "it" ? "Valutazione salute store" : "Store Health Assessment"}
              </div>

              <div
                style={{
                  marginTop: 18,
                  fontSize: 28,
                  maxWidth: 700,
                  fontWeight: 950,
                  lineHeight: 1.08,
                  color: "#ffffff",
                  letterSpacing: "-0.04em",
                }}
              >
                {language === "it"
                  ? topProfitLeak
                    ? `${topProfitLeak.productTitle} rappresenta attualmente il principale rischio per la redditività dello store.`
                    : "MarginLab non ha rilevato prodotti che rappresentino un rischio significativo per la redditività nel periodo analizzato."
                  : topProfitLeak
                    ? `${topProfitLeak.productTitle} is currently the biggest profitability risk.`
                    : "MarginLab did not detect a critical product risk during this period."}
              </div>

              <div
                style={{
                  marginTop: 24,
                  padding: 22,
                  borderRadius: 20,
                  background:
                    "linear-gradient(135deg, rgba(255,115,60,0.12), rgba(8,13,22,0.92))",
                  border: "1px solid rgba(255,115,60,0.20)",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "#ff9a70",
                  }}
                >
                  {language === "it" ? "Sintesi AI" : "AI Executive Summary"}
                </div>

                <div
                  style={{
                    marginTop: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                  }}
                >
                  <div
                    style={{
                      fontSize: 46,
                      fontWeight: 950,
                      lineHeight: 1,
                      color: healthColor,
                    }}
                  >
                    {healthScore}
                  </div>

                  <div>
                    <div
                      style={{
                        fontWeight: 950,
                        color: "#f3f4f6",
                        fontSize: 18,
                      }}
                    >
                      {healthLabel}
                    </div>

                    <div
                      style={{
                        marginTop: 5,
                        color: "rgba(255,255,255,0.62)",
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      {language === "it"
                        ? "Analisi dello stato di salute dello store"
                        : "MarginLab store health assessment"}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 16,
                    color: "rgba(255,255,255,0.75)",
                    lineHeight: 1.65,
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  {language === "it"
                    ? "MarginLab ha analizzato lo store e rilevato rischi di redditività legati a margini prodotto, costi mancanti e opportunità di profitto recuperabile."
                    : "MarginLab analyzed your store and detected profitability risks related to product margins, missing costs and recoverable profit opportunities."}
                </div>
              </div>

              <div
                style={{
                  marginTop: 22,
                  display: "grid",
                  gap: 12,
                }}
              >
                {(aiFindings.length > 0
                  ? aiFindings
                  : [
                    language === "it"
                      ? "Non sono stati rilevati problemi critici di margine nel periodo selezionato."
                      : "No critical margin issues detected during the selected period.",

                    language === "it"
                      ? "Costi prodotto, sconti e rimborsi risultano stabili sulla base dei dati disponibili."
                      : "Product costs, discounts and refunds appear stable based on available data.",
                  ]
                ).map((text) => (
                  <div
                    key={text}
                    style={{
                      padding: 16,
                      borderRadius: 16,
                      background: "rgba(255,255,255,0.045)",
                      border: "1px solid rgba(255,115,60,0.14)",
                      color: "rgba(255,255,255,0.76)",
                      fontWeight: 750,
                      lineHeight: 1.5,
                    }}
                  >
                    {text}
                  </div>
                ))}
              </div>

              <div
                style={{
                  marginTop: 22,
                  padding: 20,
                  borderRadius: 20,
                  background:
                    "linear-gradient(180deg, rgba(17,24,39,0.96), rgba(8,13,22,0.98))",
                  border: "1px solid rgba(255,115,60,0.22)",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "#ff9a70",
                    marginBottom: 14,
                  }}
                >
                  {language === "it"
                    ? "Anteprima del Report AI Settimanale"
                    : "Weekly AI Report Preview"}
                </div>

                <div style={{ display: "grid", gap: 12 }}>
                  {[
                    {
                      key: "health",
                      label:
                        language === "it"
                          ? "Stato dello store"
                          : "Store Health",
                      value: weeklyReport.health,
                    },
                    {
                      key: "mainRisk",
                      label:
                        language === "it"
                          ? "Rischio principale"
                          : "Main Risk",
                      value: weeklyReport.mainRisk,
                    },
                    {
                      key: "opportunity",
                      label:
                        language === "it" ? "Opportunità" : "Opportunity",
                      value: weeklyReport.opportunity,
                    },
                    {
                      key: "recommendation",
                      label:
                        language === "it"
                          ? "Azione consigliata"
                          : "Recommended Action",
                      value: weeklyReport.recommendation,
                    },
                  ].map((item) => (
                    <div key={item.key}>
                      <div
                        style={{
                          color: "rgba(255,255,255,0.45)",
                          fontSize: 11,
                          fontWeight: 900,
                          textTransform: "uppercase",
                        }}
                      >
                        {item.label}
                      </div>

                      <div
                        style={{
                          color:
                            item.key === "opportunity" ? "#22c55e" : "#f8fafc",
                          fontWeight: 900,
                          marginTop: 4,
                          lineHeight: 1.45,
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
                  marginTop: 18,
                  padding: 20,
                  borderRadius: 20,
                  background:
                    "linear-gradient(180deg, rgba(17,24,39,0.96), rgba(8,13,22,0.98))",
                  border: "1px solid rgba(255,115,60,0.18)",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "#ff9a70",
                    marginBottom: 14,
                  }}
                >
                  {language === "it" ? "Anteprima avvisi sui margini" : "Margin Alerts Preview"}
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {marginAlerts.map((alert) => (
                    <div
                      key={alert.message}
                      style={{
                        padding: 14,
                        borderRadius: 14,
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,115,60,0.12)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 900,
                          textTransform: "uppercase",
                          color:
                            alert.level === "Critical"
                              ? "#ff6b4a"
                              : alert.level === "Warning"
                                ? "#f59e0b"
                                : alert.level === "Opportunity"
                                  ? "#22c55e"
                                  : "#ff9a70",
                          marginBottom: 5,
                        }}
                      >
                        {alert.levelLabel}
                      </div>

                      <div
                        style={{
                          color: "#f8fafc",
                          fontWeight: 800,
                          lineHeight: 1.5,
                        }}
                      >
                        {alert.message}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div
              style={{
                borderRadius: 28,
                padding: 28,
                background:
                  "linear-gradient(180deg, rgba(17,24,39,0.96), rgba(8,13,22,0.98))",
                border: "1px solid rgba(255,115,60,0.18)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.035)",
              }}
            >
              <aiFetcher.Form
                method="post"
                onSubmit={() => {
                  setShowAiReport(false);
                }}
              >
                <input type="hidden" name="storeSummary" value={aiPrompt} />
                <input
                  type="hidden"
                  name="language"
                  value={language}
                />

                <button
                  type="submit"
                  style={{
                    width: "100%",
                    padding: "15px 18px",
                    borderRadius: 16,
                    border: "1px solid rgba(255,115,60,0.34)",
                    background:
                      "linear-gradient(135deg, rgba(255,90,54,0.30), rgba(255,115,60,0.14))",
                    color: "#ffffff",
                    fontWeight: 950,
                    cursor: "pointer",
                    boxShadow: "0 18px 42px rgba(255,90,54,0.10)",
                  }}
                >
                  {aiFetcher.state !== "idle"
                    ? language === "it"
                      ? "Generazione analisi AI..."
                      : "Generating AI Analysis..."
                    : language === "it"
                      ? "Genera analisi AI"
                      : "Generate AI Analysis"}
                </button>
              </aiFetcher.Form>

              {showAiReport && aiFetcher.data?.text && (
                <div
                  style={{
                    marginTop: 18,
                    padding: 24,
                    borderRadius: 22,
                    background:
                      "linear-gradient(180deg, rgba(17,24,39,0.96), rgba(8,13,22,0.98))",
                    border: "1px solid rgba(255,115,60,0.28)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 900,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "#ff9a70",
                      marginBottom: 14,
                    }}
                  >
                    {language === "it" ? "Analisi AI del business" : "AI Business Analysis"}
                  </div>

                  <div
                    style={{
                      color: "rgba(255,255,255,0.82)",
                      fontSize: 15,
                      lineHeight: 1.9,
                      fontWeight: 700,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {aiFetcher.data.text}
                  </div>
                </div>
              )}

              <div
                style={{
                  marginTop: 24,
                  padding: 18,
                  borderRadius: 18,
                  background: "rgba(255,115,60,0.08)",
                  border: "1px solid rgba(255,115,60,0.20)",
                  color: "rgba(255,255,255,0.70)",
                  lineHeight: 1.6,
                  fontWeight: 700,
                }}
              >
                {language === "it"
                  ? "🔒 Anteprima Growth. Questa analisi è attualmente disponibile in modalità anteprima. Le risposte AI avanzate e l'analisi conversazionale completa faranno parte del piano Growth."
                  : "🔒 Growth preview. This analysis is currently available in preview mode. Advanced AI answers and full conversational analysis will be part of the Growth plan."}
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 28,
              padding: 28,
              borderRadius: 26,
              background:
                "linear-gradient(180deg, rgba(17,24,39,0.96), rgba(8,13,22,0.98))",
              border: "1px solid rgba(255,115,60,0.22)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.035)",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#ff9a70",
              }}
            >
              {language === "it" ? "Chiedi a MarginLab" : "Ask MarginLab"}
            </div>

            <div
              style={{
                marginTop: 16,
                color: "rgba(255,255,255,0.62)",
                fontSize: 14,
                fontWeight: 700,
                lineHeight: 1.6,
              }}
            >
              {language === "it"
                ? "Fai una domanda specifica sulla redditività e MarginLab risponderà utilizzando i dati del negozio, i rischi dei prodotti, le opportunità di recupero e le ipotesi di costo."
                : "Ask a specific profitability question and MarginLab will answer using your store data, product risks, recovery opportunities and profit assumptions."}
            </div>

            <div
              style={{
                marginTop: 18,
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: 12,
              }}
            >
              {[
                {
                  id: "profitRisk",
                  label: topProfitLeak
                    ? language === "it"
                      ? `Perché ${topProfitLeak.productTitle} è il rischio principale?`
                      : `Why is ${topProfitLeak.productTitle} my biggest risk?`
                    : language === "it"
                      ? "Perché i miei profitti sono a rischio?"
                      : "Why is my profit at risk?",
                },
                {
                  id: "marginPressure",
                  label:
                    summary.refunds > 0
                      ? language === "it"
                        ? "I rimborsi stanno riducendo la redditività?"
                        : "Are refunds hurting profitability?"
                      : language === "it"
                        ? "Cosa sta riducendo i miei margini?"
                        : "What is hurting my margin?",
                },
                {
                  id: "priority",
                  label:
                    missingCostProducts.length > 0
                      ? language === "it"
                        ? `Perché devo completare prima i ${missingCostProducts.length} costi mancanti?`
                        : `Why should I fix ${missingCostProducts.length} missing costs first?`
                      : language === "it"
                        ? "Cosa dovrei controllare per prima cosa?"
                        : "What should I check first?",
                },
                {
                  id: "fastestImprovement",
                  label:
                    recoverableProfit > 0
                      ? language === "it"
                        ? "Quanto profitto posso recuperare?"
                        : "How much profit can I recover?"
                      : language === "it"
                        ? "Qual è il modo più rapido per migliorare i profitti?"
                        : "What would improve profit fastest?",
                },
                {
                  id: "productPriorities",
                  label:
                    language === "it"
                      ? "Quali prodotti dovrei sistemare per primi?"
                      : "Which products should I fix first?",
                },
                {
                  id: "pricingOpportunity",
                  label:
                    language === "it"
                      ? "Quale prodotto offre la migliore opportunità di aumento prezzo?"
                      : "Which product has the best pricing opportunity?",
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
                      ? "Dove posso aumentare i profitti più rapidamente?"
                      : "Where can I increase profit the fastest?",
                },
              ].map((presetQuestion) => (
                <button
                  key={presetQuestion.id}
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
                    padding: "14px 16px",
                    borderRadius: 14,
                    border:
                      selectedQuestion === presetQuestion.id
                        ? "1px solid rgba(255,115,60,0.45)"
                        : "1px solid rgba(255,115,60,0.14)",
                    background:
                      selectedQuestion === presetQuestion.id
                        ? "rgba(255,115,60,0.14)"
                        : "rgba(255,115,60,0.08)",
                    color: "#f8fafc",
                    fontWeight: 850,
                    textAlign: "left",
                    cursor: "pointer",
                    minHeight: 76,
                    height: "100%",
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
                  marginTop: 18,
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 12,
                }}
              >
                <input
                  name="question"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder={
                    language === "it"
                      ? "Fai una domanda sulla redditività..."
                      : "Ask a profitability question..."
                  }
                  style={{
                    width: "100%",
                    padding: "15px 16px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,115,60,0.18)",
                    background: "rgba(255,255,255,0.04)",
                    color: "#fff",
                    outline: "none",
                    fontWeight: 800,
                  }}
                />

                <button
                  type="submit"
                  style={{
                    padding: "0 28px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,115,60,0.22)",
                    background:
                      "linear-gradient(135deg, rgba(255,115,60,0.24), rgba(255,115,60,0.10))",
                    color: "#fff",
                    fontWeight: 900,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {askFetcher.state !== "idle"
                    ? language === "it"
                      ? "Elaborazione..."
                      : "Thinking..."
                    : language === "it"
                      ? "Chiedi all'AI"
                      : "Ask AI"}
                </button>
              </div>
            </askFetcher.Form>

            {askFetcher.data?.text && (
              <div
                style={{
                  marginTop: 20,
                  padding: 22,
                  borderRadius: 20,
                  background:
                    "linear-gradient(180deg, rgba(17,24,39,0.96), rgba(8,13,22,0.98))",
                  border: "1px solid rgba(34,197,94,0.22)",
                  color: "rgba(255,255,255,0.84)",
                  lineHeight: 1.75,
                  whiteSpace: "pre-wrap",
                  fontWeight: 750,
                }}
              >
                {askFetcher.data.text}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}