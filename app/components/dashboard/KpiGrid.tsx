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
                top: 24,
                right: 24,
                width: 30,
                height: 30,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255,115,60,0.10)",
                border: "1px solid rgba(255,115,60,0.22)",
                color: "#ff733c",
                fontSize: 16,
                fontWeight: 900,
                lineHeight: 1,
                boxShadow: "none",
              }}
            >
              {item.icon}
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