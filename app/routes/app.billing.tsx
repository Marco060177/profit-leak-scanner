// app/routes/app.billing.tsx
import * as React from "react";
import { useFetcher, useNavigate } from "react-router";
import { authenticate } from "~/shopify.server";

export async function action({ request }: { request: Request }) {
  const { session } = await authenticate.admin(request);

  try {
    const appHandle = process.env.SHOPIFY_APP_HANDLE || "";

    if (!appHandle) {
      return Response.json(
        {
          ok: false,
          error: "Missing SHOPIFY_APP_HANDLE in .env",
        },
        { status: 500 },
      );
    }

    const storeHandle = session.shop.replace(".myshopify.com", "");
    const redirectUrl = `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;

    return Response.json({
      ok: true,
      redirectUrl,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to open Shopify pricing page",
      },
      { status: 500 },
    );
  }
}

export default function Billing() {
  const fetcher = useFetcher();
  const navigate = useNavigate();

  React.useEffect(() => {
    const data = fetcher.data as any;

    if (data?.ok && data?.redirectUrl) {
      (window.top ?? window).location.href = data.redirectUrl;
    }
  }, [fetcher.data]);

  const data = fetcher.data as any;
  const error = data && data.ok === false ? data.error : null;
  const isLoading = fetcher.state !== "idle";

  return (
    <div style={styles.page}>
      <div style={styles.backgroundGlowOne} />
      <div style={styles.backgroundGlowTwo} />

      <div style={styles.container}>
        <div style={styles.topBar}>
          <div style={styles.logo}>
            MARGIN<span style={{ color: "#ff5a36" }}>LAB</span>
          </div>

          <button type="button" style={styles.backTopBtn} onClick={() => navigate("/app")}>
            Back to dashboard
          </button>
        </div>

        <div style={styles.hero}>
          <div style={styles.heroLeft}>
            <div style={styles.badge}>
              <span style={styles.badgeDot} />
              MARGIN INTELLIGENCE PLAN
            </div>

            <h1 style={styles.title}>Protect your Shopify margins before leaks scale.</h1>

            <p style={styles.subtitle}>
              Unlock premium margin analysis, product risk detection, target pricing insights and
              actionable recommendations built for Shopify merchants.
            </p>

            <div style={styles.heroStats}>
              <div style={styles.statCard}>
                <div style={styles.statLabel}>Plan</div>
                <div style={styles.statValue}>Starter</div>
              </div>

              <div style={styles.statCard}>
                <div style={styles.statLabel}>Trial</div>
                <div style={styles.statValue}>14 days</div>
              </div>

              <div style={styles.statCard}>
                <div style={styles.statLabel}>Setup</div>
                <div style={styles.statValue}>No code</div>
              </div>
            </div>
          </div>

          <div style={styles.pricingCard}>
            <div style={styles.cardGlow} />

            <div style={styles.planHeader}>
              <div>
                <div style={styles.planEyebrow}>Starter</div>
                <div style={styles.planTitle}>Margin Intelligence</div>
              </div>

              <div style={styles.popularBadge}>BEST START</div>
            </div>

            <div style={styles.priceRow}>
              <div style={styles.price}>$39</div>
              <div style={styles.priceMeta}>/ month</div>
            </div>

            <div style={styles.note}>14-day free trial. Cancel anytime through Shopify.</div>

            <div style={styles.divider} />

            <div style={styles.featureTitle}>What’s included</div>

            <div style={styles.featuresGrid}>
              {[
                "Profit Leak Score",
                "Product risk table",
                "Margin and COGS analysis",
                "Target price suggestions",
                "Low-margin product detection",
                "Missing cost alerts",
                "AI-style recommendations",
                "CSV-ready profitability insights",
              ].map((feature) => (
                <div key={feature} style={styles.featureItem}>
                  <span style={styles.check}>✓</span>
                  <span>{feature}</span>
                </div>
              ))}
            </div>

            {error ? (
              <div style={styles.errorBox}>
                <div style={styles.errorTitle}>Billing error</div>
                <div style={styles.errorText}>{String(error)}</div>
              </div>
            ) : null}

            <fetcher.Form method="post" style={styles.form}>
              <button type="submit" style={styles.primaryBtn} disabled={isLoading}>
                {isLoading ? "Opening Shopify billing..." : "Activate Starter Plan"}
              </button>
            </fetcher.Form>

            <button type="button" style={styles.secondaryBtn} onClick={() => navigate("/app")}>
              Continue without activating
            </button>
          </div>
        </div>

        <div style={styles.bottomGrid}>
          <div style={styles.infoPanel}>
            <div style={styles.infoIcon}>⚠️</div>
            <div>
              <div style={styles.infoTitle}>Detect hidden margin problems</div>
              <div style={styles.infoText}>
                Find low-margin products, missing costs and pricing issues that quietly reduce
                profitability.
              </div>
            </div>
          </div>

          <div style={styles.infoPanel}>
            <div style={styles.infoIcon}>📈</div>
            <div>
              <div style={styles.infoTitle}>Turn product data into action</div>
              <div style={styles.infoText}>
                Review target prices, estimated recovery opportunities and products requiring
                attention.
              </div>
            </div>
          </div>

          <div style={styles.infoPanel}>
            <div style={styles.infoIcon}>🧠</div>
            <div>
              <div style={styles.infoTitle}>Built for margin intelligence</div>
              <div style={styles.infoText}>
                MarginLab is evolving beyond reporting into smarter profitability insights for
                Shopify stores.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top left, rgba(255,80,40,0.16), transparent 30%), radial-gradient(circle at bottom right, rgba(59,130,246,0.12), transparent 26%), linear-gradient(180deg, #071019 0%, #0b111b 100%)",
    color: "#f3f4f6",
    fontFamily: "Inter, system-ui, sans-serif",
    padding: 32,
    position: "relative",
    overflow: "hidden",
  },
  backgroundGlowOne: {
    position: "absolute",
    top: -180,
    left: -160,
    width: 420,
    height: 420,
    borderRadius: "50%",
    background: "rgba(255,90,54,0.10)",
    filter: "blur(70px)",
  },
  backgroundGlowTwo: {
    position: "absolute",
    bottom: -180,
    right: -140,
    width: 460,
    height: 460,
    borderRadius: "50%",
    background: "rgba(59,130,246,0.10)",
    filter: "blur(80px)",
  },
  container: {
    maxWidth: 1240,
    margin: "0 auto",
    position: "relative",
    zIndex: 2,
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    marginBottom: 36,
    padding: "14px 16px",
    borderRadius: 18,
    background: "rgba(255,255,255,0.045)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  logo: {
    fontWeight: 900,
    letterSpacing: 0.5,
  },
  backTopBtn: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#f3f4f6",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 800,
    cursor: "pointer",
  },
  hero: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.05fr) minmax(360px, 0.95fr)",
    gap: 28,
    alignItems: "stretch",
  },
  heroLeft: {
    padding: 34,
    borderRadius: 30,
    background: "linear-gradient(135deg, rgba(255,90,54,0.12), rgba(255,255,255,0.035))",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 24px 80px rgba(0,0,0,0.28)",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 14px",
    borderRadius: 999,
    background: "rgba(255,90,54,0.12)",
    border: "1px solid rgba(255,90,54,0.20)",
    color: "#ff9a7f",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 0.8,
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#ff5a36",
    boxShadow: "0 0 12px rgba(255,90,54,0.8)",
  },
  title: {
    margin: "26px 0 0",
    maxWidth: 760,
    fontSize: 52,
    lineHeight: 1.04,
    letterSpacing: -1.6,
    fontWeight: 950,
  },
  subtitle: {
    margin: "18px 0 0",
    maxWidth: 720,
    color: "rgba(243,244,246,0.72)",
    fontSize: 18,
    lineHeight: 1.65,
  },
  heroStats: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 14,
    marginTop: 34,
  },
  statCard: {
    padding: 18,
    borderRadius: 18,
    background: "rgba(0,0,0,0.20)",
    border: "1px solid rgba(255,255,255,0.07)",
  },
  statLabel: {
    fontSize: 11,
    opacity: 0.45,
    textTransform: "uppercase",
    letterSpacing: 0.9,
    fontWeight: 900,
  },
  statValue: {
    marginTop: 8,
    fontSize: 22,
    fontWeight: 900,
  },
  pricingCard: {
    position: "relative",
    overflow: "hidden",
    padding: 30,
    borderRadius: 30,
    background: "linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 28px 90px rgba(0,0,0,0.35)",
  },
  cardGlow: {
    position: "absolute",
    top: -120,
    right: -120,
    width: 260,
    height: 260,
    borderRadius: "50%",
    background: "rgba(34,197,94,0.10)",
    filter: "blur(50px)",
  },
  planHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    position: "relative",
    zIndex: 2,
  },
  planEyebrow: {
    fontSize: 12,
    color: "#93c5fd",
    fontWeight: 900,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  planTitle: {
    marginTop: 8,
    fontSize: 25,
    fontWeight: 950,
    letterSpacing: -0.4,
  },
  popularBadge: {
    padding: "8px 11px",
    borderRadius: 999,
    background: "rgba(34,197,94,0.12)",
    border: "1px solid rgba(34,197,94,0.18)",
    color: "#4ade80",
    fontSize: 11,
    fontWeight: 950,
    whiteSpace: "nowrap",
  },
  priceRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: 10,
    marginTop: 30,
    position: "relative",
    zIndex: 2,
  },
  price: {
    fontSize: 68,
    lineHeight: 1,
    fontWeight: 950,
    letterSpacing: -2,
  },
  priceMeta: {
    fontSize: 17,
    color: "rgba(255,255,255,0.58)",
    marginBottom: 8,
    fontWeight: 800,
  },
  note: {
    marginTop: 10,
    color: "rgba(255,255,255,0.58)",
    fontSize: 14,
    position: "relative",
    zIndex: 2,
  },
  divider: {
    height: 1,
    background: "rgba(255,255,255,0.08)",
    margin: "26px 0",
    position: "relative",
    zIndex: 2,
  },
  featureTitle: {
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.9,
    fontWeight: 900,
    color: "rgba(255,255,255,0.55)",
    marginBottom: 16,
    position: "relative",
    zIndex: 2,
  },
  featuresGrid: {
    display: "grid",
    gap: 12,
    position: "relative",
    zIndex: 2,
  },
  featureItem: {
    display: "flex",
    alignItems: "center",
    gap: 11,
    color: "rgba(255,255,255,0.82)",
    fontSize: 14,
    lineHeight: 1.5,
    fontWeight: 700,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: "rgba(34,197,94,0.13)",
    border: "1px solid rgba(34,197,94,0.22)",
    color: "#4ade80",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 950,
    flexShrink: 0,
  },
  errorBox: {
    marginTop: 22,
    padding: 14,
    borderRadius: 16,
    border: "1px solid rgba(239,68,68,0.28)",
    background: "rgba(239,68,68,0.08)",
    position: "relative",
    zIndex: 2,
  },
  errorTitle: {
    fontWeight: 900,
    color: "#fca5a5",
  },
  errorText: {
    marginTop: 4,
    color: "#fecaca",
    lineHeight: 1.5,
  },
  form: {
    marginTop: 26,
    position: "relative",
    zIndex: 2,
  },
  primaryBtn: {
    width: "100%",
    padding: "15px 18px",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "linear-gradient(135deg,#ff5a36 0%,#ff7b59 100%)",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 950,
    fontSize: 15,
    boxShadow: "0 18px 46px rgba(255,90,54,0.28)",
  },
  secondaryBtn: {
    width: "100%",
    marginTop: 12,
    padding: "14px 18px",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.055)",
    color: "#f3f4f6",
    cursor: "pointer",
    fontWeight: 850,
    fontSize: 14,
  },
  bottomGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 18,
    marginTop: 28,
  },
  infoPanel: {
    display: "flex",
    gap: 14,
    alignItems: "flex-start",
    padding: 20,
    borderRadius: 22,
    background: "rgba(255,255,255,0.045)",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 18px 50px rgba(0,0,0,0.18)",
  },
  infoIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    background: "rgba(255,255,255,0.07)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 19,
    flexShrink: 0,
  },
  infoTitle: {
    fontWeight: 900,
    fontSize: 15,
  },
  infoText: {
    marginTop: 6,
    color: "rgba(255,255,255,0.58)",
    lineHeight: 1.55,
    fontSize: 13,
  },
};