import * as React from "react";
import { useLoaderData, useNavigate } from "react-router";

import { authenticate } from "~/shopify.server";
import { loadMarginDashboardData } from "~/utils/margin.server";
import DashboardNav from "~/components/dashboard/DashboardNav";

import dashboardStylesUrl from "~/styles/dashboard.css?url";

import { type LoaderData, money } from "~/utils/margin";
import { getStoredLanguage } from "~/utils/i18n";
import {
  generateProfitAlerts,
  type ProfitAlert,
  type ProfitAlertEffort,
  type ProfitBusinessAction,
} from "~/utils/profit-monitor";

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

type ActionStage = "now" | "next" | "planned" | "monitor";

type ActionStatusStyle = {
  label: string;
  color: string;
  background: string;
  border: string;
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

function getStatusStyle(
  action: ProfitBusinessAction,
  language: "it" | "en",
): ActionStatusStyle {
  return {
    action: {
      label: language === "it" ? "Intervieni" : "Action",
      color: "#ff6b4a",
      background: "rgba(255,107,74,0.11)",
      border: "rgba(255,107,74,0.28)",
    },
    review: {
      label: language === "it" ? "Controlla" : "Review",
      color: "#f59e0b",
      background: "rgba(245,158,11,0.11)",
      border: "rgba(245,158,11,0.26)",
    },
    optimize: {
      label: language === "it" ? "Ottimizza" : "Optimize",
      color: "#22c55e",
      background: "rgba(34,197,94,0.11)",
      border: "rgba(34,197,94,0.26)",
    },
    monitor: {
      label: language === "it" ? "Monitora" : "Monitor",
      color: "#38bdf8",
      background: "rgba(56,189,248,0.11)",
      border: "rgba(56,189,248,0.26)",
    },
  }[action];
}

function getEffortLabel(
  effort: ProfitAlertEffort,
  language: "it" | "en",
) {
  if (language === "it") {
    if (effort === "easy") return "Facile";
    if (effort === "medium") return "Media";
    return "Avanzata";
  }

  if (effort === "easy") return "Easy";
  if (effort === "medium") return "Medium";
  return "Advanced";
}

function getActionStage(alert: ProfitAlert): ActionStage {
  if (alert.businessAction === "action") return "now";
  if (alert.businessAction === "review") return "next";
  if (alert.businessAction === "optimize") return "planned";
  return "monitor";
}

function getBusinessStatus(alerts: ProfitAlert[]) {
  if (alerts.some((alert) => alert.businessAction === "action")) {
    return {
      key: "action",
      color: "#ff6b4a",
    };
  }

  if (alerts.some((alert) => alert.businessAction === "review")) {
    return {
      key: "review",
      color: "#f59e0b",
    };
  }

  if (alerts.some((alert) => alert.businessAction === "optimize")) {
    return {
      key: "optimize",
      color: "#22c55e",
    };
  }

  return {
    key: "stable",
    color: "#38bdf8",
  };
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
        minHeight: 27,
        padding: "6px 9px",
        borderRadius: 999,
        background: `${color}16`,
        border: `1px solid ${color}36`,
        color,
        fontSize: 9,
        fontWeight: 950,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
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
        padding: 19,
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
          fontSize: 9,
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
          marginTop: 11,
          fontSize: 29,
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
          marginTop: 8,
          color: "rgba(255,255,255,0.56)",
          fontSize: 11,
          fontWeight: 750,
          lineHeight: 1.45,
        }}
      >
        {note}
      </div>
    </div>
  );
}

function TopPriority({
  alert,
  language,
  navigate,
  completed,
  onToggle,
}: {
  alert: ProfitAlert;
  language: "it" | "en";
  navigate: (path: string) => void;
  completed: boolean;
  onToggle: () => void;
}) {
  const status = getStatusStyle(alert.businessAction, language);

  return (
    <section
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 28,
        padding: 27,
        background:
          "radial-gradient(circle at 12% 10%, rgba(255,115,80,0.14), transparent 34%), linear-gradient(145deg, rgba(16,23,37,0.99), rgba(6,11,20,0.99))",
        border: `1px solid ${status.border}`,
        boxShadow:
          "0 24px 70px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.035)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -90,
          right: -70,
          width: 260,
          height: 260,
          borderRadius: "50%",
          background: status.background,
          filter: "blur(20px)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 18,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              color: "#ff9a70",
              fontSize: 10,
              fontWeight: 950,
              letterSpacing: "0.13em",
              textTransform: "uppercase",
            }}
          >
            {language === "it"
              ? "PRIORITÀ PRINCIPALE"
              : "TOP PRIORITY"}
          </div>

          <h2
            style={{
              margin: "9px 0 0",
              maxWidth: 840,
              color: "#f8fafc",
              fontSize: 30,
              lineHeight: 1.18,
              fontWeight: 950,
              letterSpacing: "-0.04em",
            }}
          >
            {alert.title}
          </h2>
        </div>

        <TinyBadge color={status.color}>
          {status.label}
        </TinyBadge>
      </div>

      <p
        style={{
          position: "relative",
          margin: "14px 0 0",
          maxWidth: 900,
          color: "rgba(255,255,255,0.66)",
          fontSize: 14,
          lineHeight: 1.75,
          fontWeight: 720,
        }}
      >
        {alert.description}
      </p>

      <div
        style={{
          position: "relative",
          marginTop: 20,
          display: "grid",
          gridTemplateColumns: "repeat(4,minmax(0,1fr))",
          gap: 11,
        }}
      >
        <ActionMetric
          label={
            language === "it"
              ? "Impatto mensile"
              : "Monthly impact"
          }
          value={
            alert.monthlyImpact > 0
              ? `${alert.businessAction === "optimize" ? "+" : ""}${money(
                  alert.monthlyImpact,
                )}`
              : language === "it"
                ? "Qualitativo"
                : "Qualitative"
          }
          note={
            language === "it"
              ? "Stima del segnale corrente"
              : "Current signal estimate"
          }
          highlight={alert.monthlyImpact > 0}
        />

        <ActionMetric
          label={language === "it" ? "Priorità" : "Priority"}
          value={`${alert.priority}/100`}
          note={
            language === "it"
              ? "Urgenza e valore"
              : "Urgency and value"
          }
        />

        <ActionMetric
          label={language === "it" ? "Impegno" : "Effort"}
          value={getEffortLabel(alert.effort, language)}
          note={`${alert.estimatedMinutes} min`}
        />

        <ActionMetric
          label={
            language === "it"
              ? "Modulo consigliato"
              : "Recommended module"
          }
          value={alert.recommendedModule}
          note={
            language === "it"
              ? "Apri il modulo corretto"
              : "Open the right module"
          }
        />
      </div>

      <div
        style={{
          position: "relative",
          marginTop: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          className={completed ? "apply-button" : "primary-button"}
          onClick={onToggle}
        >
          {completed
            ? language === "it"
              ? "✓ Segnata come completata"
              : "✓ Marked complete"
            : language === "it"
              ? "Segna come completata"
              : "Mark as complete"}
        </button>

        <button
          type="button"
          className="apply-button"
          onClick={() => navigate(alert.route)}
        >
          {alert.actionLabel} →
        </button>
      </div>
    </section>
  );
}

export default function RecommendationsPage() {
  const { summary, rows, period } = useLoaderData() as LoaderData;
  const navigate = useNavigate();
  const language =
    getStoredLanguage() === "it" ? "it" : "en";

  const profitAlerts = React.useMemo(
    () =>
      generateProfitAlerts({
        summary,
        rows,
        language,
        period,
      }),
    [summary, rows, language, period],
  );

  const aggregateRecovery = profitAlerts.find(
    (alert) =>
      alert.id === "recoverable-profit-opportunity",
  );

  const queueAlerts = React.useMemo(() => {
    const hasSpecificPricingOpportunity = profitAlerts.some((alert) =>
      alert.id.startsWith("pricing-opportunity-"),
    );

    return profitAlerts
      .filter((alert) => {
        if (
          alert.id === "recoverable-profit-opportunity" &&
          hasSpecificPricingOpportunity
        ) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }

        return b.monthlyImpact - a.monthlyImpact;
      })
      .slice(0, 8);
  }, [profitAlerts]);

  const topAlert = queueAlerts[0];

  const headlineMonthlyOpportunity =
    aggregateRecovery?.monthlyImpact ??
    Math.max(
      0,
      ...queueAlerts.map((alert) => alert.monthlyImpact),
    );

  const annualOpportunity =
    headlineMonthlyOpportunity * 12;

  const totalMinutes = queueAlerts.reduce(
    (sum, alert) => sum + alert.estimatedMinutes,
    0,
  );

  const actionableCount = queueAlerts.filter(
    (alert) => alert.businessAction !== "monitor",
  ).length;

  const quickWins = queueAlerts
    .filter(
      (alert) =>
        alert.effort === "easy" &&
        alert.estimatedMinutes <= 10 &&
        alert.businessAction !== "monitor",
    )
    .sort((a, b) => b.monthlyImpact - a.monthlyImpact)
    .slice(0, 3);

  const averagePriority =
    queueAlerts.length > 0
      ? queueAlerts.reduce(
          (sum, alert) => sum + alert.priority,
          0,
        ) / queueAlerts.length
      : 0;

  const actionCenterScore = clamp(
    Math.round(
      35 +
        Math.min(30, actionableCount * 6) +
        Math.min(20, headlineMonthlyOpportunity > 0 ? 20 : 0) +
        Math.min(15, averagePriority * 0.15),
    ),
    0,
    100,
  );

  const businessStatus = getBusinessStatus(profitAlerts);

  const businessStatusLabel =
    language === "it"
      ? businessStatus.key === "action"
        ? "Intervento richiesto"
        : businessStatus.key === "review"
          ? "Verifica consigliata"
          : businessStatus.key === "optimize"
            ? "Ottimizzazione disponibile"
            : "Situazione stabile"
      : businessStatus.key === "action"
        ? "Action required"
        : businessStatus.key === "review"
          ? "Review recommended"
          : businessStatus.key === "optimize"
            ? "Optimization available"
            : "Stable status";

  const businessStatusDescription =
    language === "it"
      ? businessStatus.key === "action"
        ? "È presente almeno una criticità significativa che richiede una decisione prioritaria."
        : businessStatus.key === "review"
          ? "Non emerge un'emergenza generale, ma alcuni segnali meritano una verifica."
          : businessStatus.key === "optimize"
            ? "La struttura è relativamente stabile. Le priorità attuali riguardano il miglioramento."
            : "Nessuna criticità significativa richiede un intervento immediato."
      : businessStatus.key === "action"
        ? "At least one significant issue requires a prioritized decision."
        : businessStatus.key === "review"
          ? "There is no broad emergency, but some signals deserve review."
          : businessStatus.key === "optimize"
            ? "The business is relatively stable. Current priorities focus on improvement."
            : "No significant profitability issue requires immediate action.";

  const [completedIds, setCompletedIds] =
    React.useState<string[]>([]);

  const toggleComplete = (id: string) => {
    setCompletedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const completedAlerts = queueAlerts.filter((alert) =>
    completedIds.includes(alert.id),
  );

  const completedPotential = completedAlerts.reduce(
    (sum, alert) => sum + Math.max(0, alert.monthlyImpact),
    0,
  );

  const remainingPotential = Math.max(
    0,
    headlineMonthlyOpportunity - completedPotential,
  );

  const progressPct =
    queueAlerts.length > 0
      ? (completedAlerts.length / queueAlerts.length) * 100
      : 100;

  const stageLabels: Record<ActionStage, string> = {
    now: language === "it" ? "Da affrontare ora" : "Address now",
    next: language === "it" ? "Prossimo passo" : "Next step",
    planned: language === "it" ? "Da pianificare" : "Plan next",
    monitor: language === "it" ? "Monitoraggio" : "Monitoring",
  };

  const strategyText =
    language === "it"
      ? topAlert
        ? `La priorità principale è “${topAlert.title}”. MarginLab consiglia di completare prima le attività con priorità più alta, verificare l'effetto nel modulo indicato e soltanto dopo passare alle opportunità di ottimizzazione.`
        : "Non sono state rilevate azioni operative. Mantieni attivo il monitoraggio e verifica nuovamente quando cambiano ordini, costi o margini."
      : topAlert
        ? `The primary priority is “${topAlert.title}”. MarginLab recommends completing higher-priority work first, validating the effect in the recommended module, and only then moving to optimization opportunities.`
        : "No operational actions were detected. Keep monitoring active and review again when orders, costs or margins change.";

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardNav
          active="recommendations"
          navigate={navigate}
        />

        <div className="hero-header">
          <div>
            <div className="alert-pill">
              <span className="alert-dot" />
              {language === "it"
                ? "Funzione Growth"
                : "Growth Feature"}
            </div>

            <div className="eyebrow">
              {language === "it"
                ? "PROFIT ACTION CENTER"
                : "PROFIT ACTION CENTER"}
            </div>

            <div className="hero-title">
              {language === "it"
                ? "Il piano operativo della tua redditività"
                : "Your profitability action plan"}
            </div>

            <div className="hero-description">
              {language === "it"
                ? "MarginLab trasforma i segnali dello store in priorità concrete. Intervieni solo quando serve, ottimizza quando esiste un'opportunità e monitora il resto."
                : "MarginLab turns store signals into concrete priorities. Act only when needed, optimize when opportunity exists, and monitor the rest."}
            </div>
          </div>

          <button
            className="primary-button"
            onClick={() => navigate("/app/billing")}
          >
            {language === "it"
              ? "Gestisci il piano →"
              : "Manage plan →"}
          </button>
        </div>

        <section
          style={{
            borderRadius: 30,
            padding: 28,
            marginBottom: 26,
            background:
              "radial-gradient(circle at 14% 16%, rgba(34,197,94,0.15), transparent 30%), radial-gradient(circle at 88% 12%, rgba(255,115,80,0.12), transparent 30%), linear-gradient(135deg, rgba(15,23,36,0.99), rgba(6,11,20,0.99))",
            border: "1px solid rgba(34,197,94,0.23)",
            boxShadow:
              "0 28px 90px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.03)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 0.8fr",
              gap: 26,
              alignItems: "stretch",
            }}
          >
            <div>
              <div
                style={{
                  color: "#4ade80",
                  fontSize: 10,
                  fontWeight: 950,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                {language === "it"
                  ? "OPPORTUNITÀ MENSILE VERIFICATA"
                  : "VERIFIED MONTHLY OPPORTUNITY"}
              </div>

              <div
                style={{
                  marginTop: 14,
                  fontSize: 62,
                  lineHeight: 0.95,
                  fontWeight: 950,
                  letterSpacing: "-0.06em",
                  color: "#22c55e",
                }}
              >
                +{money(headlineMonthlyOpportunity)}
              </div>

              <p
                style={{
                  margin: "15px 0 0",
                  maxWidth: 760,
                  color: "rgba(255,255,255,0.67)",
                  fontSize: 14,
                  lineHeight: 1.65,
                  fontWeight: 760,
                }}
              >
                {language === "it"
                  ? `${actionableCount} priorità operative sono disponibili. L'impatto annuale potenziale associato all'opportunità complessiva è ${money(
                      annualOpportunity,
                    )}.`
                  : `${actionableCount} operational priorities are available. The potential annual impact associated with the overall opportunity is ${money(
                      annualOpportunity,
                    )}.`}
              </p>

              <div
                style={{
                  marginTop: 23,
                  display: "grid",
                  gridTemplateColumns: "repeat(4,minmax(0,1fr))",
                  gap: 11,
                }}
              >
                <ActionMetric
                  label={
                    language === "it"
                      ? "Impatto annuale"
                      : "Annual impact"
                  }
                  value={`+${compactMoney(annualOpportunity)}`}
                  note={
                    language === "it"
                      ? "Basato sull'opportunità complessiva"
                      : "Based on the overall opportunity"
                  }
                  highlight
                />

                <ActionMetric
                  label={
                    language === "it"
                      ? "Priorità operative"
                      : "Operational priorities"
                  }
                  value={`${actionableCount}`}
                  note={
                    language === "it"
                      ? "Esclude il semplice monitoraggio"
                      : "Excludes monitoring-only signals"
                  }
                />

                <ActionMetric
                  label={
                    language === "it"
                      ? "Tempo stimato"
                      : "Estimated time"
                  }
                  value={`${totalMinutes} min`}
                  note={
                    language === "it"
                      ? "Per l'intera coda"
                      : "For the full queue"
                  }
                />

                <ActionMetric
                  label={
                    language === "it"
                      ? "Vittorie rapide"
                      : "Quick wins"
                  }
                  value={`${quickWins.length}`}
                  note={
                    language === "it"
                      ? "Facili e sotto 10 minuti"
                      : "Easy and under 10 minutes"
                  }
                />
              </div>
            </div>

            <div
              style={{
                borderRadius: 27,
                padding: 25,
                display: "grid",
                placeItems: "center",
                background:
                  "radial-gradient(circle at center, rgba(255,115,80,0.15), transparent 43%), rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: 184,
                    height: 184,
                    margin: "0 auto",
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    background: `conic-gradient(${businessStatus.color} ${
                      actionCenterScore * 3.6
                    }deg, rgba(255,255,255,0.08) 0deg)`,
                    boxShadow: `0 0 50px ${businessStatus.color}22`,
                  }}
                >
                  <div
                    style={{
                      width: 146,
                      height: 146,
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      background:
                        "linear-gradient(180deg, rgba(14,21,34,1), rgba(7,12,21,1))",
                      border:
                        "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          color: "#f8fafc",
                          fontSize: 50,
                          fontWeight: 950,
                          lineHeight: 1,
                          letterSpacing: "-0.05em",
                        }}
                      >
                        {actionCenterScore}
                      </div>

                      <div
                        style={{
                          marginTop: 7,
                          color: businessStatus.color,
                          fontSize: 9,
                          fontWeight: 950,
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                        }}
                      >
                        {language === "it"
                          ? "Punteggio azioni"
                          : "Action score"}
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 18,
                    color: businessStatus.color,
                    fontSize: 20,
                    fontWeight: 950,
                  }}
                >
                  {businessStatusLabel}
                </div>

                <div
                  style={{
                    marginTop: 7,
                    color: "rgba(255,255,255,0.52)",
                    fontSize: 11,
                    lineHeight: 1.5,
                    fontWeight: 750,
                  }}
                >
                  {businessStatusDescription}
                </div>
              </div>
            </div>
          </div>
        </section>

        {topAlert && (
          <TopPriority
            alert={topAlert}
            language={language}
            navigate={navigate}
            completed={completedIds.includes(topAlert.id)}
            onToggle={() => toggleComplete(topAlert.id)}
          />
        )}

        <div
          style={{
            marginTop: 26,
            display: "grid",
            gridTemplateColumns: "1.35fr 0.65fr",
            gap: 22,
            alignItems: "start",
          }}
        >
          <section
            className="panel"
            style={{ margin: 0, padding: 24 }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              <div>
                <div className="panel-eyebrow">
                  {language === "it"
                    ? "CODA DELLE PRIORITÀ"
                    : "PRIORITY QUEUE"}
                </div>

                <h2
                  className="panel-title"
                  style={{ marginTop: 6 }}
                >
                  {language === "it"
                    ? "Le attività da affrontare in ordine"
                    : "Work through priorities in order"}
                </h2>
              </div>

              <TinyBadge color="#22c55e">
                {completedAlerts.length}/{queueAlerts.length}{" "}
                {language === "it" ? "completate" : "completed"}
              </TinyBadge>
            </div>

            <div
              style={{
                marginTop: 20,
                display: "grid",
                gap: 13,
              }}
            >
              {queueAlerts.length > 0 ? (
                queueAlerts.map((alert, index) => {
                  const completed = completedIds.includes(alert.id);
                  const status = getStatusStyle(
                    alert.businessAction,
                    language,
                  );

                  return (
                    <article
                      key={alert.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "46px minmax(0,1fr) auto",
                        gap: 15,
                        alignItems: "center",
                        padding: 17,
                        borderRadius: 19,
                        background: completed
                          ? "rgba(34,197,94,0.055)"
                          : "linear-gradient(180deg, rgba(16,22,35,0.96), rgba(8,13,22,0.96))",
                        border: completed
                          ? "1px solid rgba(34,197,94,0.22)"
                          : `1px solid ${status.border}`,
                        opacity: completed ? 0.76 : 1,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleComplete(alert.id)}
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 14,
                          cursor: "pointer",
                          display: "grid",
                          placeItems: "center",
                          background: completed
                            ? "rgba(34,197,94,0.16)"
                            : status.background,
                          border: completed
                            ? "1px solid rgba(34,197,94,0.34)"
                            : `1px solid ${status.border}`,
                          color: completed ? "#4ade80" : status.color,
                          fontSize: 16,
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
                          <TinyBadge color={status.color}>
                            {status.label}
                          </TinyBadge>

                          <TinyBadge color="#94a3b8">
                            {alert.category}
                          </TinyBadge>
                        </div>

                        <div
                          style={{
                            marginTop: 9,
                            color: "#f8fafc",
                            fontSize: 17,
                            fontWeight: 950,
                            lineHeight: 1.25,
                            textDecoration: completed
                              ? "line-through"
                              : "none",
                          }}
                        >
                          {alert.title}
                        </div>

                        <div
                          style={{
                            marginTop: 6,
                            color: "rgba(255,255,255,0.57)",
                            fontSize: 12,
                            lineHeight: 1.55,
                            fontWeight: 720,
                          }}
                        >
                          {alert.description}
                        </div>

                        <div
                          style={{
                            marginTop: 10,
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <TinyBadge color="#38bdf8">
                            {alert.estimatedMinutes} min
                          </TinyBadge>

                          <TinyBadge color="#f59e0b">
                            {getEffortLabel(alert.effort, language)}
                          </TinyBadge>

                          <TinyBadge color="#c084fc">
                            {alert.recommendedModule}
                          </TinyBadge>
                        </div>
                      </div>

                      <div
                        style={{
                          minWidth: 150,
                          textAlign: "right",
                        }}
                      >
                        <div
                          style={{
                            color:
                              alert.businessAction === "optimize"
                                ? "#22c55e"
                                : status.color,
                            fontSize: 20,
                            fontWeight: 950,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {alert.monthlyImpact > 0
                            ? `${
                                alert.businessAction === "optimize"
                                  ? "+"
                                  : ""
                              }${money(alert.monthlyImpact)}`
                            : language === "it"
                              ? "Qualitativo"
                              : "Qualitative"}
                        </div>

                        <button
                          type="button"
                          className="apply-button"
                          style={{ marginTop: 11 }}
                          onClick={() => navigate(alert.route)}
                        >
                          {alert.actionLabel} →
                        </button>
                      </div>
                    </article>
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
                    ? "Nessuna azione operativa rilevata. Continua il monitoraggio."
                    : "No operational action detected. Continue monitoring."}
                </div>
              )}
            </div>
          </section>

          <aside
            style={{
              display: "grid",
              gap: 18,
            }}
          >
            <section
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
                  fontSize: 10,
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
                  {completedAlerts.length}/{queueAlerts.length}
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
                    background:
                      "linear-gradient(90deg, #16a34a, #4ade80)",
                    transition: "width 220ms ease",
                  }}
                />
              </div>

              <div
                style={{
                  marginTop: 16,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <ActionMetric
                  label={
                    language === "it"
                      ? "Impatto completato"
                      : "Completed potential"
                  }
                  value={money(completedPotential)}
                  note={
                    language === "it"
                      ? "Azioni segnate come completate"
                      : "Actions marked complete"
                  }
                />

                <ActionMetric
                  label={
                    language === "it"
                      ? "Potenziale rimanente"
                      : "Remaining potential"
                  }
                  value={money(remainingPotential)}
                  note={
                    language === "it"
                      ? "Non ancora affrontato"
                      : "Not yet addressed"
                  }
                />
              </div>
            </section>

            <section
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
                  fontSize: 10,
                  fontWeight: 950,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                }}
              >
                {language === "it"
                  ? "IMPATTO POTENZIALE"
                  : "POTENTIAL IMPACT"}
              </div>

              <div
                style={{
                  marginTop: 12,
                  color: "#22c55e",
                  fontSize: 37,
                  lineHeight: 1,
                  fontWeight: 950,
                  letterSpacing: "-0.04em",
                }}
              >
                +{money(annualOpportunity)}
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
            </section>
          </aside>
        </div>

        <div
          style={{
            marginTop: 26,
            display: "grid",
            gridTemplateColumns: "0.78fr 1.22fr",
            gap: 22,
          }}
        >
          <section
            className="panel"
            style={{ margin: 0, padding: 24 }}
          >
            <div className="panel-eyebrow">
              {language === "it"
                ? "VITTORIE RAPIDE"
                : "QUICK WINS"}
            </div>

            <h2
              className="panel-title"
              style={{ marginTop: 6 }}
            >
              {language === "it"
                ? "Più valore con meno lavoro"
                : "More value with less work"}
            </h2>

            <div
              style={{
                marginTop: 18,
                display: "grid",
                gap: 11,
              }}
            >
              {quickWins.length > 0 ? (
                quickWins.map((alert) => (
                  <button
                    key={alert.id}
                    type="button"
                    onClick={() => navigate(alert.route)}
                    style={{
                      width: "100%",
                      cursor: "pointer",
                      textAlign: "left",
                      padding: 15,
                      borderRadius: 17,
                      background:
                        "rgba(255,255,255,0.035)",
                      border:
                        "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <TinyBadge color="#38bdf8">
                        {alert.estimatedMinutes} min
                      </TinyBadge>

                      <strong
                        style={{
                          color: "#22c55e",
                          fontSize: 18,
                        }}
                      >
                        {alert.monthlyImpact > 0
                          ? `+${money(alert.monthlyImpact)}`
                          : "→"}
                      </strong>
                    </div>

                    <div
                      style={{
                        marginTop: 11,
                        color: "#f8fafc",
                        fontSize: 14,
                        fontWeight: 900,
                      }}
                    >
                      {alert.title}
                    </div>

                    <div
                      style={{
                        marginTop: 5,
                        color: "rgba(255,255,255,0.46)",
                        fontSize: 10,
                        fontWeight: 750,
                      }}
                    >
                      {alert.actionLabel} →
                    </div>
                  </button>
                ))
              ) : (
                <div
                  style={{
                    padding: 18,
                    borderRadius: 16,
                    color: "rgba(255,255,255,0.58)",
                    background:
                      "rgba(255,255,255,0.03)",
                    border:
                      "1px solid rgba(255,255,255,0.07)",
                    fontWeight: 760,
                  }}
                >
                  {language === "it"
                    ? "Nessuna vittoria rapida rilevata."
                    : "No quick wins detected."}
                </div>
              )}
            </div>
          </section>

          <section
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
                color: "#ff9a70",
                fontSize: 10,
                fontWeight: 950,
                letterSpacing: "0.13em",
                textTransform: "uppercase",
              }}
            >
              {language === "it"
                ? "STRATEGIA MARGINLAB"
                : "MARGINLAB STRATEGY"}
            </div>

            <h2
              style={{
                margin: "8px 0 0",
                color: "#f8fafc",
                fontSize: 22,
                fontWeight: 950,
                letterSpacing: "-0.02em",
              }}
            >
              {language === "it"
                ? "Concentra il lavoro dove il ritorno è maggiore"
                : "Focus effort where the return is highest"}
            </h2>

            <p
              style={{
                margin: "17px 0 0",
                color: "rgba(255,255,255,0.77)",
                fontSize: 14,
                lineHeight: 1.75,
                fontWeight: 730,
              }}
            >
              {strategyText}
            </p>

            <div
              style={{
                marginTop: 20,
                display: "grid",
                gridTemplateColumns: "repeat(3,minmax(0,1fr))",
                gap: 11,
              }}
            >
              <ActionMetric
                label={
                  language === "it"
                    ? "Prima priorità"
                    : "Top priority"
                }
                value={
                  topAlert?.recommendedModule ??
                  (language === "it"
                    ? "Monitoraggio"
                    : "Monitoring")
                }
                note={
                  language === "it"
                    ? "Modulo da aprire per primo"
                    : "Module to open first"
                }
              />

              <ActionMetric
                label={
                  language === "it"
                    ? "Priorità media"
                    : "Average priority"
                }
                value={`${averagePriority.toFixed(0)}/100`}
                note={
                  language === "it"
                    ? "Della coda attuale"
                    : "Across the current queue"
                }
              />

              <ActionMetric
                label={
                  language === "it"
                    ? "Tempo totale"
                    : "Total time"
                }
                value={`${totalMinutes} min`}
                note={
                  language === "it"
                    ? "Stima dell'intera coda"
                    : "Full queue estimate"
                }
              />
            </div>
          </section>
        </div>

        <section
          className="panel"
          style={{
            marginTop: 26,
            marginBottom: 24,
            padding: 24,
          }}
        >
          <div className="panel-eyebrow">
            {language === "it"
              ? "PIANIFICAZIONE"
              : "ACTION PLANNING"}
          </div>

          <h2
            className="panel-title"
            style={{ marginTop: 6 }}
          >
            {language === "it"
              ? "Come organizzare le priorità attuali"
              : "How to organize current priorities"}
          </h2>

          <div
            style={{
              marginTop: 21,
              display: "grid",
              gridTemplateColumns:
                "repeat(4,minmax(0,1fr))",
              gap: 14,
            }}
          >
            {(
              ["now", "next", "planned", "monitor"] as ActionStage[]
            ).map((stage) => {
              const alerts = queueAlerts.filter(
                (alert) => getActionStage(alert) === stage,
              );

              const stageColor =
                stage === "now"
                  ? "#ff6b4a"
                  : stage === "next"
                    ? "#f59e0b"
                    : stage === "planned"
                      ? "#22c55e"
                      : "#38bdf8";

              return (
                <div
                  key={stage}
                  style={{
                    minHeight: 190,
                    padding: 17,
                    borderRadius: 19,
                    background:
                      "rgba(255,255,255,0.03)",
                    border:
                      "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <div
                    style={{
                      color: stageColor,
                      fontSize: 10,
                      fontWeight: 950,
                      textTransform: "uppercase",
                      letterSpacing: "0.11em",
                    }}
                  >
                    {stageLabels[stage]}
                  </div>

                  <div
                    style={{
                      marginTop: 13,
                      display: "grid",
                      gap: 9,
                    }}
                  >
                    {alerts.length > 0 ? (
                      alerts.map((alert) => (
                        <button
                          key={alert.id}
                          type="button"
                          onClick={() => navigate(alert.route)}
                          style={{
                            cursor: "pointer",
                            textAlign: "left",
                            padding: 12,
                            borderRadius: 13,
                            background:
                              "rgba(255,255,255,0.035)",
                            border:
                              "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          <div
                            style={{
                              color: "#f8fafc",
                              fontSize: 11,
                              fontWeight: 870,
                              lineHeight: 1.4,
                            }}
                          >
                            {alert.title}
                          </div>

                          <div
                            style={{
                              marginTop: 6,
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 8,
                              color: "rgba(255,255,255,0.42)",
                              fontSize: 9,
                              fontWeight: 800,
                            }}
                          >
                            <span>
                              {alert.estimatedMinutes} min
                            </span>

                            <span style={{ color: stageColor }}>
                              {alert.monthlyImpact > 0
                                ? money(alert.monthlyImpact)
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
                          fontSize: 10,
                          fontWeight: 750,
                          background:
                            "rgba(255,255,255,0.02)",
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
        </section>

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
            ? "Le opportunità sono stime costruite sui dati Shopify del periodo selezionato. Le attività segnate come completate rappresentano potenziale affrontato, non profitto già verificato. MarginLab non modifica automaticamente prodotti, prezzi, costi o campagne."
            : "Opportunities are estimates built from Shopify data for the selected period. Actions marked complete represent addressed potential, not verified recovered profit. MarginLab does not automatically change products, pricing, costs or campaigns."}
        </div>
      </div>
    </div>
  );
}