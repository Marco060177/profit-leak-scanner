type Recommendation = {
  title: string;
  impact: string;
  confidence: string;
};

type Props = {
  recommendations: Recommendation[];
};

export default function RecommendationsPanel({ recommendations }: Props) {
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
        {recommendations.map(({ title, impact, confidence }) => (
          <div key={title} className="ai-card">
            <div className="ai-card-top">
              <div className="ai-priority">HIGH PRIORITY</div>
              <div className="ai-confidence-inline">{confidence}</div>
            </div>

            <div className="ai-card-title">{title}</div>
            <div className="ai-impact">{impact}</div>

            <div className="ai-recommendation">
              Recommended action: review pricing strategy and optimize margins.
            </div>

            <div className="ai-footer">
              <div>
                <div className="confidence-label">Analysis status</div>
                <div className="confidence-value">Live monitoring active</div>
              </div>

              <button className="apply-button">Review insight</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}