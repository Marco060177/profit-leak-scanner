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
                top: 26,
                right: 26,
                width: 28,
                height: 28,
                borderRadius: 999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255,115,60,0.10)",
                color: "#ff733c",
                fontSize: 13,
                fontWeight: 900,
                lineHeight: 1,
              }}
            >
              <span style={{ transform: "translateY(-1px)" }}>
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