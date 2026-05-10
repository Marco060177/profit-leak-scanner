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

  if (dashboardLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(180deg, #071019 0%, #0b111b 100%)",
          padding: 32,
          color: "#f3f4f6",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: 1400,
            margin: "0 auto",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 24,
            }}
          >
            <div
              style={{
                height: 80,
                borderRadius: 24,
                background: "rgba(255,255,255,0.05)",
                animation: "pulse 1.8s infinite",
              }}
            />

            <div
              style={{
                height: 340,
                borderRadius: 32,
                background: "rgba(255,255,255,0.05)",
                animation: "pulse 1.8s infinite",
              }}
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 18,
              }}
            >
              {[1, 2, 3, 4].map((item) => (
                <div
                  key={item}
                  style={{
                    height: 140,
                    borderRadius: 24,
                    background: "rgba(255,255,255,0.05)",
                    animation: "pulse 1.8s infinite",
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <style>
          {`
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
          `}
        </style>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `
          radial-gradient(circle at top left, rgba(255,80,40,0.16), transparent 30%),
          radial-gradient(circle at bottom right, rgba(255,90,54,0.10), transparent 24%),
          linear-gradient(180deg, #071019 0%, #0b111b 100%)
        `,
        backgroundSize: "120% 120%",
        animation: "gradientMove 18s ease infinite",
        padding: 32,
        color: "#f3f4f6",
        fontFamily: "Inter, system-ui, sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>
        {`
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
        `}
      </style>

      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          position: "relative",
          zIndex: 2,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 28,
            padding: "14px 16px",
            borderRadius: 18,
            background: "rgba(255,255,255,0.045)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div style={{ fontWeight: 900, letterSpacing: 0.5 }}>
            MARGIN<span style={{ color: "#ff5a36" }}>LAB</span>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
            }}
          >
            {["Overview", "Leaks", "Products", "Recommendations", "Billing"].map((item) => (
              <div
                key={item}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  background: item === "Overview" ? "rgba(255,255,255,0.08)" : "transparent",
                  border:
                    item === "Overview"
                      ? "1px solid rgba(255,255,255,0.08)"
                      : "1px solid transparent",
                  color: item === "Overview" ? "#ffffff" : "rgba(255,255,255,0.72)",
                }}
                onMouseEnter={(e) => {
                  if (item !== "Overview") {
                    e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (item !== "Overview") {
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                {item}
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 24,
            marginBottom: 28,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: 1,
                opacity: 0.7,
                textTransform: "uppercase",
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 14px",
                  borderRadius: 999,
                  background: "rgba(255,90,54,0.12)",
                  border: "1px solid rgba(255,90,54,0.16)",
                  marginBottom: 18,
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#ff5a36",
                    boxShadow: "0 0 10px rgba(255,90,54,0.8)",
                  }}
                />

                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: "#ff7b59",
                    letterSpacing: 0.3,
                  }}
                >
                  3 critical pricing issues detected
                </div>
              </div>
              <div>Profit Leak Scanner</div>
            </div>

            <div
              style={{
                fontSize: 46,
                fontWeight: 900,
                marginTop: 8,
                lineHeight: 1.05,
              }}
            >
              Profit Leak Dashboard
            </div>

            <div
              style={{
                marginTop: 12,
                opacity: 0.78,
                fontSize: 18,
                maxWidth: 760,
                lineHeight: 1.6,
              }}
            >
              Track hidden margin leaks, underpriced products and pricing issues affecting your
              Shopify store profitability.
            </div>
          </div>

          <button
            style={{
              background: "linear-gradient(135deg,#ff5a36 0%,#ff7b59 100%)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "white",
              fontWeight: 900,
              padding: "15px 22px",
              borderRadius: 16,
              cursor: "pointer",
              fontSize: 15,
              display: "flex",
              alignItems: "center",
              gap: 10,
              boxShadow: "0 14px 34px rgba(255,90,54,0.28)",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 20px 44px rgba(255,90,54,0.34)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0px)";
              e.currentTarget.style.boxShadow = "0 14px 34px rgba(255,90,54,0.28)";
            }}
          >
            <span style={{ fontSize: 16 }}>✦</span>
            <span>Run analysis</span>
          </button>
        </div>

        <div
          style={{
            background: "linear-gradient(135deg, rgba(255,90,54,0.16), rgba(15,23,42,0.92))",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 28,
            padding: 32,
            boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
            position: "relative",
            overflow: "hidden",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 28,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -180,
              right: -120,
              width: 420,
              height: 420,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.05)",
              filter: "blur(70px)",
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              position: "absolute",
              bottom: -120,
              left: -120,
              width: 320,
              height: 320,
              borderRadius: "50%",
              background: "rgba(255,90,54,0.08)",
              filter: "blur(60px)",
              pointerEvents: "none",
            }}
          />

          <div style={{ position: "relative", zIndex: 2 }}>
            <div style={{ opacity: 0.7, fontSize: 14, fontWeight: 700 }}>
              PROFIT LEAK SCORE
            </div>

            <div style={{ fontSize: 72, fontWeight: 900, marginTop: 16 }}>
              {dashboardData.summary.score}
              <span style={{ fontSize: 28, opacity: 0.55 }}>/100</span>
            </div>

            <div style={{ color: "#ff6b4a", fontWeight: 800, fontSize: 20, marginTop: 4 }}>
              High risk
            </div>

            <div
              style={{
                marginTop: 14,
                fontSize: 17,
                opacity: 0.78,
                maxWidth: 560,
                lineHeight: 1.6,
              }}
            >
              Your store may be losing profit every day due to underpriced products, missing costs,
              and margin leaks.
            </div>

            <div
              style={{
                display: "flex",
                gap: 28,
                marginTop: 26,
                flexWrap: "wrap",
                paddingTop: 18,
                borderTop: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {[
                ["Estimated loss", `${dashboardData.summary.monthlyLoss}/mo`, "#ff5a36"],
                ["Products at risk", "24 detected", "#f59e0b"],
                ["Margin trend", "+12.4%", "#22c55e"],
              ].map(([label, value, color]) => (
                <div key={label} style={{ minWidth: 160 }}>
                  <div
                    style={{
                      fontSize: 12,
                      opacity: 0.5,
                      textTransform: "uppercase",
                      letterSpacing: 0.8,
                      fontWeight: 700,
                    }}
                  >
                    {label}
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 28,
                      fontWeight: 900,
                      color,
                      lineHeight: 1,
                    }}
                  >
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              background: "rgba(0,0,0,0.22)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 22,
              padding: 24,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              overflow: "hidden",
              zIndex: 2,
            }}
          >
            <div
              style={{
                position: "absolute",
                width: 240,
                height: 240,
                borderRadius: "50%",
                background: "rgba(255,90,54,0.1)",
                filter: "blur(50px)",
              }}
            />

            <div
              style={{
                position: "relative",
                width: 170,
                height: 170,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="170"
                height="170"
                viewBox="0 0 220 220"
                style={{
                  position: "absolute",
                  transform: "rotate(-90deg)",
                }}
              >
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

              <div style={{ position: "relative", textAlign: "center" }}>
                <div
                  style={{
                    fontSize: 42,
                    fontWeight: 900,
                    lineHeight: 1,
                  }}
                >
                  {dashboardData.summary.score}
                </div>

                <div
                  style={{
                    marginTop: 8,
                    color: "#ff7b59",
                    fontWeight: 800,
                    letterSpacing: 1,
                    fontSize: 12,
                  }}
                >
                  HIGH RISK
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 8,
                fontSize: 14,
                opacity: 0.62,
                textAlign: "center",
                maxWidth: 280,
                lineHeight: 1.6,
              }}
            >
              Your current margin health score based on pricing leaks and low-profit products.
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 18,
            marginBottom: 24,
          }}
        >
          {dashboardData.kpis.map(([label, value, note, tone]) => (
            <div
              key={label}
              style={{
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.035))",
                border: "1px solid rgba(255,255,255,0.09)",
                borderRadius: 22,
                padding: 22,
                boxShadow: "0 18px 50px rgba(0,0,0,0.18)",
                transition: "all 0.22s ease",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-4px)";
                e.currentTarget.style.boxShadow = "0 28px 70px rgba(0,0,0,0.28)";
                e.currentTarget.style.border = "1px solid rgba(255,255,255,0.16)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0px)";
                e.currentTarget.style.boxShadow = "0 18px 50px rgba(0,0,0,0.18)";
                e.currentTarget.style.border = "1px solid rgba(255,255,255,0.09)";
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  opacity: 0.62,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                }}
              >
                {label}
              </div>

              <div style={{ fontSize: 34, fontWeight: 900, marginTop: 14 }}>{value}</div>

              <div
                style={{
                  marginTop: 8,
                  color:
                    tone === "positive"
                      ? "#22c55e"
                      : tone === "danger"
                        ? "#ff6b4a"
                        : "#f59e0b",
                  fontWeight: 800,
                  fontSize: 14,
                }}
              >
                {note}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            background: "rgba(255,255,255,0.045)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 26,
            padding: 26,
            marginBottom: 24,
            boxShadow: "0 22px 70px rgba(0,0,0,0.22)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 24,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 850,
                  letterSpacing: -0.4,
                }}
              >
                Profit Trend
              </div>

              <div style={{ opacity: 0.62, marginTop: 6 }}>
                Revenue and profit performance over time.
              </div>
            </div>

            <div style={{ color: "#22c55e", fontWeight: 800, fontSize: 15 }}>
              ↑ 12.4% this month
            </div>
          </div>

          <div
            style={{
              height: 260,
              borderRadius: 20,
              background:
                "linear-gradient(180deg, rgba(255,90,54,0.12), rgba(255,255,255,0.02))",
              border: "1px solid rgba(255,255,255,0.06)",
              position: "relative",
              overflow: "hidden",
              padding: 24,
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 22,
                left: 24,
                right: 24,
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12,
                color: "rgba(255,255,255,0.38)",
                zIndex: 2,
              }}
            >
              <span>Apr 1</span>
              <span>Apr 15</span>
              <span>Apr 30</span>
            </div>

            <svg
              viewBox="0 0 1000 260"
              preserveAspectRatio="none"
              style={{
                width: "100%",
                height: "100%",
              }}
            >
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

            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(circle at top, rgba(255,255,255,0.08), transparent 60%)",
                pointerEvents: "none",
              }}
            />
          </div>
        </div>

        <div
          style={{
            background: "rgba(255,255,255,0.045)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 26,
            padding: 26,
            marginBottom: 24,
            boxShadow: "0 22px 70px rgba(0,0,0,0.22)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 850,
                  letterSpacing: -0.4,
                }}
              >
                Top Profit Leaks Detected
              </div>

              <div style={{ opacity: 0.62, marginTop: 6 }}>
                Prioritized issues that may be hurting your margins.
              </div>
            </div>

            <button
              style={{
                background: "rgba(255,90,54,0.14)",
                border: "1px solid rgba(255,90,54,0.35)",
                color: "#ff7b59",
                padding: "10px 14px",
                borderRadius: 12,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              View all
            </button>
          </div>

          {dashboardData.leaks.map(({ icon, issue, severity, loss }) => (
            <div
              key={issue}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1fr) 100px 120px",
                gap: 16,
                alignItems: "center",
                padding: "18px 0",
                borderTop: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    background:
                      "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    border: "1px solid rgba(255,255,255,0.08)",
                    boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
                  }}
                >
                  {icon}
                </div>

                <div>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: 15,
                      letterSpacing: 0.1,
                    }}
                  >
                    {issue}
                  </div>

                  <div
                    style={{
                      opacity: 0.5,
                      marginTop: 4,
                      fontSize: 13,
                    }}
                  >
                    Margin optimization opportunity detected
                  </div>
                </div>
              </div>

              <div style={{ justifySelf: "start" }}>
                <div
                  style={{
                    padding: "7px 12px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 900,
                    letterSpacing: 0.3,
                    color:
                      severity === "High"
                        ? "#ff6b4a"
                        : severity === "Medium"
                          ? "#f59e0b"
                          : "#9ca3af",
                    background:
                      severity === "High"
                        ? "rgba(255,90,54,0.14)"
                        : severity === "Medium"
                          ? "rgba(245,158,11,0.14)"
                          : "rgba(156,163,175,0.12)",
                    border:
                      severity === "High"
                        ? "1px solid rgba(255,90,54,0.25)"
                        : severity === "Medium"
                          ? "1px solid rgba(245,158,11,0.22)"
                          : "1px solid rgba(156,163,175,0.18)",
                  }}
                >
                  {severity}
                </div>
              </div>

              <div style={{ justifySelf: "end" }}>
                <div
                  style={{
                    fontWeight: 900,
                    fontSize: 18,
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

                <div
                  style={{
                    fontSize: 12,
                    opacity: 0.45,
                    marginTop: 4,
                    textAlign: "right",
                  }}
                >
                  estimated impact
                </div>
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            background: "rgba(255,255,255,0.045)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 26,
            padding: 26,
            marginBottom: 24,
            boxShadow: "0 22px 70px rgba(0,0,0,0.22)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 22,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 850,
                  letterSpacing: -0.4,
                }}
              >
                Product Risk Table
              </div>

              <div style={{ opacity: 0.62, marginTop: 6 }}>
                Products ranked by margin risk and potential profit leaks.
              </div>
            </div>

            <button
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#f3f4f6",
                padding: "10px 14px",
                borderRadius: 12,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Export CSV
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
              }}
            >
              <thead>
                <tr>
                  {["Product", "Revenue", "COGS", "Profit", "Margin", "Risk"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "14px 12px",
                        fontSize: 12,
                        opacity: 0.55,
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                        borderBottom: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {dashboardData.products.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        padding: "80px 20px",
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          width: 84,
                          height: 84,
                          margin: "0 auto",
                          borderRadius: 24,
                          background:
                            "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 34,
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        📦
                      </div>

                      <div
                        style={{
                          marginTop: 24,
                          fontSize: 24,
                          fontWeight: 900,
                          letterSpacing: -0.4,
                        }}
                      >
                        No products analyzed yet
                      </div>

                      <div
                        style={{
                          marginTop: 12,
                          opacity: 0.58,
                          maxWidth: 460,
                          marginInline: "auto",
                          lineHeight: 1.7,
                        }}
                      >
                        Run your first store analysis to identify hidden margin leaks, pricing
                        issues and optimization opportunities.
                      </div>

                      <button
                        style={{
                          marginTop: 28,
                          background: "linear-gradient(135deg,#ff5a36 0%,#ff7b59 100%)",
                          border: "none",
                          color: "white",
                          fontWeight: 900,
                          padding: "14px 20px",
                          borderRadius: 14,
                          cursor: "pointer",
                          fontSize: 14,
                          boxShadow: "0 14px 34px rgba(255,90,54,0.25)",
                        }}
                      >
                        Run first analysis
                      </button>
                    </td>
                  </tr>
                ) : (
                  dashboardData.products.map(
                    ({ icon, name, revenue, cogs, profit, margin, risk }) => (
                      <tr
                        key={name}
                        style={{
                          transition: "all 0.18s ease",
                          cursor: "pointer",
                          transform: "scale(1)",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background =
                            "linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))";

                          e.currentTarget.style.transform = "scale(1.003)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.transform = "scale(1)";
                        }}
                      >
                        <td
                          style={{
                            padding: "18px 12px",
                            borderBottom: "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 14,
                            }}
                          >
                            <div
                              style={{
                                width: 42,
                                height: 42,
                                borderRadius: 14,
                                background:
                                  "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 18,
                                border: "1px solid rgba(255,255,255,0.08)",
                                boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
                              }}
                            >
                              {icon}
                            </div>

                            <div>
                              <div
                                style={{
                                  fontWeight: 800,
                                  fontSize: 15,
                                }}
                              >
                                {name}
                              </div>

                              <div
                                style={{
                                  marginTop: 4,
                                  fontSize: 12,
                                  opacity: 0.48,
                                }}
                              >
                                Shopify product
                              </div>
                            </div>
                          </div>
                        </td>

                        {[revenue, cogs, profit, margin].map((value) => (
                          <td
                            key={value}
                            style={{
                              padding: "18px 12px",
                              borderBottom: "1px solid rgba(255,255,255,0.06)",
                              opacity: 0.86,
                              fontWeight: 700,
                            }}
                          >
                            {value}
                          </td>
                        ))}

                        <td
                          style={{
                            padding: "18px 12px",
                            borderBottom: "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          <span
                            style={{
                              padding: "7px 11px",
                              borderRadius: 999,
                              fontSize: 13,
                              fontWeight: 900,
                              color:
                                risk === "Critical"
                                  ? "#ef4444"
                                  : risk === "High"
                                    ? "#ff6b4a"
                                    : "#f59e0b",
                              background:
                                risk === "Critical"
                                  ? "rgba(239,68,68,0.16)"
                                  : risk === "High"
                                    ? "rgba(255,90,54,0.14)"
                                    : "rgba(245,158,11,0.14)",
                            }}
                          >
                            {risk}
                          </span>
                        </td>
                      </tr>
                    )
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div
          style={{
            background:
              "linear-gradient(135deg, rgba(34,197,94,0.08), rgba(255,255,255,0.03))",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 26,
            padding: 28,
            marginBottom: 24,
            boxShadow: "0 22px 70px rgba(0,0,0,0.22)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -120,
              right: -120,
              width: 260,
              height: 260,
              borderRadius: "50%",
              background: "rgba(34,197,94,0.08)",
              filter: "blur(40px)",
            }}
          />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 26,
              position: "relative",
              zIndex: 2,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: 1,
                  opacity: 0.58,
                  textTransform: "uppercase",
                }}
              >
                AI Recommendations
              </div>

              <div
                style={{
                  fontSize: 30,
                  fontWeight: 900,
                  marginTop: 10,
                  lineHeight: 1.1,
                }}
              >
                Smart margin optimization suggestions
              </div>
            </div>

            <div
              style={{
                padding: "10px 14px",
                borderRadius: 999,
                background: "rgba(34,197,94,0.12)",
                color: "#22c55e",
                fontWeight: 900,
                fontSize: 13,
                border: "1px solid rgba(34,197,94,0.18)",
              }}
            >
              AI ACTIVE
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 18,
              position: "relative",
              zIndex: 2,
            }}
          >
            {dashboardData.recommendations.map(({ title, impact, confidence }) => (
              <div
                key={title}
                style={{
                  background: "rgba(255,255,255,0.045)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 20,
                  padding: 22,
                  transition: "all 0.2s ease",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.border = "1px solid rgba(255,255,255,0.14)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0px)";
                  e.currentTarget.style.border = "1px solid rgba(255,255,255,0.08)";
                }}
              >
                <div
                  style={{
                    fontSize: 17,
                    fontWeight: 800,
                    lineHeight: 1.45,
                  }}
                >
                  {title}
                </div>

                <div
                  style={{
                    marginTop: 16,
                    color: "#22c55e",
                    fontWeight: 900,
                    fontSize: 22,
                  }}
                >
                  {impact}
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 18,
                    paddingTop: 16,
                    borderTop: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        opacity: 0.45,
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                        fontWeight: 800,
                      }}
                    >
                      Confidence
                    </div>

                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 13,
                        fontWeight: 800,
                        color: "#f3f4f6",
                      }}
                    >
                      {confidence}
                    </div>
                  </div>

                  <button
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      color: "#ffffff",
                      padding: "10px 14px",
                      borderRadius: 12,
                      fontWeight: 800,
                      fontSize: 13,
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                    }}
                  >
                    Apply suggestion
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}