type Kpi = {
  label: string;
  value: string;
  note: string;
  icon?: string;
  tone?: "positive" | "warning" | "danger";
};

type Props = {
  items: Kpi[];
  marginBottom?: number;
};

export default function KpiGrid({
  items,
  marginBottom,
}: Props) {
  return (
    <div
      className="kpi-grid"
      style={
        marginBottom
          ? { marginBottom }
          : undefined
      }
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="kpi-card"
        >
          {item.icon && (
            <div
              style={{
                position: "absolute",
                top: 22,
                right: 22,
                width: 38,
                height: 38,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                background: "rgba(255,115,60,0.08)",
                border: "1px solid rgba(255,115,60,0.22)",
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.04)",
              }}
            >
              <span
                style={{
                  color: "#ff733c",
                  fontSize: 18,
                  fontWeight: 800,
                  lineHeight: 1,
                  display: "block",
                }}
              >
                {item.icon}
              </span>
            </div>
          )}

          <div className="kpi-label">
            {item.label}
          </div>

          <div className="kpi-value">
            {item.value}
          </div>

          <div
            className="kpi-note"
            style={{
              color:
                item.tone === "positive"
                  ? "#22c55e"
                  : item.tone === "danger"
                    ? "#ff6b4a"
                    : "#f59e0b",
            }}
          >
            {item.note}
          </div>
        </div>
      ))}
    </div>
  );
}