import * as React from "react";

import type {
  ProfitAlert,
  ProfitAlertSeverity,
} from "~/utils/profit-monitor";

import { getStoredLanguage } from "~/utils/i18n";
import { money } from "~/utils/margin";

type Props = {
  alerts: ProfitAlert[];
  navigate: (path: string) => void;
};

type SeverityStyle = {
  label: string;
  color: string;
  background: string;
  border: string;
  icon: string;
};

function getSeverityStyle(
  severity: ProfitAlertSeverity,
  language: "it" | "en",
): SeverityStyle {
  const styles: Record<
    ProfitAlertSeverity,
    SeverityStyle
  > = {
    critical: {
      label:
        language === "it"
          ? "Critico"
          : "Critical",
      color: "#ff7b61",
      background: "rgba(255,107,74,0.10)",
      border: "rgba(255,107,74,0.25)",
      icon: "!",
    },

    warning: {
      label:
        language === "it"
          ? "Attenzione"
          : "Warning",
      color: "#fbbf24",
      background: "rgba(245,158,11,0.10)",
      border: "rgba(245,158,11,0.24)",
      icon: "△",
    },

    opportunity: {
      label:
        language === "it"
          ? "Opportunità"
          : "Opportunity",
      color: "#4ade80",
      background: "rgba(34,197,94,0.10)",
      border: "rgba(34,197,94,0.24)",
      icon: "↗",
    },

    info: {
      label:
        language === "it"
          ? "Informazione"
          : "Information",
      color: "#7dd3fc",
      background: "rgba(56,189,248,0.10)",
      border: "rgba(56,189,248,0.24)",
      icon: "i",
    },
  };

  return styles[severity];
}

function getSeverityRank(
  severity: ProfitAlertSeverity,
) {
  const rank: Record<
    ProfitAlertSeverity,
    number
  > = {
    critical: 4,
    warning: 3,
    opportunity: 2,
    info: 1,
  };

  return rank[severity];
}

function AlertCounter({
  severity,
  count,
  language,
}: {
  severity: ProfitAlertSeverity;
  count: number;
  language: "it" | "en";
}) {
  const style = getSeverityStyle(
    severity,
    language,
  );

  return (
    <div
      style={{
        minWidth: 0,
        padding: 15,
        borderRadius: 16,
        background: style.background,
        border: `1px solid ${style.border}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            display: "grid",
            placeItems: "center",
            borderRadius: 10,
            color: style.color,
            background: "rgba(5,10,18,0.55)",
            border: `1px solid ${style.border}`,
            fontSize: 12,
            fontWeight: 950,
          }}
        >
          {style.icon}
        </div>

        <div
          style={{
            color: style.color,
            fontSize: 10,
            fontWeight: 950,
            textTransform: "uppercase",
            letterSpacing: "0.09em",
          }}
        >
          {style.label}
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          color: "#f8fafc",
          fontSize: 28,
          lineHeight: 1,
          fontWeight: 950,
          letterSpacing: "-0.04em",
        }}
      >
        {count}
      </div>
    </div>
  );
}

function SmallAlertCard({
  alert,
  language,
  navigate,
}: {
  alert: ProfitAlert;
  language: "it" | "en";
  navigate: (path: string) => void;
}) {
  const severity = getSeverityStyle(
    alert.severity,
    language,
  );

  return (
    <button
      type="button"
      onClick={() => navigate(alert.route)}
      style={{
        width: "100%",
        cursor: "pointer",
        textAlign: "left",
        padding: 16,
        borderRadius: 18,
        background:
          "linear-gradient(180deg, rgba(16,23,37,0.96), rgba(7,12,21,0.98))",
        border: `1px solid ${severity.border}`,
        transition:
          "transform 180ms ease, border-color 180ms ease",
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.transform =
          "translateY(-2px)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.transform =
          "translateY(0)";
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "6px 9px",
            borderRadius: 999,
            color: severity.color,
            background: severity.background,
            border: `1px solid ${severity.border}`,
            fontSize: 9,
            fontWeight: 950,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          <span>{severity.icon}</span>
          <span>{severity.label}</span>
        </div>

        {alert.monthlyImpact > 0 && (
          <div
            style={{
              color:
                alert.severity ===
                "opportunity"
                  ? "#22c55e"
                  : severity.color,
              fontSize: 15,
              fontWeight: 950,
              whiteSpace: "nowrap",
            }}
          >
            {alert.severity ===
            "opportunity"
              ? "+"
              : ""}
            {money(alert.monthlyImpact)}
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 12,
          color: "#f8fafc",
          fontSize: 15,
          fontWeight: 900,
          lineHeight: 1.35,
        }}
      >
        {alert.title}
      </div>

      <div
        style={{
          marginTop: 7,
          color: "rgba(255,255,255,0.52)",
          fontSize: 11,
          lineHeight: 1.5,
          fontWeight: 720,
        }}
      >
        {alert.description}
      </div>

      <div
        style={{
          marginTop: 12,
          paddingTop: 11,
          borderTop:
            "1px solid rgba(255,255,255,0.07)",
          color: severity.color,
          fontSize: 11,
          fontWeight: 900,
        }}
      >
        {alert.actionLabel} →
      </div>
    </button>
  );
}

export default function AIProfitMonitor({
  alerts,
  navigate,
}: Props) {
  const language =
    getStoredLanguage() === "it"
      ? "it"
      : "en";

  const sortedAlerts = React.useMemo(
    () =>
      [...alerts].sort((a, b) => {
        const severityDifference =
          getSeverityRank(b.severity) -
          getSeverityRank(a.severity);

        if (severityDifference !== 0) {
          return severityDifference;
        }

        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }

        return (
          b.monthlyImpact -
          a.monthlyImpact
        );
      }),
    [alerts],
  );

  const counts = React.useMemo(
    () => ({
      critical: sortedAlerts.filter(
        (alert) =>
          alert.severity === "critical",
      ).length,

      warning: sortedAlerts.filter(
        (alert) =>
          alert.severity === "warning",
      ).length,

      opportunity: sortedAlerts.filter(
        (alert) =>
          alert.severity ===
          "opportunity",
      ).length,

      info: sortedAlerts.filter(
        (alert) =>
          alert.severity === "info",
      ).length,
    }),
    [sortedAlerts],
  );

  const highestPriority =
    sortedAlerts[0];

  const remainingAlerts =
    sortedAlerts.slice(1, 5);

  const highestEconomicImpact =
    sortedAlerts.reduce(
      (highest, alert) =>
        alert.monthlyImpact >
        highest.monthlyImpact
          ? alert
          : highest,
      sortedAlerts[0] ?? {
        monthlyImpact: 0,
      },
    );

  const monitorStatus =
    counts.critical > 0
      ? language === "it"
        ? "Intervento richiesto"
        : "Action required"
      : counts.warning > 0
        ? language === "it"
          ? "Da controllare"
          : "Review needed"
        : counts.opportunity > 0
          ? language === "it"
            ? "Opportunità rilevate"
            : "Opportunities detected"
          : language === "it"
            ? "Situazione stabile"
            : "Stable status";

  const monitorColor =
    counts.critical > 0
      ? "#ff6b4a"
      : counts.warning > 0
        ? "#f59e0b"
        : counts.opportunity > 0
          ? "#22c55e"
          : "#38bdf8";

  if (sortedAlerts.length === 0) {
    return (
      <div
        style={{
          marginBottom: 24,
          padding: 24,
          borderRadius: 24,
          background:
            "linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))",
          border:
            "1px solid rgba(34,197,94,0.22)",
        }}
      >
        <div
          style={{
            color: "#86efac",
            fontSize: 11,
            fontWeight: 950,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
          }}
        >
          AI Profit Monitor
        </div>

        <div
          style={{
            marginTop: 10,
            color: "#f8fafc",
            fontSize: 22,
            fontWeight: 950,
          }}
        >
          {language === "it"
            ? "Nessun rischio rilevato"
            : "No profit risks detected"}
        </div>

        <div
          style={{
            marginTop: 7,
            color:
              "rgba(255,255,255,0.56)",
            fontSize: 13,
            lineHeight: 1.55,
            fontWeight: 720,
          }}
        >
          {language === "it"
            ? "Margini, costi e opportunità risultano stabili sulla base dei dati disponibili."
            : "Margins, costs and opportunities appear stable based on the available data."}
        </div>
      </div>
    );
  }

  const highestSeverityStyle =
    getSeverityStyle(
      highestPriority.severity,
      language,
    );

  return (
    <section
      style={{
        position: "relative",
        overflow: "hidden",
        marginBottom: 24,
        padding: 28,
        borderRadius: 30,
        background:
          "radial-gradient(circle at 12% 12%, rgba(255,115,80,0.12), transparent 30%), radial-gradient(circle at 88% 18%, rgba(34,197,94,0.09), transparent 32%), linear-gradient(135deg, rgba(15,23,36,0.99), rgba(6,11,20,0.99))",
        border:
          "1px solid rgba(255,115,60,0.23)",
        boxShadow:
          "0 28px 80px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 22,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 9,
              padding: "8px 12px",
              borderRadius: 999,
              color: monitorColor,
              background: `${monitorColor}13`,
              border: `1px solid ${monitorColor}38`,
              fontSize: 10,
              fontWeight: 950,
              textTransform: "uppercase",
              letterSpacing: "0.11em",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: monitorColor,
                boxShadow: `0 0 12px ${monitorColor}`,
              }}
            />

            <span>AI Profit Monitor</span>
          </div>

          <div
            style={{
              marginTop: 13,
              color: "#f8fafc",
              fontSize: 28,
              lineHeight: 1.15,
              fontWeight: 950,
              letterSpacing: "-0.035em",
            }}
          >
            {language === "it"
              ? `${sortedAlerts.length} segnali attivi sulla redditività`
              : `${sortedAlerts.length} active profitability signals`}
          </div>

          <div
            style={{
              marginTop: 8,
              maxWidth: 760,
              color:
                "rgba(255,255,255,0.58)",
              fontSize: 13,
              lineHeight: 1.6,
              fontWeight: 720,
            }}
          >
            {language === "it"
              ? "MarginLab ha analizzato margini, prodotti, costi, sconti, rimborsi e opportunità. Gli eventi sono ordinati automaticamente per urgenza e impatto."
              : "MarginLab analyzed margins, products, costs, discounts, refunds and opportunities. Events are automatically ranked by urgency and impact."}
          </div>
        </div>

        <div
          style={{
            minWidth: 190,
            padding: 16,
            borderRadius: 18,
            background: `${monitorColor}0D`,
            border: `1px solid ${monitorColor}30`,
          }}
        >
          <div
            style={{
              color:
                "rgba(255,255,255,0.42)",
              fontSize: 9,
              fontWeight: 950,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            {language === "it"
              ? "Stato monitor"
              : "Monitor status"}
          </div>

          <div
            style={{
              marginTop: 8,
              color: monitorColor,
              fontSize: 18,
              fontWeight: 950,
            }}
          >
            {monitorStatus}
          </div>

          {highestEconomicImpact &&
            highestEconomicImpact.monthlyImpact >
              0 && (
              <div
                style={{
                  marginTop: 7,
                  color:
                    "rgba(255,255,255,0.52)",
                  fontSize: 11,
                  fontWeight: 760,
                }}
              >
                {language === "it"
                  ? "Impatto maggiore rilevato"
                  : "Highest detected impact"}
                :{" "}
                <strong
                  style={{
                    color: "#f8fafc",
                  }}
                >
                  {money(
                    highestEconomicImpact.monthlyImpact,
                  )}
                </strong>
              </div>
            )}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(4,minmax(0,1fr))",
          gap: 12,
          marginTop: 22,
        }}
      >
        <AlertCounter
          severity="critical"
          count={counts.critical}
          language={language}
        />

        <AlertCounter
          severity="warning"
          count={counts.warning}
          language={language}
        />

        <AlertCounter
          severity="opportunity"
          count={counts.opportunity}
          language={language}
        />

        <AlertCounter
          severity="info"
          count={counts.info}
          language={language}
        />
      </div>

      <div
        style={{
          marginTop: 22,
          display: "grid",
          gridTemplateColumns:
            "1.08fr 0.92fr",
          gap: 18,
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            minWidth: 0,
            padding: 22,
            borderRadius: 22,
            background:
              highestSeverityStyle.background,
            border: `1px solid ${highestSeverityStyle.border}`,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              gap: 14,
              alignItems: "flex-start",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 10px",
                borderRadius: 999,
                color:
                  highestSeverityStyle.color,
                background:
                  "rgba(5,10,18,0.48)",
                border: `1px solid ${highestSeverityStyle.border}`,
                fontSize: 10,
                fontWeight: 950,
                textTransform: "uppercase",
                letterSpacing: "0.09em",
              }}
            >
              <span>
                {highestSeverityStyle.icon}
              </span>

              <span>
                {language === "it"
                  ? "Priorità principale"
                  : "Highest priority"}
              </span>
            </div>

            <div
              style={{
                color:
                  "rgba(255,255,255,0.42)",
                fontSize: 10,
                fontWeight: 900,
              }}
            >
              {language === "it"
                ? `Priorità ${highestPriority.priority}/100`
                : `Priority ${highestPriority.priority}/100`}
            </div>
          </div>

          <div
            style={{
              marginTop: 17,
              color: "#f8fafc",
              fontSize: 23,
              lineHeight: 1.25,
              fontWeight: 950,
              letterSpacing: "-0.025em",
            }}
          >
            {highestPriority.title}
          </div>

          <div
            style={{
              marginTop: 10,
              color:
                "rgba(255,255,255,0.67)",
              fontSize: 13,
              lineHeight: 1.65,
              fontWeight: 730,
            }}
          >
            {highestPriority.description}
          </div>

          {highestPriority.productTitle && (
            <div
              style={{
                marginTop: 14,
                padding: 12,
                borderRadius: 14,
                background:
                  "rgba(5,10,18,0.42)",
                border:
                  "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div
                style={{
                  color:
                    "rgba(255,255,255,0.40)",
                  fontSize: 9,
                  fontWeight: 950,
                  textTransform: "uppercase",
                  letterSpacing: "0.09em",
                }}
              >
                {language === "it"
                  ? "Prodotto collegato"
                  : "Related product"}
              </div>

              <div
                style={{
                  marginTop: 5,
                  color: "#f8fafc",
                  fontSize: 13,
                  fontWeight: 900,
                }}
              >
                {
                  highestPriority.productTitle
                }
              </div>
            </div>
          )}

          <div
            style={{
              marginTop: 19,
              display: "flex",
              justifyContent:
                "space-between",
              gap: 14,
              alignItems: "flex-end",
              flexWrap: "wrap",
            }}
          >
            <div>
              {highestPriority.monthlyImpact >
                0 && (
                <>
                  <div
                    style={{
                      color:
                        "rgba(255,255,255,0.40)",
                      fontSize: 9,
                      fontWeight: 950,
                      textTransform:
                        "uppercase",
                      letterSpacing:
                        "0.09em",
                    }}
                  >
                    {language === "it"
                      ? "Impatto mensile stimato"
                      : "Estimated monthly impact"}
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      color:
                        highestPriority.severity ===
                        "opportunity"
                          ? "#22c55e"
                          : highestSeverityStyle.color,
                      fontSize: 29,
                      lineHeight: 1,
                      fontWeight: 950,
                      letterSpacing:
                        "-0.04em",
                    }}
                  >
                    {highestPriority.severity ===
                    "opportunity"
                      ? "+"
                      : ""}
                    {money(
                      highestPriority.monthlyImpact,
                    )}
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              className="primary-button"
              onClick={() =>
                navigate(
                  highestPriority.route,
                )
              }
            >
              {
                highestPriority.actionLabel
              }{" "}
              →
            </button>
          </div>
        </div>

        <div
          style={{
            minWidth: 0,
            padding: 20,
            borderRadius: 22,
            background:
              "rgba(255,255,255,0.025)",
            border:
              "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div
            style={{
              color: "#f8fafc",
              fontSize: 16,
              fontWeight: 950,
            }}
          >
            {language === "it"
              ? "Altri segnali rilevati"
              : "Other detected signals"}
          </div>

          <div
            style={{
              marginTop: 5,
              color:
                "rgba(255,255,255,0.45)",
              fontSize: 11,
              fontWeight: 720,
            }}
          >
            {language === "it"
              ? "Apri direttamente il modulo corretto."
              : "Open the correct module directly."}
          </div>

          <div
            style={{
              marginTop: 15,
              display: "grid",
              gap: 11,
            }}
          >
            {remainingAlerts.length > 0 ? (
              remainingAlerts.map(
                (alert) => (
                  <SmallAlertCard
                    key={alert.id}
                    alert={alert}
                    language={language}
                    navigate={navigate}
                  />
                ),
              )
            ) : (
              <div
                style={{
                  padding: 17,
                  borderRadius: 16,
                  color: "#86efac",
                  background:
                    "rgba(34,197,94,0.07)",
                  border:
                    "1px solid rgba(34,197,94,0.18)",
                  fontSize: 12,
                  lineHeight: 1.5,
                  fontWeight: 780,
                }}
              >
                {language === "it"
                  ? "Nessun altro segnale importante rilevato."
                  : "No additional important signals detected."}
              </div>
            )}
          </div>
        </div>
      </div>

      {sortedAlerts.length > 5 && (
        <div
          style={{
            marginTop: 16,
            textAlign: "center",
            color:
              "rgba(255,255,255,0.42)",
            fontSize: 11,
            fontWeight: 760,
          }}
        >
          {language === "it"
            ? `Altri ${
                sortedAlerts.length - 5
              } segnali sono stati analizzati dal monitor.`
            : `${
                sortedAlerts.length - 5
              } additional signals were analyzed by the monitor.`}
        </div>
      )}
    </section>
  );
}