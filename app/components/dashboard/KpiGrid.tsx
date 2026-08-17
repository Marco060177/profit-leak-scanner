import MetricTooltip, {
  type MetricTooltipContent,
} from "~/components/ui/MetricTooltip";

type Kpi = {
  label: string;
  value: string;
  note: string;
  icon?: string;
  tone?: "positive" | "warning" | "danger";
  tooltip?: MetricTooltipContent;
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
                top: 27,
                right: 27,
                width: 28,
                height: 28,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background:
                  "rgba(255,115,60,0.08)",
                border:
                  "1px solid rgba(255,115,60,0.20)",
                color: "#ff733c",
                fontSize: 14,
                fontWeight: 900,
                lineHeight: 1,
              }}
            >
              {item.icon}
            </div>
          )}

          <div
            className="kpi-label"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              paddingRight: item.icon ? 42 : 0,
            }}
          >
            <span>{item.label}</span>

            {item.tooltip ? (
              <MetricTooltip
                content={item.tooltip}
              />
            ) : null}
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