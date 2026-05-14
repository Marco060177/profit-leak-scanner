import * as React from "react";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "~/shopify.server";
import ScoreCard from "~/components/dashboard/ScoreCard";
import TrendChart from "~/components/dashboard/TrendChart";
import RiskDistribution from "~/components/dashboard/RiskDistribution";
import ProductRiskTable from "~/components/dashboard/ProductRiskTable";
import RecommendationsPanel from "~/components/dashboard/RecommendationsPanel";

import {
  type LoaderData,
  type Row,
  money,
  pct,
  toYYYYMMDD,
  extractNumericId,
} from "~/utils/margin";

export const loader = async ({
  request,
}: {
  request: Request;
}): Promise<LoaderData> => {
  const url = new URL(request.url);
  const period = url.searchParams.get("period") || "30";
  const days = Number.parseInt(period, 10);
  const safeDays = Number.isFinite(days) && days > 0 ? days : 30;

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - safeDays);
  const fromYYYYMMDD = toYYYYMMDD(fromDate);

  const previousFromDate = new Date(fromDate);
  previousFromDate.setDate(previousFromDate.getDate() - safeDays);
  const previousFromYYYYMMDD = toYYYYMMDD(previousFromDate);

  const queryString = `processed_at:>=${fromYYYYMMDD}`;
  const previousQueryString = `processed_at:>=${previousFromYYYYMMDD} processed_at:<${fromYYYYMMDD}`;

  const { admin, session } = await authenticate.admin(request);

  try {
    await admin.graphql(`query { shop { id } }`);
  } catch {
    throw new Response("Auth/scopes not ready. Reinstall the app.", {
      status: 401,
    });
  }

  const billingRes = await admin.graphql(`
    #graphql
    query {
      appInstallation {
        activeSubscriptions {
          id
          name
          status
        }
      }
    }
  `);

  const billingJson = await billingRes.json();
  const activeSubscriptions =
    billingJson?.data?.appInstallation?.activeSubscriptions ?? [];
  const billingActive = activeSubscriptions.length > 0;

  const response = await admin.graphql(
    `#graphql
    query OrdersForLeak($q: String!) {
      orders(first: 100, sortKey: PROCESSED_AT, reverse: true, query: $q) {
        edges {
          node {
            id
            name
            processedAt
            lineItems(first: 250) {
              edges {
                node {
                  quantity
                  originalUnitPriceSet {
                    shopMoney { amount }
                  }
                  variant {
                    product {
                      id
                      title
                    }
                    inventoryItem {
                      unitCost { amount }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }`,
    { variables: { q: queryString } },
  );

  const gql = await response.json();

  const previousResponse = await admin.graphql(
    `#graphql
    query OrdersForLeakPrevious($q: String!) {
      orders(first: 100, sortKey: PROCESSED_AT, reverse: true, query: $q) {
        edges {
          node {
            lineItems(first: 250) {
              edges {
                node {
                  quantity
                  originalUnitPriceSet {
                    shopMoney { amount }
                  }
                  variant {
                    inventoryItem {
                      unitCost { amount }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }`,
    { variables: { q: previousQueryString } },
  );

  const previousGql = await previousResponse.json();
  const previousOrderEdges = previousGql?.data?.orders?.edges ?? [];
  const orderEdges = gql?.data?.orders?.edges ?? [];

  const byDay: Record<
    string,
    {
      revenue: number;
      cogs: number;
    }
  > = {};

  const byProduct: Record<
    string,
    {
      productId: string;
      productTitle: string;
      qty: number;
      revenue: number;
      cogs: number;
      missingCost: boolean;
    }
  > = {};

  let totalRevenue = 0;
  let totalCogs = 0;

  let previousRevenue = 0;
  let previousCogs = 0;

  for (const o of orderEdges) {
    const items = o?.node?.lineItems?.edges ?? [];

    for (const li of items) {
      const qty = Number(li?.node?.quantity ?? 0);
      const price = Number(li?.node?.originalUnitPriceSet?.shopMoney?.amount ?? 0);
      const costRaw = li?.node?.variant?.inventoryItem?.unitCost?.amount;
      const hasCost = costRaw !== null && costRaw !== undefined;
      const cost = Number(costRaw ?? 0);

      const product = li?.node?.variant?.product;
      const productTitle = product?.title ?? "Unknown product";
      const productId = product?.id ? extractNumericId(product.id) : "";

      const lineRevenue = price * qty;
      const lineCogs = cost * qty;

      const processedAt = o?.node?.processedAt ?? "";
      const day = processedAt.slice(0, 10);

      if (!byDay[day]) {
        byDay[day] = {
          revenue: 0,
          cogs: 0,
        };
      }

      byDay[day].revenue += lineRevenue;
      byDay[day].cogs += lineCogs;

      if (!byProduct[productTitle]) {
        byProduct[productTitle] = {
          productId,
          productTitle,
          qty: 0,
          revenue: 0,
          cogs: 0,
          missingCost: false,
        };
      }

      if (!hasCost) {
        byProduct[productTitle].missingCost = true;
      }

      byProduct[productTitle].qty += qty;
      byProduct[productTitle].revenue += lineRevenue;
      byProduct[productTitle].cogs += lineCogs;

      totalRevenue += lineRevenue;
      totalCogs += lineCogs;
    }
  }

  for (const o of previousOrderEdges) {
    const items = o?.node?.lineItems?.edges ?? [];

    for (const li of items) {
      const qty = Number(li?.node?.quantity ?? 0);

      const price = Number(
        li?.node?.originalUnitPriceSet?.shopMoney?.amount ?? 0,
      );

      const costRaw =
        li?.node?.variant?.inventoryItem?.unitCost?.amount;

      const cost = Number(costRaw ?? 0);

      previousRevenue += price * qty;
      previousCogs += cost * qty;
    }
  }

  const rows: Row[] = Object.values(byProduct)
    .map((r) => {
      const profit = r.revenue - r.cogs;
      const marginPct = r.revenue > 0 ? (profit / r.revenue) * 100 : 0;

      const avgPrice = r.qty > 0 ? r.revenue / r.qty : 0;
      const avgCost = r.qty > 0 ? r.cogs / r.qty : 0;

      const breakEvenPrice = avgCost;
      const targetMargin = 0.2;
      const targetPrice = avgCost > 0 ? avgCost / (1 - targetMargin) : avgPrice;
      const targetDelta = targetPrice - avgPrice;

      const suggestion =
        profit < 0
          ? `Increase price to ${money(targetPrice)} (${targetDelta >= 0 ? "+" : ""}${money(
            targetDelta,
          )} per unit) to reach a 20% margin.`
          : targetDelta > 0
            ? `Consider increasing price to ${money(
              targetPrice,
            )} to reach a stronger 20% margin target.`
            : `Pricing looks healthy for a 20% margin.`;



      return {
        ...r,
        profit,
        marginPct,
        losing: profit < 0,
        lowMargin: marginPct > 0 && marginPct < 10,
        avgPrice,
        avgCost,
        breakEvenPrice,
        targetPrice,
        targetDelta,
        missingCost: r.missingCost,
        suggestion,
      };
    })
    .sort((a, b) => a.profit - b.profit);

  const totalProfit = totalRevenue - totalCogs;
  const previousProfit = previousRevenue - previousCogs;

  const previousMarginPct =
    previousRevenue > 0
      ? (previousProfit / previousRevenue) * 100
      : 0;

  const marginDelta =
    (totalRevenue > 0
      ? (totalProfit / totalRevenue) * 100
      : 0) - previousMarginPct;
  const revenueDeltaPct =
    previousRevenue > 0
      ? ((totalRevenue - previousRevenue) / previousRevenue) * 100
      : 0;
  const totalLeak = Math.abs(
    rows.reduce((acc, r) => acc + (r.profit < 0 ? r.profit : 0), 0),
  );
  const losingCount = rows.filter((r) => r.losing).length;
  const missingCostCount = rows.filter((r) => r.missingCost).length;
  const shopHandle = session.shop.replace(".myshopify.com", "");



  const trend = Object.entries(byDay)
    .map(([date, values]) => ({
      date,
      revenue: values.revenue,
      profit: values.revenue - values.cogs,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    summary: {
      revenue: totalRevenue,
      cogs: totalCogs,
      profit: totalProfit,
      marginPct: totalRevenue > 0
        ? (totalProfit / totalRevenue) * 100
        : 0,
      totalLeak,
      losingCount,
      missingCostCount,
      previousMarginPct,
      marginDelta,
      previousRevenue,
      revenueDeltaPct,
    },
    rows,
    trend,
    billingActive,
    period: String(safeDays),
    shopHandle,
  };
};

export default function DashboardV2() {
  const { summary, rows, trend, billingActive, period, shopHandle } =
    useLoaderData() as LoaderData;

  const navigate = useNavigate();
  const [onlyLosing, setOnlyLosing] = React.useState(false);

  const [analysisLoading, setAnalysisLoading] = React.useState(false);

  const analysisSteps = [
    "Scanning Shopify orders...",
    "Checking product costs...",
    "Detecting pricing leaks...",
    "Analysis complete...",
  ];

  const [analysisText, setAnalysisText] = React.useState(analysisSteps[0]);

  const dashboardLoading = false;
  const marginDelta = summary.marginDelta;
  const lowMarginCount = rows.filter((row) => row.lowMargin).length;
  const productsAtRisk = rows.filter(
    (row) => row.losing || row.lowMargin || row.missingCost,
  ).length;

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 -
        summary.losingCount * 18 -
        summary.missingCostCount * 8 -
        lowMarginCount * 6 -
        Math.max(0, 20 - summary.marginPct) * 2,
      ),
    ),
  );

  const scoreLabel =
    score < 40 ? "High risk" : score < 70 ? "Needs attention" : "Healthy";

  const hasRealData = rows.length > 0;

  const demoRows: Row[] = [
    {
      productId: "1",
      productTitle: "Arctic Hoodie",
      qty: 124,
      revenue: 8420,
      cogs: 5980,
      profit: 420,
      marginPct: 5,
      losing: false,
      lowMargin: true,
      avgPrice: 68,
      avgCost: 48,
      breakEvenPrice: 48,
      targetPrice: 60,
      targetDelta: 8,
      suggestion: "Increase price by $8 to reach target margin.",
      missingCost: false,
    },

    {
      productId: "2",
      productTitle: "Thermal Gloves",
      qty: 86,
      revenue: 3120,
      cogs: 3740,
      profit: -620,
      marginPct: -19.8,
      losing: true,
      lowMargin: false,
      avgPrice: 36,
      avgCost: 43,
      breakEvenPrice: 43,
      targetPrice: 54,
      targetDelta: 18,
      suggestion: "Product is selling below cost.",
      missingCost: false,
    },

    {
      productId: "3",
      productTitle: "Winter Backpack",
      qty: 42,
      revenue: 6890,
      cogs: 4110,
      profit: 2780,
      marginPct: 40.3,
      losing: false,
      lowMargin: false,
      avgPrice: 164,
      avgCost: 97,
      breakEvenPrice: 97,
      targetPrice: 122,
      targetDelta: -42,
      suggestion: "Pricing looks healthy.",
      missingCost: false,
    },

    {
      productId: "4",
      productTitle: "Snow Boots",
      qty: 58,
      revenue: 12300,
      cogs: 8940,
      profit: 3360,
      marginPct: 27.3,
      losing: false,
      lowMargin: false,
      avgPrice: 212,
      avgCost: 154,
      breakEvenPrice: 154,
      targetPrice: 193,
      targetDelta: -19,
      suggestion: "Pricing looks healthy.",
      missingCost: false,
    },
  ];

  const sourceRows = hasRealData ? rows : demoRows;

  const visualRevenue = sourceRows.reduce((acc, row) => acc + row.revenue, 0);
  const visualCogs = sourceRows.reduce((acc, row) => acc + row.cogs, 0);
  const visualProfit = visualRevenue - visualCogs;

  const visualLeak = Math.abs(
    sourceRows.reduce((acc, row) => acc + (row.profit < 0 ? row.profit : 0), 0),
  );

  const visualMarginPct =
    visualRevenue > 0 ? (visualProfit / visualRevenue) * 100 : 0;

  const profitPercentage =
    visualRevenue > 0
      ? (visualProfit / visualRevenue) * 100
      : 0;

  const cogsPercentage =
    visualRevenue > 0
      ? (visualCogs / visualRevenue) * 100
      : 0;

  const leakPercentage =
    visualRevenue > 0
      ? (visualLeak / visualRevenue) * 100
      : 0;

  const visualLowMarginCount = sourceRows.filter((row) => row.lowMargin).length;

  const visualMissingCostCount = sourceRows.filter(
    (row) => row.missingCost,
  ).length;

  const visualProductsAtRisk = sourceRows.filter(
    (row) => row.losing || row.lowMargin || row.missingCost,
  ).length;

  const criticalCount = sourceRows.filter((row) => row.losing).length;
  const warningCount = sourceRows.filter(
    (row) => row.lowMargin && !row.losing,
  ).length;
  const missingCount = sourceRows.filter((row) => row.missingCost).length;
  const healthyCount = sourceRows.filter(
    (row) => !row.losing && !row.lowMargin && !row.missingCost,
  ).length;

  const riskTotal = Math.max(sourceRows.length, 1);

  const filteredRows = onlyLosing
    ? sourceRows.filter((row) => row.losing)
    : sourceRows;

  const sortedRiskRows = filteredRows

    .slice()
    .sort((a, b) => {
      if (a.losing !== b.losing) return a.losing ? -1 : 1;
      if (a.missingCost !== b.missingCost) return a.missingCost ? -1 : 1;
      if (a.lowMargin !== b.lowMargin) return a.lowMargin ? -1 : 1;
      return a.profit - b.profit;
    })
    .slice(0, 12);

  const weakBestSeller = [...sourceRows]
    .filter((p) => p.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)[0];

  const weakBestSellerMargin =
    weakBestSeller && weakBestSeller.revenue > 0
      ? (weakBestSeller.profit / weakBestSeller.revenue) * 100
      : 0;

  const hasWeakBestSeller =
    weakBestSeller &&
    weakBestSeller.revenue > 1000 &&
    weakBestSellerMargin < 30;

  const topLeaks = [
    sourceRows.filter((row) => row.losing).length > 0
      ? {
        icon: "⚠️",
        issue: "Products selling below cost",
        severity: "High",
        loss: money(visualLeak),
      }
      : null,
    visualMissingCostCount > 0
      ? {
        icon: "📦",
        issue: "Products missing cost data",
        severity: "Medium",
        loss: `${visualMissingCostCount} products`,
      }
      : null,
    lowMarginCount > 0
      ? {
        icon: "🏷️",
        issue: "Low-margin products detected",
        severity: "Medium",
        loss: `${lowMarginCount} products`,
      }
      : null,
    productsAtRisk > 0
      ? {
        icon: "🔥",
        issue: "Products requiring margin review",
        severity: "Low",
        loss: `${productsAtRisk} at risk`,
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
      ? [...sourceRows].sort((a, b) => a.profit - b.profit)[0]
      : null;

  const bestProduct =
    sourceRows.length > 0
      ? [...sourceRows].sort((a, b) => b.marginPct - a.marginPct)[0]
      : null;

  const recoverableProfit = sourceRows.reduce((acc, row) => {
    return acc + (row.targetDelta > 0 ? row.targetDelta * row.qty : 0);
  }, 0);

  const recoveryProducts = sourceRows.filter(
    (row) => row.targetDelta > 0 && row.qty > 0,
  );

  const hasRecoveryOpportunity =
    recoveryProducts.length > 0 && recoverableProfit > 0;

  const recommendations = [
    sourceRows.filter((row) => row.losing).length > 0
      ? {
        title: `Fix ${sourceRows.filter((row) => row.losing).length
          } products selling below cost`,
        impact: `${money(visualLeak)} potential recovery`,
        confidence: "High confidence",
      }
      : null,
    summary.missingCostCount > 0
      ? {
        title: "Update missing product costs in Shopify",
        impact: `${summary.missingCostCount} products affected`,
        confidence: "Critical issue",
      }
      : null,
    lowMarginCount > 0
      ? {
        title: "Review low-margin products below 10%",
        impact: `${lowMarginCount} products need attention`,
        confidence: "Medium confidence",
      }
      : null,
    rows.length > 0
      ? {
        title: "Review target prices for worst-performing products",
        impact: "20% margin target available",
        confidence: "Rule-based insight",
      }
      : null,
  ].filter(Boolean) as {
    title: string;
    impact: string;
    confidence: string;
  }[];

  function setPeriod(next: "7" | "30" | "90") {
    navigate(`/app?period=${next}`);
  }

  function scrollToSection(id: string) {
    const section = document.getElementById(id);

    if (section) {
      section.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }

  const riskColor = (row: Row) => {
    if (row.losing) return "#ef4444";
    if (row.missingCost) return "#f59e0b";
    if (row.lowMargin) return "#ff6b4a";
    return "#22c55e";
  };

  const riskBackground = (row: Row) => {
    if (row.losing) return "rgba(239,68,68,0.16)";
    if (row.missingCost) return "rgba(245,158,11,0.14)";
    if (row.lowMargin) return "rgba(255,90,54,0.14)";
    return "rgba(34,197,94,0.12)";
  };

  const chartData =
    trend.length >= 2
      ? trend
      : [
        { date: "Mon", revenue: 4200, profit: 1100 },
        { date: "Tue", revenue: 5100, profit: 1600 },
        { date: "Wed", revenue: 4800, profit: 1200 },
        { date: "Thu", revenue: 6200, profit: 2100 },
        { date: "Fri", revenue: 7200, profit: 2600 },
        { date: "Sat", revenue: 6800, profit: 2400 },
        { date: "Sun", revenue: 7600, profit: 3100 },
      ];

  const maxChartValue = Math.max(
    ...chartData.map((d) => Math.max(d.revenue, d.profit)),
    1,
  );

  const revenuePoints = chartData
    .map((point, index) => {
      const x =
        chartData.length === 1
          ? 0
          : (index / (chartData.length - 1)) * 1000;

      const y = 230 - (point.revenue / maxChartValue) * 170;

      return `${x},${y}`;
    })
    .join(" ");



  const profitPoints = chartData
    .map((point, index) => {
      const x =
        chartData.length === 1
          ? 0
          : (index / (chartData.length - 1)) * 1000;

      const y = 230 - (point.profit / maxChartValue) * 170;

      return `${x},${y}`;
    })
    .join(" ");

  const riskLabel = (row: Row) => {
    if (row.losing) return "Critical";
    if (row.missingCost) return "Missing cost";
    if (row.lowMargin) return "High";
    return "Healthy";
  };

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
        <div className="navbar">
          <div className="logo">
            MARGIN<span>LAB</span>
          </div>

          <div className="nav-tabs">
            <div
              className="nav-tab active"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            >
              Overview
            </div>

            <div className="nav-tab" onClick={() => scrollToSection("leaks-section")}>
              Leaks
            </div>

            <div className="nav-tab" onClick={() => scrollToSection("products-section")}>
              Products
            </div>

            <div
              className="nav-tab"
              onClick={() => scrollToSection("recommendations-section")}
            >
              Recommendations
            </div>

            <div className="nav-tab" onClick={() => navigate("/app/billing")}>
              Billing
            </div>
          </div>
        </div>

        <div className="hero-header">
          <div>


            <div className="eyebrow">Profit Leak Scanner</div>

            <div className="hero-title">Profit Leak Dashboard</div>

            <div className="hero-description">


              Track hidden margin leaks, underpriced products and pricing issues affecting your
              Shopify store profitability.
            </div>

            <div className="period-tabs">
              {(["7", "30", "90"] as const).map((item) => (
                <button
                  key={item}
                  className={period === item ? "period-tab active" : "period-tab"}
                  onClick={() => setPeriod(item)}
                >
                  {item}d
                </button>
              ))}
            </div>
          </div>

          <button
            className="primary-button"
            disabled={analysisLoading}
            onClick={() => {
              if (analysisLoading) return;

              setAnalysisLoading(true);

              let step = 0;

              const interval = setInterval(() => {
                step++;

                if (step < analysisSteps.length) {
                  setAnalysisText(analysisSteps[step]);
                }
              }, 700);

              setTimeout(() => {
                clearInterval(interval);
                setAnalysisLoading(false);
                setAnalysisText(analysisSteps[0]);
              }, 2800);
            }}
          >
            <span>{analysisLoading ? "⏳" : "✦"}</span>

            <span>
              {analysisLoading ? analysisText : "Run analysis"}
            </span>
          </button>
        </div>

        {!billingActive ? (
          <div className="billing-banner">
            <strong>Plan inactive</strong>
            <span>
              You are viewing the dashboard in preview mode. Activate your plan to unlock full
              analysis.
            </span>
            <button onClick={() => navigate("/app/billing")}>Go to billing</button>
          </div>
        ) : null}

        <ScoreCard
          score={score}
          scoreLabel={scoreLabel}
          visualLeak={visualLeak}
          visualProductsAtRisk={visualProductsAtRisk}
          visualMarginPct={visualMarginPct}
        />

        <div className="kpi-grid">
          {[
            [
              "Revenue scanned",
              money(sourceRows.reduce((acc, row) => acc + row.revenue, 0)),
              `Last ${period} days`,
              "positive",
            ],

            [
              "Products analyzed",
              String(sourceRows.length),
              `${sourceRows.filter(
                (row) => row.losing || row.lowMargin || row.missingCost,
              ).length
              } at risk`,
              "warning",
            ],

            [
              "Low margin products",
              String(sourceRows.filter((row) => row.lowMargin).length),
              "Below 10%",
              "warning",
            ],

            [
              "Missing costs",
              String(sourceRows.filter((row) => row.missingCost).length),
              "Fix required",
              "danger",
            ],
          ].map(([label, value, note, tone]) => (
            <div key={label} className="kpi-card">
              <div className="kpi-label">{label}</div>

              <div className="kpi-value">{value}</div>

              <div
                className="kpi-note"
                style={{
                  color:
                    tone === "positive"
                      ? "#22c55e"
                      : tone === "danger"
                        ? "#ff6b4a"
                        : "#f59e0b",
                }}
              >
                {note}
              </div>
            </div>
          ))}
        </div>

        <div className="kpi-grid" style={{ marginBottom: 24 }}>
          <div className="kpi-card">
            <div className="kpi-label">Biggest Profit Leak</div>

            <div className="kpi-value" style={{ fontSize: 24 }}>
              {worstProduct ? worstProduct.productTitle : "No data"}
            </div>

            <div className="kpi-note" style={{ color: "#ff6b4a" }}>
              {worstProduct
                ? `${money(Math.abs(worstProduct.profit))} estimated loss`
                : "No issues detected"}
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-label">Best Margin Product</div>

            <div className="kpi-value" style={{ fontSize: 24 }}>
              {bestProduct ? bestProduct.productTitle : "No data"}
            </div>

            <div className="kpi-note" style={{ color: "#22c55e" }}>
              {bestProduct
                ? `${pct(bestProduct.marginPct)} margin`
                : "No products available"}
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-label">Recoverable Profit</div>

            <div className="kpi-value">
              {money(recoverableProfit)}
            </div>

            <div className="kpi-note" style={{ color: "#f59e0b" }}>
              Potential margin recovery
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-label">AVERAGE PRODUCT MARGIN</div>

            <div className="kpi-value">
              {pct(
                sourceRows.length > 0
                  ? sourceRows.reduce((acc, row) => acc + row.marginPct, 0) /
                  sourceRows.length
                  : 0,
              )}
            </div>

            <div className="kpi-note" style={{ color: "#22c55e" }}>
              Across analyzed products
            </div>
          </div>
        </div>

        <TrendChart
          chartData={chartData}
          maxChartValue={maxChartValue}
          revenuePoints={revenuePoints}
          profitPoints={profitPoints}
          visualMarginPct={visualMarginPct}
        />

        <RiskDistribution
          criticalCount={criticalCount}
          warningCount={warningCount}
          missingCount={missingCount}
          healthyCount={healthyCount}
          riskTotal={riskTotal}
        />

        {hasWeakBestSeller ? (
          <div className="insight-panel">
            <div className="insight-header">
              <div>
                <div className="insight-eyebrow">CRITICAL INSIGHT</div>

                <div className="insight-title">
                  Best seller with weak profitability detected
                </div>
              </div>

              <div className="insight-badge warning">
                Low margin
              </div>
            </div>

            <div className="insight-description">
              <strong>{weakBestSeller.productTitle}</strong> generated{" "}
              <strong>{money(weakBestSeller.revenue)}</strong> revenue with only{" "}
              <strong>{pct(weakBestSellerMargin)}</strong> margin.
              This product may be reducing your overall store profitability.
            </div>
          </div>
        ) : null}

        {marginDelta < -3 ? (
          <div className="insight-panel">
            <div className="insight-header">
              <div>
                <div className="insight-eyebrow">
                  MARGIN DETERIORATION
                </div>

                <div className="insight-title">
                  Store profitability is decreasing
                </div>
              </div>

              <div className="insight-badge warning">
                {marginDelta.toFixed(1)}%
              </div>
            </div>

            <div className="insight-description">
              Your store margin dropped from{" "}
              <strong>{pct(summary.previousMarginPct)}</strong> to{" "}
              <strong>{pct(summary.marginPct)}</strong> compared to the previous period.
              Review pricing, discounts and product costs to avoid further margin erosion.
            </div>
          </div>
        ) : null}

        {hasRecoveryOpportunity ? (
          <div className="insight-panel">
            <div className="insight-header">
              <div>
                <div className="insight-eyebrow">
                  RECOVERY OPPORTUNITY
                </div>

                <div className="insight-title">
                  Recover hidden profit from underpriced products
                </div>
              </div>

              <div className="insight-badge warning">
                {money(recoverableProfit)}
              </div>
            </div>

            <div className="insight-description">
              Profit Leak Scanner detected{" "}
              <strong>{recoveryProducts.length} products</strong> with pricing gaps.
              Adjusting prices toward target margins could recover approximately{" "}
              <strong>{money(recoverableProfit)}</strong> in additional profit.
            </div>
          </div>
        ) : null}

        {summary.revenueDeltaPct > 10 && summary.marginDelta < 0 ? (
          <div className="insight-panel">
            <div className="insight-header">
              <div>
                <div className="insight-eyebrow">
                  GROWTH WARNING
                </div>

                <div className="insight-title">
                  Revenue is growing faster than profitability
                </div>
              </div>

              <div className="insight-badge warning">
                {summary.revenueDeltaPct.toFixed(1)}% revenue
              </div>
            </div>

            <div className="insight-description">
              Store revenue increased by{" "}
              <strong>{summary.revenueDeltaPct.toFixed(1)}%</strong>,
              but margin dropped by{" "}
              <strong>{Math.abs(summary.marginDelta).toFixed(1)}%</strong>.
              Rapid growth combined with weakening margins may indicate
              aggressive discounts, rising costs or underpriced best sellers.
            </div>
          </div>
        ) : null}

        <div className="panel" id="leaks-section">
          <div className="section-header">
            <div>
              <div className="section-title">Top Profit Leaks Detected</div>
              <div className="section-subtitle">
                Prioritized issues found from your real Shopify order data.
              </div>
            </div>

            <button className="secondary-orange-button">View all</button>
          </div>

          {topLeaks.length === 0 ? (
            <div className="clean-state">
              ✅ No major profit leaks detected in the selected period.
            </div>
          ) : (
            <div className="leaks-list">
              {topLeaks.map(({ icon, issue, severity, loss }) => (
                <div key={issue} className="leak-row">
                  <div className="leak-main">
                    <div className="leak-icon">{icon}</div>

                    <div>
                      <div className="leak-title">{issue}</div>
                      <div className="leak-subtitle">
                        Margin optimization opportunity detected
                      </div>
                    </div>
                  </div>

                  <div className="leak-severity">
                    <div
                      className="severity-pill"
                      style={{
                        color: severityColor(severity),
                        background: severityBackground(severity),
                        border: severityBorder(severity),
                      }}
                    >
                      {severity}
                    </div>
                  </div>

                  <div className="leak-loss">
                    <div>{loss}</div>
                    <span>estimated impact</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="section-header">
            <div>
              <div className="section-title">
                Margin Breakdown
              </div>

              <div className="section-subtitle">
                Revenue allocation across costs, profit and detected leaks.
              </div>
            </div>
          </div>

          <div className="breakdown-stack">
            {[
              [
                "COGS",
                cogsPercentage,
                "#3b82f6",
              ],

              [
                "Profit",
                profitPercentage,
                "#22c55e",
              ],

              [
                "Leak",
                leakPercentage,
                "#ef4444",
              ],
            ].map(([label, value, color]) => (
              <div key={String(label)} className="breakdown-row">
                <div className="breakdown-header">
                  <div className="breakdown-label">
                    {label}
                  </div>

                  <div className="breakdown-value">
                    {Number(value).toFixed(1)}%
                  </div>
                </div>

                <div className="breakdown-bar">
                  <div
                    className="breakdown-fill"
                    style={{
                      width: `${Math.min(Number(value), 100)}%`,
                      background: String(color),
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <ProductRiskTable
          sortedRiskRows={sortedRiskRows}
          onlyLosing={onlyLosing}
          setOnlyLosing={setOnlyLosing}
          period={period}
          riskLabel={riskLabel}
          riskColor={riskColor}
          riskBackground={riskBackground}
          shopHandle={shopHandle}
        />

        <RecommendationsPanel recommendations={recommendations} />
      </div >
    </div >
  );
}

