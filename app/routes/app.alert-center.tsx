import * as React from "react";
import { useFetcher, useLoaderData, useNavigate } from "react-router";

import { authenticate } from "~/shopify.server";
import { loadMarginDashboardData } from "~/utils/margin.server";
import { getBillingStatus, hasGrowthAccess } from "~/utils/billing.server";
import DashboardNav from "~/components/dashboard/DashboardNav";
import MetricTooltip from "~/components/ui/MetricTooltip";

import dashboardStylesUrl from "~/styles/dashboard.css?url";

import { uiMoney as money } from "~/utils/margin";
import { useI18n } from "~/components/i18n/I18nProvider";
import { getLanguageLocale, type Language } from "~/utils/i18n";

import {
  generateProfitAlerts,
  getProfitAlertCounts,
  type ProfitAlert,
  type ProfitAlertSeverity,
} from "~/utils/profit-monitor";

import {
  getStoredProfitAlertStates,
  getProfitAlertStatusCounts,
  type ProfitAlertStateMap,
  type ProfitAlertStatus,
} from "~/utils/profit-alert-state";
import {
  importLegacyProfitAlertStates,
  syncProfitMonitor,
  updateProfitAlertState,
} from "~/services/profit-monitor.server";

export const links = () => [
  {
    rel: "stylesheet",
    href: dashboardStylesUrl,
  },
];

export const loader = async ({ request }: { request: Request }) => {
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

  const billing = await getBillingStatus(admin);
  const growthAccess = hasGrowthAccess(billing);

  const data = await loadMarginDashboardData({
    admin,
    session,
    period,
  });

  const alerts = generateProfitAlerts({
    summary: data.summary,
    rows: data.rows,
    language: url.searchParams.get("lang") === "it" ? "it" : "en",
    period,
    currencyCode: data.currencyCode,
  });

  const alertStates = growthAccess
    ? await syncProfitMonitor({
      shop: session.shop,
      period,
      alerts,
      snapshot: {
        summary: data.summary,
        economicSnapshot: data.economicSnapshot,
        alertIds: alerts.map((alert) => alert.id),
      },
    })
    : {};

  return {
    ...data,
    billing,
    growthAccess,
    alertStates,
  };
};

export const action = async ({ request }: { request: Request }) => {
  const { admin, session } = await authenticate.admin(request);

  const billing = await getBillingStatus(admin);

  if (!hasGrowthAccess(billing)) {
    return {
      ok: false,
      growthRequired: true,
      alertStates: {},
    };
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "migrate-local-states") {
    const rawStates = String(formData.get("states") ?? "{}");
    let states: ProfitAlertStateMap = {};

    try {
      states = JSON.parse(rawStates) as ProfitAlertStateMap;
    } catch {
      throw new Response("Invalid legacy alert state", { status: 400 });
    }

    const alertStates = await importLegacyProfitAlertStates({
      shop: session.shop,
      period: String(formData.get("period") ?? "30"),
      states,
    });

    return { ok: true, alertStates };
  }

  if (!["read", "acknowledge", "restore", "read-all"].includes(intent)) {
    throw new Response("Invalid alert action", { status: 400 });
  }

  const alertStates = await updateProfitAlertState({
    shop: session.shop,
    period: String(formData.get("period") ?? "30"),
    alertKey: formData.get("alertId")?.toString(),
    intent: intent as "read" | "acknowledge" | "restore" | "read-all",
  });

  return { ok: true, alertStates };
};

type SeverityFilter = "all" | ProfitAlertSeverity;

type StatusStyle = {
  label: string;
  color: string;
  background: string;
  border: string;
};

function getSeverityStyle(
  severity: ProfitAlertSeverity,
  language: Language,
): StatusStyle {
  const styles: Record<ProfitAlertSeverity, StatusStyle> = {
    critical: {
      label: language === "it" ? "Critico" : language === "fr" ? "Critique" : "Critical",
      color: "#ff6b4a",
      background: "rgba(255,107,74,0.11)",
      border: "rgba(255,107,74,0.30)",
    },

    warning: {
      label: language === "it" ? "Attenzione" : language === "fr" ? "Avertissement" : "Warning",
      color: "#f59e0b",
      background: "rgba(245,158,11,0.11)",
      border: "rgba(245,158,11,0.28)",
    },

    opportunity: {
      label: language === "it" ? "Opportunità" : language === "fr" ? "Opportunité" : "Opportunity",
      color: "#22c55e",
      background: "rgba(34,197,94,0.11)",
      border: "rgba(34,197,94,0.28)",
    },

    info: {
      label: language === "it" ? "Informazione" : language === "fr" ? "Information" : "Information",
      color: "#38bdf8",
      background: "rgba(56,189,248,0.11)",
      border: "rgba(56,189,248,0.28)",
    },
  };

  return styles[severity];
}

function getAlertStatusStyle(
  status: ProfitAlertStatus,
  language: Language,
): StatusStyle {
  const styles: Record<ProfitAlertStatus, StatusStyle> = {
    new: {
      label: language === "it" ? "Nuovo" : language === "fr" ? "Nouveau" : "New",
      color: "#ff875f",
      background: "rgba(255,115,80,0.12)",
      border: "rgba(255,115,80,0.30)",
    },

    active: {
      label: language === "it" ? "Attivo" : language === "fr" ? "Actif" : "Active",
      color: "#38bdf8",
      background: "rgba(56,189,248,0.11)",
      border: "rgba(56,189,248,0.28)",
    },

    acknowledged: {
      label: language === "it" ? "Preso in carico" : language === "fr" ? "Pris en compte" : "Acknowledged",
      color: "#c084fc",
      background: "rgba(192,132,252,0.11)",
      border: "rgba(192,132,252,0.28)",
    },

    resolved: {
      label: language === "it" ? "Risolto" : language === "fr" ? "Résolu" : "Resolved",
      color: "#4ade80",
      background: "rgba(34,197,94,0.11)",
      border: "rgba(34,197,94,0.28)",
    },
  };

  return styles[status];
}

function formatTimestamp(timestamp: string | undefined, language: Language) {
  if (!timestamp) {
    return language === "it" ? "Adesso" : language === "fr" ? "Maintenant" : "Now";
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return language === "it" ? "Adesso" : language === "fr" ? "Maintenant" : "Now";
  }

  const differenceMs = Date.now() - date.getTime();
  const differenceMinutes = Math.max(0, Math.floor(differenceMs / 60000));

  if (differenceMinutes < 1) {
    return language === "it" ? "Adesso" : language === "fr" ? "Maintenant" : "Now";
  }

  if (differenceMinutes < 60) {
    return language === "it"
      ? `${differenceMinutes} min fa`
      : language === "fr" ? `il y a ${differenceMinutes} min` : `${differenceMinutes} min ago`;
  }

  const differenceHours = Math.floor(differenceMinutes / 60);

  if (differenceHours < 24) {
    return language === "it"
      ? `${differenceHours} ore fa`
      : language === "fr" ? `il y a ${differenceHours} h` : `${differenceHours}h ago`;
  }

  const differenceDays = Math.floor(differenceHours / 24);

  if (differenceDays === 1) {
    return language === "it" ? "Ieri" : language === "fr" ? "Hier" : "Yesterday";
  }

  if (differenceDays < 7) {
    return language === "it"
      ? `${differenceDays} giorni fa`
      : language === "fr" ? `il y a ${differenceDays} jours` : `${differenceDays} days ago`;
  }

  return new Intl.DateTimeFormat(getLanguageLocale(language), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getAlertCategoryLabel(category: string, language: Language) {
  if (language !== "fr") return category;
  return ({ pricing: "Tarification", "data-quality": "Qualité des données", margin: "Marge", discounts: "Remises", refunds: "Remboursements", growth: "Croissance" } as Record<string, string>)[category] ?? category;
}

function getBusinessActionLabel(action: string, language: Language) {
  if (language !== "fr") return action;
  return ({ action: "Action", review: "Examen", optimize: "Optimisation", monitor: "Suivi" } as Record<string, string>)[action] ?? action;
}

function getModuleDisplayName(module: string, language: Language) {
  return language === "fr" && module === "Products" ? "Produits" : module;
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
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  note,
  color,
}: {
  label: string;
  value: string;
  note: string;
  color: string;
}) {
  return (
    <div
      style={{
        minWidth: 0,
        borderRadius: 21,
        padding: 20,
        background:
          "linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))",
        border: `1px solid ${color}35`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.025)",
      }}
    >
      <div
        style={{
          color,
          fontSize: 9,
          fontWeight: 950,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 11,
          color: "#f8fafc",
          fontSize: 32,
          lineHeight: 1,
          fontWeight: 950,
          letterSpacing: "-0.04em",
        }}
      >
        {value}
      </div>

      <div
        style={{
          marginTop: 8,
          color: "rgba(255,255,255,0.48)",
          fontSize: 11,
          lineHeight: 1.45,
          fontWeight: 750,
        }}
      >
        {note}
      </div>
    </div>
  );
}

function AlertCard({
  alert,
  alertStates,
  language,
  onOpen,
  onAcknowledge,
}: {
  alert: ProfitAlert;
  alertStates: ProfitAlertStateMap;
  language: Language;
  onOpen: (alert: ProfitAlert) => void;
  onAcknowledge: (alertId: string) => void;
}) {
  const { messages } = useI18n();
  const copy = messages.alertCenterPage;
  const state = alertStates[alert.id];
  const economicKind = alert.economicKind;

  const lifecycleStatus: ProfitAlertStatus = state?.status ?? "new";

  const severityStyle = getSeverityStyle(alert.severity, language);

  const lifecycleStyle = getAlertStatusStyle(lifecycleStatus, language);

  const isUnread = state ? !state.isRead : true;
  const isAcknowledged = lifecycleStatus === "acknowledged";

  return (
    <article
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 24,
        padding: 22,
        background: isUnread
          ? `radial-gradient(circle at top right, ${severityStyle.background}, transparent 38%), linear-gradient(145deg, rgba(17,24,39,0.99), rgba(7,12,21,0.99))`
          : "linear-gradient(145deg, rgba(15,22,35,0.97), rgba(7,12,21,0.98))",
        border: isUnread
          ? `1px solid ${severityStyle.border}`
          : "1px solid rgba(255,255,255,0.075)",
        boxShadow: isUnread ? "0 20px 55px rgba(0,0,0,0.25)" : "none",
      }}
    >
      {isUnread && (
        <div
          style={{
            position: "absolute",
            top: 18,
            right: 18,
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: severityStyle.color,
            boxShadow: `0 0 18px ${severityStyle.color}`,
          }}
        />
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "54px minmax(0,1fr) auto",
          gap: 17,
          alignItems: "start",
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 17,
            display: "grid",
            placeItems: "center",
            color: severityStyle.color,
            background: severityStyle.background,
            border: `1px solid ${severityStyle.border}`,
            fontSize: 20,
            fontWeight: 950,
          }}
        >
          {alert.severity === "critical"
            ? "!"
            : alert.severity === "warning"
              ? "↗"
              : alert.severity === "opportunity"
                ? "+"
                : "i"}
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <TinyBadge color={severityStyle.color}>
              {severityStyle.label}
            </TinyBadge>

            <TinyBadge color={lifecycleStyle.color}>
              {lifecycleStyle.label}
            </TinyBadge>

            <TinyBadge color="#94a3b8">{getAlertCategoryLabel(alert.category, language)}</TinyBadge>
          </div>

          <h2
            style={{
              margin: "12px 0 0",
              color: "#f8fafc",
              fontSize: 20,
              lineHeight: 1.28,
              fontWeight: 950,
              letterSpacing: "-0.025em",
            }}
          >
            {alert.title}
          </h2>

          <p
            style={{
              margin: "8px 0 0",
              maxWidth: 850,
              color: "rgba(255,255,255,0.59)",
              fontSize: 13,
              lineHeight: 1.65,
              fontWeight: 720,
            }}
          >
            {alert.description}
          </p>

          <div
            style={{
              marginTop: 13,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <TinyBadge color="#38bdf8">{alert.estimatedMinutes} min</TinyBadge>

            <TinyBadge color="#c084fc">{getModuleDisplayName(alert.recommendedModule, language)}</TinyBadge>

            <TinyBadge color="#64748b">
              {formatTimestamp(state?.firstSeenAt, language)}
            </TinyBadge>
          </div>
        </div>

        <div
          style={{
            minWidth: 175,
            textAlign: "right",
          }}
        >
          <div
            style={{
              color:
                economicKind === "opportunity"
                  ? "#22c55e"
                  : economicKind === "exposure"
                    ? "#f59e0b"
                    : severityStyle.color,
              fontSize: 23,
              lineHeight: 1,
              fontWeight: 950,
              whiteSpace: "nowrap",
            }}
          >
            {alert.monthlyImpact > 0
              ? money(alert.monthlyImpact)
              : copy.qualitative_signal}
          </div>

          <div
            style={{
              marginTop: 7,
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "rgba(255,255,255,0.42)",
              fontSize: 9,
              fontWeight: 850,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            <span>
              {alert.monthlyImpact > 0
                ? economicKind === "loss"
                  ? copy.estimated_monthly_loss
                  : economicKind === "exposure"
                    ? copy.estimated_monthly_exposure
                    : economicKind === "opportunity"
                      ? copy.estimated_monthly_profit_gap_to_target
                      : copy.indicative_monthly_value
                : copy.impact_to_review}
            </span>

            <MetricTooltip
              content={{
                title:
                  copy.alert_economic_impact,

                description:
                  economicKind === "loss"
                    ? copy.economic_loss_description
                    : economicKind === "exposure"
                      ? copy.economic_exposure_description
                      : economicKind === "opportunity"
                        ? copy.economic_opportunity_description
                        : copy.economic_qualitative_description,

                note:
                  copy.this_is_an_estimate_based_on,
              }}
            />
          </div>

          <div
            style={{
              marginTop: 15,
              display: "grid",
              gap: 8,
            }}
          >
            <button
              type="button"
              className="primary-button"
              onClick={() => onOpen(alert)}
            >
              {copy.open_module}
            </button>

            {!isAcknowledged && (
              <button
                type="button"
                className="apply-button"
                onClick={() => onAcknowledge(alert.id)}
              >
                {copy.acknowledge}
              </button>
            )}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 19,
          paddingTop: 16,
          borderTop: "1px solid rgba(255,255,255,0.065)",
          display: "grid",
          gridTemplateColumns: "repeat(3,minmax(0,1fr))",
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "rgba(255,255,255,0.35)",
              fontSize: 8,
              fontWeight: 950,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            <span>
              {copy.priority}
            </span>

            <MetricTooltip
              content={{
                title:
                  copy.alert_priority,

                description:
                  copy.a_0_100_score_showing_how,

                note:
                  copy.the_higher_the_score_the_higher,
              }}
            />
          </div>

          <div
            style={{
              marginTop: 5,
              color: "#f8fafc",
              fontSize: 14,
              fontWeight: 900,
            }}
          >
            {alert.priority}/100
          </div>
        </div>

        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "rgba(255,255,255,0.35)",
              fontSize: 8,
              fontWeight: 950,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            <span>
              {copy.business_action}
            </span>

            <MetricTooltip
              content={{
                title:
                  copy.business_action_2,

                description:
                  copy.shows_the_type_of_response_marginlab,

                note:
                  copy.action_calls_for_direct_intervention_review,
              }}
            />
          </div>

          <div
            style={{
              marginTop: 5,
              color: severityStyle.color,
              fontSize: 14,
              fontWeight: 900,
              textTransform: "capitalize",
            }}
          >
            {getBusinessActionLabel(alert.businessAction, language)}
          </div>
        </div>

        <div>
          <div
            style={{
              color: "rgba(255,255,255,0.35)",
              fontSize: 8,
              fontWeight: 950,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {copy.product}
          </div>

          <div
            style={{
              marginTop: 5,
              color: "#f8fafc",
              fontSize: 14,
              fontWeight: 900,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {alert.productTitle ??
              (copy.store_wide)}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function AlertCenterPage() {
  const {
    summary,
    rows,
    period,
    currencyCode,
    economicSnapshot,
    shopHandle,
    growthAccess,
    alertStates: initialAlertStates,
  } = useLoaderData<typeof loader>();

  const navigate = useNavigate();
  const alertStateFetcher = useFetcher<typeof action>();
  const migrationFetcher = useFetcher<typeof action>();

  const { language, locale, messages } = useI18n();
  const copy = messages.alertCenterPage;

  const alerts = React.useMemo(
    () =>
      generateProfitAlerts({
        summary,
        rows,
        language,
        period,
        currencyCode,
      }),
    [summary, rows, language, period, currencyCode],
  );

  const [alertStates, setAlertStates] =
    React.useState<ProfitAlertStateMap>(initialAlertStates);

  const [severityFilter, setSeverityFilter] =
    React.useState<SeverityFilter>("all");

  const [showAcknowledged, setShowAcknowledged] = React.useState(true);

  React.useEffect(() => {
    if (alertStateFetcher.data?.alertStates) {
      setAlertStates(alertStateFetcher.data.alertStates);
    }
  }, [alertStateFetcher.data]);

  React.useEffect(() => {
    if (!growthAccess) return;

    const marker = `marginlab_profit_alert_db_migrated_${period}`;

    if (window.sessionStorage.getItem(marker)) return;

    const legacyStates = getStoredProfitAlertStates();
    window.sessionStorage.setItem(marker, "1");

    if (Object.keys(legacyStates).length === 0) return;

    migrationFetcher.submit(
      {
        intent: "migrate-local-states",
        period: String(period),
        states: JSON.stringify(legacyStates),
      },
      { method: "post" },
    );
  }, [growthAccess, migrationFetcher, period]);

  React.useEffect(() => {
    if (migrationFetcher.data?.alertStates) {
      setAlertStates(migrationFetcher.data.alertStates);
    }
  }, [migrationFetcher.data]);

  const submitAlertState = (intent: string, alertId?: string) => {
    if (!growthAccess) {
      navigate("/app/billing");
      return;
    }

    alertStateFetcher.submit(
      {
        intent,
        period: String(period),
        ...(alertId ? { alertId } : {}),
      },
      { method: "post" },
    );
  };

  const severityCounts = React.useMemo(
    () => getProfitAlertCounts(alerts),
    [alerts],
  );

  const lifecycleCounts = React.useMemo(
    () => getProfitAlertStatusCounts(alertStates),
    [alertStates],
  );

  const filteredAlerts = React.useMemo(() => {
    return alerts.filter((alert) => {
      if (severityFilter !== "all" && alert.severity !== severityFilter) {
        return false;
      }

      const state = alertStates[alert.id];

      if (!showAcknowledged && state?.status === "acknowledged") {
        return false;
      }

      return true;
    });
  }, [alerts, alertStates, severityFilter, showAcknowledged]);

  const economicTotals = economicSnapshot?.totals ?? {
    monthlyLoss: 0,
    monthlyExposure: 0,
    monthlyOpportunity: 0,
  };

  const dataConfidence = economicSnapshot?.confidence ?? {
    score: 0,
    level: "low" as const,
    cogsCoveragePct: 0,
    comparisonAvailable: false,
  };

  const confidenceLabel =
    dataConfidence.level === "high"
      ? copy.high
      : dataConfidence.level === "medium"
        ? copy.medium
        : copy.low;

  const confidenceColor =
    dataConfidence.level === "high"
      ? "#22c55e"
      : dataConfidence.level === "medium"
        ? "#f59e0b"
        : "#ff6b4a";

  const storeMoney = (value: number) => money(value, currencyCode, locale);

  const criticalCount = severityCounts.critical;
  const warningCount = severityCounts.warning;

  const businessStatus =
    criticalCount > 0
      ? {
        label: copy.action_required,
        description:
          copy.at_least_one_critical_profitability_risk,
        color: "#ff6b4a",
      }
      : warningCount > 0
        ? {
          label:
            copy.review_recommended,
          description:
            copy.there_is_no_broad_emergency_but,
          color: "#f59e0b",
        }
        : severityCounts.opportunity > 0
          ? {
            label:
              copy.opportunities_available,
            description:
              copy.the_business_is_relatively_stable_and,
            color: "#22c55e",
          }
          : {
            label: copy.stable_status,
            description:
              copy.no_significant_profitability_risk_requires_immediate,
            color: "#38bdf8",
          };

  const handleOpenAlert = (alert: ProfitAlert) => {
    if (!growthAccess) {
      navigate("/app/billing");
      return;
    }

    setAlertStates((states) => ({
      ...states,
      [alert.id]: {
        ...states[alert.id],
        alertId: alert.id,
        isRead: true,
        status:
          states[alert.id]?.status === "new"
            ? "active"
            : (states[alert.id]?.status ?? "active"),
        firstSeenAt: states[alert.id]?.firstSeenAt ?? new Date().toISOString(),
        lastSeenAt: states[alert.id]?.lastSeenAt ?? new Date().toISOString(),
      },
    }));
    submitAlertState("read", alert.id);
    navigate(alert.route);
  };

  const handleAcknowledge = (alertId: string) => {
    if (!growthAccess) {
      navigate("/app/billing");
      return;
    }

    const now = new Date().toISOString();
    setAlertStates((states) => ({
      ...states,
      [alertId]: {
        ...states[alertId],
        alertId,
        status: "acknowledged",
        isRead: true,
        acknowledgedAt: now,
        firstSeenAt: states[alertId]?.firstSeenAt ?? now,
        lastSeenAt: states[alertId]?.lastSeenAt ?? now,
      },
    }));
    submitAlertState("acknowledge", alertId);
  };

  const handleMarkAllRead = () => {
    if (!growthAccess) {
      navigate("/app/billing");
      return;
    }

    setAlertStates(
      (states) =>
        Object.fromEntries(
          Object.entries(states).map(([id, state]) => [
            id,
            {
              ...state,
              isRead: true,
              status: state.status === "new" ? "active" : state.status,
            },
          ]),
        ) as ProfitAlertStateMap,
    );
    submitAlertState("read-all");
  };

  const handleExportCsv = () => {
    if (!growthAccess) {
      navigate("/app/billing");
      return;
    }

    const exportLocale = language === "it" ? "it-IT" : "en-US";

    const round2 = (value: number) =>
      Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

    const csvCell = (value: string | number | boolean | null | undefined) => {
      if (typeof value === "number") return String(round2(value));
      if (typeof value === "boolean") return value ? "true" : "false";

      let text = value == null ? "" : String(value);

      if (/^[=+@\t\r]/.test(text) || /^-\D/.test(text)) {
        text = `'${text}`;
      }

      return `"${text.replace(/"/g, '""')}"`;
    };

    const csvRow = (
      values: Array<string | number | boolean | null | undefined>,
    ) => values.map(csvCell).join(",");

    const dateTime = (value: string | undefined) => {
      if (!value) return "";
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(exportLocale);
    };

    const severityLabel = (severity: ProfitAlertSeverity) =>
      getSeverityStyle(severity, language).label;

    const statusLabel = (status: ProfitAlertStatus) =>
      getAlertStatusStyle(status, language).label;

    const economicKindLabel = (kind: ProfitAlert["economicKind"]) => {
      if (language === "it") {
        if (kind === "loss") return "Perdita";
        if (kind === "opportunity") return "Gap verso il target";
        if (kind === "exposure") return "Esposizione";
        return "Qualitativo";
      }

      if (kind === "loss") return "Loss";
      if (kind === "opportunity") return "Profit gap to target";
      if (kind === "exposure") return "Exposure";
      return "Qualitative";
    };

    const labels =
      language === "it"
        ? {
          report: "Report",
          store: "Store",
          period: "Periodo (giorni)",
          currency: "Valuta",
          language: "Lingua",
          generated: "Generato il",
          storage: "Storico stati",
          storageValue: "Database MarginLab",
          summary: "RIEPILOGO",
          metric: "Metrica",
          value: "Valore",
          currentAlerts: "Alert correnti",
          newAlerts: "Nuovi",
          unreadCurrent: "Alert correnti non letti",
          active: "Attivi",
          acknowledged: "Presi in carico",
          historicalResolved: "Risolti storici",
          totalExported: "Record totali esportati",
          critical: "Critici",
          warnings: "Attenzione",
          opportunities: "Opportunità",
          information: "Informazioni",
          monthlyLoss: "Perdita mensile stimata",
          monthlyExposure: "Esposizione ricavi per costi mancanti",
          monthlyOpportunity:
            "Gap mensile stimato verso il target (non cumulabile)",
          confidence: "Affidabilità dati",
          cogsCoverage: "Copertura COGS",
          alerts: "DETTAGLIO ALERT",
          columns: [
            "ID",
            "Titolo",
            "Descrizione",
            "Categoria",
            "Severità",
            "Stato",
            "Letto",
            "Natura economica",
            "Importo economico mensile",
            "Priorità",
            "Azione",
            "Prodotto",
            "Tempo stimato (min)",
            "Modulo consigliato",
            "Percorso",
            "Prima rilevazione",
            "Ultima rilevazione",
            "Preso in carico il",
            "Risolto il",
          ],
        }
        : {
          report: "Report",
          store: "Store",
          period: "Period (days)",
          currency: "Currency",
          language: "Language",
          generated: "Generated at",
          storage: "Status history",
          storageValue: "MarginLab database",
          summary: "SUMMARY",
          metric: "Metric",
          value: "Value",
          currentAlerts: "Current alerts",
          newAlerts: "New",
          unreadCurrent: "Unread current alerts",
          active: "Active",
          acknowledged: "Acknowledged",
          historicalResolved: "Historical resolved",
          totalExported: "Total exported records",
          critical: "Critical",
          warnings: "Warnings",
          opportunities: "Opportunities",
          information: "Information",
          monthlyLoss: "Estimated monthly loss",
          monthlyExposure: "Missing-cost revenue exposure",
          monthlyOpportunity:
            "Estimated monthly profit gap to target (non-additive)",
          confidence: "Data confidence",
          cogsCoverage: "COGS coverage",
          alerts: "ALERT DETAILS",
          columns: [
            "ID",
            "Title",
            "Description",
            "Category",
            "Severity",
            "Status",
            "Read",
            "Economic kind",
            "Monthly economic amount",
            "Priority",
            "Business action",
            "Product",
            "Estimated time (min)",
            "Recommended module",
            "Route",
            "First seen",
            "Last seen",
            "Acknowledged at",
            "Resolved at",
          ],
        };

    const currentAlertIds = new Set(alerts.map((alert) => alert.id));
    const currentStates = alerts.map(
      (alert) =>
        alertStates[alert.id] ?? {
          alertId: alert.id,
          status: "new" as ProfitAlertStatus,
          isRead: false,
        },
    );
    const currentStatusCounts = {
      new: currentStates.filter((state) => state.status === "new").length,
      active: currentStates.filter((state) => state.status === "active").length,
      acknowledged: currentStates.filter(
        (state) => state.status === "acknowledged",
      ).length,
      unread: currentStates.filter((state) => !state.isRead).length,
    };
    const historicalResolvedStates = Object.values(alertStates).filter(
      (state) =>
        !currentAlertIds.has(state.alertId) && state.status === "resolved",
    );
    const historicalStateRows = historicalResolvedStates.map((state) =>
      csvRow([
        state.alertId,
        "",
        "",
        "",
        "",
        statusLabel(state.status),
        state.isRead,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        dateTime(state.firstSeenAt),
        dateTime(state.lastSeenAt),
        dateTime(state.acknowledgedAt),
        dateTime(state.resolvedAt),
      ]),
    );

    const output = [
      csvRow([labels.report, "MarginLab Alert Center"]),
      csvRow([labels.store, shopHandle || ""]),
      csvRow([labels.period, period]),
      csvRow([labels.currency, currencyCode]),
      csvRow([labels.language, language === "it" ? "Italiano" : "English"]),
      csvRow([labels.generated, new Date().toLocaleString(exportLocale)]),
      csvRow([labels.storage, labels.storageValue]),
      "",
      csvRow([labels.summary]),
      csvRow([labels.metric, labels.value]),
      csvRow([labels.currentAlerts, alerts.length]),
      csvRow([labels.newAlerts, currentStatusCounts.new]),
      csvRow([labels.active, currentStatusCounts.active]),
      csvRow([labels.acknowledged, currentStatusCounts.acknowledged]),
      csvRow([labels.historicalResolved, historicalResolvedStates.length]),
      csvRow([
        labels.totalExported,
        alerts.length + historicalResolvedStates.length,
      ]),
      csvRow([labels.unreadCurrent, currentStatusCounts.unread]),
      csvRow([labels.critical, severityCounts.critical]),
      csvRow([labels.warnings, severityCounts.warning]),
      csvRow([labels.opportunities, severityCounts.opportunity]),
      csvRow([labels.information, severityCounts.info]),
      csvRow([labels.monthlyLoss, economicTotals.monthlyLoss]),
      csvRow([labels.monthlyExposure, economicTotals.monthlyExposure]),
      csvRow([labels.monthlyOpportunity, economicTotals.monthlyOpportunity]),
      csvRow([labels.confidence, dataConfidence.score]),
      csvRow([labels.cogsCoverage, dataConfidence.cogsCoveragePct]),
      "",
      csvRow([labels.alerts]),
      csvRow(labels.columns),
      ...alerts.map((alert) => {
        const state = alertStates[alert.id];
        const status = state?.status ?? "new";

        return csvRow([
          alert.id,
          alert.title,
          alert.description,
          alert.category,
          severityLabel(alert.severity),
          statusLabel(status),
          state ? state.isRead : false,
          economicKindLabel(alert.economicKind),
          alert.monthlyImpact,
          alert.priority,
          alert.businessAction,
          alert.productTitle ??
          (language === "it" ? "Intero store" : "Store-wide"),
          alert.estimatedMinutes,
          alert.recommendedModule,
          alert.route,
          dateTime(state?.firstSeenAt),
          dateTime(state?.lastSeenAt),
          dateTime(state?.acknowledgedAt),
          dateTime(state?.resolvedAt),
        ]);
      }),
      ...historicalStateRows,
    ].join("\r\n");

    const blob = new Blob([`\uFEFF${output}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeShop = (shopHandle || "store")
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();

    link.href = url;
    link.download = `${safeShop}-alert-center-${period}d.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const filters: Array<{
    id: SeverityFilter;
    label: string;
    count: number;
    color: string;
  }> = [
      {
        id: "all",
        label: copy.all,
        count: severityCounts.total,
        color: "#f8fafc",
      },
      {
        id: "critical",
        label: copy.critical,
        count: severityCounts.critical,
        color: "#ff6b4a",
      },
      {
        id: "warning",
        label: copy.warnings,
        count: severityCounts.warning,
        color: "#f59e0b",
      },
      {
        id: "opportunity",
        label: copy.opportunities,
        count: severityCounts.opportunity,
        color: "#22c55e",
      },
      {
        id: "info",
        label: copy.information,
        count: severityCounts.info,
        color: "#38bdf8",
      },
    ];

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardNav active="alert-center" navigate={navigate} />

        <div className="hero-header">
          <div>
            <div className="alert-pill">
              <span className="alert-dot" />

              {growthAccess
                ? copy.growth_plan_active
                : copy.growth_feature}
            </div>

            <div className="eyebrow">ALERT CENTER</div>

            <div className="hero-title">
              {copy.the_signals_that_deserve_your_attention}
            </div>

            <div className="hero-description">
              {copy.marginlab_monitors_margins_costs_refunds_and}
            </div>

            <div
              style={{
                marginTop: 14,
                display: "inline-flex",
                padding: "7px 11px",
                borderRadius: 999,
                background: "rgba(34,197,94,0.08)",
                border: "1px solid rgba(34,197,94,0.18)",
                color: "#4ade80",
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {copy.tax_aware_economic_basis}
            </div>
          </div>

          {growthAccess ? (
            <button
              type="button"
              className="apply-button"
              onClick={handleMarkAllRead}
              disabled={lifecycleCounts.unread === 0}
              style={{
                opacity: lifecycleCounts.unread === 0 ? 0.55 : 1,
              }}
            >
              {copy.mark_all_as_read}
            </button>
          ) : (
            <button
              type="button"
              className="primary-button"
              onClick={() => navigate("/app/billing")}
            >
              {copy.unlock_growth}
            </button>
          )}
        </div>

        <div
          style={{
            position: "relative",
            ...(growthAccess ? {} : { overflow: "hidden", borderRadius: 30 }),
          }}
        >
          {!growthAccess && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 80,
                display: "grid",
                placeItems: "start center",
                paddingTop: 150,
                background:
                  "linear-gradient(180deg, rgba(5,9,16,0.28), rgba(5,9,16,0.74) 26%, rgba(5,9,16,0.92))",
                backdropFilter: "blur(2px)",
              }}
            >
              <div
                style={{
                  width: "min(560px, calc(100% - 40px))",
                  padding: 26,
                  borderRadius: 24,
                  textAlign: "center",
                  background:
                    "linear-gradient(180deg, rgba(17,24,39,0.99), rgba(7,12,21,0.99))",
                  border: "1px solid rgba(255,115,60,0.30)",
                  boxShadow: "0 24px 70px rgba(0,0,0,0.44)",
                }}
              >
                <div
                  style={{
                    color: "#ff9a70",
                    fontSize: 11,
                    fontWeight: 950,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  {copy.growth_feature_2}
                </div>

                <div
                  style={{
                    marginTop: 10,
                    color: "#f8fafc",
                    fontSize: 24,
                    lineHeight: 1.25,
                    fontWeight: 950,
                  }}
                >
                  {copy.alert_center_is_included_with_growth}
                </div>

                <div
                  style={{
                    marginTop: 10,
                    color: "rgba(255,255,255,0.62)",
                    fontSize: 13,
                    lineHeight: 1.65,
                    fontWeight: 750,
                  }}
                >
                  {copy.upgrade_to_growth_to_manage_alerts}
                </div>

                <button
                  type="button"
                  className="primary-button"
                  onClick={() => navigate("/app/billing")}
                  style={{ marginTop: 18 }}
                >
                  {copy.unlock_growth}
                </button>
              </div>
            </div>
          )}

          <div
            aria-hidden={!growthAccess}
            style={
              growthAccess
                ? undefined
                : {
                  pointerEvents: "none",
                  userSelect: "none",
                  opacity: 0.5,
                }
            }
          >
            <section
              style={{
                marginBottom: 25,
                borderRadius: 30,
                padding: 28,
                background: `radial-gradient(circle at 12% 15%, ${businessStatus.color}20, transparent 32%), radial-gradient(circle at 88% 12%, rgba(255,115,80,0.10), transparent 30%), linear-gradient(135deg, rgba(15,23,36,0.99), rgba(6,11,20,0.99))`,
                border: `1px solid ${businessStatus.color}38`,
                boxShadow:
                  "0 28px 90px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.03)",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.1fr 0.9fr",
                  gap: 25,
                  alignItems: "center",
                }}
              >
                <div>
                  <div
                    style={{
                      color: businessStatus.color,
                      fontSize: 10,
                      fontWeight: 950,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                    }}
                  >
                    {copy.monitoring_status}
                  </div>

                  <h2
                    style={{
                      margin: "11px 0 0",
                      color: "#f8fafc",
                      fontSize: 36,
                      lineHeight: 1.12,
                      fontWeight: 950,
                      letterSpacing: "-0.045em",
                    }}
                  >
                    {businessStatus.label}
                  </h2>

                  <p
                    style={{
                      margin: "12px 0 0",
                      maxWidth: 720,
                      color: "rgba(255,255,255,0.64)",
                      fontSize: 14,
                      lineHeight: 1.7,
                      fontWeight: 730,
                    }}
                  >
                    {businessStatus.description}
                  </p>

                  <div
                    style={{
                      marginTop: 20,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <TinyBadge color={businessStatus.color}>
                      {lifecycleCounts.unread}{" "}
                      {copy.unread}
                    </TinyBadge>

                    <TinyBadge color="#38bdf8">
                      {lifecycleCounts.active}{" "}
                      {copy.active}
                    </TinyBadge>

                    <TinyBadge color="#c084fc">
                      {lifecycleCounts.acknowledged}{" "}
                      {copy.acknowledged}
                    </TinyBadge>
                  </div>
                </div>

                <div
                  style={{
                    borderRadius: 25,
                    padding: 23,
                    background: "rgba(255,255,255,0.025)",
                    border: "1px solid rgba(255,255,255,0.075)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      color: "rgba(255,255,255,0.42)",
                      fontSize: 9,
                      fontWeight: 950,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                    }}
                  >
                    <span>
                      {copy.monthly_economic_impacts}
                    </span>

                    <MetricTooltip
                      content={{
                        title:
                          copy.monthly_economic_impacts_2,

                        description:
                          copy.shows_three_separate_values_estimated_loss,

                        note:
                          copy.these_values_should_not_be_added,
                      }}
                    />
                  </div>

                  <div
                    style={{
                      marginTop: 13,
                      color: "#f8fafc",
                      fontSize: 47,
                      lineHeight: 1,
                      fontWeight: 950,
                      letterSpacing: "-0.055em",
                    }}
                  >
                    <span style={{ color: "#ff6b4a" }}>
                      {storeMoney(economicTotals.monthlyLoss)}
                    </span>
                    <span
                      style={{ color: "rgba(255,255,255,0.32)", margin: "0 10px" }}
                    >
                      ·
                    </span>
                    <span style={{ color: "#f59e0b" }}>
                      {storeMoney(economicTotals.monthlyExposure)}
                    </span>
                    <span
                      style={{ color: "rgba(255,255,255,0.32)", margin: "0 10px" }}
                    >
                      ·
                    </span>
                    <span style={{ color: "#22c55e" }}>
                      {storeMoney(economicTotals.monthlyOpportunity)}
                    </span>
                  </div>

                  <div
                    style={{
                      marginTop: 9,
                      color: "rgba(255,255,255,0.47)",
                      fontSize: 11,
                      lineHeight: 1.55,
                      fontWeight: 750,
                    }}
                  >
                    {copy.loss_exposure_profit_gap_to_target}
                  </div>

                  <div
                    style={{
                      marginTop: 15,
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: 9,
                    }}
                  >
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <TinyBadge color={confidenceColor}>
                        {copy.confidence_badge} {dataConfidence.score}% · {confidenceLabel}
                      </TinyBadge>

                      <MetricTooltip
                        content={{
                          title:
                            copy.data_confidence,

                          description:
                            copy.shows_how_reliable_marginlab_considers_the,

                          note:
                            copy.a_higher_value_means_the_analysis,
                        }}
                      />
                    </div>

                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <TinyBadge color="#60a5fa">
                        {copy.cogs_coverage_badge} {Math.round(dataConfidence.cogsCoveragePct)}%
                      </TinyBadge>

                      <MetricTooltip
                        content={{
                          title:
                            copy.cogs_coverage,

                          description:
                            copy.shows_how_much_of_the_analyzed,

                          note:
                            copy.low_coverage_can_make_margins_losses,
                        }}
                      />
                    </div>

                    {!dataConfidence.comparisonAvailable ? (
                      <TinyBadge color="#94a3b8">
                        {copy.comparison_unavailable}
                      </TinyBadge>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4,minmax(0,1fr))",
                gap: 13,
                marginBottom: 25,
              }}
            >
              <SummaryCard
                label={copy.critical}
                value={`${severityCounts.critical}`}
                note={
                  copy.require_priority
                }
                color="#ff6b4a"
              />

              <SummaryCard
                label={copy.warnings}
                value={`${severityCounts.warning}`}
                note={copy.need_review}
                color="#f59e0b"
              />

              <SummaryCard
                label={copy.opportunities}
                value={`${severityCounts.opportunity}`}
                note={
                  copy.potential_improvement
                }
                color="#22c55e"
              />

              <SummaryCard
                label={copy.unread_2}
                value={`${lifecycleCounts.unread}`}
                note={copy.new_signals}
                color="#38bdf8"
              />
            </div>

            <section
              className="panel"
              style={{
                margin: 0,
                padding: 22,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 16,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div className="panel-eyebrow">
                    {copy.active_signals}
                  </div>

                  <h2 className="panel-title" style={{ marginTop: 6 }}>
                    {copy.profit_alert_feed}
                  </h2>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                  }}
                >
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 9,
                      color: "rgba(255,255,255,0.55)",
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={showAcknowledged}
                      disabled={!growthAccess}
                      onChange={(event) =>
                        setShowAcknowledged(event.target.checked)
                      }
                    />

                    {copy.show_acknowledged}
                  </label>

                  <button
                    type="button"
                    className="apply-button"
                    onClick={handleExportCsv}
                  >
                    {copy.export_csv}
                  </button>
                </div>
              </div>

              <div
                style={{
                  marginTop: 20,
                  display: "flex",
                  gap: 9,
                  flexWrap: "wrap",
                }}
              >
                {filters.map((filter) => {
                  const selected = severityFilter === filter.id;

                  return (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setSeverityFilter(filter.id)}
                      style={{
                        cursor: "pointer",
                        minHeight: 38,
                        padding: "9px 13px",
                        borderRadius: 999,
                        color: selected ? filter.color : "rgba(255,255,255,0.52)",
                        background: selected
                          ? `${filter.color}16`
                          : "rgba(255,255,255,0.025)",
                        border: selected
                          ? `1px solid ${filter.color}42`
                          : "1px solid rgba(255,255,255,0.07)",
                        fontSize: 10,
                        fontWeight: 900,
                      }}
                    >
                      {filter.label}{" "}
                      <span
                        style={{
                          marginLeft: 5,
                          opacity: 0.72,
                        }}
                      >
                        {filter.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div
                style={{
                  marginTop: 21,
                  display: "grid",
                  gap: 14,
                }}
              >
                {filteredAlerts.length > 0 ? (
                  filteredAlerts.map((alert) => (
                    <AlertCard
                      key={alert.id}
                      alert={alert}
                      alertStates={alertStates}
                      language={language}
                      onOpen={handleOpenAlert}
                      onAcknowledge={handleAcknowledge}
                    />
                  ))
                ) : (
                  <div
                    style={{
                      padding: 32,
                      textAlign: "center",
                      borderRadius: 21,
                      color: "rgba(255,255,255,0.54)",
                      background: "rgba(255,255,255,0.025)",
                      border: "1px solid rgba(255,255,255,0.07)",
                      fontSize: 13,
                      fontWeight: 760,
                    }}
                  >
                    {copy.no_alerts_match_the_selected_filters}
                  </div>
                )}
              </div>
            </section>

            <div
              style={{
                marginTop: 23,
                marginBottom: 24,
                padding: 18,
                borderRadius: 18,
                background: "rgba(255,115,60,0.065)",
                border: "1px solid rgba(255,115,60,0.18)",
                color: "rgba(255,255,255,0.62)",
                fontSize: 12,
                lineHeight: 1.65,
                fontWeight: 700,
              }}
            >
              {copy.alerts_are_generated_using_the_tax}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
