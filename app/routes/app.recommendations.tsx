import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "~/shopify.server";

import dashboardStylesUrl from "~/styles/dashboard.css?url";


import { loadMarginDashboardData } from "~/utils/margin.server";
import DashboardNav from "~/components/dashboard/DashboardNav";

import { type LoaderData, money } from "~/utils/margin";

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

  const losingProducts = rows.filter((row) => row.losing);
  const lowMarginProducts = rows.filter((row) => row.lowMargin);
  const missingCostProducts = rows.filter((row) => row.missingCost);

  const visualLeak = Math.max(summary.totalLeak, 0);

  const priorityActions = [
    losingProducts.length > 0
      ? {
        priority: "Critical",
        title: `Fix ${losingProducts.length} products selling below cost`,
        impact: `${money(visualLeak)} potential recovery`,
        description:
          "These products are generating negative contribution margin and should be reviewed before any growth or pricing optimization work.",
        actionLabel: "Review pricing",
        actionLink: "/app/products",
        color: "#ff6b4a",
      }
      : null,

    missingCostProducts.length > 0
      ? {
        priority: "High",
        title: "Complete missing product cost data",
        impact: `${missingCostProducts.length} products affected`,
        description:
          "Missing costs reduce margin accuracy and can hide real product-level risk. Add cost data before trusting profitability signals.",
        actionLabel: "Update costs",
        actionLink: "/app/products",
        color: "#f59e0b",
      }
      : null,

    lowMarginProducts.length > 0
      ? {
        priority: "Medium",
        title: "Review low-margin product group",
        impact: `${lowMarginProducts.length} products need attention`,
        description:
          "Low-margin products may be acceptable strategically, but they should be monitored because they can weaken profit quality at scale.",
        actionLabel: "Analyze products",
        actionLink: "/app/products",
        color: "#f59e0b",
      }
      : null,

    rows.length > 0
      ? {
        priority: "Low",
        title: "Review target prices for weak products",
        impact: "20% margin target available",
        description:
          "Compare current prices against target margin recommendations to identify realistic recovery opportunities.",
        actionLabel: "Review targets",
        actionLink: "/app/products",
        color: "#22c55e",
      }
      : null,
  ].filter(Boolean) as {
    priority: string;
    title: string;
    impact: string;
    description: string;
    actionLabel: string;
    actionLink: string;
    color: string;
  }[];

  const criticalActions = priorityActions.filter(
    (action) => action.priority === "Critical",
  ).length;

  const highActions = priorityActions.filter(
    (action) => action.priority === "High",
  ).length;

  const actionScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(100 - criticalActions * 24 - highActions * 12),
    ),
  );

  const actionScoreColor =
    actionScore < 40 ? "#ff6b4a" : actionScore < 70 ? "#f59e0b" : "#22c55e";

  

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardNav active="recommendations" navigate={navigate} />

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
              <div className="eyebrow">ACTION PRIORITY SCORE</div>

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
                {actionScore}
                <span style={{ fontSize: 34, opacity: 0.45 }}>/100</span>
              </div>

              <div
                style={{
                  marginTop: 18,
                  fontSize: 24,
                  fontWeight: 900,
                  color: actionScoreColor,
                }}
              >
                {criticalActions > 0
                  ? "Critical actions required"
                  : highActions > 0
                    ? "High-priority actions detected"
                    : "Action queue stable"}
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
                MarginLab converts product risk, missing cost data and weak
                margin signals into a prioritized action queue.
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
                  ["Total actions", `${priorityActions.length}`],
                  ["Critical actions", `${criticalActions}`],
                  ["Potential recovery", money(visualLeak)],
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
                  width: 170,
                  height: 170,
                  borderRadius: "50%",
                  border: "16px solid rgba(255,255,255,0.08)",
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: `0 0 46px ${actionScoreColor}44`,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: -16,
                    borderRadius: "50%",
                    background: `conic-gradient(${actionScoreColor} ${actionScore * 3.6
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
                    {actionScore}
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      fontWeight: 900,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: actionScoreColor,
                    }}
                  >
                    Action score
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="panel" style={{ marginBottom: 28 }}>
          <div className="panel-header">
            <div>
              <div className="panel-eyebrow">PRIORITY QUEUE</div>
              <h2 className="panel-title">Recommended action sequence</h2>
            </div>
          </div>

          <div style={{ display: "grid", gap: 16, marginTop: 24 }}>
            {priorityActions.map((action, index) => (
              <div
                key={action.title}
                style={{
                  display: "grid",
                  gridTemplateColumns: "54px 1fr auto",
                  gap: 18,
                  alignItems: "center",
                  padding: 22,
                  borderRadius: 22,
                  background:
                    "linear-gradient(180deg, rgba(16,22,35,0.96), rgba(9,13,22,0.96))",
                  border: "1px solid rgba(255,255,255,0.07)",
                  boxShadow: "0 18px 46px rgba(0,0,0,0.32)",
                }}
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 16,
                    background: `${action.color}18`,
                    color: action.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 950,
                    fontSize: 20,
                  }}
                >
                  {index + 1}
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 900,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: action.color,
                    }}
                  >
                    {action.priority} priority
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 22,
                      fontWeight: 950,
                      color: "#f3f4f6",
                    }}
                  >
                    {action.title}
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      color: "rgba(255,255,255,0.62)",
                      lineHeight: 1.6,
                      maxWidth: 900,
                    }}
                  >
                    {action.description}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 950,
                      color: action.color,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {action.impact}
                  </div>

                  <button
                    type="button"
                    className="apply-button"
                    style={{ marginTop: 14 }}
                    onClick={() => navigate(action.actionLink)}
                  >
                    {action.actionLabel} →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel" style={{ marginBottom: 28 }}>
          <div className="panel-header">
            <div>
              <div className="panel-eyebrow">AI INSIGHTS</div>
              <h2 className="panel-title">Why these actions matter</h2>
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
                title: "Pricing risk is concentrated",
                value: `${losingProducts.length} losing products`,
                text:
                  losingProducts.length > 0
                    ? "A small number of underpriced products may be responsible for most detected profit leakage."
                    : "No products are currently selling below cost.",
                color: "#ff6b4a",
              },
              {
                title: "Cost data quality affects accuracy",
                value: `${missingCostProducts.length} missing costs`,
                text:
                  missingCostProducts.length > 0
                    ? "Missing cost data reduces confidence in product-level profitability and should be fixed before deeper analysis."
                    : "Cost data coverage looks healthy for the current period.",
                color: "#f59e0b",
              },
              {
                title: "Margin quality needs monitoring",
                value: `${lowMarginProducts.length} low-margin products`,
                text:
                  lowMarginProducts.length > 0
                    ? "Low-margin products may be strategic, but they can weaken store profit quality when they scale."
                    : "No major low-margin product group detected.",
                color: "#22c55e",
              },
            ].map((insight) => (
              <div
                key={insight.title}
                style={{
                  position: "relative",
                  overflow: "hidden",
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
                    position: "absolute",
                    inset: 0,
                    background: `radial-gradient(circle at top right, ${insight.color}22, transparent 42%)`,
                    pointerEvents: "none",
                  }}
                />

                <div
                  style={{
                    position: "relative",
                    fontSize: 12,
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.48)",
                  }}
                >
                  {insight.title}
                </div>

                <div
                  style={{
                    position: "relative",
                    marginTop: 14,
                    fontSize: 28,
                    fontWeight: 950,
                    color: insight.color,
                  }}
                >
                  {insight.value}
                </div>

                <div
                  style={{
                    position: "relative",
                    marginTop: 12,
                    color: "rgba(255,255,255,0.66)",
                    lineHeight: 1.65,
                  }}
                >
                  {insight.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}