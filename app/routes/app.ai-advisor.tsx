import * as React from "react";
import {
  useFetcher,
  useLoaderData,
  useNavigate,
} from "react-router";
import prisma from "~/db.server";
import DashboardNav from "~/components/dashboard/DashboardNav";
import { authenticate } from "~/shopify.server";
import { loadMarginDashboardData } from "~/utils/margin.server";
import {
  generateAiMarginAnalysis,
  generateAiAnswer,
} from "~/utils/openai.server";
import type { LoaderData } from "~/utils/margin";

import "~/styles/dashboard.css";

type SelectedQuestion =
  | "profitRisk"
  | "marginPressure"
  | "priority"
  | "fastestImprovement";

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

  const intent = String(
    formData.get("intent") || "analysis",
  );

  const storeSummary = String(
    formData.get("storeSummary") || "",
  );

  if (intent === "ask") {
    const question = String(
      formData.get("question") || "",
    );

    return generateAiAnswer({
      question,
      context: `
Current store profitability data:

${storeSummary}

The user is asking a specific question.
Do not generate a complete analysis.
`,
    });
  }

  return generateAiMarginAnalysis({
    storeSummary,
  });
}
export default function AiAdvisorPage() {
  const navigate = useNavigate();
  const aiFetcher = useFetcher<{ text: string }>();
  const askFetcher = useFetcher<{ text: string }>();

  const [question, setQuestion] =
    React.useState("");
  const { summary, rows, assumptions } =
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

  const [selectedQuestion, setSelectedQuestion] =
    React.useState<SelectedQuestion>("profitRisk");

  const [showAiReport, setShowAiReport] = React.useState(false);

  React.useEffect(() => {
    if (aiFetcher.data?.text) {
      setShowAiReport(true);
    }
  }, [aiFetcher.data]);

  const losingProducts = rows.filter((row) => row.losing);
  const missingCostProducts = rows.filter((row) => row.missingCost);
  const lowMarginProducts = rows.filter((row) => row.lowMargin);

  const topProfitLeak = [...rows].sort((a, b) => a.profit - b.profit)[0];

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
    healthScore < 40
      ? "High Risk"
      : healthScore < 70
        ? "Moderate Risk"
        : "Healthy";

  const weeklyReport = {
    health: healthLabel,

    mainRisk: topProfitLeak
      ? topProfitLeak.productTitle
      : "No critical product risk detected",

    opportunity:
      recoverableProfit > 0
        ? `$${recoverableProfit.toFixed(0)} recoverable profit identified`
        : "No significant recovery opportunity detected",

    recommendation:
      missingCostProducts.length > 0
        ? `Complete cost data for ${missingCostProducts.length} products`
        : topProfitLeak
          ? `Review pricing and costs for ${topProfitLeak.productTitle}`
          : "Continue monitoring profitability trends",
  };

  const marginAlerts = [
    losingProducts.length > 0
      ? {
        level: "Critical",
        message: `${losingProducts.length} products are currently selling below cost.`,
      }
      : null,

    missingCostProducts.length > 0
      ? {
        level: "Warning",
        message: `${missingCostProducts.length} products are missing cost data.`,
      }
      : null,

    summary.refunds > 0
      ? {
        level: "Notice",
        message: `Refunds reduced revenue by $${summary.refunds.toFixed(2)}.`,
      }
      : null,

    recoverableProfit > 0
      ? {
        level: "Opportunity",
        message: `$${recoverableProfit.toFixed(
          0,
        )} recoverable profit opportunity detected.`,
      }
      : null,
  ].filter(
    (alert): alert is { level: string; message: string } => alert !== null,
  );

  const healthColor =
    healthScore < 40
      ? "#ff6b4a"
      : healthScore < 70
        ? "#f59e0b"
        : "#22c55e";

  const aiFindings = [
    losingProducts.length > 0
      ? `${losingProducts.length} products are currently selling below cost.`
      : null,
    missingCostProducts.length > 0
      ? `${missingCostProducts.length} products are missing cost data.`
      : null,
    lowMarginProducts.length > 0
      ? `${lowMarginProducts.length} products are operating below healthy margin.`
      : null,
    summary.discounts > 0
      ? `Discounts reduced revenue by $${summary.discounts.toFixed(
        2,
      )} during this period.`
      : null,
    summary.refunds > 0
      ? `Refunds reduced net revenue by $${summary.refunds.toFixed(
        2,
      )} during this period.`
      : null,
    recoverableProfit > 0
      ? `MarginLab detected approximately $${recoverableProfit.toFixed(
        0,
      )} in recoverable profit opportunities.`
      : null,
  ]
    .filter(Boolean)
    .slice(0, 3) as string[];

  const aiAnswers: Record<SelectedQuestion, string> = {
    profitRisk: topProfitLeak
      ? `Your store is currently exposed to profitability risk because ${topProfitLeak.productTitle} has the strongest negative impact in the selected period. ${losingProducts.length} products are selling below cost, which means they generate revenue but reduce overall profit. MarginLab also detected approximately $${recoverableProfit.toFixed(
        0,
      )} in recoverable profit opportunities if pricing gaps are reviewed.`
      : "MarginLab did not detect a single dominant product risk during this period. Based on available cost and order data, your current profitability risk appears more distributed across the catalog.",

    marginPressure: `Your margin is being affected by a combination of discounts, refunds and product-level profitability. Discounts reduced revenue by $${summary.discounts.toFixed(
      2,
    )}, while refunds reduced net revenue by $${summary.refunds.toFixed(
      2,
    )}. ${lowMarginProducts.length
      } products are operating below healthy margin levels, which can make revenue look acceptable while profit quality weakens.`,

    priority:
      missingCostProducts.length > 0
        ? `Start by fixing missing cost data for ${missingCostProducts.length
        } products. Without accurate costs, MarginLab cannot fully trust margin calculations or pricing recommendations. After that, review ${topProfitLeak ? topProfitLeak.productTitle : "the highest-risk products"
        } and focus on recoverable profit opportunities.`
        : `Cost data appears complete enough for the selected period. The next priority is to review ${topProfitLeak ? topProfitLeak.productTitle : "the highest-risk products"
        } and focus on recoverable profit opportunities before making broader pricing changes.`,

    fastestImprovement:
      recoverableProfit > 0
        ? `The fastest profit improvement would come from reviewing products with recoverable pricing opportunities. MarginLab estimates approximately $${recoverableProfit.toFixed(
          0,
        )} in potential recoverable profit. Start with products selling below cost, then complete missing cost data, and only after that review pricing gaps.`
        : "The fastest improvement right now is improving data accuracy. Start with missing cost data and high-risk products before making pricing changes.",
  };

  const aiPrompt = `
You are MarginLab AI Advisor.

Analyze this Shopify store profitability data.

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
        (p) =>
          `${p.productTitle} | Profit ${p.profit.toFixed(2)} | Margin ${p.marginPct.toFixed(1)}%`,
      )
      .join("\n") || "None"}

TOP LOW-MARGIN PRODUCTS

${[...lowMarginProducts]
      .slice(0, 3)
      .map(
        (p) =>
          `${p.productTitle} | Profit ${p.profit.toFixed(2)} | Margin ${p.marginPct.toFixed(1)}%`,
      )
      .join("\n") || "None"}

TOP RECOVERY OPPORTUNITIES

${[...rows]
      .filter((r) => r.targetDelta > 0)
      .sort((a, b) => b.targetDelta * b.qty - a.targetDelta * a.qty)
      .slice(0, 3)
      .map(
        (p) =>
          `${p.productTitle} | Potential Recovery ${(p.targetDelta * p.qty).toFixed(0)}`,
      )
      .join("\n") || "None"}

TASK

Act like a profitability consultant reviewing a Shopify business.

Your objective is not to repeat metrics.

Your objective is to explain:

- Whether the store is profitable after estimated operating assumptions.
- What matters most.
- What is creating profitability pressure.
- What should be reviewed first.
- Where the biggest recovery opportunity exists.

Use EXACTLY these sections:

EXECUTIVE SUMMARY

GROSS VS NET PROFIT

MAIN RISKS

WHAT TO CHECK FIRST

PROFIT OPPORTUNITY

Rules:

- Do not invent numbers.
- Do not invent products.
- Use only supplied data.
- Be concise.
- Use short bullet points.
- Maximum 3 bullet points per section.
- Prioritize actions by business impact.
- Mention estimated net profit if assumptions are provided.
- Mention estimated net margin if assumptions are provided.
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
              Growth Plan Preview
            </div>

            <div className="eyebrow">AI MARGIN ADVISOR</div>

            <div className="hero-title">
              Ask MarginLab what is hurting your profit
            </div>

            <div className="hero-description">
              AI Advisor analyzes your Shopify profitability data, explains
              margin issues, identifies hidden profit leaks and recommends what
              to fix first.
            </div>
          </div>

          <button
            className="primary-button"
            onClick={() => navigate("/app/billing")}
          >
            Upgrade to Growth →
          </button>
        </div>

        <div className="panel">
          <div className="section-header">
            <div>
              <div className="section-title">AI Advisor Preview</div>

              <div className="section-subtitle">
                Growth feature preview. Built to turn margin data into clear
                business decisions.
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
                Store Health Assessment
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
                {topProfitLeak
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
                  AI Executive Summary
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
                      MarginLab store health assessment
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
                  MarginLab analyzed your store and detected profitability risks related
                  to product margins, missing costs and recoverable profit opportunities.
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
                    "No critical margin issues detected during the selected period.",
                    "Product costs, discounts and refunds appear stable based on available data.",
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
                  Weekly AI Report Preview
                </div>

                <div style={{ display: "grid", gap: 12 }}>
                  {[
                    ["Store Health", weeklyReport.health],
                    ["Main Risk", weeklyReport.mainRisk],
                    ["Opportunity", weeklyReport.opportunity],
                    ["Recommended Action", weeklyReport.recommendation],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div
                        style={{
                          color: "rgba(255,255,255,0.45)",
                          fontSize: 11,
                          fontWeight: 900,
                          textTransform: "uppercase",
                        }}
                      >
                        {label}
                      </div>

                      <div
                        style={{
                          color: label === "Opportunity" ? "#22c55e" : "#f8fafc",
                          fontWeight: 900,
                          marginTop: 4,
                          lineHeight: 1.45,
                        }}
                      >
                        {value}
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
                  Margin Alerts Preview
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
                        {alert.level}
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
                    ? "Generating AI Analysis..."
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
                    AI Business Analysis
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
                  padding: 22,
                  borderRadius: 22,
                  background:
                    "linear-gradient(180deg, rgba(255,115,60,0.08), rgba(8,13,22,0.92))",
                  border: "1px solid rgba(255,115,60,0.22)",
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
                  Ask MarginLab
                </div>

                <div
                  style={{
                    marginTop: 18,
                    display: "grid",
                    gap: 12,
                  }}
                >
                  {[
                    {
                      id: "profitRisk",
                      label: topProfitLeak
                        ? `Why is ${topProfitLeak.productTitle} my biggest risk?`
                        : "Why is my profit at risk?",
                    },
                    {
                      id: "marginPressure",
                      label:
                        summary.refunds > 0
                          ? "Are refunds hurting profitability?"
                          : "What is hurting my margin?",
                    },
                    {
                      id: "priority",
                      label:
                        missingCostProducts.length > 0
                          ? `Why should I fix ${missingCostProducts.length} missing costs first?`
                          : "What should I check first?",
                    },
                    {
                      id: "fastestImprovement",
                      label:
                        recoverableProfit > 0
                          ? "How much profit can I recover?"
                          : "What would improve profit fastest?",
                    },
                  ].map((question) => (
                    <button
                      key={question.id}
                      onClick={() => {
                        setSelectedQuestion(question.id as SelectedQuestion);
                        setQuestion(question.label);

                        const formData = new FormData();

                        formData.append("intent", "ask");
                        formData.append("question", question.label);
                        formData.append("storeSummary", aiPrompt);

                        askFetcher.submit(formData, {
                          method: "post",
                        });
                      }}
                      style={{
                        padding: "14px 16px",
                        borderRadius: 14,
                        border:
                          selectedQuestion === question.id
                            ? "1px solid rgba(255,115,60,0.45)"
                            : "1px solid rgba(255,115,60,0.14)",
                        background:
                          selectedQuestion === question.id
                            ? "rgba(255,115,60,0.14)"
                            : "rgba(255,115,60,0.08)",
                        color: "#f8fafc",
                        fontWeight: 850,
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      {question.label}
                    </button>
                  ))}
                </div>

                <askFetcher.Form method="post">
                  <input type="hidden" name="intent" value="ask" />
                  <input type="hidden" name="storeSummary" value={aiPrompt} />

                  <input
                    name="question"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ask a profitability question..."
                    style={{
                      width: "100%",
                      marginTop: 18,
                      padding: "14px 16px",
                      borderRadius: 14,
                      border: "1px solid rgba(255,115,60,0.18)",
                      background: "rgba(255,255,255,0.04)",
                      color: "#fff",
                      outline: "none",
                    }}
                  />

                  <button
                    type="submit"
                    style={{
                      marginTop: 14,
                      width: "100%",
                      padding: "14px",
                      borderRadius: 14,
                      border: "1px solid rgba(255,115,60,0.22)",
                      background:
                        "linear-gradient(135deg, rgba(255,115,60,0.22), rgba(255,115,60,0.10))",
                      color: "#fff",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    {askFetcher.state !== "idle" ? "Thinking..." : "Ask AI"}
                  </button>
                </askFetcher.Form>

                {askFetcher.data?.text && (
                  <div
                    style={{
                      marginTop: 20,
                      padding: 20,
                      borderRadius: 20,
                      background:
                        "linear-gradient(180deg, rgba(17,24,39,0.96), rgba(8,13,22,0.98))",
                      border: "1px solid rgba(34,197,94,0.22)",
                      color: "rgba(255,255,255,0.82)",
                      lineHeight: 1.7,
                      whiteSpace: "pre-wrap",
                      fontWeight: 750,
                    }}
                  >
                    {askFetcher.data.text}
                  </div>
                )}
              </div>

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
                🔒 Growth preview. This analysis is currently available in preview mode.
                Advanced AI answers and full conversational analysis will be part of the
                Growth plan.
              </div>
            </div>
            <askFetcher.Form method="post">
              <input
                type="hidden"
                name="intent"
                value="ask"
              />

              <input
                type="hidden"
                name="storeSummary"
                value={aiPrompt}
              />

              <div
                style={{
                  marginTop: 24,
                  padding: 20,
                  borderRadius: 20,
                  background:
                    "linear-gradient(180deg, rgba(17,24,39,0.96), rgba(8,13,22,0.98))",
                  border:
                    "1px solid rgba(255,115,60,0.22)",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 900,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "#ff9a70",
                  }}
                >
                  Ask MarginLab
                </div>

                <input
                  name="question"
                  value={question}
                  onChange={(e) =>
                    setQuestion(e.target.value)
                  }
                  placeholder="Why did my profit drop?"
                  style={{
                    width: "100%",
                    marginTop: 14,
                    padding: "14px 16px",
                    borderRadius: 14,
                    border:
                      "1px solid rgba(255,115,60,0.18)",
                    background: "rgba(255,255,255,0.04)",
                    color: "#fff",
                    outline: "none",
                  }}
                />

                <button
                  type="submit"
                  style={{
                    marginTop: 14,
                    width: "100%",
                    padding: "14px",
                    borderRadius: 14,
                    border:
                      "1px solid rgba(255,115,60,0.22)",
                    background:
                      "linear-gradient(135deg, rgba(255,115,60,0.22), rgba(255,115,60,0.10))",
                    color: "#fff",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  {askFetcher.state !== "idle"
                    ? "Thinking..."
                    : "Ask AI"}
                </button>
              </div>
            </askFetcher.Form>

            {askFetcher.data?.text && (
              <div
                style={{
                  marginTop: 20,
                  padding: 20,
                  borderRadius: 20,
                  background:
                    "linear-gradient(180deg, rgba(17,24,39,0.96), rgba(8,13,22,0.98))",
                  border:
                    "1px solid rgba(34,197,94,0.22)",
                  color: "rgba(255,255,255,0.82)",
                  lineHeight: 1.7,
                  whiteSpace: "pre-wrap",
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