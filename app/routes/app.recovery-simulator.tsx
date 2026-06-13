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

export default function RecoverySimulatorPage() {
  const navigate = useNavigate();
  const { rows } = useLoaderData() as LoaderData;

  const [targetMargin, setTargetMargin] = React.useState(20);

  const simulatorRows = rows
    .map((row) => {
      const targetPrice =
        row.avgCost > 0
          ? row.avgCost / (1 - targetMargin / 100)
          : row.avgPrice;

      const priceDelta = Math.max(0, targetPrice - row.avgPrice);
      const potentialProfit = priceDelta * row.qty;

      return {
        ...row,
        simulatorTargetPrice: targetPrice,
        simulatorPriceDelta: priceDelta,
        simulatorPotentialProfit: potentialProfit,
      };
    })
    .filter((row) => row.simulatorPotentialProfit > 0)
    .sort(
      (a, b) =>
        b.simulatorPotentialProfit -
        a.simulatorPotentialProfit,
    )
    .slice(0, 8);

  const totalPotentialProfit = simulatorRows.reduce(
    (sum, row) => sum + row.simulatorPotentialProfit,
    0,
  );

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardNav
          active="recovery-simulator"
          navigate={navigate}
        />

        <div className="hero-header">
          <div>
            <div className="alert-pill">
              <span className="alert-dot" />
              Growth Plan Preview
            </div>

            <div className="eyebrow">RECOVERY SIMULATOR</div>

            <div className="hero-title">
              Simulate how pricing changes could recover profit
            </div>

            <div className="hero-description">
              Test target margin scenarios and estimate how much additional
              profit MarginLab could help recover from pricing gaps.
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
              <div className="section-title">Profit Recovery Scenario</div>

              <div className="section-subtitle">
                Choose a target margin and see estimated recoverable profit
                based on current product costs, prices and quantities sold.
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "0.75fr 1.25fr",
              gap: 24,
              marginTop: 24,
            }}
          >
            <div
              style={{
                borderRadius: 26,
                padding: 28,
                background:
                  "radial-gradient(circle at top left, rgba(34,197,94,0.12), transparent 36%), linear-gradient(135deg, rgba(17,24,39,0.98), rgba(6,12,24,0.98))",
                border: "1px solid rgba(34,197,94,0.24)",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "#4ade80",
                }}
              >
                Estimated Recovery
              </div>

              <div
                style={{
                  marginTop: 16,
                  color: "#22c55e",
                  fontSize: 54,
                  fontWeight: 950,
                  lineHeight: 1,
                  letterSpacing: "-0.05em",
                }}
              >
                ${totalPotentialProfit.toFixed(0)}
              </div>

              <div
                style={{
                  marginTop: 12,
                  color: "rgba(255,255,255,0.68)",
                  fontWeight: 750,
                  lineHeight: 1.6,
                }}
              >
                Estimated additional profit if selected products move toward a{" "}
                <strong>{targetMargin}%</strong> target margin.
              </div>

              <div
                style={{
                  marginTop: 26,
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.52)",
                }}
              >
                Target Margin
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4,1fr)",
                  gap: 10,
                  marginTop: 14,
                }}
              >
                {[15, 20, 25, 30].map((value) => (
                  <button
                    key={value}
                    onClick={() => setTargetMargin(value)}
                    style={{
                      padding: "12px 10px",
                      borderRadius: 14,
                      border:
                        targetMargin === value
                          ? "1px solid rgba(34,197,94,0.45)"
                          : "1px solid rgba(255,115,60,0.14)",
                      background:
                        targetMargin === value
                          ? "rgba(34,197,94,0.14)"
                          : "rgba(255,115,60,0.08)",
                      color:
                        targetMargin === value
                          ? "#86efac"
                          : "#f8fafc",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    {value}%
                  </button>
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
                Products Impacted
              </div>

              <div
                style={{
                  marginTop: 18,
                  display: "grid",
                  gap: 12,
                }}
              >
                {simulatorRows.length > 0 ? (
                  simulatorRows.map((row) => (
                    <div
                      key={row.productId || row.productTitle}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        gap: 18,
                        alignItems: "center",
                        padding: 16,
                        borderRadius: 16,
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,115,60,0.12)",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            color: "#f8fafc",
                            fontWeight: 900,
                          }}
                        >
                          {row.productTitle}
                        </div>

                        <div
                          style={{
                            marginTop: 6,
                            color: "rgba(255,255,255,0.52)",
                            fontSize: 13,
                            fontWeight: 750,
                          }}
                        >
                          Current margin {row.marginPct.toFixed(1)}% · Target
                          price ${row.simulatorTargetPrice.toFixed(2)}
                        </div>
                      </div>

                      <div
                        style={{
                          textAlign: "right",
                        }}
                      >
                        <div
                          style={{
                            color: "#22c55e",
                            fontSize: 22,
                            fontWeight: 950,
                          }}
                        >
                          +${row.simulatorPotentialProfit.toFixed(0)}
                        </div>

                        <div
                          style={{
                            marginTop: 4,
                            color: "rgba(255,255,255,0.45)",
                            fontSize: 12,
                            fontWeight: 800,
                          }}
                        >
                          estimated profit
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div
                    style={{
                      padding: 22,
                      borderRadius: 18,
                      background: "rgba(34,197,94,0.08)",
                      border: "1px solid rgba(34,197,94,0.18)",
                      color: "#86efac",
                      fontWeight: 800,
                    }}
                  >
                    No pricing recovery opportunities detected for this target
                    margin.
                  </div>
                )}
              </div>
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
            Growth preview. Estimates are based on Shopify order data, product
            costs and selected target margin. This simulator does not change
            prices automatically..
          </div>
        </div>
      </div>
    </div>
  );
}