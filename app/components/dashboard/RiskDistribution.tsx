type Props = {
  criticalCount: number;
  warningCount: number;
  missingCount: number;
  healthyCount: number;
  riskTotal: number;
};

export default function RiskDistribution({
  criticalCount,
  warningCount,
  missingCount,
  healthyCount,
  riskTotal,
}: Props) {
  return (
    <div className="panel">
      <div className="section-header">
        <div>
          <div className="section-title">
            Risk Distribution
          </div>

          <div className="section-subtitle">
            Real-time catalog health overview based on margin analysis.
          </div>
        </div>
      </div>

      <div className="risk-distribution">
        {[
          [
            "Critical",
            criticalCount,
            "#ef4444",
          ],

          [
            "Low Margin",
            warningCount,
            "#f59e0b",
          ],

          [
            "Missing Cost",
            missingCount,
            "#3b82f6",
          ],

          [
            "Healthy",
            healthyCount,
            "#22c55e",
          ],
        ].map(([label, value, color]) => {
          const percentage =
            (Number(value) / riskTotal) * 100;

          return (
            <div key={String(label)} className="risk-block">
              <div className="risk-block-top">
                <div
                  className="risk-dot"
                  style={{ background: String(color) }}
                />

                <div className="risk-label">
                  {label}
                </div>

                <div className="risk-value">
                  {String(value)}
                </div>
              </div>

              <div className="risk-bar">
                <div
                  className="risk-fill"
                  style={{
                    width: `${percentage}%`,
                    background: String(color),
                  }}
                />
              </div>

              <div className="risk-percent">
                {percentage.toFixed(0)}% of products
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}