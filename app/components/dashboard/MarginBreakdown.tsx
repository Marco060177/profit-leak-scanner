type Props = {
  cogsPercentage: number;
  profitPercentage: number;
  leakPercentage: number;
};

export default function MarginBreakdown({
  cogsPercentage,
  profitPercentage,
  leakPercentage,
}: Props) {
  return (
    <div className="panel">
      <div className="section-header">
        <div>
          <div className="section-title">
            Margin Breakdown
          </div>

          <div className="section-subtitle">
            Revenue allocation across costs, profit and detected leaks.
          </div>
        </div>
      </div>

      <div className="breakdown-stack">
        {[
          [
            "COGS",
            cogsPercentage,
            "#3b82f6",
          ],

          [
            "Profit",
            profitPercentage,
            "#22c55e",
          ],

          [
            "Leak",
            leakPercentage,
            "#ef4444",
          ],
        ].map(([label, value, color]) => (
          <div
            key={String(label)}
            className="breakdown-row"
          >
            <div className="breakdown-header">
              <div className="breakdown-label">
                {label}
              </div>

              <div className="breakdown-value">
                {Number(value).toFixed(1)}%
              </div>
            </div>

            <div className="breakdown-bar">
              <div
                className="breakdown-fill"
                style={{
                  width: `${Math.min(Number(value), 100)}%`,
                  background: String(color),
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}