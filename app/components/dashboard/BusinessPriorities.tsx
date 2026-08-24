import * as React from "react";

import type {
  ProfitAlert,
  ProfitAlertEffort,
  ProfitBusinessAction,
} from "~/utils/profit-monitor";

import { useI18n } from "~/components/i18n/I18nProvider";
import { uiMoney as money } from "~/utils/margin";

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

type BusinessStatusKey = "action" | "review" | "optimize" | "stable";

function getActionStyle(
  action: ProfitBusinessAction,
  labels: Record<ProfitBusinessAction, string>,
): ActionStyle {
  return {
    action: {
      label: labels.action,
      color: "#ff7b61",
      background: "rgba(255,107,74,0.10)",
      border: "rgba(255,107,74,0.28)",
      icon: "!",
    },
    review: {
      label: labels.review,
      color: "#fbbf24",
      background: "rgba(245,158,11,0.10)",
      border: "rgba(245,158,11,0.25)",
      icon: "◌",
    },
    optimize: {
      label: labels.optimize,
      color: "#4ade80",
      background: "rgba(34,197,94,0.10)",
      border: "rgba(34,197,94,0.25)",
      icon: "↗",
    },
    monitor: {
      label: labels.monitor,
      color: "#7dd3fc",
      background: "rgba(56,189,248,0.10)",
      border: "rgba(56,189,248,0.25)",
      icon: "◉",
    },
  }[action];
}

function getEffortLabel(
  effort: ProfitAlertEffort,
  labels: Record<ProfitAlertEffort, string>,
) {
  return labels[effort];
}

function getBusinessStatus(
  alerts: ProfitAlert[],
): { key: BusinessStatusKey; color: string } {
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
  moduleButtons: Record<string, string>,
  openModuleFallback: string,
  t: (key: string, variables?: Record<string, string | number>) => string,
) {
  const label = moduleButtons[alert.recommendedModule];
  if (label) return label;

  if (openModuleFallback) {
    return t("businessPriorities.openModuleFallback", {
      module: alert.recommendedModule,
    });
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
  navigate,
}: {
  alert: ProfitAlert;
  navigate: (path: string) => void;
}) {
  const { language, messages, t } = useI18n();
  const copy = messages.businessPriorities;
  const style = getActionStyle(
    alert.businessAction,
    copy.actionLabels as Record<ProfitBusinessAction, string>,
  );

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
          "0 22px 55px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px rgba(255,115,60,0.05)",
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
            {copy.primaryDecision}
          </span>
        </div>

        <span
          style={{
            color: "rgba(255,255,255,0.42)",
            fontSize: 10,
            fontWeight: 900,
          }}
        >
          {copy.priority} {alert.priority}/100
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
          margin: "14px 0 0",
          color: "#f8fafc",
          fontSize: 36,
          lineHeight: 1.18,
          fontWeight: 950,
          letterSpacing: "-0.05em",
        }}
      >
        {alert.title}
      </h3>

      <p
        style={{
          position: "relative",
          margin: "20px 0 0",
          maxWidth: 760,
          color: "rgba(255,255,255,0.70)",
          fontSize: 15,
          lineHeight: 1.8,
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
            {copy.relatedProduct}
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
          marginTop: 28,
          display: "grid",
          gridTemplateColumns: "repeat(3,minmax(0,1fr))",
          gap: 11,
        }}
      >
        <Metric
          label={copy.monthlyImpact}
          value={
            alert.monthlyImpact > 0
              ? `${alert.businessAction === "optimize" ? "+" : ""}${money(
                alert.monthlyImpact,
              )}`
              : copy.qualitative
          }
          color={
            alert.businessAction === "optimize"
              ? "#22c55e"
              : style.color
          }
        />

        <Metric
          label={copy.effort}
          value={getEffortLabel(
            alert.effort,
            copy.effortLabels as Record<ProfitAlertEffort, string>,
          )}
        />

        <Metric
          label={copy.estimatedTime}
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
          {copy.recommendedModule}
          :{" "}
          <strong style={{ color: "#f8fafc" }}>
            {language === "fr" && alert.recommendedModule === "Products" ? "Produits" : alert.recommendedModule}
          </strong>
        </div>

        <button
          type="button"
          className="primary-button"
          style={{
            width: "fit-content",
            minWidth: 240,
            justifyContent: "center",
            alignSelf: "flex-start",
            paddingLeft: 24,
            paddingRight: 24,
          }}
          onClick={() => navigate(alert.route)}
        >
          {getModuleButtonLabel(
            alert,
            copy.moduleButtons as Record<string, string>,
            copy.openModuleFallback,
            t,
          )} →
        </button>
      </div>
    </article>
  );
}

function SecondaryPriority({
  alert,
  index,
  navigate,
}: {
  alert: ProfitAlert;
  index: number;
  navigate: (path: string) => void;
}) {
  const { messages, t } = useI18n();
  const copy = messages.businessPriorities;
  const style = getActionStyle(
    alert.businessAction,
    copy.actionLabels as Record<ProfitBusinessAction, string>,
  );

  return (
    <article
      style={{
        flex: 1,
        minHeight: 330,
        padding: "24px 24px 32px",
        borderRadius: 22,
        background:
          "linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))",
        border: `1px solid ${style.border}`,
        boxShadow:
          "0 16px 42px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.03)",
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
          margin: "18px 0 0",
          color: "#f8fafc",
          fontSize: 20,
          lineHeight: 1.32,
          fontWeight: 950,
        }}
      >
        {alert.title}
      </h4>

      <p
        style={{
          margin: "12px 0 0",
          color: "rgba(255,255,255,0.56)",
          fontSize: 12,
          lineHeight: 1.65,
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

      <div style={{ marginTop: "auto", paddingTop: 30 }}>
        <button
          type="button"
          className="apply-button"
          style={{ width: "100%", justifyContent: "center" }}
          onClick={() => navigate(alert.route)}
        >
          {getModuleButtonLabel(
            alert,
            copy.moduleButtons as Record<string, string>,
            copy.openModuleFallback,
            t,
          )} →
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
  const { messages } = useI18n();
  const copy = messages.businessPriorities;

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

  const statusText = copy.statusText[status.key];
  const statusDescription = copy.statusDescription[status.key];

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
            {copy.eyebrow}
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
            {copy.title}
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
            {copy.description}
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
            {copy.businessStatus}
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
            "linear-gradient(135deg, rgba(34,197,94,0.10), rgba(16,23,37,0.96))",
          border: "1px solid rgba(34,197,94,0.18)",
          boxShadow:
            "0 18px 45px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.03)",
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
            {copy.displayedPrioritiesImpact}
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
          {copy.openProfitActionCenter}
        </button>
      </div>
    </section>
  );
}
