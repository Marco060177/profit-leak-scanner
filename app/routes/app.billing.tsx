// app/routes/app.billing.tsx
import * as React from "react";
import { useFetcher, useNavigate } from "react-router";
import { authenticate } from "~/shopify.server";
import { getStoredLanguage } from "~/utils/i18n";

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
  const language = getStoredLanguage();
  const isIt = language === "it";

  React.useEffect(() => {
    const data = fetcher.data as any;

    if (data?.ok && data?.redirectUrl) {
      (window.top ?? window).location.href = data.redirectUrl;
    }
  }, [fetcher.data]);

  const data = fetcher.data as any;
  const error = data && data.ok === false ? data.error : null;
  const isLoading = fetcher.state !== "idle";

  const starterFeatures = isIt
    ? [
        ["Profit Leak Dashboard", "Una vista immediata su dove il profitto si sta indebolendo e quali aree richiedono attenzione."],
        ["Product Risk Analysis", "Individua prodotti critici, margini deboli, costi mancanti e gap di prezzo prima che diventino problemi più grandi."],
        ["Profit Intelligence", "Capisci cosa sta comprimendo la redditività: concentrazione, sconti, rimborsi, shipping e qualità del margine."],
        ["Tax-Aware Profit Engine", "Calcola profitto e margini considerando IVA, GST e Sales Tax, con valori lordi/netti e imposte recuperabili quando applicabile."],
        ["CSV + PDF export", "Esporta analisi e report pronti da condividere, archiviare o usare nelle tue decisioni operative."],
        ["Product email alerts", "MarginLab continua a monitorare lo store e ti avvisa quando viene venduto un prodotto con problemi di redditività."],
        ["Weekly Profit Report", "Ricevi ogni settimana un riepilogo di performance, rischi e segnali da controllare, anche senza aprire l’app."],
        ["Email support", "Contatta direttamente MarginLab dall’app quando hai bisogno di chiarimenti o supporto."],
      ]
    : [
        ["Profit Leak Dashboard", "See where profit is weakening and which areas deserve attention first."],
        ["Product Risk Analysis", "Detect critical products, weak margins, missing costs and pricing gaps before they become bigger problems."],
        ["Profit Intelligence", "Understand what is compressing profitability across concentration, discounts, refunds, shipping and margin quality."],
        ["Tax-Aware Profit Engine", "Calculate profit and margins with VAT, GST and Sales Tax effects, including gross/net values and recoverable input tax where applicable."],
        ["CSV + PDF export", "Export analysis and share-ready reports for review, archiving and operational decisions."],
        ["Product email alerts", "MarginLab keeps monitoring the store and notifies you when a problematic product is sold."],
        ["Weekly Profit Report", "Receive a weekly profitability summary with performance, risks and signals to review, even when you do not open the app."],
        ["Email support", "Contact MarginLab directly from inside the app whenever you need product help or clarification."],
      ];

  const growthFeatures = isIt
    ? [
        ["Profit Action Center", "Trasforma i segnali di redditività in un piano ordinato per impatto, urgenza e priorità."],
        ["Alert Center", "Centralizza i segnali che richiedono attenzione e gestiscili fino alla risoluzione."],
        ["AI Advisor Pro", "Interroga i dati reali dello store per capire rischi, priorità e decisioni con maggiore contesto."],
        ["Recovery Simulator V2", "Prova modifiche a prezzi, costi e vendite e misura l’impatto economico prima di applicarle allo store."],
        ["Profit Forecast V2", "Proietta il profitto nei mesi successivi e confronta scenari prima di prendere decisioni di crescita."],
        ["Business Model Studio", "Porta nell’analisi costi operativi, commissioni e riserve per stimare profitto netto e break-even."],
        ["Advanced recommendations", "Ricevi indicazioni operative più profonde su dove intervenire e quale impatto valutare per primo."],
        ["WhatsApp direct support", "Accedi a un canale diretto con MarginLab quando vuoi chiarire rapidamente un dubbio sull’app o sulle analisi."],
      ]
    : [
        ["Profit Action Center", "Turn profitability signals into a plan ranked by impact, urgency and priority."],
        ["Alert Center", "Centralize the signals that need attention and manage them through resolution."],
        ["AI Advisor Pro", "Question your real store data to understand risks, priorities and decisions with more context."],
        ["Recovery Simulator V2", "Test price, cost and sales changes and measure economic impact before applying them to your store."],
        ["Profit Forecast V2", "Project profit over the coming months and compare scenarios before making growth decisions."],
        ["Business Model Studio", "Bring operating costs, fees and reserves into the model to estimate net profit and break-even."],
        ["Advanced recommendations", "Get deeper operational guidance on where to act and which modeled impact to evaluate first."],
        ["WhatsApp direct support", "Use a direct MarginLab support channel when you want quick clarification on the app or its analysis."],
      ];

  const openShopifyPricing = () => (
    <fetcher.Form method="post" style={styles.form}>
      <button
        type="submit"
        style={styles.primaryBtn}
        disabled={isLoading}
      >
        {isLoading
          ? isIt
            ? "Apertura dei piani Shopify..."
            : "Opening Shopify plans..."
          : isIt
            ? "Scegli questo piano su Shopify →"
            : "Choose this plan on Shopify →"}
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
              {isIt ? "Pagamento gestito da Shopify" : "Billing managed by Shopify"}
            </div>

            <button
              type="button"
              style={styles.backBtn}
              onClick={() => navigate("/app")}
            >
              {isIt ? "Torna alla dashboard" : "Back to dashboard"}
            </button>
          </div>
        </div>

        <section style={styles.hero}>
          <div style={styles.badge}>
            <span style={styles.badgeDot} />
            MARGINLAB PLANS
          </div>

          <h1 style={styles.heroTitle}>
            {isIt
              ? "Capisci il profitto reale. Poi decidi come migliorarlo."
              : "Understand your real profit. Then decide how to improve it."}
          </h1>

          <p style={styles.heroText}>
            {isIt
              ? "Starter ti mostra cosa sta succedendo davvero alla redditività dello store. Growth aggiunge priorità, simulazione, forecasting e AI per trasformare quei segnali in decisioni operative."
              : "Starter shows what is really happening to store profitability. Growth adds prioritization, simulation, forecasting and AI to turn those signals into operational decisions."}
          </p>

          <div style={styles.heroPills}>
            <div style={styles.heroPill}>
              <strong>14</strong>
              <span>{isIt ? "giorni di prova gratuita" : "day free trial"}</span>
            </div>
            <div style={styles.heroPill}>
              <strong>10</strong>
              <span>{isIt ? "mercati tax-aware supportati" : "supported tax-aware markets"}</span>
            </div>
            <div style={styles.heroPill}>
              <strong>2</strong>
              <span>{isIt ? "piani, un'unica fonte dati" : "plans, one data foundation"}</span>
            </div>
          </div>
        </section>

        <section style={styles.positioningStrip}>
          <div style={styles.positioningItem}>
            <div style={styles.positioningEyebrow}>STARTER · $39</div>
            <div style={styles.positioningTitle}>
              {isIt ? "Capisci il tuo vero profitto." : "Understand your real profit."}
            </div>
            <div style={styles.positioningText}>
              {isIt
                ? "Per merchant che vogliono andare oltre Revenue − COGS e capire margini, rischi e redditività economica con chiarezza."
                : "For merchants who want to go beyond Revenue − COGS and clearly understand margins, risks and real store economics."}
            </div>
          </div>

          <div style={styles.arrowBox}>→</div>

          <div style={{ ...styles.positioningItem, ...styles.positioningGrowth }}>
            <div style={styles.growthEyebrow}>GROWTH · $99</div>
            <div style={styles.positioningTitle}>
              {isIt ? "Decidi come migliorarlo." : "Decide how to improve it."}
            </div>
            <div style={styles.positioningText}>
              {isIt
                ? "Per merchant che vogliono sapere cosa fare prima, simulare l’impatto e prevedere dove può andare il profitto."
                : "For merchants who want to know what to do first, simulate impact and forecast where profit can go."}
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
              <div style={styles.priceMeta}>{isIt ? "/ mese" : "/ month"}</div>
            </div>

            <div style={styles.planPromise}>
              {isIt
                ? "Una base completa per capire dove nasce, dove si perde e quanto vale davvero il profitto del tuo store."
                : "A complete foundation for understanding where store profit comes from, where it leaks and what it is really worth."}
            </div>

            <div style={styles.trialLine}>
              ✓ {isIt ? "14 giorni gratis · annulla tramite Shopify" : "14 days free · cancel through Shopify"}
            </div>

            <div style={styles.divider} />

            <div style={styles.sectionLabel}>
              {isIt ? "CORE MARGIN INTELLIGENCE" : "CORE MARGIN INTELLIGENCE"}
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
                {isIt ? "Profitto reale, non solo Revenue − COGS" : "Profitto reale, non solo Revenue − COGS"}
              </div>
              <div style={styles.marketBoxText}>
                {isIt
                  ? "MarginLab integra IVA, GST e Sales Tax direttamente nell’analisi economica. Usa i dati fiscali reali Shopify quando disponibili, distingue valori lordi e netti e considera la recuperabilità dell’imposta nei profili supportati, per mostrare margini e profitti più vicini alla reale economia dello store."
                  : "MarginLab brings VAT, GST and Sales Tax directly into economic analysis. It uses actual Shopify tax data whenever available, separates gross and net values and accounts for recoverable input tax in supported profiles, so margins and profit better reflect real store economics."}
              </div>
            </div>

            {error ? (
              <div style={styles.errorBox}>
                <strong>{isIt ? "Errore di fatturazione" : "Billing error"}</strong>
                <div style={{ marginTop: 5 }}>{String(error)}</div>
              </div>
            ) : null}

            {openShopifyPricing()}

            <button
              type="button"
              style={styles.previewBtn}
              onClick={() => navigate("/app")}
            >
              {isIt ? "Continua in modalità anteprima" : "Continue in preview mode"}
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
                {isIt ? "PIÙ COMPLETO" : "MOST COMPLETE"}
              </div>
            </div>

            <div style={styles.priceRow}>
              <div style={styles.price}>$99</div>
              <div style={styles.priceMeta}>{isIt ? "/ mese" : "/ month"}</div>
            </div>

            <div style={styles.planPromise}>
              {isIt
                ? "Dall’analisi alla decisione: scopri cosa conta di più, simula prima di agire e misura dove intervenire."
                : "From analysis to decision: see what matters most, simulate before acting and focus on the changes with the greatest potential impact."}
            </div>

            <div style={styles.growthTrialLine}>
              ✓ {isIt ? "Include tutto Starter + strumenti avanzati" : "Everything in Starter + advanced tools"}
            </div>

            <div style={styles.divider} />

            <div style={styles.sectionLabel}>
              {isIt ? "DECISION & RECOVERY SYSTEM" : "DECISION & RECOVERY SYSTEM"}
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
                {isIt ? "Non limitarti a vedere il problema. Decidi cosa fare." : "Do not stop at seeing the problem. Decide what to do next."}
              </div>
              <div style={styles.growthValueText}>
                {isIt
                  ? "Growth collega segnali, priorità, simulazioni, forecasting e AI per aiutarti a scegliere quale intervento valutare prima e con quale impatto potenziale."
                  : "Growth connects signals, priorities, simulations, forecasting and AI to help you decide which intervention to evaluate first and what impact it could have."}
              </div>
            </div>

            {openShopifyPricing()}

            <div style={styles.billingNote}>
              {isIt
                ? "Attivazione, upgrade e cancellazione sono gestiti direttamente da Shopify."
                : "Activation, upgrades and cancellation are managed directly through Shopify."}
            </div>
          </article>
        </section>

        <section style={styles.compareSection}>
          <div style={styles.compareHeader}>
            <div>
              <div style={styles.compareEyebrow}>
                {isIt ? "SCEGLI IN 10 SECONDI" : "CHOOSE IN 10 SECONDS"}
              </div>
              <h2 style={styles.compareTitle}>
                {isIt ? "Quale piano è giusto per te?" : "Which plan is right for you?"}
              </h2>
            </div>

            <div style={styles.compareHint}>
              {isIt
                ? "Starter ti aiuta a capire e monitorare la redditività. Growth aggiunge gli strumenti per prioritizzare, simulare, prevedere e decidere."
                : "Starter helps you understand and monitor profitability. Growth adds the tools to prioritize, simulate, forecast and decide."}
            </div>
          </div>

          <div style={styles.compareGrid}>
            {[
              [
                isIt ? "Capire dove il profitto si sta indebolendo" : "Understand where profit is weakening",
                true,
                true,
              ],
              [
                isIt ? "Analizzare prodotti, margini e rischi" : "Analyze products, margins and risks",
                true,
                true,
              ],
              [
                isIt ? "Profitto tax-aware oltre Revenue − COGS" : "Profitto tax-aware oltre Revenue − COGS",
                true,
                true,
              ],
              [
                isIt ? "Monitoraggio continuo, report, alert ed export" : "Continuous monitoring, reports, alerts and exports",
                true,
                true,
              ],
              [
                isIt ? "Simulare l’impatto prima di cambiare prezzi o costi" : "Simulate impact before changing prices or costs",
                false,
                true,
              ],
              [
                isIt ? "Prevedere dove può andare il profitto" : "Forecast where profit can go",
                false,
                true,
              ],
              [
                isIt ? "Capire cosa fare prima con AI e priorità operative" : "Know what to do first with AI and operational priorities",
                false,
                true,
              ],
              [
                isIt ? "Gestire segnali attivi + supporto diretto WhatsApp" : "Manage active signals + direct WhatsApp support",
                false,
                true,
              ],
            ].map(([label, starter, growth]) => (
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
              {isIt
                ? "Parti da una lettura credibile del profitto. Passa alle decisioni quando sei pronto."
                : "Start with a credible view of profit. Move to decisions when you are ready."}
            </div>
            <div style={styles.finalText}>
              {isIt
                ? "14 giorni di prova gratuita. Nessun pagamento gestito da MarginLab: l'abbonamento resta sotto il controllo di Shopify."
                : "14-day free trial. MarginLab does not handle your payment directly: your subscription remains managed by Shopify."}
            </div>
          </div>

          <fetcher.Form method="post">
            <button
              type="submit"
              style={styles.finalBtn}
              disabled={isLoading}
            >
              {isIt ? "Vedi i piani su Shopify →" : "View plans on Shopify →"}
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