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

        if (isRecovery) {
          return (
            <div
              key={insight.title}
              className="insight-panel"
              style={{
                padding: 42,
                minHeight: 300,
                display: "grid",
                gridTemplateColumns: "1.35fr 0.65fr",
                gap: 38,
                alignItems: "center",
                background:
                  "radial-gradient(circle at 78% 42%, rgba(34,197,94,0.22), transparent 30%), linear-gradient(135deg, rgba(6,18,30,0.98), rgba(4,9,20,0.98))",
                border: "1px solid rgba(34,197,94,0.26)",
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.04), 0 28px 90px rgba(0,0,0,0.32)",
                overflow: "hidden",
                position: "relative",
              }}
            >
              <div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 22,
                  }}
                >
                  <div
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: 16,
                      display: "grid",
                      placeItems: "center",
                      background: "rgba(34,197,94,0.12)",
                      border: "1px solid rgba(34,197,94,0.22)",
                      color: "#4ade80",
                      fontSize: 26,
                      boxShadow: "0 0 40px rgba(34,197,94,0.14)",
                    }}
                  >
                    ✦
                  </div>

                  <div
                    style={{
                      color: "#4ade80",
                      fontSize: 13,
                      fontWeight: 950,
                      letterSpacing: "0.18em",
                    }}
                  >
                    {insight.eyebrow}
                  </div>
                </div>

                <div
                  style={{
                    maxWidth: 620,
                    color: "#f8fafc",
                    fontSize: 38,
                    lineHeight: 1.08,
                    fontWeight: 950,
                    letterSpacing: "-0.04em",
                  }}
                >
                  {insight.title}
                </div>

                <div
                  style={{
                    marginTop: 26,
                    maxWidth: 760,
                    color: "rgba(255,255,255,0.68)",
                    fontSize: 18,
                    lineHeight: 1.65,
                    fontWeight: 650,
                  }}
                >
                  {insight.description}
                </div>
              </div>

              <div
                style={{
                  borderLeft: "1px solid rgba(255,255,255,0.09)",
                  paddingLeft: 38,
                  minHeight: 230,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    width: 132,
                    height: 132,
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    marginBottom: 26,
                    background:
                      "radial-gradient(circle, rgba(74,222,128,0.32), rgba(34,197,94,0.08) 55%, transparent 70%)",
                    border: "1px solid rgba(74,222,128,0.32)",
                    boxShadow:
                      "0 0 60px rgba(34,197,94,0.20), inset 0 0 30px rgba(34,197,94,0.16)",
                    color: "#bbf7d0",
                    fontSize: 58,
                    fontWeight: 950,
                  }}
                >
                  $
                </div>

                <div
                  style={{
                    color: "rgba(255,255,255,0.58)",
                    fontSize: 13,
                    fontWeight: 950,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                  }}
                >
                  Potential Recovery
                </div>

                <div
                  style={{
                    marginTop: 10,
                    color: "#4ade80",
                    fontSize: 46,
                    lineHeight: 1,
                    fontWeight: 950,
                    letterSpacing: "-0.04em",
                    textShadow: "0 0 34px rgba(34,197,94,0.22)",
                  }}
                >
                  {insight.badge}
                </div>
              </div>
            </div>
          );
        }

        return (
          <div key={insight.title} className="insight-panel">
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