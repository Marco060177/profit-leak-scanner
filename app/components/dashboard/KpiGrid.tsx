import MetricTooltip, {
  type MetricTooltipContent,
} from "~/components/ui/MetricTooltip";
import { MetricCard, ResponsiveGrid } from "~/components/ui/VisualSystem";

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

export default function KpiGrid({ items, marginBottom }: Props) {
  return (
    <ResponsiveGrid
      columns={4}
      className="kpi-grid dashboard-v2-kpi-grid"
      style={marginBottom ? { marginBottom } : undefined}
    >
      {items.map((item) => (
        <MetricCard
          key={item.label}
          className="dashboard-v2-kpi"
          tone={
            item.tone === "positive"
              ? "green"
              : item.tone === "danger"
                ? "red"
                : "amber"
          }
          icon={item.icon}
          label={
            <span className="dashboard-v2-metric-label">
              {item.label}
              {item.tooltip ? <MetricTooltip content={item.tooltip} /> : null}
            </span>
          }
          value={item.value}
          detail={item.note}
        />
      ))}
    </ResponsiveGrid>
  );
}
