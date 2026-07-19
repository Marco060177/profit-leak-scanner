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
  if (language === "en") return `Open ${alert.recommendedModule}`;

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
        padding: 14,
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
          letterSpacing: "0.09em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 7,
          color,
          fontSize: 16,
          fontWeight: 950,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function PrimaryPriority({
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
        minHeight: 560,
        overflow: "hidden",
        padding: 30,
        borderRadius: 26,
        background:
          "radial-gradient(circle at 15% 8%, rgba(255,115,80,0.16), transparent 36%), linear-gradient(150deg, rgba(17,24,39,0.99), rgba(5,10,18,0.99))",
        border: `1px solid ${style.border}`,
        boxShadow:
          "0 28px 70px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.04)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -90,
          right: -70,
          width: 280,
          height: 280,
          borderRadius: "50%",
          background: style.background,
          filter: "blur(22px)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
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
          <span>{style.icon}</span>
          <span>
            {language === "it"
              ? "Decisione principale"
              : "Primary decision"}
          </span>
        </div>

        <span
          style={{
            color: "rgba(255,255,255,0.42)",
            fontSize: 10,
            fontWeight: 900,
          }}
        >
          {language === "it" ? "Priorità" : "Priority"} {alert.priority}/100
        </span>
      </div>

      <div
        style={{
          position: "relative",
          marginTop: 24,
          color: style.color,
          fontSize: 10,
          fontWeight: 950,
          textTransform: "uppercase",
          letterSpacing: "0.13em",
        }}
      >
        {style.label}
      </div>

      <h3
        style={{
          position: "relative",
          margin: "10px 0 0",
          color: "#f8fafc",
          fontSize: 33,
          lineHeight: 1.14,
          fontWeight: 950,
          letterSpacing: "-0.045em",
        }}
      >
        {alert.title}
      </h3>

      <p
        style={{
          position: "relative",
          margin: "16px 0 0",
          maxWidth: 800,
          color: "rgba(255,255,255,0.68)",
          fontSize: 14,
          lineHeight: 1.75,
          fontWeight: 720,
        }}
      >
        {alert.description}
      </p>

      {alert.productTitle && (
        <div
          style={{
            position: "relative",
            marginTop: 20,
            padding: 15,
            borderRadius: 16,
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
              marginTop: 7,
              color: "#f8fafc",
              fontSize: 16,
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
          marginTop: 20,
          display: "grid",
          gridTemplateColumns: "repeat(3,minmax(0,1fr))",
          gap: 11,
        }}
      >
        <Metric
          label={language === "it" ? "Impatto mensile" : "Monthly impact"}
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

        <Metric
          label={language === "it" ? "Difficoltà" : "Effort"}
          value={getEffortLabel(alert.effort, language)}
        />

        <Metric
          label={language === "it" ? "Tempo stimato" : "Estimated time"}
          value={`${alert.estimatedMinutes} min`}
          color="#7dd3fc"
        />
      </div>

      <div
        style={{
          position: "relative",
          marginTop: "auto",
          paddingTop: 28,
        }}
      >
        <div
          style={{
            marginBottom: 13,
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

function SecondaryPriority({
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
        flex: 1,
        minHeight: 330,
        padding: "21px 21px 28px",
        borderRadius: 22,
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
            gap: 8,
            color: style.color,
            fontSize: 9,
            fontWeight: 950,
            textTransform: "uppercase",
            letterSpacing: "0.09em",
          }}
        >
          <span
            style={{
              width: 30,
              height: 30,
              display: "grid",
              placeItems: "center",
              borderRadius: 10,
              background: style.background,
              border: `1px solid ${style.border}`,
            }}
          >
            {index + 1}
          </span>

          <span>{style.label}</span>
        </div>

        <span
          style={{
            color: "rgba(255,255,255,0.38)",
            fontSize: 9,
            fontWeight: 900,
          }}
        >
          {alert.priority}/100
        </span>
      </div>

      <h4
        style={{
          margin: "15px 0 0",
          color: "#f8fafc",
          fontSize: 18,
          lineHeight: 1.28,
          fontWeight: 950,
        }}
      >
        {alert.title}
      </h4>

      <p
        style={{
          margin: "8px 0 0",
          color: "rgba(255,255,255,0.56)",
          fontSize: 11,
          lineHeight: 1.55,
          fontWeight: 720,
        }}
      >
        {alert.description}
      </p>

      {alert.monthlyImpact > 0 && (
        <div
          style={{
            marginTop: 15,
            color:
              alert.businessAction === "optimize"
                ? "#22c55e"
                : style.color,
            fontSize: 24,
            lineHeight: 1,
            fontWeight: 950,
          }}
        >
          {alert.businessAction === "optimize" ? "+" : ""}
          {money(alert.monthlyImpact)}
        </div>
      )}

      <div style={{
        marginTop: "auto", paddingTop: 24
      }}>
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

  const displayed =
    priorities.length > 0
      ? priorities
      : alerts.slice(0, maxItems);

  const primary = displayed[0];
  const secondary = displayed.slice(1, 3);
  const status = getBusinessStatus(alerts);

  if (!primary) return null;

  const statusText =
    language === "it"
      ? status.key === "action"
        ? "Intervento richiesto"
        : status.key === "review"
          ? "Da controllare"
          : status.key === "optimize"
            ? "Ottimizzazione disponibile"
            : "Situazione stabile"
      : status.key === "action"
        ? "Action required"
        : status.key === "review"
          ? "Review needed"
          : status.key === "optimize"
            ? "Optimization available"
            : "Stable status";

  const statusDescription =
    language === "it"
      ? status.key === "action"
        ? "Esiste almeno una criticità significativa che merita una decisione prioritaria."
        : status.key === "review"
          ? "Non emerge un'emergenza generale, ma alcuni aspetti devono essere verificati."
          : status.key === "optimize"
            ? "La struttura è stabile. Le priorità attuali riguardano il miglioramento."
            : "Nessuna criticità significativa richiede un intervento immediato."
      : status.key === "action"
        ? "At least one significant issue currently requires a prioritized decision."
        : status.key === "review"
          ? "There is no broad emergency, but some areas should be reviewed."
          : status.key === "optimize"
            ? "The business is stable. Current priorities focus on improvement."
            : "No significant profitability issue requires immediate action.";

  const visibleImpact = displayed.reduce(
    (sum, alert) =>
      sum + Math.max(0, alert.monthlyImpact),
    0,
  );

  return (
    <section
      style={{
        marginTop: 34,
        padding: 30,
        borderRadius: 30,
        background:
          "radial-gradient(circle at 10% 8%, rgba(255,115,80,0.12), transparent 30%), radial-gradient(circle at 92% 18%, rgba(34,197,94,0.08), transparent 30%), linear-gradient(135deg, rgba(15,23,36,0.99), rgba(6,11,20,0.99))",
        border: "1px solid rgba(255,115,60,0.23)",
        boxShadow:
          "0 30px 88px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.035)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) 270px",
          gap: 22,
          alignItems: "stretch",
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

          <h2
            style={{
              margin: "9px 0 0",
              color: "#f8fafc",
              fontSize: 31,
              fontWeight: 950,
              lineHeight: 1.18,
              letterSpacing: "-0.04em",
            }}
          >
            {language === "it"
              ? "Le decisioni che meritano attenzione adesso"
              : "The decisions that deserve attention now"}
          </h2>

          <p
            style={{
              margin: "9px 0 0",
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
          </p>
        </div>

        <div
          style={{
            padding: 18,
            borderRadius: 20,
            background: `${status.color}0D`,
            border: `1px solid ${status.color}32`,
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
              color: status.color,
              fontSize: 19,
              fontWeight: 950,
            }}
          >
            {statusText}
          </div>

          <div
            style={{
              marginTop: 7,
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
          marginTop: 25,
          display: "grid",
          gridTemplateColumns:
            secondary.length > 0
              ? "minmax(0,1.7fr) minmax(290px,0.6fr)"
              : "1fr",
          gap: 18,
        }}
      >
        <PrimaryPriority
          alert={primary}
          language={language}
          navigate={navigate}
        />

        {secondary.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 15,
            }}
          >
            {secondary.map((alert, index) => (
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

      <div
        style={{
          marginTop: 20,
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 18,
          alignItems: "center",
          padding: 20,
          borderRadius: 19,
          background:
            "linear-gradient(90deg, rgba(34,197,94,0.10), rgba(255,255,255,0.025))",
          border: "1px solid rgba(34,197,94,0.18)",
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
              marginTop: 8,
              color: "#22c55e",
              fontSize: 36,
              lineHeight: 1,
              fontWeight: 950,
              letterSpacing: "-0.045em",
            }}
          >
            +{money(visibleImpact)}
          </div>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={() =>
            navigate("/app/recommendations")
          }
        >
          {language === "it"
            ? "Apri Profit Action Center →"
            : "Open Profit Action Center →"}
        </button>
      </div>
    </section>
  );
}