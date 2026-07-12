import * as React from "react";
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

type ActionPriority = "Critical" | "High" | "Medium" | "Low";
type TimelineBucket = "today" | "tomorrow" | "week" | "later";

type ProfitAction = {
  id: string;
  priority: ActionPriority;
  priorityLabel: string;
  title: string;
  shortTitle: string;
  description: string;
  impactValue: number;
  impactText: string;
  actionLabel: string;
  actionLink: string;
  color: string;
  minutes: number;
  confidence: number;
  difficulty: string;
  timeline: TimelineBucket;
  category: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function compactMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number.isFinite(value) ? value : 0);
}

function ActionMetric({
  label,
  value,
  note,
  highlight,
}: {
  label: string;
  value: string;
  note: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        minWidth: 0,
        borderRadius: 20,
        padding: 20,
        background: highlight
          ? "radial-gradient(circle at top left, rgba(34,197,94,0.16), transparent 42%), linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))"
          : "linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))",
        border: highlight
          ? "1px solid rgba(34,197,94,0.30)"
          : "1px solid rgba(255,115,60,0.16)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 950,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: highlight ? "#4ade80" : "rgba(255,255,255,0.46)",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 12,
          fontSize: 30,
          fontWeight: 950,
          lineHeight: 1,
          letterSpacing: "-0.04em",
          color: highlight ? "#22c55e" : "#f8fafc",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </div>

      <div
        style={{
          marginTop: 9,
          color: "rgba(255,255,255,0.56)",
          fontSize: 12,
          fontWeight: 750,
          lineHeight: 1.45,
        }}
      >
        {note}
      </div>
    </div>
  );
}

function TinyBadge({
  children,
  color,
}: {
  children: React.ReactNode;
  color: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 28,
        padding: "6px 9px",
        borderRadius: 999,
        background: `${color}16`,
        border: `1px solid ${color}36`,
        color,
        fontSize: 10,
        fontWeight: 950,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export default function RecommendationsPage() {
  const { summary, rows } = useLoaderData() as LoaderData;
  const navigate = useNavigate();
  const language = getStoredLanguage();

  const losingProducts = rows.filter((row) => row.losing);
  const lowMarginProducts = rows.filter((row) => row.lowMargin);
  const missingCostProducts = rows.filter((row) => row.missingCost);

  const totalLeak = Math.max(summary.totalLeak || 0, 0);
  const totalDiscounts = Math.max(summary.discounts || 0, 0);
  const totalRefunds = Math.max(summary.refunds || 0, 0);

  const targetRecovery = rows.reduce(
    (sum, row) => sum + Math.max(0, row.targetDelta || 0) * (row.qty || 0),
    0,
  );

  const lowMarginOpportunity = lowMarginProducts.reduce((sum, row) => {
    const targetPrice = Math.max(row.targetPrice || 0, row.avgPrice || 0);
    const delta = Math.max(0, targetPrice - (row.avgPrice || 0));
    return sum + delta * (row.qty || 0);
  }, 0);

  const pricingOpportunity = Math.max(totalLeak, targetRecovery, 0);
  const discountOpportunity = totalDiscounts * 0.35;
  const refundOpportunity = totalRefunds * 0.25;
  const missingCostOpportunity =
    missingCostProducts.length > 0
      ? Math.max(summary.profit * 0.02, 0)
      : 0;
  const lowMarginRecovery = Math.max(lowMarginOpportunity, pricingOpportunity * 0.2);

  const priorityActions = [
    losingProducts.length > 0
      ? {
          id: "losing-products",
          priority: "Critical" as const,
          priorityLabel: language === "it" ? "Critica" : "Critical",
          title:
            language === "it"
              ? `Correggi prima ${losingProducts.length} prodotti venduti sotto costo`
              : `Fix ${losingProducts.length} products selling below cost first`,
          shortTitle:
            language === "it"
              ? "Correggi i prodotti in perdita"
              : "Fix losing products",
          description:
            language === "it"
              ? "Questi prodotti stanno assorbendo profitto reale. Intervenire su prezzo, costo o assortimento produce il ritorno più rapido dell'intero piano."
              : "These products are consuming real profit. Fixing price, cost or assortment creates the fastest return across the entire plan.",
          impactValue: pricingOpportunity,
          impactText:
            language === "it"
              ? `${money(pricingOpportunity)} di recupero stimato`
              : `${money(pricingOpportunity)} estimated recovery`,
          actionLabel:
            language === "it" ? "Apri i prodotti" : "Open products",
          actionLink: "/app/products",
          color: "#ff6b4a",
          minutes: 12,
          confidence: 96,
          difficulty: language === "it" ? "Media" : "Medium",
          timeline: "today" as const,
          category: language === "it" ? "Prezzi" : "Pricing",
        }
      : null,

    missingCostProducts.length > 0
      ? {
          id: "missing-costs",
          priority: "High" as const,
          priorityLabel: language === "it" ? "Alta" : "High",
          title:
            language === "it"
              ? `Completa i costi mancanti di ${missingCostProducts.length} prodotti`
              : `Complete missing costs for ${missingCostProducts.length} products`,
          shortTitle:
            language === "it"
              ? "Completa i costi mancanti"
              : "Complete missing costs",
          description:
            language === "it"
              ? "I costi mancanti riducono l'affidabilità delle analisi e possono nascondere prodotti realmente non profittevoli."
              : "Missing costs reduce analytical confidence and can hide products that are actually unprofitable.",
          impactValue: missingCostOpportunity,
          impactText:
            language === "it"
              ? `${missingCostProducts.length} prodotti da aggiornare`
              : `${missingCostProducts.length} products to update`,
          actionLabel:
            language === "it" ? "Aggiorna i costi" : "Update costs",
          actionLink: "/app/products",
          color: "#f59e0b",
          minutes: 5,
          confidence: 99,
          difficulty: language === "it" ? "Facile" : "Easy",
          timeline: "today" as const,
          category: language === "it" ? "Qualità dati" : "Data quality",
        }
      : null,

    totalDiscounts > 0
      ? {
          id: "discounts",
          priority: "High" as const,
          priorityLabel: language === "it" ? "Alta" : "High",
          title:
            language === "it"
              ? "Riduci gli sconti che non generano crescita sufficiente"
              : "Reduce discounts that do not generate enough growth",
          shortTitle:
            language === "it"
              ? "Rivedi la strategia sconti"
              : "Review discount strategy",
          description:
            language === "it"
              ? "Gli sconti stanno erodendo il margine realizzato. Mantieni solo le promozioni che producono volume aggiuntivo sufficiente."
              : "Discounting is eroding realized margin. Keep only promotions that generate enough incremental volume.",
          impactValue: discountOpportunity,
          impactText:
            language === "it"
              ? `${money(discountOpportunity)} di recupero possibile`
              : `${money(discountOpportunity)} possible recovery`,
          actionLabel:
            language === "it" ? "Analizza gli sconti" : "Review discounts",
          actionLink: "/app/profit-intelligence",
          color: "#f59e0b",
          minutes: 18,
          confidence: 86,
          difficulty: language === "it" ? "Media" : "Medium",
          timeline: "week" as const,
          category: language === "it" ? "Promozioni" : "Promotions",
        }
      : null,

    totalRefunds > 0
      ? {
          id: "refunds",
          priority: "High" as const,
          priorityLabel: language === "it" ? "Alta" : "High",
          title:
            language === "it"
              ? "Individua la causa principale dei ricavi rimborsati"
              : "Identify the main cause of refunded revenue",
          shortTitle:
            language === "it"
              ? "Analizza i rimborsi"
              : "Investigate refunds",
          description:
            language === "it"
              ? "I rimborsi riducono il profitto direttamente e possono indicare problemi di prodotto, evasione o soddisfazione."
              : "Refunds directly reduce profit and may signal product, fulfillment or satisfaction problems.",
          impactValue: refundOpportunity,
          impactText:
            language === "it"
              ? `${money(refundOpportunity)} di profitto difendibile`
              : `${money(refundOpportunity)} defendable profit`,
          actionLabel:
            language === "it" ? "Analizza i rimborsi" : "Review refunds",
          actionLink: "/app/profit-intelligence",
          color: "#fb7185",
          minutes: 20,
          confidence: 81,
          difficulty: language === "it" ? "Media" : "Medium",
          timeline: "tomorrow" as const,
          category: language === "it" ? "Rimborsi" : "Refunds",
        }
      : null,

    lowMarginProducts.length > 0
      ? {
          id: "low-margin",
          priority: "Medium" as const,
          priorityLabel: language === "it" ? "Media" : "Medium",
          title:
            language === "it"
              ? `Ottimizza ${lowMarginProducts.length} prodotti a margine basso`
              : `Optimize ${lowMarginProducts.length} low-margin products`,
          shortTitle:
            language === "it"
              ? "Ottimizza i margini bassi"
              : "Optimize low margins",
          description:
            language === "it"
              ? "I prodotti a margine basso possono essere strategici, ma su volumi elevati comprimono rapidamente la qualità del profitto."
              : "Low-margin products may be strategic, but at scale they quickly weaken profit quality.",
          impactValue: lowMarginRecovery,
          impactText:
            language === "it"
              ? `${money(lowMarginRecovery)} di opportunità stimata`
              : `${money(lowMarginRecovery)} estimated opportunity`,
          actionLabel:
            language === "it" ? "Apri il simulatore" : "Open simulator",
          actionLink: "/app/recovery-simulator",
          color: "#38bdf8",
          minutes: 15,
          confidence: 89,
          difficulty: language === "it" ? "Media" : "Medium",
          timeline: "week" as const,
          category: language === "it" ? "Margini" : "Margins",
        }
      : null,

    rows.length > 0
      ? {
          id: "forecast",
          priority: "Low" as const,
          priorityLabel: language === "it" ? "Bassa" : "Low",
          title:
            language === "it"
              ? "Verifica l'impatto delle azioni sul profitto futuro"
              : "Validate the future impact of your actions",
          shortTitle:
            language === "it"
              ? "Aggiorna la previsione"
              : "Update the forecast",
          description:
            language === "it"
              ? "Dopo aver corretto prezzi, costi e promozioni, usa il Forecasting per verificare il nuovo percorso di profitto."
              : "After adjusting pricing, costs and promotions, use Forecasting to validate the new profit trajectory.",
          impactValue: Math.max(targetRecovery * 0.1, 0),
          impactText:
            language === "it"
              ? "Conferma l'effetto a 3, 6 e 12 mesi"
              : "Validate the 3, 6 and 12 month effect",
          actionLabel:
            language === "it" ? "Apri Forecasting" : "Open Forecasting",
          actionLink: "/app/forecasting",
          color: "#22c55e",
          minutes: 8,
          confidence: 92,
          difficulty: language === "it" ? "Facile" : "Easy",
          timeline: "later" as const,
          category: language === "it" ? "Pianificazione" : "Planning",
        }
      : null,
  ].filter(Boolean) as ProfitAction[];

  const sortedActions = [...priorityActions].sort((a, b) => {
    const rank: Record<ActionPriority, number> = {
      Critical: 4,
      High: 3,
      Medium: 2,
      Low: 1,
    };

    return (
      rank[b.priority] - rank[a.priority] ||
      b.impactValue - a.impactValue
    );
  });

  const totalMonthlyOpportunity = sortedActions.reduce(
    (sum, action) => sum + Math.max(0, action.impactValue),
    0,
  );

  const totalAnnualOpportunity = totalMonthlyOpportunity * 12;
  const totalMinutes = sortedActions.reduce(
    (sum, action) => sum + action.minutes,
    0,
  );

  const criticalActions = sortedActions.filter(
    (action) => action.priority === "Critical",
  ).length;

  const highActions = sortedActions.filter(
    (action) => action.priority === "High",
  ).length;

  const highImpactActions = sortedActions.filter(
    (action) => action.impactValue >= totalMonthlyOpportunity * 0.15,
  ).length;

  const weightedConfidence =
    sortedActions.length > 0
      ? sortedActions.reduce(
          (sum, action) => sum + action.confidence,
          0,
        ) / sortedActions.length
      : 100;

  const opportunityScore = clamp(
    Math.round(
      42 +
        Math.min(28, totalMonthlyOpportunity > 0 ? 18 : 0) +
        Math.min(18, highImpactActions * 5) +
        Math.min(12, sortedActions.length * 2),
    ),
    0,
    100,
  );

  const topAction = sortedActions[0];
  const topThreeImpact = sortedActions
    .slice(0, 3)
    .reduce((sum, action) => sum + action.impactValue, 0);

  const concentrationPct =
    totalMonthlyOpportunity > 0
      ? (topThreeImpact / totalMonthlyOpportunity) * 100
      : 0;

  const [completedIds, setCompletedIds] = React.useState<string[]>([]);

  const completedActions = sortedActions.filter((action) =>
    completedIds.includes(action.id),
  );

  const recoveredValue = completedActions.reduce(
    (sum, action) => sum + action.impactValue,
    0,
  );

  const progressPct =
    sortedActions.length > 0
      ? (completedActions.length / sortedActions.length) * 100
      : 100;

  const remainingValue = Math.max(
    0,
    totalMonthlyOpportunity - recoveredValue,
  );

  const toggleComplete = (id: string) => {
    setCompletedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const timelineLabels: Record<TimelineBucket, string> = {
    today: language === "it" ? "Oggi" : "Today",
    tomorrow: language === "it" ? "Domani" : "Tomorrow",
    week: language === "it" ? "Questa settimana" : "This week",
    later: language === "it" ? "Successivamente" : "Later",
  };

  const quickWins = sortedActions
    .filter((action) => action.minutes <= 15)
    .sort((a, b) => b.impactValue - a.impactValue)
    .slice(0, 3);

  const strategyText =
    sortedActions.length === 0
      ? language === "it"
        ? "Non sono state rilevate azioni urgenti. Mantieni il monitoraggio attivo e verifica periodicamente margini, sconti e costi."
        : "No urgent actions were detected. Keep monitoring margins, discounts and costs regularly."
      : language === "it"
        ? `${concentrationPct.toFixed(
            0,
          )}% dell'opportunità mensile stimata è concentrata nelle prime tre azioni. ${
            topAction
              ? `La priorità assoluta è: ${topAction.shortTitle.toLowerCase()}.`
              : ""
          } Evita di distribuire il tempo su tutto il catalogo: completa prima le attività ad alto impatto e usa Recovery Simulator e Forecasting per validare le decisioni.`
        : `${concentrationPct.toFixed(
            0,
          )}% of estimated monthly opportunity is concentrated in the first three actions. ${
            topAction
              ? `Your top priority is to ${topAction.shortTitle.toLowerCase()}.`
              : ""
          } Do not spread effort across the entire catalog: complete the highest-impact tasks first, then validate decisions with Recovery Simulator and Forecasting.`;

  const scoreLabel =
    opportunityScore >= 85
      ? language === "it"
        ? "Opportunità eccezionale"
        : "Exceptional opportunity"
      : opportunityScore >= 65
        ? language === "it"
          ? "Forte potenziale"
          : "Strong potential"
        : language === "it"
          ? "Potenziale moderato"
          : "Moderate potential";

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardNav active="recommendations" navigate={navigate} />

        <div className="hero-header">
          <div>
            <div className="alert-pill">
              <span className="alert-dot" />
              {language === "it" ? "Funzione Growth" : "Growth Feature"}
            </div>

            <div className="eyebrow">
              {language === "it"
                ? "PIANO OPERATIVO DEL PROFITTO"
                : "PROFIT ACTION PLAN"}
            </div>

            <div className="hero-title">
              {language === "it"
                ? "Le azioni che possono aumentare il profitto oggi"
                : "The actions that can increase profit today"}
            </div>

            <div className="hero-description">
              {language === "it"
                ? "MarginLab trasforma rischi, margini deboli, costi mancanti, sconti e rimborsi in una sequenza concreta di attività ordinata per impatto, tempo e priorità."
                : "MarginLab turns risk, weak margins, missing costs, discounts and refunds into a concrete action sequence ranked by impact, time and priority."}
            </div>
          </div>

          <button
            className="primary-button"
            onClick={() => navigate("/app/billing")}
            style={{
              boxShadow:
                "0 12px 32px rgba(255,115,80,0.28), 0 0 30px rgba(255,115,80,0.15)",
            }}
          >
            {language === "it" ? "Sblocca Growth →" : "Unlock Growth →"}
          </button>
        </div>

        <div
          style={{
            borderRadius: 30,
            padding: 28,
            marginBottom: 24,
            background:
              "radial-gradient(circle at 18% 18%, rgba(34,197,94,0.18), transparent 28%), radial-gradient(circle at 88% 12%, rgba(255,115,80,0.12), transparent 30%), linear-gradient(135deg, rgba(15,23,36,0.99), rgba(6,11,20,0.99))",
            border: "1px solid rgba(34,197,94,0.24)",
            boxShadow:
              "0 28px 90px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.03)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.25fr 0.75fr",
              gap: 28,
              alignItems: "center",
            }}
          >
            <div>
              <div
                style={{
                  color: "#4ade80",
                  fontSize: 11,
                  fontWeight: 950,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                {language === "it"
                  ? "OPPORTUNITÀ MENSILE ATTUALE"
                  : "CURRENT MONTHLY OPPORTUNITY"}
              </div>

              <div
                style={{
                  marginTop: 14,
                  fontSize: 64,
                  lineHeight: 0.95,
                  fontWeight: 950,
                  letterSpacing: "-0.06em",
                  color: "#22c55e",
                  textShadow: "0 0 34px rgba(34,197,94,0.16)",
                }}
              >
                +{money(totalMonthlyOpportunity)}
              </div>

              <div
                style={{
                  marginTop: 14,
                  color: "rgba(255,255,255,0.67)",
                  fontSize: 15,
                  fontWeight: 760,
                  lineHeight: 1.6,
                  maxWidth: 760,
                }}
              >
                {language === "it"
                  ? `MarginLab ha individuato ${sortedActions.length} azioni operative. Completandole, l'impatto annuale stimato può arrivare a ${money(
                      totalAnnualOpportunity,
                    )}.`
                  : `MarginLab identified ${sortedActions.length} operational actions. Completing them could create an estimated annual impact of ${money(
                      totalAnnualOpportunity,
                    )}.`}
              </div>

              <div
                style={{
                  marginTop: 24,
                  display: "grid",
                  gridTemplateColumns: "repeat(4,minmax(0,1fr))",
                  gap: 12,
                }}
              >
                <ActionMetric
                  label={
                    language === "it"
                      ? "Impatto annuale"
                      : "Annual Impact"
                  }
                  value={`+${compactMoney(totalAnnualOpportunity)}`}
                  note={
                    language === "it"
                      ? "Se tutte le azioni vengono completate"
                      : "If all actions are completed"
                  }
                  highlight
                />

                <ActionMetric
                  label={
                    language === "it"
                      ? "Azioni ad alto impatto"
                      : "High Impact Actions"
                  }
                  value={`${highImpactActions}`}
                  note={
                    language === "it"
                      ? `${criticalActions + highActions} con priorità alta`
                      : `${criticalActions + highActions} high-priority`
                  }
                />

                <ActionMetric
                  label={
                    language === "it"
                      ? "Tempo stimato"
                      : "Estimated Time"
                  }
                  value={`${totalMinutes} min`}
                  note={
                    language === "it"
                      ? "Per completare il piano"
                      : "To complete the plan"
                  }
                />

                <ActionMetric
                  label={
                    language === "it"
                      ? "Affidabilità media"
                      : "Average Confidence"
                  }
                  value={`${weightedConfidence.toFixed(0)}%`}
                  note={
                    language === "it"
                      ? "Basata sulla qualità dei segnali"
                      : "Based on signal quality"
                  }
                />
              </div>
            </div>

            <div
              style={{
                minHeight: 330,
                borderRadius: 28,
                padding: 26,
                display: "grid",
                placeItems: "center",
                background:
                  "radial-gradient(circle at center, rgba(255,115,80,0.16), transparent 42%), rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: 190,
                    height: 190,
                    margin: "0 auto",
                    borderRadius: "50%",
                    position: "relative",
                    display: "grid",
                    placeItems: "center",
                    background: `conic-gradient(#22c55e ${
                      opportunityScore * 3.6
                    }deg, rgba(255,255,255,0.08) 0deg)`,
                    boxShadow: "0 0 52px rgba(34,197,94,0.12)",
                  }}
                >
                  <div
                    style={{
                      width: 150,
                      height: 150,
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      background:
                        "linear-gradient(180deg, rgba(14,21,34,1), rgba(7,12,21,1))",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          color: "#f8fafc",
                          fontSize: 52,
                          fontWeight: 950,
                          lineHeight: 1,
                          letterSpacing: "-0.05em",
                        }}
                      >
                        {opportunityScore}
                      </div>
                      <div
                        style={{
                          marginTop: 7,
                          color: "#4ade80",
                          fontSize: 10,
                          fontWeight: 950,
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                        }}
                      >
                        {language === "it"
                          ? "Punteggio opportunità"
                          : "Opportunity Score"}
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 18,
                    color: "#f8fafc",
                    fontSize: 20,
                    fontWeight: 950,
                  }}
                >
                  {scoreLabel}
                </div>

                <div
                  style={{
                    marginTop: 7,
                    color: "rgba(255,255,255,0.52)",
                    fontSize: 12,
                    fontWeight: 750,
                  }}
                >
                  {language === "it"
                    ? "Priorità ordinata per valore e urgenza"
                    : "Prioritized by value and urgency"}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.35fr 0.65fr",
            gap: 22,
            marginBottom: 24,
          }}
        >
          <div
            className="panel"
            style={{
              margin: 0,
              padding: 24,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 18,
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              <div>
                <div className="panel-eyebrow">
                  {language === "it"
                    ? "PRIORITÀ DI OGGI"
                    : "TODAY'S PRIORITIES"}
                </div>
                <h2 className="panel-title" style={{ marginTop: 6 }}>
                  {language === "it"
                    ? "Completa prima ciò che vale di più"
                    : "Complete the highest-value work first"}
                </h2>
              </div>

              <TinyBadge color="#22c55e">
                {language === "it"
                  ? `${completedActions.length}/${sortedActions.length} completate`
                  : `${completedActions.length}/${sortedActions.length} completed`}
              </TinyBadge>
            </div>

            <div style={{ display: "grid", gap: 14, marginTop: 22 }}>
              {sortedActions.length > 0 ? (
                sortedActions.map((action, index) => {
                  const completed = completedIds.includes(action.id);

                  return (
                    <div
                      key={action.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "46px minmax(0,1fr) auto",
                        gap: 16,
                        alignItems: "center",
                        padding: 18,
                        borderRadius: 20,
                        background: completed
                          ? "rgba(34,197,94,0.055)"
                          : "linear-gradient(180deg, rgba(16,22,35,0.96), rgba(8,13,22,0.96))",
                        border: completed
                          ? "1px solid rgba(34,197,94,0.22)"
                          : "1px solid rgba(255,255,255,0.07)",
                        opacity: completed ? 0.78 : 1,
                        transition: "all 180ms ease",
                      }}
                    >
                      <button
                        type="button"
                        aria-label={
                          completed
                            ? language === "it"
                              ? "Segna come non completata"
                              : "Mark as incomplete"
                            : language === "it"
                              ? "Segna come completata"
                              : "Mark as complete"
                        }
                        onClick={() => toggleComplete(action.id)}
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 14,
                          cursor: "pointer",
                          display: "grid",
                          placeItems: "center",
                          background: completed
                            ? "rgba(34,197,94,0.16)"
                            : `${action.color}16`,
                          border: completed
                            ? "1px solid rgba(34,197,94,0.34)"
                            : `1px solid ${action.color}34`,
                          color: completed ? "#4ade80" : action.color,
                          fontSize: 17,
                          fontWeight: 950,
                        }}
                      >
                        {completed ? "✓" : index + 1}
                      </button>

                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                            alignItems: "center",
                          }}
                        >
                          <TinyBadge color={action.color}>
                            {action.priorityLabel}
                          </TinyBadge>
                          <TinyBadge color="#94a3b8">
                            {action.category}
                          </TinyBadge>
                        </div>

                        <div
                          style={{
                            marginTop: 10,
                            color: "#f8fafc",
                            fontSize: 19,
                            fontWeight: 950,
                            lineHeight: 1.2,
                            textDecoration: completed ? "line-through" : "none",
                          }}
                        >
                          {action.title}
                        </div>

                        <div
                          style={{
                            marginTop: 7,
                            color: "rgba(255,255,255,0.58)",
                            lineHeight: 1.55,
                            fontSize: 13,
                            fontWeight: 720,
                          }}
                        >
                          {action.description}
                        </div>

                        <div
                          style={{
                            marginTop: 11,
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <TinyBadge color="#38bdf8">
                            {action.minutes} min
                          </TinyBadge>
                          <TinyBadge color="#f59e0b">
                            {language === "it"
                              ? `Difficoltà ${action.difficulty}`
                              : `${action.difficulty} difficulty`}
                          </TinyBadge>
                          <TinyBadge color="#22c55e">
                            {language === "it"
                              ? `Affidabilità ${action.confidence}%`
                              : `${action.confidence}% confidence`}
                          </TinyBadge>
                        </div>
                      </div>

                      <div style={{ textAlign: "right", minWidth: 146 }}>
                        <div
                          style={{
                            color: action.color,
                            fontSize: 21,
                            fontWeight: 950,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {action.impactValue > 0
                            ? `+${money(action.impactValue)}`
                            : action.impactText}
                        </div>

                        {action.impactValue > 0 && (
                          <div
                            style={{
                              marginTop: 4,
                              color: "rgba(255,255,255,0.42)",
                              fontSize: 10,
                              fontWeight: 900,
                              textTransform: "uppercase",
                            }}
                          >
                            {language === "it"
                              ? "impatto mensile"
                              : "monthly impact"}
                          </div>
                        )}

                        <button
                          type="button"
                          className="apply-button"
                          style={{ marginTop: 12 }}
                          onClick={() => navigate(action.actionLink)}
                        >
                          {action.actionLabel} →
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div
                  style={{
                    padding: 24,
                    borderRadius: 18,
                    color: "#86efac",
                    background: "rgba(34,197,94,0.08)",
                    border: "1px solid rgba(34,197,94,0.20)",
                    fontWeight: 850,
                  }}
                >
                  {language === "it"
                    ? "Nessuna azione urgente rilevata. La situazione è sotto controllo."
                    : "No urgent actions detected. The situation is under control."}
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gap: 18,
            }}
          >
            <div
              style={{
                borderRadius: 24,
                padding: 22,
                background:
                  "radial-gradient(circle at top right, rgba(34,197,94,0.12), transparent 42%), linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))",
                border: "1px solid rgba(34,197,94,0.22)",
              }}
            >
              <div
                style={{
                  color: "#4ade80",
                  fontSize: 11,
                  fontWeight: 950,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                }}
              >
                {language === "it"
                  ? "AVANZAMENTO DEL PIANO"
                  : "PLAN PROGRESS"}
              </div>

              <div
                style={{
                  marginTop: 11,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "end",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    color: "#f8fafc",
                    fontSize: 36,
                    fontWeight: 950,
                    lineHeight: 1,
                  }}
                >
                  {progressPct.toFixed(0)}%
                </div>

                <div
                  style={{
                    color: "rgba(255,255,255,0.48)",
                    fontSize: 11,
                    fontWeight: 850,
                  }}
                >
                  {completedActions.length}/{sortedActions.length}
                </div>
              </div>

              <div
                style={{
                  marginTop: 14,
                  height: 10,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.08)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${progressPct}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: "linear-gradient(90deg, #16a34a, #4ade80)",
                    boxShadow: "0 0 18px rgba(34,197,94,0.28)",
                    transition: "width 220ms ease",
                  }}
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  marginTop: 16,
                }}
              >
                <div
                  style={{
                    padding: 13,
                    borderRadius: 14,
                    background: "rgba(255,255,255,0.035)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <div
                    style={{
                      color: "rgba(255,255,255,0.42)",
                      fontSize: 9,
                      fontWeight: 950,
                      textTransform: "uppercase",
                    }}
                  >
                    {language === "it" ? "Recuperato" : "Recovered"}
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      color: "#22c55e",
                      fontSize: 18,
                      fontWeight: 950,
                    }}
                  >
                    {money(recoveredValue)}
                  </div>
                </div>

                <div
                  style={{
                    padding: 13,
                    borderRadius: 14,
                    background: "rgba(255,255,255,0.035)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <div
                    style={{
                      color: "rgba(255,255,255,0.42)",
                      fontSize: 9,
                      fontWeight: 950,
                      textTransform: "uppercase",
                    }}
                  >
                    {language === "it" ? "Rimanente" : "Remaining"}
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      color: "#f8fafc",
                      fontSize: 18,
                      fontWeight: 950,
                    }}
                  >
                    {money(remainingValue)}
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                borderRadius: 24,
                padding: 22,
                background:
                  "radial-gradient(circle at top right, rgba(56,189,248,0.10), transparent 40%), linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))",
                border: "1px solid rgba(56,189,248,0.18)",
              }}
            >
              <div
                style={{
                  color: "#7dd3fc",
                  fontSize: 11,
                  fontWeight: 950,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                }}
              >
                {language === "it" ? "IMPATTO TOTALE" : "TOTAL IMPACT"}
              </div>

              <div
                style={{
                  marginTop: 12,
                  color: "#22c55e",
                  fontSize: 38,
                  fontWeight: 950,
                  lineHeight: 1,
                  letterSpacing: "-0.04em",
                }}
              >
                +{money(totalAnnualOpportunity)}
              </div>

              <div
                style={{
                  marginTop: 7,
                  color: "rgba(255,255,255,0.48)",
                  fontSize: 11,
                  fontWeight: 850,
                }}
              >
                {language === "it"
                  ? "opportunità annuale stimata"
                  : "estimated annual opportunity"}
              </div>

              <div
                style={{
                  marginTop: 16,
                  paddingTop: 15,
                  borderTop: "1px solid rgba(255,255,255,0.07)",
                  display: "grid",
                  gap: 9,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    color: "rgba(255,255,255,0.60)",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  <span>
                    {language === "it" ? "Mensile" : "Monthly"}
                  </span>
                  <strong style={{ color: "#f8fafc" }}>
                    +{money(totalMonthlyOpportunity)}
                  </strong>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    color: "rgba(255,255,255,0.60)",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  <span>
                    {language === "it"
                      ? "Prime 3 azioni"
                      : "Top 3 actions"}
                  </span>
                  <strong style={{ color: "#f8fafc" }}>
                    {concentrationPct.toFixed(0)}%
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "0.8fr 1.2fr",
            gap: 22,
            marginBottom: 24,
          }}
        >
          <div
            className="panel"
            style={{
              margin: 0,
              padding: 24,
            }}
          >
            <div className="panel-eyebrow">
              {language === "it" ? "VITTORIE RAPIDE" : "QUICK WINS"}
            </div>

            <h2 className="panel-title" style={{ marginTop: 6 }}>
              {language === "it"
                ? "Più valore nel minor tempo"
                : "More value in less time"}
            </h2>

            <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
              {quickWins.length > 0 ? (
                quickWins.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => navigate(action.actionLink)}
                    style={{
                      width: "100%",
                      cursor: "pointer",
                      textAlign: "left",
                      padding: 16,
                      borderRadius: 18,
                      background: "rgba(255,255,255,0.035)",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "center",
                      }}
                    >
                      <TinyBadge color="#38bdf8">
                        {action.minutes} min
                      </TinyBadge>

                      <div
                        style={{
                          color: "#22c55e",
                          fontSize: 18,
                          fontWeight: 950,
                        }}
                      >
                        {action.impactValue > 0
                          ? `+${money(action.impactValue)}`
                          : "→"}
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: 12,
                        color: "#f8fafc",
                        fontSize: 15,
                        fontWeight: 900,
                      }}
                    >
                      {action.shortTitle}
                    </div>

                    <div
                      style={{
                        marginTop: 5,
                        color: "rgba(255,255,255,0.46)",
                        fontSize: 11,
                        fontWeight: 750,
                      }}
                    >
                      {language === "it"
                        ? "Apri l'azione →"
                        : "Open action →"}
                    </div>
                  </button>
                ))
              ) : (
                <div
                  style={{
                    padding: 18,
                    borderRadius: 16,
                    color: "rgba(255,255,255,0.58)",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    fontWeight: 760,
                  }}
                >
                  {language === "it"
                    ? "Nessuna vittoria rapida rilevata."
                    : "No quick wins detected."}
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              borderRadius: 26,
              padding: 24,
              background:
                "radial-gradient(circle at top left, rgba(255,115,80,0.13), transparent 38%), linear-gradient(135deg, rgba(16,23,37,0.99), rgba(7,12,21,0.99))",
              border: "1px solid rgba(255,115,60,0.22)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div>
                <div
                  style={{
                    color: "#ff9a70",
                    fontSize: 11,
                    fontWeight: 950,
                    letterSpacing: "0.13em",
                    textTransform: "uppercase",
                  }}
                >
                  {language === "it"
                    ? "STRATEGIA MARGINLAB"
                    : "MARGINLAB STRATEGY"}
                </div>

                <div
                  style={{
                    marginTop: 8,
                    color: "#f8fafc",
                    fontSize: 22,
                    fontWeight: 950,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {language === "it"
                    ? "Concentra il lavoro dove il ritorno è maggiore"
                    : "Focus effort where the return is highest"}
                </div>
              </div>

              <TinyBadge color="#22c55e">
                {language === "it"
                  ? `Affidabilità ${weightedConfidence.toFixed(0)}%`
                  : `${weightedConfidence.toFixed(0)}% confidence`}
              </TinyBadge>
            </div>

            <div
              style={{
                marginTop: 18,
                color: "rgba(255,255,255,0.77)",
                fontSize: 14,
                lineHeight: 1.75,
                fontWeight: 730,
              }}
            >
              {strategyText}
            </div>

            <div
              style={{
                marginTop: 20,
                display: "grid",
                gridTemplateColumns: "repeat(3,minmax(0,1fr))",
                gap: 11,
              }}
            >
              <div
                style={{
                  padding: 14,
                  borderRadius: 15,
                  background: "rgba(255,255,255,0.035)",
                  border: "1px solid rgba(255,115,60,0.10)",
                }}
              >
                <div
                  style={{
                    color: "rgba(255,255,255,0.42)",
                    fontSize: 9,
                    fontWeight: 950,
                    textTransform: "uppercase",
                  }}
                >
                  {language === "it" ? "Prima priorità" : "Top Priority"}
                </div>
                <div
                  style={{
                    marginTop: 7,
                    color: "#f8fafc",
                    fontSize: 14,
                    fontWeight: 900,
                    lineHeight: 1.35,
                  }}
                >
                  {topAction?.shortTitle ??
                    (language === "it" ? "Monitoraggio" : "Monitoring")}
                </div>
              </div>

              <div
                style={{
                  padding: 14,
                  borderRadius: 15,
                  background: "rgba(255,255,255,0.035)",
                  border: "1px solid rgba(255,115,60,0.10)",
                }}
              >
                <div
                  style={{
                    color: "rgba(255,255,255,0.42)",
                    fontSize: 9,
                    fontWeight: 950,
                    textTransform: "uppercase",
                  }}
                >
                  {language === "it"
                    ? "Concentrazione"
                    : "Concentration"}
                </div>
                <div
                  style={{
                    marginTop: 7,
                    color: "#22c55e",
                    fontSize: 20,
                    fontWeight: 950,
                  }}
                >
                  {concentrationPct.toFixed(0)}%
                </div>
              </div>

              <div
                style={{
                  padding: 14,
                  borderRadius: 15,
                  background: "rgba(255,255,255,0.035)",
                  border: "1px solid rgba(255,115,60,0.10)",
                }}
              >
                <div
                  style={{
                    color: "rgba(255,255,255,0.42)",
                    fontSize: 9,
                    fontWeight: 950,
                    textTransform: "uppercase",
                  }}
                >
                  {language === "it" ? "Tempo totale" : "Total Time"}
                </div>
                <div
                  style={{
                    marginTop: 7,
                    color: "#f8fafc",
                    fontSize: 20,
                    fontWeight: 950,
                  }}
                >
                  {totalMinutes} min
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          className="panel"
          style={{
            marginBottom: 24,
            padding: 24,
          }}
        >
          <div className="panel-eyebrow">
            {language === "it" ? "PIANIFICAZIONE" : "ACTION TIMELINE"}
          </div>

          <h2 className="panel-title" style={{ marginTop: 6 }}>
            {language === "it"
              ? "Quando completare ogni attività"
              : "When to complete each action"}
          </h2>

          <div
            style={{
              marginTop: 22,
              display: "grid",
              gridTemplateColumns: "repeat(4,minmax(0,1fr))",
              gap: 14,
            }}
          >
            {(
              ["today", "tomorrow", "week", "later"] as TimelineBucket[]
            ).map((bucket) => {
              const actions = sortedActions.filter(
                (action) => action.timeline === bucket,
              );

              return (
                <div
                  key={bucket}
                  style={{
                    minHeight: 200,
                    padding: 17,
                    borderRadius: 19,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <div
                    style={{
                      color:
                        bucket === "today"
                          ? "#ff6b4a"
                          : bucket === "tomorrow"
                            ? "#f59e0b"
                            : bucket === "week"
                              ? "#38bdf8"
                              : "#94a3b8",
                      fontSize: 11,
                      fontWeight: 950,
                      textTransform: "uppercase",
                      letterSpacing: "0.11em",
                    }}
                  >
                    {timelineLabels[bucket]}
                  </div>

                  <div
                    style={{
                      marginTop: 13,
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    {actions.length > 0 ? (
                      actions.map((action) => (
                        <button
                          key={action.id}
                          type="button"
                          onClick={() => navigate(action.actionLink)}
                          style={{
                            cursor: "pointer",
                            textAlign: "left",
                            padding: 12,
                            borderRadius: 13,
                            background: "rgba(255,255,255,0.035)",
                            border: "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          <div
                            style={{
                              color: "#f8fafc",
                              fontSize: 12,
                              fontWeight: 870,
                              lineHeight: 1.4,
                            }}
                          >
                            {action.shortTitle}
                          </div>

                          <div
                            style={{
                              marginTop: 5,
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 8,
                              color: "rgba(255,255,255,0.42)",
                              fontSize: 10,
                              fontWeight: 800,
                            }}
                          >
                            <span>{action.minutes} min</span>
                            <span style={{ color: action.color }}>
                              {action.impactValue > 0
                                ? `+${money(action.impactValue)}`
                                : "→"}
                            </span>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div
                        style={{
                          padding: 12,
                          borderRadius: 12,
                          color: "rgba(255,255,255,0.36)",
                          fontSize: 11,
                          fontWeight: 750,
                          background: "rgba(255,255,255,0.02)",
                        }}
                      >
                        {language === "it"
                          ? "Nessuna attività"
                          : "No actions"}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div
          style={{
            padding: 18,
            borderRadius: 18,
            background: "rgba(255,115,60,0.07)",
            border: "1px solid rgba(255,115,60,0.18)",
            color: "rgba(255,255,255,0.64)",
            lineHeight: 1.6,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {language === "it"
            ? "Le opportunità sono stime costruite sui dati Shopify del periodo selezionato. Il completamento delle attività viene tracciato localmente nella sessione corrente e non modifica automaticamente prodotti, prezzi, costi o campagne."
            : "Opportunities are estimates built from Shopify data for the selected period. Action completion is tracked locally in the current session and does not automatically change products, pricing, costs or campaigns."}
        </div>
      </div>
    </div>
  );
}