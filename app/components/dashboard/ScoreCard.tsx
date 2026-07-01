import { money, pct } from "~/utils/margin";
import { getStoredLanguage } from "~/utils/i18n";

type Props = {
  score: number;
  scoreLabel: string;
  visualLeak: number;
  visualProductsAtRisk: number;
  visualMarginPct: number;
};

export default function ScoreCard({
  score,
  scoreLabel,
  visualLeak,
  visualProductsAtRisk,
  visualMarginPct,
}: Props) {
  const language = getStoredLanguage();
  const translatedScoreLabel =
    language === "it"
      ? scoreLabel === "Needs attention"
        ? "Richiede attenzione"
        : scoreLabel === "Healthy"
          ? "Sano"
          : scoreLabel === "Critical"
            ? "Critico"
            : scoreLabel
      : scoreLabel;
  return (
    <div className="score-card">
      <div className="score-glow-one" />
      <div className="score-glow-two" />

      <div className="score-content">
        <div className="section-eyebrow">
          {language === "it"
            ? "PUNTEGGIO SALUTE MARGINE"
            : "PROFIT LEAK SCORE"}
        </div>

        <div className="score-number">
          {score}
          <span>/100</span>
        </div>

        <div className="score-risk">{translatedScoreLabel}</div>

        <div className="score-copy">
          {visualLeak > 0
            ? language === "it"
              ? `Il tuo negozio sta perdendo circa ${money(
                visualLeak,
              )} a causa di prodotti venduti sotto costo.`
              : `Your store is leaking an estimated ${money(
                visualLeak,
              )} from products selling below cost.`
            : language === "it"
              ? "Non risultano prodotti venduti sotto costo nel periodo selezionato."
              : "Your store currently has no products selling below cost in the selected period."}
        </div>

        <div className="score-mini-grid">
          {[
            [
              language === "it"
                ? "Perdita stimata"
                : "Estimated leak",
              money(visualLeak),
              "#ff5a36",
            ],
            [
              language === "it"
                ? "Prodotti a rischio"
                : "Products at risk",
              language === "it"
                ? `${visualProductsAtRisk} rilevati`
                : `${visualProductsAtRisk} detected`,
              "#f59e0b",
            ],
            [
              language === "it"
                ? "Margine"
                : "Margin",
              pct(visualMarginPct),
              "#22c55e",
            ],
          ].map(([label, value, color]) => (
            <div key={label} className="score-mini-card">
              <div>{label}</div>

              <strong style={{ color: String(color) }}>
                {value}
              </strong>
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

            <circle
              cx="110"
              cy="110"
              r="84"
              stroke="#ff5a36"
              strokeWidth="14"
              fill="none"
              strokeLinecap="round"
              strokeDasharray="528"
              strokeDashoffset={528 - (528 * score) / 100}
              style={{
                filter: "drop-shadow(0 0 14px rgba(255,90,54,0.45))",
              }}
            />
          </svg>

          <div className="gauge-center">
            <div>{score}</div>

            <span>{translatedScoreLabel.toUpperCase()}</span>
          </div>
        </div>

        <div className="gauge-copy">
          {language === "it"
            ? "Punteggio di salute del margine basato su perdite di profitto, costi mancanti, margini bassi e redditività del negozio."
            : "Margin health score based on profit leaks, missing costs, low margins and store profitability."}
        </div>
      </div>
    </div>
  );
}