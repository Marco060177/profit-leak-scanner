import { uiMoney as money, pct } from "~/utils/margin";
import { useI18n } from "~/components/i18n/I18nProvider";
import type { MarginAssessment } from "~/utils/margin-decision-engine";
import MetricTooltip from "~/components/ui/MetricTooltip";
import {
  MetricCard,
  PremiumPanel,
  SignalRing,
  SplitLayout,
  StatusChip,
  type VisualTone,
} from "~/components/ui/VisualSystem";

type Props = {
  assessment: MarginAssessment;
  visualLeak: number;
  visualProductsAtRisk: number;
  visualMarginPct: number;
};

function getScorePresentation(
  assessment: MarginAssessment,
  t: (key: string) => string,
) {
  if (!assessment.healthScoreAvailable || assessment.healthScore === null) {
    return {
      score: null,
      label: t("scoreCard.assessmentUnavailable"),
      color: "#7dd3fc",
    };
  }

  const presentations = {
    healthy: {
      label: t("scoreCard.healthy"),
      color: "#22c55e",
    },
    monitor: {
      label: t("scoreCard.monitor"),
      color: "#fbbf24",
    },
    at_risk: {
      label: t("scoreCard.atRisk"),
      color: "#fb923c",
    },
    critical: {
      label: t("scoreCard.critical"),
      color: "#ff5a36",
    },
    insufficient_data: {
      label: t("scoreCard.assessmentUnavailable"),
      color: "#7dd3fc",
    },
  } as const;

  const statusPresentation =
    presentations[assessment.economicStatus] ?? presentations.insufficient_data;

  return {
    score: assessment.healthScore,
    ...statusPresentation,
  };
}

function getAssessmentCopy(
  assessment: MarginAssessment,
  visualLeak: number,
  t: (key: string, variables?: Record<string, string | number>) => string,
) {
  if (!assessment.healthScoreAvailable) {
    if (assessment.observedStatus === "losses_observed") {
      return t("scoreCard.lossesObserved", { amount: money(visualLeak) });
    }

    if (assessment.observedStatus === "incomplete_costs_observed") {
      return t("scoreCard.incompleteCostsObserved");
    }

    if (assessment.observedStatus === "margin_pressure_observed") {
      return t("scoreCard.marginPressureObserved");
    }

    return t("scoreCard.insufficientEvidence");
  }

  return visualLeak > 0
    ? t("scoreCard.lossesDetected", { amount: money(visualLeak) })
    : t("scoreCard.noProductsBelowCost");
}

export default function ScoreCard({
  assessment,
  visualLeak,
  visualProductsAtRisk,
  visualMarginPct,
}: Props) {
  const { messages, t } = useI18n();
  const copy = messages.scoreCard;
  const presentation = getScorePresentation(assessment, t);
  const score = presentation.score;
  const gaugeScore = score ?? 0;
  const tone: VisualTone =
    assessment.economicStatus === "healthy"
      ? "green"
      : assessment.economicStatus === "monitor"
        ? "amber"
        : assessment.economicStatus === "insufficient_data"
          ? "cyan"
          : "red";

  return (
    <PremiumPanel className="dashboard-v2-health" tone={tone}>
      <SplitLayout ratio="content" className="dashboard-v2-health-layout">
        <div className="score-content">
          <div
            className="section-eyebrow"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <span>{copy.eyebrow}</span>

            <MetricTooltip
              content={{
                title: copy.tooltipTitle,
                description: copy.tooltipDescription,
                note: copy.tooltipNote,
              }}
            />
          </div>

          <StatusChip tone={tone}>{presentation.label}</StatusChip>

          <div className="score-copy">
            {getAssessmentCopy(assessment, visualLeak, t)}
          </div>

          <div className="score-mini-grid dashboard-v2-health-metrics">
            <MetricCard
              density="dense"
              tone="red"
              label={copy.confirmedLoss}
              value={money(visualLeak)}
            />
            <MetricCard
              density="dense"
              tone="amber"
              label={copy.productsAtRisk}
              value={t("scoreCard.productsDetected", {
                count: visualProductsAtRisk,
              })}
            />
            <MetricCard
              density="dense"
              tone="green"
              label={copy.margin}
              value={pct(visualMarginPct)}
            />
          </div>
        </div>
        <div className="dashboard-v2-health-signal">
          <SignalRing
            value={gaugeScore}
            variant="embedded"
            size="large"
            motion="ambient"
            tone={tone}
            score={score ?? "—"}
            suffix={score === null ? undefined : "/100"}
            label={copy.eyebrow}
            status={presentation.label}
            info={
              <MetricTooltip
                content={{
                  title: copy.tooltipTitle,
                  description: copy.tooltipDescription,
                  note: copy.tooltipNote,
                }}
              />
            }
            detail={
              score === null
                ? t("scoreCard.hiddenScore", {
                    orderCount: assessment.evidence.orderCount,
                    activeDays: assessment.evidence.activeDays,
                  })
                : copy.scoreBasis
            }
            nodes={[
              { id: "loss", angle: 35, tone: "red" },
              { id: "risk", angle: 150, tone: "amber" },
              { id: "margin", angle: 265, tone: "green" },
            ]}
            ariaLabel={`${copy.eyebrow}: ${score ?? presentation.label}`}
          />
        </div>
      </SplitLayout>
    </PremiumPanel>
  );
}
