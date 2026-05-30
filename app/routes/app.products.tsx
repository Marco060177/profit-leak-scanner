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

  const sortedRiskRows = [...visibleRows].sort((a, b) => {
    const scoreA = productRiskScore(a);
    const scoreB = productRiskScore(b);

    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }

    return b.revenue - a.revenue;
  });

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
        <div
          style={{
            marginBottom: 24,
            padding: 24,
            borderRadius: 24,
            border: "1px solid rgba(255,255,255,0.08)",
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.5)",
              marginBottom: 18,
            }}
          >
            Product Risk Distribution
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 20,
            }}
          >
            <div>
              <div style={{ color: "#ff6b4a", fontSize: 30, fontWeight: 900 }}>
                {criticalProducts}
              </div>
              <div style={{ color: "rgba(255,255,255,0.6)" }}>
                Critical
              </div>
            </div>

            <div>
              <div style={{ color: "#f59e0b", fontSize: 30, fontWeight: 900 }}>
                {highProducts}
              </div>
              <div style={{ color: "rgba(255,255,255,0.6)" }}>
                High
              </div>
            </div>

            <div>
              <div style={{ color: "#22c55e", fontSize: 30, fontWeight: 900 }}>
                {healthyProducts}
              </div>
              <div style={{ color: "rgba(255,255,255,0.6)" }}>
                Healthy
              </div>
            </div>
          </div>
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