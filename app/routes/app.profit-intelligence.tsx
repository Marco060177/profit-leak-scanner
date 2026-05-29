import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "~/shopify.server";

import dashboardStylesUrl from "~/styles/dashboard.css?url";
import MarginBreakdown from "~/components/dashboard/MarginBreakdown";

import { loadMarginDashboardData } from "~/utils/margin.server";
import { type LoaderData } from "~/utils/margin";

export const links = () => [
  {
    rel: "stylesheet",
    href: dashboardStylesUrl,
  },
];

export const loader = async ({ request }: { request: Request }): Promise<LoaderData> => {
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
  const cogsPercentage = Math.min(100, Math.max(0, (summary.cogs / totalRevenue) * 100));
  const profitPercentage = Math.min(100, Math.max(0, (summary.profit / totalRevenue) * 100));
  const leakPercentage = Math.min(100, Math.max(0, (summary.totalLeak / totalRevenue) * 100));
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

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <button
          type="button"
          onClick={() => navigate("/app")}
          className="secondary-button"
          style={{ marginBottom: 24 }}
        >
          ← Back to dashboard
        </button>

        <div className="hero-header">
          <div>
            <div className="eyebrow">PROFIT INTELLIGENCE</div>

            <div className="hero-title">Margin Breakdown</div>

            <div className="hero-description">
              Understand how revenue turns into costs, profit and detected margin leakage.
            </div>
          </div>
        </div>

        <div className="hero-score-card" style={{ marginBottom: 28 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 1fr",
              gap: 24,
            }}
          >
            <div>
              <div className="eyebrow">
                PROFIT INTELLIGENCE SCORE
              </div>

              <div
                style={{
                  fontSize: 72,
                  fontWeight: 900,
                  lineHeight: 1,
                  marginTop: 12,
                  color: "#f3f4f6",
                }}
              >
                {intelligenceScore}
                <span
                  style={{
                    fontSize: 34,
                    opacity: 0.45,
                  }}
                >
                  /100
                </span>
              </div>

              <div
                style={{
                  marginTop: 18,
                  fontSize: 22,
                  fontWeight: 700,
                  color: "#ff6b4a",
                }}
              >
                {dependencyLevel} concentration risk
              </div>

              <div
                style={{
                  marginTop: 12,
                  color: "rgba(255,255,255,0.7)",
                  maxWidth: 520,
                }}
              >
                Evaluate how revenue concentration, profit dependency
                and weak profit drivers impact business stability.
              </div>
            </div>

            <div
              style={{
                borderRadius: 24,
                border: "1px solid rgba(255,255,255,0.08)",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
                padding: 24,
              }}
            >
              <div className="panel-eyebrow">
                KEY SIGNALS
              </div>

              <div style={{ marginTop: 18 }}>
                Top 3 Revenue Share: {top3RevenueShare.toFixed(1)}%
              </div>

              <div style={{ marginTop: 12 }}>
                Top 3 Profit Share: {top3ProfitShare.toFixed(1)}%
              </div>

              <div style={{ marginTop: 12 }}>
                Weak Profit Products: {weakProfitProducts}
              </div>
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
            <div className="ai-recommendation-box">
              <div className="ai-recommendation-label">Margin direction</div>
              <div className="ai-recommendation-text">
                {marginDeteriorating
                  ? `Margin deteriorated by ${Math.abs(summary.marginDelta).toFixed(
                    1,
                  )}% compared to the previous period.`
                  : "Margin is stable compared to the previous period."}
              </div>
            </div>

            <div className="ai-recommendation-box">
              <div className="ai-recommendation-label">Profit movement</div>
              <div className="ai-recommendation-text">
                {profitDeteriorating
                  ? `Profit declined by ${Math.abs(profitTrendPct).toFixed(
                    1,
                  )}% across the selected trend window.`
                  : `Profit changed by ${profitTrendPct.toFixed(
                    1,
                  )}% across the selected trend window.`}
              </div>
            </div>

            <div className="ai-recommendation-box">
              <div className="ai-recommendation-label">Growth quality</div>
              <div className="ai-recommendation-text">
                {revenueGrowingWhileProfitFalls
                  ? "Revenue is growing while profit is falling. Growth quality may be weakening."
                  : "Revenue and profit movement do not currently show a major divergence."}
              </div>
            </div>
          </div>
        </div>
        <div className="panel" style={{ marginTop: 24 }}>
          <div className="panel-header">
            <div>
              <div className="panel-eyebrow">REVENUE DEPENDENCY</div>
              <h2 className="panel-title">Revenue concentration risk</h2>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              marginTop: 24,
            }}
          >
            <div className="ai-recommendation-box">
              <div className="ai-recommendation-label">
                Dependency level
              </div>

              <div className="ai-recommendation-text">
                Top product: {topProductRevenueShare.toFixed(1)}% · Top 3 products:{" "}
                {top3RevenueShare.toFixed(1)}% · Top 5 products:{" "}
                {top5RevenueShare.toFixed(1)}%.
              </div>

              <div
                style={{
                  marginTop: 12,
                  fontWeight: 800,
                  color:
                    dependencyLevel === "High"
                      ? "#ff6b4a"
                      : dependencyLevel === "Moderate"
                        ? "#f59e0b"
                        : "#22c55e",
                }}
              >
                {dependencyLevel} dependency
              </div>
            </div>
          </div>
        </div>
        <div className="ai-recommendation-box">
          <div className="ai-recommendation-label">
            Profit concentration
          </div>

          <div className="ai-recommendation-text">
            Top product: {topProductProfitShare.toFixed(1)}% · Top 3 products:{" "}
            {top3ProfitShare.toFixed(1)}% of total profit.
          </div>

          <div
            style={{
              marginTop: 12,
              fontWeight: 800,
              color: top3ProfitShare > 60 ? "#ff6b4a" : top3ProfitShare > 35 ? "#f59e0b" : "#22c55e",
            }}
          >
            {top3ProfitShare > 60 ? "High" : top3ProfitShare > 35 ? "Moderate" : "Low"} profit dependency
          </div>
        </div>
        <div className="ai-recommendation-box">
          <div className="ai-recommendation-label">
            Weak profit drivers
          </div>

          <div className="ai-recommendation-text">
            {weakProfitDrivers.length > 0
              ? `${weakProfitDrivers.length} high-revenue products are contributing weak profit quality.`
              : "No major weak profit drivers detected in the current period."}
          </div>

          <div style={{ marginTop: 12 }}>
            {weakProfitDrivers.map((row) => (
              <div
                key={row.productId}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 16,
                  padding: "10px 0",
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.72)",
                  fontSize: 14,
                }}
              >
                <span>{row.productTitle}</span>
                <strong>{row.marginPct.toFixed(1)}%</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="ai-recommendation-box">
          <div className="ai-recommendation-label">
            Profit quality summary
          </div>

          <div className="ai-recommendation-text">
            {healthyProfitProducts} products show healthy margins, while{" "}
            {weakProfitProducts} products show weak profit quality.
          </div>

          <div
            style={{
              marginTop: 12,
              fontWeight: 800,
              color:
                profitQualityLevel === "Weak"
                  ? "#ff6b4a"
                  : profitQualityLevel === "Mixed"
                    ? "#f59e0b"
                    : "#22c55e",
            }}
          >
            {profitQualityLevel} profit quality
          </div>
        </div>
      </div>
    </div>
  );
}