import * as React from "react";

import type { ProfitAlert, ProfitAlertSeverity } from "~/utils/profit-monitor";

import { useI18n } from "~/components/i18n/I18nProvider";
import { money } from "~/utils/margin";
import type { MarginAssessment } from "~/utils/margin-decision-engine";
import MetricTooltip from "~/components/ui/MetricTooltip";

type Props = {
  alerts: ProfitAlert[];
  assessment: MarginAssessment;
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
  labels: Record<ProfitAlertSeverity, string>,
): SeverityStyle {
  const styles: Record<ProfitAlertSeverity, SeverityStyle> = {
    critical: {
      label: labels.critical,
      color: "#ff7b61",
      background: "rgba(255,107,74,0.10)",
      border: "rgba(255,107,74,0.25)",
      icon: "!",
    },

    warning: {
      label: labels.warning,
      color: "#fbbf24",
      background: "rgba(245,158,11,0.10)",
      border: "rgba(245,158,11,0.24)",
      icon: "△",
    },

    opportunity: {
      label: labels.opportunity,
      color: "#4ade80",
      background: "rgba(34,197,94,0.10)",
      border: "rgba(34,197,94,0.24)",
      icon: "↗",
    },

    info: {
      label: labels.info,
      color: "#7dd3fc",
      background: "rgba(56,189,248,0.10)",
      border: "rgba(56,189,248,0.24)",
      icon: "i",
    },
  };

  return styles[severity];
}

function getSeverityRank(severity: ProfitAlertSeverity) {
  const rank: Record<ProfitAlertSeverity, number> = {
    critical: 4,
    warning: 3,
    opportunity: 2,
    info: 1,
  };

  return rank[severity];
}

function isMissingCostsAlert(alert: ProfitAlert) {
  return alert.id === "missing-costs" || alert.category === "data-quality";
}

function getAlertAmount(alert: ProfitAlert) {
  if (isMissingCostsAlert(alert)) {
    return alert.metadata?.revenue ?? 0;
  }

  if (alert.id === "real-losses") {
    return alert.metadata?.periodImpact ?? alert.monthlyImpact;
  }

  return alert.monthlyImpact;
}

function getAlertAmountLabel(
  alert: ProfitAlert,
  labels: {
    missingCogsRevenue: string;
    estimatedOpportunity: string;
    confirmedLoss: string;
    detectedImpact: string;
  },
) {
  if (isMissingCostsAlert(alert)) {
    return labels.missingCogsRevenue;
  }

  if (alert.severity === "opportunity") {
    return labels.estimatedOpportunity;
  }

  if (alert.id === "real-losses") {
    return labels.confirmedLoss;
  }

  return labels.detectedImpact;
}

function AlertCounter({
  severity,
  count,
}: {
  severity: ProfitAlertSeverity;
  count: number;
}) {
  const { messages } = useI18n();
  const style = getSeverityStyle(
    severity,
    messages.aiProfitMonitor.severityLabels as Record<
      ProfitAlertSeverity,
      string
    >,
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
  navigate,
}: {
  alert: ProfitAlert;
  navigate: (path: string) => void;
}) {
  const { messages } = useI18n();
  const copy = messages.aiProfitMonitor;
  const severity = getSeverityStyle(
    alert.severity,
    copy.severityLabels as Record<ProfitAlertSeverity, string>,
  );
  const displayedAmount = getAlertAmount(alert);
  const amountLabel = getAlertAmountLabel(alert, copy.amountLabels);

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
        transition: "transform 180ms ease, border-color 180ms ease",
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.transform = "translateY(0)";
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

        {displayedAmount > 0 && (
          <div
            style={{
              color:
                alert.severity === "opportunity" ? "#22c55e" : severity.color,
              fontSize: 15,
              fontWeight: 950,
              whiteSpace: "nowrap",
            }}
          >
            <div
              style={{
                marginBottom: 3,
                color: "rgba(255,255,255,0.42)",
                fontSize: 8,
                fontWeight: 900,
                textAlign: "right",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {amountLabel}
            </div>
            {alert.severity === "opportunity" ? "+" : ""}
            {money(displayedAmount)}
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
          borderTop: "1px solid rgba(255,255,255,0.07)",
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
  assessment,
  navigate,
}: Props) {
  const { messages, t } = useI18n();
  const copy = messages.aiProfitMonitor;

  const sortedAlerts = React.useMemo(
    () =>
      [...alerts].sort((a, b) => {
        const severityDifference =
          getSeverityRank(b.severity) - getSeverityRank(a.severity);

        if (severityDifference !== 0) {
          return severityDifference;
        }

        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }

        return b.monthlyImpact - a.monthlyImpact;
      }),
    [alerts],
  );

  const counts = React.useMemo(
    () => ({
      critical: sortedAlerts.filter((alert) => alert.severity === "critical")
        .length,

      warning: sortedAlerts.filter((alert) => alert.severity === "warning")
        .length,

      opportunity: sortedAlerts.filter(
        (alert) => alert.severity === "opportunity",
      ).length,

      info: sortedAlerts.filter((alert) => alert.severity === "info").length,
    }),
    [sortedAlerts],
  );

  const highestPriority = sortedAlerts[0];

  const remainingAlerts = sortedAlerts.slice(1, 5);

  const confirmedLossAlert = sortedAlerts.find(
    (alert) => alert.id === "real-losses" && getAlertAmount(alert) > 0,
  );

  const bestOpportunityAlert = sortedAlerts
    .filter(
      (alert) => alert.severity === "opportunity" && alert.monthlyImpact > 0,
    )
    .sort((a, b) => b.monthlyImpact - a.monthlyImpact)[0];

  const monitorSummaryAlert = confirmedLossAlert ?? bestOpportunityAlert;
  const monitorSummaryLabel = monitorSummaryAlert
    ? getAlertAmountLabel(monitorSummaryAlert, copy.amountLabels)
    : null;

  const monitorStatus = assessment.requiresAction
    ? copy.actionRequired
    : counts.warning > 0
      ? copy.reviewNeeded
      : counts.opportunity > 0
        ? copy.opportunitiesDetected
        : copy.stableStatus;

  const monitorColor =
    counts.critical > 0
      ? "#ff6b4a"
      : counts.warning > 0
        ? "#f59e0b"
        : counts.opportunity > 0
          ? "#22c55e"
          : "#38bdf8";

  if (sortedAlerts.length === 0) {
    const assessmentUnavailable = !assessment.healthScoreAvailable;

    return (
      <div
        style={{
          marginBottom: 24,
          padding: 24,
          borderRadius: 24,
          background:
            "linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))",
          border: assessmentUnavailable
            ? "1px solid rgba(56,189,248,0.22)"
            : "1px solid rgba(34,197,94,0.22)",
        }}
      >
        <div
          style={{
            color: assessmentUnavailable ? "#7dd3fc" : "#86efac",
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
          {assessmentUnavailable
            ? copy.overallAssessmentUnavailable
            : copy.noProfitRisks}
        </div>

        <div
          style={{
            marginTop: 7,
            color: "rgba(255,255,255,0.56)",
            fontSize: 13,
            lineHeight: 1.55,
            fontWeight: 720,
          }}
        >
          {assessmentUnavailable
            ? t("aiProfitMonitor.insufficientAssessment", {
                orderCount: assessment.evidence.orderCount,
                activeDays: assessment.evidence.activeDays,
              })
            : copy.stableDescription}
        </div>
      </div>
    );
  }

  const highestSeverityStyle = getSeverityStyle(
    highestPriority.severity,
    copy.severityLabels as Record<ProfitAlertSeverity, string>,
  );
  const highestPriorityAmount = getAlertAmount(highestPriority);
  const highestPriorityAmountLabel = getAlertAmountLabel(
    highestPriority,
    copy.amountLabels,
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
        border: "1px solid rgba(255,115,60,0.23)",
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
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                color: "#f8fafc",
                fontSize: 28,
                lineHeight: 1.15,
                fontWeight: 950,
                letterSpacing: "-0.035em",
              }}
            >
              {t("aiProfitMonitor.activeSignals", {
                count: sortedAlerts.length,
              })}
            </div>

            <MetricTooltip
              content={{
                title: copy.tooltipTitle,
                description: copy.tooltipDescription,
                note: copy.tooltipNote,
              }}
            />
          </div>

          <div
            style={{
              marginTop: 8,
              maxWidth: 760,
              color: "rgba(255,255,255,0.58)",
              fontSize: 13,
              lineHeight: 1.6,
              fontWeight: 720,
            }}
          >
            {copy.description}
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
              color: "rgba(255,255,255,0.42)",
              fontSize: 9,
              fontWeight: 950,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            {copy.monitorStatus}
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

          {monitorSummaryAlert && getAlertAmount(monitorSummaryAlert) > 0 && (
            <div
              style={{
                marginTop: 7,
                color: "rgba(255,255,255,0.52)",
                fontSize: 11,
                fontWeight: 760,
              }}
            >
              {monitorSummaryLabel}:{" "}
              <strong
                style={{
                  color: "#f8fafc",
                }}
              >
                {monitorSummaryAlert.severity === "opportunity" ? "+" : ""}
                {money(getAlertAmount(monitorSummaryAlert))}
              </strong>
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,minmax(0,1fr))",
          gap: 12,
          marginTop: 22,
        }}
      >
        <AlertCounter
          severity="critical"
          count={counts.critical}
        />

        <AlertCounter
          severity="warning"
          count={counts.warning}
        />

        <AlertCounter
          severity="opportunity"
          count={counts.opportunity}
        />

        <AlertCounter severity="info" count={counts.info} />
      </div>

      <div
        style={{
          marginTop: 22,
          display: "grid",
          gridTemplateColumns: "1.08fr 0.92fr",
          gap: 18,
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            minWidth: 0,
            padding: 22,
            borderRadius: 22,
            background: highestSeverityStyle.background,
            border: `1px solid ${highestSeverityStyle.border}`,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
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
                color: highestSeverityStyle.color,
                background: "rgba(5,10,18,0.48)",
                border: `1px solid ${highestSeverityStyle.border}`,
                fontSize: 10,
                fontWeight: 950,
                textTransform: "uppercase",
                letterSpacing: "0.09em",
              }}
            >
              <span>{highestSeverityStyle.icon}</span>

              <span>
                {copy.highestPriority}
              </span>
            </div>

            <div
              style={{
                color: "rgba(255,255,255,0.42)",
                fontSize: 10,
                fontWeight: 900,
              }}
            >
              {t("aiProfitMonitor.priority", {
                priority: highestPriority.priority,
              })}
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
              color: "rgba(255,255,255,0.67)",
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
                background: "rgba(5,10,18,0.42)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div
                style={{
                  color: "rgba(255,255,255,0.40)",
                  fontSize: 9,
                  fontWeight: 950,
                  textTransform: "uppercase",
                  letterSpacing: "0.09em",
                }}
              >
                {copy.relatedProduct}
              </div>

              <div
                style={{
                  marginTop: 5,
                  color: "#f8fafc",
                  fontSize: 13,
                  fontWeight: 900,
                }}
              >
                {highestPriority.productTitle}
              </div>
            </div>
          )}

          <div
            style={{
              marginTop: 19,
              display: "flex",
              justifyContent: "space-between",
              gap: 14,
              alignItems: "flex-end",
              flexWrap: "wrap",
            }}
          >
            <div>
              {highestPriorityAmount > 0 && (
                <>
                  <div
                    style={{
                      color: "rgba(255,255,255,0.40)",
                      fontSize: 9,
                      fontWeight: 950,
                      textTransform: "uppercase",
                      letterSpacing: "0.09em",
                    }}
                  >
                    {highestPriorityAmountLabel}
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      color:
                        highestPriority.severity === "opportunity"
                          ? "#22c55e"
                          : highestSeverityStyle.color,
                      fontSize: 29,
                      lineHeight: 1,
                      fontWeight: 950,
                      letterSpacing: "-0.04em",
                    }}
                  >
                    {highestPriority.severity === "opportunity" ? "+" : ""}
                    {money(highestPriorityAmount)}
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              className="primary-button"
              onClick={() => navigate(highestPriority.route)}
            >
              {highestPriority.actionLabel} →
            </button>
          </div>
        </div>

        <div
          style={{
            minWidth: 0,
            padding: 20,
            borderRadius: 22,
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div
            style={{
              color: "#f8fafc",
              fontSize: 16,
              fontWeight: 950,
            }}
          >
            {copy.otherSignals}
          </div>

          <div
            style={{
              marginTop: 5,
              color: "rgba(255,255,255,0.45)",
              fontSize: 11,
              fontWeight: 720,
            }}
          >
            {copy.openCorrectModule}
          </div>

          <div
            style={{
              marginTop: 15,
              display: "grid",
              gap: 11,
            }}
          >
            {remainingAlerts.length > 0 ? (
              remainingAlerts.map((alert) => (
                <SmallAlertCard
                  key={alert.id}
                  alert={alert}
                  navigate={navigate}
                />
              ))
            ) : (
              <div
                style={{
                  padding: 17,
                  borderRadius: 16,
                  color: "#86efac",
                  background: "rgba(34,197,94,0.07)",
                  border: "1px solid rgba(34,197,94,0.18)",
                  fontSize: 12,
                  lineHeight: 1.5,
                  fontWeight: 780,
                }}
              >
                {copy.noAdditionalSignals}
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
            color: "rgba(255,255,255,0.42)",
            fontSize: 11,
            fontWeight: 760,
          }}
        >
          {t("aiProfitMonitor.additionalSignals", {
            count: sortedAlerts.length - 5,
          })}
        </div>
      )}
    </section>
  );
}
