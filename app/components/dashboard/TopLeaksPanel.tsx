import { useI18n } from "~/components/i18n/I18nProvider";

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

export default function TopLeaksPanel({
  topLeaks,
  severityColor,
  severityBackground,
  severityBorder,
}: Props) {
  const { messages } = useI18n();
  const copy = messages.topLeaksPanel;

  return (
    <div className="panel" id="leaks-section">
      <div className="section-header">
        <div>
          <div className="section-title">
            {copy.title}
          </div>

          <div className="section-subtitle">
            {copy.subtitle}
          </div>
        </div>

        <button
          className="secondary-orange-button"
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
        </button>
      </div>

      {topLeaks.length === 0 ? (
        <div className="clean-state">
          {copy.noMajorLeaks}
        </div>
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
                <div
                  className="severity-pill"
                  style={{
                    color: severityColor(severity),
                    background: severityBackground(severity),
                    border: severityBorder(severity),
                  }}
                >
                  {severity}
                </div>
              </div>

              <div className="leak-loss">
                <div>{loss}</div>

                <span>
                  {copy.estimatedImpact}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
