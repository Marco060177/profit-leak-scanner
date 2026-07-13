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
  return {
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
      border: "rgba(245,158,11,0.25)",
      icon: "◌",
    },
    optimize: {
      label: language === "it" ? "Ottimizza" : "Optimize",
      color: "#4ade80",
      background: "rgba(34,197,94,0.10)",
      border: "rgba(34,197,94,0.25)",
      icon: "↗",
    },
    monitor: {
      label: language === "it" ? "Monitora" : "Monitor",
      color: "#7dd3fc",
      background: "rgba(56,189,248,0.10)",
      border: "rgba(56,189,248,0.25)",
      icon: "◉",
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

function getBusinessStatus(alerts: ProfitAlert[]) {
  if (alerts.some((alert) => alert.businessAction === "action")) {
    return { key: "action", color: "#ff6b4a" };
  }

  if (alerts.some((alert) => alert.businessAction === "review")) {
    return { key: "review", color: "#f59e0b" };
  }

  if (alerts.some((alert) => alert.businessAction === "optimize")) {
    return { key: "optimize", color: "#22c55e" };
  }

  return { key: "stable", color: "#38bdf8" };
}

function getModuleButtonLabel(
  alert: ProfitAlert,
  language: "it" | "en",
) {
  if (language === "en") {
    return `Open ${alert.recommendedModule}`;
  }

  if (alert.recommendedModule === "Recovery Simulator") {
    return "Apri Recovery Simulator";
  }

  if (alert.recommendedModule === "Profit Intelligence") {
    return "Apri Analisi Profitti";
  }

  if (alert.recommendedModule === "Products") {
    return "Apri Prodotti";
  }

  if (alert.recommendedModule === "Profit Action Center") {
    return "Apri Profit Action Center";
  }

  if (alert.recommendedModule === "Profit Forecast") {
    return "Apri Previsioni";
  }

  if (alert.recommendedModule === "Profit Copilot") {
    return "Apri Profit Copilot";
  }

  return alert.actionLabel;
}

function MetricBox({
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
          marginTop: 7,
          color,
          fontSize: 15,
          fontWeight: 950,
          lineHeight: 1.15,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function PrimaryPriorityCard({
  alert,
  language,
  navigate,
}: {
  alert: ProfitAlert;
  language: "it" | "en";
  navigate: (path: string) => void;
}) {
  const style = getActionStyle(alert.businessAction, language);

  return (
    <article
      style={{
        position: "relative",
        overflow: "hidden",
        minHeight: 455,
        padding: 25,
        borderRadius: 24,
        background:
          "radial-gradient(circle at 16% 10%, rgba(255,115,80,0.12), transparent 34%), linear-gradient(150deg, rgba(17,24,39,0.99), rgba(6,11,20,0.99))",
        border: `1px solid ${style.border}`,
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.04), 0 24px 60px rgba(0,0,0,0.28)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -70,
          right: -55,
          width: 220,
          height: 220,
          borderRadius: "50%",
          background: style.background,
          filter: "blur(18px)",
        }}
      />

      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "space-between",
          gap: 14,
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 11px",
            borderRadius: 999,
            color: style.color,
            background: style.background,
            border: `1px solid ${style.border}`,
            fontSize: 9,
            fontWeight: 950,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          {style.icon}{" "}
          {language === "it"
            ? "Priorità principale"
            : "Primary priority"}
        </div>

        <div
          style={{
            color: "rgba(255,255,255,0.42)",
            fontSize: 10,
            fontWeight: 900,
          }}
        >
          {language === "it" ? "Priorità" : "Priority"}{" "}
          {alert.priority}/100
        </div>
      </div>

      <div
        style={{
          position: "relative",
          marginTop: 18,
          color: style.color,
          fontSize: 10,
          fontWeight: 950,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
        }}
      >
        {style.label}
      </div>

      <div
        style={{
          position: "relative",
          marginTop: 9,
          color: "#f8fafc",
          fontSize: 27,
          fontWeight: 950,
          lineHeight: 1.18,
          letterSpacing: "-0.035em",
        }}
      >
        {alert.title}
      </div>

      <div
        style={{
          position: "relative",
          marginTop: 12,
          color: "rgba(255,255,255,0.65)",
          fontSize: 13,
          fontWeight: 720,
          lineHeight: 1.7,
        }}
      >
        {alert.description}
      </div>

      {alert.productTitle && (
        <div
          style={{
            position: "relative",
            marginTop: 15,
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
            {language === "it"
              ? "Prodotto coinvolto"
              : "Related product"}
          </div>

          <div
            style={{
              marginTop: 6,
              color: "#f8fafc",
              fontSize: 14,
              fontWeight: 900,
            }}
          >
            {alert.productTitle}
          </div>
        </div>
      )}

      <div
        style={{
          position: "relative",
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "repeat(3,minmax(0,1fr))",
          gap: 10,
        }}
      >
        <MetricBox
          label={language === "it" ? "Impatto" : "Impact"}
          value={
            alert.monthlyImpact > 0
              ? `${alert.businessAction === "optimize" ? "+" : ""}${money(
                  alert.monthlyImpact,
                )}`
              : language === "it"
                ? "Qualitativo"
                : "Qualitative"
          }
          color={
            alert.businessAction === "optimize"
              ? "#22c55e"
              : style.color
          }
        />

        <MetricBox
          label={
            language === "it" ? "Difficoltà" : "Effort"
          }
          value={getEffortLabel(alert.effort, language)}
        />

        <MetricBox
          label={language === "it" ? "Tempo" : "Time"}
          value={`${alert.estimatedMinutes} min`}
          color="#7dd3fc"
        />
      </div>

      <div
        style={{
          position: "relative",
          marginTop: "auto",
          paddingTop: 20,
        }}
      >
        <div
          style={{
            marginBottom: 12,
            color: "rgba(255,255,255,0.38)",
            fontSize: 8,
            fontWeight: 950,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          {language === "it"
            ? "Modulo consigliato"
            : "Recommended module"}
          :{" "}
          <strong style={{ color: "#f8fafc" }}>
            {alert.recommendedModule}
          </strong>
        </div>

        <button
          type="button"
          className="primary-button"
          style={{ width: "100%", justifyContent: "center" }}
          onClick={() => navigate(alert.route)}
        >
          {getModuleButtonLabel(alert, language)} →
        </button>
      </div>
    </article>
  );
}

function SecondaryPriorityCard({
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
  const style = getActionStyle(alert.businessAction, language);

  return (
    <article
      style={{
        position: "relative",
        overflow: "hidden",
        flex: 1,
        minHeight: 220,
        padding: 19,
        borderRadius: 21,
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
          gap: 10,
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            color: style.color,
            fontSize: 9,
            fontWeight: 950,
            textTransform: "uppercase",
            letterSpacing: "0.09em",
          }}
        >
          <span
            style={{
              width: 27,
              height: 27,
              display: "grid",
              placeItems: "center",
              borderRadius: 9,
              background: style.background,
              border: `1px solid ${style.border}`,
            }}
          >
            {index + 1}
          </span>
          {style.label}
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
          fontSize: 17,
          fontWeight: 950,
          lineHeight: 1.28,
        }}
      >
        {alert.title}
      </div>

      <div
        style={{
          marginTop: 7,
          color: "rgba(255,255,255,0.55)",
          fontSize: 11,
          fontWeight: 720,
          lineHeight: 1.5,
        }}
      >
        {alert.description}
      </div>

      <div
        style={{
          marginTop: 13,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 9,
        }}
      >
        <MetricBox
          label={language === "it" ? "Impatto" : "Impact"}
          value={
            alert.monthlyImpact > 0
              ? `${alert.businessAction === "optimize" ? "+" : ""}${money(
                  alert.monthlyImpact,
                )}`
              : language === "it"
                ? "Qualitativo"
                : "Qualitative"
          }
          color={
            alert.businessAction === "optimize"
              ? "#22c55e"
              : style.color
          }
        />

        <MetricBox
          label={language === "it" ? "Tempo" : "Time"}
          value={`${alert.estimatedMinutes} min`}
          color="#7dd3fc"
        />
      </div>

      <div style={{ marginTop: "auto", paddingTop: 14 }}>
        <button
          type="button"
          className="apply-button"
          style={{ width: "100%", justifyContent: "center" }}
          onClick={() => navigate(alert.route)}
        >
          {getModuleButtonLabel(alert, language)} →
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

  const displayedPriorities =
    priorities.length > 0
      ? priorities
      : alerts.slice(0, maxItems);

  const primaryPriority = displayedPriorities[0];
  const secondaryPriorities = displayedPriorities.slice(1, 3);
  const businessStatus = getBusinessStatus(alerts);

  const statusText =
    language === "it"
      ? businessStatus.key === "action"
        ? "Intervento richiesto"
        : businessStatus.key === "review"
          ? "Da controllare"
          : businessStatus.key === "optimize"
            ? "Ottimizzazione disponibile"
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
        ? "Esiste almeno una criticità significativa che merita una decisione prioritaria."
        : businessStatus.key === "review"
          ? "Non emerge un'emergenza generale, ma alcuni aspetti devono essere verificati."
          : businessStatus.key === "optimize"
            ? "La struttura è stabile. Le priorità attuali riguardano il miglioramento."
            : "Nessuna criticità significativa richiede un intervento immediato."
      : businessStatus.key === "action"
        ? "At least one significant issue currently requires a prioritized decision."
        : businessStatus.key === "review"
          ? "There is no broad emergency, but some areas should be reviewed."
          : businessStatus.key === "optimize"
            ? "The business is stable. Current priorities focus on improvement."
            : "No significant profitability issue requires immediate action.";

  const visibleImpact = displayedPriorities.reduce(
    (sum, alert) =>
      sum + Math.max(0, alert.monthlyImpact),
    0,
  );

  if (!primaryPriority) {
    return null;
  }

  return (
    <section
      style={{
        marginTop: 24,
        padding: 28,
        borderRadius: 29,
        background:
          "radial-gradient(circle at 10% 8%, rgba(255,115,80,0.12), transparent 30%), radial-gradient(circle at 92% 18%, rgba(34,197,94,0.08), transparent 30%), linear-gradient(135deg, rgba(15,23,36,0.99), rgba(6,11,20,0.99))",
        border: "1px solid rgba(255,115,60,0.23)",
        boxShadow:
          "0 28px 84px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.035)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) 260px",
          gap: 20,
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
              marginTop: 8,
              color: "#f8fafc",
              fontSize: 29,
              fontWeight: 950,
              lineHeight: 1.2,
              letterSpacing: "-0.04em",
            }}
          >
            {language === "it"
              ? "Le decisioni che meritano attenzione adesso"
              : "The decisions that deserve attention now"}
          </div>

          <div
            style={{
              marginTop: 8,
              maxWidth: 760,
              color: "rgba(255,255,255,0.57)",
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
            padding: 17,
            borderRadius: 19,
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
              marginTop: 8,
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
          gridTemplateColumns:
            secondaryPriorities.length > 0
              ? "minmax(0,1.45fr) minmax(280px,0.75fr)"
              : "1fr",
          gap: 16,
        }}
      >
        <PrimaryPriorityCard
          alert={primaryPriority}
          language={language}
          navigate={navigate}
        />

        {secondaryPriorities.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {secondaryPriorities.map((alert, index) => (
              <SecondaryPriorityCard
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

      <div
        style={{
          marginTop: 17,
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 16,
          alignItems: "center",
          padding: 18,
          borderRadius: 18,
          background:
            "linear-gradient(90deg, rgba(34,197,94,0.08), rgba(255,255,255,0.025))",
          border: "1px solid rgba(34,197,94,0.17)",
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
              marginTop: 7,
              color: "#22c55e",
              fontSize: 31,
              lineHeight: 1,
              fontWeight: 950,
              letterSpacing: "-0.04em",
            }}
          >
            +{money(visibleImpact)}
          </div>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={() => navigate("/app/recommendations")}
        >
          {language === "it"
            ? "Apri Profit Action Center →"
            : "Open Profit Action Center →"}
        </button>
      </div>
    </section>
  );
}