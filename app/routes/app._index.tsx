import * as React from "react";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "~/shopify.server";

type Summary = {
  revenue: number;
  cogs: number;
  profit: number;
  marginPct: number;
  totalLeak: number;
  losingCount: number;
  missingCostCount: number;
  previousMarginPct: number;
  marginDelta: number;
  previousRevenue: number;
  revenueDeltaPct: number;
};

type Row = {
  productId: string;
  productTitle: string;
  qty: number;
  revenue: number;
  cogs: number;
  profit: number;
  marginPct: number;
  losing: boolean;
  lowMargin: boolean;
  avgPrice: number;
  avgCost: number;
  breakEvenPrice: number;
  targetPrice: number;
  targetDelta: number;
  suggestion: string;
  missingCost: boolean;
};

type TrendPoint = {
  date: string;
  revenue: number;
  profit: number;
};

type LoaderData = {
  summary: Summary;
  rows: Row[];
  trend: TrendPoint[];
  billingActive: boolean;
  period: string;
  shopHandle: string;
};

function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function pct(n: number) {
  return `${n.toFixed(1)}%`;
}

function toYYYYMMDD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function extractNumericId(gid: string) {
  return gid.split("/").pop() || "";
}

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
    trend.length > 0
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

  const maxRevenue = Math.max(...chartData.map((d) => d.revenue), 1);

  const revenuePoints = chartData
    .map((point, index) => {
      const x =
        chartData.length === 1
          ? 0
          : (index / (chartData.length - 1)) * 1000;

      const y = 240 - (point.revenue / maxRevenue) * 180;

      return `${x},${y}`;
    })
    .join(" ");

  const maxProfit = Math.max(...chartData.map((d) => d.profit), 1);

  const profitPoints = chartData
    .map((point, index) => {
      const x =
        chartData.length === 1
          ? 0
          : (index / (chartData.length - 1)) * 1000;

      const y = 240 - (point.profit / maxProfit) * 180;

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
        <style>{dashboardStyles}</style>

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
      <style>{dashboardStyles}</style>

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

        <div className="score-card">
          <div className="score-glow-one" />
          <div className="score-glow-two" />

          <div className="score-content">
            <div className="section-eyebrow">PROFIT LEAK SCORE</div>

            <div className="score-number">
              {score}
              <span>/100</span>
            </div>

            <div className="score-risk">{scoreLabel}</div>

            <div className="score-copy">
              {visualLeak > 0
                ? `Your store is leaking an estimated ${money(
                  visualLeak,
                )} from products selling below cost.`
                : "Your store currently has no products selling below cost in the selected period."}
            </div>

            <div className="score-mini-grid">
              {[
                ["Estimated leak", money(visualLeak), "#ff5a36"],
                ["Products at risk", `${visualProductsAtRisk} detected`, "#f59e0b"],
                ["Margin", pct(visualMarginPct), "#22c55e"],
              ].map(([label, value, color]) => (
                <div key={label} className="score-mini-card">
                  <div>{label}</div>
                  <strong style={{ color }}>{value}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="gauge-card">
            <div className="gauge-glow" />

            <div className="gauge">
              <svg width="170" height="170" viewBox="0 0 220 220">
                <circle
                  cx="110"
                  cy="110"
                  r="84"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="14"
                  fill="none"
                />

                <circle
                  cx="110"
                  cy="110"
                  r="84"
                  stroke="#ff5a36"
                  strokeWidth="14"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray="528"
                  strokeDashoffset={528 - (528 * score) / 100}
                  style={{
                    filter: "drop-shadow(0 0 14px rgba(255,90,54,0.45))",
                  }}
                />
              </svg>

              <div className="gauge-center">
                <div>{score}</div>
                <span>{scoreLabel.toUpperCase()}</span>
              </div>
            </div>

            <div className="gauge-copy">
              Margin health score based on profit leaks, missing costs, low margins and store
              profitability.
            </div>
          </div>
        </div>

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

        <div className="panel">
          <div className="section-header">
            <div>
              <div className="section-title">Profit Trend</div>
              <div className="section-subtitle">
                Current profit performance based on Shopify orders.
              </div>
            </div>

            <div className="positive-trend">
              {pct(visualMarginPct)} margin
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-labels">
              <span>Revenue</span>
              <span>COGS</span>
              <span>Profit</span>
            </div>

            <svg viewBox="0 0 1000 260" preserveAspectRatio="none" className="chart-svg">
              <defs>
                <linearGradient id="lineGradient" x1="0" x2="1">
                  <stop offset="0%" stopColor="#ff7b59" />
                  <stop offset="100%" stopColor="#ff5a36" />
                </linearGradient>

                <linearGradient id="fillGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgba(255,123,89,0.35)" />
                  <stop offset="100%" stopColor="rgba(255,123,89,0)" />
                </linearGradient>
              </defs>

              <polyline
                fill="rgba(255,123,89,0.12)"
                stroke="none"
                points={`0, 260 ${revenuePoints} 1000, 260`}
              />

              <polyline
                fill="none"
                stroke="url(#lineGradient)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={revenuePoints}
              />

              <polyline
                fill="none"
                stroke="rgba(34,197,94,0.95)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={profitPoints}
                style={{
                  filter: "drop-shadow(0 0 10px rgba(34,197,94,0.35))",
                }}
              />

            </svg>

            <div className="chart-overlay" />
          </div>
        </div>

        <div className="panel">
          <div className="section-header">
            <div>
              <div className="section-title">
                Risk Distribution
              </div>

              <div className="section-subtitle">
                Real-time catalog health overview based on margin analysis.
              </div>
            </div>
          </div>

          <div className="risk-distribution">
            {[
              [
                "Critical",
                criticalCount,
                "#ef4444",
              ],

              [
                "Low Margin",
                warningCount,
                "#f59e0b",
              ],

              [
                "Missing Cost",
                missingCount,
                "#3b82f6",
              ],

              [
                "Healthy",
                healthyCount,
                "#22c55e",
              ],
            ].map(([label, value, color]) => {
              const percentage =
                (Number(value) / riskTotal) * 100;

              return (
                <div key={String(label)} className="risk-block">
                  <div className="risk-block-top">
                    <div
                      className="risk-dot"
                      style={{ background: String(color) }}
                    />

                    <div className="risk-label">
                      {label}
                    </div>

                    <div className="risk-value">
                      {String(value)}
                    </div>
                  </div>

                  <div className="risk-bar">
                    <div
                      className="risk-fill"
                      style={{
                        width: `${percentage}%`,
                        background: String(color),
                      }}
                    />
                  </div>

                  <div className="risk-percent">
                    {percentage.toFixed(0)}% of products
                  </div>
                </div>
              );
            })}
          </div>
        </div>

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

        <div className="panel" id="products-section">
          <div className="section-header">
            <div>
              <div className="section-title">Product Risk Table</div>
              <div className="section-subtitle">
                Products ranked by real margin risk and potential profit leaks.
              </div>

              <div className="table-filters">
                <button
                  className={onlyLosing ? "table-filter-btn" : "table-filter-btn active"}
                  onClick={() => setOnlyLosing(false)}
                >
                  All products
                </button>

                <button
                  className={onlyLosing ? "table-filter-btn active" : "table-filter-btn"}
                  onClick={() => setOnlyLosing(true)}
                >
                  Losing only
                </button>
              </div>
            </div>

            <button className="secondary-button">Export CSV</button>
          </div>

          {sortedRiskRows.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📦</div>

              <div className="empty-title">No products analyzed yet</div>

              <div className="empty-copy">
                Once orders are available, Profit Leak Scanner will detect products selling below
                cost, missing costs and margin issues.
              </div>

              <button className="empty-button">Run first analysis</button>
            </div>
          ) : (
            <>
              <div className="desktop-table-wrapper">
                <table className="product-table">
                  <thead>
                    <tr>
                      {[
                        "Product",
                        "Revenue",
                        "COGS",
                        "Profit",
                        "Target Price",
                        "Delta",
                        "Margin",
                        "Risk",
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {sortedRiskRows.map((row) => (
                      <React.Fragment key={row.productTitle}>
                        <tr>
                          <td>
                            <div className="product-name-cell">
                              <div className="product-icon">📦</div>

                              <div>
                                <div className="product-name">{row.productTitle}</div>
                                <div className="product-subtitle">
                                  Avg price {money(row.avgPrice)} • Avg cost{" "}
                                  {money(row.avgCost)}
                                  {row.missingCost && row.productId ? (
                                    <>
                                      {" "}
                                      •{" "}
                                      <a
                                        href={`https://admin.shopify.com/store/${shopHandle}/products/${row.productId}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="shopify-link"
                                      >
                                        Set cost
                                      </a >
                                    </>
                                  ) : null}
                                </div >
                              </div >
                            </div >
                          </td >

                          <td>{money(row.revenue)}</td>

                          <td>{money(row.cogs)}</td>

                          <td style={{ color: row.profit < 0 ? "#ef4444" : "#22c55e" }}>
                            {money(row.profit)}
                          </td>

                          <td>{money(row.targetPrice)}</td>

                          <td
                            style={{
                              color: row.targetDelta > 0 ? "#ff6b4a" : "#22c55e",
                              fontWeight: 900,
                            }}
                          >
                            {row.targetDelta > 0 ? "↑ " : "↓ "}
                            {money(row.targetDelta)}
                          </td>

                          <td>{pct(row.marginPct)}</td>

                          <td>
                            <span
                              className="risk-pill"
                              style={{
                                color: riskColor(row),
                                background: riskBackground(row),
                              }}
                            >
                              {riskLabel(row)}
                            </span>
                          </td>
                        </tr >

                        {(row.losing || row.targetDelta > 0) && (
                          <tr>
                            <td colSpan={8}>
                              <div className="desktop-suggestion">
                                <div className="suggestion-title">AI Suggestion</div>

                                <div className="suggestion-copy">{row.suggestion}</div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment >
                    ))}
                  </tbody >
                </table >
              </div >

              <div className="mobile-products">
                {sortedRiskRows.map((row) => (
                  <div key={row.productTitle} className="mobile-product-card">
                    <div className="mobile-product-header">
                      <div className="product-name-cell">
                        <div className="product-icon">📦</div>

                        <div>
                          <div className="product-name">{row.productTitle}</div>
                          <div className="product-subtitle">
                            Avg price {money(row.avgPrice)}
                          </div>
                        </div>
                      </div>

                      <span
                        className="risk-pill"
                        style={{
                          color: riskColor(row),
                          background: riskBackground(row),
                        }}
                      >
                        {riskLabel(row)}
                      </span>
                    </div>

                    <div className="mobile-product-grid">
                      <div>
                        <span>Revenue</span>
                        <strong>{money(row.revenue)}</strong>
                      </div>

                      <div>
                        <span>COGS</span>
                        <strong>{money(row.cogs)}</strong>
                      </div>

                      <div>
                        <span>Profit</span>
                        <strong>{money(row.profit)}</strong>
                      </div>

                      <div>
                        <span>Target</span>
                        <strong>{money(row.targetPrice)}</strong>
                      </div>

                      <div>
                        <span>Delta</span>
                        <strong>{money(row.targetDelta)}</strong>
                      </div>

                      <div>
                        <span>Margin</span>
                        <strong>{pct(row.marginPct)}</strong>
                      </div>
                    </div>

                    <div className="mobile-suggestion">
                      <div className="suggestion-title">AI Suggestion</div>

                      <div className="suggestion-copy">{row.suggestion}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div >

        <div className="ai-panel" id="recommendations-section">
          <div className="ai-glow" />

          <div className="section-header ai-header">
            <div>
              <div className="ai-eyebrow">AI Recommendations</div>

              <div className="ai-title">Smart margin optimization suggestions</div>
            </div>

            <div className="ai-badge">
              LIVE ANALYSIS
            </div>
          </div>

          <div className="ai-grid">
            {recommendations.map(({ title, impact, confidence }) => (
              <div key={title} className="ai-card">
                <div className="ai-card-top">
                  <div className="ai-priority">HIGH PRIORITY</div>

                  <div className="ai-confidence-inline">
                    {confidence}
                  </div>
                </div>

                <div className="ai-card-title">
                  {title}
                </div>

                <div className="ai-impact">
                  {impact}
                </div>

                <div className="ai-recommendation">
                  Recommended action: review pricing strategy and optimize margins.
                </div>

                <div className="ai-footer">
                  <div>
                    <div className="confidence-label">
                      Analysis status
                    </div>

                    <div className="confidence-value">
                      Live monitoring active
                    </div>
                  </div>

                  <button className="apply-button">
                    Review insight
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div >
    </div >
  );
}

const dashboardStyles = `
  @keyframes gradientMove {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }

  @keyframes pulse {
    0% { opacity: 0.45; }
    50% { opacity: 1; }
    100% { opacity: 0.45; }
  }

  * { box-sizing: border-box; }

  .dashboard-shell {
    min-height: 100vh;
    background:
      radial-gradient(circle at top left, rgba(255,80,40,0.16), transparent 30%),
      radial-gradient(circle at bottom right, rgba(255,90,54,0.10), transparent 24%),
      linear-gradient(180deg, #071019 0%, #0b111b 100%);
    background-size: 120% 120%;
    animation: gradientMove 18s ease infinite;
    padding: 32px;
    color: #f3f4f6;
    font-family: Inter, system-ui, sans-serif;
    position: relative;
    overflow-x: hidden;
  }

  .loading-shell {
    background: linear-gradient(180deg, #071019 0%, #0b111b 100%);
    animation: none;
  }

  .dashboard-container {
    max-width: 1400px;
    margin: 0 auto;
    position: relative;
    z-index: 2;
  }

  .loading-stack {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .loading-navbar,
  .loading-hero,
  .loading-kpi-card {
    border-radius: 24px;
    background: rgba(255,255,255,0.05);
    animation: pulse 1.8s infinite;
  }

  .loading-navbar { height: 80px; }
  .loading-hero { height: 340px; border-radius: 32px; }

  .loading-kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 18px;
  }

  .loading-kpi-card { height: 140px; }

  .navbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    margin-bottom: 28px;
    padding: 14px 16px;
    border-radius: 18px;
    background: rgba(255,255,255,0.045);
    border: 1px solid rgba(255,255,255,0.08);
  }

  .logo {
    font-weight: 900;
    letter-spacing: 0.5px;
    white-space: nowrap;
  }

  .logo span { color: #ff5a36; }

  .nav-tabs {
    display: flex;
    gap: 10px;
    align-items: center;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .nav-tabs::-webkit-scrollbar { display: none; }

  .nav-tab {
    padding: 10px 14px;
    border-radius: 12px;
    font-weight: 800;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
    background: transparent;
    border: 1px solid transparent;
    color: rgba(255,255,255,0.72);
    white-space: nowrap;
  }

  .nav-tab:hover { background: rgba(255,255,255,0.05); }

  .nav-tab.active {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.08);
    color: #ffffff;
  }

  .hero-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    margin-bottom: 28px;
  }

  .alert-pill {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    border-radius: 999px;
    background: rgba(255,90,54,0.12);
    border: 1px solid rgba(255,90,54,0.16);
    margin-bottom: 18px;
    font-size: 13px;
    font-weight: 800;
    color: #ff7b59;
    letter-spacing: 0.3px;
  }

  .alert-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ff5a36;
    box-shadow: 0 0 10px rgba(255,90,54,0.8);
  }

  .eyebrow {
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 1px;
    opacity: 0.7;
    text-transform: uppercase;
  }

  .hero-title {
    font-size: 46px;
    font-weight: 900;
    margin-top: 8px;
    line-height: 1.05;
  }

  .hero-description {
    margin-top: 12px;
    opacity: 0.78;
    font-size: 18px;
    max-width: 760px;
    line-height: 1.6;
  }

  .period-tabs {
    display: inline-flex;
    margin-top: 18px;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 14px;
    overflow: hidden;
    background: rgba(255,255,255,0.04);
  }

  .period-tab {
    padding: 9px 14px;
    background: transparent;
    border: none;
    color: rgba(255,255,255,0.65);
    font-weight: 900;
    cursor: pointer;
  }

  .period-tab.active {
    background: rgba(255,255,255,0.1);
    color: #ffffff;
  }

  .primary-button {
    background: linear-gradient(135deg,#ff5a36 0%,#ff7b59 100%);
    border: 1px solid rgba(255,255,255,0.08);
    color: white;
    font-weight: 900;
    padding: 15px 22px;
    border-radius: 16px;
    cursor: pointer;
    font-size: 15px;
    display: flex;
    align-items: center;
    gap: 10px;
    box-shadow: 0 14px 34px rgba(255,90,54,0.28);
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .primary-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 20px 44px rgba(255,90,54,0.34);
  }

  .billing-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 24px;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(59,130,246,0.10);
  border: 1px solid rgba(59,130,246,0.20);
  color: #e5edff;
}

.billing-banner span {
  opacity: 0.82;
  flex: 1;
  color: #c7d7ff;
}

.billing-banner strong {
  color: #93c5fd;
}

.billing-banner button {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.10);
  color: white;
  border-radius: 12px;
  padding: 9px 13px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s ease;
}

.billing-banner button:hover {
  background: rgba(255,255,255,0.10);
}

  .score-card {
    background: linear-gradient(135deg, rgba(255,90,54,0.16), rgba(15,23,42,0.92));
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 28px;
    padding: 32px;
    box-shadow: 0 24px 80px rgba(0,0,0,0.35);
    position: relative;
    overflow: hidden;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 28px;
    margin-bottom: 24px;
  }

  .score-glow-one {
    position: absolute;
    top: -180px;
    right: -120px;
    width: 420px;
    height: 420px;
    border-radius: 50%;
    background: rgba(255,255,255,0.05);
    filter: blur(70px);
    pointer-events: none;
  }

  .score-glow-two {
    position: absolute;
    bottom: -120px;
    left: -120px;
    width: 320px;
    height: 320px;
    border-radius: 50%;
    background: rgba(255,90,54,0.08);
    filter: blur(60px);
    pointer-events: none;
  }

  .score-content {
    position: relative;
    z-index: 2;
  }

  .section-eyebrow {
    opacity: 0.7;
    font-size: 14px;
    font-weight: 700;
  }

  .score-number {
    font-size: 72px;
    font-weight: 900;
    margin-top: 16px;
  }

  .score-number span {
    font-size: 28px;
    opacity: 0.55;
  }

  .score-risk {
    color: #ff6b4a;
    font-weight: 800;
    font-size: 20px;
    margin-top: 4px;
  }

  .score-copy {
    margin-top: 14px;
    font-size: 17px;
    opacity: 0.78;
    max-width: 560px;
    line-height: 1.6;
  }

  .score-mini-grid {
    display: flex;
    gap: 28px;
    margin-top: 26px;
    flex-wrap: wrap;
    padding-top: 18px;
    border-top: 1px solid rgba(255,255,255,0.08);
  }

  .score-mini-card {
    min-width: 160px;
  }

  .score-mini-card div {
    font-size: 12px;
    opacity: 0.5;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    font-weight: 700;
  }

  .score-mini-card strong {
    display: block;
    margin-top: 8px;
    font-size: 28px;
    font-weight: 900;
    line-height: 1;
  }

  .gauge-card {
    background: rgba(0,0,0,0.22);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 22px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
    z-index: 2;
  }

  .gauge-glow {
    position: absolute;
    width: 240px;
    height: 240px;
    border-radius: 50%;
    background: rgba(255,90,54,0.1);
    filter: blur(50px);
  }

  .gauge {
    position: relative;
    width: 170px;
    height: 170px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .gauge svg {
    position: absolute;
    transform: rotate(-90deg);
  }

  .gauge-center {
    position: relative;
    text-align: center;
  }

  .gauge-center div {
    font-size: 42px;
    font-weight: 900;
    line-height: 1;
  }

  .gauge-center span {
    display: block;
    margin-top: 8px;
    color: #ff7b59;
    font-weight: 800;
    letter-spacing: 1px;
    font-size: 12px;
  }

  .gauge-copy {
    margin-top: 8px;
    font-size: 14px;
    opacity: 0.62;
    text-align: center;
    max-width: 280px;
    line-height: 1.6;
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 18px;
    margin-bottom: 24px;
  }

  .kpi-card {
    background: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.035));
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 22px;
    padding: 22px;
    box-shadow: 0 18px 50px rgba(0,0,0,0.18);
    transition: all 0.22s ease;
    cursor: pointer;
  }

  .kpi-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 28px 70px rgba(0,0,0,0.28);
    border: 1px solid rgba(255,255,255,0.16);
  }

  .kpi-label {
    font-size: 12px;
    opacity: 0.62;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }

  .kpi-value {
    font-size: 34px;
    font-weight: 900;
    margin-top: 14px;
  }

  .kpi-note {
    margin-top: 8px;
    font-weight: 800;
    font-size: 14px;
  }

  .panel {
    background: rgba(255,255,255,0.045);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 26px;
    padding: 26px;
    margin-bottom: 24px;
    box-shadow: 0 22px 70px rgba(0,0,0,0.22);
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 18px;
    margin-bottom: 24px;
  }

  .section-title {
    font-size: 24px;
    font-weight: 850;
    letter-spacing: -0.4px;
  }

  .section-subtitle {
    opacity: 0.62;
    margin-top: 6px;
    line-height: 1.5;
  }

  .positive-trend {
    color: #22c55e;
    font-weight: 800;
    font-size: 15px;
    white-space: nowrap;
  }

  .table-filters {
    display: flex;
    gap: 10px;
    margin-top: 16px;
    flex-wrap: wrap;
  }

  .table-filter-btn {
    padding: 10px 14px;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.04);
    color: rgba(255,255,255,0.72);
    font-weight: 800;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .table-filter-btn:hover {
    background: rgba(255,255,255,0.08);
  }

  .table-filter-btn.active {
    background: rgba(255,255,255,0.12);
    color: #ffffff;
    border: 1px solid rgba(255,255,255,0.14);
  }

  .chart-card {
    height: 260px;
    border-radius: 20px;
    background: linear-gradient(180deg, rgba(255,90,54,0.12), rgba(255,255,255,0.02));
    border: 1px solid rgba(255,255,255,0.06);
    position: relative;
    overflow: hidden;
    padding: 24px;
  }

  .chart-labels {
    position: absolute;
    top: 22px;
    left: 24px;
    right: 24px;
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: rgba(255,255,255,0.38);
    z-index: 2;
  }

  .chart-svg {
    width: 100%;
    height: 100%;
  }

  .chart-overlay {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at top, rgba(255,255,255,0.08), transparent 60%);
    pointer-events: none;
  }

  .secondary-orange-button,
  .secondary-button {
    padding: 10px 14px;
    border-radius: 12px;
    font-weight: 800;
    cursor: pointer;
    white-space: nowrap;
  }

  .secondary-orange-button {
    background: rgba(255,90,54,0.14);
    border: 1px solid rgba(255,90,54,0.35);
    color: #ff7b59;
  }

  .secondary-button {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    color: #f3f4f6;
  }

  .clean-state {
    padding: 22px;
    border-radius: 18px;
    background: rgba(34,197,94,0.08);
    border: 1px solid rgba(34,197,94,0.14);
    color: #86efac;
    font-weight: 800;
  }

  .leak-row {
    display: grid;
    grid-template-columns: minmax(0,1fr) 100px 150px;
    gap: 16px;
    align-items: center;
    padding: 18px 0;
    border-top: 1px solid rgba(255,255,255,0.07);
  }

  .leak-main {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }

  .leak-icon,
  .product-icon {
    width: 44px;
    height: 44px;
    border-radius: 14px;
    background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    border: 1px solid rgba(255,255,255,0.08);
    box-shadow: 0 10px 24px rgba(0,0,0,0.18);
    flex-shrink: 0;
  }

  .leak-title {
    font-weight: 800;
    font-size: 15px;
    letter-spacing: 0.1px;
  }

  .leak-subtitle {
    opacity: 0.5;
    margin-top: 4px;
    font-size: 13px;
  }

  .severity-pill {
    display: inline-flex;
    padding: 7px 12px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 0.3px;
  }

  .leak-loss {
    justify-self: end;
    text-align: right;
  }

  .leak-loss div {
    font-weight: 900;
    font-size: 18px;
  }

  .leak-loss span {
    display: block;
    font-size: 12px;
    opacity: 0.45;
    margin-top: 4px;
  }

  .empty-state {
    padding: 80px 20px;
    text-align: center;
  }

  .empty-icon {
    width: 84px;
    height: 84px;
    margin: 0 auto;
    border-radius: 24px;
    background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 34px;
    border: 1px solid rgba(255,255,255,0.08);
  }

  .empty-title {
    margin-top: 24px;
    font-size: 24px;
    font-weight: 900;
    letter-spacing: -0.4px;
  }

  .empty-copy {
    margin-top: 12px;
    opacity: 0.58;
    max-width: 460px;
    margin-inline: auto;
    line-height: 1.7;
  }

  .empty-button {
    margin-top: 28px;
    background: linear-gradient(135deg,#ff5a36 0%,#ff7b59 100%);
    border: none;
    color: white;
    font-weight: 900;
    padding: 14px 20px;
    border-radius: 14px;
    cursor: pointer;
    font-size: 14px;
    box-shadow: 0 14px 34px rgba(255,90,54,0.25);
  }

  .desktop-table-wrapper {
    overflow-x: auto;
  }

  .product-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 920px;
  }

  .product-table th {
    text-align: left;
    padding: 14px 12px;
    font-size: 12px;
    opacity: 0.55;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }

  .product-table td {
    padding: 18px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    opacity: 0.86;
    font-weight: 700;
  }

  .product-table tr {
    transition: all 0.18s ease;
    cursor: pointer;
  }

  .product-table tbody tr:hover {
    background: linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015));
  }

  .product-name-cell {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .product-icon {
    width: 42px;
    height: 42px;
  }

  .product-name {
    font-weight: 800;
    font-size: 15px;
  }

  .product-subtitle {
    margin-top: 4px;
    font-size: 12px;
    opacity: 0.48;
  }

  .risk-pill {
    display: inline-flex;
    padding: 7px 11px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 900;
    white-space: nowrap;
  }

  .shopify-link {
    color: #fbbf24;
    text-decoration: none;
    font-weight: 900;
  }

  .price-delta {
    color: #ff6b4a;
    font-weight: 900;
  }

  .desktop-suggestion {
    padding: 18px 20px;
    background: rgba(255,90,54,0.06);
    border-top: 1px solid rgba(255,255,255,0.04);
  }

  .suggestion-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1px;
    font-weight: 900;
    opacity: 0.5;
  }

  .suggestion-copy {
    margin-top: 10px;
    line-height: 1.7;
    color: rgba(255,255,255,0.82);
  }

  .mobile-products {
    display: none;
  }

  .mobile-suggestion {
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px solid rgba(255,255,255,0.08);
  }

  .ai-panel {
    background: linear-gradient(135deg, rgba(34,197,94,0.08), rgba(255,255,255,0.03));
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 26px;
    padding: 28px;
    margin-bottom: 24px;
    box-shadow: 0 22px 70px rgba(0,0,0,0.22);
    position: relative;
    overflow: hidden;
  }

  .ai-glow {
    position: absolute;
    top: -120px;
    right: -120px;
    width: 260px;
    height: 260px;
    border-radius: 50%;
    background: rgba(34,197,94,0.08);
    filter: blur(40px);
  }

  .ai-header {
    position: relative;
    z-index: 2;
    margin-bottom: 26px;
  }

  .ai-eyebrow {
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 1px;
    opacity: 0.58;
    text-transform: uppercase;
  }

  .ai-title {
    font-size: 30px;
    font-weight: 900;
    margin-top: 10px;
    line-height: 1.1;
  }

  .ai-badge {
    padding: 10px 14px;
    border-radius: 999px;
    background: rgba(34,197,94,0.12);
    color: #22c55e;
    font-weight: 900;
    font-size: 13px;
    border: 1px solid rgba(34,197,94,0.18);
    white-space: nowrap;
  }

  .ai-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 18px;
    position: relative;
    z-index: 2;
  }

  .ai-card {
    background: rgba(255,255,255,0.045);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 20px;
    padding: 22px;
    transition: all 0.2s ease;
    cursor: pointer;
  }

  .ai-card:hover {
    transform: translateY(-4px);
    border: 1px solid rgba(255,255,255,0.14);
  }

  .ai-card-title {
    font-size: 17px;
    font-weight: 800;
    line-height: 1.45;
  }

  .ai-impact {
    margin-top: 16px;
    color: #22c55e;
    font-weight: 900;
    font-size: 22px;
  }

  .ai-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 14px;
    margin-top: 18px;
    padding-top: 16px;
    border-top: 1px solid rgba(255,255,255,0.08);
  }

  .ai-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.ai-priority {
  padding: 7px 10px;
  border-radius: 999px;
  background: rgba(255,90,54,0.14);
  border: 1px solid rgba(255,90,54,0.24);
  color: #ff7b59;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.7px;
}

.ai-confidence-inline {
  color: rgba(255,255,255,0.55);
  font-size: 12px;
  font-weight: 800;
}

.ai-recommendation {
  margin-top: 14px;
  padding: 14px;
  border-radius: 14px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.72);
  line-height: 1.55;
  font-size: 13px;
}

  .confidence-label {
    font-size: 11px;
    opacity: 0.45;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    font-weight: 800;
  }

  .confidence-value {
    margin-top: 6px;
    font-size: 13px;
    font-weight: 800;
    color: #f3f4f6;
  }

  .apply-button {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.08);
    color: #ffffff;
    padding: 10px 14px;
    border-radius: 12px;
    font-weight: 800;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .apply-button:hover {
    background: rgba(255,255,255,0.1);
  }

  .insight-panel {
  position: relative;
  overflow: hidden;
  margin-top: 22px;
  margin-bottom: 22px;
  padding: 28px;
  border-radius: 28px;
  border: 1px solid rgba(255,255,255,0.08);
  background:
    linear-gradient(135deg, rgba(255,90,54,0.14), rgba(8,15,28,0.96));
  box-shadow:
    0 10px 40px rgba(0,0,0,0.35),
    inset 0 1px 0 rgba(255,255,255,0.04);
}

.insight-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.insight-eyebrow {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.18em;
  color: #ff8a6b;
  margin-bottom: 10px;
}

.insight-title {
  font-size: 28px;
  line-height: 1.1;
  font-weight: 800;
  color: #ffffff;
  max-width: 700px;
}

.insight-description {
  margin-top: 18px;
  font-size: 16px;
  line-height: 1.7;
  color: rgba(255,255,255,0.74);
  max-width: 900px;
}

.insight-description strong {
  color: #ffffff;
}

.insight-badge {
  flex-shrink: 0;
  padding: 10px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
}

.insight-badge.warning {
  background: rgba(255,90,54,0.16);
  border: 1px solid rgba(255,90,54,0.28);
  color: #ff8a6b;
}

.risk-distribution {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 18px;
}

.risk-block {
  background: rgba(255,255,255,0.035);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 20px;
  padding: 18px;
}

.risk-block-top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.risk-dot {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  flex-shrink: 0;
}

.risk-label {
  font-weight: 800;
  font-size: 14px;
}

.risk-value {
  margin-left: auto;
  font-size: 24px;
  font-weight: 900;
}

.risk-bar {
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255,255,255,0.06);
  margin-top: 16px;
}

.risk-fill {
  height: 100%;
  border-radius: 999px;
}

.risk-percent {
  margin-top: 10px;
  font-size: 12px;
  opacity: 0.58;
  font-weight: 700;
}

  @media (max-width: 900px) {
    .dashboard-shell { padding: 22px; }

    .navbar {
      align-items: flex-start;
      flex-direction: column;
    }

    .nav-tabs {
      width: 100%;
      padding-bottom: 2px;
    }

    .hero-header {
      flex-direction: column;
    }

    .primary-button {
      width: 100%;
      justify-content: center;
    }

    .hero-title { font-size: 38px; }
    .hero-description { font-size: 16px; }

    .section-header {
      align-items: flex-start;
      flex-direction: column;
    }

    .positive-trend,
    .secondary-button,
    .secondary-orange-button {
      align-self: flex-start;
    }

    .loading-kpi-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .leak-row {
      grid-template-columns: 1fr;
      gap: 12px;
      padding: 18px 0;
    }

    .leak-severity {
      justify-self: start;
    }

    .leak-loss {
      justify-self: start;
      text-align: left;
    }

    .score-number { font-size: 58px; }

    .ai-footer {
      align-items: flex-start;
      flex-direction: column;
    }

    .apply-button {
      width: 100%;
    }

    .billing-banner {
      align-items: flex-start;
      flex-direction: column;
    }
  }

  @media (max-width: 640px) {
    .dashboard-shell { padding: 16px; }

    .navbar,
    .panel,
    .ai-panel,
    .score-card {
      border-radius: 22px;
    }

    .score-card {
      padding: 22px;
      grid-template-columns: 1fr;
    }

    .hero-title { font-size: 32px; }

    .alert-pill {
      font-size: 12px;
      align-items: flex-start;
    }

    .kpi-grid {
      grid-template-columns: 1fr;
    }

    .loading-kpi-grid {
      grid-template-columns: 1fr;
    }

    .chart-card {
      height: 220px;
      padding: 18px;
    }

    .desktop-table-wrapper {
      display: none;
    }

    .mobile-products {
      display: grid;
      gap: 14px;
    }

    .mobile-product-card {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 18px;
      padding: 16px;
    }

    .mobile-product-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
    }

    .mobile-product-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;
      margin-top: 18px;
      padding-top: 16px;
      border-top: 1px solid rgba(255,255,255,0.08);
    }

    .mobile-product-grid span {
      display: block;
      font-size: 11px;
      opacity: 0.45;
      text-transform: uppercase;
      letter-spacing: 0.7px;
      font-weight: 800;
    }

    .mobile-product-grid strong {
      display: block;
      margin-top: 6px;
      font-size: 15px;
    }

    .ai-title { font-size: 24px; }

    .ai-grid {
      grid-template-columns: 1fr;
    }

    .score-mini-grid {
      gap: 18px;
    }

    .score-mini-card {
      min-width: 130px;
    }

    .score-mini-card strong {
      font-size: 23px;
    }

    
  }
`;