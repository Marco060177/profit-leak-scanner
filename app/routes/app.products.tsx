import * as React from "react";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "~/shopify.server";
import { useI18n } from "~/components/i18n/I18nProvider";
import dashboardStylesUrl from "~/styles/dashboard.css?url";
import productsStylesUrl from "~/styles/products-v2.css?url";
import ProductRiskTable from "~/components/dashboard/ProductRiskTable";

import { loadMarginDashboardData } from "~/utils/margin.server";
import DashboardNav from "~/components/dashboard/DashboardNav";
import MetricTooltip from "~/components/ui/MetricTooltip";
import {
  MetricCard,
  PremiumEmptyState,
  PremiumHero,
  PremiumPanel,
  SignalRing,
  StatusChip,
  TaxAwareBadge,
  type VisualTone,
} from "~/components/ui/VisualSystem";
import { getLanguageLocale } from "~/utils/i18n";
import { getRequestLanguage } from "~/utils/i18n.server";

import {
  type LoaderData,
  type Row,
  uiMoney as formatStoreMoney,
  pct as formatStorePercent,
} from "~/utils/margin";

export const links = () => [
  {
    rel: "stylesheet",
    href: dashboardStylesUrl,
  },
  {
    rel: "stylesheet",
    href: productsStylesUrl,
  },
];

export const loader = async ({
  request,
}: {
  request: Request;
}): Promise<LoaderData> => {
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

  return loadMarginDashboardData({
    admin,
    session,
    period,
    locale,
  });
};

export default function ProductsPage() {
  const { rows, period, shopHandle, currencyCode } =
    useLoaderData() as LoaderData;

  const navigate = useNavigate();
  const { language, locale, messages, t } = useI18n();
  const copy = messages.productsPage;

  const money = React.useCallback(
    (value: number) => formatStoreMoney(value, currencyCode, locale),
    [currencyCode, locale],
  );

  const pct = React.useCallback(
    (value: number) => formatStorePercent(value, locale),
    [locale],
  );

  const targetMarginPct = 20;

  const economicRows = React.useMemo<Row[]>(
    () =>
      rows.map((row) => {
        const economicRevenue = row.economicRevenue ?? row.revenue;

        const economicCogs = row.economicCogs ?? row.cogs;

        const economicProfit = row.economicProfit ?? row.profit;

        const economicMarginPct = row.economicMarginPct ?? row.marginPct;

        const qty = Math.max(0, row.qty);

        const avgPrice = qty > 0 ? economicRevenue / qty : row.avgPrice;

        const avgCost = qty > 0 ? economicCogs / qty : row.avgCost;

        const breakEvenPrice = avgCost;

        const targetPrice =
          avgCost > 0 ? avgCost / (1 - targetMarginPct / 100) : avgPrice;

        const targetDelta = targetPrice - avgPrice;

        return {
          ...row,

          // Products Intelligence now consumes the product-level
          // economic basis produced by margin.server.ts.
          revenue: economicRevenue,
          cogs: economicCogs,
          profit: economicProfit,
          marginPct: economicMarginPct,

          losing: economicProfit < 0,
          lowMargin: economicMarginPct > 0 && economicMarginPct < 10,

          avgPrice,
          avgCost,
          breakEvenPrice,
          targetPrice,
          targetDelta,
        };
      }),
    [rows],
  );

  const economicLeak = economicRows.reduce(
    (sum, row) => sum + (row.profit < 0 ? Math.abs(row.profit) : 0),
    0,
  );
  const [onlyLosing, setOnlyLosing] = React.useState(false);
  const [visibleLimit, setVisibleLimit] = React.useState<10 | 20 | 50>(20);

  const productRiskScore = (row: Row) => {
    let score = 0;

    if (row.losing) score += 40;
    if (row.missingCost) score += 25;
    if (row.lowMargin) score += 20;

    score += Math.min(15, row.revenue / 1000);

    if (row.marginPct < 5) score += 10;
    if (row.targetDelta > 0) score += Math.min(10, row.targetDelta / 10);

    return Math.min(100, Math.round(score));
  };

  const visibleRows = onlyLosing
    ? economicRows.filter((row) => row.losing)
    : economicRows;

  const allSortedRiskRows = [...visibleRows].sort((a, b) => {
    const scoreA = productRiskScore(a);
    const scoreB = productRiskScore(b);

    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }

    return b.revenue - a.revenue;
  });

  const sortedRiskRows = allSortedRiskRows.slice(0, visibleLimit);

  const riskLabel = (row: Row) => {
    if (language === "it") {
      if (row.losing) return "Critico";
      if (row.missingCost) return "Costo mancante";
      if (row.lowMargin) return "Alto";
      return "Ottimo";
    }

    if (row.losing) return "Critical";
    if (row.missingCost) return "Missing cost";
    if (row.lowMargin) return "High";
    return "Healthy";
  };

  const criticalProducts = economicRows.filter((row) => row.losing).length;

  const highProducts = economicRows.filter(
    (row) => !row.losing && (row.missingCost || row.lowMargin),
  ).length;

  const healthyProducts = economicRows.filter(
    (row) => !row.losing && !row.missingCost && !row.lowMargin,
  ).length;

  const totalProducts = Math.max(economicRows.length, 1);

  const criticalPct = (criticalProducts / totalProducts) * 100;
  const highPct = (highProducts / totalProducts) * 100;
  const healthyPct = (healthyProducts / totalProducts) * 100;

  const revenueAtRisk = economicRows
    .filter((row) => row.revenue > 0)
    .filter((row) => row.marginPct < targetMarginPct)
    .map((row) => ({
      ...row,
      marginGap: targetMarginPct - row.marginPct,
      riskValue: row.revenue * ((targetMarginPct - row.marginPct) / 100),
      riskLevel:
        row.marginPct < 0 ? "Critical" : row.marginPct < 10 ? "High" : "Medium",
    }))
    .sort((a, b) => b.riskValue - a.riskValue);

  const totalRevenueAtRisk = revenueAtRisk.reduce(
    (sum, product) => sum + product.revenue,
    0,
  );

  const biggestRiskProduct = revenueAtRisk[0] ?? null;

  const totalRevenueAtRiskOpportunity = revenueAtRisk.reduce(
    (sum, product) => sum + product.riskValue,
    0,
  );

  const productScore = Math.max(
    0,
    Math.min(100, Math.round(100 - criticalProducts * 14 - highProducts * 7)),
  );
  const productTone: VisualTone =
    productScore < 40 ? "red" : productScore < 70 ? "amber" : "green";
  const productScoreLabel =
    productScore < 40
      ? copy.score.highRisk
      : productScore < 70
        ? copy.score.moderateRisk
        : copy.score.healthyLabel;

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardNav active="products" navigate={navigate} />

        <PremiumHero
          className="dashboard-v2-hero signal-hero signal-hero--warm products-v2-hero"
          eyebrow={copy.eyebrow}
          title={copy.title}
          description={copy.description}
          actions={
            <div className="dashboard-v2-hero-actions">
              <TaxAwareBadge>{copy.taxAwareBasis}</TaxAwareBadge>
            </div>
          }
          visual={
            <div className="dashboard-v2-health-signal">
              <div
                className="dashboard-v2-instrument-halo"
                aria-hidden="true"
              />
              <div className="dashboard-v2-instrument-arc" aria-hidden="true" />
              <div className="dashboard-v2-signal-core">
                <SignalRing
                  value={productScore}
                  variant="hero"
                  tone={productTone}
                  size="large"
                  motion="ambient"
                  score={productScore}
                  suffix="/100"
                  label={copy.score.eyebrow}
                  status={productScoreLabel}
                  info={
                    <MetricTooltip
                      content={{
                        title: copy.score.tooltipTitle,
                        description: copy.score.tooltipDescription,
                        note: copy.score.tooltipNote,
                      }}
                    />
                  }
                  nodes={[
                    ...(criticalProducts > 0
                      ? [{ id: "critical", angle: 35, tone: "red" as const }]
                      : []),
                    ...(highProducts > 0
                      ? [{ id: "risk", angle: 150, tone: "amber" as const }]
                      : []),
                    ...(healthyProducts > 0
                      ? [{ id: "healthy", angle: 265, tone: "green" as const }]
                      : []),
                  ]}
                  ariaLabel={`${copy.score.eyebrow}: ${productScore}/100, ${productScoreLabel}`}
                />
              </div>
              <div
                className="dashboard-v2-instrument-base"
                aria-hidden="true"
              />
            </div>
          }
          mobileVisualPosition="after-copy"
        />

        <PremiumPanel className="products-v2-score" tone={productTone}>
          <div className="products-v2-section-heading">
            <div>
              <div className="panel-eyebrow products-v2-tooltip-label">
                <span>{copy.score.eyebrow}</span>
                <MetricTooltip
                  content={{
                    title: copy.score.tooltipTitle,
                    description: copy.score.tooltipDescription,
                    note: copy.score.tooltipNote,
                  }}
                />
              </div>
              <h2 className="panel-title">
                {criticalProducts > 0
                  ? copy.score.critical
                  : highProducts > 0
                    ? copy.score.moderate
                    : copy.score.healthy}
              </h2>
              <p className="panel-subtitle">{copy.score.description}</p>
            </div>
            <StatusChip tone={productTone}>{productScoreLabel}</StatusChip>
          </div>
          <div className="products-v2-metrics">
            <MetricCard
              tone="red"
              label={copy.summary.productsAtRisk}
              value={criticalProducts + highProducts}
            />
            <MetricCard
              tone="red"
              label={copy.summary.criticalProducts}
              value={criticalProducts}
            />
            <MetricCard
              tone="orange"
              label={copy.summary.economicLosses}
              value={money(economicLeak)}
            />
            <MetricCard
              tone="green"
              label={copy.summary.healthyProducts}
              value={healthyProducts}
            />
          </div>
        </PremiumPanel>

        {biggestRiskProduct && (
          <PremiumPanel
            className="products-v2-risk-panel"
            tone="red"
            style={{
              marginBottom: 24,
              border: "1px solid rgba(255,115,60,0.26)",
              background:
                "radial-gradient(circle at top left, rgba(255,115,60,0.08), transparent 34%), linear-gradient(180deg, rgba(17,24,39,0.96), rgba(8,13,22,0.98))",
            }}
          >
            <div className="panel-eyebrow">{copy.biggestRisk.eyebrow}</div>

            <h2
              className="panel-title"
              style={{
                marginTop: 8,
              }}
            >
              {biggestRiskProduct.productTitle}
            </h2>

            <div
              style={{
                marginTop: 10,
                color: "rgba(255,255,255,0.62)",
                lineHeight: 1.6,
                fontWeight: 700,
              }}
            >
              {copy.biggestRisk.description}
            </div>

            <div
              style={{
                marginTop: 24,
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 18,
              }}
            >
              {[
                [
                  copy.labels.revenue,
                  money(biggestRiskProduct.revenue),
                  "#f3f4f6",
                ],
                [
                  copy.labels.margin,
                  pct(biggestRiskProduct.marginPct),
                  "#ff6b4a",
                ],
                [
                  copy.labels.profitGapTitle,
                  money(biggestRiskProduct.riskValue),
                  "#22c55e",
                ],
                [
                  copy.labels.marginGap,
                  `${new Intl.NumberFormat(locale, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  }).format(biggestRiskProduct.marginGap)} pp`,
                  "#f59e0b",
                ],
              ].map(([label, value, color]) => (
                <div
                  key={label}
                  style={{
                    padding: 18,
                    borderRadius: 18,
                    background:
                      "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
                    border: "1px solid rgba(255,115,60,0.12)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 900,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.42)",
                    }}
                  >
                    {label}
                  </div>

                  <div
                    style={{
                      marginTop: 10,
                      fontSize: 30,
                      fontWeight: 950,
                      color: color as string,
                      lineHeight: 1,
                    }}
                  >
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </PremiumPanel>
        )}

        <PremiumPanel className="products-v2-panel" tone="orange">
          <div className="panel-header">
            <div>
              <div className="panel-eyebrow">{copy.distribution.eyebrow}</div>

              <h2 className="panel-title">{copy.distribution.title}</h2>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 18,
              marginTop: 24,
            }}
          >
            {[
              {
                label: copy.distribution.critical.label,
                count: criticalProducts,
                pct: criticalPct,
                color: "#ff6b4a",
                description: copy.distribution.critical.description,
              },
              {
                label: copy.distribution.high.label,
                count: highProducts,
                pct: highPct,
                color: "#f59e0b",
                description: copy.distribution.high.description,
              },
              {
                label: copy.distribution.healthy.label,
                count: healthyProducts,
                pct: healthyPct,
                color: "#22c55e",
                description: copy.distribution.healthy.description,
              },
            ].map((item) => (
              <MetricCard
                key={item.label}
                tone={
                  item.color === "#22c55e"
                    ? "green"
                    : item.color === "#f59e0b"
                      ? "amber"
                      : "red"
                }
                label={item.label}
                value={item.count}
                detail={
                  <>
                    <strong>
                      {t("productsPage.distribution.catalogShare", {
                        value: pct(item.pct),
                      })}
                    </strong>
                    <span>{item.description}</span>
                  </>
                }
                visual={
                  <div className="products-v2-metric-rail">
                    <i
                      style={{
                        width: `${Math.min(100, Math.max(0, item.pct))}%`,
                      }}
                    />
                  </div>
                }
              />
            ))}
          </div>
        </PremiumPanel>

        <PremiumPanel className="products-v2-panel" tone="amber">
          <div className="panel-header">
            <div>
              <div
                className="panel-eyebrow"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                }}
              >
                <span>{copy.revenueAtRisk.eyebrow}</span>

                <MetricTooltip
                  content={{
                    title: copy.revenueAtRisk.tooltipTitle,

                    description: copy.revenueAtRisk.tooltipDescription,

                    note: copy.revenueAtRisk.tooltipNote,
                  }}
                />
              </div>

              <h2 className="panel-title">{copy.revenueAtRisk.title}</h2>

              <p className="panel-subtitle">
                {t("productsPage.revenueAtRisk.description", {
                  revenue: money(totalRevenueAtRisk),
                  target: pct(targetMarginPct),
                  gap: money(totalRevenueAtRiskOpportunity),
                })}
              </p>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 16,
              marginTop: 24,
            }}
          >
            {revenueAtRisk.length > 0 ? (
              revenueAtRisk.slice(0, 5).map((product) => {
                const translatedRiskLevel =
                  product.riskLevel === "Critical"
                    ? copy.riskLevels.critical
                    : product.riskLevel === "High"
                      ? copy.riskLevels.high
                      : product.riskLevel === "Medium"
                        ? copy.riskLevels.medium
                        : product.riskLevel;

                return (
                  <div
                    key={product.productId}
                    style={{
                      borderRadius: 20,
                      padding: 22,
                      background:
                        "radial-gradient(circle at top left, rgba(255,115,60,0.05), transparent 35%), linear-gradient(135deg, rgba(17,24,39,0.98), rgba(6,12,24,0.98))",
                      border: "1px solid rgba(255,115,60,0.18)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 900,
                        color: "#f3f4f6",
                        lineHeight: 1.35,
                        minHeight: 34,
                      }}
                    >
                      {product.productTitle}
                    </div>

                    <StatusChip
                      className="products-v2-card-status"
                      tone={
                        product.riskLevel === "Critical"
                          ? "red"
                          : product.riskLevel === "High"
                            ? "orange"
                            : "amber"
                      }
                    >
                      {translatedRiskLevel}
                    </StatusChip>

                    <div
                      style={{
                        marginTop: 16,
                        fontSize: 11,
                        fontWeight: 900,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "rgba(255,255,255,0.42)",
                      }}
                    >
                      {copy.labels.revenue}
                    </div>

                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 24,
                        fontWeight: 950,
                        color: "#f3f4f6",
                      }}
                    >
                      {money(product.revenue)}
                    </div>

                    <div
                      style={{
                        marginTop: 14,
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        color: "rgba(255,255,255,0.62)",
                        fontSize: 13,
                        fontWeight: 800,
                      }}
                    >
                      <span>{copy.labels.margin}</span>
                      <span style={{ color: "#ff6b4a" }}>
                        {pct(product.marginPct)}
                      </span>
                    </div>

                    <div
                      style={{
                        marginTop: 8,
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        color: "rgba(255,255,255,0.62)",
                        fontSize: 13,
                        fontWeight: 800,
                      }}
                    >
                      <span>{copy.labels.profitGap}</span>
                      <span>{money(product.riskValue)}</span>
                    </div>

                    <div
                      style={{
                        marginTop: 14,
                        paddingTop: 14,
                        borderTop: "1px solid rgba(255,255,255,0.07)",
                        color: "rgba(255,255,255,0.52)",
                        fontSize: 12,
                        lineHeight: 1.55,
                      }}
                    >
                      {copy.revenueAtRisk.cardDescription}
                    </div>
                  </div>
                );
              })
            ) : (
              <PremiumEmptyState
                className="products-v2-risk-empty"
                tone="green"
                eyebrow={copy.revenueAtRisk.eyebrow}
                title={copy.revenueAtRisk.empty}
                description={copy.revenueAtRisk.cardDescription}
                visual={
                  <div className="products-v2-empty-bars">
                    <i />
                    <i />
                    <i />
                  </div>
                }
              />
            )}
          </div>
        </PremiumPanel>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            marginBottom: 16,
          }}
        >
          {[10, 20, 50].map((limit) => (
            <button
              key={limit}
              type="button"
              className={
                visibleLimit === limit
                  ? "table-filter-btn active"
                  : "table-filter-btn"
              }
              onClick={() => setVisibleLimit(limit as 10 | 20 | 50)}
            >
              {t("productsPage.showLimit", { limit })}
            </button>
          ))}
        </div>

        <ProductRiskTable
          sortedRiskRows={sortedRiskRows}
          exportRows={allSortedRiskRows}
          onlyLosing={onlyLosing}
          setOnlyLosing={setOnlyLosing}
          period={period}
          riskLabel={riskLabel}
          shopHandle={shopHandle}
          currencyCode={currencyCode}
        />
      </div>
    </div>
  );
}
