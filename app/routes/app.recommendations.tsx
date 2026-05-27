import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "~/shopify.server";

import dashboardStylesUrl from "~/styles/dashboard.css?url";
import RecommendationsPanel from "~/components/dashboard/RecommendationsPanel";

import { loadMarginDashboardData } from "~/utils/margin.server";

import {
  type LoaderData,
  money,
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

export default function RecommendationsPage() {
  const { summary, rows } = useLoaderData() as LoaderData;
  const navigate = useNavigate();

  const sourceRows = rows;
  const lowMarginCount = rows.filter((row) => row.lowMargin).length;

  const visualLeak = Math.max(summary.totalLeak, 0);

  const recommendations = [
    sourceRows.filter((row) => row.losing).length > 0
      ? {
          title: `Fix ${
            sourceRows.filter((row) => row.losing).length
          } underpriced products selling below cost`,
          impact: `${money(visualLeak)} potential recovery`,
          confidence: "High confidence",
          actionLabel: "Review pricing",
          actionLink: "/app/products",
        }
      : null,

    summary.missingCostCount > 0
      ? {
          title: "Update missing product costs in Shopify",
          impact: `${summary.missingCostCount} products affected`,
          confidence: "Critical issue",
          actionLabel: "Update costs",
          actionLink: "/app/products",
        }
      : null,

    lowMarginCount > 0
      ? {
          title: "Review low-margin products below 10%",
          impact: `${lowMarginCount} products need attention`,
          confidence: "Medium confidence",
          actionLabel: "Analyze products",
          actionLink: "/app/products",
        }
      : null,

    rows.length > 0
      ? {
          title: "Review target prices for worst-performing products",
          impact: "20% margin target available",
          confidence: "Rule-based insight",
          actionLabel: "Review",
          actionLink: "/app/products",
        }
      : null,
  ].filter(Boolean) as {
    title: string;
    impact: string;
    confidence: string;
    actionLabel: string;
    actionLink: string;
  }[];

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
            <div className="eyebrow">AI RECOMMENDATIONS</div>

            <div className="hero-title">Optimization Action Center</div>

            <div className="hero-description">
              Review prioritized margin actions, missing cost fixes and pricing
              opportunities detected across your Shopify store.
            </div>
          </div>
        </div>

        <RecommendationsPanel recommendations={recommendations} />
      </div>
    </div>
  );
}