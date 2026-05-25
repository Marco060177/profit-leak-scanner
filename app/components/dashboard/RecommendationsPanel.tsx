type Recommendation = {
  title: string;
  impact: string;
  confidence: string;
  actionLabel: string;
  actionLink: string;
};

type Props = {
  recommendations: Recommendation[];
};

function getRecommendationIcon(title: string) {
  const lowerTitle = title.toLowerCase();

  if (lowerTitle.includes("below cost")) return "↘";
  if (lowerTitle.includes("missing")) return "□";
  if (lowerTitle.includes("low-margin")) return "!";
  if (lowerTitle.includes("target")) return "◎";

  return "✦";
}

function getRecommendationAction(title: string) {
  const lowerTitle = title.toLowerCase();

  if (lowerTitle.includes("below cost")) {
    return "Review pricing and stop products from selling below cost.";
  }

  if (lowerTitle.includes("missing")) {
    return "Add missing cost data in Shopify to unlock accurate margin analysis.";
  }

  if (lowerTitle.includes("low-margin")) {
    return "Review weak-margin products and adjust pricing where possible.";
  }

  if (lowerTitle.includes("target")) {
    return "Compare current prices against target margin recommendations.";
  }

  return "Review pricing strategy and optimize margins.";
}

export default function RecommendationsPanel({ recommendations }: Props) {
  if (recommendations.length === 0) return null;

  return (
    <div className="ai-panel" id="recommendations-section">
      <div className="ai-glow" />

      <div className="section-header ai-header">
        <div>
          <div className="ai-eyebrow">AI Recommendations</div>
          <div className="ai-title">Smart margin optimization suggestions</div>
        </div>

        <div className="ai-badge">LIVE ANALYSIS</div>
      </div>

      <div className="ai-grid">
        {recommendations.map(({ title, impact, confidence, actionLabel, actionLink }) => (
          <div
            key={title}
            className="ai-card"
            style={{
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -120,
                right: -80,
                width: 220,
                height: 220,
                borderRadius: "50%",
                background: "rgba(255,90,54,0.08)",
                filter: "blur(70px)",
                pointerEvents: "none",
              }}
            />

            <div className="ai-card-top">
              <div className="ai-priority">HIGH PRIORITY</div>
              <div className="ai-confidence-inline">{confidence}</div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 10,
                position: "relative",
                zIndex: 2,
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(255,90,54,0.12)",
                  border: "1px solid rgba(255,90,54,0.18)",
                  color: "#ff7b59",
                  fontWeight: 800,
                  fontSize: 18,
                  flexShrink: 0,
                }}
              >
                {getRecommendationIcon(title)}
              </div>

              <div className="ai-card-title">{title}</div>
            </div>

            <div
              className="ai-impact"
              style={{
                marginTop: 14,
                marginBottom: 18,
              }}
            >
              {impact}
            </div>

            <div className="ai-recommendation">
              <strong>Recommended action:</strong>{" "}
              {getRecommendationAction(title)}
            </div>

            <div className="ai-footer">
              <div>
                <div className="confidence-label">Analysis status</div>
                <div className="confidence-value">Live monitoring active</div>
              </div>

              <button
                type="button"
                className="apply-button"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
                onClick={() => {
                  const section = document.querySelector(actionLink);

                  if (section) {
                    section.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {actionLabel}
                  <span style={{ fontSize: 18 }}>→</span>
                </span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div >
  );
  
}