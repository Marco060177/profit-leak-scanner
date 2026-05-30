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
  const { rows, period, shopHandle } = useLoaderData() as LoaderData;

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

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardNav
          active="products"
          navigate={navigate}
        />

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
                  color: criticalProducts > 0 ? "#ff6b4a" : highProducts > 0 ? "#f59e0b" : "#22c55e",
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
                MarginLab ranks products by real margin risk, missing cost data and
                recoverable pricing opportunities.
              </p>

              <div
                style={{
                  marginTop: 28,
                  paddingTop: 22,
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 18,
                }}
              >
                {[
                  ["Products at risk", `${criticalProducts + highProducts}`],
                  ["Critical products", `${criticalProducts}`],
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
              <div
                style={{
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 56,
                    fontWeight: 950,
                    color: "#ff6b4a",
                    lineHeight: 1,
                  }}
                >
                  {criticalProducts}
                </div>

                <div
                  style={{
                    marginTop: 10,
                    fontSize: 13,
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.52)",
                  }}
                >
                  Critical products
                </div>

                <div
                  style={{
                    marginTop: 22,
                    color: "rgba(255,255,255,0.68)",
                    lineHeight: 1.7,
                    maxWidth: 320,
                  }}
                >
                  Products with negative margins, missing cost data or severe pricing
                  gaps should be reviewed first.
                </div>
              </div>
            </div>
          </div>
        </div>
        <div
          className="panel"
          style={{
            marginBottom: 24,
          }}
        >
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
                  padding: 22,
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
              className={visibleLimit === limit ? "table-filter-btn active" : "table-filter-btn"}
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