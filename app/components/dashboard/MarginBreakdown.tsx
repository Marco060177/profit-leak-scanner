import { useI18n } from "~/components/i18n/I18nProvider";
import { pct } from "~/utils/margin";
import MetricTooltip from "~/components/ui/MetricTooltip";
import {
  MetricCard,
  PremiumPanel,
  ResponsiveGrid,
  type VisualTone,
} from "~/components/ui/VisualSystem";

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
  const { messages } = useI18n();
  const copy = messages.marginBreakdown;

  const items = [
    {
      label: "COGS",
      value: cogsPercentage,
      color: "#3b82f6",
      tone: "blue" as VisualTone,
      description: copy.cogsDescription,
      tooltip: {
        title: copy.cogsTooltipTitle,
        description: copy.cogsTooltipDescription,
        note: copy.cogsTooltipNote,
      },
    },
    {
      label: copy.profitLabel,
      value: profitPercentage,
      color: "#22c55e",
      tone: "green" as VisualTone,
      description: copy.profitDescription,
      tooltip: {
        title: copy.profitTooltipTitle,
        description: copy.profitTooltipDescription,
        note: copy.profitTooltipNote,
      },
    },
    {
      label: copy.marginLossLabel,
      value: leakPercentage,
      color: "#ef4444",
      tone: "red" as VisualTone,
      description: copy.marginLossDescription,
      tooltip: {
        title: copy.marginLossTooltipTitle,
        description: copy.marginLossTooltipDescription,
        note: copy.marginLossTooltipNote,
      },
    },
  ];

  return (
    <PremiumPanel className="profit-intelligence-v2-breakdown" tone="blue">
      <div className="section-header">
        <div>
          <div className="section-title">{copy.title}</div>

          <div className="section-subtitle">{copy.subtitle}</div>
        </div>
      </div>

      <ResponsiveGrid
        columns={3}
        className="profit-intelligence-v2-breakdown-grid"
      >
        {items.map((item) => (
          <MetricCard
            key={item.label}
            tone={item.tone}
            label={
              <span className="profit-intelligence-v2-metric-label">
                {item.label}
                <MetricTooltip content={item.tooltip} />
              </span>
            }
            value={pct(item.value)}
            detail={item.description}
            visual={
              <div className="profit-intelligence-v2-rail">
                <i
                  style={{
                    width: `${Math.min(Math.max(item.value, 0), 100)}%`,
                  }}
                />
              </div>
            }
          />
        ))}
      </ResponsiveGrid>
    </PremiumPanel>
  );
}
