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
      <div style={styles.card}>
        <div style={styles.badge}>PRO PLAN</div>

        <h1 style={styles.title}>Unlock Profit Leak Pro</h1>

        <p style={styles.subtitle}>
          Get full pricing analysis, identify products selling below cost, and unlock clearer
          pricing recommendations.
        </p>

        <div style={styles.priceRow}>
          <div style={styles.price}>$29</div>
          <div style={styles.priceMeta}>per month</div>
        </div>

        <div style={styles.note}>14-day free trial. Cancel anytime.</div>

        <div style={styles.featureBox}>
          <div style={styles.featureTitle}>What’s included</div>

          <ul style={styles.featureList}>
            <li style={styles.featureItem}>Full profit and margin analysis</li>
            <li style={styles.featureItem}>Target price and price delta suggestions</li>
            <li style={styles.featureItem}>Detection of products selling below cost</li>
            <li style={styles.featureItem}>Missing cost alerts and faster issue discovery</li>
          </ul>
        </div>

        {error ? (
          <div style={styles.errorBox}>
            <div style={styles.errorTitle}>Billing error</div>
            <div style={styles.errorText}>{String(error)}</div>
          </div>
        ) : null}

        <fetcher.Form method="post" style={styles.form}>
          <button type="submit" style={styles.primaryBtn} disabled={isLoading}>
            {isLoading ? "Opening Shopify..." : "Activate Pro"}
          </button>
        </fetcher.Form>

        <button type="button" style={styles.secondaryBtn} onClick={() => navigate("/app")}>
          Back to dashboard
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100%",
    padding: 24,
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    background: "linear-gradient(180deg, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0) 100%)",
  },
  card: {
    width: "100%",
    maxWidth: 720,
    background: "#fff",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 20,
    padding: 28,
    boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
  },
  badge: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(5, 150, 105, 0.10)",
    color: "#047857",
    border: "1px solid rgba(5, 150, 105, 0.18)",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.3,
  },
  title: {
    marginTop: 14,
    marginBottom: 8,
    fontSize: 30,
    lineHeight: 1.1,
    fontWeight: 900,
    letterSpacing: -0.4,
  },
  subtitle: {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.6,
    color: "rgba(0,0,0,0.72)",
    maxWidth: 620,
  },
  priceRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: 10,
    marginTop: 24,
  },
  price: {
    fontSize: 44,
    lineHeight: 1,
    fontWeight: 900,
    letterSpacing: -1,
  },
  priceMeta: {
    fontSize: 15,
    opacity: 0.72,
    marginBottom: 4,
  },
  note: {
    marginTop: 6,
    fontSize: 13,
    opacity: 0.65,
  },
  featureBox: {
    marginTop: 24,
    padding: 18,
    borderRadius: 16,
    border: "1px solid rgba(0,0,0,0.06)",
    background: "rgba(0,0,0,0.02)",
  },
  featureTitle: {
    fontWeight: 800,
    marginBottom: 10,
  },
  featureList: {
    margin: 0,
    paddingLeft: 18,
  },
  featureItem: {
    marginBottom: 8,
    lineHeight: 1.5,
  },
  errorBox: {
    marginTop: 18,
    padding: 14,
    borderRadius: 14,
    border: "1px solid rgba(220, 38, 38, 0.28)",
    background: "rgba(220, 38, 38, 0.06)",
  },
  errorTitle: {
    fontWeight: 800,
    color: "#b91c1c",
  },
  errorText: {
    marginTop: 4,
    color: "#7f1d1d",
    lineHeight: 1.5,
  },
  form: {
    marginTop: 24,
  },
  primaryBtn: {
    width: "100%",
    padding: "13px 16px",
    borderRadius: 12,
    border: "1px solid #111827",
    background: "#111827",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 15,
  },
  secondaryBtn: {
    width: "100%",
    marginTop: 10,
    padding: "12px 16px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "#fff",
    color: "#111827",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 14,
  },
};