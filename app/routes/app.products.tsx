export default function ProductsPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#071019",
        color: "white",
        padding: "40px",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "1400px",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            marginBottom: "30px",
          }}
        >
          <div
            style={{
              color: "#ff8a3d",
              fontSize: "12px",
              fontWeight: 800,
              letterSpacing: "1px",
              textTransform: "uppercase",
              marginBottom: "12px",
            }}
          >
            PRODUCTS INTELLIGENCE
          </div>

          <h1
            style={{
              fontSize: "48px",
              fontWeight: 900,
              marginBottom: "16px",
            }}
          >
            Product Risk Analysis
          </h1>

          <p
            style={{
              color: "#98a2b3",
              maxWidth: "760px",
              lineHeight: 1.7,
              fontSize: "18px",
            }}
          >
            Analyze low-margin products, missing costs, pricing risks and
            recoverable profit opportunities across your Shopify catalog.
          </p>
        </div>
      </div>
    </div>
  );
}