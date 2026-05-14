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
    <>
      {insights.map((insight) => (
        <div
          key={insight.title}
          className="insight-panel"
        >
          <div className="insight-header">
            <div>
              <div className="insight-eyebrow">
                {insight.eyebrow}
              </div>

              <div className="insight-title">
                {insight.title}
              </div>
            </div>

            <div className="insight-badge warning">
              {insight.badge}
            </div>
          </div>

          <div className="insight-description">
            {insight.description}
          </div>
        </div>
      ))}
    </>
  );
}