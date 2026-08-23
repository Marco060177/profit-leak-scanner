import { money, pct } from "~/utils/margin";
import { useI18n } from "~/components/i18n/I18nProvider";
import type { MarginAssessment } from "~/utils/margin-decision-engine";
import MetricTooltip from "~/components/ui/MetricTooltip";

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
    presentations[assessment.economicStatus] ??
    presentations.insufficient_data;

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

  return (
    <div className="score-card">
      <div className="score-glow-one" />
      <div className="score-glow-two" />

      <div className="score-content">
        <div
          className="section-eyebrow"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
          }}
        >
          <span>
            {copy.eyebrow}
          </span>

          <MetricTooltip
            content={{
              title: copy.tooltipTitle,
              description: copy.tooltipDescription,
              note: copy.tooltipNote,
            }}
          />
        </div>

        <div className="score-number">
          {score ?? "—"}
          <span>{score === null ? "" : "/100"}</span>
        </div>

        <div className="score-risk" style={{ color: presentation.color }}>
          {presentation.label}
        </div>

        <div className="score-copy">
          {getAssessmentCopy(assessment, visualLeak, t)}
        </div>

        <div className="score-mini-grid">
          {[
            [
              copy.confirmedLoss,
              money(visualLeak),
              "#ff5a36",
            ],
            [
              copy.productsAtRisk,
              t("scoreCard.productsDetected", { count: visualProductsAtRisk }),
              "#f59e0b",
            ],
            [
              copy.margin,
              pct(visualMarginPct),
              "#22c55e",
            ],
          ].map(([label, value, color]) => (
            <div key={label} className="score-mini-card">
              <div>{label}</div>
              <strong style={{ color: String(color) }}>{value}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="gauge-card">
        <div className="gauge-glow" />

        <div className="gauge">
          <svg width="170" height="170" viewBox="0 0 220 220">
            <circle
              cx="110"
              cy="110"
              r="84"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="14"
              fill="none"
            />

            {score !== null && (
              <circle
                cx="110"
                cy="110"
                r="84"
                stroke={presentation.color}
                strokeWidth="14"
                fill="none"
                strokeLinecap="round"
                strokeDasharray="528"
                strokeDashoffset={528 - (528 * gaugeScore) / 100}
                style={{
                  filter: `drop-shadow(0 0 14px ${presentation.color}73)`,
                }}
              />
            )}
          </svg>

          <div className="gauge-center">
            <div>{score ?? "—"}</div>
            <span>{presentation.label.toUpperCase()}</span>
          </div>
        </div>

        <div className="gauge-copy">
          {score === null
            ? t("scoreCard.hiddenScore", {
                orderCount: assessment.evidence.orderCount,
                activeDays: assessment.evidence.activeDays,
              })
            : copy.scoreBasis}
        </div>
      </div>
    </div>
  );
}
