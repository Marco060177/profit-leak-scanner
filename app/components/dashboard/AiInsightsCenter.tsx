type Props = {
  visualLeak: number;
  visualMissingCostCount: number;
  recoverableProfit: number;
  money: (n: number) => string;
  scrollToSection: (sectionId: string) => void;
};

export default function AiInsightsCenter({
  visualLeak,
  visualMissingCostCount,
  recoverableProfit,
  money,
  scrollToSection,
}: Props) {
  return (
    <section className="ai-insights-center">
      <div className="ai-insights-header">
        <span>AI PROFIT INTELLIGENCE</span>

        <h2>AI Insights Center</h2>

        <p>
          MarginLab highlights the most important profit risks detected in your
          Shopify data.
        </p>
      </div>

      <div className="ai-insights-grid">
        <article className="ai-insight-card danger">
          <div className="ai-card-top">
            <span>Margin risk</span>
            <strong>High impact</strong>
          </div>

          <h3>Margin Deterioration Detected</h3>

          <p>
            Store margin is under pressure across products with low or negative
            profitability.
          </p>

          <div className="ai-card-metric">{money(visualLeak)}</div>

          <button
            type="button"
            onClick={() => scrollToSection("products-section")}
          >
            View affected products
          </button>
        </article>

        <article className="ai-insight-card warning">
          <div className="ai-card-top">
            <span>Data quality</span>
            <strong>Needs review</strong>
          </div>

          <h3>Missing Product Costs</h3>

          <p>
            {visualMissingCostCount} products are missing cost data, hiding real
            profitability.
          </p>

          <div className="ai-card-metric">
            {visualMissingCostCount} products
          </div>

          <button
            type="button"
            onClick={() => scrollToSection("products-section")}
          >
            Fix missing costs
          </button>
        </article>

        <article className="ai-insight-card recovery">
          <div className="ai-card-top">
            <span>Recovery</span>
            <strong>Opportunity</strong>
          </div>

          <h3>Recoverable Profit Found</h3>

          <p>
            Pricing gaps detected across products may be reducing your monthly
            profit.
          </p>

          <div className="ai-card-metric">
            {money(recoverableProfit)}
          </div>

          <button
            type="button"
            onClick={() => scrollToSection("products-section")}
          >
            Review recommendations
          </button>
        </article>
      </div>
    </section>
  );
}