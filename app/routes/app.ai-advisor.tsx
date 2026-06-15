import * as React from "react";
import {
  useFetcher,
  useLoaderData,
  useNavigate,
} from "react-router";

import DashboardNav from "~/components/dashboard/DashboardNav";
import { authenticate } from "~/shopify.server";
import { loadMarginDashboardData } from "~/utils/margin.server";
import { generateAiMarginAnalysis } from "~/utils/openai.server";
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

  return loadMarginDashboardData({
    admin,
    session,
    period,
  });
}

export async function action({ request }: { request: Request }) {
  await authenticate.admin(request);

  const formData = await request.formData();
  const storeSummary = String(formData.get("storeSummary") || "");

  return generateAiMarginAnalysis({
    storeSummary,
  });
}

export default function AiAdvisorPage() {
  const navigate = useNavigate();
  const aiFetcher = useFetcher<{ text: string }>();
  const { summary, rows } = useLoaderData() as LoaderData;

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
You are analyzing a Shopify store using MarginLab profitability data.

STORE SUMMARY
Revenue: $${summary.revenue.toFixed(2)}
Profit: $${summary.profit.toFixed(2)}
Margin: ${summary.marginPct.toFixed(1)}%
Discounts: $${summary.discounts.toFixed(2)}
Refunds: $${summary.refunds.toFixed(2)}
Recoverable profit: $${recoverableProfit.toFixed(0)}

PRODUCT RISK
Products selling below cost: ${losingProducts.length}
Products with missing costs: ${missingCostProducts.length}
Low-margin products: ${lowMarginProducts.length}
Top profitability risk: ${topProfitLeak ? topProfitLeak.productTitle : "None"}
Top risk profit impact: ${topProfitLeak ? `$${topProfitLeak.profit.toFixed(2)}` : "N/A"
    }
Top risk margin: ${topProfitLeak ? `${topProfitLeak.marginPct.toFixed(1)}%` : "N/A"
    }

TASK

You are MarginLab AI Advisor.

Analyze the store like a profitability consultant reviewing a Shopify business.

Your objective is not to repeat numbers.

Your objective is to explain:

- What is most important.
- What is causing profitability pressure.
- What should be reviewed first.
- Where the biggest recovery opportunity exists.

Write EXACTLY these sections:

EXECUTIVE SUMMARY

STORE HEALTH

MAIN RISKS

WHAT TO CHECK FIRST

PROFIT OPPORTUNITY

Rules:

- Do not invent numbers.
- Do not invent products.
- Use only the supplied data.
- Be concise.
- Write for a business owner, not a data analyst.
- Focus on decisions, not metrics.
- Explain why each issue matters.
- Mention the top profitability risk if available.
- Mention recoverable profit if available.
- Prioritize actions by business impact.
- Maximum 3 bullet points per section.
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
                  MarginLab analyzed your store and detected profitability risks
                  related to product margins, missing costs and recoverable
                  profit opportunities.
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

                <div
                  style={{
                    display: "grid",
                    gap: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: "rgba(255,255,255,0.45)",
                        fontSize: 11,
                        fontWeight: 900,
                        textTransform: "uppercase",
                      }}
                    >
                      Store Health
                    </div>

                    <div
                      style={{
                        color: "#f8fafc",
                        fontWeight: 900,
                        marginTop: 4,
                      }}
                    >
                      {weeklyReport.health}
                    </div>
                  </div>

                  <div>
                    <div
                      style={{
                        color: "rgba(255,255,255,0.45)",
                        fontSize: 11,
                        fontWeight: 900,
                        textTransform: "uppercase",
                      }}
                    >
                      Main Risk
                    </div>

                    <div
                      style={{
                        color: "#f8fafc",
                        fontWeight: 800,
                        marginTop: 4,
                      }}
                    >
                      {weeklyReport.mainRisk}
                    </div>
                  </div>

                  <div>
                    <div
                      style={{
                        color: "rgba(255,255,255,0.45)",
                        fontSize: 11,
                        fontWeight: 900,
                        textTransform: "uppercase",
                      }}
                    >
                      Opportunity
                    </div>

                    <div
                      style={{
                        color: "#22c55e",
                        fontWeight: 800,
                        marginTop: 4,
                      }}
                    >
                      {weeklyReport.opportunity}
                    </div>
                  </div>

                  <div>
                    <div
                      style={{
                        color: "rgba(255,255,255,0.45)",
                        fontSize: 11,
                        fontWeight: 900,
                        textTransform: "uppercase",
                      }}
                    >
                      Recommended Action
                    </div>

                    <div
                      style={{
                        color: "#f8fafc",
                        fontWeight: 800,
                        marginTop: 4,
                        lineHeight: 1.5,
                      }}
                    >
                      {weeklyReport.recommendation}
                    </div>
                  </div>
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
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.55)",
                }}
              >
                Ask MarginLab
              </div>

              <div
                style={{
                  marginTop: 20,
                  display: "grid",
                  gap: 12,
                }}
              >
                {[
                  {
                    id: "profitRisk",
                    label: "Why is my profit at risk?",
                  },
                  {
                    id: "marginPressure",
                    label: "What is hurting my margin?",
                  },
                  {
                    id: "priority",
                    label: "What should I check first?",
                  },
                  {
                    id: "fastestImprovement",
                    label: "What would improve profit fastest?",
                  },
                ].map((question) => (
                  <button
                    key={question.id}
                    onClick={() =>
                      setSelectedQuestion(question.id as SelectedQuestion)
                    }
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

              <div
                style={{
                  marginTop: 18,
                  padding: 20,
                  borderRadius: 18,
                  background:
                    "linear-gradient(180deg, rgba(255,115,60,0.10), rgba(8,13,22,0.86))",
                  border: "1px solid rgba(255,115,60,0.22)",
                  minHeight: 150,
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
                  MarginLab answer
                </div>

                <div
                  style={{
                    color: "rgba(255,255,255,0.78)",
                    fontSize: 14,
                    lineHeight: 1.65,
                    fontWeight: 700,
                  }}
                >
                  {aiAnswers[selectedQuestion]}
                </div>
              </div>

              <aiFetcher.Form
                method="post"
                onSubmit={() => {
                  setShowAiReport(false);
                }}
              >
                <input
                  type="hidden"
                  name="storeSummary"
                  value={aiPrompt}
                />

                <button
                  type="submit"
                  style={{
                    marginTop: 18,
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
                    AI BUSINESS ANALYSIS
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
                🔒 Growth preview. This analysis is currently available in
                preview mode. Advanced AI answers and full conversational
                analysis will be part of the Growth plan.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}