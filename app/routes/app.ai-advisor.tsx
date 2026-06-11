import * as React from "react";
import { useLoaderData, useNavigate } from "react-router";

import DashboardNav from "~/components/dashboard/DashboardNav";
import { authenticate } from "~/shopify.server";
import { loadMarginDashboardData } from "~/utils/margin.server";
import type { LoaderData } from "~/utils/margin";
import "~/styles/dashboard.css";

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

export default function AiAdvisorPage() {
  const navigate = useNavigate();
  const { summary, rows } = useLoaderData() as LoaderData;

  const losingProducts = rows.filter((row) => row.losing);
  const missingCostProducts = rows.filter((row) => row.missingCost);
  const lowMarginProducts = rows.filter((row) => row.lowMargin);

  const topProfitLeak = [...rows].sort((a, b) => a.profit - b.profit)[0];

  const recoverableProducts = rows.filter((row) => row.targetDelta > 0);
  const recoverableProfit = recoverableProducts.reduce(
    (sum, row) => sum + row.targetDelta * row.qty,
    0,
  );

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
      ? `Discounts reduced revenue by ${summary.discounts.toFixed(2)} during this period.`
      : null,
    summary.refunds > 0
      ? `Refunds reduced net revenue by ${summary.refunds.toFixed(2)} during this period.`
      : null,
    recoverableProfit > 0
      ? `MarginLab detected approximately ${recoverableProfit.toFixed(0)} in recoverable profit opportunities.`
      : null,
  ].filter(Boolean) as string[];

  const aiAnswers = {
    profitRisk: [
      `MarginLab detected ${losingProducts.length} products selling below cost.`,
      `${lowMarginProducts.length} products are operating below healthy margin levels.`,
      recoverableProfit > 0
        ? `${recoverableProfit.toFixed(0)} in recoverable profit opportunities were identified.`
        : "No major recovery opportunities detected.",
    ],

    marginPressure: [
      summary.discounts > 0
        ? `Discounts reduced revenue by ${summary.discounts.toFixed(2)}.`
        : "Discount impact appears limited.",

      summary.refunds > 0
        ? `Refund activity reduced net revenue by ${summary.refunds.toFixed(2)}.`
        : "Refund activity appears stable.",
    ],

    priority: [
      missingCostProducts.length > 0
        ? `Review ${missingCostProducts.length} products with missing costs.`
        : "No missing costs detected.",

      topProfitLeak
        ? `Review ${topProfitLeak.productTitle} first.`
        : "No critical product detected.",
    ],
  };

  const [selectedQuestion, setSelectedQuestion] =
    React.useState<"profitRisk" | "marginPressure" | "priority">("profitRisk");

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
              AI Advisor will analyze your Shopify profitability data, explain
              margin issues, identify hidden profit leaks and recommend what to
              fix first.
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
                Future Growth feature. Built to turn margin data into clear
                business decisions.
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.1fr 0.9fr",
              gap: 24,
              marginTop: 24,
            }}
          >
            <div
              style={{
                borderRadius: 26,
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
                AI Store Health Report
              </div>

              <div
                style={{
                  marginTop: 18,
                  fontSize: 34,
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
                  marginTop: 22,
                  display: "grid",
                  gap: 14,
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
            </div>

            <div
              style={{
                borderRadius: 26,
                padding: 28,
                background:
                  "linear-gradient(180deg, rgba(17,24,39,0.96), rgba(8,13,22,0.98))",
                border: "1px solid rgba(255,115,60,0.18)",
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
                ].map((question) => (
                  <button
                    key={question.id}
                    onClick={() =>
                      setSelectedQuestion(
                        question.id as
                          | "profitRisk"
                          | "marginPressure"
                          | "priority",
                      )
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
                      fontWeight: 800,
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
                    display: "grid",
                    gap: 12,
                    color: "rgba(255,255,255,0.78)",
                    fontSize: 14,
                    lineHeight: 1.6,
                    fontWeight: 700,
                  }}
                >
                  {aiAnswers[selectedQuestion].map((answer) => (
                    <div key={answer}>• {answer}</div>
                  ))}
                </div>
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
                🔒 Available in the future Growth plan. This preview does not
                use live AI yet.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}