import * as React from "react";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "~/shopify.server";
import { useI18n } from "~/components/i18n/I18nProvider";
import dashboardStylesUrl from "~/styles/dashboard.css?url";

import ScoreCard, {
  MarginHealthSignal,
} from "~/components/dashboard/ScoreCard";
import TrendChart from "~/components/dashboard/TrendChart";
import KpiGrid from "~/components/dashboard/KpiGrid";
import TopLeaksPanel from "~/components/dashboard/TopLeaksPanel";
import DashboardHero from "~/components/dashboard/DashboardHero";
import AIProfitMonitor from "~/components/dashboard/AIProfitMonitor";
import MetricTooltip from "~/components/ui/MetricTooltip";
import {
  MetricCard,
  PremiumPanel,
  ResponsiveGrid,
  StatusChip,
  VisualButton,
} from "~/components/ui/VisualSystem";
import { loadMarginDashboardData } from "~/utils/margin.server";
import { generateProfitAlerts } from "~/utils/profit-monitor";
import { getLanguageLocale } from "~/utils/i18n";
import { getRequestLanguage } from "~/utils/i18n.server";
import { syncProfitMonitor } from "~/services/profit-monitor.server";
import { listProfitImpactActionsForShop } from "~/services/profit-impact.server";
import { aggregateProfitImpact } from "~/utils/profit-impact-summary";
import { getBillingStatus, hasGrowthAccess } from "~/utils/billing.server";
import { buildMarginAssessment } from "~/utils/margin-decision-engine";

import {
  uiMoney as formatStoreMoney,
  pct as formatStorePercent,
} from "~/utils/margin";

export const links = () => [
  {
    rel: "stylesheet",
    href: dashboardStylesUrl,
  },
];

export const loader = async ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  const period = url.searchParams.get("period") || "30";

  const language = getRequestLanguage(request);

  const locale = getLanguageLocale(language);

  const { admin, session } = await authenticate.admin(request);
  const billing = await getBillingStatus(admin);

  try {
    await admin.graphql(`query { shop { id } }`);
  } catch {
    throw new Response("Auth/scopes not ready. Reinstall the app.", {
      status: 401,
    });
  }

  const data = await loadMarginDashboardData({
    admin,
    session,
    period,
    locale,
  });
  const alerts = generateProfitAlerts({
    summary: data.summary,
    rows: data.rows,
    language,
    period,
    currencyCode: data.currencyCode,
  });
  const alertStates = await syncProfitMonitor({
    shop: session.shop,
    period,
    alerts,
    snapshot: {
      summary: data.summary,
      economicSnapshot: data.economicSnapshot,
      alertIds: alerts.map((alert) => alert.id),
    },
  });
  const impactActions = hasGrowthAccess(billing)
    ? await listProfitImpactActionsForShop({ shop: session.shop, take: 100 })
    : [];
  const impactSummary = hasGrowthAccess(billing)
    ? aggregateProfitImpact(impactActions)
    : null;
  const latestCompletedImpact =
    impactActions.find((action) => action.status === "COMPLETED") ?? null;
  return { ...data, alerts, alertStates, impactSummary, latestCompletedImpact };
};

export default function DashboardV2() {
  const {
    summary,
    rows,
    trend,
    period,
    currencyCode,
    analysisContext,
    taxContext,

    taxAwareEconomics,
    economicSnapshot,
    impactSummary,
    latestCompletedImpact,
  } = useLoaderData<typeof loader>();

  const navigate = useNavigate();
  const [analysisLoading, setAnalysisLoading] = React.useState(false);

  const { language, locale, messages, t } = useI18n();
  const copy = messages.dashboardPage;

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

  const economicRevenue = summary.economicRevenue ?? summary.revenue;

  const economicProfit = summary.economicProfit ?? summary.profit;

  const economicMarginPct = summary.economicMarginPct ?? summary.marginPct;

  const economicAdjustment = economicProfit - summary.profit;

  const taxSystemLabel =
    taxContext?.taxSystem === "GST_HST"
      ? "GST/HST"
      : taxContext?.taxSystem === "SALES_TAX"
        ? language === "it"
          ? "Sales Tax"
          : "Sales Tax"
        : (taxContext?.taxSystem ?? "Tax");

  const shouldShowAdvancedTaxSetup = Boolean(
    taxContext?.advancedProfileAvailable && !taxContext?.configured,
  );

  const shouldShowInputTaxRecovery = Boolean(
    taxContext?.supportsRecoverableInputTaxModel &&
    taxContext?.advancedProfileAvailable &&
    taxContext?.configured,
  );

  const marginAssessment = React.useMemo(
    () =>
      buildMarginAssessment({
        summary,
        rows,
        trend,
        analysisContext,
      }),
    [summary, rows, trend, analysisContext],
  );

  const money = React.useCallback(
    (value: number) => formatStoreMoney(value, currencyCode, locale),
    [currencyCode, locale],
  );

  const pct = React.useCallback(
    (value: number) => formatStorePercent(value, locale),
    [locale],
  );

  const alertCounts = React.useMemo(
    () => ({
      critical: alerts.filter((alert) => alert.severity === "critical").length,
      warning: alerts.filter((alert) => alert.severity === "warning").length,
      opportunity: alerts.filter((alert) => alert.severity === "opportunity")
        .length,
      info: alerts.filter((alert) => alert.severity === "info").length,
    }),
    [alerts],
  );

  const primaryAlert = alerts[0] ?? null;

  const analysisSteps = copy.analysisSteps;

  const [analysisText, setAnalysisText] = React.useState(analysisSteps[0]);

  const dashboardLoading = false;

  const productsAtRisk = rows.filter(
    (row) => row.losing || row.lowMargin || row.missingCost,
  ).length;

  const lowMarginCount = rows.filter(
    (row) => row.lowMargin && !row.losing,
  ).length;

  const sourceRows = rows;

  const visualRevenue = sourceRows.reduce((acc, row) => acc + row.revenue, 0);
  const visualCogs = sourceRows.reduce((acc, row) => acc + row.cogs, 0);
  const visualProfit = visualRevenue - visualCogs;

  const visualLeak = Math.abs(
    sourceRows.reduce((acc, row) => acc + (row.profit < 0 ? row.profit : 0), 0),
  );

  const visualMarginPct =
    visualRevenue > 0 ? (visualProfit / visualRevenue) * 100 : 0;

  const visualMissingCostCount = sourceRows.filter(
    (row) => row.missingCost,
  ).length;

  const visualProductsAtRisk = sourceRows.filter(
    (row) => row.losing || row.lowMargin || row.missingCost,
  ).length;

  const topLeaks = [
    sourceRows.filter((row) => row.losing).length > 0
      ? {
          icon: "⚠️",
          issue: copy.auto.d001,
          severity: copy.auto.d002,
          loss: money(visualLeak),
        }
      : null,

    visualMissingCostCount > 0
      ? {
          icon: "📦",
          issue: copy.auto.d003,
          severity: copy.auto.d004,
          loss: t("dashboardPage.productsCount", {
            count: visualMissingCostCount,
          }),
        }
      : null,

    lowMarginCount > 0
      ? {
          icon: "🏷️",
          issue: copy.auto.d005,
          severity: copy.auto.d006,
          loss: t("dashboardPage.productsCount", { count: lowMarginCount }),
        }
      : null,

    productsAtRisk > 0
      ? {
          icon: "🔥",
          issue: copy.auto.d007,
          severity: copy.auto.d008,
          loss: t("dashboardPage.atRiskCount", { count: productsAtRisk }),
        }
      : null,
  ].filter(Boolean) as {
    icon: string;
    issue: string;
    severity: string;
    loss: string;
  }[];

  const worstProduct =
    sourceRows.length > 0
      ? ([...sourceRows]
          .filter((row) => row.profit < 0)
          .sort((a, b) => a.profit - b.profit)[0] ?? null)
      : null;

  const profitGapToTarget = economicSnapshot?.totals.monthlyOpportunity ?? 0;

  function setPeriod(next: "7" | "30" | "90") {
    const params = new URLSearchParams(window.location.search);

    params.set("period", next);
    params.set("lang", language);

    navigate(`/app?${params.toString()}`);
  }

  const chartData = trend;

  const maxChartValue = Math.max(
    ...chartData.map((d) => Math.max(d.revenue, d.profit)),
    1,
  );

  const revenuePoints = chartData
    .map((point, index) => {
      const x =
        chartData.length === 1 ? 0 : (index / (chartData.length - 1)) * 1000;

      const y = 230 - (point.revenue / maxChartValue) * 170;

      return `${x},${y}`;
    })
    .join(" ");

  const profitPoints = chartData
    .map((point, index) => {
      const x =
        chartData.length === 1 ? 0 : (index / (chartData.length - 1)) * 1000;

      const y = 230 - (point.profit / maxChartValue) * 170;

      return `${x},${y}`;
    })
    .join(" ");

  const severityColor = (severity: string) => {
    if (severity === "High") return "#ff6b4a";
    if (severity === "Medium") return "#f59e0b";
    return "#9ca3af";
  };

  const severityBackground = (severity: string) => {
    if (severity === "High") return "rgba(255,90,54,0.14)";
    if (severity === "Medium") return "rgba(245,158,11,0.14)";
    return "rgba(156,163,175,0.12)";
  };

  const severityBorder = (severity: string) => {
    if (severity === "High") return "1px solid rgba(255,90,54,0.25)";
    if (severity === "Medium") return "1px solid rgba(245,158,11,0.22)";
    return "1px solid rgba(156,163,175,0.18)";
  };

  if (dashboardLoading) {
    return (
      <div className="dashboard-shell loading-shell">
        <div className="dashboard-container">
          <div className="loading-stack">
            <div className="loading-navbar" />
            <div className="loading-hero" />

            <div className="loading-kpi-grid">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="loading-kpi-card" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardHero
          period={period}
          setPeriod={setPeriod}
          navigate={navigate}
          analysisLoading={analysisLoading}
          analysisText={analysisText}
          analysisSteps={analysisSteps}
          setAnalysisLoading={setAnalysisLoading}
          setAnalysisText={setAnalysisText}
          visual={<MarginHealthSignal assessment={marginAssessment} />}
        />

        {shouldShowAdvancedTaxSetup ? (
          <div
            style={{
              marginBottom: 24,
              padding: 20,
              borderRadius: 20,
              background:
                "linear-gradient(135deg, rgba(255,115,60,0.12), rgba(8,13,22,0.96))",
              border: "1px solid rgba(255,115,60,0.24)",
              boxShadow: "0 18px 50px rgba(0,0,0,0.18)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
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
                  textTransform: "uppercase",
                  letterSpacing: "0.11em",
                }}
              >
                {copy.auto.d031}
              </div>

              <div
                style={{
                  marginTop: 7,
                  color: "#f8fafc",
                  fontSize: 18,
                  fontWeight: 950,
                }}
              >
                {copy.auto.d032}
              </div>

              <div
                style={{
                  marginTop: 6,
                  color: "rgba(226,232,240,0.62)",
                  fontSize: 12,
                  lineHeight: 1.55,
                  fontWeight: 720,
                  maxWidth: 760,
                }}
              >
                {t("dashboardPage.advancedTaxDescription", {
                  taxSystem: taxSystemLabel,
                })}
              </div>
            </div>

            <button
              type="button"
              className="primary-button"
              onClick={() => navigate("/app/tax-profile")}
              style={{
                whiteSpace: "nowrap",
              }}
            >
              {copy.auto.d033}
            </button>
          </div>
        ) : null}

        {/* {!billingActive ? (
          <div className="billing-banner">
            <div>
              <strong>Margin Intelligence preview mode</strong>

              <span>
                Activate your plan to unlock full margin analysis, product
                risk detection, pricing insights and recovery opportunities.
              </span>
            </div>

            <button onClick={() => navigate("/app/billing")}>
              Activate plan
            </button>
          </div>
        ) : null} */}

        <ScoreCard
          assessment={marginAssessment}
          visualLeak={visualLeak}
          visualProductsAtRisk={visualProductsAtRisk}
          visualMarginPct={visualMarginPct}
        />

        <AIProfitMonitor
          alerts={alerts}
          assessment={marginAssessment}
          navigate={navigate}
        />

        <KpiGrid
          items={[
            {
              label: copy.auto.d034,
              value: money(economicRevenue),
              note: t("dashboardPage.taxAwarePeriod", { period }),
              icon: "¤",
              tone: "positive",
              tooltip: {
                title: copy.auto.d035,
                description: copy.auto.d036,
                formula: copy.auto.d037,
                note: copy.auto.d038,
              },
            },
            {
              label: copy.auto.d039,
              value: money(economicProfit),
              note: t("dashboardPage.economicMarginNote", {
                value: pct(economicMarginPct),
              }),
              icon: "+",
              tone: economicProfit >= 0 ? "positive" : "danger",
              tooltip: {
                title: copy.auto.d040,

                description: copy.auto.d041,

                formula: copy.auto.d042,

                note: copy.auto.d043,
              },
            },
            {
              label: copy.auto.d044,
              value: pct(economicMarginPct),
              note: t("dashboardPage.productProfitComparison", {
                value: money(economicAdjustment),
              }),
              icon: "%",
              tone: economicMarginPct >= 20 ? "positive" : "warning",
              tooltip: {
                title: copy.auto.d045,

                description: copy.auto.d046,

                formula: copy.auto.d047,

                note: copy.auto.d048,
              },
            },
            {
              label: copy.auto.d049,
              value: String(sourceRows.length),
              note: t("dashboardPage.requireReview", {
                count: visualProductsAtRisk,
              }),
              icon: "◈",
              tone: visualProductsAtRisk > 0 ? "warning" : "positive",
            },
          ]}
        />

        <KpiGrid
          marginBottom={24}
          items={[
            {
              label: copy.auto.d050,
              value: worstProduct ? worstProduct.productTitle : copy.auto.d051,
              note: worstProduct
                ? t("dashboardPage.estimatedLoss", {
                    value: money(Math.abs(worstProduct.profit)),
                  })
                : copy.auto.d052,
              icon: worstProduct ? "↓" : "✓",
              tone: worstProduct ? "danger" : "positive",
            },
            {
              label: copy.auto.d053,
              value: String(sourceRows.filter((row) => row.lowMargin).length),
              note: copy.auto.d054,
              icon: "↓",
              tone: "warning",
            },
            {
              label: copy.auto.d055,
              value: String(visualMissingCostCount),
              note: copy.auto.d056,
              icon: "⚠",
              tone: visualMissingCostCount > 0 ? "danger" : "positive",
            },
            {
              label: copy.auto.d057,
              value: money(profitGapToTarget),
              note: copy.auto.d058,
              icon: "+",
              tone: "warning",
              tooltip: {
                title: copy.auto.d059,

                description: copy.auto.d060,

                note: copy.auto.d061,
              },
            },
          ]}
        />

        <TrendChart
          chartData={chartData}
          maxChartValue={maxChartValue}
          revenuePoints={revenuePoints}
          profitPoints={profitPoints}
          visualMarginPct={visualMarginPct}
        />

        {impactSummary ? (
          <PremiumPanel className="dashboard-v2-impact-summary" tone="orange">
            <div>
              <div className="ml-v2-eyebrow">Profit Impact Tracker</div>
              <h2>
                {impactSummary.actionsMeasuring}{" "}
                {messages.profitImpactPage.actionsMeasuring}
              </h2>
              <p>
                {messages.profitImpactPage.estimatedAttributableProfit}:{" "}
                {impactSummary.estimatedAttributableProfit == null
                  ? "—"
                  : formatStoreMoney(
                      impactSummary.estimatedAttributableProfit,
                      currencyCode,
                      locale,
                    )}
                {latestCompletedImpact
                  ? ` · ${latestCompletedImpact.title}`
                  : ""}
              </p>
            </div>
            <VisualButton
              onClick={() => navigate("/app/profit-impact")}
              trailing="→"
            >
              {messages.profitImpactPage.openTrackedAction}
            </VisualButton>
          </PremiumPanel>
        ) : null}

        {taxContext && taxAwareEconomics ? (
          <PremiumPanel
            className="dashboard-v2-tax"
            tone="green"
            style={{
              marginTop: 24,
              marginBottom: 24,
              padding: 22,
              borderRadius: 22,
              background:
                "radial-gradient(circle at top left, rgba(34,197,94,0.08), transparent 35%), linear-gradient(180deg, rgba(16,23,37,0.96), rgba(7,12,21,0.98))",
              border: "1px solid rgba(34,197,94,0.20)",
            }}
          >
            <div
              style={{
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
                    color: "#4ade80",
                    fontSize: 10,
                    fontWeight: 950,
                    textTransform: "uppercase",
                    letterSpacing: "0.11em",
                  }}
                >
                  {copy.auto.d062}
                </div>

                <div
                  style={{
                    marginTop: 7,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      color: "#f8fafc",
                      fontSize: 20,
                      fontWeight: 950,
                    }}
                  >
                    {copy.auto.d063}
                  </div>

                  <MetricTooltip
                    content={{
                      title: copy.auto.d064,

                      description: copy.auto.d065,

                      note: copy.auto.d066,
                    }}
                  />
                </div>

                <div
                  style={{
                    marginTop: 6,
                    color: "rgba(226,232,240,0.55)",
                    fontSize: 11,
                    lineHeight: 1.55,
                    fontWeight: 720,
                    maxWidth: 820,
                  }}
                >
                  {t("dashboardPage.taxBasisDescription", {
                    taxSystem: taxSystemLabel,
                  })}
                </div>
              </div>

              <StatusChip tone="green">
                {taxAwareEconomics.source === "shopify_actual_tax"
                  ? t("dashboardPage.shopifyTaxDetected", {
                      taxSystem: taxSystemLabel,
                    })
                  : taxAwareEconomics.source === "shopify_zero_tax"
                    ? t("dashboardPage.noTaxApplied", {
                        taxSystem: taxSystemLabel,
                      })
                    : taxAwareEconomics.source === "tax_profile_fallback"
                      ? t("dashboardPage.taxFromProfile", {
                          taxSystem: taxSystemLabel,
                        })
                      : copy.auto.d067}
              </StatusChip>
            </div>

            <ResponsiveGrid
              columns={3}
              className="dashboard-v2-tax-metrics"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3,minmax(0,1fr))",
                gap: 12,
                marginTop: 18,
              }}
            >
              <div
                style={{
                  padding: 17,
                  borderRadius: 17,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <div
                  style={{
                    color: "rgba(226,232,240,0.46)",
                    fontSize: 9,
                    fontWeight: 950,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {copy.auto.d068}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    color: "#f8fafc",
                    fontSize: 25,
                    fontWeight: 950,
                  }}
                >
                  {money(taxAwareEconomics.profitBeforeTaxAdjustment)}
                </div>
              </div>

              <div
                style={{
                  padding: 17,
                  borderRadius: 17,
                  background: "rgba(34,197,94,0.055)",
                  border: "1px solid rgba(34,197,94,0.16)",
                }}
              >
                <div
                  style={{
                    color: "rgba(226,232,240,0.46)",
                    fontSize: 9,
                    fontWeight: 950,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {copy.auto.d069}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    color:
                      taxAwareEconomics.realProfit >= 0 ? "#4ade80" : "#ff9a70",
                    fontSize: 25,
                    fontWeight: 950,
                  }}
                >
                  {money(taxAwareEconomics.realProfit)}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    color: "rgba(226,232,240,0.48)",
                    fontSize: 10,
                    fontWeight: 750,
                  }}
                >
                  {pct(taxAwareEconomics.realMarginPct)} {copy.auto.d070}
                </div>
              </div>

              <div
                style={{
                  padding: 17,
                  borderRadius: 17,
                  background:
                    taxAwareEconomics.vatImpactOnProfit < 0
                      ? "rgba(255,115,60,0.045)"
                      : "rgba(34,197,94,0.045)",
                  border:
                    taxAwareEconomics.vatImpactOnProfit < 0
                      ? "1px solid rgba(255,115,60,0.16)"
                      : "1px solid rgba(34,197,94,0.16)",
                }}
              >
                <div
                  style={{
                    color: "rgba(226,232,240,0.46)",
                    fontSize: 9,
                    fontWeight: 950,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {copy.auto.d071}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    color:
                      taxAwareEconomics.vatImpactOnProfit < 0
                        ? "#ff9a70"
                        : "#4ade80",
                    fontSize: 25,
                    fontWeight: 950,
                  }}
                >
                  {money(taxAwareEconomics.vatImpactOnProfit)}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    color: "rgba(226,232,240,0.48)",
                    fontSize: 10,
                    fontWeight: 750,
                  }}
                >
                  {copy.auto.d072}
                </div>
              </div>
            </ResponsiveGrid>

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginTop: 14,
              }}
            >
              {shouldShowInputTaxRecovery ? (
                <div
                  style={{
                    padding: "7px 10px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    color: "rgba(226,232,240,0.60)",
                    fontSize: 9,
                    fontWeight: 850,
                  }}
                >
                  {copy.auto.d073}
                  {" · "}
                  {taxContext.inputVatRecoveryPct}%
                </div>
              ) : (
                <div
                  style={{
                    padding: "7px 10px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    color: "rgba(226,232,240,0.60)",
                    fontSize: 9,
                    fontWeight: 850,
                  }}
                >
                  {copy.auto.d074}
                  {" · "}
                  {taxSystemLabel}
                </div>
              )}

              <div
                style={{
                  padding: "7px 10px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  color: "rgba(226,232,240,0.60)",
                  fontSize: 9,
                  fontWeight: 850,
                }}
              >
                {copy.auto.d075}
                {" · "}
                {taxAwareEconomics.confidence === "high"
                  ? copy.auto.d076
                  : taxAwareEconomics.confidence}
              </div>

              <div
                style={{
                  padding: "7px 10px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  color: "rgba(226,232,240,0.60)",
                  fontSize: 9,
                  fontWeight: 850,
                }}
              >
                {copy.auto.d077}
                {" · "}
                {money(taxAwareEconomics.economicCogs)}
              </div>
            </div>
          </PremiumPanel>
        ) : null}

        <PremiumPanel
          className="dashboard-v2-executive"
          tone="violet"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1.25fr) minmax(280px,0.75fr)",
            gap: 22,
            alignItems: "stretch",
          }}
        >
          <div>
            <div className="section-eyebrow">{copy.auto.d078}</div>

            <div
              className="section-title"
              style={{ marginTop: 8, fontSize: 28 }}
            >
              {copy.auto.d079}
            </div>

            <div
              style={{
                marginTop: 11,
                maxWidth: 760,
                color: "rgba(226,232,240,0.72)",
                fontSize: 14,
                lineHeight: 1.7,
                fontWeight: 720,
              }}
            >
              {t("dashboardPage.executiveSummary", {
                critical: alertCounts.critical,
                warning: alertCounts.warning,
                opportunity: alertCounts.opportunity,
                gap: money(profitGapToTarget),
              })}
            </div>

            <ResponsiveGrid
              columns={4}
              className="dashboard-v2-executive-metrics"
            >
              {[
                {
                  label: copy.auto.d080,
                  value: alertCounts.critical,
                  color: "#ff6b4a",
                },
                {
                  label: copy.auto.d081,
                  value: alertCounts.warning,
                  color: "#f59e0b",
                },
                {
                  label: copy.auto.d082,
                  value: alertCounts.opportunity,
                  color: "#22c55e",
                },
                {
                  label: copy.auto.d083,
                  value: visualProductsAtRisk,
                  color: "#38bdf8",
                },
              ].map((item) => (
                <MetricCard
                  key={item.label}
                  density="dense"
                  tone={
                    item.color === "#ff6b4a"
                      ? "red"
                      : item.color === "#f59e0b"
                        ? "amber"
                        : item.color === "#22c55e"
                          ? "green"
                          : "cyan"
                  }
                  label={item.label}
                  value={item.value}
                />
              ))}
            </ResponsiveGrid>
          </div>

          <div
            style={{
              padding: 20,
              borderRadius: 20,
              background:
                "radial-gradient(circle at top right, rgba(255,115,60,0.10), transparent 42%), rgba(5,10,18,0.55)",
              border: "1px solid rgba(255,115,60,0.20)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div
                style={{
                  color: "#ff9a70",
                  fontSize: 10,
                  fontWeight: 950,
                  textTransform: "uppercase",
                  letterSpacing: "0.11em",
                }}
              >
                {copy.auto.d084}
              </div>

              <div
                style={{
                  marginTop: 10,
                  color: "#f8fafc",
                  fontSize: 19,
                  lineHeight: 1.35,
                  fontWeight: 950,
                }}
              >
                {primaryAlert?.title ?? copy.auto.d085}
              </div>

              <div
                style={{
                  marginTop: 8,
                  color: "rgba(226,232,240,0.56)",
                  fontSize: 12,
                  lineHeight: 1.55,
                  fontWeight: 720,
                }}
              >
                {primaryAlert?.description ?? copy.auto.d086}
              </div>
            </div>

            <VisualButton
              type="button"
              style={{ width: "100%", justifyContent: "center", marginTop: 18 }}
              onClick={() => navigate(primaryAlert?.route ?? "/app/ai-advisor")}
            >
              {primaryAlert?.actionLabel ?? copy.auto.d087}
              {" →"}
            </VisualButton>
          </div>
        </PremiumPanel>

        <TopLeaksPanel
          topLeaks={topLeaks}
          severityColor={severityColor}
          severityBackground={severityBackground}
          severityBorder={severityBorder}
        />
      </div>
    </div>
  );
}
