import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "~/shopify.server";

import dashboardStylesUrl from "~/styles/dashboard.css?url";


import { loadMarginDashboardData } from "~/utils/margin.server";
import DashboardNav from "~/components/dashboard/DashboardNav";

import { type LoaderData, money } from "~/utils/margin";
import { getStoredLanguage } from "~/utils/i18n";

export const links = () => [
  {
    rel: "stylesheet",
    href: dashboardStylesUrl,
  },
];

export const loader = async ({
  request,
}: {
  request: Request;
}): Promise<LoaderData> => {
  const url = new URL(request.url);
  const period = url.searchParams.get("period") || "30";

  const { admin, session } = await authenticate.admin(request);

  try {
    await admin.graphql(`query { shop { id } }`);
  } catch {
    throw new Response("Auth/scopes not ready. Reinstall the app.", {
      status: 401,
    });
  }

  return loadMarginDashboardData({
    admin,
    session,
    period,
  });
};

export default function RecommendationsPage() {
  const { summary, rows } = useLoaderData() as LoaderData;
  const navigate = useNavigate();
  const language = getStoredLanguage();

  const losingProducts = rows.filter((row) => row.losing);
  const lowMarginProducts = rows.filter((row) => row.lowMargin);
  const missingCostProducts = rows.filter((row) => row.missingCost);

  const visualLeak = Math.max(summary.totalLeak, 0);

  const totalDiscounts = summary.discounts || 0;
  const totalRefunds = summary.refunds || 0;

  const priorityActions = [
    losingProducts.length > 0
      ? {
          priority: "Critical",
          priorityLabel: language === "it" ? "Critica" : "Critical",
          title:
            language === "it"
              ? `Correggi ${losingProducts.length} prodotti venduti sotto costo`
              : `Fix ${losingProducts.length} products selling below cost`,
          impact:
            language === "it"
              ? `${money(visualLeak)} di recupero potenziale`
              : `${money(visualLeak)} potential recovery`,
          description:
            language === "it"
              ? "Questi prodotti generano un margine negativo e dovrebbero essere corretti prima di intervenire su crescita o ottimizzazione dei prezzi."
              : "These products are generating negative contribution margin and should be reviewed before any growth or pricing optimization work.",
          actionLabel:
            language === "it" ? "Controlla i prezzi" : "Review pricing",
          actionLink: "/app/products",
          color: "#ff6b4a",
        }
      : null,

    missingCostProducts.length > 0
      ? {
          priority: "High",
          priorityLabel: language === "it" ? "Alta" : "High",
          title:
            language === "it"
              ? "Completa i costi mancanti dei prodotti"
              : "Complete missing product cost data",
          impact:
            language === "it"
              ? `${missingCostProducts.length} prodotti interessati`
              : `${missingCostProducts.length} products affected`,
          description:
            language === "it"
              ? "I costi mancanti riducono l'affidabilità dei margini e possono nascondere rischi reali. Inserisci i costi prima di valutare la redditività."
              : "Missing costs reduce margin accuracy and can hide real product-level risk. Add cost data before trusting profitability signals.",
          actionLabel:
            language === "it" ? "Aggiorna i costi" : "Update costs",
          actionLink: "/app/products",
          color: "#f59e0b",
        }
      : null,

    totalDiscounts > 0
      ? {
          priority: "High",
          priorityLabel: language === "it" ? "Alta" : "High",
          title:
            language === "it"
              ? "Controlla l'impatto degli sconti sui profitti"
              : "Review discount impact on profitability",
          impact:
            language === "it"
              ? `${money(totalDiscounts)} di sconti applicati`
              : `${money(totalDiscounts)} discounted revenue`,
          description:
            language === "it"
              ? "Gli sconti stanno riducendo il margine effettivo. Verifica che le promozioni generino vendite aggiuntive sufficienti a compensare la perdita di margine."
              : "Discount activity is reducing realized margin. Verify that promotional campaigns are generating enough incremental revenue to justify margin erosion.",
          actionLabel:
            language === "it" ? "Analizza gli sconti" : "Review discounts",
          actionLink: "/app/profit-intelligence",
          color: "#f59e0b",
        }
      : null,

    totalRefunds > 0
      ? {
          priority: "High",
          priorityLabel: language === "it" ? "Alta" : "High",
          title:
            language === "it"
              ? "Analizza i ricavi rimborsati"
              : "Investigate refunded revenue",
          impact:
            language === "it"
              ? `${money(totalRefunds)} di rimborsi`
              : `${money(totalRefunds)} refunded revenue`,
          description:
            language === "it"
              ? "I rimborsi riducono direttamente i profitti e possono indicare problemi di qualità, evasione degli ordini o soddisfazione dei clienti."
              : "Refunds directly reduce profitability and may indicate product quality, fulfillment or customer satisfaction issues.",
          actionLabel:
            language === "it" ? "Analizza i rimborsi" : "Review refunds",
          actionLink: "/app/profit-intelligence",
          color: "#ff6b4a",
        }
      : null,

    lowMarginProducts.length > 0
      ? {
          priority: "Medium",
          priorityLabel: language === "it" ? "Media" : "Medium",
          title:
            language === "it"
              ? "Controlla i prodotti con margini bassi"
              : "Review low-margin product group",
          impact:
            language === "it"
              ? `${lowMarginProducts.length} prodotti da controllare`
              : `${lowMarginProducts.length} products need attention`,
          description:
            language === "it"
              ? "I prodotti a basso margine possono avere un ruolo strategico, ma devono essere monitorati perché su volumi elevati possono ridurre la qualità complessiva dei profitti."
              : "Low-margin products may be acceptable strategically, but they should be monitored because they can weaken profit quality at scale.",
          actionLabel:
            language === "it" ? "Analizza i prodotti" : "Analyze products",
          actionLink: "/app/products",
          color: "#f59e0b",
        }
      : null,

    rows.length > 0
      ? {
          priority: "Low",
          priorityLabel: language === "it" ? "Bassa" : "Low",
          title:
            language === "it"
              ? "Controlla i prezzi obiettivo dei prodotti più deboli"
              : "Review target prices for weak products",
          impact:
            language === "it"
              ? "Margine obiettivo del 20% disponibile"
              : "20% margin target available",
          description:
            language === "it"
              ? "Confronta i prezzi attuali con quelli consigliati per individuare opportunità realistiche di recupero del margine."
              : "Compare current prices against target margin recommendations to identify realistic recovery opportunities.",
          actionLabel:
            language === "it" ? "Controlla gli obiettivi" : "Review targets",
          actionLink: "/app/products",
          color: "#22c55e",
        }
      : null,
  ].filter(Boolean) as {
    priority: string;
    priorityLabel: string;
    title: string;
    impact: string;
    description: string;
    actionLabel: string;
    actionLink: string;
    color: string;
  }[];

  const criticalActions = priorityActions.filter(
    (action) => action.priority === "Critical",
  ).length;

  const highActions = priorityActions.filter(
    (action) => action.priority === "High",
  ).length;

  const actionScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(100 - criticalActions * 24 - highActions * 12),
    ),
  );

  const actionScoreColor =
    actionScore < 40 ? "#ff6b4a" : actionScore < 70 ? "#f59e0b" : "#22c55e";



  const heroMetrics = [
    {
      key: "totalActions",
      label: language === "it" ? "Azioni totali" : "Total actions",
      value: `${priorityActions.length}`,
    },
    {
      key: "criticalActions",
      label: language === "it" ? "Azioni critiche" : "Critical actions",
      value: `${criticalActions}`,
    },
    {
      key: "potentialRecovery",
      label: language === "it" ? "Recupero potenziale" : "Potential recovery",
      value: money(visualLeak),
    },
  ];

  const insights = [
    {
      key: "pricingRisk",
      title:
        language === "it"
          ? "Il rischio di prezzo è concentrato"
          : "Pricing risk is concentrated",
      value:
        language === "it"
          ? `${losingProducts.length} prodotti in perdita`
          : `${losingProducts.length} losing products`,
      text:
        losingProducts.length > 0
          ? language === "it"
            ? "Un numero limitato di prodotti venduti a un prezzo troppo basso potrebbe generare gran parte delle perdite di margine rilevate."
            : "A small number of underpriced products may be responsible for most detected profit leakage."
          : language === "it"
            ? "Nessun prodotto viene attualmente venduto sotto costo."
            : "No products are currently selling below cost.",
      color: "#ff6b4a",
    },
    {
      key: "costQuality",
      title:
        language === "it"
          ? "La qualità dei costi incide sull'analisi"
          : "Cost data quality affects accuracy",
      value:
        language === "it"
          ? `${missingCostProducts.length} costi mancanti`
          : `${missingCostProducts.length} missing costs`,
      text:
        missingCostProducts.length > 0
          ? language === "it"
            ? "I costi mancanti riducono l'affidabilità dell'analisi per prodotto e dovrebbero essere completati prima di procedere con valutazioni più approfondite."
            : "Missing cost data reduces confidence in product-level profitability and should be fixed before deeper analysis."
          : language === "it"
            ? "La copertura dei costi risulta completa nel periodo selezionato."
            : "Cost data coverage looks healthy for the current period.",
      color: "#f59e0b",
    },
    {
      key: "marginQuality",
      title:
        language === "it"
          ? "La qualità dei margini va monitorata"
          : "Margin quality needs monitoring",
      value:
        language === "it"
          ? `${lowMarginProducts.length} prodotti a basso margine`
          : `${lowMarginProducts.length} low-margin products`,
      text:
        lowMarginProducts.length > 0
          ? language === "it"
            ? "I prodotti a basso margine possono essere strategici, ma su volumi elevati rischiano di indebolire la redditività complessiva del negozio."
            : "Low-margin products may be strategic, but they can weaken store profit quality when they scale."
          : language === "it"
            ? "Non sono stati rilevati gruppi rilevanti di prodotti a basso margine."
            : "No major low-margin product group detected.",
      color: "#22c55e",
    },
  ];
    return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardNav active="recommendations" navigate={navigate} />

        <div className="hero-header">
          <div>
            <div className="eyebrow">
              {language === "it" ? "RACCOMANDAZIONI AI" : "AI RECOMMENDATIONS"}
            </div>

            <div className="hero-title">
              {language === "it"
                ? "Centro operativo per migliorare i margini"
                : "Optimization Action Center"}
            </div>

            <div className="hero-description">
              {language === "it"
                ? "Consulta le azioni prioritarie sui margini, i costi mancanti da completare e le opportunità di prezzo individuate nel tuo negozio Shopify."
                : "Review prioritized margin actions, missing cost fixes and pricing opportunities detected across your Shopify store."}
            </div>
          </div>
        </div>

        <div className="hero-score-card" style={{ marginBottom: 28 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.1fr 1fr",
              gap: 28,
              alignItems: "stretch",
            }}
          >
            <div>
              <div className="eyebrow">
                {language === "it"
                  ? "INDICE DI PRIORITÀ DELLE AZIONI"
                  : "ACTION PRIORITY SCORE"}
              </div>

              <div
                style={{
                  fontSize: 82,
                  fontWeight: 950,
                  lineHeight: 1,
                  marginTop: 14,
                  color: "#f3f4f6",
                  letterSpacing: "-3px",
                }}
              >
                {actionScore}
                <span style={{ fontSize: 34, opacity: 0.45 }}>/100</span>
              </div>

              <div
                style={{
                  marginTop: 18,
                  fontSize: 24,
                  fontWeight: 900,
                  color: actionScoreColor,
                }}
              >
                {criticalActions > 0
                  ? language === "it"
                    ? "Sono richieste azioni urgenti"
                    : "Critical actions required"
                  : highActions > 0
                    ? language === "it"
                      ? "Rilevate azioni ad alta priorità"
                      : "High-priority actions detected"
                    : language === "it"
                      ? "Situazione sotto controllo"
                      : "Action queue stable"}
              </div>

              <p
                style={{
                  marginTop: 14,
                  color: "rgba(255,255,255,0.66)",
                  maxWidth: 620,
                  lineHeight: 1.7,
                  fontSize: 15,
                }}
              >
                {language === "it"
                  ? "MarginLab trasforma i rischi dei prodotti, i costi mancanti e i segnali di margine debole in una sequenza di interventi ordinata per priorità."
                  : "MarginLab converts product risk, missing cost data and weak margin signals into a prioritized action queue."}
              </p>

              <div
                style={{
                  marginTop: 28,
                  paddingTop: 22,
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 18,
                }}
              >
                {heroMetrics.map((item) => (
                  <div key={item.key}>
                    <div
                      style={{
                        fontSize: 34,
                        fontWeight: 950,
                        color: "#f3f4f6",
                        lineHeight: 1,
                      }}
                    >
                      {item.value}
                    </div>

                    <div
                      style={{
                        marginTop: 9,
                        fontSize: 11,
                        fontWeight: 900,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "rgba(255,255,255,0.42)",
                      }}
                    >
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                borderRadius: 28,
                border: "1px solid rgba(255,255,255,0.08)",
                background:
                  "radial-gradient(circle at 50% 35%, rgba(255,90,54,0.20), transparent 28%), linear-gradient(180deg, rgba(16,22,35,0.96), rgba(7,11,20,0.96))",
                padding: 32,
                boxShadow: "0 24px 80px rgba(0,0,0,0.42)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 260,
              }}
            >
              <div
                style={{
                  width: 170,
                  height: 170,
                  borderRadius: "50%",
                  border: "16px solid rgba(255,255,255,0.08)",
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: `0 0 46px ${actionScoreColor}44`,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: -16,
                    borderRadius: "50%",
                    background: `conic-gradient(${actionScoreColor} ${actionScore * 3.6
                      }deg, transparent 0deg)`,
                    mask:
                      "radial-gradient(circle, transparent 58%, black 59%)",
                    WebkitMask:
                      "radial-gradient(circle, transparent 58%, black 59%)",
                  }}
                />

                <div style={{ textAlign: "center", position: "relative" }}>
                  <div
                    style={{
                      fontSize: 44,
                      fontWeight: 950,
                      color: "#f3f4f6",
                      lineHeight: 1,
                    }}
                  >
                    {actionScore}
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      fontWeight: 900,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: actionScoreColor,
                    }}
                  >
                    {language === "it" ? "Indice azioni" : "Action score"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="panel" style={{ marginBottom: 28 }}>
          <div className="panel-header">
            <div>
              <div className="panel-eyebrow">
                {language === "it" ? "AZIONI PRIORITARIE" : "PRIORITY QUEUE"}
              </div>
              <h2 className="panel-title">
                {language === "it"
                  ? "Sequenza di interventi consigliata"
                  : "Recommended action sequence"}
              </h2>
            </div>
          </div>

          <div style={{ display: "grid", gap: 16, marginTop: 24 }}>
            {priorityActions.map((action, index) => (
              <div
                key={action.title}
                style={{
                  display: "grid",
                  gridTemplateColumns: "54px 1fr auto",
                  gap: 18,
                  alignItems: "center",
                  padding: 22,
                  borderRadius: 22,
                  background:
                    "linear-gradient(180deg, rgba(16,22,35,0.96), rgba(9,13,22,0.96))",
                  border: "1px solid rgba(255,255,255,0.07)",
                  boxShadow: "0 18px 46px rgba(0,0,0,0.32)",
                }}
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 16,
                    background: `${action.color}18`,
                    color: action.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 950,
                    fontSize: 20,
                  }}
                >
                  {index + 1}
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 900,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: action.color,
                    }}
                  >
                    {language === "it"
                      ? `Priorità ${action.priorityLabel.toLowerCase()}`
                      : `${action.priorityLabel} priority`}
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 22,
                      fontWeight: 950,
                      color: "#f3f4f6",
                    }}
                  >
                    {action.title}
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      color: "rgba(255,255,255,0.62)",
                      lineHeight: 1.6,
                      maxWidth: 900,
                    }}
                  >
                    {action.description}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 950,
                      color: action.color,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {action.impact}
                  </div>

                  <button
                    type="button"
                    className="apply-button"
                    style={{ marginTop: 14 }}
                    onClick={() => navigate(action.actionLink)}
                  >
                    {action.actionLabel} →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel" style={{ marginBottom: 28 }}>
          <div className="panel-header">
            <div>
              <div className="panel-eyebrow">
                {language === "it" ? "ANALISI AI" : "AI INSIGHTS"}
              </div>
              <h2 className="panel-title">
                {language === "it"
                  ? "Perché queste azioni sono importanti"
                  : "Why these actions matter"}
              </h2>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 18,
              marginTop: 24,
            }}
          >
            {insights.map((insight) => (
              <div
                key={insight.key}
                style={{
                  position: "relative",
                  overflow: "hidden",
                  borderRadius: 22,
                  padding: 22,
                  background:
                    "linear-gradient(180deg, rgba(16,22,35,0.96), rgba(9,13,22,0.96))",
                  border: "1px solid rgba(255,255,255,0.07)",
                  boxShadow: "0 18px 46px rgba(0,0,0,0.32)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: `radial-gradient(circle at top right, ${insight.color}22, transparent 42%)`,
                    pointerEvents: "none",
                  }}
                />

                <div
                  style={{
                    position: "relative",
                    fontSize: 12,
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.48)",
                  }}
                >
                  {insight.title}
                </div>

                <div
                  style={{
                    position: "relative",
                    marginTop: 14,
                    fontSize: 28,
                    fontWeight: 950,
                    color: insight.color,
                  }}
                >
                  {insight.value}
                </div>

                <div
                  style={{
                    position: "relative",
                    marginTop: 12,
                    color: "rgba(255,255,255,0.66)",
                    lineHeight: 1.65,
                  }}
                >
                  {insight.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}