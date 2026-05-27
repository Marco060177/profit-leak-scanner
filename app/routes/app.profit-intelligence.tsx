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
  const { summary } = useLoaderData() as LoaderData;
  const navigate = useNavigate();

  const totalRevenue = Math.max(summary.revenue, 1);
  const cogsPercentage = Math.min(100, Math.max(0, (summary.cogs / totalRevenue) * 100));
  const profitPercentage = Math.min(100, Math.max(0, (summary.profit / totalRevenue) * 100));
  const leakPercentage = Math.min(100, Math.max(0, (summary.totalLeak / totalRevenue) * 100));

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

        <MarginBreakdown
          cogsPercentage={cogsPercentage}
          profitPercentage={profitPercentage}
          leakPercentage={leakPercentage}
        />
      </div>
    </div>
  );
}