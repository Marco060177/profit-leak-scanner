import DashboardNav from "./DashboardNav";
import { useI18n } from "~/components/i18n/I18nProvider";

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
  const { messages } = useI18n();
  const copy = messages.dashboardHero;
  return (
    <>
      <DashboardNav
        active="overview"
        navigate={navigate}
      />

      <div className="hero-header">
        <div>
          <div className="eyebrow">
            {copy.eyebrow}
          </div>

          <div className="hero-title">
            {copy.title}
          </div>

          <div className="hero-description">
            {copy.description}
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
                  {copy.periodSuffix}
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
              : copy.runAnalysis}
          </span>
        </button>
      </div>
    </>
  );
}
