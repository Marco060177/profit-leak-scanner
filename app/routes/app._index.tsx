import * as React from "react";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "~/shopify.server";
import { translations, getStoredLanguage } from "~/utils/i18n";
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
import ContributionInsightsPanel from "~/components/dashboard/ContributionInsightsPanel";

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
      discounts: 0,
      refunds: 0,
      profit: 420,
      marginPct: 5,
      previousMarginPct: null,
      productMarginDelta: null,
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
      discounts: 0,
      refunds: 0,
      profit: -4280,
      marginPct: -19.8,
      previousMarginPct: null,
      productMarginDelta: null,
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
      discounts: 0,
      refunds: 0,
      profit: 2780,
      marginPct: 40.3,
      previousMarginPct: null,
      productMarginDelta: null,
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
      discounts: 0,
      refunds: 0,
      profit: 3360,
      marginPct: 27.3,
      previousMarginPct: null,
      productMarginDelta: null,
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
    sourceRows.reduce(
      (acc, row) => acc + (row.profit < 0 ? row.profit : 0),
      0,
    ),
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

  const totalRevenue = Math.max(
    sourceRows.reduce((acc, row) => acc + row.revenue, 0),
    1,
  );

  const productRiskScore = (row: Row) => {
    const revenueShare =
      totalRevenue > 0 ? (row.revenue / totalRevenue) * 100 : 0;

    let score = 0;

    if (row.losing) score += 40;
    if (row.missingCost) score += 25;
    if (row.lowMargin) score += 20;

    score += Math.min(15, revenueShare);

    if (row.marginPct < 5) score += 10;
    if (row.targetDelta > 0) score += Math.min(10, row.targetDelta / 10);

    return Math.min(100, Math.round(score));
  };

  const getRiskLevel = (score: number) => {
    if (score >= 75) {
      return {
        label: "Critical",
        color: "#ff6b4a",
        background: "rgba(255,107,74,0.14)",
      };
    }

    if (score >= 50) {
      return {
        label: "High",
        color: "#ffb347",
        background: "rgba(255,179,71,0.14)",
      };
    }

    return {
      label: "Moderate",
      color: "#4ade80",
      background: "rgba(74,222,128,0.14)",
    };
  };

  const sortedRiskRows = filteredRows
    .slice()
    .sort((a, b) => productRiskScore(b) - productRiskScore(a))
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

  const riskyRows = sourceRows.filter(
    (row) => row.losing || row.lowMargin || row.missingCost,
  );



  const riskyRevenue = riskyRows.reduce((acc, row) => acc + row.revenue, 0);

  const riskyRevenueShare = (riskyRevenue / totalRevenue) * 100;

  const topRevenueProducts = [...sourceRows]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 3);

  const topRevenueTotal = topRevenueProducts.reduce(
    (acc, row) => acc + row.revenue,
    0,
  );

  const topRevenueShare = (topRevenueTotal / totalRevenue) * 100;

  const weakTopProducts = topRevenueProducts.filter(
    (row) => row.marginPct < 15 || row.lowMargin || row.losing,
  );

  const contributionInsights = [
    riskyRevenueShare > 25
      ? {
        title: "High-risk products are driving a significant share of revenue",
        value: `${riskyRevenueShare.toFixed(1)}% of revenue`,
        description:
          "A meaningful portion of store revenue is coming from products with margin risk, missing costs or weak profitability.",
        severity: "Critical",
        confidence: "High confidence"
      }
      : null,

    topRevenueShare > 50
      ? {
        title: "Revenue is concentrated in a small group of products",
        value: `${topRevenueShare.toFixed(1)}% from top 3 products`,
        description:
          "Your store depends heavily on a few products. If these products weaken, total profitability may be exposed.",
        severity: "High",
        confidence: "High confidence"
      }
      : null,

    weakTopProducts.length > 0
      ? {
        title: "Top-selling products show weak contribution quality",
        value: `${weakTopProducts.length} top products at risk`,
        description:
          "Some of your highest-revenue products may not be contributing enough profit relative to their sales volume.",
        severity: "Medium",
        confidence: "Moderate confidence"
      }
      : null,
  ].filter(Boolean) as {
    title: string;
    value: string;
    description: string;
    severity: string;
    confidence: string;
  }[];

  const prioritizedInsights = [...contributionInsights].sort((a, b) => {
    const severityWeight = {
      Critical: 3,
      High: 2,
      Medium: 1,
    };

    return (
      severityWeight[b.severity as keyof typeof severityWeight] -
      severityWeight[a.severity as keyof typeof severityWeight]
    );
  }).slice(0, 3);

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
        confidence: "High confidence",
        actionLabel: "Review pricing",
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
            <strong>{pct(weakBestSellerMargin)}</strong> margin. This product
            may be reducing your overall store profitability.
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
            <strong>{pct(summary.marginPct)}</strong> compared to the previous
            period. Review pricing, discounts and product costs to avoid
            further margin erosion.
          </>
        ),
      }
      : null,
    hasRecoveryOpportunity
      ? {
        eyebrow: "RECOVERY OPPORTUNITY",
        title:
          "MarginLab detected recoverable profit opportunities",
        badge: money(recoverableProfit),
        description: (
          <>
            Profit Leak Scanner detected{" "}
            <strong>{recoveryProducts.length} products</strong> with pricing
            gaps. Adjusting prices toward target margins could recover
            approximately{" "}
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
            <strong>
              {summary.revenueDeltaPct.toFixed(1)}%
            </strong>
            , but margin dropped by{" "}
            <strong>
              {Math.abs(summary.marginDelta).toFixed(1)}%
            </strong>
            . Rapid growth combined with weakening margins may indicate
            aggressive discounts, rising costs or underpriced best sellers.
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
    if (severity === "High")
      return "1px solid rgba(255,90,54,0.25)";
    if (severity === "Medium")
      return "1px solid rgba(245,158,11,0.22)";
    return "1px solid rgba(156,163,175,0.18)";
  };

  const [language] = React.useState(getStoredLanguage());

  const td = {
    ...translations.en.dashboard,
    ...(translations[language]?.dashboard ?? {}),
  };

  function tr(
    text: string | undefined,
    values: Record<string, string | number>,
  ) {
    return Object.entries(values).reduce(
      (result, [key, value]) =>
        result.replace(`{{${key}}}`, String(value)),
      text ?? "",
    );
  }

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
      <div className="dashboard-container"></div>
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
        score={score}
        scoreLabel={scoreLabel}
        visualLeak={visualLeak}
        visualProductsAtRisk={visualProductsAtRisk}
        visualMarginPct={visualMarginPct}
      />

      <section className="ai-insights-center">
        <div className="ai-insights-header">
          <span>
            {getStoredLanguage() === "it"
              ? "BRIEF REDDITIVITÀ"
              : "PROFIT INTELLIGENCE BRIEF"}
          </span>

          <h2>
            {getStoredLanguage() === "it"
              ? "Insight Operativi sui Profitti"
              : "Operational Profit Insights"}
          </h2>

          <p>
            {getStoredLanguage() === "it"
              ? "MarginLab ha analizzato il tuo negozio Shopify e rilevato rischi operativi che influenzano la redditività e l'efficienza dei prezzi."
              : "MarginLab analyzed your Shopify store and detected operational risks affecting profitability and pricing efficiency."}
          </p>
        </div>

        <div className="ai-insights-grid">
          <article className="ai-insight-card danger">
            <div className="ai-card-top">
              <span>Profitability Risk</span>
              <strong>Critical</strong>
            </div>

            <h3>Low-margin products are reducing store profitability</h3>

            <p>
              Several products are currently operating below target margin
              thresholds, reducing overall contribution profit across the
              store.
            </p>

            <div className="ai-recommendation-box">
              <div className="ai-recommendation-label">
                Recommended action
              </div>

              <div className="ai-recommendation-text">
                Review pricing structure, discounts and product costs for
                underperforming products.
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate("/app/products")}
            >
              Analyze affected products
            </button>
          </article>

          <article className="ai-insight-card warning">
            <div className="ai-card-top">
              <span>Data Integrity</span>
              <strong>Warning</strong>
            </div>

            <h3>Missing product costs are affecting profit accuracy</h3>

            <p>
              Margin calculations may be incomplete because some Shopify
              products still have missing cost information.
            </p>

            <div className="ai-recommendation-box">
              <div className="ai-recommendation-label">
                Recommended action
              </div>

              <div className="ai-recommendation-text">
                Complete missing cost fields to improve margin tracking
                and AI analysis reliability.
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate("/app/products")}
            >
              Fix missing costs
            </button>
          </article>

          <article className="ai-insight-card recovery">
            <div className="ai-card-top">
              <span>Recovery Opportunity</span>
              <strong>Detected</strong>
            </div>

            <h3>Pricing optimization opportunities identified</h3>

            <p>
              MarginLab detected products with potential pricing
              improvements capable of increasing monthly profitability.
            </p>

            <div className="ai-recommendation-box">
              <div className="ai-recommendation-label">
                Recommended action
              </div>

              <div className="ai-recommendation-text">
                Review optimization suggestions and compare target pricing
                scenarios.
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate("/app/products")}
            >
              Review recommendations
            </button>
          </article>
        </div>
      </section>

      <KpiGrid
        items={[
          {
            label: "Revenue scanned",
            value: money(
              sourceRows.reduce(
                (acc, row) => acc + row.revenue,
                0,
              ),
            ),
            note: `Last ${period} days`,
            icon: "$",
            tone: "positive",
          },
          {
            label: "Products analyzed",
            value: String(sourceRows.length),
            note: `${sourceRows.filter(
              (row) =>
                row.losing ||
                row.lowMargin ||
                row.missingCost,
            ).length
              } at risk`,
            icon: "◈",
            tone: "warning",
          },
          {
            label: "Low margin products",
            value: String(
              sourceRows.filter((row) => row.lowMargin).length,
            ),
            note: "Below 10%",
            icon: "↓",
            tone: "warning",
          },
          {
            label: "Missing costs",
            value: String(
              sourceRows.filter((row) => row.missingCost).length,
            ),
            note: "Fix required",
            icon: "⚠",
            tone: "danger",
          },
        ]}
      />

      <KpiGrid
        marginBottom={24}
        items={[
          {
            label: "Biggest Profit Leak",
            value: worstProduct
              ? worstProduct.productTitle
              : "No data",
            note: worstProduct
              ? `${money(
                Math.abs(worstProduct.profit),
              )} estimated loss`
              : "No issues detected",
            icon: "↓",
            tone: "danger",
          },
          {
            label: "Best Margin Product",
            value: bestProduct
              ? bestProduct.productTitle
              : "No data",
            note: bestProduct
              ? bestProduct.missingCost
                ? "Missing cost data"
                : `${pct(bestProduct.marginPct)} margin`
              : "No products available",
            icon: "↑",
            tone: "positive",
          },
          {
            label: "Recoverable Profit",
            value: money(recoverableProfit),
            note: "Potential margin recovery",
            icon: "+",
            tone: "warning",
          },
          {
            label: "AVERAGE PRODUCT MARGIN",
            value: pct(
              sourceRows.length > 0
                ? sourceRows.reduce(
                  (acc, row) => acc + row.marginPct,
                  0,
                ) / sourceRows.length
                : 0,
            ),
            note: "Across analyzed products",
            icon: "%",
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



      <InsightsPanel insights={insights as any[]} />

      <TopLeaksPanel
        topLeaks={topLeaks}
        severityColor={severityColor}
        severityBackground={severityBackground}
        severityBorder={severityBorder}
      />



    </div>

  );
}