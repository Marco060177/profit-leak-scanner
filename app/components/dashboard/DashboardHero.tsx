import DashboardNav from "./DashboardNav";
import { getStoredLanguage } from "~/utils/i18n";

type Props = {
  period: string;
  setPeriod: (next: "7" | "30" | "90") => void;
  navigate: (path: string) => void;
  scrollToSection: (id: string) => void;

  analysisLoading: boolean;
  analysisText: string;
  analysisSteps: string[];

  setAnalysisLoading: (value: boolean) => void;
  setAnalysisText: (value: string) => void;
};

export default function DashboardHero({
  period,
  setPeriod,
  navigate,
  scrollToSection,
  analysisLoading,
  analysisText,
  analysisSteps,
  setAnalysisLoading,
  setAnalysisText,
}: Props) {
  const language = getStoredLanguage();
  return (
    <>
      <DashboardNav
        active="overview"
        navigate={navigate}
      />

      <div className="hero-header">
        <div>
          <div className="eyebrow">
            {language === "it"
              ? "Analizzatore Perdite di Margine"
              : "Profit Leak Scanner"}
          </div>

          <div className="hero-title">
            {language === "it"
              ? "Dashboard Perdite di Profitto"
              : "Profit Leak Dashboard"}
          </div>

          <div className="hero-description">
            {language === "it"
              ? "Monitora margini nascosti, prodotti sottoprezzati e problemi di prezzo che influenzano la redditività del tuo negozio Shopify."
              : "Track hidden margin leaks, underpriced products and pricing issues affecting your Shopify store profitability."}
          </div>

          <div className="period-tabs">
            {(["7", "30", "90"] as const).map(
              (item) => (
                <button
                  key={item}
                  className={
                    period === item
                      ? "period-tab active"
                      : "period-tab"
                  }
                  onClick={() =>
                    setPeriod(item)
                  }
                >
                  {item}
                  {language === "it" ? "g" : "d"}
                </button>
              ),
            )}
          </div>
        </div>

        <button
          className="primary-button"
          disabled={analysisLoading}
          onClick={() => {
            if (analysisLoading) return;

            setAnalysisLoading(true);

            let step = 0;

            const interval = setInterval(() => {
              step++;

              if (
                step <
                analysisSteps.length
              ) {
                setAnalysisText(
                  analysisSteps[step],
                );
              }
            }, 700);

            setTimeout(() => {
              clearInterval(interval);

              setAnalysisLoading(false);

              setAnalysisText(
                analysisSteps[0],
              );
            }, 2800);
          }}
        >
          <span>
            {analysisLoading
              ? "⏳"
              : "✦"}
          </span>

          <span>
            {analysisLoading
              ? analysisText
              : language === "it"
                ? "Avvia analisi"
                : "Run analysis"}
          </span>
        </button>
      </div>
    </>
  );
}