import * as React from "react";
import { useFetcher, useLoaderData, useNavigate } from "react-router";

import { authenticate } from "~/shopify.server";
import { loadMarginDashboardData } from "~/utils/margin.server";
import { getBillingStatus, hasGrowthAccess } from "~/utils/billing.server";
import { createGrowthPreviewData } from "~/utils/growth-preview.server";
import DashboardNav from "~/components/dashboard/DashboardNav";
import MetricTooltip from "~/components/ui/MetricTooltip";
import {
  FlowPath,
  MetricCard,
  PremiumEmptyState,
  PremiumHero,
  PremiumPanel,
  ResponsiveGrid,
  SegmentedTabs,
  StatusChip,
  VisualButton,
  type VisualTone,
} from "~/components/ui/VisualSystem";

import dashboardStylesUrl from "~/styles/dashboard.css?url";
import alertCenterStylesUrl from "~/styles/alert-center-v2.css?url";

import { uiMoney as money } from "~/utils/margin";
import { useI18n } from "~/components/i18n/I18nProvider";
import { getLanguageLocale, type Language } from "~/utils/i18n";
import { getRequestLanguage } from "~/utils/i18n.server";

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
import { findProfitImpactActionsBySourceKeys } from "~/services/profit-impact.server";

export const links = () => [
  {
    rel: "stylesheet",
    href: dashboardStylesUrl,
  },
  {
    rel: "stylesheet",
    href: alertCenterStylesUrl,
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

  const data = growthAccess
    ? await loadMarginDashboardData({
        admin,
        session,
        period,
        billingStatus: billing,
      })
    : createGrowthPreviewData({ billing, period, shop: session.shop });

  const alerts = generateProfitAlerts({
    summary: data.summary,
    rows: data.rows,
    language: getRequestLanguage(request),
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
  const trackedActions = growthAccess
    ? await findProfitImpactActionsBySourceKeys({
        shop: session.shop,
        sourceAlertKeys: alerts.map((alert) => alert.id),
      })
    : [];

  return {
    ...data,
    billing,
    growthAccess,
    alertStates,
    trackedActions,
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
      label:
        language === "it"
          ? "Critico"
          : language === "fr"
            ? "Critique"
            : language === "de"
              ? "Kritisch"
              : language === "es"
                ? "Crítico"
                : language === "pt-BR"
                  ? "Crítico"
                  : "Critical",
      color: "#ff6b4a",
      background: "rgba(255,107,74,0.11)",
      border: "rgba(255,107,74,0.30)",
    },

    warning: {
      label:
        language === "it"
          ? "Attenzione"
          : language === "fr"
            ? "Avertissement"
            : language === "de"
              ? "Warnung"
              : language === "es"
                ? "Advertencia"
                : language === "pt-BR"
                  ? "Aviso"
                  : "Warning",
      color: "#f59e0b",
      background: "rgba(245,158,11,0.11)",
      border: "rgba(245,158,11,0.28)",
    },

    opportunity: {
      label:
        language === "it"
          ? "Opportunità"
          : language === "fr"
            ? "Opportunité"
            : language === "de"
              ? "Chance"
              : language === "es"
                ? "Oportunidad"
                : language === "pt-BR"
                  ? "Oportunidade"
                  : "Opportunity",
      color: "#22c55e",
      background: "rgba(34,197,94,0.11)",
      border: "rgba(34,197,94,0.28)",
    },

    info: {
      label:
        language === "it"
          ? "Informazione"
          : language === "fr"
            ? "Information"
            : language === "de"
              ? "Information"
              : language === "es"
                ? "Información"
                : language === "pt-BR"
                  ? "Informação"
                  : "Information",
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
      label:
        language === "it"
          ? "Nuovo"
          : language === "fr"
            ? "Nouveau"
            : language === "de"
              ? "Neu"
              : language === "es"
                ? "Nuevo"
                : language === "pt-BR"
                  ? "Novo"
                  : "New",
      color: "#ff875f",
      background: "rgba(255,115,80,0.12)",
      border: "rgba(255,115,80,0.30)",
    },

    active: {
      label:
        language === "it"
          ? "Attivo"
          : language === "fr"
            ? "Actif"
            : language === "de"
              ? "Aktiv"
              : language === "es"
                ? "Activo"
                : language === "pt-BR"
                  ? "Ativo"
                  : "Active",
      color: "#38bdf8",
      background: "rgba(56,189,248,0.11)",
      border: "rgba(56,189,248,0.28)",
    },

    acknowledged: {
      label:
        language === "it"
          ? "Preso in carico"
          : language === "fr"
            ? "Pris en compte"
            : language === "de"
              ? "Zur Kenntnis genommen"
              : language === "es"
                ? "Confirmado"
                : language === "pt-BR"
                  ? "Reconhecido"
                  : "Acknowledged",
      color: "#c084fc",
      background: "rgba(192,132,252,0.11)",
      border: "rgba(192,132,252,0.28)",
    },

    resolved: {
      label:
        language === "it"
          ? "Risolto"
          : language === "fr"
            ? "Résolu"
            : language === "de"
              ? "Gelöst"
              : language === "es"
                ? "Resuelto"
                : language === "pt-BR"
                  ? "Resolvido"
                  : "Resolved",
      color: "#4ade80",
      background: "rgba(34,197,94,0.11)",
      border: "rgba(34,197,94,0.28)",
    },
  };

  return styles[status];
}

function formatTimestamp(timestamp: string | undefined, language: Language) {
  if (!timestamp) {
    return language === "it"
      ? "Adesso"
      : language === "fr"
        ? "Maintenant"
        : language === "de"
          ? "Jetzt"
          : language === "es"
            ? "Ahora"
            : language === "pt-BR"
              ? "Agora"
              : "Now";
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return language === "it"
      ? "Adesso"
      : language === "fr"
        ? "Maintenant"
        : language === "de"
          ? "Jetzt"
          : language === "es"
            ? "Ahora"
            : language === "pt-BR"
              ? "Agora"
              : "Now";
  }

  const differenceMs = Date.now() - date.getTime();
  const differenceMinutes = Math.max(0, Math.floor(differenceMs / 60000));

  if (differenceMinutes < 1) {
    return language === "it"
      ? "Adesso"
      : language === "fr"
        ? "Maintenant"
        : language === "de"
          ? "Jetzt"
          : language === "es"
            ? "Ahora"
            : language === "pt-BR"
              ? "Agora"
              : "Now";
  }

  if (differenceMinutes < 60) {
    return language === "it"
      ? `${differenceMinutes} min fa`
      : language === "fr"
        ? `il y a ${differenceMinutes} min`
        : language === "de"
          ? `vor ${differenceMinutes} Min.`
          : language === "es"
            ? `hace ${differenceMinutes} min`
            : language === "pt-BR"
              ? `há ${differenceMinutes} min`
              : `${differenceMinutes} min ago`;
  }

  const differenceHours = Math.floor(differenceMinutes / 60);

  if (differenceHours < 24) {
    return language === "it"
      ? `${differenceHours} ore fa`
      : language === "fr"
        ? `il y a ${differenceHours} h`
        : language === "de"
          ? `vor ${differenceHours} Std.`
          : language === "es"
            ? `hace ${differenceHours} h`
            : language === "pt-BR"
              ? `há ${differenceHours} h`
              : `${differenceHours}h ago`;
  }

  const differenceDays = Math.floor(differenceHours / 24);

  if (differenceDays === 1) {
    return language === "it"
      ? "Ieri"
      : language === "fr"
        ? "Hier"
        : language === "de"
          ? "Gestern"
          : language === "es"
            ? "Ayer"
            : language === "pt-BR"
              ? "Ontem"
              : "Yesterday";
  }

  if (differenceDays < 7) {
    return language === "it"
      ? `${differenceDays} giorni fa`
      : language === "fr"
        ? `il y a ${differenceDays} jours`
        : language === "de"
          ? `vor ${differenceDays} Tagen`
          : language === "es"
            ? `hace ${differenceDays} días`
            : language === "pt-BR"
              ? `há ${differenceDays} dias`
              : `${differenceDays} days ago`;
  }

  return new Intl.DateTimeFormat(getLanguageLocale(language), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getAlertCategoryLabel(category: string, language: Language) {
  if (language === "fr")
    return (
      (
        {
          pricing: "Tarification",
          "data-quality": "Qualité des données",
          margin: "Marge",
          discounts: "Remises",
          refunds: "Remboursements",
          growth: "Croissance",
        } as Record<string, string>
      )[category] ?? category
    );
  if (language === "de")
    return (
      (
        {
          pricing: "Preisgestaltung",
          "data-quality": "Datenqualität",
          margin: "Marge",
          discounts: "Rabatte",
          refunds: "Erstattungen",
          growth: "Wachstum",
        } as Record<string, string>
      )[category] ?? category
    );
  if (language === "es")
    return (
      (
        {
          pricing: "Precios",
          "data-quality": "Calidad de datos",
          margin: "Margen",
          discounts: "Descuentos",
          refunds: "Reembolsos",
          growth: "Crecimiento",
        } as Record<string, string>
      )[category] ?? category
    );
  if (language === "pt-BR")
    return (
      (
        {
          pricing: "Precificação",
          "data-quality": "Qualidade dos dados",
          margin: "Margem",
          discounts: "Descontos",
          refunds: "Reembolsos",
          growth: "Crescimento",
        } as Record<string, string>
      )[category] ?? category
    );
  return category;
}

function getBusinessActionLabel(action: string, language: Language) {
  if (language === "fr")
    return (
      (
        {
          action: "Action",
          review: "Examen",
          optimize: "Optimisation",
          monitor: "Suivi",
        } as Record<string, string>
      )[action] ?? action
    );
  if (language === "de")
    return (
      (
        {
          action: "Aktion",
          review: "Prüfung",
          optimize: "Optimierung",
          monitor: "Überwachung",
        } as Record<string, string>
      )[action] ?? action
    );
  if (language === "es")
    return (
      (
        {
          action: "Acción",
          review: "Revisión",
          optimize: "Optimización",
          monitor: "Seguimiento",
        } as Record<string, string>
      )[action] ?? action
    );
  if (language === "pt-BR")
    return (
      (
        {
          action: "Ação",
          review: "Revisão",
          optimize: "Otimização",
          monitor: "Monitoramento",
        } as Record<string, string>
      )[action] ?? action
    );
  return action;
}

function getModuleDisplayName(module: string, language: Language) {
  return module === "Products"
    ? language === "fr"
      ? "Produits"
      : language === "de"
        ? "Produkte"
        : language === "es"
          ? "Productos"
          : language === "pt-BR"
            ? "Produtos"
            : module
    : module;
}

function getSeverityTone(severity: ProfitAlertSeverity): VisualTone {
  return severity === "critical"
    ? "red"
    : severity === "warning"
      ? "amber"
      : severity === "opportunity"
        ? "green"
        : "cyan";
}

function getLifecycleTone(status: ProfitAlertStatus): VisualTone {
  return status === "acknowledged"
    ? "violet"
    : status === "resolved"
      ? "green"
      : status === "active"
        ? "cyan"
        : "orange";
}

function AlertCard({
  alert,
  alertStates,
  language,
  onOpen,
  onAcknowledge,
  trackedAction,
  onTrack,
}: {
  alert: ProfitAlert;
  alertStates: ProfitAlertStateMap;
  language: Language;
  onOpen: (alert: ProfitAlert) => void;
  onAcknowledge: (alertId: string) => void;
  trackedAction?: { id: string; status: string };
  onTrack: (
    alert: ProfitAlert,
    trackedAction?: { id: string; status: string },
  ) => void;
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
  const severityTone = getSeverityTone(alert.severity);
  const lifecycleTone = getLifecycleTone(lifecycleStatus);

  return (
    <PremiumPanel
      as="article"
      tone={severityTone}
      className={`alert-center-v2-alert${isUnread ? " is-unread" : ""}`}
    >
      {isUnread ? <span className="alert-center-v2-unread-node" /> : null}

      <div className="alert-center-v2-alert-layout">
        <div className="alert-center-v2-alert-icon" aria-hidden="true">
          {alert.severity === "critical"
            ? "!"
            : alert.severity === "warning"
              ? "↗"
              : alert.severity === "opportunity"
                ? "+"
                : "i"}
        </div>

        <div className="alert-center-v2-alert-copy">
          <div className="alert-center-v2-chips">
            <StatusChip tone={severityTone}>{severityStyle.label}</StatusChip>
            <StatusChip tone={lifecycleTone}>{lifecycleStyle.label}</StatusChip>
            <StatusChip tone="neutral">
              {getAlertCategoryLabel(alert.category, language)}
            </StatusChip>
          </div>

          <h2>{alert.title}</h2>
          <p>{alert.description}</p>

          <div className="alert-center-v2-context">
            <StatusChip tone="cyan">{alert.estimatedMinutes} min</StatusChip>
            <StatusChip tone="violet">
              {getModuleDisplayName(alert.recommendedModule, language)}
            </StatusChip>
            <StatusChip tone="neutral">
              {formatTimestamp(state?.firstSeenAt, language)}
            </StatusChip>
          </div>
        </div>

        <div className="alert-center-v2-alert-operation">
          <div className="alert-center-v2-impact">
            {alert.monthlyImpact > 0
              ? money(alert.monthlyImpact)
              : copy.qualitative_signal}
          </div>

          <div className="alert-center-v2-impact-label">
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
                title: copy.alert_economic_impact,
                description:
                  economicKind === "loss"
                    ? copy.economic_loss_description
                    : economicKind === "exposure"
                      ? copy.economic_exposure_description
                      : economicKind === "opportunity"
                        ? copy.economic_opportunity_description
                        : copy.economic_qualitative_description,
                note: copy.this_is_an_estimate_based_on,
              }}
            />
          </div>

          <div className="alert-center-v2-actions">
            <VisualButton size="small" onClick={() => onOpen(alert)}>
              {copy.open_module}
            </VisualButton>

            {!isAcknowledged && (
              <VisualButton
                variant="secondary"
                size="small"
                onClick={() => onAcknowledge(alert.id)}
              >
                {copy.acknowledge}
              </VisualButton>
            )}
            {alert.productId && lifecycleStatus !== "resolved" ? (
              <VisualButton
                variant="ghost"
                size="small"
                onClick={() => onTrack(alert, trackedAction)}
              >
                {trackedAction
                  ? messages.profitImpactPage.openTrackedAction
                  : messages.profitImpactPage.trackAction}
              </VisualButton>
            ) : null}
            {lifecycleStatus === "resolved" &&
            trackedAction?.status === "MEASURING" ? (
              <small>{messages.profitImpactPage.alertResolvedMeasuring}</small>
            ) : null}
          </div>
        </div>
      </div>

      <div className="alert-center-v2-alert-metrics">
        <div className="alert-center-v2-alert-metric">
          <div className="alert-center-v2-alert-metric-label">
            <span>{copy.priority}</span>

            <MetricTooltip
              content={{
                title: copy.alert_priority,
                description: copy.a_0_100_score_showing_how,
                note: copy.the_higher_the_score_the_higher,
              }}
            />
          </div>
          <strong>{alert.priority}/100</strong>
        </div>

        <div className="alert-center-v2-alert-metric">
          <div className="alert-center-v2-alert-metric-label">
            <span>{copy.business_action}</span>

            <MetricTooltip
              content={{
                title: copy.business_action_2,
                description: copy.shows_the_type_of_response_marginlab,
                note: copy.action_calls_for_direct_intervention_review,
              }}
            />
          </div>
          <strong>
            {getBusinessActionLabel(alert.businessAction, language)}
          </strong>
        </div>

        <div className="alert-center-v2-alert-metric">
          <div className="alert-center-v2-alert-metric-label">
            {copy.product}
          </div>
          <strong>{alert.productTitle ?? copy.store_wide}</strong>
        </div>
      </div>
    </PremiumPanel>
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
    trackedActions,
  } = useLoaderData<typeof loader>();

  const navigate = useNavigate();
  const alertStateFetcher = useFetcher<typeof action>();
  const migrationFetcher = useFetcher<typeof action>();

  const { language, locale, messages } = useI18n();
  const copy = messages.alertCenterPage;
  const trackedByAlert = React.useMemo(
    () =>
      new Map(
        trackedActions
          .filter((item) => item.sourceAlertKey)
          .map((item) => [item.sourceAlertKey!, item]),
      ),
    [trackedActions],
  );
  const handleTrack = (
    alert: ProfitAlert,
    tracked?: { id: string; status: string },
  ) => {
    if (tracked) {
      navigate(
        `/app/profit-impact?actionId=${encodeURIComponent(tracked.id)}&lang=${language}`,
      );
      return;
    }
    if (!alert.productId) return;
    const params = new URLSearchParams({
      sourceModule: "ALERT_CENTER",
      sourceAlertKey: alert.id,
      productId: alert.productId,
      period: String(period),
      lang: language,
      intentKey: window.crypto.randomUUID(),
    });
    navigate(`/app/profit-impact?${params.toString()}`);
  };

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

  const storeMoney = (value: number) => money(value, currencyCode, locale);

  const criticalCount = severityCounts.critical;
  const warningCount = severityCounts.warning;

  const businessStatus =
    criticalCount > 0
      ? {
          label: copy.action_required,
          description: copy.at_least_one_critical_profitability_risk,
        }
      : warningCount > 0
        ? {
            label: copy.review_recommended,
            description: copy.there_is_no_broad_emergency_but,
          }
        : severityCounts.opportunity > 0
          ? {
              label: copy.opportunities_available,
              description: copy.the_business_is_relatively_stable_and,
            }
          : {
              label: copy.stable_status,
              description:
                copy.no_significant_profitability_risk_requires_immediate,
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
      return Number.isNaN(date.getTime())
        ? ""
        : date.toLocaleString(exportLocale);
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
  }> = [
    {
      id: "all",
      label: copy.all,
      count: severityCounts.total,
    },
    {
      id: "critical",
      label: copy.critical,
      count: severityCounts.critical,
    },
    {
      id: "warning",
      label: copy.warnings,
      count: severityCounts.warning,
    },
    {
      id: "opportunity",
      label: copy.opportunities,
      count: severityCounts.opportunity,
    },
    {
      id: "info",
      label: copy.information,
      count: severityCounts.info,
    },
  ];

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardNav active="alert-center" navigate={navigate} />

        <PremiumHero
          className="dashboard-v2-hero alert-center-v2-hero"
          eyebrow={
            <span className="alert-center-v2-hero-eyebrow">
              <StatusChip tone={growthAccess ? "green" : "orange"}>
                {growthAccess ? copy.growth_plan_active : copy.growth_feature}
              </StatusChip>
              <span>ALERT CENTER</span>
            </span>
          }
          title={copy.the_signals_that_deserve_your_attention}
          description={copy.marginlab_monitors_margins_costs_refunds_and}
          actions={
            <div className="dashboard-v2-hero-actions">
              <StatusChip tone="green">
                {copy.tax_aware_economic_basis}
              </StatusChip>
              {growthAccess ? (
                <VisualButton
                  variant="secondary"
                  onClick={handleMarkAllRead}
                  disabled={lifecycleCounts.unread === 0}
                >
                  {copy.mark_all_as_read}
                </VisualButton>
              ) : (
                <VisualButton onClick={() => navigate("/app/billing")}>
                  {copy.unlock_growth}
                </VisualButton>
              )}
            </div>
          }
          visual={
            <div className="alert-center-v2-lifecycle">
              <FlowPath
                tone="cyan"
                trajectory="rising"
                motion="ambient"
                label={copy.the_signals_that_deserve_your_attention}
                nodes={[
                  {
                    id: "new",
                    progress: 0.04,
                    tone: "orange",
                    label: getAlertStatusStyle("new", language).label,
                  },
                  {
                    id: "active",
                    progress: 0.36,
                    tone: "cyan",
                    emphasis: "strong",
                    label: getAlertStatusStyle("active", language).label,
                  },
                  {
                    id: "acknowledged",
                    progress: 0.68,
                    tone: "violet",
                    label: getAlertStatusStyle("acknowledged", language).label,
                  },
                  {
                    id: "resolved",
                    progress: 0.96,
                    tone: "green",
                    emphasis: "strong",
                    label: getAlertStatusStyle("resolved", language).label,
                  },
                ]}
              />
              <div className="alert-center-v2-lifecycle-values">
                {(
                  [
                    ["new", lifecycleCounts.new],
                    ["active", lifecycleCounts.active],
                    ["acknowledged", lifecycleCounts.acknowledged],
                    ["resolved", lifecycleCounts.resolved],
                  ] as const
                ).map(([status, count]) => (
                  <span key={status} className={`is-${status}`}>
                    <small>{getAlertStatusStyle(status, language).label}</small>
                    <strong>{count}</strong>
                  </span>
                ))}
              </div>
            </div>
          }
          mobileVisualPosition="after-copy"
        />

        <div
          className={`alert-center-v2-content${growthAccess ? "" : " is-locked"}`}
        >
          {!growthAccess && (
            <div className="alert-center-v2-gate">
              <PremiumPanel tone="orange" className="alert-center-v2-gate-card">
                <div className="ml-v2-eyebrow">{copy.growth_feature_2}</div>
                <h2>{copy.alert_center_is_included_with_growth}</h2>
                <p>{copy.upgrade_to_growth_to_manage_alerts}</p>
                <VisualButton onClick={() => navigate("/app/billing")}>
                  {copy.unlock_growth}
                </VisualButton>
              </PremiumPanel>
            </div>
          )}

          <div
            aria-hidden={!growthAccess}
            className="alert-center-v2-workspace"
          >
            <PremiumPanel
              tone={
                criticalCount > 0 ? "red" : warningCount > 0 ? "amber" : "green"
              }
              className="alert-center-v2-status"
            >
              <div className="alert-center-v2-status-layout">
                <div className="alert-center-v2-status-copy">
                  <div className="ml-v2-eyebrow">{copy.monitoring_status}</div>
                  <h2>{businessStatus.label}</h2>
                  <p>{businessStatus.description}</p>
                  <div className="alert-center-v2-chips">
                    <StatusChip tone="orange">
                      {lifecycleCounts.unread} {copy.unread}
                    </StatusChip>
                    <StatusChip tone="cyan">
                      {lifecycleCounts.active} {copy.active}
                    </StatusChip>
                    <StatusChip tone="violet">
                      {lifecycleCounts.acknowledged} {copy.acknowledged}
                    </StatusChip>
                  </div>
                </div>

                <div className="alert-center-v2-economics">
                  <div className="alert-center-v2-economics-label">
                    <span>{copy.monthly_economic_impacts}</span>
                    <MetricTooltip
                      content={{
                        title: copy.monthly_economic_impacts_2,
                        description:
                          copy.shows_three_separate_values_estimated_loss,
                        note: copy.these_values_should_not_be_added,
                      }}
                    />
                  </div>
                  <div className="alert-center-v2-economics-values">
                    <span className="is-loss">
                      {storeMoney(economicTotals.monthlyLoss)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="is-exposure">
                      {storeMoney(economicTotals.monthlyExposure)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="is-opportunity">
                      {storeMoney(economicTotals.monthlyOpportunity)}
                    </span>
                  </div>
                  <p>{copy.loss_exposure_profit_gap_to_target}</p>
                  <div className="alert-center-v2-chips">
                    <span className="alert-center-v2-chip-with-info">
                      <StatusChip
                        tone={
                          dataConfidence.level === "high"
                            ? "green"
                            : dataConfidence.level === "medium"
                              ? "amber"
                              : "red"
                        }
                      >
                        {copy.confidence_badge} {dataConfidence.score}% ·{" "}
                        {confidenceLabel}
                      </StatusChip>
                      <MetricTooltip
                        content={{
                          title: copy.data_confidence,
                          description:
                            copy.shows_how_reliable_marginlab_considers_the,
                          note: copy.a_higher_value_means_the_analysis,
                        }}
                      />
                    </span>
                    <span className="alert-center-v2-chip-with-info">
                      <StatusChip tone="blue">
                        {copy.cogs_coverage_badge}{" "}
                        {Math.round(dataConfidence.cogsCoveragePct)}%
                      </StatusChip>
                      <MetricTooltip
                        content={{
                          title: copy.cogs_coverage,
                          description: copy.shows_how_much_of_the_analyzed,
                          note: copy.low_coverage_can_make_margins_losses,
                        }}
                      />
                    </span>
                    {!dataConfidence.comparisonAvailable ? (
                      <StatusChip tone="neutral">
                        {copy.comparison_unavailable}
                      </StatusChip>
                    ) : null}
                  </div>
                </div>
              </div>
            </PremiumPanel>

            <ResponsiveGrid columns={4} className="alert-center-v2-summary">
              <MetricCard
                density="compact"
                tone="red"
                label={copy.critical}
                value={`${severityCounts.critical}`}
                detail={copy.require_priority}
              />
              <MetricCard
                density="compact"
                tone="amber"
                label={copy.warnings}
                value={`${severityCounts.warning}`}
                detail={copy.need_review}
              />
              <MetricCard
                density="compact"
                tone="green"
                label={copy.opportunities}
                value={`${severityCounts.opportunity}`}
                detail={copy.potential_improvement}
              />
              <MetricCard
                density="compact"
                tone="cyan"
                label={copy.unread_2}
                value={`${lifecycleCounts.unread}`}
                detail={copy.new_signals}
              />
            </ResponsiveGrid>

            <PremiumPanel className="alert-center-v2-feed">
              <div className="alert-center-v2-feed-header">
                <div>
                  <div className="ml-v2-eyebrow">{copy.active_signals}</div>
                  <h2>{copy.profit_alert_feed}</h2>
                </div>

                <div className="alert-center-v2-feed-controls">
                  <label className="alert-center-v2-checkbox">
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
                  <VisualButton variant="secondary" onClick={handleExportCsv}>
                    {copy.export_csv}
                  </VisualButton>
                </div>
              </div>

              <SegmentedTabs
                className="alert-center-v2-tabs"
                ariaLabel={copy.active_signals}
                activeId={severityFilter}
                onChange={(id) => setSeverityFilter(id as SeverityFilter)}
                tabs={filters.map((filter) => ({
                  id: filter.id,
                  label: filter.label,
                  count: filter.count,
                }))}
              />

              <div className="alert-center-v2-list">
                {filteredAlerts.length > 0 ? (
                  filteredAlerts.map((alert) => (
                    <AlertCard
                      key={alert.id}
                      alert={alert}
                      alertStates={alertStates}
                      language={language}
                      onOpen={handleOpenAlert}
                      onAcknowledge={handleAcknowledge}
                      trackedAction={trackedByAlert.get(alert.id)}
                      onTrack={handleTrack}
                    />
                  ))
                ) : (
                  <PremiumEmptyState
                    tone="green"
                    title={copy.no_alerts_match_the_selected_filters}
                  />
                )}
              </div>
            </PremiumPanel>

            <PremiumPanel tone="orange" className="alert-center-v2-note">
              {copy.alerts_are_generated_using_the_tax}
            </PremiumPanel>
          </div>
        </div>
      </div>
    </div>
  );
}
