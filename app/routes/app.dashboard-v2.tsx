export default function DashboardV2() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(255,80,40,0.18), transparent 30%), linear-gradient(180deg, #071019 0%, #0b111b 100%)",
        padding: 32,
        color: "#f3f4f6",
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
            justifyContent: "space-between",
            alignItems: "center",
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
              MarginLab
            </div>

            <div
              style={{
                fontSize: 42,
                fontWeight: 800,
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
              Track hidden margin leaks, underpriced products and pricing
              issues affecting your Shopify store profitability.
            
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

    <div
      style={{
        color: "#ff6b4a",
        fontWeight: 800,
        fontSize: 20,
        marginTop: 4,
      }}
    >
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
      Your store may be losing profit every day due to underpriced products,
      missing costs, and margin leaks.
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

    <div
      style={{
        fontSize: 46,
        fontWeight: 900,
        color: "#ff5a36",
        marginTop: 18,
      }}
    >
      $2,140
    </div>

    <div style={{ marginTop: 8, opacity: 0.78, lineHeight: 1.5 }}>
      Potential profit you could be losing right now.
    </div>

    <div
      style={{
        marginTop: 18,
        color: "#ff7b59",
        fontWeight: 800,
      }}
    >
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
  {[
    ["Revenue scanned", "$48,920", "+12%"],
    ["Products analyzed", "186", "24 at risk"],
    ["Low margin products", "17", "Needs review"],
    ["Missing costs", "9", "Fix required"],
  ].map(([label, value, note]) => (
    <div
      key={label}
      style={{
        background: "rgba(255,255,255,0.055)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 22,
        padding: 22,
        boxShadow: "0 18px 50px rgba(0,0,0,0.18)",
      }}
    >
      <div
        style={{
          fontSize: 13,
          opacity: 0.68,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.7,
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: 34,
          fontWeight: 900,
          marginTop: 14,
        }}
      >
        {value}
      </div>

      <div
        style={{
          marginTop: 8,
          color: "#ff7b59",
          fontWeight: 700,
          fontSize: 14,
        }}
      >
        {note}
      </div>
    </div>
  ))}

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

  {[
    ["Products below target margin", "High", "-$780/mo"],
    ["Discounts eating your margins", "Medium", "-$430/mo"],
    ["Costs not updated recently", "Medium", "-$320/mo"],
    ["Low-margin best sellers", "Low", "-$180/mo"],
  ].map(([issue, severity, loss]) => (
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

      <div
        style={{
          justifySelf: "end",
          fontWeight: 900,
          color: "#f3f4f6",
        }}
      >
        {loss}
      </div>
    </div>
  ))}
</div>

</div>
            </div>
          </div>

          <button
            style={{
              background: "linear-gradient(135deg,#ff5a36 0%,#ff7b59 100%)",
              border: "none",
              color: "white",
              fontWeight: 700,
              padding: "14px 22px",
              borderRadius: 14,
              cursor: "pointer",
              fontSize: 15,
              boxShadow: "0 10px 25px rgba(255,90,54,0.25)",
            }}
          >
            Scan store
          </button>
        </div>
      </div>
    </div>
  );
}