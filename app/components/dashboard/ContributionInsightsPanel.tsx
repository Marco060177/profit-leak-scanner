type Insight = {
  title: string;
  value: string;
  description: string;
  severity: string;
};

type Props = {
  insights: Insight[];
};

export default function ContributionInsightsPanel({
  insights,
}: Props) {
  if (!insights.length) {
    return null;
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-eyebrow">
            CONTRIBUTION INTELLIGENCE
          </div>

          <h2 className="panel-title">
            Revenue quality & dependency analysis
          </h2>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gap: 18,
          marginTop: 24,
        }}
      >
        {insights.map((insight) => (
          <div
            key={insight.title}
            style={{
              padding: 22,
              borderRadius: 20,
              background:
                "linear-gradient(180deg, rgba(18,24,38,0.96), rgba(11,15,24,0.96))",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 16,
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 900,
                  color: "#f3f4f6",
                }}
              >
                {insight.title}
              </div>

              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  background: "rgba(255,90,54,0.14)",
                  color: "#ff8a6b",
                  fontWeight: 900,
                  fontSize: 13,
                  whiteSpace: "nowrap",
                }}
              >
                {insight.value}
              </div>
            </div>

            <div
              style={{
                marginTop: 14,
                color: "rgba(255,255,255,0.62)",
                lineHeight: 1.7,
                fontSize: 14,
              }}
            >
              {insight.description}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}