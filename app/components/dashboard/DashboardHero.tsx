import DashboardNav from "./DashboardNav";
import type { ReactNode } from "react";
import { useI18n } from "~/components/i18n/I18nProvider";
import {
  PremiumHero,
  SegmentedTabs,
  TaxAwareBadge,
  VisualButton,
} from "~/components/ui/VisualSystem";

type Props = {
  period: string;
  setPeriod: (next: "7" | "30" | "90") => void;
  navigate: (path: string) => void;
  visual: ReactNode;
  analysisLoading: boolean;
  analysisText: string;
  analysisStatusMessage: string | null;
  onRunAnalysis: () => void;
};

export default function DashboardHero({
  period,
  setPeriod,
  navigate,
  visual,
  analysisLoading,
  analysisText,
  analysisStatusMessage,
  onRunAnalysis,
}: Props) {
  const { messages } = useI18n();
  const copy = messages.dashboardHero;
  return (
    <>
      <DashboardNav active="overview" navigate={navigate} />

      <PremiumHero
        className="dashboard-v2-hero signal-hero signal-hero--warm"
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        visual={visual}
        mobileVisualPosition="after-copy"
        actions={
          <div className="dashboard-v2-hero-actions">
            <SegmentedTabs
              ariaLabel={copy.eyebrow}
              activeId={period}
              tabs={(["7", "30", "90"] as const).map((item) => ({
                id: item,
                label: `${item}${copy.periodSuffix}`,
                disabled: analysisLoading,
              }))}
              onChange={(item) => setPeriod(item as "7" | "30" | "90")}
            />
            <VisualButton
              leading={analysisLoading ? "⏳" : "✦"}
              disabled={analysisLoading}
              onClick={onRunAnalysis}
            >
              {analysisLoading ? analysisText : copy.runAnalysis}
            </VisualButton>
            <span
              aria-live="polite"
              style={{
                minHeight: 18,
                color: "rgba(255,255,255,0.62)",
                fontSize: 11,
                fontWeight: 750,
              }}
            >
              {analysisStatusMessage}
            </span>
            <TaxAwareBadge>{messages.productsPage.taxAwareBasis}</TaxAwareBadge>
          </div>
        }
      />
    </>
  );
}
