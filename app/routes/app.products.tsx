import * as React from "react";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "~/shopify.server";

import dashboardStylesUrl from "~/styles/dashboard.css?url";
import ProductRiskTable from "~/components/dashboard/ProductRiskTable";

import { loadMarginDashboardData } from "~/utils/margin.server";
import DashboardNav from "~/components/dashboard/DashboardNav";

import {
  type LoaderData,
  type Row,
} from "~/utils/margin";

export const links = () => [
  {
    rel: "stylesheet",
    href: dashboardStylesUrl,
  },
];

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

  return loadMarginDashboardData({
    admin,
    session,
    period,
  });
};

export default function ProductsPage() {
  const { summary, rows, period, shopHandle } =
    useLoaderData() as LoaderData;

  const navigate = useNavigate();
  const [onlyLosing, setOnlyLosing] = React.useState(false);
  const [visibleLimit, setVisibleLimit] = React.useState<10 | 20 | 50>(20);

  const productRiskScore = (row: Row) => {
    let score = 0;

    if (row.losing) score += 40;
    if (row.missingCost) score += 25;
    if (row.lowMargin) score += 20;

    score += Math.min(15, row.revenue / 1000);

    if (row.marginPct < 5) score += 10;
    if (row.targetDelta > 0) score += Math.min(10, row.targetDelta / 10);

    return Math.min(100, Math.round(score));
  };

  const visibleRows = onlyLosing
    ? rows.filter((row) => row.losing)
    : rows;

  const sortedRiskRows = [...visibleRows]
    .sort((a, b) => {
      const scoreA = productRiskScore(a);
      const scoreB = productRiskScore(b);

      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }

      return b.revenue - a.revenue;
    })
    .slice(0, visibleLimit);

  const riskLabel = (row: Row) => {
    if (row.losing) return "Critical";
    if (row.missingCost) return "Missing cost";
    if (row.lowMargin) return "High";
    return "Healthy";
  };

  const riskColor = (row: Row) => {
    if (row.losing) return "#ef4444";
    if (row.missingCost) return "#f59e0b";
    if (row.lowMargin) return "#ff6b4a";
    return "#22c55e";
  };

  const riskBackground = (row: Row) => {
    if (row.losing) return "rgba(239,68,68,0.16)";
    if (row.missingCost) return "rgba(245,158,11,0.14)";
    if (row.lowMargin) return "rgba(255,90,54,0.14)";
    return "rgba(34,197,94,0.12)";
  };

  const criticalProducts = rows.filter((row) => row.losing).length;

  const highProducts = rows.filter(
    (row) => !row.losing && (row.missingCost || row.lowMargin),
  ).length;

  const healthyProducts = rows.filter(
    (row) => !row.losing && !row.missingCost && !row.lowMargin,
  ).length;

  const totalProducts = Math.max(rows.length, 1);

  const criticalPct = (criticalProducts / totalProducts) * 100;
  const highPct = (highProducts / totalProducts) * 100;
  const healthyPct = (healthyProducts / totalProducts) * 100;

  const targetMarginPct = 20;

  const revenueAtRisk = rows
    .filter((row) => row.revenue > 0)
    .filter((row) => row.marginPct < targetMarginPct)
    .map((row) => ({
      ...row,
      marginGap: targetMarginPct - row.marginPct,
      riskValue: row.revenue * ((targetMarginPct - row.marginPct) / 100),
      riskLevel:
        row.marginPct < 0
          ? "Critical"
          : row.marginPct < 10
            ? "High"
            : "Medium",
    }))
    .sort((a, b) => b.riskValue - a.riskValue)
    .slice(0, 5);

  const totalRevenueAtRisk = revenueAtRisk.reduce(
    (sum, product) => sum + product.revenue,
    0,
  );

  const totalRevenueAtRiskOpportunity = revenueAtRisk.reduce(
    (sum, product) => sum + product.riskValue,
    0,
  );

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardNav active="products" navigate={navigate} />

        <div className="hero-header">
          <div>
            <div className="eyebrow">PRODUCTS INTELLIGENCE</div>

            <div className="hero-title">Product Risk Analysis</div>

            <div className="hero-description">
              Analyze low-margin products, missing costs, pricing risks and
              recoverable profit opportunities across your Shopify catalog.
            </div>
          </div>
        </div>

        <div className="hero-score-card" style={{ marginBottom: 28 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.1fr 1fr",
              gap: 28,
              alignItems: "stretch",
            }}
          >
            <div>
              <div className="eyebrow">PRODUCT INTELLIGENCE SCORE</div>

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
                {Math.max(
                  0,
                  Math.min(
                    100,
                    Math.round(100 - criticalProducts * 14 - highProducts * 7),
                  ),
                )}
                <span style={{ fontSize: 34, opacity: 0.45 }}>/100</span>
              </div>

              <div
                style={{
                  marginTop: 18,
                  fontSize: 24,
                  fontWeight: 900,
                  color:
                    criticalProducts > 0
                      ? "#ff6b4a"
                      : highProducts > 0
                        ? "#f59e0b"
                        : "#22c55e",
                }}
              >
                {criticalProducts > 0
                  ? "Critical product risk detected"
                  : highProducts > 0
                    ? "Moderate catalog risk"
                    : "Healthy catalog"}
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
                MarginLab ranks products by real margin risk, missing cost data
                and recoverable pricing opportunities.
              </p>

              <div
                style={{
                  marginTop: 28,
                  paddingTop: 22,
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                  display: "grid",
                  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                  gap: 18,
                }}
              >
                {[
                  ["Products at risk", `${criticalProducts + highProducts}`],
                  ["Critical products", `${criticalProducts}`],
                  ["Recoverable profit", `$${summary.totalLeak.toFixed(0)}`],
                  ["Healthy products", `${healthyProducts}`],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div
                      style={{
                        fontSize: 34,
                        fontWeight: 950,
                        color: "#f3f4f6",
                        lineHeight: 1,
                      }}
                    >
                      {value}
                    </div>

                    <div
                      style={{
                        marginTop: 9,
                        fontSize: 11,
                        fontWeight: 900,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "rgba(255,255,255,0.42)",
                      }}
                    >
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                borderRadius: 28,
                border: "1px solid rgba(255,255,255,0.08)",
                background:
                  "radial-gradient(circle at 50% 35%, rgba(255,90,54,0.20), transparent 28%), linear-gradient(180deg, rgba(16,22,35,0.96), rgba(7,11,20,0.96))",
                padding: 32,
                boxShadow: "0 24px 80px rgba(0,0,0,0.42)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 260,
              }}
            >
              {(() => {
                const productScore = Math.max(
                  0,
                  Math.min(
                    100,
                    Math.round(100 - criticalProducts * 14 - highProducts * 7),
                  ),
                );

                const productScoreColor =
                  productScore < 40
                    ? "#ff6b4a"
                    : productScore < 70
                      ? "#f59e0b"
                      : "#22c55e";

                const productScoreLabel =
                  productScore < 40
                    ? "High risk"
                    : productScore < 70
                      ? "Moderate risk"
                      : "Healthy";

                return (
                  <div
                    style={{
                      width: 170,
                      height: 170,
                      borderRadius: "50%",
                      border: "16px solid rgba(255,255,255,0.08)",
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: `0 0 46px ${productScoreColor}44`,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        inset: -16,
                        borderRadius: "50%",
                        background: `conic-gradient(${productScoreColor} ${productScore * 3.6
                          }deg, transparent 0deg)`,
                        mask:
                          "radial-gradient(circle, transparent 58%, black 59%)",
                        WebkitMask:
                          "radial-gradient(circle, transparent 58%, black 59%)",
                      }}
                    />

                    <div style={{ textAlign: "center", position: "relative" }}>
                      <div
                        style={{
                          fontSize: 44,
                          fontWeight: 950,
                          color: "#f3f4f6",
                          lineHeight: 1,
                        }}
                      >
                        {productScore}
                      </div>

                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 12,
                          fontWeight: 900,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color: productScoreColor,
                        }}
                      >
                        {productScoreLabel}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-header">
            <div>
              <div className="panel-eyebrow">PRODUCT RISK DISTRIBUTION</div>
              <h2 className="panel-title">Catalog risk overview</h2>
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
                label: "Critical",
                count: criticalProducts,
                pct: criticalPct,
                color: "#ff6b4a",
              },
              {
                label: "High",
                count: highProducts,
                pct: highPct,
                color: "#f59e0b",
              },
              {
                label: "Healthy",
                count: healthyProducts,
                pct: healthyPct,
                color: "#22c55e",
              },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  borderRadius: 22,
                  padding: 18,
                  background:
                    "linear-gradient(180deg, rgba(16,22,35,0.96), rgba(9,13,22,0.96))",
                  border: "1px solid rgba(255,255,255,0.07)",
                  boxShadow: "0 18px 46px rgba(0,0,0,0.32)",
                }}
              >
                <div
                  style={{
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
                    marginTop: 14,
                    fontSize: 42,
                    fontWeight: 950,
                    lineHeight: 1,
                    color: item.color,
                  }}
                >
                  {item.count}
                </div>

                <div
                  style={{
                    marginTop: 8,
                    color: "rgba(255,255,255,0.58)",
                    fontWeight: 800,
                  }}
                >
                  {item.pct.toFixed(1)}% of catalog
                </div>

                <div
                  style={{
                    height: 8,
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.07)",
                    overflow: "hidden",
                    marginTop: 18,
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(0, item.pct))}%`,
                      height: "100%",
                      borderRadius: 999,
                      background: item.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-header">
            <div>
              <div className="panel-eyebrow">REVENUE AT RISK</div>
              <h2 className="panel-title">High revenue, low margin products</h2>

              <p className="panel-subtitle">
                ${totalRevenueAtRisk.toFixed(0)} in revenue is currently
                operating below the 20% target margin, with an estimated $
                {totalRevenueAtRiskOpportunity.toFixed(0)} margin opportunity.
              </p>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 14,
              marginTop: 24,
            }}
          >
            {revenueAtRisk.length > 0 ? (
              revenueAtRisk.map((product) => (
                <div
                  key={product.productId}
                  style={{
                    borderRadius: 20,
                    padding: 22,
                    background:
                      "radial-gradient(circle at top left, rgba(255,115,60,0.05), transparent 35%), linear-gradient(135deg, rgba(17,24,39,0.98), rgba(6,12,24,0.98))",

                    border: "1px solid rgba(255,115,60,0.18)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 900,
                      color: "#f3f4f6",
                      lineHeight: 1.35,
                      minHeight: 34,
                    }}
                  >
                    {product.productTitle}
                  </div>

                  <div
                    style={{
                      marginTop: 12,
                      display: "inline-flex",
                      padding: "6px 10px",
                      borderRadius: 999,
                      background:
                        product.riskLevel === "Critical"
                          ? "rgba(239,68,68,0.14)"
                          : product.riskLevel === "High"
                            ? "rgba(249,115,22,0.14)"
                            : "rgba(234,179,8,0.14)",
                      color:
                        product.riskLevel === "Critical"
                          ? "#ff6b6b"
                          : product.riskLevel === "High"
                            ? "#ff8a4c"
                            : "#facc15",
                      fontSize: 11,
                      fontWeight: 900,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    {product.riskLevel}
                  </div>

                  <div
                    style={{
                      marginTop: 16,
                      fontSize: 11,
                      fontWeight: 900,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.42)",
                    }}
                  >
                    Revenue
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 24,
                      fontWeight: 950,
                      color: "#f3f4f6",
                    }}
                  >
                    ${product.revenue.toFixed(0)}
                  </div>

                  <div
                    style={{
                      marginTop: 14,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      color: "rgba(255,255,255,0.62)",
                      fontSize: 13,
                      fontWeight: 800,
                    }}
                  >
                    <span>Margin</span>
                    <span style={{ color: "#ff6b4a" }}>
                      {product.marginPct.toFixed(1)}%
                    </span>
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      color: "rgba(255,255,255,0.62)",
                      fontSize: 13,
                      fontWeight: 800,
                    }}
                  >
                    <span>Opportunity</span>
                    <span>${product.riskValue.toFixed(0)}</span>
                  </div>

                  <div
                    style={{
                      marginTop: 14,
                      paddingTop: 14,
                      borderTop: "1px solid rgba(255,255,255,0.07)",
                      color: "rgba(255,255,255,0.52)",
                      fontSize: 12,
                      lineHeight: 1.55,
                    }}
                  >
                    High revenue product operating below the 20% target margin.
                  </div>
                </div>
              ))
            ) : (
              <div
                style={{
                  gridColumn: "1 / -1",
                  padding: 22,
                  borderRadius: 18,
                  background: "rgba(34,197,94,0.08)",
                  border: "1px solid rgba(34,197,94,0.18)",
                  color: "rgba(255,255,255,0.68)",
                  fontWeight: 800,
                }}
              >
                No high-revenue products are currently below the target margin.
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            marginBottom: 16,
          }}
        >
          {[10, 20, 50].map((limit) => (
            <button
              key={limit}
              type="button"
              className={
                visibleLimit === limit
                  ? "table-filter-btn active"
                  : "table-filter-btn"
              }
              onClick={() => setVisibleLimit(limit as 10 | 20 | 50)}
            >
              Show {limit}
            </button>
          ))}
        </div>

        <ProductRiskTable
          sortedRiskRows={sortedRiskRows}
          onlyLosing={onlyLosing}
          setOnlyLosing={setOnlyLosing}
          period={period}
          riskLabel={riskLabel}
          riskColor={riskColor}
          riskBackground={riskBackground}
          shopHandle={shopHandle}
        />
      </div>
    </div>
  );
}