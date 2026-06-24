import { getStoredLanguage } from "~/utils/i18n";

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
  const language = getStoredLanguage();

  return (
    <div className="panel" id="leaks-section">
      <div className="section-header">
        <div>
          <div className="section-title">
            {language === "it"
              ? "Principali Perdite di Profitto Rilevate"
              : "Top Profit Leaks Detected"}
          </div>

          <div className="section-subtitle">
            {language === "it"
              ? "Problemi prioritari rilevati dai dati reali degli ordini Shopify."
              : "Prioritized issues found from your real Shopify order data."}
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
          {language === "it" ? "Analizza prodotti" : "Analyze products"}
        </button>
      </div>

      {topLeaks.length === 0 ? (
        <div className="clean-state">
          {language === "it"
            ? "✅ Nessuna perdita di profitto rilevante nel periodo selezionato."
            : "✅ No major profit leaks detected in the selected period."}
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
                    {language === "it"
                      ? "Opportunità di ottimizzazione margine rilevata"
                      : "Margin optimization opportunity detected"}
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
                  {language === "it"
                    ? "impatto stimato"
                    : "estimated impact"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}