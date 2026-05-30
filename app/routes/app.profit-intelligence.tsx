import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "~/shopify.server";

import dashboardStylesUrl from "~/styles/dashboard.css?url";
import MarginBreakdown from "~/components/dashboard/MarginBreakdown";

import { loadMarginDashboardData } from "~/utils/margin.server";
import { type LoaderData } from "~/utils/margin";

import DashboardNav from "~/components/dashboard/DashboardNav";

export const links = () => [{ rel: "stylesheet", href: dashboardStylesUrl }];

export const loader = async ({
  request,
}: {
  request: Request;
}): Promise<LoaderData> => {
  const url = new URL(request.url);
  const period = url.searchParams.get("period") || "30";

  const { admin, session } = await authenticate.admin(request);

  try {
    await admin.graphql(`query { shop { id } }`);
  } catch {
    throw new Response("Auth/scopes not ready. Reinstall the app.", {
      status: 401,
    });
  }

  return loadMarginDashboardData({ admin, session, period });
};

export default function ProfitIntelligencePage() {
  const { summary, trend, rows } = useLoaderData() as LoaderData;
  const navigate = useNavigate();

  const totalRevenue = Math.max(summary.revenue, 1);

  const cogsPercentage = Math.min(
    100,
    Math.max(0, (summary.cogs / totalRevenue) * 100),
  );
  const profitPercentage = Math.min(
    100,
    Math.max(0, (summary.profit / totalRevenue) * 100),
  );
  const leakPercentage = Math.min(
    100,
    Math.max(0, (summary.totalLeak / totalRevenue) * 100),
  );

  const firstTrendPoint = trend[0];
  const lastTrendPoint = trend[trend.length - 1];

  const revenueTrendPct =
    firstTrendPoint && lastTrendPoint && firstTrendPoint.revenue > 0
      ? ((lastTrendPoint.revenue - firstTrendPoint.revenue) /
        firstTrendPoint.revenue) *
      100
      : 0;

  const profitTrendPct =
    firstTrendPoint && lastTrendPoint && firstTrendPoint.profit > 0
      ? ((lastTrendPoint.profit - firstTrendPoint.profit) /
        firstTrendPoint.profit) *
      100
      : 0;

  const marginDeteriorating = summary.marginDelta < -3;
  const profitDeteriorating = profitTrendPct < -5;
  const revenueGrowingWhileProfitFalls =
    revenueTrendPct > 5 && profitTrendPct < 0;

  const sortedRevenueRows = [...rows].sort((a, b) => b.revenue - a.revenue);

  const topProductRevenue = sortedRevenueRows[0]?.revenue || 0;
  const top3Revenue = sortedRevenueRows
    .slice(0, 3)
    .reduce((acc, row) => acc + row.revenue, 0);
  const top5Revenue = sortedRevenueRows
    .slice(0, 5)
    .reduce((acc, row) => acc + row.revenue, 0);

  const topProductRevenueShare = (topProductRevenue / totalRevenue) * 100;
  const top3RevenueShare = (top3Revenue / totalRevenue) * 100;
  const top5RevenueShare = (top5Revenue / totalRevenue) * 100;

  const dependencyLevel =
    top3RevenueShare > 60
      ? "High"
      : top3RevenueShare > 35
        ? "Moderate"
        : "Low";

  const sortedProfitRows = [...rows].sort((a, b) => b.profit - a.profit);

  const totalProfitBase = Math.max(summary.profit, 1);
  const topProductProfit = sortedProfitRows[0]?.profit || 0;
  const top3Profit = sortedProfitRows
    .slice(0, 3)
    .reduce((acc, row) => acc + row.profit, 0);

  const topProductProfitShare = (topProductProfit / totalProfitBase) * 100;
  const top3ProfitShare = (top3Profit / totalProfitBase) * 100;

  const weakProfitDrivers = rows
    .filter((row) => row.revenue > 0 && row.marginPct < 15)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 3);

  const healthyProfitProducts = rows.filter(
    (row) => row.revenue > 0 && row.marginPct >= 30,
  ).length;

  const weakProfitProducts = rows.filter(
    (row) => row.revenue > 0 && row.marginPct < 15,
  ).length;

  const profitQualityLevel =
    weakProfitProducts > healthyProfitProducts
      ? "Weak"
      : weakProfitProducts > 0
        ? "Mixed"
        : "Healthy";

  const intelligenceScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 -
        top3RevenueShare * 0.35 -
        Math.max(0, top3ProfitShare - 60) * 0.4 -
        weakProfitProducts * 5,
      ),
    ),
  );

  const statusColor =
    intelligenceScore < 40
      ? "#ff6b4a"
      : intelligenceScore < 70
        ? "#f59e0b"
        : "#22c55e";

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardNav
          active="profit"
          navigate={navigate}
        />

        <div className="hero-header">
          <div>
            <div className="eyebrow">PROFIT INTELLIGENCE</div>
            <div className="hero-title">Profit Intelligence</div>
            <div className="hero-description">
              Understand revenue concentration, profit dependency and margin
              quality across your Shopify business.
            </div>
          </div>
        </div>

        <div className="hero-score-card" style={{ marginBottom: 28 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.3fr 1fr",
              gap: 26,
              alignItems: "stretch",
            }}
          >
            <div>
              <div className="eyebrow">PROFIT INTELLIGENCE SCORE</div>

              <div
                style={{
                  fontSize: 82,
                  fontWeight: 950,
                  lineHeight: 1,
                  marginTop: 14,
                  color: "#f3f4f6",
                  letterSpacing: "-3px",
                }}
              >
                {intelligenceScore}
                <span style={{ fontSize: 34, opacity: 0.45 }}>/100</span>
              </div>

              <div
                style={{
                  marginTop: 18,
                  fontSize: 24,
                  fontWeight: 900,
                  color: statusColor,
                }}
              >
                {dependencyLevel} concentration risk
              </div>

              <p
                style={{
                  marginTop: 14,
                  color: "rgba(255,255,255,0.66)",
                  maxWidth: 620,
                  lineHeight: 1.7,
                  fontSize: 15,
                }}
              >
                MarginLab evaluates how revenue concentration, profit dependency
                and weak profit drivers impact business stability.
              </p>
            </div>

            <div
              style={{
                borderRadius: 26,
                border: "1px solid rgba(255,255,255,0.08)",
                background:
                  "linear-gradient(180deg, rgba(14,20,32,0.96), rgba(8,12,21,0.96))",
                padding: 26,
                boxShadow: "0 24px 70px rgba(0,0,0,0.35)",
              }}
            >
              <div className="panel-eyebrow">KEY SIGNALS</div>

              {[
                ["Top 3 revenue share", `${top3RevenueShare.toFixed(1)}%`],
                ["Top 3 profit share", `${top3ProfitShare.toFixed(1)}%`],
                ["Weak profit products", `${weakProfitProducts}`],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    padding: "16px 0",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <span style={{ color: "rgba(255,255,255,0.58)" }}>
                    {label}
                  </span>
                  <strong style={{ color: "#f3f4f6" }}>{value}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

        <MarginBreakdown
          cogsPercentage={cogsPercentage}
          profitPercentage={profitPercentage}
          leakPercentage={leakPercentage}
        />

        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-eyebrow">TIMELINE INTELLIGENCE</div>
              <h2 className="panel-title">Profit trend signals</h2>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 18,
              marginTop: 24,
            }}
          >
            {[
              {
                label: "Margin direction",
                value: marginDeteriorating ? "Deteriorating" : "Stable",
                text: marginDeteriorating
                  ? `Margin dropped by ${Math.abs(summary.marginDelta).toFixed(1)}% compared to the previous period.`
                  : "Margin is stable compared to the previous period.",
                color: marginDeteriorating ? "#ff6b4a" : "#22c55e",
              },
              {
                label: "Profit movement",
                value: profitDeteriorating ? "Declining" : "Stable",
                text: profitDeteriorating
                  ? `Profit declined by ${Math.abs(profitTrendPct).toFixed(1)}% across the selected trend window.`
                  : `Profit changed by ${profitTrendPct.toFixed(1)}% across the selected trend window.`,
                color: profitDeteriorating ? "#ff6b4a" : "#22c55e",
              },
              {
                label: "Growth quality",
                value: revenueGrowingWhileProfitFalls ? "Weakening" : "Aligned",
                text: revenueGrowingWhileProfitFalls
                  ? "Revenue is growing while profit is falling. Growth quality may be weakening."
                  : "Revenue and profit movement do not currently show a major divergence.",
                color: revenueGrowingWhileProfitFalls ? "#f59e0b" : "#22c55e",
              },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  position: "relative",
                  overflow: "hidden",
                  borderRadius: 22,
                  padding: 22,
                  background:
                    "linear-gradient(180deg, rgba(16,22,35,0.96), rgba(9,13,22,0.96))",
                  border: "1px solid rgba(255,255,255,0.07)",
                  boxShadow: "0 18px 46px rgba(0,0,0,0.36)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: `radial-gradient(circle at top right, ${item.color}22, transparent 42%)`,
                    pointerEvents: "none",
                  }}
                />

                <div
                  style={{
                    position: "relative",
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.48)",
                  }}
                >
                  {item.label}
                </div>

                <div
                  style={{
                    position: "relative",
                    marginTop: 12,
                    fontSize: 24,
                    fontWeight: 950,
                    color: item.color,
                  }}
                >
                  {item.value}
                </div>

                <div
                  style={{
                    position: "relative",
                    marginTop: 12,
                    color: "rgba(255,255,255,0.66)",
                    lineHeight: 1.65,
                    fontSize: 14,
                  }}
                >
                  {item.text}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 22,
            marginTop: 24,
          }}
        >
          <ConcentrationCard
            eyebrow="REVENUE DEPENDENCY"
            title="Revenue concentration"
            status={`${dependencyLevel} dependency`}
            statusColor={
              dependencyLevel === "High"
                ? "#ff6b4a"
                : dependencyLevel === "Moderate"
                  ? "#f59e0b"
                  : "#22c55e"
            }
            rows={[
              ["Top product", topProductRevenueShare],
              ["Top 3 products", top3RevenueShare],
              ["Top 5 products", top5RevenueShare],
            ]}
          />

          <ConcentrationCard
            eyebrow="PROFIT CONCENTRATION"
            title="Profit dependency"
            status={`${top3ProfitShare > 60
              ? "High"
              : top3ProfitShare > 35
                ? "Moderate"
                : "Low"
              } profit dependency`}
            statusColor={
              top3ProfitShare > 60
                ? "#ff6b4a"
                : top3ProfitShare > 35
                  ? "#f59e0b"
                  : "#22c55e"
            }
            rows={[
              ["Top product", topProductProfitShare],
              ["Top 3 products", top3ProfitShare],
            ]}
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.35fr 1fr",
            gap: 22,
            marginTop: 24,
          }}
        >
          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="panel-eyebrow">WEAK PROFIT DRIVERS</div>
            <h2 className="panel-title" style={{ marginTop: 8 }}>
              High-revenue products with weak margins
            </h2>

            <div style={{ marginTop: 22 }}>
              {weakProfitDrivers.length > 0 ? (
                weakProfitDrivers.map((row) => (
                  <div
                    key={row.productId}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 100px 100px",
                      gap: 16,
                      padding: "15px 0",
                      borderTop: "1px solid rgba(255,255,255,0.07)",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ fontWeight: 800, color: "#f3f4f6" }}>
                      {row.productTitle}
                    </div>

                    <div style={{ color: "rgba(255,255,255,0.58)" }}>
                      ${row.revenue.toFixed(0)}
                    </div>

                    <strong
                      style={{
                        color: row.marginPct < 0 ? "#ff6b4a" : "#f59e0b",
                        textAlign: "right",
                      }}
                    >
                      {row.marginPct.toFixed(1)}%
                    </strong>
                  </div>
                ))
              ) : (
                <div style={{ color: "rgba(255,255,255,0.58)" }}>
                  No major weak profit drivers detected in the current period.
                </div>
              )}
            </div>
          </div>

          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="panel-eyebrow">PROFIT QUALITY</div>
            <h2 className="panel-title" style={{ marginTop: 8 }}>
              {profitQualityLevel} profit quality
            </h2>

            <div
              style={{
                marginTop: 24,
                fontSize: 44,
                fontWeight: 950,
                color:
                  profitQualityLevel === "Weak"
                    ? "#ff6b4a"
                    : profitQualityLevel === "Mixed"
                      ? "#f59e0b"
                      : "#22c55e",
              }}
            >
              {healthyProfitProducts}/{rows.length}
            </div>

            <p
              style={{
                marginTop: 12,
                color: "rgba(255,255,255,0.64)",
                lineHeight: 1.7,
              }}
            >
              {healthyProfitProducts} products show healthy margins, while{" "}
              {weakProfitProducts} products show weak profit quality.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

  function ConcentrationCard({
  eyebrow,
  title,
  status,
  statusColor,
  rows,
}: {
  eyebrow: string;
  title: string;
  status: string;
  statusColor: string;
  rows: [string, number][];
}) {
  return (
    <div className="panel" style={{ marginBottom: 0 }}>
      <div className="panel-eyebrow">{eyebrow}</div>

      <h2 className="panel-title" style={{ marginTop: 8 }}>
        {title}
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${rows.length}, 1fr)`,
          gap: 14,
          marginTop: 24,
        }}
      >
        {rows.map(([label, value]) => (
          <div
            key={label}
            style={{
              borderRadius: 22,
              padding: 20,
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.018))",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div
              style={{
                fontSize: 36,
                fontWeight: 950,
                lineHeight: 1,
                color: "#f3f4f6",
              }}
            >
              {value.toFixed(1)}%
            </div>

            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.48)",
              }}
            >
              {label}
            </div>

            <div
              style={{
                height: 7,
                borderRadius: 999,
                background: "rgba(255,255,255,0.07)",
                overflow: "hidden",
                marginTop: 16,
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, Math.max(0, value))}%`,
                  height: "100%",
                  borderRadius: 999,
                  background:
                    "linear-gradient(90deg, #ff5a36 0%, #f59e0b 100%)",
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 22,
          display: "inline-flex",
          padding: "9px 13px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.06)",
          color: statusColor,
          fontWeight: 900,
        }}
      >
        {status}
      </div>
    </div>
  );
}