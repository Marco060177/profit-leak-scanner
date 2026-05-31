type Insight = {
  eyebrow: string;
  title: string;
  description: React.ReactNode;
  badge: string;
};

type Props = {
  insights: Insight[];
};

export default function InsightsPanel({ insights }: Props) {
  if (insights.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: 22, marginBottom: 24 }}>
      {insights.map((insight) => {
        const isRecovery = insight.eyebrow === "RECOVERY OPPORTUNITY";

        return (
          <div
            key={insight.title}
            className="insight-panel"
            style={
              isRecovery
                ? {
                    padding: 34,
                    background:
                      "linear-gradient(135deg, rgba(34,197,94,0.12), rgba(8,15,28,0.96))",
                    border: "1px solid rgba(34,197,94,0.18)",
                  }
                : undefined
            }
          >
            <div className="insight-header">
              <div>
                <div className="insight-eyebrow">{insight.eyebrow}</div>

                <div className="insight-title">{insight.title}</div>
              </div>

              <div className="insight-badge warning">{insight.badge}</div>
            </div>

            <div className="insight-description">{insight.description}</div>
          </div>
        );
      })}
    </div>
  );
}