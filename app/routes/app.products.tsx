import * as React from "react";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "~/shopify.server";

import dashboardStylesUrl from "~/styles/dashboard.css?url";
import ProductRiskTable from "~/components/dashboard/ProductRiskTable";

import { loadMarginDashboardData } from "~/utils/margin.server";

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

  const sortedRiskRows = [...rows].sort((a, b) => {
    const score = (row: Row) =>
      (row.losing ? 100 : 0) +
      (row.missingCost ? 60 : 0) +
      (row.lowMargin ? 40 : 0) +
      Math.max(0, row.targetDelta);

    return score(b) - score(a);
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
            <div className="eyebrow">PRODUCTS INTELLIGENCE</div>

            <div className="hero-title">Product Risk Analysis</div>

            <div className="hero-description">
              Analyze low-margin products, missing costs, pricing risks and
              recoverable profit opportunities across your Shopify catalog.
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