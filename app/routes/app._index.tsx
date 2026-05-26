import * as React from "react";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "~/shopify.server";

import dashboardStylesUrl from "~/styles/dashboard.css?url";

import ScoreCard from "~/components/dashboard/ScoreCard";
import TrendChart from "~/components/dashboard/TrendChart";
import RiskDistribution from "~/components/dashboard/RiskDistribution";
import ProductRiskTable from "~/components/dashboard/ProductRiskTable";
import RecommendationsPanel from "~/components/dashboard/RecommendationsPanel";
import InsightsPanel from "~/components/dashboard/InsightsPanel";
import KpiGrid from "~/components/dashboard/KpiGrid";
import TopLeaksPanel from "~/components/dashboard/TopLeaksPanel";
import MarginBreakdown from "~/components/dashboard/MarginBreakdown";
import DashboardHero from "~/components/dashboard/DashboardHero";
import AiInsightsCenter from "~/components/dashboard/AiInsightsCenter";

import { loadMarginDashboardData } from "~/utils/margin.server";

import {
  type LoaderData,
  type Row,
  money,
  pct,
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
  });
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
      productTitle: "Premium Oversized Hoodie",
      qty: 124,
      revenue: 28420,
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
      productTitle: "Recovery Compression Leggings",
      qty: 86,
      revenue: 18460,
      cogs: 3740,
      profit: -4280,
      marginPct: -19.8,
      losing: true,
      lowMargin: false,
      avgPrice: 36,
      avgCost: 43,
      breakEvenPrice: 43,
      targetPrice: 54,
      targetDelta: 32,
      suggestion: "Product is selling below cost.",
      missingCost: false,
    },
    {
      productId: "3",
      productTitle: "Minimalist Travel Backpack",
      qty: 42,
      revenue: 32680,
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
      productTitle: "Performance Running Shoes",
      qty: 58,
      revenue: 41720,
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
    visualRevenue > 0 ? (visualProfit / visualRevenue) * 100 : 0;

  const cogsPercentage =
    visualRevenue > 0 ? (visualCogs / visualRevenue) * 100 : 0;

  const leakPercentage =
    visualRevenue > 0 ? (visualLeak / visualRevenue) * 100 : 0;

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
    weakBestSeller && weakBestSeller.revenue > 1000 && weakBestSellerMargin < 30;

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
      ? [...sourceRows]
        .filter((row) => !row.missingCost)
        .sort((a, b) => b.marginPct - a.marginPct)[0] ?? null
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
          } underpriced products selling below cost`,
        impact: `${money(visualLeak)} potential recovery`,
        confidence: "High confidence", actionLabel: "Review pricing",
        actionLink: "#products-section",

      }
      : null,
    summary.missingCostCount > 0
      ? {
        title: "Update missing product costs in Shopify",
        impact: `${summary.missingCostCount} products affected`,
        confidence: "Critical issue",
        actionLabel: "Update costs",
        actionLink: "#products-section",
      }
      : null,
    lowMarginCount > 0
      ? {
        title: "Review low-margin products below 10%",
        impact: `${lowMarginCount} products need attention`,
        confidence: "Medium confidence",
        actionLabel: "Analyze products",
        actionLink: "#products-section",
      }
      : null,
    rows.length > 0
      ? {
        title: "Review target prices for worst-performing products",
        impact: "20% margin target available",
        confidence: "Rule-based insight",
        actionLabel: "Review",
        actionLink: "#products-section",
      }
      : null,
  ].filter(Boolean) as {
    title: string;
    impact: string;
    confidence: string;
    actionLabel: string;
    actionLink: string;
  }[];

  const insights = [
    hasWeakBestSeller
      ? {
        eyebrow: "CRITICAL INSIGHT",
        title: "Your best-selling product may be reducing profitability",
        badge: "Low margin",
        description: (
          <>
            <strong>{weakBestSeller.productTitle}</strong> generated{" "}
            <strong>{money(weakBestSeller.revenue)}</strong> revenue with only{" "}
            <strong>{pct(weakBestSellerMargin)}</strong> margin. This product may be reducing
            your overall store profitability.
          </>
        ),
      }
      : null,
    marginDelta < -3
      ? {
        eyebrow: "MARGIN DETERIORATION",
        title: "Store profitability is decreasing",
        badge: `${marginDelta.toFixed(1)}%`,
        description: (
          <>
            Your store margin dropped from{" "}
            <strong>{pct(summary.previousMarginPct)}</strong> to{" "}
            <strong>{pct(summary.marginPct)}</strong> compared to the previous period. Review
            pricing, discounts and product costs to avoid further margin erosion.
          </>
        ),
      }
      : null,
    hasRecoveryOpportunity
      ? {
        eyebrow: "RECOVERY OPPORTUNITY",
        title: "MarginLab detected recoverable profit opportunities",
        badge: money(recoverableProfit),
        description: (
          <>
            Profit Leak Scanner detected{" "}
            <strong>{recoveryProducts.length} products</strong> with pricing gaps. Adjusting
            prices toward target margins could recover approximately{" "}
            <strong>{money(recoverableProfit)}</strong> in additional profit.
          </>
        ),
      }
      : null,
    summary.revenueDeltaPct > 10 && summary.marginDelta < 0
      ? {
        eyebrow: "GROWTH WARNING",
        title: "Revenue growth is outpacing margin growth",
        badge: `${summary.revenueDeltaPct.toFixed(1)}% revenue`,
        description: (
          <>
            Store revenue increased by{" "}
            <strong>{summary.revenueDeltaPct.toFixed(1)}%</strong>, but margin dropped by{" "}
            <strong>{Math.abs(summary.marginDelta).toFixed(1)}%</strong>. Rapid growth combined
            with weakening margins may indicate aggressive discounts, rising costs or underpriced
            best sellers.
          </>
        ),
      }
      : null,
  ].filter(Boolean);

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
        <DashboardHero
          period={period}
          setPeriod={setPeriod}
          navigate={navigate}
          scrollToSection={scrollToSection}
          analysisLoading={analysisLoading}
          analysisText={analysisText}
          analysisSteps={analysisSteps}
          setAnalysisLoading={setAnalysisLoading}
          setAnalysisText={setAnalysisText}
        />

        {/* {!billingActive ? (
  <div className="billing-banner">
    <div>
      <strong>Margin Intelligence preview mode</strong>

      <span>
        Activate your plan to unlock full margin analysis, product risk detection,
        pricing insights and recovery opportunities.
      </span>
    </div>

    <button onClick={() => navigate("/app/billing")}>
      Activate plan
    </button>
  </div>
) : null} */}

        <ScoreCard
          score={score}
          scoreLabel={scoreLabel}
          visualLeak={visualLeak}
          visualProductsAtRisk={visualProductsAtRisk}
          visualMarginPct={visualMarginPct}
        />

        <section className="ai-insights-center">
          <h1>AI INSIGHTS TEST</h1>
        </section>

        <KpiGrid
          items={[
            {
              label: "Revenue scanned",
              value: money(sourceRows.reduce((acc, row) => acc + row.revenue, 0)),
              note: `Last ${period} days`,
              tone: "positive",
            },
            {
              label: "Products analyzed",
              value: String(sourceRows.length),
              note: `${sourceRows.filter(
                (row) => row.losing || row.lowMargin || row.missingCost,
              ).length
                } at risk`,
              tone: "warning",
            },
            {
              label: "Low margin products",
              value: String(sourceRows.filter((row) => row.lowMargin).length),
              note: "Below 10%",
              tone: "warning",
            },
            {
              label: "Missing costs",
              value: String(sourceRows.filter((row) => row.missingCost).length),
              note: "Fix required",
              tone: "danger",
            },
          ]}
        />

        <KpiGrid
          marginBottom={24}
          items={[
            {
              label: "Biggest Profit Leak",
              value: worstProduct ? worstProduct.productTitle : "No data",
              note: worstProduct
                ? `${money(Math.abs(worstProduct.profit))} estimated loss`
                : "No issues detected",
              tone: "danger",
            },
            {
              label: "Best Margin Product",
              value: bestProduct ? bestProduct.productTitle : "No data",
              note: bestProduct
                ? bestProduct.missingCost
                  ? "Missing cost data"
                  : `${pct(bestProduct.marginPct)} margin`
                : "No products available",
              tone: "positive",
            },
            {
              label: "Recoverable Profit",
              value: money(recoverableProfit),
              note: "Potential margin recovery",
              tone: "warning",
            },
            {
              label: "AVERAGE PRODUCT MARGIN",
              value: pct(
                sourceRows.length > 0
                  ? sourceRows.reduce((acc, row) => acc + row.marginPct, 0) /
                  sourceRows.length
                  : 0,
              ),
              note: "Across analyzed products",
              tone: "positive",
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

        <RiskDistribution
          criticalCount={criticalCount}
          warningCount={warningCount}
          missingCount={missingCount}
          healthyCount={healthyCount}
          riskTotal={riskTotal}
        />

        <InsightsPanel insights={insights as any[]} />

        <TopLeaksPanel
          topLeaks={topLeaks}
          severityColor={severityColor}
          severityBackground={severityBackground}
          severityBorder={severityBorder}
        />

        <MarginBreakdown
          cogsPercentage={cogsPercentage}
          profitPercentage={profitPercentage}
          leakPercentage={leakPercentage}
        />

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
      </div>
    </div>
  );
}