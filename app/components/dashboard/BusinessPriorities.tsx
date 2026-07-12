import * as React from "react";

import type {
  ProfitAlert,
  ProfitAlertEffort,
  ProfitBusinessAction,
} from "~/utils/profit-monitor";

import { getStoredLanguage } from "~/utils/i18n";
import { money } from "~/utils/margin";

type Props = {
  alerts: ProfitAlert[];
  navigate: (path: string) => void;
  maxItems?: number;
};

type ActionStyle = {
  label: string;
  color: string;
  background: string;
  border: string;
  icon: string;
};

function getActionStyle(
  action: ProfitBusinessAction,
  language: "it" | "en",
): ActionStyle {
  const styles: Record<ProfitBusinessAction, ActionStyle> = {
    action: {
      label: language === "it" ? "Intervieni" : "Action",
      color: "#ff7b61",
      background: "rgba(255,107,74,0.10)",
      border: "rgba(255,107,74,0.26)",
      icon: "!",
    },

    review: {
      label: language === "it" ? "Controlla" : "Review",
      color: "#fbbf24",
      background: "rgba(245,158,11,0.10)",
      border: "rgba(245,158,11,0.24)",
      icon: "◌",
    },

    optimize: {
      label: language === "it" ? "Ottimizza" : "Optimize",
      color: "#4ade80",
      background: "rgba(34,197,94,0.10)",
      border: "rgba(34,197,94,0.24)",
      icon: "↗",
    },

    monitor: {
      label: language === "it" ? "Monitora" : "Monitor",
      color: "#7dd3fc",
      background: "rgba(56,189,248,0.10)",
      border: "rgba(56,189,248,0.24)",
      icon: "◉",
    },
  };

  return styles[action];
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

function getBusinessStatus(alerts: ProfitAlert[]) {
  const actionCount = alerts.filter(
    (alert) => alert.businessAction === "action",
  ).length;

  const reviewCount = alerts.filter(
    (alert) => alert.businessAction === "review",
  ).length;

  const optimizeCount = alerts.filter(
    (alert) => alert.businessAction === "optimize",
  ).length;

  if (actionCount > 0) {
    return {
      key: "action",
      color: "#ff6b4a",
    };
  }

  if (reviewCount > 0) {
    return {
      key: "review",
      color: "#f59e0b",
    };
  }

  if (optimizeCount > 0) {
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

function PriorityCard({
  alert,
  index,
  language,
  navigate,
}: {
  alert: ProfitAlert;
  index: number;
  language: "it" | "en";
  navigate: (path: string) => void;
}) {
  const actionStyle = getActionStyle(
    alert.businessAction,
    language,
  );

  return (
    <article
      style={{
        position: "relative",
        overflow: "hidden",
        padding: 20,
        borderRadius: 21,
        background:
          "linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))",
        border: `1px solid ${actionStyle.border}`,
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -40,
          right: -30,
          width: 120,
          height: 120,
          borderRadius: "50%",
          background: actionStyle.background,
          filter: "blur(10px)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 11,
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              borderRadius: 13,
              color: actionStyle.color,
              background: actionStyle.background,
              border: `1px solid ${actionStyle.border}`,
              fontSize: 14,
              fontWeight: 950,
            }}
          >
            {index + 1}
          </div>

          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 9px",
                borderRadius: 999,
                color: actionStyle.color,
                background: actionStyle.background,
                border: `1px solid ${actionStyle.border}`,
                fontSize: 9,
                fontWeight: 950,
                textTransform: "uppercase",
                letterSpacing: "0.09em",
              }}
            >
              <span>{actionStyle.icon}</span>
              <span>{actionStyle.label}</span>
            </div>
          </div>
        </div>

        <div
          style={{
            color: "rgba(255,255,255,0.38)",
            fontSize: 10,
            fontWeight: 900,
            whiteSpace: "nowrap",
          }}
        >
          {language === "it" ? "Priorità" : "Priority"}{" "}
          {alert.priority}/100
        </div>
      </div>

      <div
        style={{
          position: "relative",
          marginTop: 16,
          color: "#f8fafc",
          fontSize: 18,
          fontWeight: 950,
          lineHeight: 1.3,
          letterSpacing: "-0.02em",
        }}
      >
        {alert.title}
      </div>

      <div
        style={{
          position: "relative",
          marginTop: 8,
          color: "rgba(255,255,255,0.60)",
          fontSize: 12,
          fontWeight: 720,
          lineHeight: 1.6,
        }}
      >
        {alert.description}
      </div>

      {alert.productTitle && (
        <div
          style={{
            position: "relative",
            marginTop: 13,
            padding: 11,
            borderRadius: 13,
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div
            style={{
              color: "rgba(255,255,255,0.38)",
              fontSize: 8,
              fontWeight: 950,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            {language === "it"
              ? "Prodotto coinvolto"
              : "Related product"}
          </div>

          <div
            style={{
              marginTop: 5,
              color: "#f8fafc",
              fontSize: 12,
              fontWeight: 900,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {alert.productTitle}
          </div>
        </div>
      )}

      <div
        style={{
          position: "relative",
          marginTop: 15,
          display: "grid",
          gridTemplateColumns: "repeat(3,minmax(0,1fr))",
          gap: 9,
        }}
      >
        <div
          style={{
            padding: 11,
            borderRadius: 13,
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div
            style={{
              color: "rgba(255,255,255,0.36)",
              fontSize: 8,
              fontWeight: 950,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {language === "it" ? "Impatto" : "Impact"}
          </div>

          <div
            style={{
              marginTop: 6,
              color:
                alert.monthlyImpact > 0
                  ? alert.businessAction === "optimize"
                    ? "#22c55e"
                    : actionStyle.color
                  : "#f8fafc",
              fontSize: 15,
              fontWeight: 950,
            }}
          >
            {alert.monthlyImpact > 0
              ? `${alert.businessAction === "optimize" ? "+" : ""}${money(
                  alert.monthlyImpact,
                )}`
              : language === "it"
                ? "Qualitativo"
                : "Qualitative"}
          </div>
        </div>

        <div
          style={{
            padding: 11,
            borderRadius: 13,
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div
            style={{
              color: "rgba(255,255,255,0.36)",
              fontSize: 8,
              fontWeight: 950,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {language === "it" ? "Difficoltà" : "Effort"}
          </div>

          <div
            style={{
              marginTop: 6,
              color: "#f8fafc",
              fontSize: 13,
              fontWeight: 900,
            }}
          >
            {getEffortLabel(alert.effort, language)}
          </div>
        </div>

        <div
          style={{
            padding: 11,
            borderRadius: 13,
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div
            style={{
              color: "rgba(255,255,255,0.36)",
              fontSize: 8,
              fontWeight: 950,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {language === "it" ? "Tempo" : "Time"}
          </div>

          <div
            style={{
              marginTop: 6,
              color: "#7dd3fc",
              fontSize: 13,
              fontWeight: 900,
            }}
          >
            {alert.estimatedMinutes} min
          </div>
        </div>
      </div>

      <div
        style={{
          position: "relative",
          marginTop: 15,
          paddingTop: 14,
          borderTop: "1px solid rgba(255,255,255,0.07)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              color: "rgba(255,255,255,0.35)",
              fontSize: 8,
              fontWeight: 950,
              textTransform: "uppercase",
              letterSpacing: "0.09em",
            }}
          >
            {language === "it"
              ? "Modulo consigliato"
              : "Recommended module"}
          </div>

          <div
            style={{
              marginTop: 4,
              color: "#f8fafc",
              fontSize: 12,
              fontWeight: 900,
            }}
          >
            {alert.recommendedModule}
          </div>
        </div>

        <button
          type="button"
          className="apply-button"
          onClick={() => navigate(alert.route)}
        >
          {alert.actionLabel} →
        </button>
      </div>
    </article>
  );
}

export default function BusinessPriorities({
  alerts,
  navigate,
  maxItems = 3,
}: Props) {
  const language =
    getStoredLanguage() === "it" ? "it" : "en";

  const priorities = React.useMemo(
    () =>
      [...alerts]
        .filter(
          (alert) =>
            alert.businessAction !== "monitor" ||
            alerts.length === 1,
        )
        .sort((a, b) => {
          if (b.priority !== a.priority) {
            return b.priority - a.priority;
          }

          return b.monthlyImpact - a.monthlyImpact;
        })
        .slice(0, maxItems),
    [alerts, maxItems],
  );

  const fallbackPriorities =
    priorities.length > 0
      ? priorities
      : alerts.slice(0, maxItems);

  const displayedPriorities = fallbackPriorities;

  const businessStatus = getBusinessStatus(alerts);

  const statusText =
    language === "it"
      ? businessStatus.key === "action"
        ? "Intervento richiesto"
        : businessStatus.key === "review"
          ? "Da controllare"
          : businessStatus.key === "optimize"
            ? "Ottimizzazione possibile"
            : "Situazione stabile"
      : businessStatus.key === "action"
        ? "Action required"
        : businessStatus.key === "review"
          ? "Review needed"
          : businessStatus.key === "optimize"
            ? "Optimization available"
            : "Stable status";

  const statusDescription =
    language === "it"
      ? businessStatus.key === "action"
        ? "Esistono criticità significative che meritano una decisione prioritaria."
        : businessStatus.key === "review"
          ? "Non emerge un'emergenza generalizzata, ma alcuni aspetti richiedono verifica."
          : businessStatus.key === "optimize"
            ? "La struttura è relativamente stabile. Le priorità attuali riguardano il miglioramento."
            : "Nessuna criticità significativa richiede un intervento immediato."
      : businessStatus.key === "action"
        ? "Significant profitability issues currently require a prioritized decision."
        : businessStatus.key === "review"
          ? "There is no broad emergency, but some areas require verification."
          : businessStatus.key === "optimize"
            ? "The business is relatively stable. Current priorities focus on improvement."
            : "No significant profitability issue requires immediate action.";

  const totalVisibleImpact = displayedPriorities.reduce(
    (sum, alert) =>
      sum + Math.max(0, alert.monthlyImpact),
    0,
  );

  return (
    <section
      style={{
        marginTop: 24,
        padding: 28,
        borderRadius: 28,
        background:
          "radial-gradient(circle at 10% 10%, rgba(255,115,80,0.12), transparent 30%), radial-gradient(circle at 90% 18%, rgba(34,197,94,0.09), transparent 30%), linear-gradient(135deg, rgba(15,23,36,0.99), rgba(6,11,20,0.99))",
        border: "1px solid rgba(255,115,60,0.22)",
        boxShadow:
          "0 26px 78px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 22,
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
              ? "PRIORITÀ DI BUSINESS"
              : "BUSINESS PRIORITIES"}
          </div>

          <div
            style={{
              marginTop: 9,
              color: "#f8fafc",
              fontSize: 28,
              fontWeight: 950,
              lineHeight: 1.2,
              letterSpacing: "-0.035em",
            }}
          >
            {language === "it"
              ? "Le decisioni che meritano attenzione adesso"
              : "The decisions that deserve attention now"}
          </div>

          <div
            style={{
              marginTop: 8,
              maxWidth: 720,
              color: "rgba(255,255,255,0.56)",
              fontSize: 13,
              lineHeight: 1.6,
              fontWeight: 720,
            }}
          >
            {language === "it"
              ? "MarginLab ordina rischi e opportunità per impatto, urgenza e impegno richiesto. Non tutte le priorità rappresentano un'emergenza."
              : "MarginLab ranks risks and opportunities by impact, urgency and required effort. Not every priority represents an emergency."}
          </div>
        </div>

        <div
          style={{
            minWidth: 220,
            padding: 16,
            borderRadius: 18,
            background: `${businessStatus.color}0D`,
            border: `1px solid ${businessStatus.color}32`,
          }}
        >
          <div
            style={{
              color: "rgba(255,255,255,0.38)",
              fontSize: 9,
              fontWeight: 950,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            {language === "it"
              ? "Stato del business"
              : "Business status"}
          </div>

          <div
            style={{
              marginTop: 7,
              color: businessStatus.color,
              fontSize: 18,
              fontWeight: 950,
            }}
          >
            {statusText}
          </div>

          <div
            style={{
              marginTop: 6,
              color: "rgba(255,255,255,0.52)",
              fontSize: 10,
              lineHeight: 1.45,
              fontWeight: 720,
            }}
          >
            {statusDescription}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 22,
          display: "grid",
          gridTemplateColumns: `repeat(${Math.max(
            1,
            displayedPriorities.length,
          )}, minmax(0,1fr))`,
          gap: 14,
        }}
      >
        {displayedPriorities.map((alert, index) => (
          <PriorityCard
            key={alert.id}
            alert={alert}
            index={index}
            language={language}
            navigate={navigate}
          />
        ))}
      </div>

      <div
        style={{
          marginTop: 18,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
          padding: 16,
          borderRadius: 17,
          background: "rgba(255,255,255,0.025)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <div>
          <div
            style={{
              color: "rgba(255,255,255,0.38)",
              fontSize: 9,
              fontWeight: 950,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            {language === "it"
              ? "Impatto mensile delle priorità mostrate"
              : "Monthly impact of displayed priorities"}
          </div>

          <div
            style={{
              marginTop: 6,
              color: "#22c55e",
              fontSize: 25,
              fontWeight: 950,
            }}
          >
            +{money(totalVisibleImpact)}
          </div>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={() => navigate("/app/recommendations")}
        >
          {language === "it"
            ? "Apri il Profit Action Center →"
            : "Open Profit Action Center →"}
        </button>
      </div>
    </section>
  );
}