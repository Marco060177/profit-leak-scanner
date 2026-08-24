import * as React from "react";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "~/shopify.server";
import { useI18n } from "~/components/i18n/I18nProvider";
import dashboardStylesUrl from "~/styles/dashboard.css?url";
import ProductRiskTable from "~/components/dashboard/ProductRiskTable";

import { loadMarginDashboardData } from "~/utils/margin.server";
import DashboardNav from "~/components/dashboard/DashboardNav";
import MetricTooltip from "~/components/ui/MetricTooltip";
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
  const {
    summary,
    rows,
    period,
    shopHandle,
    currencyCode,
  } = useLoaderData() as LoaderData;

  const navigate = useNavigate();
  const { language, locale, messages, t } = useI18n();
  const copy = messages.productsPage;

  const money = React.useCallback(
    (value: number) =>
      formatStoreMoney(
        value,
        currencyCode,
        locale,
      ),
    [currencyCode, locale],
  );

  const pct = React.useCallback(
    (value: number) =>
      formatStorePercent(
        value,
        locale,
      ),
    [locale],
  );

  const targetMarginPct = 20;

  const economicRows = React.useMemo<Row[]>(
    () =>
      rows.map((row) => {
        const economicRevenue =
          row.economicRevenue ?? row.revenue;

        const economicCogs =
          row.economicCogs ?? row.cogs;

        const economicProfit =
          row.economicProfit ?? row.profit;

        const economicMarginPct =
          row.economicMarginPct ?? row.marginPct;

        const qty = Math.max(0, row.qty);

        const avgPrice =
          qty > 0
            ? economicRevenue / qty
            : row.avgPrice;

        const avgCost =
          qty > 0
            ? economicCogs / qty
            : row.avgCost;

        const breakEvenPrice = avgCost;

        const targetPrice =
          avgCost > 0
            ? avgCost / (1 - targetMarginPct / 100)
            : avgPrice;

        const targetDelta =
          targetPrice - avgPrice;

        return {
          ...row,

          // Products Intelligence now consumes the product-level
          // economic basis produced by margin.server.ts.
          revenue: economicRevenue,
          cogs: economicCogs,
          profit: economicProfit,
          marginPct: economicMarginPct,

          losing: economicProfit < 0,
          lowMargin:
            economicMarginPct > 0 &&
            economicMarginPct < 10,

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
    (sum, row) =>
      sum + (row.profit < 0 ? Math.abs(row.profit) : 0),
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

  const allSortedRiskRows = [...visibleRows]
    .sort((a, b) => {
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

  const riskColor = (row: Row) => { if (row.losing) return "#ef4444"; if (row.missingCost) return "#f59e0b"; if (row.lowMargin) return "#ff6b4a"; return "#22c55e"; };

  const riskBackground = (row: Row) => {
    if (row.losing) return "rgba(239,68,68,0.16)";
    if (row.missingCost) return "rgba(245,158,11,0.14)";
    if (row.lowMargin) return "rgba(255,90,54,0.14)";
    return "rgba(34,197,94,0.12)";
  };

  const criticalProducts =
    economicRows.filter((row) => row.losing).length;

  const highProducts = economicRows.filter(
    (row) =>
      !row.losing &&
      (row.missingCost || row.lowMargin),
  ).length;

  const healthyProducts = economicRows.filter(
    (row) =>
      !row.losing &&
      !row.missingCost &&
      !row.lowMargin,
  ).length;

  const totalProducts =
    Math.max(economicRows.length, 1);

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
        row.marginPct < 0
          ? "Critical"
          : row.marginPct < 10
            ? "High"
            : "Medium",
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

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardNav active="products" navigate={navigate} />

        <div className="hero-header">
          <div>
            <div className="eyebrow">
              {copy.eyebrow}
            </div>

            <div className="hero-title">
              {copy.title}
            </div>

            <div className="hero-description">
              {copy.description}
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
              {copy.taxAwareBasis}
            </div>
          </div>
        </div>

        <div className="hero-score-card" style={{ marginBottom: 28 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.1fr 1fr",
              gap: 28,
              alignItems: "stretch",
            }}
          >
            <div>
              <div
                className="eyebrow"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                }}
              >
                <span>
                  {copy.score.eyebrow}
                </span>

                <MetricTooltip
                  content={{
                    title: copy.score.tooltipTitle,

                    description: copy.score.tooltipDescription,

                    note: copy.score.tooltipNote,
                  }}
                />
              </div>

              <div
                style={{
                  fontSize: 82,
                  fontWeight: 950,
                  lineHeight: 1,
                  marginTop: 14,
                  color: "#f3f4f6",
                  letterSpacing: "-3px",
                }}
              >
                {Math.max(
                  0,
                  Math.min(
                    100,
                    Math.round(100 - criticalProducts * 14 - highProducts * 7),
                  ),
                )}
                <span style={{ fontSize: 34, opacity: 0.45 }}>/100</span>
              </div>

              <div
                style={{
                  marginTop: 18,
                  fontSize: 24,
                  fontWeight: 900,
                  color:
                    criticalProducts > 0
                      ? "#ff6b4a"
                      : highProducts > 0
                        ? "#f59e0b"
                        : "#22c55e",
                }}
              >
                {criticalProducts > 0
                  ? copy.score.critical
                  : highProducts > 0
                    ? copy.score.moderate
                    : copy.score.healthy}
              </div>

              <p
                style={{
                  marginTop: 14,
                  color: "rgba(255,255,255,0.66)",
                  maxWidth: 620,
                  lineHeight: 1.7,
                  fontSize: 15,
                }}
              >
                {copy.score.description}
              </p>

              <div
                style={{
                  marginTop: 28,
                  paddingTop: 22,
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                  display: "grid",
                  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                  gap: 18,
                }}
              >
                {[
                  [
                    copy.summary.productsAtRisk,
                    `${criticalProducts + highProducts}`,
                  ],

                  [
                    copy.summary.criticalProducts,
                    `${criticalProducts}`,
                  ],

                  [
                    copy.summary.economicLosses,
                    money(economicLeak),
                  ],

                  [
                    copy.summary.healthyProducts,
                    `${healthyProducts}`,
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div
                      style={{
                        fontSize: 34,
                        fontWeight: 950,
                        color: "#f3f4f6",
                        lineHeight: 1,
                      }}
                    >
                      {value}
                    </div>

                    <div
                      style={{
                        marginTop: 9,
                        fontSize: 11,
                        fontWeight: 900,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "rgba(255,255,255,0.42)",
                      }}
                    >
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                borderRadius: 28,
                border: "1px solid rgba(255,255,255,0.08)",
                background:
                  "radial-gradient(circle at 50% 35%, rgba(255,90,54,0.20), transparent 28%), linear-gradient(180deg, rgba(16,22,35,0.96), rgba(7,11,20,0.96))",
                padding: 32,
                boxShadow: "0 24px 80px rgba(0,0,0,0.42)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 260,
              }}
            >
              {(() => {
                const productScore = Math.max(
                  0,
                  Math.min(
                    100,
                    Math.round(100 - criticalProducts * 14 - highProducts * 7),
                  ),
                );

                const productScoreColor =
                  productScore < 40
                    ? "#ff6b4a"
                    : productScore < 70
                      ? "#f59e0b"
                      : "#22c55e";

                const productScoreLabel =
                  productScore < 40
                    ? copy.score.highRisk
                    : productScore < 70
                      ? copy.score.moderateRisk
                      : copy.score.healthyLabel;

                return (
                  <div
                    style={{
                      width: 170,
                      height: 170,
                      borderRadius: "50%",
                      border: "16px solid rgba(255,255,255,0.08)",
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: `0 0 46px ${productScoreColor}44`,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        inset: -16,
                        borderRadius: "50%",
                        background: `conic-gradient(${productScoreColor} ${productScore * 3.6
                          }deg, transparent 0deg)`,
                        mask:
                          "radial-gradient(circle, transparent 58%, black 59%)",
                        WebkitMask:
                          "radial-gradient(circle, transparent 58%, black 59%)",
                      }}
                    />

                    <div style={{ textAlign: "center", position: "relative" }}>
                      <div
                        style={{
                          fontSize: 44,
                          fontWeight: 950,
                          color: "#f3f4f6",
                          lineHeight: 1,
                        }}
                      >
                        {productScore}
                      </div>

                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 12,
                          fontWeight: 900,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color: productScoreColor,
                        }}
                      >
                        {productScoreLabel}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {biggestRiskProduct && (
          <div
            className="panel"
            style={{
              marginBottom: 24,
              border: "1px solid rgba(255,115,60,0.26)",
              background:
                "radial-gradient(circle at top left, rgba(255,115,60,0.08), transparent 34%), linear-gradient(180deg, rgba(17,24,39,0.96), rgba(8,13,22,0.98))",
            }}
          >
            <div className="panel-eyebrow">
              {copy.biggestRisk.eyebrow}
            </div>

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
          </div>
        )}

        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-header">
            <div>
              <div className="panel-eyebrow">
                {copy.distribution.eyebrow}
              </div>

              <h2 className="panel-title">
                {copy.distribution.title}
              </h2>
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
                description:
                  copy.distribution.critical.description,
              },
              {
                label: copy.distribution.high.label,
                count: highProducts,
                pct: highPct,
                color: "#f59e0b",
                description:
                  copy.distribution.high.description,
              },
              {
                label: copy.distribution.healthy.label,
                count: healthyProducts,
                pct: healthyPct,
                color: "#22c55e",
                description:
                  copy.distribution.healthy.description,
              },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  borderRadius: 24,
                  padding: 24,
                  background:
                    "radial-gradient(circle at top left, rgba(255,115,60,0.05), transparent 36%), linear-gradient(135deg, rgba(17,24,39,0.98), rgba(6,12,24,0.98))",
                  border: "1px solid rgba(255,115,60,0.18)",
                  boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.035), 0 22px 55px rgba(0,0,0,0.30)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 900,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.54)",
                    }}
                  >
                    {item.label}
                  </div>

                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      background: item.color,
                      boxShadow: `0 0 18px ${item.color}66`,
                    }}
                  />
                </div>

                <div
                  style={{
                    marginTop: 18,
                    fontSize: 52,
                    fontWeight: 950,
                    lineHeight: 1,
                    color: item.color,
                    letterSpacing: "-0.04em",
                  }}
                >
                  {item.count}
                </div>

                <div
                  style={{
                    marginTop: 10,
                    color: "rgba(255,255,255,0.64)",
                    fontWeight: 850,
                  }}
                >
                  {t("productsPage.distribution.catalogShare", { value: pct(item.pct) })}
                </div>

                <div
                  style={{
                    marginTop: 10,
                    minHeight: 42,
                    color: "rgba(255,255,255,0.48)",
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  {item.description}
                </div>

                <div
                  style={{
                    height: 9,
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.07)",
                    overflow: "hidden",
                    marginTop: 20,
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(0, item.pct))}%`,
                      height: "100%",
                      borderRadius: 999,
                      background: item.color,
                      boxShadow: `0 0 18px ${item.color}55`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel" style={{ marginBottom: 24 }}>
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
                <span>
                  {copy.revenueAtRisk.eyebrow}
                </span>

                <MetricTooltip
                  content={{
                    title: copy.revenueAtRisk.tooltipTitle,

                    description: copy.revenueAtRisk.tooltipDescription,

                    note: copy.revenueAtRisk.tooltipNote,
                  }}
                />
              </div>

              <h2 className="panel-title">
                {copy.revenueAtRisk.title}
              </h2>

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

                    <div
                      style={{
                        marginTop: 12,
                        display: "inline-flex",
                        padding: "6px 10px",
                        borderRadius: 999,
                        background:
                          product.riskLevel === "Critical"
                            ? "rgba(239,68,68,0.14)"
                            : product.riskLevel === "High"
                              ? "rgba(249,115,22,0.14)"
                              : "rgba(234,179,8,0.14)",
                        color:
                          product.riskLevel === "Critical"
                            ? "#ff6b6b"
                            : product.riskLevel === "High"
                              ? "#ff8a4c"
                              : "#facc15",
                        fontSize: 11,
                        fontWeight: 900,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      {translatedRiskLevel}
                    </div>

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
                      <span>
                        {copy.labels.profitGap}
                      </span>
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
              <div
                style={{
                  gridColumn: "1 / -1",
                  padding: 22,
                  borderRadius: 18,
                  background: "rgba(34,197,94,0.08)",
                  border: "1px solid rgba(34,197,94,0.18)",
                  color: "rgba(255,255,255,0.68)",
                  fontWeight: 800,
                }}
              >
                {copy.revenueAtRisk.empty}
              </div>
            )}
          </div>
        </div>

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
          riskColor={riskColor}
          riskBackground={riskBackground}
          shopHandle={shopHandle}
          currencyCode={currencyCode}
        />
      </div>
    </div>
  );
}
