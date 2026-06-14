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

function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function ForecastingPage() {
  const navigate = useNavigate();

  const { summary, rows } = useLoaderData() as LoaderData;

  const recoverableProfit = rows.reduce(
    (sum, row) =>
      sum + Math.max(0, row.targetDelta) * row.qty,
    0,
  );

  const projectedProfit =
    summary.profit + recoverableProfit;

  const projectedMargin =
    summary.revenue > 0
      ? (projectedProfit / summary.revenue) * 100
      : 0;

  const marginGain =
    projectedMargin - summary.marginPct;

  const impactedProducts = rows.filter(
    (row) => row.targetDelta > 0,
  ).length;

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardNav
          active="forecasting"
          navigate={navigate}
        />

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
              Estimate how your store performance could
              improve if margin opportunities are addressed.
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
            <div
              style={{
                borderRadius: 24,
                padding: 24,
                background:
                  "linear-gradient(180deg, rgba(17,24,39,0.96), rgba(8,13,22,0.98))",
                border:
                  "1px solid rgba(255,115,60,0.18)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: "rgba(255,255,255,0.55)",
                  fontWeight: 900,
                }}
              >
                Current Performance
              </div>

              <div
                style={{
                  marginTop: 18,
                  display: "grid",
                  gap: 12,
                }}
              >
                <div>
                  Revenue: {money(summary.revenue)}
                </div>

                <div>
                  Profit: {money(summary.profit)}
                </div>

                <div>
                  Margin: {summary.marginPct.toFixed(1)}%
                </div>
              </div>
            </div>

            <div
              style={{
                borderRadius: 24,
                padding: 24,
                background:
                  "linear-gradient(180deg, rgba(17,24,39,0.96), rgba(8,13,22,0.98))",
                border:
                  "1px solid rgba(34,197,94,0.24)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: "#4ade80",
                  fontWeight: 900,
                }}
              >
                Projected Performance
              </div>

              <div
                style={{
                  marginTop: 18,
                  display: "grid",
                  gap: 12,
                }}
              >
                <div>
                  Revenue: {money(summary.revenue)}
                </div>

                <div>
                  Profit: {money(projectedProfit)}
                </div>

                <div>
                  Margin: {projectedMargin.toFixed(1)}%
                </div>
              </div>
            </div>

            <div
              style={{
                borderRadius: 24,
                padding: 24,
                background:
                  "radial-gradient(circle at top left, rgba(34,197,94,0.16), transparent 35%), linear-gradient(180deg, rgba(17,24,39,0.96), rgba(8,13,22,0.98))",
                border:
                  "1px solid rgba(34,197,94,0.28)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: "#4ade80",
                  fontWeight: 900,
                }}
              >
                Expected Improvement
              </div>

              <div
                style={{
                  marginTop: 16,
                  fontSize: 42,
                  fontWeight: 950,
                  color: "#22c55e",
                }}
              >
                +{money(recoverableProfit)}
              </div>

              <div
                style={{
                  marginTop: 10,
                  display: "grid",
                  gap: 10,
                  color: "rgba(255,255,255,0.72)",
                }}
              >
                <div>
                  Margin Gain: +{marginGain.toFixed(1)}%
                </div>

                <div>
                  Products Impacted: {impactedProducts}
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 24,
              padding: 18,
              borderRadius: 18,
              background:
                "rgba(255,115,60,0.08)",
              border:
                "1px solid rgba(255,115,60,0.20)",
              color:
                "rgba(255,255,255,0.70)",
              lineHeight: 1.6,
              fontWeight: 700,
            }}
          >
            Forecasting preview. Estimates are based on
            current product costs, sales volume and
            recoverable pricing opportunities identified by
            MarginLab.
          </div>
        </div>
      </div>
    </div>
  );
}