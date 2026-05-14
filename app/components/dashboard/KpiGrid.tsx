type Kpi = {
  label: string;
  value: string;
  note: string;
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