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

  const products = [
    ["🧥", "Arctic Hoodie", "$8,420", "$5,980", "$420", "5.0%", "High"],
    ["🧤", "Thermal Gloves", "$3,120", "$2,740", "-$180", "-5.8%", "Critical"],
    ["🎒", "Winter Backpack", "$6,890", "$4,110", "$960", "13.9%", "Medium"],
    ["🥾", "Snow Boots", "$12,300", "$8,940", "$1,120", "9.1%", "High"],
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

        {/* IL RESTO DEL TUO CODICE DA QUI IN GIÙ È GIÀ CORRETTO */}
      </div>
    </div>
  );
}