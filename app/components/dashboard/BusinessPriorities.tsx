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

type Language = "it" | "en";

type ActionStyle = {
  label: string;
  color: string;
  background: string;
  border: string;
  icon: string;
};

function getActionStyle(
  action: ProfitBusinessAction,
  language: Language,
): ActionStyle {
  const styles: Record<ProfitBusinessAction, ActionStyle> = {
    action: {
      label: language === "it" ? "Intervieni" : "Action",
      color: "#ff7b61",
      background: "rgba(255,107,74,0.10)",
      border: "rgba(255,107,74,0.28)",
      icon: "!",
    },
    review: {
      label: language === "it" ? "Controlla" : "Review",
      color: "#fbbf24",
      background: "rgba(245,158,11,0.10)",
      border: "rgba(245,158,11,0.26)",
      icon: "◌",
    },
    optimize: {
      label: language === "it" ? "Ottimizza" : "Optimize",
      color: "#4ade80",
      background: "rgba(34,197,94,0.10)",
      border: "rgba(34,197,94,0.26)",
      icon: "↗",
    },
    monitor: {
      label: language === "it" ? "Monitora" : "Monitor",
      color: "#7dd3fc",
      background: "rgba(56,189,248,0.10)",
      border: "rgba(56,189,248,0.26)",
      icon: "◉",
    },
  };

  return styles[action];
}

function getEffortLabel(
  effort: ProfitAlertEffort,
  language: Language,
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
  if (alerts.some((alert) => alert.businessAction === "action")) {
    return { key: "action", color: "#ff6b4a" } as const;
  }

  if (alerts.some((alert) => alert.businessAction === "review")) {
    return { key: "review", color: "#f59e0b" } as const;
  }

  if (alerts.some((alert) => alert.businessAction === "optimize")) {
    return { key: "optimize", color: "#22c55e" } as const;
  }

  return { key: "stable", color: "#38bdf8" } as const;
}

function Metric({
  label,
  value,
  color = "#f8fafc",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      style={{
        minWidth: 0,
        padding: 12,
        borderRadius: 14,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div
        style={{
          color: "rgba(255,255,255,0.38)",
          fontSize: 8,
          fontWeight: 950,
          textTransform: "uppercase",
          letterSpacing: "0.09em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          color,
          fontSize: 14,
          fontWeight: 950,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function PriorityBadge({
  alert,
  language,
}: {
  alert: ProfitAlert;
  language: Language;
}) {
  const style = getActionStyle(alert.businessAction, language);

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "7px 10px",
        borderRadius: 999,
        color: style.color,
        background: style.background,
        border: `1px solid ${style.border}`,
        fontSize: 9,
        fontWeight: 950,
        textTransform: "uppercase",
        letterSpacing: "0.09em",
      }}
    >
      <span>{style.icon}</span>
      <span>{style.label}</span>
    </div>
  );
}

function MainPriority({
  alert,
  language,
  navigate,
}: {
  alert: ProfitAlert;
  language: Language;
  navigate: (path: string) => void;
}) {
  const style = getActionStyle(alert.businessAction, language);

  return (
    <article
      style={{
        position: "relative",
        overflow: "hidden",
        minHeight: 390,
        padding: 24,
        borderRadius: 23,
        background: `radial-gradient(circle at 85% 15%, ${style.background}, transparent 36%), linear-gradient(145deg, rgba(18,25,40,0.99), rgba(6,11,20,0.99))`,
        border: `1px solid ${style.border}`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div
            style={{
              width: 42,
              height: 42,
              display: "grid",
              placeItems: "center",
              borderRadius: 14,
              color: style.color,
              background: style.background,
              border: `1px solid ${style.border}`,
              fontWeight: 950,
            }}
          >
            1
          </div>
          <PriorityBadge alert={alert} language={language} />
        </div>

        <div
          style={{
            color: "rgba(255,255,255,0.42)",
            fontSize: 10,
            fontWeight: 900,
          }}
        >
          {language === "it" ? "Priorità" : "Priority"} {alert.priority}/100
        </div>
      </div>

      <div
        style={{
          marginTop: 22,
          color: "#f8fafc",
          fontSize: 25,
          fontWeight: 950,
          lineHeight: 1.2,
          letterSpacing: "-0.035em",
        }}
      >
        {alert.title}
      </div>

      <div
        style={{
          marginTop: 11,
          color: "rgba(255,255,255,0.66)",
          fontSize: 13,
          lineHeight: 1.68,
          fontWeight: 730,
        }}
      >
        {alert.description}
      </div>

      {alert.productTitle && (
        <div
          style={{
            marginTop: 16,
            padding: 13,
            borderRadius: 15,
            background: "rgba(255,255,255,0.03)",
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
            {language === "it" ? "Prodotto coinvolto" : "Related product"}
          </div>
          <div
            style={{
              marginTop: 5,
              color: "#f8fafc",
              fontSize: 13,
              fontWeight: 900,
            }}
          >
            {alert.productTitle}
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "repeat(3,minmax(0,1fr))",
          gap: 10,
        }}
      >
        <Metric
          label={language === "it" ? "Impatto" : "Impact"}
          value={
            alert.monthlyImpact > 0
              ? `${alert.businessAction === "optimize" ? "+" : ""}${money(alert.monthlyImpact)}`
              : language === "it"
                ? "Qualitativo"
                : "Qualitative"
          }
          color={alert.monthlyImpact > 0 ? style.color : "#f8fafc"}
        />
        <Metric
          label={language === "it" ? "Difficoltà" : "Effort"}
          value={getEffortLabel(alert.effort, language)}
        />
        <Metric
          label={language === "it" ? "Tempo" : "Time"}
          value={`${alert.estimatedMinutes} min`}
          color="#7dd3fc"
        />
      </div>

      <div
        style={{
          marginTop: "auto",
          paddingTop: 18,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
          borderTop: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <div>
          <div
            style={{
              color: "rgba(255,255,255,0.36)",
              fontSize: 8,
              fontWeight: 950,
              textTransform: "uppercase",
              letterSpacing: "0.09em",
            }}
          >
            {language === "it" ? "Modulo consigliato" : "Recommended module"}
          </div>
          <div
            style={{
              marginTop: 5,
              color: "#f8fafc",
              fontSize: 13,
              fontWeight: 900,
            }}
          >
            {alert.recommendedModule}
          </div>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={() => navigate(alert.route)}
        >
          {alert.actionLabel} →
        </button>
      </div>
    </article>
  );
}

function SecondaryPriority({
  alert,
  index,
  language,
  navigate,
}: {
  alert: ProfitAlert;
  index: number;
  language: Language;
  navigate: (path: string) => void;
}) {
  const style = getActionStyle(alert.businessAction, language);

  return (
    <article
      style={{
        minHeight: 188,
        padding: 18,
        borderRadius: 20,
        background:
          "linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))",
        border: `1px solid ${style.border}`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div
            style={{
              width: 34,
              height: 34,
              display: "grid",
              placeItems: "center",
              borderRadius: 11,
              color: style.color,
              background: style.background,
              border: `1px solid ${style.border}`,
              fontWeight: 950,
            }}
          >
            {index + 1}
          </div>
          <PriorityBadge alert={alert} language={language} />
        </div>
        <div
          style={{
            color: "rgba(255,255,255,0.38)",
            fontSize: 9,
            fontWeight: 900,
          }}
        >
          {alert.priority}/100
        </div>
      </div>

      <div
        style={{
          marginTop: 13,
          color: "#f8fafc",
          fontSize: 16,
          fontWeight: 950,
          lineHeight: 1.3,
        }}
      >
        {alert.title}
      </div>

      <div
        style={{
          marginTop: 7,
          color: "rgba(255,255,255,0.54)",
          fontSize: 11,
          lineHeight: 1.5,
          fontWeight: 720,
        }}
      >
        {alert.description}
      </div>

      <div
        style={{
          marginTop: "auto",
          paddingTop: 13,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          borderTop: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <div>
          <div style={{ color: style.color, fontSize: 15, fontWeight: 950 }}>
            {alert.monthlyImpact > 0
              ? `${alert.businessAction === "optimize" ? "+" : ""}${money(alert.monthlyImpact)}`
              : getEffortLabel(alert.effort, language)}
          </div>
          <div
            style={{
              marginTop: 3,
              color: "rgba(255,255,255,0.38)",
              fontSize: 9,
              fontWeight: 800,
            }}
          >
            {alert.estimatedMinutes} min · {alert.recommendedModule}
          </div>
        </div>

        <button
          type="button"
          className="apply-button"
          onClick={() => navigate(alert.route)}
        >
          {language === "it" ? "Apri" : "Open"} →
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
  const language: Language = getStoredLanguage() === "it" ? "it" : "en";

  const displayedPriorities = React.useMemo(() => {
    const active = [...alerts]
      .filter(
        (alert) =>
          alert.businessAction !== "monitor" || alerts.length === 1,
      )
      .sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return b.monthlyImpact - a.monthlyImpact;
      })
      .slice(0, maxItems);

    return active.length > 0 ? active : alerts.slice(0, maxItems);
  }, [alerts, maxItems]);

  const businessStatus = getBusinessStatus(alerts);
  const mainPriority = displayedPriorities[0];
  const secondaryPriorities = displayedPriorities.slice(1, 3);
  const highestImpact = displayedPriorities.reduce(
    (highest, alert) => Math.max(highest, alert.monthlyImpact),
    0,
  );

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
        ? "Una criticità significativa merita una decisione prioritaria."
        : businessStatus.key === "review"
          ? "Non emerge un'emergenza generalizzata, ma alcuni aspetti richiedono verifica."
          : businessStatus.key === "optimize"
            ? "La struttura è stabile: le priorità attuali riguardano il miglioramento."
            : "Nessuna criticità significativa richiede un intervento immediato."
      : businessStatus.key === "action"
        ? "A significant issue currently deserves a prioritized decision."
        : businessStatus.key === "review"
          ? "There is no broad emergency, but some areas require verification."
          : businessStatus.key === "optimize"
            ? "The business is stable; current priorities focus on improvement."
            : "No significant issue currently requires immediate action.";

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
            {language === "it" ? "PRIORITÀ DI BUSINESS" : "BUSINESS PRIORITIES"}
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
              ? "MarginLab distingue ciò che richiede un intervento da ciò che può essere semplicemente controllato o ottimizzato."
              : "MarginLab separates what requires action from what should simply be reviewed, optimized or monitored."}
          </div>
        </div>

        <div
          style={{
            minWidth: 225,
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
            {language === "it" ? "Stato del business" : "Business status"}
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

      {mainPriority ? (
        <div
          style={{
            marginTop: 22,
            display: "grid",
            gridTemplateColumns:
              secondaryPriorities.length > 0 ? "1.35fr 0.65fr" : "1fr",
            gap: 14,
          }}
        >
          <MainPriority
            alert={mainPriority}
            language={language}
            navigate={navigate}
          />

          {secondaryPriorities.length > 0 && (
            <div style={{ display: "grid", gap: 14 }}>
              {secondaryPriorities.map((alert, index) => (
                <SecondaryPriority
                  key={alert.id}
                  alert={alert}
                  index={index + 1}
                  language={language}
                  navigate={navigate}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            marginTop: 22,
            padding: 22,
            borderRadius: 20,
            color: "#86efac",
            background: "rgba(34,197,94,0.07)",
            border: "1px solid rgba(34,197,94,0.18)",
            fontWeight: 800,
          }}
        >
          {language === "it"
            ? "Nessuna priorità significativa rilevata."
            : "No significant business priorities detected."}
        </div>
      )}

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
              ? "Impatto mensile più elevato rilevato"
              : "Highest detected monthly impact"}
          </div>
          <div
            style={{
              marginTop: 6,
              color: highestImpact > 0 ? "#22c55e" : "#f8fafc",
              fontSize: 25,
              fontWeight: 950,
            }}
          >
            {highestImpact > 0 ? money(highestImpact) : "—"}
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