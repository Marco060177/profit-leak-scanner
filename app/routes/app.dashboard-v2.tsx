export default function DashboardV2() {
  const kpis = [
    ["Revenue scanned", "$48,920", "+12%", "positive"],
    ["Products analyzed", "186", "24 at risk", "warning"],
    ["Low margin products", "17", "Needs review", "warning"],
    ["Missing costs", "9", "Fix required", "danger"],
  ];

  const leaks = [
  ["⚠️", "Products below target margin", "High", "-$780/mo"],
  ["🏷️", "Discounts eating your margins", "Medium", "-$430/mo"],
  ["📦", "Costs not updated recently", "Medium", "-$320/mo"],
  ["🔥", "Low-margin best sellers", "Low", "-$180/mo"],
];

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(255,80,40,0.18), transparent 30%), linear-gradient(180deg, #071019 0%, #0b111b 100%)",
        padding: 32,
        color: "#f3f4f6",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
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

          <div style={{ display: "flex", gap: 18, opacity: 0.78, fontWeight: 700 }}>
            <span>Overview</span>
            <span>Leaks</span>
            <span>Products</span>
            <span>Recommendations</span>
            <span>Billing</span>
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
              Profit Leak Scanner
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
              border: "none",
              color: "white",
              fontWeight: 800,
              padding: "14px 22px",
              borderRadius: 14,
              cursor: "pointer",
              fontSize: 15,
              boxShadow: "0 10px 25px rgba(255,90,54,0.25)",
              whiteSpace: "nowrap",
            }}
          >
            Scan store
          </button>
        </div>

        <div
          style={{
            background:
              "linear-gradient(135deg, rgba(255,90,54,0.16), rgba(15,23,42,0.95))",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 28,
            padding: 32,
            boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
            display: "grid",
            gridTemplateColumns: "1.2fr 0.8fr",
            gap: 28,
            marginBottom: 24,
          }}
        >
          <div>
            <div style={{ opacity: 0.7, fontSize: 14, fontWeight: 700 }}>
              PROFIT LEAK SCORE
            </div>

            <div style={{ fontSize: 72, fontWeight: 900, marginTop: 16 }}>
              32<span style={{ fontSize: 28, opacity: 0.55 }}>/100</span>
            </div>

            <div style={{ color: "#ff6b4a", fontWeight: 800, fontSize: 20, marginTop: 4 }}>
              High risk
            </div>

            <div
              style={{
                marginTop: 14,
                fontSize: 17,
                opacity: 0.78,
                maxWidth: 520,
                lineHeight: 1.6,
              }}
            >
              Your store may be losing profit every day due to underpriced products, missing costs,
              and margin leaks.
            </div>
          </div>

          <div
            style={{
              background: "rgba(0,0,0,0.22)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 22,
              padding: 24,
            }}
          >
            <div style={{ opacity: 0.7, fontSize: 14, fontWeight: 700 }}>
              ESTIMATED MONTHLY LOSS
            </div>

            <div style={{ fontSize: 46, fontWeight: 900, color: "#ff5a36", marginTop: 18 }}>
              $2,140
            </div>

            <div style={{ marginTop: 8, opacity: 0.78, lineHeight: 1.5 }}>
              Potential profit you could be losing right now.
            </div>

            <div style={{ marginTop: 18, color: "#ff7b59", fontWeight: 800 }}>
              ↑ 18% vs last 30 days
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 18,
            marginBottom: 24,
          }}
        >
          {kpis.map(([label, value, note, tone]) => (
            <div
              key={label}
              style={{
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.035))",
                border: "1px solid rgba(255,255,255,0.09)",
                borderRadius: 22,
                padding: 22,
                boxShadow: "0 18px 50px rgba(0,0,0,0.18)",
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
              <div style={{ fontSize: 22, fontWeight: 900 }}>Profit Trend</div>

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
              <div style={{ fontSize: 22, fontWeight: 900 }}>
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

          {leaks.map(([icon, issue, severity, loss]) => (
            <div
              key={issue}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 100px 120px",
                gap: 16,
                alignItems: "center",
                padding: "16px 0",
                borderTop: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div style={{ fontWeight: 750 }}>{issue}</div>

              <div
                style={{
                  justifySelf: "start",
                  padding: "6px 10px",
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 800,
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
                }}
              >
                {severity}
              </div>

              <div style={{ justifySelf: "end", fontWeight: 900, color: "#f3f4f6" }}>
                {loss}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}