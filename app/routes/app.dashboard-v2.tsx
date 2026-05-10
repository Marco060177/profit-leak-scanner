export default function DashboardV2() {
  const dashboardLoading = false;

  const dashboardData = {
    summary: {
      score: 32,
      monthlyLoss: "$2,140",
      trend: "+18%",
    },

    kpis: [
      ["Revenue scanned", "$48,920", "+12%", "positive"],
      ["Products analyzed", "186", "24 at risk", "warning"],
      ["Low margin products", "17", "Needs review", "warning"],
      ["Missing costs", "9", "Fix required", "danger"],
    ],

    leaks: [
      {
        icon: "⚠️",
        issue: "Products below target margin",
        severity: "High",
        loss: "-$780/mo",
      },
      {
        icon: "🏷️",
        issue: "Discounts eating your margins",
        severity: "Medium",
        loss: "-$430/mo",
      },
      {
        icon: "📦",
        issue: "Costs not updated recently",
        severity: "Medium",
        loss: "-$320/mo",
      },
      {
        icon: "🔥",
        issue: "Low-margin best sellers",
        severity: "Low",
        loss: "-$180/mo",
      },
    ],

    recommendations: [
      {
        title: "Increase Arctic Hoodie price by 8%",
        impact: "+$420/mo potential recovery",
        confidence: "High confidence",
      },
      {
        title: "Review discount strategy on Thermal Gloves",
        impact: "+$180/mo margin improvement",
        confidence: "Medium confidence",
      },
      {
        title: "Update outdated product costs",
        impact: "9 products affected",
        confidence: "Critical issue",
      },
    ],

    products: [
      {
        icon: "🧥",
        name: "Arctic Hoodie",
        revenue: "$8,420",
        cogs: "$5,980",
        profit: "$420",
        margin: "5.0%",
        risk: "High",
      },
      {
        icon: "🧤",
        name: "Thermal Gloves",
        revenue: "$3,120",
        cogs: "$2,740",
        profit: "-$180",
        margin: "-5.8%",
        risk: "Critical",
      },
      {
        icon: "🎒",
        name: "Winter Backpack",
        revenue: "$6,890",
        cogs: "$4,110",
        profit: "$960",
        margin: "13.9%",
        risk: "Medium",
      },
      {
        icon: "🥾",
        name: "Snow Boots",
        revenue: "$12,300",
        cogs: "$8,940",
        profit: "$1,120",
        margin: "9.1%",
        risk: "High",
      },
    ],
  };

  const riskColor = (risk: string) => {
    if (risk === "Critical") return "#ef4444";
    if (risk === "High") return "#ff6b4a";
    return "#f59e0b";
  };

  const riskBackground = (risk: string) => {
    if (risk === "Critical") return "rgba(239,68,68,0.16)";
    if (risk === "High") return "rgba(255,90,54,0.14)";
    return "rgba(245,158,11,0.14)";
  };

  const severityColor = (severity: string) => {
    if (severity === "High") return "#ff6b4a";
    if (severity === "Medium") return "#f59e0b";
    return "#9ca3af";
  };

  const severityBackground = (severity: string) => {
    if (severity === "High") return "rgba(255,90,54,0.14)";
    if (severity === "Medium") return "rgba(245,158,11,0.14)";
    return "rgba(156,163,175,0.12)";
  };

  const severityBorder = (severity: string) => {
    if (severity === "High") return "1px solid rgba(255,90,54,0.25)";
    if (severity === "Medium") return "1px solid rgba(245,158,11,0.22)";
    return "1px solid rgba(156,163,175,0.18)";
  };

  if (dashboardLoading) {
    return (
      <div className="dashboard-shell loading-shell">
        <style>{dashboardStyles}</style>

        <div className="dashboard-container">
          <div className="loading-stack">
            <div className="loading-navbar" />
            <div className="loading-hero" />

            <div className="loading-kpi-grid">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="loading-kpi-card" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      <style>{dashboardStyles}</style>

      <div className="dashboard-container">
        <div className="navbar">
          <div className="logo">
            MARGIN<span>LAB</span>
          </div>

          <div className="nav-tabs">
            {["Overview", "Leaks", "Products", "Recommendations", "Billing"].map((item) => (
              <div
                key={item}
                className={item === "Overview" ? "nav-tab active" : "nav-tab"}
              >
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="hero-header">
          <div>
            <div className="alert-pill">
              <div className="alert-dot" />
              <div>3 critical pricing issues detected</div>
            </div>

            <div className="eyebrow">Profit Leak Scanner</div>

            <div className="hero-title">Profit Leak Dashboard</div>

            <div className="hero-description">
              Track hidden margin leaks, underpriced products and pricing issues affecting your
              Shopify store profitability.
            </div>
          </div>

          <button className="primary-button">
            <span>✦</span>
            <span>Run analysis</span>
          </button>
        </div>

        <div className="score-card">
          <div className="score-glow-one" />
          <div className="score-glow-two" />

          <div className="score-content">
            <div className="section-eyebrow">PROFIT LEAK SCORE</div>

            <div className="score-number">
              {dashboardData.summary.score}
              <span>/100</span>
            </div>

            <div className="score-risk">High risk</div>

            <div className="score-copy">
              Your store may be losing profit every day due to underpriced products, missing costs,
              and margin leaks.
            </div>

            <div className="score-mini-grid">
              {[
                ["Estimated loss", `${dashboardData.summary.monthlyLoss}/mo`, "#ff5a36"],
                ["Products at risk", "24 detected", "#f59e0b"],
                ["Margin trend", "+12.4%", "#22c55e"],
              ].map(([label, value, color]) => (
                <div key={label} className="score-mini-card">
                  <div>{label}</div>
                  <strong style={{ color }}>{value}</strong>
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
                  strokeDashoffset="220"
                  style={{
                    filter: "drop-shadow(0 0 14px rgba(255,90,54,0.45))",
                  }}
                />
              </svg>

              <div className="gauge-center">
                <div>{dashboardData.summary.score}</div>
                <span>HIGH RISK</span>
              </div>
            </div>

            <div className="gauge-copy">
              Your current margin health score based on pricing leaks and low-profit products.
            </div>
          </div>
        </div>

        <div className="kpi-grid">
          {dashboardData.kpis.map(([label, value, note, tone]) => (
            <div key={label} className="kpi-card">
              <div className="kpi-label">{label}</div>
              <div className="kpi-value">{value}</div>

              <div
                className="kpi-note"
                style={{
                  color:
                    tone === "positive"
                      ? "#22c55e"
                      : tone === "danger"
                        ? "#ff6b4a"
                        : "#f59e0b",
                }}
              >
                {note}
              </div>
            </div>
          ))}
        </div>

        <div className="panel">
          <div className="section-header">
            <div>
              <div className="section-title">Profit Trend</div>
              <div className="section-subtitle">Revenue and profit performance over time.</div>
            </div>

            <div className="positive-trend">↑ 12.4% this month</div>
          </div>

          <div className="chart-card">
            <div className="chart-labels">
              <span>Apr 1</span>
              <span>Apr 15</span>
              <span>Apr 30</span>
            </div>

            <svg viewBox="0 0 1000 260" preserveAspectRatio="none" className="chart-svg">
              <defs>
                <linearGradient id="lineGradient" x1="0" x2="1">
                  <stop offset="0%" stopColor="#ff7b59" />
                  <stop offset="100%" stopColor="#ff5a36" />
                </linearGradient>

                <linearGradient id="fillGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgba(255,123,89,0.35)" />
                  <stop offset="100%" stopColor="rgba(255,123,89,0)" />
                </linearGradient>
              </defs>

              <path
                d="
                  M 0 210
                  C 80 200, 120 180, 180 170
                  S 300 120, 380 140
                  S 500 80, 620 95
                  S 760 50, 1000 40
                  L 1000 260
                  L 0 260
                  Z
                "
                fill="url(#fillGradient)"
              />

              <path
                d="
                  M 0 210
                  C 80 200, 120 180, 180 170
                  S 300 120, 380 140
                  S 500 80, 620 95
                  S 760 50, 1000 40
                "
                fill="none"
                stroke="url(#lineGradient)"
                strokeWidth="6"
                strokeLinecap="round"
              />
            </svg>

            <div className="chart-overlay" />
          </div>
        </div>

        <div className="panel">
          <div className="section-header">
            <div>
              <div className="section-title">Top Profit Leaks Detected</div>
              <div className="section-subtitle">
                Prioritized issues that may be hurting your margins.
              </div>
            </div>

            <button className="secondary-orange-button">View all</button>
          </div>

          <div className="leaks-list">
            {dashboardData.leaks.map(({ icon, issue, severity, loss }) => (
              <div key={issue} className="leak-row">
                <div className="leak-main">
                  <div className="leak-icon">{icon}</div>

                  <div>
                    <div className="leak-title">{issue}</div>
                    <div className="leak-subtitle">Margin optimization opportunity detected</div>
                  </div>
                </div>

                <div className="leak-severity">
                  <div
                    className="severity-pill"
                    style={{
                      color: severityColor(severity),
                      background: severityBackground(severity),
                      border: severityBorder(severity),
                    }}
                  >
                    {severity}
                  </div>
                </div>

                <div className="leak-loss">
                  <div
                    style={{
                      color:
                        severity === "High"
                          ? "#ff6b4a"
                          : severity === "Medium"
                            ? "#f3f4f6"
                            : "#d1d5db",
                    }}
                  >
                    {loss}
                  </div>
                  <span>estimated impact</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="section-header">
            <div>
              <div className="section-title">Product Risk Table</div>
              <div className="section-subtitle">
                Products ranked by margin risk and potential profit leaks.
              </div>
            </div>

            <button className="secondary-button">Export CSV</button>
          </div>

          {dashboardData.products.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📦</div>

              <div className="empty-title">No products analyzed yet</div>

              <div className="empty-copy">
                Run your first store analysis to identify hidden margin leaks, pricing issues and
                optimization opportunities.
              </div>

              <button className="empty-button">Run first analysis</button>
            </div>
          ) : (
            <>
              <div className="desktop-table-wrapper">
                <table className="product-table">
                  <thead>
                    <tr>
                      {["Product", "Revenue", "COGS", "Profit", "Margin", "Risk"].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {dashboardData.products.map(
                      ({ icon, name, revenue, cogs, profit, margin, risk }) => (
                        <tr key={name}>
                          <td>
                            <div className="product-name-cell">
                              <div className="product-icon">{icon}</div>

                              <div>
                                <div className="product-name">{name}</div>
                                <div className="product-subtitle">Shopify product</div>
                              </div>
                            </div>
                          </td>

                          {[revenue, cogs, profit, margin].map((value) => (
                            <td key={`${name}-${value}`}>{value}</td>
                          ))}

                          <td>
                            <span
                              className="risk-pill"
                              style={{
                                color: riskColor(risk),
                                background: riskBackground(risk),
                              }}
                            >
                              {risk}
                            </span>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mobile-products">
                {dashboardData.products.map(
                  ({ icon, name, revenue, cogs, profit, margin, risk }) => (
                    <div key={name} className="mobile-product-card">
                      <div className="mobile-product-header">
                        <div className="product-name-cell">
                          <div className="product-icon">{icon}</div>

                          <div>
                            <div className="product-name">{name}</div>
                            <div className="product-subtitle">Shopify product</div>
                          </div>
                        </div>

                        <span
                          className="risk-pill"
                          style={{
                            color: riskColor(risk),
                            background: riskBackground(risk),
                          }}
                        >
                          {risk}
                        </span>
                      </div>

                      <div className="mobile-product-grid">
                        <div>
                          <span>Revenue</span>
                          <strong>{revenue}</strong>
                        </div>

                        <div>
                          <span>COGS</span>
                          <strong>{cogs}</strong>
                        </div>

                        <div>
                          <span>Profit</span>
                          <strong>{profit}</strong>
                        </div>

                        <div>
                          <span>Margin</span>
                          <strong>{margin}</strong>
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            </>
          )}
        </div>

        <div className="ai-panel">
          <div className="ai-glow" />

          <div className="section-header ai-header">
            <div>
              <div className="ai-eyebrow">AI Recommendations</div>

              <div className="ai-title">Smart margin optimization suggestions</div>
            </div>

            <div className="ai-badge">AI ACTIVE</div>
          </div>

          <div className="ai-grid">
            {dashboardData.recommendations.map(({ title, impact, confidence }) => (
              <div key={title} className="ai-card">
                <div className="ai-card-title">{title}</div>

                <div className="ai-impact">{impact}</div>

                <div className="ai-footer">
                  <div>
                    <div className="confidence-label">Confidence</div>
                    <div className="confidence-value">{confidence}</div>
                  </div>

                  <button className="apply-button">Apply suggestion</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const dashboardStyles = `
  @keyframes gradientMove {
    0% {
      background-position: 0% 50%;
    }

    50% {
      background-position: 100% 50%;
    }

    100% {
      background-position: 0% 50%;
    }
  }

  @keyframes pulse {
    0% {
      opacity: 0.45;
    }

    50% {
      opacity: 1;
    }

    100% {
      opacity: 0.45;
    }
  }

  * {
    box-sizing: border-box;
  }

  .dashboard-shell {
    min-height: 100vh;
    background:
      radial-gradient(circle at top left, rgba(255,80,40,0.16), transparent 30%),
      radial-gradient(circle at bottom right, rgba(255,90,54,0.10), transparent 24%),
      linear-gradient(180deg, #071019 0%, #0b111b 100%);
    background-size: 120% 120%;
    animation: gradientMove 18s ease infinite;
    padding: 32px;
    color: #f3f4f6;
    font-family: Inter, system-ui, sans-serif;
    position: relative;
    overflow-x: hidden;
  }

  .loading-shell {
    background: linear-gradient(180deg, #071019 0%, #0b111b 100%);
    animation: none;
  }

  .dashboard-container {
    max-width: 1400px;
    margin: 0 auto;
    position: relative;
    z-index: 2;
  }

  .loading-stack {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .loading-navbar,
  .loading-hero,
  .loading-kpi-card {
    border-radius: 24px;
    background: rgba(255,255,255,0.05);
    animation: pulse 1.8s infinite;
  }

  .loading-navbar {
    height: 80px;
  }

  .loading-hero {
    height: 340px;
    border-radius: 32px;
  }

  .loading-kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 18px;
  }

  .loading-kpi-card {
    height: 140px;
  }

  .navbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    margin-bottom: 28px;
    padding: 14px 16px;
    border-radius: 18px;
    background: rgba(255,255,255,0.045);
    border: 1px solid rgba(255,255,255,0.08);
  }

  .logo {
    font-weight: 900;
    letter-spacing: 0.5px;
    white-space: nowrap;
  }

  .logo span {
    color: #ff5a36;
  }

  .nav-tabs {
    display: flex;
    gap: 10px;
    align-items: center;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .nav-tabs::-webkit-scrollbar {
    display: none;
  }

  .nav-tab {
    padding: 10px 14px;
    border-radius: 12px;
    font-weight: 800;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
    background: transparent;
    border: 1px solid transparent;
    color: rgba(255,255,255,0.72);
    white-space: nowrap;
  }

  .nav-tab:hover {
    background: rgba(255,255,255,0.05);
  }

  .nav-tab.active {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.08);
    color: #ffffff;
  }

  .hero-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    margin-bottom: 28px;
  }

  .alert-pill {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    border-radius: 999px;
    background: rgba(255,90,54,0.12);
    border: 1px solid rgba(255,90,54,0.16);
    margin-bottom: 18px;
    font-size: 13px;
    font-weight: 800;
    color: #ff7b59;
    letter-spacing: 0.3px;
  }

  .alert-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ff5a36;
    box-shadow: 0 0 10px rgba(255,90,54,0.8);
  }

  .eyebrow {
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 1px;
    opacity: 0.7;
    text-transform: uppercase;
  }

  .hero-title {
    font-size: 46px;
    font-weight: 900;
    margin-top: 8px;
    line-height: 1.05;
  }

  .hero-description {
    margin-top: 12px;
    opacity: 0.78;
    font-size: 18px;
    max-width: 760px;
    line-height: 1.6;
  }

  .primary-button {
    background: linear-gradient(135deg,#ff5a36 0%,#ff7b59 100%);
    border: 1px solid rgba(255,255,255,0.08);
    color: white;
    font-weight: 900;
    padding: 15px 22px;
    border-radius: 16px;
    cursor: pointer;
    font-size: 15px;
    display: flex;
    align-items: center;
    gap: 10px;
    box-shadow: 0 14px 34px rgba(255,90,54,0.28);
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .primary-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 20px 44px rgba(255,90,54,0.34);
  }

  .score-card {
    background: linear-gradient(135deg, rgba(255,90,54,0.16), rgba(15,23,42,0.92));
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 28px;
    padding: 32px;
    box-shadow: 0 24px 80px rgba(0,0,0,0.35);
    position: relative;
    overflow: hidden;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 28px;
    margin-bottom: 24px;
  }

  .score-glow-one {
    position: absolute;
    top: -180px;
    right: -120px;
    width: 420px;
    height: 420px;
    border-radius: 50%;
    background: rgba(255,255,255,0.05);
    filter: blur(70px);
    pointer-events: none;
  }

  .score-glow-two {
    position: absolute;
    bottom: -120px;
    left: -120px;
    width: 320px;
    height: 320px;
    border-radius: 50%;
    background: rgba(255,90,54,0.08);
    filter: blur(60px);
    pointer-events: none;
  }

  .score-content {
    position: relative;
    z-index: 2;
  }

  .section-eyebrow {
    opacity: 0.7;
    font-size: 14px;
    font-weight: 700;
  }

  .score-number {
    font-size: 72px;
    font-weight: 900;
    margin-top: 16px;
  }

  .score-number span {
    font-size: 28px;
    opacity: 0.55;
  }

  .score-risk {
    color: #ff6b4a;
    font-weight: 800;
    font-size: 20px;
    margin-top: 4px;
  }

  .score-copy {
    margin-top: 14px;
    font-size: 17px;
    opacity: 0.78;
    max-width: 560px;
    line-height: 1.6;
  }

  .score-mini-grid {
    display: flex;
    gap: 28px;
    margin-top: 26px;
    flex-wrap: wrap;
    padding-top: 18px;
    border-top: 1px solid rgba(255,255,255,0.08);
  }

  .score-mini-card {
    min-width: 160px;
  }

  .score-mini-card div {
    font-size: 12px;
    opacity: 0.5;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    font-weight: 700;
  }

  .score-mini-card strong {
    display: block;
    margin-top: 8px;
    font-size: 28px;
    font-weight: 900;
    line-height: 1;
  }

  .gauge-card {
    background: rgba(0,0,0,0.22);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 22px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
    z-index: 2;
  }

  .gauge-glow {
    position: absolute;
    width: 240px;
    height: 240px;
    border-radius: 50%;
    background: rgba(255,90,54,0.1);
    filter: blur(50px);
  }

  .gauge {
    position: relative;
    width: 170px;
    height: 170px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .gauge svg {
    position: absolute;
    transform: rotate(-90deg);
  }

  .gauge-center {
    position: relative;
    text-align: center;
  }

  .gauge-center div {
    font-size: 42px;
    font-weight: 900;
    line-height: 1;
  }

  .gauge-center span {
    display: block;
    margin-top: 8px;
    color: #ff7b59;
    font-weight: 800;
    letter-spacing: 1px;
    font-size: 12px;
  }

  .gauge-copy {
    margin-top: 8px;
    font-size: 14px;
    opacity: 0.62;
    text-align: center;
    max-width: 280px;
    line-height: 1.6;
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 18px;
    margin-bottom: 24px;
  }

  .kpi-card {
    background: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.035));
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 22px;
    padding: 22px;
    box-shadow: 0 18px 50px rgba(0,0,0,0.18);
    transition: all 0.22s ease;
    cursor: pointer;
  }

  .kpi-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 28px 70px rgba(0,0,0,0.28);
    border: 1px solid rgba(255,255,255,0.16);
  }

  .kpi-label {
    font-size: 12px;
    opacity: 0.62;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }

  .kpi-value {
    font-size: 34px;
    font-weight: 900;
    margin-top: 14px;
  }

  .kpi-note {
    margin-top: 8px;
    font-weight: 800;
    font-size: 14px;
  }

  .panel {
    background: rgba(255,255,255,0.045);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 26px;
    padding: 26px;
    margin-bottom: 24px;
    box-shadow: 0 22px 70px rgba(0,0,0,0.22);
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 18px;
    margin-bottom: 24px;
  }

  .section-title {
    font-size: 24px;
    font-weight: 850;
    letter-spacing: -0.4px;
  }

  .section-subtitle {
    opacity: 0.62;
    margin-top: 6px;
    line-height: 1.5;
  }

  .positive-trend {
    color: #22c55e;
    font-weight: 800;
    font-size: 15px;
    white-space: nowrap;
  }

  .chart-card {
    height: 260px;
    border-radius: 20px;
    background: linear-gradient(180deg, rgba(255,90,54,0.12), rgba(255,255,255,0.02));
    border: 1px solid rgba(255,255,255,0.06);
    position: relative;
    overflow: hidden;
    padding: 24px;
  }

  .chart-labels {
    position: absolute;
    top: 22px;
    left: 24px;
    right: 24px;
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: rgba(255,255,255,0.38);
    z-index: 2;
  }

  .chart-svg {
    width: 100%;
    height: 100%;
  }

  .chart-overlay {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at top, rgba(255,255,255,0.08), transparent 60%);
    pointer-events: none;
  }

  .secondary-orange-button {
    background: rgba(255,90,54,0.14);
    border: 1px solid rgba(255,90,54,0.35);
    color: #ff7b59;
    padding: 10px 14px;
    border-radius: 12px;
    font-weight: 800;
    cursor: pointer;
    white-space: nowrap;
  }

  .secondary-button {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    color: #f3f4f6;
    padding: 10px 14px;
    border-radius: 12px;
    font-weight: 800;
    cursor: pointer;
    white-space: nowrap;
  }

  .leak-row {
    display: grid;
    grid-template-columns: minmax(0,1fr) 100px 120px;
    gap: 16px;
    align-items: center;
    padding: 18px 0;
    border-top: 1px solid rgba(255,255,255,0.07);
  }

  .leak-main {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }

  .leak-icon,
  .product-icon {
    width: 44px;
    height: 44px;
    border-radius: 14px;
    background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    border: 1px solid rgba(255,255,255,0.08);
    box-shadow: 0 10px 24px rgba(0,0,0,0.18);
    flex-shrink: 0;
  }

  .leak-title {
    font-weight: 800;
    font-size: 15px;
    letter-spacing: 0.1px;
  }

  .leak-subtitle {
    opacity: 0.5;
    margin-top: 4px;
    font-size: 13px;
  }

  .severity-pill {
    display: inline-flex;
    padding: 7px 12px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 0.3px;
  }

  .leak-loss {
    justify-self: end;
    text-align: right;
  }

  .leak-loss div {
    font-weight: 900;
    font-size: 18px;
  }

  .leak-loss span {
    display: block;
    font-size: 12px;
    opacity: 0.45;
    margin-top: 4px;
  }

  .empty-state {
    padding: 80px 20px;
    text-align: center;
  }

  .empty-icon {
    width: 84px;
    height: 84px;
    margin: 0 auto;
    border-radius: 24px;
    background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 34px;
    border: 1px solid rgba(255,255,255,0.08);
  }

  .empty-title {
    margin-top: 24px;
    font-size: 24px;
    font-weight: 900;
    letter-spacing: -0.4px;
  }

  .empty-copy {
    margin-top: 12px;
    opacity: 0.58;
    max-width: 460px;
    margin-inline: auto;
    line-height: 1.7;
  }

  .empty-button {
    margin-top: 28px;
    background: linear-gradient(135deg,#ff5a36 0%,#ff7b59 100%);
    border: none;
    color: white;
    font-weight: 900;
    padding: 14px 20px;
    border-radius: 14px;
    cursor: pointer;
    font-size: 14px;
    box-shadow: 0 14px 34px rgba(255,90,54,0.25);
  }

  .desktop-table-wrapper {
    overflow-x: auto;
  }

  .product-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 760px;
  }

  .product-table th {
    text-align: left;
    padding: 14px 12px;
    font-size: 12px;
    opacity: 0.55;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }

  .product-table td {
    padding: 18px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    opacity: 0.86;
    font-weight: 700;
  }

  .product-table tr {
    transition: all 0.18s ease;
    cursor: pointer;
  }

  .product-table tbody tr:hover {
    background: linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015));
  }

  .product-name-cell {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .product-icon {
    width: 42px;
    height: 42px;
  }

  .product-name {
    font-weight: 800;
    font-size: 15px;
  }

  .product-subtitle {
    margin-top: 4px;
    font-size: 12px;
    opacity: 0.48;
  }

  .risk-pill {
    display: inline-flex;
    padding: 7px 11px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 900;
    white-space: nowrap;
  }

  .mobile-products {
    display: none;
  }

  .ai-panel {
    background: linear-gradient(135deg, rgba(34,197,94,0.08), rgba(255,255,255,0.03));
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 26px;
    padding: 28px;
    margin-bottom: 24px;
    box-shadow: 0 22px 70px rgba(0,0,0,0.22);
    position: relative;
    overflow: hidden;
  }

  .ai-glow {
    position: absolute;
    top: -120px;
    right: -120px;
    width: 260px;
    height: 260px;
    border-radius: 50%;
    background: rgba(34,197,94,0.08);
    filter: blur(40px);
  }

  .ai-header {
    position: relative;
    z-index: 2;
    margin-bottom: 26px;
  }

  .ai-eyebrow {
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 1px;
    opacity: 0.58;
    text-transform: uppercase;
  }

  .ai-title {
    font-size: 30px;
    font-weight: 900;
    margin-top: 10px;
    line-height: 1.1;
  }

  .ai-badge {
    padding: 10px 14px;
    border-radius: 999px;
    background: rgba(34,197,94,0.12);
    color: #22c55e;
    font-weight: 900;
    font-size: 13px;
    border: 1px solid rgba(34,197,94,0.18);
    white-space: nowrap;
  }

  .ai-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 18px;
    position: relative;
    z-index: 2;
  }

  .ai-card {
    background: rgba(255,255,255,0.045);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 20px;
    padding: 22px;
    transition: all 0.2s ease;
    cursor: pointer;
  }

  .ai-card:hover {
    transform: translateY(-4px);
    border: 1px solid rgba(255,255,255,0.14);
  }

  .ai-card-title {
    font-size: 17px;
    font-weight: 800;
    line-height: 1.45;
  }

  .ai-impact {
    margin-top: 16px;
    color: #22c55e;
    font-weight: 900;
    font-size: 22px;
  }

  .ai-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 14px;
    margin-top: 18px;
    padding-top: 16px;
    border-top: 1px solid rgba(255,255,255,0.08);
  }

  .confidence-label {
    font-size: 11px;
    opacity: 0.45;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    font-weight: 800;
  }

  .confidence-value {
    margin-top: 6px;
    font-size: 13px;
    font-weight: 800;
    color: #f3f4f6;
  }

  .apply-button {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.08);
    color: #ffffff;
    padding: 10px 14px;
    border-radius: 12px;
    font-weight: 800;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .apply-button:hover {
    background: rgba(255,255,255,0.1);
  }

  @media (max-width: 900px) {
    .dashboard-shell {
      padding: 22px;
    }

    .navbar {
      align-items: flex-start;
      flex-direction: column;
    }

    .nav-tabs {
      width: 100%;
      padding-bottom: 2px;
    }

    .hero-header {
      flex-direction: column;
    }

    .primary-button {
      width: 100%;
      justify-content: center;
    }

    .hero-title {
      font-size: 38px;
    }

    .hero-description {
      font-size: 16px;
    }

    .section-header {
      align-items: flex-start;
      flex-direction: column;
    }

    .positive-trend,
    .secondary-button,
    .secondary-orange-button {
      align-self: flex-start;
    }

    .loading-kpi-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .leak-row {
      grid-template-columns: 1fr;
      gap: 12px;
      padding: 18px 0;
    }

    .leak-severity {
      justify-self: start;
    }

    .leak-loss {
      justify-self: start;
      text-align: left;
    }

    .score-number {
      font-size: 58px;
    }

    .ai-footer {
      align-items: flex-start;
      flex-direction: column;
    }

    .apply-button {
      width: 100%;
    }
  }

  @media (max-width: 640px) {
    .dashboard-shell {
      padding: 16px;
    }

    .navbar,
    .panel,
    .ai-panel,
    .score-card {
      border-radius: 22px;
    }

    .score-card {
      padding: 22px;
      grid-template-columns: 1fr;
    }

    .hero-title {
      font-size: 32px;
    }

    .alert-pill {
      font-size: 12px;
      align-items: flex-start;
    }

    .kpi-grid {
      grid-template-columns: 1fr;
    }

    .loading-kpi-grid {
      grid-template-columns: 1fr;
    }

    .chart-card {
      height: 220px;
      padding: 18px;
    }

    .desktop-table-wrapper {
      display: none;
    }

    .mobile-products {
      display: grid;
      gap: 14px;
    }

    .mobile-product-card {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 18px;
      padding: 16px;
    }

    .mobile-product-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
    }

    .mobile-product-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;
      margin-top: 18px;
      padding-top: 16px;
      border-top: 1px solid rgba(255,255,255,0.08);
    }

    .mobile-product-grid span {
      display: block;
      font-size: 11px;
      opacity: 0.45;
      text-transform: uppercase;
      letter-spacing: 0.7px;
      font-weight: 800;
    }

    .mobile-product-grid strong {
      display: block;
      margin-top: 6px;
      font-size: 15px;
    }

    .ai-title {
      font-size: 24px;
    }

    .ai-grid {
      grid-template-columns: 1fr;
    }

    .score-mini-grid {
      gap: 18px;
    }

    .score-mini-card {
      min-width: 130px;
    }

    .score-mini-card strong {
      font-size: 23px;
    }
  }
`;