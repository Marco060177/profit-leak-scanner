type Leak = {
  icon: string;
  issue: string;
  severity: string;
  loss: string;
};

type Props = {
  topLeaks: Leak[];
  severityColor: (severity: string) => string;
  severityBackground: (severity: string) => string;
  severityBorder: (severity: string) => string;
};

export default function TopLeaksPanel({
  topLeaks,
  severityColor,
  severityBackground,
  severityBorder,
}: Props) {
  return (
    <div className="panel" id="leaks-section">
      <div className="section-header">
        <div>
          <div className="section-title">
            Top Profit Leaks Detected
          </div>

          <div className="section-subtitle">
            Prioritized issues found from your real Shopify order data.
          </div>
        </div>

        <button className="secondary-orange-button">
          View all
        </button>
      </div>

      {topLeaks.length === 0 ? (
        <div className="clean-state">
          ✅ No major profit leaks detected in the selected period.
        </div>
      ) : (
        <div className="leaks-list">
          {topLeaks.map(
            ({
              icon,
              issue,
              severity,
              loss,
            }) => (
              <div
                key={issue}
                className="leak-row"
              >
                <div className="leak-main">
                  <div className="leak-icon">
                    {icon}
                  </div>

                  <div>
                    <div className="leak-title">
                      {issue}
                    </div>

                    <div className="leak-subtitle">
                      Margin optimization opportunity detected
                    </div>
                  </div>
                </div>

                <div className="leak-severity">
                  <div
                    className="severity-pill"
                    style={{
                      color: severityColor(severity),
                      background:
                        severityBackground(severity),
                      border:
                        severityBorder(severity),
                    }}
                  >
                    {severity}
                  </div>
                </div>

                <div className="leak-loss">
                  <div>{loss}</div>

                  <span>
                    estimated impact
                  </span>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}