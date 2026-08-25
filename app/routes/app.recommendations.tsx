import * as React from "react";
import { useLoaderData, useNavigate } from "react-router";

import { authenticate } from "~/shopify.server";
import { loadMarginDashboardData } from "~/utils/margin.server";
import {
  getBillingStatus,
  hasGrowthAccess,
} from "~/utils/billing.server";
import DashboardNav from "~/components/dashboard/DashboardNav";
import MetricTooltip from "~/components/ui/MetricTooltip";

import dashboardStylesUrl from "~/styles/dashboard.css?url";

import {
  type LoaderData,
  uiMoney as formatStoreMoney,
  pct as formatStorePercent,
} from "~/utils/margin";
import { getLanguageLocale, getStoredLanguage, type Language } from "~/utils/i18n";
import { getRequestLanguage } from "~/utils/i18n.server";
import { useI18n } from "~/components/i18n/I18nProvider";
import { formatMoneyCompact } from "~/utils/formatting";
import { createGrowthPreviewData } from "~/utils/growth-preview.server";
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
}) => {
  const url = new URL(request.url);
  const period = url.searchParams.get("period") || "30";

  const language = getRequestLanguage(request);
  const locale = getLanguageLocale(language);

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

  const dashboardData = growthAccess
    ? await loadMarginDashboardData({
      admin,
      session,
      period,
      locale,
      billingStatus: billing,
    })
    : createGrowthPreviewData({ billing, period, shop: session.shop });

  return {
    ...dashboardData,
    billing,
    growthAccess,
  };
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

function compactMoney(value: number, currencyCode: string, locale: string) {
  return formatMoneyCompact(value, { currencyCode, locale });
}

function getStatusStyle(
  action: ProfitBusinessAction,
  language: Language,
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

function getEffortLabel(effort: ProfitAlertEffort, language: Language) {
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

function getDecisionScore(alert: ProfitAlert) {
  const impactScore =
    alert.monthlyImpact > 0
      ? Math.min(100, 35 + Math.log10(alert.monthlyImpact + 1) * 22)
      : 25;
  const effortScore =
    alert.effort === "easy" ? 100 : alert.effort === "medium" ? 72 : 48;
  const actionWeight =
    alert.businessAction === "action"
      ? 100
      : alert.businessAction === "review"
        ? 82
        : alert.businessAction === "optimize"
          ? 70
          : 45;

  return (
    alert.priority * 0.38 +
    impactScore * 0.24 +
    effortScore * 0.1 +
    actionWeight * 0.08
  );
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
  tooltip,
}: {
  label: string;
  value: string;
  note: string;
  highlight?: boolean;
  tooltip?: React.ReactNode;
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
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 9,
          fontWeight: 950,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: highlight ? "#4ade80" : "rgba(255,255,255,0.46)",
        }}
      >
        <span>{label}</span>
        {tooltip}
      </div>

      <div
        style={{
          marginTop: 11,
          fontSize: value.length >= 9 ? 22 : value.length >= 7 ? 25 : 29,
          fontWeight: 950,
          lineHeight: 1,
          letterSpacing: "-0.04em",
          color: highlight ? "#22c55e" : "#f8fafc",
          whiteSpace: "nowrap",
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
  money,
  confidenceScore,
}: {
  alert: ProfitAlert;
  language: Language;
  navigate: (path: string) => void;
  completed: boolean;
  onToggle: () => void;
  money: (value: number) => string;
  confidenceScore: number;
}) {
  const { messages } = useI18n();
  const copy = messages.recommendationsPage;
  const status = getUiStatusStyle(alert.businessAction, language);

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
            {copy.auto.r001}
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

        <TinyBadge color={status.color}>{status.label}</TinyBadge>
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
          label={copy.auto.r002}
          value={
            alert.monthlyImpact > 0
              ? `${alert.businessAction === "optimize" ? "+" : ""}${money(
                alert.monthlyImpact,
              )}`
              : copy.auto.r003
          }
          note={
            copy.auto.r004
          }
          highlight={alert.monthlyImpact > 0}
        />

        <ActionMetric
          label={copy.auto.r005}
          value={`${alert.priority}/100`}
          note={copy.auto.r006}
        />

        <ActionMetric
          label={copy.auto.r007}
          value={getUiEffortLabel(alert.effort, language)}
          note={`${alert.estimatedMinutes} min`}
        />

        <ActionMetric
          label={copy.auto.r008}
          value={`${confidenceScore}%`}
          note={
            copy.auto.r009
          }
          tooltip={
            <MetricTooltip
              content={{
                title:
                  copy.auto.r010,
                description:
                  copy.auto.r011,
              }}
            />
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
            ? copy.auto.r012
            : copy.auto.r013}
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
  const {
    summary,
    rows,
    period,
    currencyCode,
    shopHandle,
    economicSnapshot,
    growthAccess,
  } =
    useLoaderData() as LoaderData & {
      growthAccess: boolean;
    };
  const navigate = useNavigate();
  const { language, locale, messages, t } = useI18n();
  const copy = messages.recommendationsPage;

  const money = (value: number) =>
    formatStoreMoney(value, currencyCode, locale);

  const pct = (value: number) => formatStorePercent(value, locale);

  const profitAlerts = React.useMemo(
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

  const aggregateRecovery = profitAlerts.find(
    (alert) => alert.id === "recoverable-profit-opportunity",
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
        const scoreDifference = getDecisionScore(b) - getDecisionScore(a);
        return scoreDifference !== 0
          ? scoreDifference
          : b.monthlyImpact - a.monthlyImpact;
      })
      .slice(0, 8);
  }, [profitAlerts]);

  const topAlert = queueAlerts[0];

  // The headline comes from the shared economic model. Individual alerts
  // remain useful for prioritization, but their impacts can overlap and must
  // not be added together or promoted as the store-wide opportunity total.
  const headlineMonthlyOpportunity =
    economicSnapshot?.totals.monthlyOpportunity ??
    aggregateRecovery?.monthlyImpact ??
    Math.max(0, ...queueAlerts.map((alert) => alert.monthlyImpact));

  const annualOpportunity = headlineMonthlyOpportunity * 12;

  const snapshotConfidence = economicSnapshot?.confidence;
  const confidenceScore = snapshotConfidence?.score ?? 0;
  const confidenceLevelLabel =
    snapshotConfidence?.level === "high"
      ? copy.confidence.high
      : snapshotConfidence?.level === "medium"
        ? copy.confidence.medium
        : copy.confidence.low;

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
      ? queueAlerts.reduce((sum, alert) => sum + alert.priority, 0) /
      queueAlerts.length
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

  const businessStatusCopy =
    businessStatus.key === "action"
      ? copy.businessStatus.action
      : businessStatus.key === "review"
        ? copy.businessStatus.review
        : businessStatus.key === "optimize"
          ? copy.businessStatus.optimize
          : copy.businessStatus.stable;

  const businessStatusLabel = businessStatusCopy.label;
  const businessStatusDescription = businessStatusCopy.description;

  const storageKey = `marginlab:recommendations:${shopHandle || "store"}`;
  const [completedIds, setCompletedIds] = React.useState<string[]>([]);
  const [hasLoadedProgress, setHasLoadedProgress] = React.useState(false);

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      const parsed = saved ? JSON.parse(saved) : [];
      setCompletedIds(
        Array.isArray(parsed)
          ? parsed.filter((id): id is string => typeof id === "string")
          : [],
      );
    } catch {
      setCompletedIds([]);
    } finally {
      setHasLoadedProgress(true);
    }
  }, [storageKey]);

  React.useEffect(() => {
    if (!hasLoadedProgress) return;

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(completedIds));
    } catch {
      // The page remains fully usable when browser storage is unavailable.
    }
  }, [completedIds, hasLoadedProgress, storageKey]);

  React.useEffect(() => {
    if (!hasLoadedProgress) return;
    const validIds = new Set(queueAlerts.map((alert) => alert.id));
    setCompletedIds((current) => current.filter((id) => validIds.has(id)));
  }, [hasLoadedProgress, queueAlerts]);

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

  const progressPct =
    queueAlerts.length > 0
      ? (completedAlerts.length / queueAlerts.length) * 100
      : 100;

  const stageLabels: Record<ActionStage, string> = {
    now: language === "it" ? "Da affrontare ora" : language === "fr" ? "À traiter maintenant" : language === "de" ? "Jetzt bearbeiten" : language === "es" ? "Abordar ahora" : language === "pt-BR" ? "Tratar agora" : "Address now",
    next: language === "it" ? "Prossimo passo" : language === "fr" ? "Prochaine étape" : language === "de" ? "Nächster Schritt" : language === "es" ? "Siguiente paso" : language === "pt-BR" ? "Próxima etapa" : "Next step",
    planned: language === "it" ? "Da pianificare" : language === "fr" ? "À planifier" : language === "de" ? "Einzuplanen" : language === "es" ? "Planificar" : language === "pt-BR" ? "Planejar" : "Plan next",
    monitor: language === "it" ? "Monitoraggio" : language === "fr" ? "Suivi" : language === "de" ? "Überwachung" : language === "es" ? "Seguimiento" : language === "pt-BR" ? "Monitoramento" : "Monitoring",
  };

  const strategyText =
    language === "it"
      ? topAlert
        ? `La priorità principale è “${topAlert.title}”. MarginLab consiglia di completare prima le attività con priorità più alta, verificare l'effetto nel modulo indicato e soltanto dopo passare alle opportunità di ottimizzazione.`
        : "Non sono state rilevate azioni operative. Mantieni attivo il monitoraggio e verifica nuovamente quando cambiano ordini, costi o margini."
      : language === "fr"
        ? topAlert
          ? `La priorité principale est « ${topAlert.title} ». MarginLab recommande de terminer d'abord les tâches les plus prioritaires, de vérifier l'effet dans le module recommandé, puis seulement de passer aux opportunités d'optimisation.`
          : "Aucune action opérationnelle n'a été détectée. Maintenez le suivi actif et réexaminez la situation lorsque les commandes, les coûts ou les marges évoluent."
        : language === "de"
          ? topAlert
            ? `Die wichtigste Priorität ist „${topAlert.title}“. MarginLab empfiehlt, zuerst die Aufgaben mit der höchsten Priorität abzuschließen, die Wirkung im empfohlenen Modul zu prüfen und erst danach zu Optimierungsmöglichkeiten überzugehen.`
            : "Es wurden keine operativen Maßnahmen erkannt. Lassen Sie die Überwachung aktiv und prüfen Sie die Situation erneut, wenn sich Bestellungen, Kosten oder Margen ändern."
          : language === "es"
            ? topAlert
              ? `La prioridad principal es «${topAlert.title}». MarginLab recomienda completar primero las tareas de mayor prioridad, validar el efecto en el módulo recomendado y solo después pasar a las oportunidades de optimización.`
              : "No se han detectado acciones operativas. Mantén activo el seguimiento y vuelve a revisar la situación cuando cambien los pedidos, costes o márgenes."
          : language === "pt-BR"
            ? topAlert
              ? `A principal prioridade é “${topAlert.title}”. A MarginLab recomenda concluir primeiro as tarefas de maior prioridade, validar o efeito no módulo recomendado e só então avançar para as oportunidades de otimização.`
              : "Nenhuma ação operacional foi detectada. Mantenha o monitoramento ativo e revise novamente quando os pedidos, custos ou margens mudarem."
        : topAlert
        ? `The primary priority is “${topAlert.title}”. MarginLab recommends completing higher-priority work first, validating the effect in the recommended module, and only then moving to optimization opportunities.`
        : "No operational actions were detected. Keep monitoring active and review again when orders, costs or margins change.";

  const exportRecommendationsCsv = () => {
    const exportStageLabels: Record<ActionStage, string> = {
      now: language === "it" ? "Da affrontare ora" : "Address now",
      next: language === "it" ? "Prossimo passo" : "Next step",
      planned: language === "it" ? "Da pianificare" : "Plan next",
      monitor: language === "it" ? "Monitoraggio" : "Monitoring",
    };
    const exportLocale = language === "it" ? "it-IT" : "en-US";
    const round = (value: number) =>
      Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;

    const csvCell = (value: string | number) => {
      if (typeof value === "number") return String(round(value));

      const safeValue = /^[=+@\t\r]/.test(value) ? `'${value}` : value;
      return `"${safeValue.replace(/"/g, '""')}"`;
    };

    const csvRow = (values: Array<string | number>) =>
      values.map(csvCell).join(",");

    const labels =
      language === "it"
        ? {
          report: "Report",
          store: "Store",
          period: "Periodo (giorni)",
          currency: "Valuta",
          language: "Lingua",
          generated: "Generato il",
          summary: "RIEPILOGO DEL PIANO",
          metric: "Metrica",
          value: "Valore",
          monthlyOpportunity: "Gap mensile stimato verso il target",
          annualOpportunity: "Gap annuale stimato verso il target",
          actionCenterScore: "Action Center Score",
          confidence: "Data Confidence",
          totalActions: "Azioni totali",
          completedActions: "Azioni completate",
          remainingActions: "Azioni rimanenti",
          progress: "Avanzamento %",
          totalTime: "Tempo totale stimato (minuti)",
          priorities: "PRIORITÀ OPERATIVE",
          columns: [
            "Posizione",
            "ID",
            "Titolo",
            "Descrizione",
            "Categoria",
            "Stato operativo",
            "Fase",
            "Priorità",
            "Natura economica",
            "Importo economico",
            "Difficoltà",
            "Tempo stimato (minuti)",
            "Data Confidence %",
            "Stato completamento",
            "Modulo consigliato",
            "Azione consigliata",
            "Percorso",
          ],
          completed: "Completata",
          pending: "Da completare",
          economicKinds: {
            loss: "Perdita",
            opportunity: "Opportunità",
            exposure: "Esposizione",
            qualitative: "Qualitativo",
          },
        }
        : {
          report: "Report",
          store: "Store",
          period: "Period (days)",
          currency: "Currency",
          language: "Language",
          generated: "Generated at",
          summary: "ACTION PLAN SUMMARY",
          metric: "Metric",
          value: "Value",
          monthlyOpportunity: "Estimated monthly profit gap to target",
          annualOpportunity: "Estimated annual profit gap to target",
          actionCenterScore: "Action Center Score",
          confidence: "Data Confidence",
          totalActions: "Total actions",
          completedActions: "Completed actions",
          remainingActions: "Remaining actions",
          progress: "Progress %",
          totalTime: "Total estimated time (minutes)",
          priorities: "OPERATIONAL PRIORITIES",
          columns: [
            "Rank",
            "ID",
            "Title",
            "Description",
            "Category",
            "Business status",
            "Stage",
            "Priority",
            "Economic kind",
            "Economic amount",
            "Difficulty",
            "Estimated time (minutes)",
            "Data Confidence %",
            "Completion status",
            "Recommended module",
            "Recommended action",
            "Route",
          ],
          completed: "Completed",
          pending: "Pending",
          economicKinds: {
            loss: "Loss",
            opportunity: "Opportunity",
            exposure: "Exposure",
            qualitative: "Qualitative",
          },
        };

    const lines = [
      csvRow([labels.report, "MarginLab Recommendations"]),
      csvRow([labels.store, shopHandle || ""]),
      csvRow([labels.period, period]),
      csvRow([labels.currency, currencyCode]),
      csvRow([labels.language, language === "it" ? "Italiano" : "English"]),
      csvRow([labels.generated, new Date().toLocaleString(exportLocale)]),
      "",
      csvRow([labels.summary]),
      csvRow([labels.metric, labels.value]),
      csvRow([labels.monthlyOpportunity, headlineMonthlyOpportunity]),
      csvRow([labels.annualOpportunity, annualOpportunity]),
      csvRow([labels.actionCenterScore, actionCenterScore]),
      csvRow([labels.confidence, confidenceScore]),
      csvRow([labels.totalActions, queueAlerts.length]),
      csvRow([labels.completedActions, completedAlerts.length]),
      csvRow([
        labels.remainingActions,
        queueAlerts.length - completedAlerts.length,
      ]),
      csvRow([labels.progress, progressPct]),
      csvRow([labels.totalTime, totalMinutes]),
      "",
      csvRow([labels.priorities]),
      csvRow(labels.columns),
      ...queueAlerts.map((alert, index) => {
        const completed = completedIds.includes(alert.id);
        return csvRow([
          index + 1,
          alert.id,
          alert.title,
          alert.description,
          alert.category,
          getStatusStyle(alert.businessAction, language).label,
          exportStageLabels[getActionStage(alert)],
          alert.priority,
          labels.economicKinds[alert.economicKind],
          alert.monthlyImpact,
          getEffortLabel(alert.effort, language),
          alert.estimatedMinutes,
          confidenceScore,
          completed ? labels.completed : labels.pending,
          alert.recommendedModule,
          alert.actionLabel,
          alert.route,
        ]);
      }),
    ];

    const blob = new Blob(["\uFEFF", lines.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeShop = (shopHandle || "store").replace(/[^a-zA-Z0-9_-]/g, "-");
    link.href = url;
    link.download = `${safeShop}-recommendations-${period}d.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardNav active="recommendations" navigate={navigate} />

        <div className="hero-header">
          <div>
            <div className="alert-pill">
              <span className="alert-dot" />
              {growthAccess
                ? copy.auto.r014
                : copy.auto.r015}
            </div>

            <div className="eyebrow">
              {copy.auto.r016}
            </div>

            <div className="hero-title">
              {copy.auto.r017}
            </div>

            <div className="hero-description">
              {copy.auto.r018}
            </div>
          </div>

          {!growthAccess && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                className="primary-button"
                onClick={() => navigate("/app/billing")}
              >
                {copy.auto.r019}
              </button>
            </div>
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
                zIndex: 50,
                display: "grid",
                placeItems: "start center",
                paddingTop: 150,
                background:
                  "linear-gradient(180deg, rgba(5,9,16,0.28), rgba(5,9,16,0.74) 26%, rgba(5,9,16,0.9))",
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
                    "linear-gradient(180deg, rgba(17,24,39,0.98), rgba(7,12,21,0.99))",
                  border: "1px solid rgba(255,115,60,0.3)",
                  boxShadow: "0 24px 70px rgba(0,0,0,0.42)",
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
                  {copy.auto.r020}
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
                  {copy.auto.r021}
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
                  {copy.auto.r022}
                </div>

                <button
                  type="button"
                  className="primary-button"
                  onClick={() => navigate("/app/billing")}
                  style={{ marginTop: 18 }}
                >
                  {copy.auto.r023}
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
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 14,
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        color: "#4ade80",
                        fontSize: 10,
                        fontWeight: 950,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                      }}
                    >
                      <span>
                        {copy.auto.r024}
                      </span>

                      <MetricTooltip
                        content={{
                          title:
                            copy.auto.r025,
                          description:
                            copy.auto.r026,
                        }}
                      />
                    </div>

                    <button
                      className="secondary-button"
                      onClick={exportRecommendationsCsv}
                      style={{ padding: "10px 14px", fontSize: 12 }}
                    >
                      {copy.auto.r027}
                    </button>
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
                    {money(headlineMonthlyOpportunity)}
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
                    {t("recommendationsPage.operationalPriorities", {
                      count: actionableCount,
                      opportunity: money(annualOpportunity),
                    })}
                  </p>

                  {snapshotConfidence && (
                    <div
                      style={{
                        marginTop: 15,
                        display: "flex",
                        gap: 9,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <TinyBadge
                        color={
                          snapshotConfidence.level === "high"
                            ? "#22c55e"
                            : snapshotConfidence.level === "medium"
                              ? "#f59e0b"
                              : "#fb7185"
                        }
                      >
                        {copy.auto.r028}: {confidenceScore}% · {confidenceLevelLabel}
                      </TinyBadge>

                      <TinyBadge color="#60a5fa">
                        {copy.auto.r029}: {pct(snapshotConfidence.cogsCoveragePct)}
                      </TinyBadge>

                      <TinyBadge
                        color={
                          snapshotConfidence.comparisonAvailable
                            ? "#a78bfa"
                            : "#94a3b8"
                        }
                      >
                        {snapshotConfidence.comparisonAvailable
                          ? copy.auto.r030
                          : copy.auto.r031}
                      </TinyBadge>
                    </div>
                  )}

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
                        copy.auto.r032
                      }
                      value={`+${compactMoney(annualOpportunity, currencyCode, locale)}`}
                      note={
                        copy.auto.r033
                      }
                      highlight
                    />

                    <ActionMetric
                      label={
                        copy.auto.r034
                      }
                      value={`${actionableCount}`}
                      note={
                        copy.auto.r035
                      }
                    />

                    <ActionMetric
                      label={copy.auto.r036}
                      value={`${totalMinutes} min`}
                      note={
                        copy.auto.r037
                      }
                    />

                    <ActionMetric
                      label={copy.auto.r038}
                      value={`${quickWins.length}`}
                      note={
                        copy.auto.r039
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
                        background: `conic-gradient(${businessStatus.color} ${actionCenterScore * 3.6
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
                          border: "1px solid rgba(255,255,255,0.06)",
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
                              display: "flex",
                              justifyContent: "center",
                              alignItems: "center",
                              gap: 6,
                              color: businessStatus.color,
                              fontSize: 9,
                              fontWeight: 950,
                              textTransform: "uppercase",
                              letterSpacing: "0.1em",
                            }}
                          >
                            <span>
                              {copy.auto.r040}
                            </span>

                            <MetricTooltip
                              content={{
                                title:
                                  copy.auto.r041,
                                description:
                                  copy.auto.r042,
                              }}
                            />
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
                money={money}
                confidenceScore={confidenceScore}
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
              <section className="panel" style={{ margin: 0, padding: 24 }}>
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
                      {copy.auto.r043}
                    </div>

                    <h2 className="panel-title" style={{ marginTop: 6 }}>
                      {copy.auto.r044}
                    </h2>
                  </div>

                  <TinyBadge color="#22c55e">
                    {completedAlerts.length}/{queueAlerts.length}{" "}
                    {copy.auto.r045}
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
                      const status = getUiStatusStyle(alert.businessAction, language);

                      return (
                        <article
                          key={alert.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "46px minmax(0,1fr) auto",
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
                                {getUiCategoryLabel(alert.category, language)}
                              </TinyBadge>
                            </div>

                            <div
                              style={{
                                marginTop: 9,
                                color: "#f8fafc",
                                fontSize: 17,
                                fontWeight: 950,
                                lineHeight: 1.25,
                                textDecoration: completed ? "line-through" : "none",
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
                                {getUiEffortLabel(alert.effort, language)}
                              </TinyBadge>

                              <TinyBadge color="#22c55e">
                                {copy.auto.r046}{" "}
                                {confidenceScore}%
                              </TinyBadge>

                              <TinyBadge color="#c084fc">
                                {getUiModuleName(alert.recommendedModule, language)}
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
                                ? money(alert.monthlyImpact)
                                : copy.auto.r047}
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
                      {copy.auto.r048}
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
                    {copy.auto.r049}
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
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        color: "#f8fafc",
                        fontSize: 36,
                        fontWeight: 950,
                        lineHeight: 1,
                      }}
                    >
                      <span>{pct(progressPct)}</span>

                      <MetricTooltip
                        content={{
                          title:
                            copy.auto.r050,
                          description:
                            copy.auto.r051,
                        }}
                      />
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
                        background: "linear-gradient(90deg, #16a34a, #4ade80)",
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
                        copy.auto.r052
                      }
                      value={`${completedAlerts.length}`}
                      note={
                        copy.auto.r053
                      }
                    />

                    <ActionMetric
                      label={
                        copy.auto.r054
                      }
                      value={`${Math.max(
                        0,
                        queueAlerts.length - completedAlerts.length,
                      )}`}
                      note={
                        copy.auto.r055
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
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      color: "#7dd3fc",
                      fontSize: 10,
                      fontWeight: 950,
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                    }}
                  >
                    <span>
                      {copy.auto.r056}
                    </span>

                    <MetricTooltip
                      content={{
                        title:
                          copy.auto.r057,
                        description:
                          copy.auto.r058,
                      }}
                    />
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
                    {copy.auto.r059}
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
              <section className="panel" style={{ margin: 0, padding: 24 }}>
                <div className="panel-eyebrow">
                  {copy.auto.r060}
                </div>

                <h2 className="panel-title" style={{ marginTop: 6 }}>
                  {copy.auto.r061}
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
                          background: "rgba(255,255,255,0.035)",
                          border: "1px solid rgba(255,255,255,0.07)",
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
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.07)",
                        fontWeight: 760,
                      }}
                    >
                      {copy.auto.r062}
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
                  {copy.auto.r063}
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
                  {copy.auto.r064}
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
                    label={copy.auto.r065}
                    value={
                      (topAlert ? getUiModuleName(topAlert.recommendedModule, language) : undefined) ??
                      (copy.auto.r066)
                    }
                    note={
                      copy.auto.r067
                    }
                  />

                  <ActionMetric
                    label={
                      copy.auto.r068
                    }
                    value={`${Math.round(averagePriority)}/100`}
                    note={
                      copy.auto.r069
                    }
                  />

                  <ActionMetric
                    label={copy.auto.r070}
                    value={`${totalMinutes} min`}
                    note={
                      copy.auto.r071
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
                {copy.auto.r072}
              </div>

              <h2 className="panel-title" style={{ marginTop: 6 }}>
                {copy.auto.r073}
              </h2>

              <div
                style={{
                  marginTop: 21,
                  display: "grid",
                  gridTemplateColumns: "repeat(4,minmax(0,1fr))",
                  gap: 14,
                }}
              >
                {(["now", "next", "planned", "monitor"] as ActionStage[]).map(
                  (stage) => {
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
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.07)",
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
                                  background: "rgba(255,255,255,0.035)",
                                  border: "1px solid rgba(255,255,255,0.06)",
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
                                  <span>{alert.estimatedMinutes} min</span>

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
                                background: "rgba(255,255,255,0.02)",
                              }}
                            >
                              {copy.auto.r074}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  },
                )}
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
              {copy.auto.r075}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getUiStatusStyle(action: ProfitBusinessAction, language: Language) {
  const style = getStatusStyle(action, language);
  if (language === "fr") return { ...style, label: ({ action: "Action", review: "Examen", optimize: "Optimisation", monitor: "Suivi" } as Record<ProfitBusinessAction, string>)[action] };
  if (language === "de") return { ...style, label: ({ action: "Aktion", review: "Prüfung", optimize: "Optimierung", monitor: "Überwachung" } as Record<ProfitBusinessAction, string>)[action] };
  if (language === "es") return { ...style, label: ({ action: "Acción", review: "Revisión", optimize: "Optimización", monitor: "Seguimiento" } as Record<ProfitBusinessAction, string>)[action] };
  if (language === "pt-BR") return { ...style, label: ({ action: "Ação", review: "Revisão", optimize: "Otimização", monitor: "Monitoramento" } as Record<ProfitBusinessAction, string>)[action] };
  return style;
}

function getUiEffortLabel(effort: ProfitAlertEffort, language: Language) {
  if (language === "fr") return effort === "easy" ? "Facile" : effort === "medium" ? "Moyenne" : "Avancée";
  if (language === "de") return effort === "easy" ? "Einfach" : effort === "medium" ? "Mittel" : "Anspruchsvoll";
  if (language === "es") return effort === "easy" ? "Fácil" : effort === "medium" ? "Medio" : "Avanzado";
  if (language === "pt-BR") return effort === "easy" ? "Fácil" : effort === "medium" ? "Médio" : "Avançado";
  return getEffortLabel(effort, language);
}

function getUiCategoryLabel(category: string, language: Language) {
  if (language === "fr") return ({ pricing: "Tarification", "data-quality": "Qualité des données", margin: "Marge", discounts: "Remises", refunds: "Remboursements", growth: "Croissance" } as Record<string, string>)[category] ?? category;
  if (language === "de") return ({ pricing: "Preisgestaltung", "data-quality": "Datenqualität", margin: "Marge", discounts: "Rabatte", refunds: "Erstattungen", growth: "Wachstum" } as Record<string, string>)[category] ?? category;
  if (language === "es") return ({ pricing: "Precios", "data-quality": "Calidad de datos", margin: "Margen", discounts: "Descuentos", refunds: "Reembolsos", growth: "Crecimiento" } as Record<string, string>)[category] ?? category;
  if (language === "pt-BR") return ({ pricing: "Precificação", "data-quality": "Qualidade dos dados", margin: "Margem", discounts: "Descontos", refunds: "Reembolsos", growth: "Crescimento" } as Record<string, string>)[category] ?? category;
  return category;
}

function getUiModuleName(module: string, language: Language) {
  return module === "Products" ? (language === "fr" ? "Produits" : language === "de" ? "Produkte" : language === "es" ? "Productos" : language === "pt-BR" ? "Produtos" : module) : module;
}
