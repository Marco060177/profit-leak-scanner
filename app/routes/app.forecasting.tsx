import { useLoaderData, useNavigate } from "react-router";

import prisma from "~/db.server";
import DashboardNav from "~/components/dashboard/DashboardNav";
import { authenticate } from "~/shopify.server";
import { loadMarginDashboardData } from "~/utils/margin.server";
import type { LoaderData } from "~/utils/margin";
import { getStoredLanguage } from "~/utils/i18n";

import "~/styles/dashboard.css";

export async function loader({ request }: { request: Request }) {
  const { admin, session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const period = url.searchParams.get("period") ?? "30";

  const dashboardData = await loadMarginDashboardData({
    admin,
    session,
    period,
  });

  const assumptions =
    (await prisma.profitAssumptions.findUnique({
      where: {
        shop: session.shop,
      },
    })) ?? {
      monthlyAds: 0,
      monthlyShipping: 0,
      monthlyOperating: 0,
      paymentFeePct: 0,
      transactionFeePct: 0,
      taxReservePct: 0,
    };

  return {
    ...dashboardData,
    assumptions,
  };
}

function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function ForecastingPage() {
  const navigate = useNavigate();
  const language = getStoredLanguage();

  const { summary, rows, assumptions } =
    useLoaderData() as LoaderData & {
      assumptions: {
        monthlyAds: number;
        monthlyShipping: number;
        monthlyOperating: number;
        paymentFeePct: number;
        transactionFeePct: number;
        taxReservePct: number;
      };
    };

  const recoverableProfit = rows.reduce(
    (sum, row) => sum + Math.max(0, row.targetDelta) * row.qty,
    0,
  );

  const impactedProducts = rows.filter((row) => row.targetDelta > 0).length;

  const estimatedPaymentFees =
    summary.revenue * (assumptions.paymentFeePct / 100);

  const estimatedTransactionFees =
    summary.revenue * (assumptions.transactionFeePct / 100);

  const estimatedTaxReserve =
    summary.revenue * (assumptions.taxReservePct / 100);

  const totalEstimatedCosts =
    assumptions.monthlyAds +
    assumptions.monthlyShipping +
    assumptions.monthlyOperating +
    estimatedPaymentFees +
    estimatedTransactionFees +
    estimatedTaxReserve;

  const currentNetProfit = summary.profit - totalEstimatedCosts;

  const currentNetMargin =
    summary.revenue > 0 ? (currentNetProfit / summary.revenue) * 100 : 0;

  const projectedGrossProfit = summary.profit + recoverableProfit;
  const projectedNetProfit = currentNetProfit + recoverableProfit;

  const projectedGrossMargin =
    summary.revenue > 0 ? (projectedGrossProfit / summary.revenue) * 100 : 0;

  const projectedNetMargin =
    summary.revenue > 0 ? (projectedNetProfit / summary.revenue) * 100 : 0;

  const grossMarginGain = projectedGrossMargin - summary.marginPct;
  const netMarginGain = projectedNetMargin - currentNetMargin;

  const scenarios = [
    {
      key: "conservative",
      label: language === "it" ? "Prudente" : "Conservative",
      recoveryPct: 25,
      description:
        language === "it"
          ? "Recupero del 25% delle opportunità individuate"
          : "Recover 25% of identified opportunities",
    },
    {
      key: "balanced",
      label: language === "it" ? "Bilanciato" : "Balanced",
      recoveryPct: 50,
      description:
        language === "it"
          ? "Recupero del 50% delle opportunità individuate"
          : "Recover 50% of identified opportunities",
    },
    {
      key: "aggressive",
      label: language === "it" ? "Massimo" : "Aggressive",
      recoveryPct: 100,
      description:
        language === "it"
          ? "Recupero di tutte le opportunità individuate"
          : "Recover all identified opportunities",
    },
  ].map((scenario) => {
    const recoveredProfit = recoverableProfit * (scenario.recoveryPct / 100);
    const scenarioGrossProfit = summary.profit + recoveredProfit;
    const scenarioNetProfit = currentNetProfit + recoveredProfit;

    const scenarioGrossMargin =
      summary.revenue > 0
        ? (scenarioGrossProfit / summary.revenue) * 100
        : 0;

    const scenarioNetMargin =
      summary.revenue > 0
        ? (scenarioNetProfit / summary.revenue) * 100
        : 0;

    return {
      ...scenario,
      recoveredProfit,
      scenarioGrossProfit,
      scenarioNetProfit,
      scenarioGrossMargin,
      scenarioNetMargin,
    };
  });

  const kpis = [
    {
      key: "currentGrossProfit",
      label:
        language === "it" ? "Profitto lordo attuale" : "Current Gross Profit",
      value: money(summary.profit),
      note:
        language === "it"
          ? `${summary.marginPct.toFixed(1)}% di margine lordo`
          : `${summary.marginPct.toFixed(1)}% gross margin`,
    },
    {
      key: "estimatedNetProfit",
      label:
        language === "it" ? "Profitto netto stimato" : "Estimated Net Profit",
      value: money(currentNetProfit),
      note:
        language === "it"
          ? `${currentNetMargin.toFixed(1)}% di margine netto stimato`
          : `${currentNetMargin.toFixed(1)}% estimated net margin`,
    },
    {
      key: "recoveryOpportunity",
      label:
        language === "it"
          ? "Opportunità di recupero"
          : "Recovery Opportunity",
      value: money(recoverableProfit),
      note:
        language === "it"
          ? `${impactedProducts} prodotti interessati`
          : `${impactedProducts} products impacted`,
    },
    {
      key: "projectedGrossProfit",
      label:
        language === "it"
          ? "Profitto lordo previsto"
          : "Projected Gross Profit",
      value: money(projectedGrossProfit),
      note:
        language === "it"
          ? `+${grossMarginGain.toFixed(1)}% di aumento del margine`
          : `+${grossMarginGain.toFixed(1)}% margin gain`,
    },
    {
      key: "projectedNetProfit",
      label:
        language === "it"
          ? "Profitto netto previsto"
          : "Projected Net Profit",
      value: money(projectedNetProfit),
      note:
        language === "it"
          ? `+${netMarginGain.toFixed(1)}% di aumento del margine netto`
          : `+${netMarginGain.toFixed(1)}% net margin gain`,
    },
    {
      key: "estimatedCosts",
      label: language === "it" ? "Costi stimati" : "Estimated Costs",
      value: money(totalEstimatedCosts),
      note:
        language === "it"
          ? "Incluse le ipotesi inserite manualmente"
          : "Manual assumptions included",
    },
  ];

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardNav active="forecasting" navigate={navigate} />

        <div className="hero-header">
          <div>
            <div className="alert-pill">
              <span className="alert-dot" />
              {language === "it"
                ? "Anteprima del piano Growth"
                : "Growth Plan Preview"}
            </div>

            <div className="eyebrow">
              {language === "it" ? "PREVISIONI" : "FORECASTING"}
            </div>

            <div className="hero-title">
              {language === "it"
                ? "Prevedi come può migliorare la redditività"
                : "Forecast future profitability improvements"}
            </div>

            <div className="hero-description">
              {language === "it"
                ? "Stima profitto lordo, profitto netto e possibili scenari di recupero utilizzando i dati attuali del negozio e i costi mensili salvati."
                : "Estimate gross profit, net profit and recovery scenarios using current store data and saved monthly cost assumptions."}
            </div>
          </div>

          <button
            className="primary-button"
            onClick={() => navigate("/app/billing")}
          >
            {language === "it" ? "Passa a Growth →" : "Upgrade to Growth →"}
          </button>
        </div>

        <div className="panel">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 20,
            }}
          >
            {kpis.map((item) => (
              <div
                key={item.key}
                style={{
                  borderRadius: 24,
                  padding: 24,
                  background:
                    item.key === "projectedNetProfit"
                      ? "radial-gradient(circle at top left, rgba(34,197,94,0.16), transparent 35%), linear-gradient(180deg, rgba(17,24,39,0.96), rgba(8,13,22,0.98))"
                      : "linear-gradient(180deg, rgba(17,24,39,0.96), rgba(8,13,22,0.98))",
                  border:
                    item.key === "projectedNetProfit"
                      ? "1px solid rgba(34,197,94,0.28)"
                      : "1px solid rgba(255,115,60,0.18)",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    color:
                      item.key === "projectedNetProfit"
                        ? "#4ade80"
                        : "rgba(255,255,255,0.55)",
                    fontWeight: 900,
                  }}
                >
                  {item.label}
                </div>

                <div
                  style={{
                    marginTop: 16,
                    fontSize: 34,
                    fontWeight: 950,
                    color:
                      item.key === "projectedNetProfit"
                        ? "#22c55e"
                        : "#f8fafc",
                    letterSpacing: "-0.04em",
                  }}
                >
                  {item.value}
                </div>

                <div
                  style={{
                    marginTop: 8,
                    color: "rgba(255,255,255,0.62)",
                    fontWeight: 750,
                  }}
                >
                  {item.note}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 24,
              borderRadius: 26,
              padding: 28,
              background:
                "linear-gradient(180deg, rgba(17,24,39,0.96), rgba(8,13,22,0.98))",
              border: "1px solid rgba(255,115,60,0.18)",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#ff9a70",
              }}
            >
              {language === "it" ? "Scenari previsionali" : "Forecast Scenarios"}
            </div>

            <div
              style={{
                marginTop: 20,
                display: "grid",
                gridTemplateColumns: "repeat(3,1fr)",
                gap: 18,
              }}
            >
              {scenarios.map((scenario) => (
                <div
                  key={scenario.key}
                  style={{
                    borderRadius: 22,
                    padding: 22,
                    background:
                      scenario.key === "balanced"
                        ? "radial-gradient(circle at top left, rgba(34,197,94,0.14), transparent 36%), rgba(255,255,255,0.045)"
                        : "rgba(255,255,255,0.04)",
                    border:
                      scenario.key === "balanced"
                        ? "1px solid rgba(34,197,94,0.24)"
                        : "1px solid rgba(255,115,60,0.12)",
                  }}
                >
                  <div
                    style={{
                      color:
                        scenario.key === "balanced"
                          ? "#4ade80"
                          : "#ff9a70",
                      fontSize: 11,
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.10em",
                    }}
                  >
                    {scenario.label}
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      color: "rgba(255,255,255,0.62)",
                      fontWeight: 750,
                      lineHeight: 1.5,
                    }}
                  >
                    {scenario.description}
                  </div>

                  <div
                    style={{
                      marginTop: 18,
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    <div>
                      <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 900 }}>
                        {language === "it" ? "PROFITTO RECUPERATO" : "RECOVERED PROFIT"}
                      </div>
                      <div style={{ color: "#22c55e", fontWeight: 950, fontSize: 24 }}>
                        +{money(scenario.recoveredProfit)}
                      </div>
                    </div>

                    <div>
                      <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 900 }}>
                        {language === "it"
                          ? "PROFITTO NETTO PREVISTO"
                          : "PROJECTED NET PROFIT"}
                      </div>
                      <div style={{ color: "#f8fafc", fontWeight: 900 }}>
                        {money(scenario.scenarioNetProfit)}
                      </div>
                    </div>

                    <div>
                      <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 900 }}>
                        {language === "it"
                          ? "MARGINE NETTO PREVISTO"
                          : "PROJECTED NET MARGIN"}
                      </div>
                      <div style={{ color: "#f8fafc", fontWeight: 900 }}>
                        {scenario.scenarioNetMargin.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              marginTop: 24,
              padding: 24,
              borderRadius: 24,
              background:
                "linear-gradient(135deg, rgba(255,115,60,0.10), rgba(8,13,22,0.92))",
              border: "1px solid rgba(255,115,60,0.22)",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#ff9a70",
              }}
            >
              {language === "it"
                ? "Riepilogo previsionale AI"
                : "AI Forecast Summary"}
            </div>

            <div
              style={{
                marginTop: 14,
                color: "rgba(255,255,255,0.78)",
                fontSize: 15,
                lineHeight: 1.7,
                fontWeight: 750,
              }}
            >
              {language === "it" ? (
                <>
                  Il profitto netto stimato attuale è{" "}
                  <strong style={{ color: "#f8fafc" }}>
                    {money(currentNetProfit)}
                  </strong>
                  . Se tutte le opportunità di recupero individuate venissero
                  sfruttate, il profitto netto potrebbe raggiungere{" "}
                  <strong style={{ color: "#22c55e" }}>
                    {money(projectedNetProfit)}
                  </strong>
                  . MarginLab ha individuato{" "}
                  <strong style={{ color: "#f8fafc" }}>
                    {impactedProducts}
                  </strong>{" "}
                  prodotti con potenziale di recupero e{" "}
                  <strong style={{ color: "#f8fafc" }}>
                    {money(totalEstimatedCosts)}
                  </strong>{" "}
                  di costi mensili stimati oltre ai costi dei prodotti.
                </>
              ) : (
                <>
                  Current estimated net profit is{" "}
                  <strong style={{ color: "#f8fafc" }}>
                    {money(currentNetProfit)}
                  </strong>
                  . If all recoverable margin opportunities are addressed,
                  projected net profit could reach{" "}
                  <strong style={{ color: "#22c55e" }}>
                    {money(projectedNetProfit)}
                  </strong>
                  . MarginLab identified{" "}
                  <strong style={{ color: "#f8fafc" }}>
                    {impactedProducts}
                  </strong>{" "}
                  products with recovery potential and{" "}
                  <strong style={{ color: "#f8fafc" }}>
                    {money(totalEstimatedCosts)}
                  </strong>{" "}
                  in estimated monthly costs outside product costs.
                </>
              )}
            </div>
          </div>

          <div
            style={{
              marginTop: 24,
              padding: 18,
              borderRadius: 18,
              background: "rgba(255,115,60,0.08)",
              border: "1px solid rgba(255,115,60,0.20)",
              color: "rgba(255,255,255,0.70)",
              lineHeight: 1.6,
              fontWeight: 700,
            }}
          >
            {language === "it"
              ? "Anteprima delle previsioni. Le stime utilizzano i costi attuali dei prodotti, i volumi di vendita, le opportunità di recupero individuate e i costi salvati nella simulazione. Si tratta di proiezioni e non di risultati garantiti."
              : "Forecasting preview. Estimates use current product costs, sales volume, recoverable pricing opportunities and saved Profit Assumptions. They are projections, not guaranteed results."}
          </div>
        </div>
      </div>
    </div>
  );
}