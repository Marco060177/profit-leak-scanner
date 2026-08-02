import { money, pct } from "~/utils/margin";
import { getStoredLanguage } from "~/utils/i18n";
import type { MarginAssessment } from "~/utils/margin-decision-engine";

type Props = {
  assessment: MarginAssessment;
  visualLeak: number;
  visualProductsAtRisk: number;
  visualMarginPct: number;
};

function getScorePresentation(
  assessment: MarginAssessment,
  language: "it" | "en",
) {
  if (!assessment.healthScoreAvailable || assessment.healthScore === null) {
    return {
      score: null,
      label:
        language === "it"
          ? "Valutazione non disponibile"
          : "Assessment unavailable",
      color: "#7dd3fc",
    };
  }

  const presentations = {
    healthy: {
      label: language === "it" ? "Sano" : "Healthy",
      color: "#22c55e",
    },
    monitor: {
      label: language === "it" ? "Da monitorare" : "Monitor",
      color: "#fbbf24",
    },
    at_risk: {
      label: language === "it" ? "A rischio" : "At risk",
      color: "#fb923c",
    },
    critical: {
      label: language === "it" ? "Critico" : "Critical",
      color: "#ff5a36",
    },
    insufficient_data: {
      label:
        language === "it"
          ? "Valutazione non disponibile"
          : "Assessment unavailable",
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
  language: "it" | "en",
  visualLeak: number,
) {
  if (!assessment.healthScoreAvailable) {
    if (assessment.observedStatus === "losses_observed") {
      return language === "it"
        ? `Sono state rilevate perdite reali per ${money(visualLeak)} nel periodo. Il campione è però troppo limitato per giudicare la salute complessiva dello store.`
        : `Real losses of ${money(visualLeak)} were detected in the period. However, the sample is too limited to assess the store's overall health.`;
    }

    if (assessment.observedStatus === "incomplete_costs_observed") {
      return language === "it"
        ? "Sono presenti costi prodotto mancanti. I dati disponibili non consentono ancora una valutazione generale affidabile dello store."
        : "Some product costs are missing. The available data does not yet support a reliable store-wide assessment.";
    }

    if (assessment.observedStatus === "margin_pressure_observed") {
      return language === "it"
        ? "Nel periodo è stata osservata pressione sul margine, ma lo storico è troppo limitato per stabilire se il problema sia strutturale."
        : "Margin pressure was observed in the period, but the history is too limited to determine whether it is structural.";
    }

    return language === "it"
      ? "I dati del periodo non sono sufficienti per calcolare un punteggio affidabile di salute del margine."
      : "The period does not contain enough evidence to calculate a reliable margin health score.";
  }

  return visualLeak > 0
    ? language === "it"
      ? `Il negozio ha registrato circa ${money(visualLeak)} di perdite da prodotti venduti sotto costo nel periodo selezionato.`
      : `The store recorded approximately ${money(visualLeak)} in losses from products selling below cost in the selected period.`
    : language === "it"
      ? "Non risultano prodotti venduti sotto costo nel periodo selezionato."
      : "No products sold below cost were detected in the selected period.";
}

export default function ScoreCard({
  assessment,
  visualLeak,
  visualProductsAtRisk,
  visualMarginPct,
}: Props) {
  const language = getStoredLanguage() === "it" ? "it" : "en";
  const presentation = getScorePresentation(assessment, language);
  const score = presentation.score;
  const gaugeScore = score ?? 0;

  return (
    <div className="score-card">
      <div className="score-glow-one" />
      <div className="score-glow-two" />

      <div className="score-content">
        <div className="section-eyebrow">
          {language === "it" ? "SALUTE DEL MARGINE" : "MARGIN HEALTH"}
        </div>

        <div className="score-number">
          {score ?? "—"}
          <span>{score === null ? "" : "/100"}</span>
        </div>

        <div className="score-risk" style={{ color: presentation.color }}>
          {presentation.label}
        </div>

        <div className="score-copy">
          {getAssessmentCopy(assessment, language, visualLeak)}
        </div>

        <div className="score-mini-grid">
          {[
            [
              language === "it" ? "Perdita accertata" : "Confirmed loss",
              money(visualLeak),
              "#ff5a36",
            ],
            [
              language === "it" ? "Prodotti a rischio" : "Products at risk",
              language === "it"
                ? `${visualProductsAtRisk} rilevati`
                : `${visualProductsAtRisk} detected`,
              "#f59e0b",
            ],
            [
              language === "it" ? "Margine" : "Margin",
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
            ? language === "it"
              ? `${assessment.evidence.orderCount} ordini su ${assessment.evidence.activeDays} giorni attivi: il punteggio resterà nascosto finché l'evidenza non sarà sufficiente.`
              : `${assessment.evidence.orderCount} orders across ${assessment.evidence.activeDays} active days: the score remains hidden until evidence is sufficient.`
            : language === "it"
              ? "Punteggio basato su perdite, copertura dei costi, margini e affidabilità dei dati disponibili."
              : "Score based on losses, cost coverage, margins and the reliability of available data."}
        </div>
      </div>
    </div>
  );
}