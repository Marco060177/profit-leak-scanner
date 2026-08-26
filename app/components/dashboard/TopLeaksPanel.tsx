import { useI18n } from "~/components/i18n/I18nProvider";
import {
  PremiumEmptyState,
  PremiumPanel,
  StatusChip,
  VisualButton,
  type VisualTone,
} from "~/components/ui/VisualSystem";

type Leak = {
  icon: string;
  issue: string;
  severity: string;
  loss: string;
};

type Props = {
  topLeaks: Leak[];
  severityColor: (severity: string) => string;
  severityBackground: (severity: string) => string;
  severityBorder: (severity: string) => string;
};

export default function TopLeaksPanel({ topLeaks }: Props) {
  const { messages } = useI18n();
  const copy = messages.topLeaksPanel;

  return (
    <PremiumPanel className="dashboard-v2-leaks" id="leaks-section" tone="red">
      <div className="section-header">
        <div>
          <div className="section-title">{copy.title}</div>

          <div className="section-subtitle">{copy.subtitle}</div>
        </div>

        <VisualButton
          variant="secondary"
          onClick={() => {
            const section = document.getElementById("products-section");

            if (section) {
              section.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }
          }}
        >
          {copy.analyzeProducts}
        </VisualButton>
      </div>

      {topLeaks.length === 0 ? (
        <PremiumEmptyState title={copy.noMajorLeaks} tone="green" />
      ) : (
        <div className="leaks-list">
          {topLeaks.map(({ icon, issue, severity, loss }) => (
            <div key={issue} className="leak-row">
              <div className="leak-main">
                <div className="leak-icon">{icon}</div>

                <div>
                  <div className="leak-title">{issue}</div>

                  <div className="leak-subtitle">
                    {copy.optimizationOpportunity}
                  </div>
                </div>
              </div>

              <div className="leak-severity">
                <StatusChip
                  tone={
                    (severity === "High"
                      ? "red"
                      : severity === "Medium"
                        ? "amber"
                        : "neutral") as VisualTone
                  }
                >
                  {severity}
                </StatusChip>
              </div>

              <div className="leak-loss">
                <div>{loss}</div>

                <span>{copy.estimatedImpact}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </PremiumPanel>
  );
}
