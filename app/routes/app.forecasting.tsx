import { useLoaderData, useNavigate } from "react-router";

import prisma from "~/db.server";
import DashboardNav from "~/components/dashboard/DashboardNav";
import { authenticate } from "~/shopify.server";
import { loadMarginDashboardData } from "~/utils/margin.server";
import type { LoaderData } from "~/utils/margin";

import "~/styles/dashboard.css";

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
    })) ?? {
      monthlyAds: 0,
      monthlyShipping: 0,
      monthlyOperating: 0,
      paymentFeePct: 0,
      transactionFeePct: 0,
      taxReservePct: 0,
    };

  return {
    ...dashboardData,
    assumptions,
  };
}

function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function ForecastingPage() {
  const navigate = useNavigate();

  const { summary, rows, assumptions } =
    useLoaderData() as LoaderData & {
      assumptions: {
        monthlyAds: number;
        monthlyShipping: number;
        monthlyOperating: number;
        paymentFeePct: number;
        transactionFeePct: number;
        taxReservePct: number;
      };
    };

  const recoverableProfit = rows.reduce(
    (sum, row) => sum + Math.max(0, row.targetDelta) * row.qty,
    0,
  );

  const impactedProducts = rows.filter((row) => row.targetDelta > 0).length;

  const estimatedPaymentFees =
    summary.revenue * (assumptions.paymentFeePct / 100);

  const estimatedTransactionFees =
    summary.revenue * (assumptions.transactionFeePct / 100);

  const estimatedTaxReserve =
    summary.revenue * (assumptions.taxReservePct / 100);

  const totalEstimatedCosts =
    assumptions.monthlyAds +
    assumptions.monthlyShipping +
    assumptions.monthlyOperating +
    estimatedPaymentFees +
    estimatedTransactionFees +
    estimatedTaxReserve;

  const currentNetProfit = summary.profit - totalEstimatedCosts;

  const currentNetMargin =
    summary.revenue > 0 ? (currentNetProfit / summary.revenue) * 100 : 0;

  const projectedGrossProfit = summary.profit + recoverableProfit;
  const projectedNetProfit = currentNetProfit + recoverableProfit;

  const projectedGrossMargin =
    summary.revenue > 0 ? (projectedGrossProfit / summary.revenue) * 100 : 0;

  const projectedNetMargin =
    summary.revenue > 0 ? (projectedNetProfit / summary.revenue) * 100 : 0;

  const grossMarginGain = projectedGrossMargin - summary.marginPct;
  const netMarginGain = projectedNetMargin - currentNetMargin;

  const scenarios = [
    {
      label: "Conservative",
      recoveryPct: 25,
      description: "Recover 25% of identified opportunities",
    },
    {
      label: "Balanced",
      recoveryPct: 50,
      description: "Recover 50% of identified opportunities",
    },
    {
      label: "Aggressive",
      recoveryPct: 100,
      description: "Recover all identified opportunities",
    },
  ].map((scenario) => {
    const recoveredProfit = recoverableProfit * (scenario.recoveryPct / 100);
    const scenarioGrossProfit = summary.profit + recoveredProfit;
    const scenarioNetProfit = currentNetProfit + recoveredProfit;

    const scenarioGrossMargin =
      summary.revenue > 0
        ? (scenarioGrossProfit / summary.revenue) * 100
        : 0;

    const scenarioNetMargin =
      summary.revenue > 0
        ? (scenarioNetProfit / summary.revenue) * 100
        : 0;

    return {
      ...scenario,
      recoveredProfit,
      scenarioGrossProfit,
      scenarioNetProfit,
      scenarioGrossMargin,
      scenarioNetMargin,
    };
  });

  const kpis = [
    ["Current Gross Profit", money(summary.profit), `${summary.marginPct.toFixed(1)}% gross margin`],
    ["Estimated Net Profit", money(currentNetProfit), `${currentNetMargin.toFixed(1)}% estimated net margin`],
    ["Recovery Opportunity", money(recoverableProfit), `${impactedProducts} products impacted`],
    ["Projected Gross Profit", money(projectedGrossProfit), `+${grossMarginGain.toFixed(1)}% margin gain`],
    ["Projected Net Profit", money(projectedNetProfit), `+${netMarginGain.toFixed(1)}% net margin gain`],
    ["Estimated Costs", money(totalEstimatedCosts), "Manual assumptions included"],
  ];

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardNav active="forecasting" navigate={navigate} />

        <div className="hero-header">
          <div>
            <div className="alert-pill">
              <span className="alert-dot" />
              Growth Plan Preview
            </div>

            <div className="eyebrow">FORECASTING</div>

            <div className="hero-title">
              Forecast future profitability improvements
            </div>

            <div className="hero-description">
              Estimate gross profit, net profit and recovery scenarios using
              current store data and saved monthly cost assumptions.
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
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 20,
            }}
          >
            {kpis.map(([label, value, note]) => (
              <div
                key={label}
                style={{
                  borderRadius: 24,
                  padding: 24,
                  background:
                    label === "Projected Net Profit"
                      ? "radial-gradient(circle at top left, rgba(34,197,94,0.16), transparent 35%), linear-gradient(180deg, rgba(17,24,39,0.96), rgba(8,13,22,0.98))"
                      : "linear-gradient(180deg, rgba(17,24,39,0.96), rgba(8,13,22,0.98))",
                  border:
                    label === "Projected Net Profit"
                      ? "1px solid rgba(34,197,94,0.28)"
                      : "1px solid rgba(255,115,60,0.18)",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    color:
                      label === "Projected Net Profit"
                        ? "#4ade80"
                        : "rgba(255,255,255,0.55)",
                    fontWeight: 900,
                  }}
                >
                  {label}
                </div>

                <div
                  style={{
                    marginTop: 16,
                    fontSize: 34,
                    fontWeight: 950,
                    color:
                      label === "Projected Net Profit"
                        ? "#22c55e"
                        : "#f8fafc",
                    letterSpacing: "-0.04em",
                  }}
                >
                  {value}
                </div>

                <div
                  style={{
                    marginTop: 8,
                    color: "rgba(255,255,255,0.62)",
                    fontWeight: 750,
                  }}
                >
                  {note}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 24,
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
                color: "#ff9a70",
              }}
            >
              Forecast Scenarios
            </div>

            <div
              style={{
                marginTop: 20,
                display: "grid",
                gridTemplateColumns: "repeat(3,1fr)",
                gap: 18,
              }}
            >
              {scenarios.map((scenario) => (
                <div
                  key={scenario.label}
                  style={{
                    borderRadius: 22,
                    padding: 22,
                    background:
                      scenario.label === "Balanced"
                        ? "radial-gradient(circle at top left, rgba(34,197,94,0.14), transparent 36%), rgba(255,255,255,0.045)"
                        : "rgba(255,255,255,0.04)",
                    border:
                      scenario.label === "Balanced"
                        ? "1px solid rgba(34,197,94,0.24)"
                        : "1px solid rgba(255,115,60,0.12)",
                  }}
                >
                  <div
                    style={{
                      color:
                        scenario.label === "Balanced"
                          ? "#4ade80"
                          : "#ff9a70",
                      fontSize: 11,
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.10em",
                    }}
                  >
                    {scenario.label}
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      color: "rgba(255,255,255,0.62)",
                      fontWeight: 750,
                      lineHeight: 1.5,
                    }}
                  >
                    {scenario.description}
                  </div>

                  <div
                    style={{
                      marginTop: 18,
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 900 }}>
                        RECOVERED PROFIT
                      </div>
                      <div style={{ color: "#22c55e", fontWeight: 950, fontSize: 24 }}>
                        +{money(scenario.recoveredProfit)}
                      </div>
                    </div>

                    <div>
                      <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 900 }}>
                        PROJECTED NET PROFIT
                      </div>
                      <div style={{ color: "#f8fafc", fontWeight: 900 }}>
                        {money(scenario.scenarioNetProfit)}
                      </div>
                    </div>

                    <div>
                      <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 900 }}>
                        PROJECTED NET MARGIN
                      </div>
                      <div style={{ color: "#f8fafc", fontWeight: 900 }}>
                        {scenario.scenarioNetMargin.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              marginTop: 24,
              padding: 24,
              borderRadius: 24,
              background:
                "linear-gradient(135deg, rgba(255,115,60,0.10), rgba(8,13,22,0.92))",
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
              AI Forecast Summary
            </div>

            <div
              style={{
                marginTop: 14,
                color: "rgba(255,255,255,0.78)",
                fontSize: 15,
                lineHeight: 1.7,
                fontWeight: 750,
              }}
            >
              Current estimated net profit is{" "}
              <strong style={{ color: "#f8fafc" }}>
                {money(currentNetProfit)}
              </strong>
              . If all recoverable margin opportunities are addressed, projected
              net profit could reach{" "}
              <strong style={{ color: "#22c55e" }}>
                {money(projectedNetProfit)}
              </strong>
              . MarginLab identified{" "}
              <strong style={{ color: "#f8fafc" }}>{impactedProducts}</strong>{" "}
              products with recovery potential and{" "}
              <strong style={{ color: "#f8fafc" }}>
                {money(totalEstimatedCosts)}
              </strong>{" "}
              in estimated monthly costs outside product costs.
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
            Forecasting preview. Estimates use current product costs, sales
            volume, recoverable pricing opportunities and saved Profit
            Assumptions. They are projections, not guaranteed results.
          </div>
        </div>
      </div>
    </div>
  );
}