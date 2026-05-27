import { useNavigate } from "react-router";

import dashboardStylesUrl from "~/styles/dashboard.css?url";

export const links = () => [
  {
    rel: "stylesheet",
    href: dashboardStylesUrl,
  },
];

export default function RecommendationsPage() {
  const navigate = useNavigate();

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
      </div>
    </div>
  );
}