import DashboardNav from "./DashboardNav";
import { useI18n } from "~/components/i18n/I18nProvider";
import {
  PremiumHero,
  SegmentedTabs,
  VisualButton,
} from "~/components/ui/VisualSystem";

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
      <DashboardNav active="overview" navigate={navigate} />

      <PremiumHero
        className="dashboard-v2-hero"
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        actions={
          <div className="dashboard-v2-hero-actions">
            <SegmentedTabs
              ariaLabel={copy.eyebrow}
              activeId={period}
              tabs={(["7", "30", "90"] as const).map((item) => ({
                id: item,
                label: `${item}${copy.periodSuffix}`,
              }))}
              onChange={(item) => setPeriod(item as "7" | "30" | "90")}
            />
            <VisualButton
              leading={analysisLoading ? "⏳" : "✦"}
              disabled={analysisLoading}
              onClick={() => {
                if (analysisLoading) return;

                setAnalysisLoading(true);

                let step = 0;

                const interval = setInterval(() => {
                  step++;

                  if (step < analysisSteps.length) {
                    setAnalysisText(analysisSteps[step]);
                  }
                }, 700);

                setTimeout(() => {
                  clearInterval(interval);

                  setAnalysisLoading(false);

                  setAnalysisText(analysisSteps[0]);
                }, 2800);
              }}
            >
              {analysisLoading ? analysisText : copy.runAnalysis}
            </VisualButton>
          </div>
        }
      />
    </>
  );
}
