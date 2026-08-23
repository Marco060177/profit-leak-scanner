// app/routes/app.billing.tsx
import * as React from "react";
import { useFetcher, useNavigate } from "react-router";
import { useI18n } from "~/components/i18n/I18nProvider";
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
        error:
          error instanceof Error
            ? error.message
            : "Unable to open Shopify pricing page",
      },
      { status: 500 },
    );
  }
}

export default function Billing() {
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const { messages } = useI18n();
  const billing = messages.billing;

  React.useEffect(() => {
    const data = fetcher.data as any;

    if (data?.ok && data?.redirectUrl) {
      (window.top ?? window).location.href = data.redirectUrl;
    }
  }, [fetcher.data]);

  const data = fetcher.data as any;
  const error = data && data.ok === false ? data.error : null;
  const isLoading = fetcher.state !== "idle";

  const starterFeatures = billing.starterFeatures;
  const growthFeatures = billing.growthFeatures;

  const openShopifyPricing = () => (
    <fetcher.Form method="post" style={styles.form}>
      <button
        type="submit"
        style={styles.primaryBtn}
        disabled={isLoading}
      >
        {isLoading ? billing.openingShopifyPlans : billing.choosePlanOnShopify}
      </button>
    </fetcher.Form>
  );

  return (
    <div style={styles.page}>
      <div style={styles.glowOne} />
      <div style={styles.glowTwo} />

      <div style={styles.container}>
        <div style={styles.topBar}>
          <div style={styles.logo}>
            MARGIN<span style={{ color: "#ff5a36" }}>LAB</span>
          </div>

          <div style={styles.topRight}>
            <div style={styles.shopifyPill}>
              {billing.managedByShopify}
            </div>

            <button
              type="button"
              style={styles.backBtn}
              onClick={() => navigate("/app")}
            >
              {billing.backToDashboard}
            </button>
          </div>
        </div>

        <section style={styles.hero}>
          <div style={styles.badge}>
            <span style={styles.badgeDot} />
            MARGINLAB PLANS
          </div>

          <h1 style={styles.heroTitle}>
            {billing.heroTitle}
          </h1>

          <p style={styles.heroText}>
            {billing.heroText}
          </p>

          <div style={styles.heroPills}>
            <div style={styles.heroPill}>
              <strong>14</strong>
              <span>{billing.freeTrialDays}</span>
            </div>
            <div style={styles.heroPill}>
              <strong>10</strong>
              <span>{billing.supportedTaxAwareMarkets}</span>
            </div>
            <div style={styles.heroPill}>
              <strong>2</strong>
              <span>{billing.plansOneDataFoundation}</span>
            </div>
          </div>
        </section>

        <section style={styles.positioningStrip}>
          <div style={styles.positioningItem}>
            <div style={styles.positioningEyebrow}>STARTER · $39</div>
            <div style={styles.positioningTitle}>
              {billing.starterPositioningTitle}
            </div>
            <div style={styles.positioningText}>
              {billing.starterPositioningText}
            </div>
          </div>

          <div style={styles.arrowBox}>→</div>

          <div style={{ ...styles.positioningItem, ...styles.positioningGrowth }}>
            <div style={styles.growthEyebrow}>GROWTH · $99</div>
            <div style={styles.positioningTitle}>
              {billing.growthPositioningTitle}
            </div>
            <div style={styles.positioningText}>
              {billing.growthPositioningText}
            </div>
          </div>
        </section>

        <section style={styles.plansGrid}>
          <article style={styles.starterCard}>
            <div style={styles.cardTop}>
              <div>
                <div style={styles.starterEyebrow}>STARTER</div>
                <h2 style={styles.planTitle}>Margin Intelligence</h2>
              </div>
              <div style={styles.liveBadge}>LIVE</div>
            </div>

            <div style={styles.priceRow}>
              <div style={styles.price}>$39</div>
              <div style={styles.priceMeta}>{billing.perMonth}</div>
            </div>

            <div style={styles.planPromise}>
              {billing.starterPromise}
            </div>

            <div style={styles.trialLine}>
              ✓ {billing.starterTrial}
            </div>

            <div style={styles.divider} />

            <div style={styles.sectionLabel}>
              {billing.coreMarginIntelligence}
            </div>

            <div style={styles.featureList}>
              {starterFeatures.map(([title, description]) => (
                <div key={title} style={styles.featureRow}>
                  <span style={styles.starterCheck}>✓</span>
                  <div>
                    <div style={styles.featureName}>{title}</div>
                    <div style={styles.featureDescription}>{description}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={styles.marketBox}>
              <div style={styles.marketBoxTitle}>
                {billing.realProfitTitle}
              </div>
              <div style={styles.marketBoxText}>
                {billing.realProfitText}
              </div>
            </div>

            {error ? (
              <div style={styles.errorBox}>
                <strong>{billing.billingError}</strong>
                <div style={{ marginTop: 5 }}>{String(error)}</div>
              </div>
            ) : null}

            {openShopifyPricing()}

            <button
              type="button"
              style={styles.previewBtn}
              onClick={() => navigate("/app")}
            >
              {billing.continuePreview}
            </button>
          </article>

          <article style={styles.growthCard}>
            <div style={styles.growthGlow} />

            <div style={styles.cardTop}>
              <div>
                <div style={styles.growthEyebrow}>GROWTH</div>
                <h2 style={styles.planTitle}>Advanced Intelligence</h2>
              </div>
              <div style={styles.recommendedBadge}>
                {billing.mostComplete}
              </div>
            </div>

            <div style={styles.priceRow}>
              <div style={styles.price}>$99</div>
              <div style={styles.priceMeta}>{billing.perMonth}</div>
            </div>

            <div style={styles.planPromise}>
              {billing.growthPromise}
            </div>

            <div style={styles.growthTrialLine}>
              ✓ {billing.growthTrial}
            </div>

            <div style={styles.divider} />

            <div style={styles.sectionLabel}>
              {billing.decisionRecoverySystem}
            </div>

            <div style={styles.featureList}>
              {growthFeatures.map(([title, description]) => (
                <div key={title} style={styles.featureRow}>
                  <span style={styles.growthCheck}>↗</span>
                  <div>
                    <div style={styles.featureName}>{title}</div>
                    <div style={styles.featureDescription}>{description}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={styles.growthValueBox}>
              <div style={styles.growthValueTitle}>
                {billing.growthValueTitle}
              </div>
              <div style={styles.growthValueText}>
                {billing.growthValueText}
              </div>
            </div>

            {openShopifyPricing()}

            <div style={styles.billingNote}>
              {billing.billingNote}
            </div>
          </article>
        </section>

        <section style={styles.compareSection}>
          <div style={styles.compareHeader}>
            <div>
              <div style={styles.compareEyebrow}>
                {billing.chooseInTenSeconds}
              </div>
              <h2 style={styles.compareTitle}>
                {billing.compareTitle}
              </h2>
            </div>

            <div style={styles.compareHint}>
              {billing.compareHint}
            </div>
          </div>

          <div style={styles.compareGrid}>
            {billing.compareRows.map(([label, starter, growth]) => (
              <React.Fragment key={String(label)}>
                <div style={styles.compareLabel}>{String(label)}</div>
                <div style={styles.compareStarter}>
                  {starter ? "✓" : "—"}
                </div>
                <div style={styles.compareGrowth}>
                  {growth ? "✓" : "—"}
                </div>
              </React.Fragment>
            ))}
          </div>

          <div style={styles.compareLegend}>
            <div style={styles.compareLegendSpacer} />
            <div style={styles.compareLegendStarter}>STARTER · $39</div>
            <div style={styles.compareLegendGrowth}>GROWTH · $99</div>
          </div>
        </section>

        <section style={styles.finalStrip}>
          <div>
            <div style={styles.finalTitle}>
              {billing.finalTitle}
            </div>
            <div style={styles.finalText}>
              {billing.finalText}
            </div>
          </div>

          <fetcher.Form method="post">
            <button
              type="submit"
              style={styles.finalBtn}
              disabled={isLoading}
            >
              {billing.viewPlansOnShopify}
            </button>
          </fetcher.Form>
        </section>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at 8% 0%, rgba(255,90,54,0.12), transparent 25%), radial-gradient(circle at 92% 15%, rgba(34,197,94,0.07), transparent 25%), linear-gradient(180deg, #03050a 0%, #070b12 100%)",
    color: "#f8fafc",
    fontFamily: "Inter, system-ui, sans-serif",
    padding: 28,
    position: "relative",
    overflow: "hidden",
  },
  glowOne: {
    position: "absolute",
    top: -180,
    left: -170,
    width: 440,
    height: 440,
    borderRadius: "50%",
    background: "rgba(255,90,54,0.08)",
    filter: "blur(80px)",
  },
  glowTwo: {
    position: "absolute",
    top: 280,
    right: -220,
    width: 500,
    height: 500,
    borderRadius: "50%",
    background: "rgba(34,197,94,0.055)",
    filter: "blur(90px)",
  },
  container: {
    maxWidth: 1380,
    margin: "0 auto",
    position: "relative",
    zIndex: 2,
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    padding: "13px 15px",
    borderRadius: 17,
    background: "rgba(8,13,22,0.92)",
    border: "1px solid rgba(255,115,60,0.18)",
  },
  logo: {
    fontWeight: 950,
    letterSpacing: 0.5,
  },
  topRight: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  shopifyPill: {
    padding: "8px 11px",
    borderRadius: 999,
    color: "rgba(255,255,255,0.52)",
    background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.06)",
    fontSize: 10,
    fontWeight: 850,
  },
  backBtn: {
    padding: "9px 13px",
    borderRadius: 11,
    color: "#f8fafc",
    background: "rgba(255,115,60,0.07)",
    border: "1px solid rgba(255,115,60,0.18)",
    cursor: "pointer",
    fontWeight: 850,
  },
  hero: {
    padding: "66px 22px 42px",
    textAlign: "center",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 999,
    color: "#ff9a70",
    background: "rgba(255,115,60,0.08)",
    border: "1px solid rgba(255,115,60,0.20)",
    fontSize: 10,
    fontWeight: 950,
    letterSpacing: "0.12em",
  },
  badgeDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#ff5a36",
    boxShadow: "0 0 12px rgba(255,90,54,0.8)",
  },
  heroTitle: {
    maxWidth: 900,
    margin: "18px auto 0",
    fontSize: 52,
    lineHeight: 1.02,
    letterSpacing: "-0.052em",
    fontWeight: 950,
  },
  heroText: {
    maxWidth: 820,
    margin: "18px auto 0",
    color: "rgba(255,255,255,0.62)",
    fontSize: 16,
    lineHeight: 1.7,
    fontWeight: 680,
  },
  heroPills: {
    display: "flex",
    justifyContent: "center",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 26,
  },
  heroPill: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 13px",
    borderRadius: 13,
    background: "rgba(255,255,255,0.028)",
    border: "1px solid rgba(255,255,255,0.065)",
    color: "rgba(255,255,255,0.58)",
    fontSize: 11,
    fontWeight: 800,
  },
  positioningStrip: {
    display: "grid",
    gridTemplateColumns: "1fr 54px 1fr",
    gap: 14,
    alignItems: "stretch",
    marginBottom: 18,
  },
  positioningItem: {
    padding: 20,
    borderRadius: 20,
    background: "linear-gradient(135deg, rgba(255,115,60,0.065), rgba(16,23,37,0.94))",
    border: "1px solid rgba(255,115,60,0.16)",
  },
  positioningGrowth: {
    background: "linear-gradient(135deg, rgba(34,197,94,0.065), rgba(16,23,37,0.94))",
    border: "1px solid rgba(34,197,94,0.16)",
  },
  positioningEyebrow: {
    color: "#ff9a70",
    fontSize: 10,
    fontWeight: 950,
    letterSpacing: "0.1em",
  },
  growthEyebrow: {
    color: "#4ade80",
    fontSize: 10,
    fontWeight: 950,
    letterSpacing: "0.1em",
  },
  positioningTitle: {
    marginTop: 7,
    fontSize: 20,
    fontWeight: 950,
    letterSpacing: "-0.025em",
  },
  positioningText: {
    marginTop: 6,
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    lineHeight: 1.55,
    fontWeight: 700,
  },
  arrowBox: {
    display: "grid",
    placeItems: "center",
    borderRadius: 18,
    color: "#ff9a70",
    background: "rgba(255,115,60,0.045)",
    border: "1px solid rgba(255,115,60,0.10)",
    fontSize: 22,
    fontWeight: 950,
  },
  plansGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 18,
    alignItems: "stretch",
  },
  starterCard: {
    padding: 30,
    borderRadius: 28,
    background:
      "radial-gradient(circle at top right, rgba(255,115,60,0.09), transparent 32%), linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))",
    border: "1px solid rgba(255,115,60,0.24)",
    boxShadow: "0 28px 80px rgba(0,0,0,0.28)",
  },
  growthCard: {
    position: "relative",
    overflow: "hidden",
    padding: 30,
    borderRadius: 28,
    background:
      "radial-gradient(circle at top right, rgba(34,197,94,0.11), transparent 34%), linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))",
    border: "1px solid rgba(34,197,94,0.26)",
    boxShadow: "0 28px 80px rgba(0,0,0,0.28)",
  },
  growthGlow: {
    position: "absolute",
    top: -150,
    right: -120,
    width: 330,
    height: 330,
    borderRadius: "50%",
    background: "rgba(34,197,94,0.08)",
    filter: "blur(65px)",
  },
  cardTop: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
    position: "relative",
    zIndex: 2,
  },
  starterEyebrow: {
    color: "#ff9a70",
    fontSize: 11,
    fontWeight: 950,
    letterSpacing: "0.12em",
  },
  planTitle: {
    margin: "7px 0 0",
    fontSize: 28,
    lineHeight: 1.1,
    fontWeight: 950,
    letterSpacing: "-0.035em",
  },
  liveBadge: {
    padding: "7px 10px",
    borderRadius: 999,
    color: "#ff9a70",
    background: "rgba(255,115,60,0.08)",
    border: "1px solid rgba(255,115,60,0.18)",
    fontSize: 9,
    fontWeight: 950,
  },
  recommendedBadge: {
    padding: "7px 10px",
    borderRadius: 999,
    color: "#86efac",
    background: "rgba(34,197,94,0.08)",
    border: "1px solid rgba(34,197,94,0.18)",
    fontSize: 9,
    fontWeight: 950,
  },
  priceRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: 9,
    marginTop: 26,
    position: "relative",
    zIndex: 2,
  },
  price: {
    fontSize: 62,
    lineHeight: 1,
    fontWeight: 950,
    letterSpacing: "-0.055em",
  },
  priceMeta: {
    marginBottom: 7,
    color: "rgba(255,255,255,0.46)",
    fontSize: 14,
    fontWeight: 800,
  },
  planPromise: {
    marginTop: 13,
    maxWidth: 520,
    color: "rgba(255,255,255,0.64)",
    fontSize: 13,
    lineHeight: 1.6,
    fontWeight: 720,
    position: "relative",
    zIndex: 2,
  },
  trialLine: {
    marginTop: 14,
    color: "#fdba9f",
    fontSize: 11,
    fontWeight: 850,
  },
  growthTrialLine: {
    marginTop: 14,
    color: "#86efac",
    fontSize: 11,
    fontWeight: 850,
    position: "relative",
    zIndex: 2,
  },
  divider: {
    height: 1,
    margin: "23px 0",
    background: "rgba(255,255,255,0.065)",
  },
  sectionLabel: {
    color: "rgba(255,255,255,0.38)",
    fontSize: 9,
    fontWeight: 950,
    letterSpacing: "0.12em",
  },
  featureList: {
    display: "grid",
    gap: 5,
    marginTop: 14,
    position: "relative",
    zIndex: 2,
  },
  featureRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 11,
    padding: "11px 0",
    borderBottom: "1px solid rgba(255,255,255,0.045)",
  },
  starterCheck: {
    width: 23,
    height: 23,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: "50%",
    color: "#ff9a70",
    background: "rgba(255,115,60,0.09)",
    border: "1px solid rgba(255,115,60,0.19)",
    fontSize: 11,
    fontWeight: 950,
  },
  growthCheck: {
    width: 23,
    height: 23,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: "50%",
    color: "#86efac",
    background: "rgba(34,197,94,0.09)",
    border: "1px solid rgba(34,197,94,0.19)",
    fontSize: 11,
    fontWeight: 950,
  },
  featureName: {
    color: "#f8fafc",
    fontSize: 12,
    fontWeight: 900,
  },
  featureDescription: {
    marginTop: 3,
    color: "rgba(255,255,255,0.42)",
    fontSize: 10,
    lineHeight: 1.5,
    fontWeight: 650,
  },
  marketBox: {
    marginTop: 20,
    padding: 16,
    borderRadius: 16,
    background: "rgba(56,189,248,0.045)",
    border: "1px solid rgba(56,189,248,0.12)",
  },
  marketBoxTitle: {
    color: "#7dd3fc",
    fontSize: 11,
    fontWeight: 950,
  },
  marketBoxText: {
    marginTop: 6,
    color: "rgba(255,255,255,0.48)",
    fontSize: 10,
    lineHeight: 1.55,
    fontWeight: 680,
  },
  growthValueBox: {
    marginTop: 20,
    padding: 16,
    borderRadius: 16,
    background: "rgba(34,197,94,0.05)",
    border: "1px solid rgba(34,197,94,0.14)",
    position: "relative",
    zIndex: 2,
  },
  growthValueTitle: {
    color: "#86efac",
    fontSize: 11,
    fontWeight: 950,
  },
  growthValueText: {
    marginTop: 6,
    color: "rgba(255,255,255,0.48)",
    fontSize: 10,
    lineHeight: 1.55,
    fontWeight: 680,
  },
  errorBox: {
    marginTop: 18,
    padding: 13,
    borderRadius: 14,
    color: "#fecaca",
    background: "rgba(239,68,68,0.07)",
    border: "1px solid rgba(239,68,68,0.20)",
    fontSize: 11,
    lineHeight: 1.5,
  },
  form: {
    marginTop: 22,
    position: "relative",
    zIndex: 2,
  },
  primaryBtn: {
    width: "100%",
    minHeight: 50,
    padding: "0 17px",
    borderRadius: 14,
    color: "#fff",
    background: "linear-gradient(135deg, #ff5a36, #ff7547)",
    border: "1px solid rgba(255,150,110,0.25)",
    boxShadow: "0 16px 38px rgba(255,90,54,0.18)",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 950,
  },
  previewBtn: {
    width: "100%",
    minHeight: 46,
    marginTop: 10,
    padding: "0 17px",
    borderRadius: 14,
    color: "#f8fafc",
    background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.07)",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 850,
  },
  billingNote: {
    marginTop: 11,
    color: "rgba(255,255,255,0.36)",
    textAlign: "center",
    fontSize: 10,
    lineHeight: 1.5,
    fontWeight: 700,
  },
  compareSection: {
    marginTop: 20,
    padding: 26,
    borderRadius: 25,
    background: "linear-gradient(180deg, rgba(16,23,37,0.96), rgba(7,12,21,0.98))",
    border: "1px solid rgba(255,115,60,0.15)",
  },
  compareHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 24,
    alignItems: "flex-end",
    flexWrap: "wrap",
  },
  compareEyebrow: {
    color: "#ff9a70",
    fontSize: 9,
    fontWeight: 950,
    letterSpacing: "0.12em",
  },
  compareTitle: {
    margin: "7px 0 0",
    fontSize: 24,
    fontWeight: 950,
    letterSpacing: "-0.03em",
  },
  compareHint: {
    maxWidth: 520,
    color: "rgba(255,255,255,0.43)",
    fontSize: 10,
    lineHeight: 1.55,
    fontWeight: 700,
  },
  compareLegend: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 120px 120px",
    gap: 8,
    marginTop: 20,
  },
  compareLegendSpacer: {},
  compareLegendStarter: {
    textAlign: "center",
    color: "#ff9a70",
    fontSize: 9,
    fontWeight: 950,
  },
  compareLegendGrowth: {
    textAlign: "center",
    color: "#86efac",
    fontSize: 9,
    fontWeight: 950,
  },
  compareGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 120px 120px",
    gap: 8,
    marginTop: 8,
  },
  compareLabel: {
    padding: "11px 13px",
    borderRadius: 11,
    color: "rgba(255,255,255,0.68)",
    background: "rgba(255,255,255,0.025)",
    fontSize: 11,
    fontWeight: 780,
  },
  compareStarter: {
    display: "grid",
    placeItems: "center",
    borderRadius: 11,
    color: "#ff9a70",
    background: "rgba(255,115,60,0.045)",
    fontWeight: 950,
  },
  compareGrowth: {
    display: "grid",
    placeItems: "center",
    borderRadius: 11,
    color: "#86efac",
    background: "rgba(34,197,94,0.045)",
    fontWeight: 950,
  },
  finalStrip: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 24,
    flexWrap: "wrap",
    marginTop: 20,
    padding: 23,
    borderRadius: 22,
    background:
      "linear-gradient(100deg, rgba(255,90,54,0.08), rgba(16,23,37,0.94) 45%, rgba(34,197,94,0.055))",
    border: "1px solid rgba(255,115,60,0.16)",
  },
  finalTitle: {
    fontSize: 17,
    fontWeight: 950,
  },
  finalText: {
    marginTop: 6,
    color: "rgba(255,255,255,0.43)",
    fontSize: 10,
    lineHeight: 1.55,
    fontWeight: 700,
  },
  finalBtn: {
    minHeight: 44,
    padding: "0 16px",
    borderRadius: 12,
    color: "#fff",
    background: "linear-gradient(135deg, #ff5a36, #ff7547)",
    border: "1px solid rgba(255,150,110,0.22)",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 950,
  },
};
