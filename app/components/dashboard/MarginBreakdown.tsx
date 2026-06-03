type Props = {
  cogsPercentage: number;
  profitPercentage: number;
  leakPercentage: number;
};

export default function MarginBreakdown({
  cogsPercentage,
  profitPercentage,
  leakPercentage,
}: Props) {
  const items = [
    {
      label: "COGS",
      value: cogsPercentage,
      color: "#3b82f6",
      description: "Revenue absorbed by product costs.",
    },
    {
      label: "Profit",
      value: profitPercentage,
      color: "#22c55e",
      description: "Revenue retained as gross profit.",
    },
    {
      label: "Leak",
      value: leakPercentage,
      color: "#ef4444",
      description: "Detected margin leakage across products.",
    },
  ];

  return (
    <div className="panel">
      <div className="section-header">
        <div>
          <div className="section-title">Margin Breakdown</div>

          <div className="section-subtitle">
            Revenue allocation across costs, profit and detected leaks.
          </div>
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
        {items.map((item) => (
          <div
            key={item.label}
            style={{
              borderRadius: 24,
              padding: 24,
              background:
                "radial-gradient(circle at top left, rgba(255,115,60,0.05), transparent 36%), linear-gradient(135deg, rgba(17,24,39,0.98), rgba(6,12,24,0.98))",
              border: "1px solid rgba(255,115,60,0.18)",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.035), 0 22px 55px rgba(0,0,0,0.30)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 900,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.54)",
                }}
              >
                {item.label}
              </div>

              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: item.color,
                  boxShadow: `0 0 18px ${item.color}66`,
                }}
              />
            </div>

            <div
              style={{
                marginTop: 18,
                fontSize: 46,
                fontWeight: 950,
                lineHeight: 1,
                color: item.color,
                letterSpacing: "-0.04em",
              }}
            >
              {item.value.toFixed(1)}%
            </div>

            <div
              style={{
                marginTop: 10,
                minHeight: 42,
                color: "rgba(255,255,255,0.50)",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              {item.description}
            </div>

            <div
              style={{
                height: 9,
                borderRadius: 999,
                background: "rgba(255,255,255,0.07)",
                overflow: "hidden",
                marginTop: 20,
              }}
            >
              <div
                style={{
                  width: `${Math.min(Math.max(item.value, 0), 100)}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: item.color,
                  boxShadow: `0 0 18px ${item.color}55`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}