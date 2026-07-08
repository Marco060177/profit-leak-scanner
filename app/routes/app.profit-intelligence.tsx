import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "~/shopify.server";

import dashboardStylesUrl from "~/styles/dashboard.css?url";
import MarginBreakdown from "~/components/dashboard/MarginBreakdown";

import { loadMarginDashboardData } from "~/utils/margin.server";
import { type LoaderData, money } from "~/utils/margin";

import DashboardNav from "~/components/dashboard/DashboardNav";

import { getStoredLanguage } from "~/utils/i18n";

export const links = () => [{ rel: "stylesheet", href: dashboardStylesUrl }];

export const loader = async ({
  request,
}: {
  request: Request;
}): Promise<LoaderData> => {
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

  return loadMarginDashboardData({ admin, session, period });
};

export default function ProfitIntelligencePage() {
  const { summary, trend, rows, marginDeterioration } =
    useLoaderData() as LoaderData;

  const navigate = useNavigate();

  const language = getStoredLanguage();

  const topDiscountProducts = [...rows]
    .filter((row) => row.discounts > 0)
    .sort((a, b) => b.discounts - a.discounts)
    .slice(0, 5);

  const totalRevenue = Math.max(summary.revenue, 1);

  const cogsPercentage = Math.min(
    100,
    Math.max(0, (summary.cogs / totalRevenue) * 100),
  );

  const profitPercentage = Math.min(
    100,
    Math.max(0, (summary.profit / totalRevenue) * 100),
  );

  const leakPercentage = Math.min(
    100,
    Math.max(0, (summary.totalLeak / totalRevenue) * 100),
  );

  const firstTrendPoint = trend[0];
  const lastTrendPoint = trend[trend.length - 1];

  const revenueTrendPct =
    firstTrendPoint && lastTrendPoint && firstTrendPoint.revenue > 0
      ? ((lastTrendPoint.revenue - firstTrendPoint.revenue) /
        firstTrendPoint.revenue) *
      100
      : 0;

  const profitTrendPct =
    firstTrendPoint && lastTrendPoint && firstTrendPoint.profit > 0
      ? ((lastTrendPoint.profit - firstTrendPoint.profit) /
        firstTrendPoint.profit) *
      100
      : 0;

  const marginDeteriorating = summary.marginDelta < -3;
  const profitDeteriorating = profitTrendPct < -5;
  const revenueGrowingWhileProfitFalls =
    revenueTrendPct > 5 && profitTrendPct < 0;

  const totalBusinessImpact =
    summary.discounts + summary.refunds + summary.shipping;

  const businessDrivers = [
    {
      label: "Discounts",
      value: summary.discounts,
      description: "Revenue reduced through promotional discounts.",
    },
    {
      label: "Refunds",
      value: summary.refunds,
      description: "Revenue reversed through returned orders.",
    },
    {
      label: "Shipping",
      value: summary.shipping,
      description: "Shipping charges recorded on orders.",
    },
  ]
    .filter((driver) => driver.value > 0)
    .map((driver) => ({
      ...driver,
      impactPct:
        totalBusinessImpact > 0
          ? (driver.value / totalBusinessImpact) * 100
          : 0,
    }));

  const sortedRevenueRows = [...rows].sort((a, b) => b.revenue - a.revenue);

  const topProductRevenue = sortedRevenueRows[0]?.revenue || 0;
  const top3Revenue = sortedRevenueRows
    .slice(0, 3)
    .reduce((acc, row) => acc + row.revenue, 0);
  const top5Revenue = sortedRevenueRows
    .slice(0, 5)
    .reduce((acc, row) => acc + row.revenue, 0);

  const topProductRevenueShare = (topProductRevenue / totalRevenue) * 100;
  const top3RevenueShare = (top3Revenue / totalRevenue) * 100;
  const top5RevenueShare = (top5Revenue / totalRevenue) * 100;

  const dependencyLevel =
    top3RevenueShare > 60
      ? "High"
      : top3RevenueShare > 35
        ? "Moderate"
        : "Low";

  const dependencyLevelLabel =
    language === "it"
      ? dependencyLevel === "High"
        ? "Elevata"
        : dependencyLevel === "Moderate"
          ? "Moderata"
          : "Bassa"
      : dependencyLevel;

  const sortedProfitRows = [...rows].sort((a, b) => b.profit - a.profit);

  const totalProfitBase = Math.max(summary.profit, 1);
  const topProductProfit = sortedProfitRows[0]?.profit || 0;
  const top3Profit = sortedProfitRows
    .slice(0, 3)
    .reduce((acc, row) => acc + row.profit, 0);

  const topProductProfitShare = (topProductProfit / totalProfitBase) * 100;
  const top3ProfitShare = (top3Profit / totalProfitBase) * 100;

  const weakProfitDrivers = rows
    .filter((row) => row.revenue > 0 && row.marginPct < 15)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 3);

  const healthyProfitProducts = rows.filter(
    (row) => row.revenue > 0 && row.marginPct >= 30,
  ).length;

  const weakProfitProducts = rows.filter(
    (row) => row.revenue > 0 && row.marginPct < 15,
  ).length;

  const profitQualityLevel =
    weakProfitProducts > healthyProfitProducts
      ? "Weak"
      : weakProfitProducts > 0
        ? "Mixed"
        : "Healthy";

  const intelligenceScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 -
        top3RevenueShare * 0.35 -
        Math.max(0, top3ProfitShare - 60) * 0.4 -
        weakProfitProducts * 5,
      ),
    ),
  );

  const statusColor =
    intelligenceScore < 40
      ? "#ff6b4a"
      : intelligenceScore < 70
        ? "#f59e0b"
        : "#22c55e";

  const profitQualityColor =
    profitQualityLevel === "Weak"
      ? "#ff6b4a"
      : profitQualityLevel === "Mixed"
        ? "#f59e0b"
        : "#22c55e";

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardNav active="profit" navigate={navigate} />

        <div className="hero-header">
          <div>
            <div className="eyebrow">
              {language === "it"
                ? "ANALISI PROFITTI"
                : "PROFIT INTELLIGENCE"}
            </div>

            <div className="hero-title">
              {language === "it"
                ? "Analisi Profitti"
                : "Profit Intelligence"}
            </div>

            <div className="hero-description">
              {language === "it"
                ? "MarginLab analizza come vengono generati ricavi e profitti e valuta la qualità dei margini del tuo business Shopify."
                : "Understand revenue concentration, profit dependency and margin quality across your Shopify business."}
            </div>
          </div>
        </div>

        <div className="hero-score-card" style={{ marginBottom: 28 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.05fr 1fr",
              gap: 28,
              alignItems: "stretch",
            }}
          >
            <div>
              <div className="eyebrow">
                {language === "it"
                  ? "INDICE DI REDDITIVITA'"
                  : "PROFIT INTELLIGENCE SCORE"}
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
                {intelligenceScore}
                <span style={{ fontSize: 34, opacity: 0.45 }}>/100</span>
              </div>

              <div
                style={{
                  marginTop: 18,
                  fontSize: 24,
                  fontWeight: 900,
                  color: statusColor,
                }}
              >
                {language === "it"
                  ? `${dependencyLevel} dipendenza da pochi prodotti`
                  : `${dependencyLevel} concentration risk`}
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
                {language === "it"
                  ? "MarginLab analizza la concentrazione dei ricavi, la dipendenza dai profitti e i punti deboli della redditività per valutare la stabilità complessiva del business."
                  : "MarginLab evaluates revenue concentration, profit dependency and weak profit drivers to estimate business stability."}
              </p>

              <div
                style={{
                  marginTop: 28,
                  paddingTop: 22,
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 18,
                }}
              >
                {[
                  [
                    language === "it"
                      ? "Dipendenza dai ricavi"
                      : "Revenue dependency",
                    `${top3RevenueShare.toFixed(1)}%`,
                  ],
                  [
                    language === "it"
                      ? "Dipendenza dai profitti"
                      : "Profit dependency",
                    `${top3ProfitShare.toFixed(1)}%`,
                  ],
                  [
                    language === "it"
                      ? "Prodotti poco redditizi"
                      : "Weak products",
                    `${weakProfitProducts}`,
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
                minHeight: 280,
              }}
            >
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
                  boxShadow: `0 0 46px ${statusColor}44`,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: -16,
                    borderRadius: "50%",
                    background: `conic-gradient(${statusColor} ${intelligenceScore * 3.6
                      }deg, transparent 0deg)`,
                    mask: "radial-gradient(circle, transparent 58%, black 59%)",
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
                    {intelligenceScore}
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      fontWeight: 900,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: statusColor,
                    }}
                  >
                    {dependencyLevel} risk
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <MarginBreakdown
          cogsPercentage={cogsPercentage}
          profitPercentage={profitPercentage}
          leakPercentage={leakPercentage}
        />

        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-eyebrow">
                {language === "it"
                  ? "ANALISI DELLA REDDITIVITA'"
                  : "BUSINESS IMPACT ANALYSIS"}
              </div>

              <h2 className="panel-title">
                {language === "it"
                  ? "Cosa sta riducendo i tuoi profitti?"
                  : "Where is profit being eroded?"}
              </h2>
            </div>
          </div>

          {businessDrivers.length > 0 ? (
            <div style={{ display: "grid", gap: 16, marginTop: 24 }}>
              {businessDrivers.map((driver) => (
                <div
                  key={driver.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 24,
                    padding: 18,
                    borderRadius: 18,
                    background: "rgba(255,255,255,0.035)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 900, color: "#f3f4f6" }}>
                      {driver.label}
                    </div>

                    <div
                      style={{
                        marginTop: 6,
                        color: "rgba(255,255,255,0.58)",
                        lineHeight: 1.5,
                      }}
                    >
                      {driver.description}
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontSize: 24,
                        fontWeight: 950,
                        color: "#ff6b4a",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {money(driver.value)}
                    </div>

                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 12,
                        color: "rgba(255,255,255,0.55)",
                      }}
                    >
                      {driver.impactPct.toFixed(1)}% impact
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                marginTop: 24,
                padding: 22,
                borderRadius: 18,
                background: "rgba(255,255,255,0.035)",
                border: "1px solid rgba(255,255,255,0.07)",
                color: "rgba(255,255,255,0.64)",
                lineHeight: 1.6,
              }}
            >
              {language === "it"
                ? "Nel periodo selezionato non sono stati rilevati sconti, rimborsi o costi di spedizione che abbiano inciso sui margini. Il profitto calcolato corrisponde attualmente al margine lordo dei prodotti."
                : "No discounts, refunds or shipping impact were detected in the selected period. Contribution profit currently matches product-level gross profit."}
            </div>
          )}
        </div>

        {marginDeterioration.length > 0 && (
          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-eyebrow">MARGIN DETERIORATION</div>
                <h2 className="panel-title">Products losing profitability</h2>
              </div>
            </div>

            <div style={{ display: "grid", gap: 14, marginTop: 24 }}>
              {marginDeterioration.map((row) => (
                <div
                  key={row.productId || row.productTitle}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 24,
                    padding: 18,
                    borderRadius: 18,
                    background: "rgba(255,255,255,0.035)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 900, color: "#f3f4f6" }}>
                      {row.productTitle}
                    </div>

                    <div
                      style={{
                        marginTop: 6,
                        color: "rgba(255,255,255,0.58)",
                        lineHeight: 1.5,
                      }}
                    >
                      {language === "it"
                        ? "Il margine di questo prodotto è diminuito rispetto al periodo precedente."
                        : "Product margin declined compared to the previous selected period."}
                    </div>
                  </div>

                  <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <div
                      style={{
                        fontSize: 24,
                        fontWeight: 950,
                        color: "#ef4444",
                      }}
                    >
                      {row.productMarginDelta?.toFixed(1)} pts
                    </div>

                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 13,
                        fontWeight: 800,
                        color: "rgba(255,255,255,0.58)",
                      }}
                    >
                      {row.previousMarginPct?.toFixed(1)}% →{" "}
                      {row.marginPct.toFixed(1)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {topDiscountProducts.length > 0 && (
          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-eyebrow">
                  {language === "it"
                    ? "IMPATTO DEGLI SCONTI"
                    : "DISCOUNT EXPOSURE"}
                </div>

                <h2 className="panel-title">
                  {language === "it"
                    ? "Prodotti maggiormente penalizzati dagli sconti"
                    : "Products most affected by discounts"}
                </h2>
              </div>
            </div>

            <div style={{ display: "grid", gap: 14, marginTop: 24 }}>
              {topDiscountProducts.map((row) => {
                const discountPct =
                  row.revenue > 0 ? (row.discounts / row.revenue) * 100 : 0;

                return (
                  <div
                    key={row.productId || row.productTitle}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 24,
                      padding: 18,
                      borderRadius: 18,
                      background: "rgba(255,255,255,0.035)",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 900, color: "#f3f4f6" }}>
                        {row.productTitle}
                      </div>

                      <div
                        style={{
                          marginTop: 6,
                          color: "rgba(255,255,255,0.58)",
                          lineHeight: 1.5,
                        }}
                      >
                        {language === "it"
                          ? "Totale degli sconti applicati a questo prodotto nel periodo selezionato."
                          : "Discount absorbed by this product during the selected period."}
                      </div>

                      <div
                        style={{
                          marginTop: 4,
                          color: "rgba(245,158,11,0.85)",
                          fontSize: 13,
                          fontWeight: 800,
                        }}
                      >
                        {discountPct.toFixed(1)}% of product revenue
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: 24,
                        fontWeight: 950,
                        color: "#f59e0b",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {money(row.discounts)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-eyebrow">
                {language === "it"
                  ? "ANALISI TEMPORALE"
                  : "TIMELINE INTELLIGENCE"}
              </div>

              <h2 className="panel-title">
                {language === "it"
                  ? "Andamento della redditività"
                  : "Profit trend signals"}
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
                label: language === "it" ? "Andamento dei margini" : "Margin direction",
                value:
                  language === "it"
                    ? marginDeteriorating
                      ? "In calo"
                      : "Stabile"
                    : marginDeteriorating
                      ? "Deteriorating"
                      : "Stable",
                text:
                  language === "it"
                    ? marginDeteriorating
                      ? `Il margine è diminuito del ${Math.abs(
                        summary.marginDelta,
                      ).toFixed(1)}% rispetto al periodo precedente.`
                      : "Il margine è stabile rispetto al periodo precedente."
                    : marginDeteriorating
                      ? `Margin dropped by ${Math.abs(
                        summary.marginDelta,
                      ).toFixed(1)}% compared to the previous period.`
                      : "Margin is stable compared to the previous period.",
                color: marginDeteriorating ? "#ff6b4a" : "#22c55e",
              },
              {
                label: language === "it" ? "Andamento dei profitti" : "Profit movement",
                value:
                  language === "it"
                    ? profitDeteriorating
                      ? "In calo"
                      : "Stabile"
                    : profitDeteriorating
                      ? "Declining"
                      : "Stable",
                text:
                  language === "it"
                    ? profitDeteriorating
                      ? `I profitti sono diminuiti del ${Math.abs(
                        profitTrendPct,
                      ).toFixed(1)}% nel periodo analizzato.`
                      : `I profitti sono variati del ${profitTrendPct.toFixed(
                        1,
                      )}% nel periodo analizzato.`
                    : profitDeteriorating
                      ? `Profit declined by ${Math.abs(profitTrendPct).toFixed(
                        1,
                      )}% across the selected trend window.`
                      : `Profit changed by ${profitTrendPct.toFixed(
                        1,
                      )}% across the selected trend window.`,
                color: profitDeteriorating ? "#ff6b4a" : "#22c55e",
              },
              {
                label: language === "it" ? "Qualità della crescita" : "Growth quality",
                value:
                  language === "it"
                    ? revenueGrowingWhileProfitFalls
                      ? "In peggioramento"
                      : "Coerente"
                    : revenueGrowingWhileProfitFalls
                      ? "Weakening"
                      : "Aligned",
                text:
                  language === "it"
                    ? revenueGrowingWhileProfitFalls
                      ? "I ricavi stanno aumentando mentre i profitti diminuiscono. La qualità della crescita potrebbe essere in peggioramento."
                      : "Ricavi e profitti stanno seguendo un andamento coerente."
                    : revenueGrowingWhileProfitFalls
                      ? "Revenue is growing while profit is falling. Growth quality may be weakening."
                      : "Revenue and profit movement do not currently show a major divergence.",
                color: revenueGrowingWhileProfitFalls ? "#f59e0b" : "#22c55e",
              },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  position: "relative",
                  overflow: "hidden",
                  borderRadius: 22,
                  padding: 22,
                  background:
                    "linear-gradient(180deg, rgba(16,22,35,0.96), rgba(9,13,22,0.96))",
                  border: "1px solid rgba(255,255,255,0.07)",
                  boxShadow: "0 18px 46px rgba(0,0,0,0.36)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: `radial-gradient(circle at top right, ${item.color}22, transparent 42%)`,
                    pointerEvents: "none",
                  }}
                />

                <div
                  style={{
                    position: "relative",
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.48)",
                  }}
                >
                  {item.label}
                </div>

                <div
                  style={{
                    position: "relative",
                    marginTop: 12,
                    fontSize: 24,
                    fontWeight: 950,
                    color: item.color,
                  }}
                >
                  {item.value}
                </div>

                <div
                  style={{
                    position: "relative",
                    marginTop: 12,
                    color: "rgba(255,255,255,0.66)",
                    lineHeight: 1.65,
                    fontSize: 14,
                  }}
                >
                  {item.text}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 22,
            marginTop: 24,
          }}
        >
          <ConcentrationCard
            eyebrow="REVENUE DEPENDENCY"
            title="Revenue concentration"
            status={`${dependencyLevel} dependency`}
            statusColor={
              dependencyLevel === "High"
                ? "#ff6b4a"
                : dependencyLevel === "Moderate"
                  ? "#f59e0b"
                  : "#22c55e"
            }
            rows={[
              ["Top product", topProductRevenueShare],
              ["Top 3 products", top3RevenueShare],
              ["Top 5 products", top5RevenueShare],
            ]}
          />

          <ConcentrationCard
            eyebrow="PROFIT CONCENTRATION"
            title="Profit dependency"
            status={`${top3ProfitShare > 60
              ? "High"
              : top3ProfitShare > 35
                ? "Moderate"
                : "Low"
              } profit dependency`}
            statusColor={
              top3ProfitShare > 60
                ? "#ff6b4a"
                : top3ProfitShare > 35
                  ? "#f59e0b"
                  : "#22c55e"
            }
            rows={[
              ["Top product", topProductProfitShare],
              ["Top 3 products", top3ProfitShare],
            ]}
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.35fr 1fr",
            gap: 22,
            marginTop: 24,
          }}
        >
          <div
            className="panel"
            style={{
              marginBottom: 0,
              border: "1px solid rgba(255,115,60,0.24)",
              background:
                "radial-gradient(circle at top left, rgba(255,115,60,0.08), transparent 34%), linear-gradient(180deg, rgba(17,24,39,0.96), rgba(8,13,22,0.98))",
            }}
          >
            <div className="panel-eyebrow">TOP PROFIT LEAKS</div>

            <h2 className="panel-title" style={{ marginTop: 8 }}>
              Products creating margin pressure
            </h2>

            <div
              style={{
                marginTop: 10,
                color: "rgba(255,255,255,0.58)",
                lineHeight: 1.6,
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              High-revenue products with weak margins can make sales look strong
              while reducing profit quality.
            </div>

            <div style={{ marginTop: 24, display: "grid", gap: 12 }}>
              {weakProfitDrivers.length > 0 ? (
                weakProfitDrivers.map((row, index) => (
                  <div
                    key={row.productId}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "46px 1fr auto",
                      gap: 16,
                      padding: 18,
                      borderRadius: 18,
                      background:
                        "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.025))",
                      border:
                        index === 0
                          ? "1px solid rgba(255,107,74,0.34)"
                          : "1px solid rgba(255,115,60,0.14)",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 14,
                        background:
                          index === 0
                            ? "rgba(255,107,74,0.16)"
                            : "rgba(255,115,60,0.10)",
                        border:
                          index === 0
                            ? "1px solid rgba(255,107,74,0.32)"
                            : "1px solid rgba(255,115,60,0.20)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: index === 0 ? "#ff6b4a" : "#ff9a70",
                        fontWeight: 950,
                      }}
                    >
                      #{index + 1}
                    </div>

                    <div>
                      <div
                        style={{
                          fontWeight: 950,
                          color: "#f8fafc",
                          lineHeight: 1.35,
                        }}
                      >
                        {row.productTitle}
                      </div>

                      <div
                        style={{
                          marginTop: 7,
                          display: "flex",
                          gap: 10,
                          flexWrap: "wrap",
                          color: "rgba(255,255,255,0.52)",
                          fontSize: 12,
                          fontWeight: 800,
                        }}
                      >
                        <span>Revenue {money(row.revenue)}</span>
                        <span>•</span>
                        <span>Profit {money(row.profit)}</span>
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{
                          fontSize: 26,
                          fontWeight: 950,
                          color: row.marginPct < 0 ? "#ff6b4a" : "#f59e0b",
                          lineHeight: 1,
                        }}
                      >
                        {row.marginPct.toFixed(1)}%
                      </div>

                      <div
                        style={{
                          marginTop: 7,
                          fontSize: 10,
                          fontWeight: 900,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color: "rgba(255,255,255,0.44)",
                        }}
                      >
                        Margin
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div
                  style={{
                    padding: 22,
                    borderRadius: 18,
                    background: "rgba(255,255,255,0.035)",
                    border: "1px solid rgba(34,197,94,0.18)",
                    color: "rgba(255,255,255,0.66)",
                    lineHeight: 1.6,
                    fontWeight: 700,
                  }}
                >
                  No major weak profit drivers detected in the current period.
                </div>
              )}
            </div>
          </div>

          <div
            className="panel"
            style={{
              marginBottom: 0,
              border: `1px solid ${profitQualityColor}55`,
              background: `radial-gradient(circle at top right, ${profitQualityColor}18, transparent 38%), linear-gradient(180deg, rgba(17,24,39,0.96), rgba(8,13,22,0.98))`,
            }}
          >
            <div className="panel-eyebrow">PROFIT QUALITY</div>

            <h2 className="panel-title" style={{ marginTop: 8 }}>
              Margin health signal
            </h2>

            <div
              style={{
                marginTop: 26,
                display: "inline-flex",
                padding: "12px 18px",
                borderRadius: 999,
                background: `${profitQualityColor}18`,
                border: `1px solid ${profitQualityColor}55`,
                color: profitQualityColor,
                fontSize: 13,
                fontWeight: 950,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              {profitQualityLevel}
            </div>

            <div
              style={{
                marginTop: 20,
                fontSize: 58,
                fontWeight: 950,
                color: profitQualityColor,
                lineHeight: 1,
                letterSpacing: "-0.04em",
              }}
            >
              {healthyProfitProducts}/{rows.length}
            </div>

            <div
              style={{
                marginTop: 9,
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.42)",
              }}
            >
              Healthy margin products
            </div>

            <p
              style={{
                marginTop: 18,
                color: "rgba(255,255,255,0.66)",
                lineHeight: 1.75,
                fontWeight: 700,
              }}
            >
              {healthyProfitProducts} products show healthy margins, while{" "}
              {weakProfitProducts} products show weak profit quality.
            </p>

            <div
              style={{
                marginTop: 22,
                height: 9,
                borderRadius: 999,
                background: "rgba(255,255,255,0.07)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(0, (healthyProfitProducts / Math.max(rows.length, 1)) * 100),
                  )}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: `linear-gradient(90deg, ${profitQualityColor}, ${profitQualityColor}88)`,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConcentrationCard({
  eyebrow,
  title,
  status,
  statusColor,
  rows,
}: {
  eyebrow: string;
  title: string;
  status: string;
  statusColor: string;
  rows: [string, number][];
}) {
  return (
    <div className="panel" style={{ marginBottom: 0 }}>
      <div className="panel-eyebrow">{eyebrow}</div>

      <h2 className="panel-title" style={{ marginTop: 8 }}>
        {title}
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${rows.length}, 1fr)`,
          gap: 14,
          marginTop: 24,
        }}
      >
        {rows.map(([label, value]) => (
          <div
            key={label}
            style={{
              borderRadius: 22,
              padding: 20,
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.018))",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div
              style={{
                fontSize: 36,
                fontWeight: 950,
                lineHeight: 1,
                color: "#f3f4f6",
              }}
            >
              {value.toFixed(1)}%
            </div>

            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.48)",
              }}
            >
              {label}
            </div>

            <div
              style={{
                height: 7,
                borderRadius: 999,
                background: "rgba(255,255,255,0.07)",
                overflow: "hidden",
                marginTop: 16,
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, Math.max(0, value))}%`,
                  height: "100%",
                  borderRadius: 999,
                  background:
                    "linear-gradient(90deg, #ff5a36 0%, #f59e0b 100%)",
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 22,
          display: "inline-flex",
          padding: "9px 13px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.06)",
          color: statusColor,
          fontWeight: 900,
        }}
      >
        {status}
      </div>
    </div>
  );
}