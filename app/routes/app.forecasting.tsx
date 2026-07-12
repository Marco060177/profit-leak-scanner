import * as React from "react";
import { useLoaderData, useNavigate } from "react-router";

import prisma from "~/db.server";
import DashboardNav from "~/components/dashboard/DashboardNav";
import { authenticate } from "~/shopify.server";
import { loadMarginDashboardData } from "~/utils/margin.server";
import type { LoaderData } from "~/utils/margin";
import { getStoredLanguage } from "~/utils/i18n";

import "~/styles/dashboard.css";

type Assumptions = {
  monthlyAds: number;
  monthlyShipping: number;
  monthlyOperating: number;
  paymentFeePct: number;
  transactionFeePct: number;
  taxReservePct: number;
};

type ScenarioKey = "conservative" | "balanced" | "aggressive" | "custom";

export async function loader({ request }: { request: Request }) {
  const { admin, session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const period = url.searchParams.get("period") ?? "30";
  const parsedPeriod = Number(period);
  const forecastPeriod =
    Number.isFinite(parsedPeriod) && parsedPeriod > 0 ? parsedPeriod : 30;

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
    forecastPeriod,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function safeNumber(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(safeNumber(n));
}

function compactMoney(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(safeNumber(n));
}

function pct(n: number, digits = 1) {
  return `${safeNumber(n).toFixed(digits)}%`;
}

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  suffix,
  helper,
  onChange,
  accent = "#ff7350",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  helper: string;
  onChange: (value: number) => void;
  accent?: string;
}) {
  const progress = ((value - min) / (max - min)) * 100;

  return (
    <div
      style={{
        padding: 18,
        borderRadius: 18,
        background: "rgba(255,255,255,0.035)",
        border: "1px solid rgba(255,115,60,0.12)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          alignItems: "flex-start",
        }}
      >
        <div>
          <div style={{ color: "#f8fafc", fontWeight: 900, fontSize: 14 }}>
            {label}
          </div>
          <div
            style={{
              marginTop: 4,
              color: "rgba(255,255,255,0.48)",
              fontSize: 12,
              fontWeight: 700,
              lineHeight: 1.45,
            }}
          >
            {helper}
          </div>
        </div>

        <div
          style={{
            minWidth: 78,
            padding: "8px 10px",
            borderRadius: 12,
            background: `${accent}18`,
            border: `1px solid ${accent}45`,
            color: accent,
            textAlign: "center",
            fontWeight: 950,
          }}
        >
          {value > 0 ? "+" : ""}
          {value.toFixed(step < 1 ? 1 : 0)}
          {suffix}
        </div>
      </div>

      <div style={{ position: "relative", marginTop: 18 }}>
        <div
          style={{
            height: 8,
            borderRadius: 999,
            background: "rgba(255,255,255,0.08)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${clamp(progress, 0, 100)}%`,
              height: "100%",
              borderRadius: 999,
              background: `linear-gradient(90deg, ${accent}, #ffb089)`,
              boxShadow: `0 0 18px ${accent}55`,
              transition: "width 180ms ease",
            }}
          />
        </div>

        <input
          aria-label={label}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          style={{
            position: "absolute",
            inset: -8,
            width: "calc(100% + 16px)",
            height: 24,
            opacity: 0,
            cursor: "pointer",
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 8,
          color: "rgba(255,255,255,0.34)",
          fontSize: 11,
          fontWeight: 800,
        }}
      >
        <span>
          {min}
          {suffix}
        </span>
        <span>
          {max > 0 ? "+" : ""}
          {max}
          {suffix}
        </span>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  note,
  positive,
  highlighted,
}: {
  label: string;
  value: string;
  note: string;
  positive?: boolean;
  highlighted?: boolean;
}) {
  return (
    <div
      style={{
        minWidth: 0,
        borderRadius: 22,
        padding: 22,
        background: highlighted
          ? "radial-gradient(circle at top left, rgba(34,197,94,0.17), transparent 42%), linear-gradient(180deg, rgba(17,24,39,0.98), rgba(7,12,21,0.99))"
          : "linear-gradient(180deg, rgba(17,24,39,0.96), rgba(8,13,22,0.98))",
        border: highlighted
          ? "1px solid rgba(34,197,94,0.30)"
          : "1px solid rgba(255,115,60,0.17)",
        boxShadow: highlighted
          ? "0 18px 45px rgba(34,197,94,0.08)"
          : "none",
      }}
    >
      <div
        style={{
          color: highlighted
            ? "#4ade80"
            : "rgba(255,255,255,0.52)",
          fontSize: 10,
          fontWeight: 950,
          letterSpacing: "0.13em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 13,
          color:
            positive || highlighted
              ? "#22c55e"
              : "#f8fafc",
          fontSize: 30,
          lineHeight: 1,
          fontWeight: 950,
          letterSpacing: "-0.04em",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </div>

      <div
        style={{
          marginTop: 9,
          color: "rgba(255,255,255,0.58)",
          fontSize: 12,
          lineHeight: 1.45,
          fontWeight: 750,
        }}
      >
        {note}
      </div>
    </div>
  );
}

export default function ForecastingPage() {
  const navigate = useNavigate();
  const language = getStoredLanguage();

  const { summary, rows, assumptions, forecastPeriod } =
    useLoaderData() as LoaderData & {
      assumptions: Assumptions;
      forecastPeriod: number;
    };

  const periodDays = Math.max(1, forecastPeriod);
  const monthlyFactor = 30 / periodDays;

  const monthlyRevenue = safeNumber(summary.revenue) * monthlyFactor;
  const monthlyGrossProfit = safeNumber(summary.profit) * monthlyFactor;
  const monthlyCogs = Math.max(0, monthlyRevenue - monthlyGrossProfit);

  const recoverableProfitInPeriod = rows.reduce(
    (sum, row) => sum + Math.max(0, safeNumber(row.targetDelta)) * safeNumber(row.qty),
    0,
  );
  const monthlyRecoverableProfit = recoverableProfitInPeriod * monthlyFactor;

  const impactedProducts = rows.filter(
    (row) => safeNumber(row.targetDelta) > 0,
  ).length;

  const monthlyFixedCosts =
    safeNumber(assumptions.monthlyAds) +
    safeNumber(assumptions.monthlyShipping) +
    safeNumber(assumptions.monthlyOperating);

  const variableFeePct =
    safeNumber(assumptions.paymentFeePct) +
    safeNumber(assumptions.transactionFeePct) +
    safeNumber(assumptions.taxReservePct);

  const currentMonthlyVariableFees =
    monthlyRevenue * (variableFeePct / 100);

  const currentMonthlyNetProfit =
    monthlyGrossProfit -
    monthlyFixedCosts -
    currentMonthlyVariableFees;

  const currentNetMargin =
    monthlyRevenue > 0
      ? (currentMonthlyNetProfit / monthlyRevenue) * 100
      : 0;

  const [selectedScenario, setSelectedScenario] =
    React.useState<ScenarioKey>("balanced");
  const [horizon, setHorizon] = React.useState(12);
  const [monthlyRevenueGrowth, setMonthlyRevenueGrowth] =
    React.useState(2);
  const [marginImprovement, setMarginImprovement] =
    React.useState(2);
  const [monthlyCostGrowth, setMonthlyCostGrowth] =
    React.useState(1);
  const [recoveryCapture, setRecoveryCapture] =
    React.useState(50);
  const [profitGoal, setProfitGoal] = React.useState(
    Math.max(0, Math.round(currentMonthlyNetProfit * 1.5)),
  );

  const applyScenario = React.useCallback(
    (scenario: Exclude<ScenarioKey, "custom">) => {
      setSelectedScenario(scenario);

      if (scenario === "conservative") {
        setMonthlyRevenueGrowth(0.5);
        setMarginImprovement(0.8);
        setMonthlyCostGrowth(1.5);
        setRecoveryCapture(25);
      }

      if (scenario === "balanced") {
        setMonthlyRevenueGrowth(2);
        setMarginImprovement(2);
        setMonthlyCostGrowth(1);
        setRecoveryCapture(50);
      }

      if (scenario === "aggressive") {
        setMonthlyRevenueGrowth(4);
        setMarginImprovement(4);
        setMonthlyCostGrowth(0.5);
        setRecoveryCapture(100);
      }
    },
    [],
  );

  const setCustomValue = (setter: (value: number) => void, value: number) => {
    setSelectedScenario("custom");
    setter(value);
  };

  const forecast = React.useMemo(() => {
    const points: Array<{
      month: number;
      revenue: number;
      grossProfit: number;
      netProfit: number;
      netMargin: number;
      cumulativeNetProfit: number;
      cumulativeLift: number;
    }> = [];

    let cumulativeNetProfit = 0;
    let baselineCumulativeNetProfit = 0;

    for (let month = 1; month <= horizon; month += 1) {
      const revenueGrowthFactor = Math.pow(
        1 + monthlyRevenueGrowth / 100,
        month,
      );
      const costGrowthFactor = Math.pow(
        1 + monthlyCostGrowth / 100,
        month,
      );

      const revenue = monthlyRevenue * revenueGrowthFactor;
      const baselineGrossMarginPct =
        monthlyRevenue > 0
          ? (monthlyGrossProfit / monthlyRevenue) * 100
          : 0;

      const improvedGrossMarginPct = clamp(
        baselineGrossMarginPct +
          marginImprovement * (month / horizon),
        -100,
        95,
      );

      const grossProfit =
        revenue * (improvedGrossMarginPct / 100);

      const capturedRecovery =
        monthlyRecoverableProfit *
        (recoveryCapture / 100) *
        Math.min(1, month / Math.max(1, horizon / 2));

      const fixedCosts = monthlyFixedCosts * costGrowthFactor;
      const variableFees = revenue * (variableFeePct / 100);
      const netProfit =
        grossProfit +
        capturedRecovery -
        fixedCosts -
        variableFees;

      const netMargin =
        revenue > 0 ? (netProfit / revenue) * 100 : 0;

      const baselineRevenue =
        monthlyRevenue * revenueGrowthFactor;
      const baselineGrossProfit =
        baselineRevenue *
        ((monthlyRevenue > 0
          ? monthlyGrossProfit / monthlyRevenue
          : 0));

      const baselineNetProfit =
        baselineGrossProfit -
        fixedCosts -
        baselineRevenue * (variableFeePct / 100);

      cumulativeNetProfit += netProfit;
      baselineCumulativeNetProfit += baselineNetProfit;

      points.push({
        month,
        revenue,
        grossProfit,
        netProfit,
        netMargin,
        cumulativeNetProfit,
        cumulativeLift:
          cumulativeNetProfit - baselineCumulativeNetProfit,
      });
    }

    return points;
  }, [
    horizon,
    marginImprovement,
    monthlyCostGrowth,
    monthlyFixedCosts,
    monthlyGrossProfit,
    monthlyRecoverableProfit,
    monthlyRevenue,
    monthlyRevenueGrowth,
    recoveryCapture,
    variableFeePct,
  ]);

  const finalPoint =
    forecast[forecast.length - 1] ?? {
      revenue: monthlyRevenue,
      grossProfit: monthlyGrossProfit,
      netProfit: currentMonthlyNetProfit,
      netMargin: currentNetMargin,
      cumulativeNetProfit: currentMonthlyNetProfit,
      cumulativeLift: 0,
      month: horizon,
    };

  const totalProjectedRevenue = forecast.reduce(
    (sum, item) => sum + item.revenue,
    0,
  );
  const totalProjectedNetProfit = forecast.reduce(
    (sum, item) => sum + item.netProfit,
    0,
  );
  const averageProjectedNetMargin =
    totalProjectedRevenue > 0
      ? (totalProjectedNetProfit / totalProjectedRevenue) * 100
      : 0;

  const firstGoalMonth =
    profitGoal > 0
      ? forecast.find((item) => item.netProfit >= profitGoal)?.month
      : undefined;

  const bestMonth = forecast.reduce(
    (best, item) => (item.netProfit > best.netProfit ? item : best),
    finalPoint,
  );

  const maxChartProfit = Math.max(
    1,
    ...forecast.map((item) => Math.max(0, item.netProfit)),
    Math.max(0, currentMonthlyNetProfit),
  );

  const maxChartRevenue = Math.max(
    1,
    ...forecast.map((item) => Math.max(0, item.revenue)),
    monthlyRevenue,
  );

  const dataConfidence = clamp(
    45 +
      Math.min(25, rows.length * 1.5) +
      (periodDays >= 30 ? 15 : periodDays >= 14 ? 8 : 0) +
      (monthlyFixedCosts > 0 || variableFeePct > 0 ? 15 : 0),
    45,
    98,
  );

  const health =
    finalPoint.netMargin >= 20
      ? language === "it"
        ? "Molto solida"
        : "Very strong"
      : finalPoint.netMargin >= 10
        ? language === "it"
          ? "In miglioramento"
          : "Improving"
        : finalPoint.netMargin >= 0
          ? language === "it"
            ? "Fragile"
            : "Fragile"
          : language === "it"
            ? "A rischio"
            : "At risk";

  const strongestLever =
    marginImprovement >= monthlyRevenueGrowth &&
    marginImprovement >= recoveryCapture / 25
      ? language === "it"
        ? "miglioramento del margine"
        : "margin improvement"
      : monthlyRevenueGrowth >= recoveryCapture / 25
        ? language === "it"
          ? "crescita dei ricavi"
          : "revenue growth"
        : language === "it"
          ? "recupero delle opportunità"
          : "opportunity recovery";

  const recommendation =
    language === "it"
      ? `Lo scenario ${selectedScenario === "custom" ? "personalizzato" : selectedScenario === "balanced" ? "bilanciato" : selectedScenario === "conservative" ? "prudente" : "aggressivo"} porta il profitto netto mensile stimato da ${money(
          currentMonthlyNetProfit,
        )} a ${money(finalPoint.netProfit)} entro ${horizon} mesi. La leva con l'impatto maggiore è il ${strongestLever}. Con un miglioramento del margine di ${marginImprovement.toFixed(
          1,
        )} punti e il recupero del ${recoveryCapture.toFixed(
          0,
        )}% delle opportunità individuate, il profitto cumulativo aggiuntivo stimato è ${money(
          finalPoint.cumulativeLift,
        )}.`
      : `The ${selectedScenario === "custom" ? "custom" : selectedScenario} scenario moves estimated monthly net profit from ${money(
          currentMonthlyNetProfit,
        )} to ${money(finalPoint.netProfit)} within ${horizon} months. The strongest lever is ${strongestLever}. With a ${marginImprovement.toFixed(
          1,
        )}-point margin improvement and ${recoveryCapture.toFixed(
          0,
        )}% of identified opportunities captured, estimated cumulative additional profit is ${money(
          finalPoint.cumulativeLift,
        )}.`;

  const actions =
    language === "it"
      ? [
          marginImprovement > 0
            ? `Porta gradualmente il margine lordo a +${marginImprovement.toFixed(
                1,
              )} punti rispetto al livello attuale.`
            : "Mantieni stabile il margine lordo e monitora i prodotti più deboli.",
          recoveryCapture > 0
            ? `Intervieni prima sui ${impactedProducts} prodotti con opportunità di recupero.`
            : "Valuta almeno una parte delle opportunità di recupero già individuate.",
          monthlyCostGrowth > 1
            ? "Contieni la crescita dei costi mensili: sta riducendo il beneficio della crescita."
            : "La crescita dei costi è sotto controllo nello scenario selezionato.",
        ]
      : [
          marginImprovement > 0
            ? `Gradually lift gross margin by ${marginImprovement.toFixed(
                1,
              )} points from the current level.`
            : "Keep gross margin stable and monitor the weakest products.",
          recoveryCapture > 0
            ? `Prioritize the ${impactedProducts} products with identified recovery potential.`
            : "Capture at least part of the recovery opportunities already identified.",
          monthlyCostGrowth > 1
            ? "Contain monthly cost growth because it is reducing the benefit of revenue growth."
            : "Cost growth remains controlled in the selected scenario.",
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
                ? "Funzione Growth"
                : "Growth Feature"}
            </div>

            <div className="eyebrow">
              {language === "it"
                ? "PREVISIONE DEL PROFITTO"
                : "PROFIT FORECASTING"}
            </div>

            <div className="hero-title">
              {language === "it"
                ? "Guarda dove può arrivare il tuo profitto"
                : "See where your profit can go"}
            </div>

            <div className="hero-description">
              {language === "it"
                ? "Modella crescita, margini, costi e opportunità di recupero. MarginLab trasforma i dati attuali dello store in una previsione operativa a 3, 6 o 12 mesi."
                : "Model growth, margins, costs and recovery opportunities. MarginLab turns current store data into an actionable 3, 6 or 12 month forecast."}
            </div>
          </div>

          <button
            className="primary-button"
            onClick={() => navigate("/app/billing")}
            style={{
              boxShadow:
                "0 12px 30px rgba(255,115,80,0.28), 0 0 28px rgba(255,115,80,0.16)",
            }}
          >
            {language === "it"
              ? "Sblocca Growth →"
              : "Unlock Growth →"}
          </button>
        </div>

        <div className="panel">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,minmax(0,1fr))",
              gap: 16,
            }}
          >
            <MetricCard
              label={
                language === "it"
                  ? "Profitto netto mensile"
                  : "Monthly Net Profit"
              }
              value={money(currentMonthlyNetProfit)}
              note={
                language === "it"
                  ? `${pct(currentNetMargin)} di margine netto stimato`
                  : `${pct(currentNetMargin)} estimated net margin`
              }
            />

            <MetricCard
              label={
                language === "it"
                  ? `Profitto al mese ${horizon}`
                  : `Profit in Month ${horizon}`
              }
              value={money(finalPoint.netProfit)}
              note={
                language === "it"
                  ? `${pct(finalPoint.netMargin)} di margine netto previsto`
                  : `${pct(finalPoint.netMargin)} projected net margin`
              }
              positive={finalPoint.netProfit >= currentMonthlyNetProfit}
            />

            <MetricCard
              label={
                language === "it"
                  ? "Profitto aggiuntivo cumulativo"
                  : "Cumulative Profit Lift"
              }
              value={`+${money(Math.max(0, finalPoint.cumulativeLift))}`}
              note={
                language === "it"
                  ? `Impatto totale nei prossimi ${horizon} mesi`
                  : `Total impact across the next ${horizon} months`
              }
              highlighted
            />

            <MetricCard
              label={
                language === "it"
                  ? "Ricavi previsti"
                  : "Projected Revenue"
              }
              value={compactMoney(totalProjectedRevenue)}
              note={
                language === "it"
                  ? `Totale previsto su ${horizon} mesi`
                  : `Forecast total across ${horizon} months`
              }
            />
          </div>

          <div
            style={{
              marginTop: 22,
              display: "grid",
              gridTemplateColumns: "0.92fr 1.35fr",
              gap: 20,
              alignItems: "stretch",
            }}
          >
            <div
              style={{
                borderRadius: 26,
                padding: 24,
                background:
                  "radial-gradient(circle at top left, rgba(255,115,80,0.12), transparent 38%), linear-gradient(180deg, rgba(17,24,39,0.98), rgba(7,12,21,0.99))",
                border: "1px solid rgba(255,115,60,0.20)",
              }}
            >
              <div
                style={{
                  color: "#ff9a70",
                  fontSize: 11,
                  fontWeight: 950,
                  letterSpacing: "0.13em",
                  textTransform: "uppercase",
                }}
              >
                {language === "it"
                  ? "Costruisci lo scenario"
                  : "Build the Scenario"}
              </div>

              <div
                style={{
                  marginTop: 10,
                  color: "#f8fafc",
                  fontSize: 22,
                  fontWeight: 950,
                  letterSpacing: "-0.03em",
                }}
              >
                {language === "it"
                  ? "Decidi come vuoi crescere"
                  : "Choose how you want to grow"}
              </div>

              <div
                style={{
                  marginTop: 7,
                  color: "rgba(255,255,255,0.56)",
                  lineHeight: 1.55,
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {language === "it"
                  ? "Gli scenari applicano ipotesi diverse. Puoi poi modificare ogni leva manualmente."
                  : "Scenarios apply different assumptions. You can then fine-tune every lever manually."}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3,1fr)",
                  gap: 9,
                  marginTop: 18,
                }}
              >
                {(
                  [
                    ["conservative", language === "it" ? "Prudente" : "Conservative"],
                    ["balanced", language === "it" ? "Bilanciato" : "Balanced"],
                    ["aggressive", language === "it" ? "Ambizioso" : "Ambitious"],
                  ] as Array<[Exclude<ScenarioKey, "custom">, string]>
                ).map(([key, label]) => {
                  const active = selectedScenario === key;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => applyScenario(key)}
                      style={{
                        padding: "12px 8px",
                        borderRadius: 14,
                        cursor: "pointer",
                        color: active ? "#ffffff" : "rgba(255,255,255,0.68)",
                        background: active
                          ? "linear-gradient(135deg, rgba(255,115,80,0.30), rgba(255,115,80,0.12))"
                          : "rgba(255,255,255,0.035)",
                        border: active
                          ? "1px solid rgba(255,115,80,0.55)"
                          : "1px solid rgba(255,255,255,0.08)",
                        fontWeight: 900,
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {selectedScenario === "custom" && (
                <div
                  style={{
                    marginTop: 10,
                    color: "#fbbf24",
                    fontSize: 12,
                    fontWeight: 850,
                  }}
                >
                  {language === "it"
                    ? "Scenario personalizzato"
                    : "Custom scenario"}
                </div>
              )}

              <div
                style={{
                  marginTop: 20,
                  display: "grid",
                  gap: 12,
                }}
              >
                <SliderControl
                  label={
                    language === "it"
                      ? "Crescita mensile dei ricavi"
                      : "Monthly Revenue Growth"
                  }
                  value={monthlyRevenueGrowth}
                  min={-5}
                  max={8}
                  step={0.5}
                  suffix="%"
                  helper={
                    language === "it"
                      ? "Variazione prevista delle vendite mese su mese."
                      : "Expected month-over-month sales change."
                  }
                  onChange={(value) =>
                    setCustomValue(setMonthlyRevenueGrowth, value)
                  }
                />

                <SliderControl
                  label={
                    language === "it"
                      ? "Miglioramento del margine"
                      : "Margin Improvement"
                  }
                  value={marginImprovement}
                  min={0}
                  max={10}
                  step={0.5}
                  suffix=" pt"
                  helper={
                    language === "it"
                      ? "Aumento progressivo del margine lordo entro l'orizzonte scelto."
                      : "Progressive gross-margin lift by the selected horizon."
                  }
                  onChange={(value) =>
                    setCustomValue(setMarginImprovement, value)
                  }
                  accent="#22c55e"
                />

                <SliderControl
                  label={
                    language === "it"
                      ? "Crescita mensile dei costi"
                      : "Monthly Cost Growth"
                  }
                  value={monthlyCostGrowth}
                  min={-2}
                  max={6}
                  step={0.5}
                  suffix="%"
                  helper={
                    language === "it"
                      ? "Evoluzione prevista di advertising, spedizioni e costi operativi."
                      : "Expected change in ads, shipping and operating costs."
                  }
                  onChange={(value) =>
                    setCustomValue(setMonthlyCostGrowth, value)
                  }
                  accent="#f59e0b"
                />

                <SliderControl
                  label={
                    language === "it"
                      ? "Opportunità recuperate"
                      : "Recovery Opportunities Captured"
                  }
                  value={recoveryCapture}
                  min={0}
                  max={100}
                  step={5}
                  suffix="%"
                  helper={
                    language === "it"
                      ? "Quota del profitto recuperabile che prevedi di realizzare."
                      : "Share of recoverable profit you expect to realize."
                  }
                  onChange={(value) =>
                    setCustomValue(setRecoveryCapture, value)
                  }
                  accent="#38bdf8"
                />
              </div>
            </div>

            <div
              style={{
                borderRadius: 26,
                padding: 24,
                background:
                  "radial-gradient(circle at 75% 15%, rgba(34,197,94,0.12), transparent 35%), linear-gradient(180deg, rgba(17,24,39,0.98), rgba(7,12,21,0.99))",
                border: "1px solid rgba(34,197,94,0.20)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 18,
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div
                    style={{
                      color: "#4ade80",
                      fontSize: 11,
                      fontWeight: 950,
                      letterSpacing: "0.13em",
                      textTransform: "uppercase",
                    }}
                  >
                    {language === "it"
                      ? "Traiettoria prevista"
                      : "Forecast Trajectory"}
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      color: "#f8fafc",
                      fontSize: 22,
                      fontWeight: 950,
                      letterSpacing: "-0.03em",
                    }}
                  >
                    {language === "it"
                      ? "Il percorso del profitto mese per mese"
                      : "Your month-by-month profit path"}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    padding: 4,
                    borderRadius: 14,
                    background: "rgba(255,255,255,0.045)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {[3, 6, 12].map((months) => (
                    <button
                      key={months}
                      type="button"
                      onClick={() => setHorizon(months)}
                      style={{
                        minWidth: 48,
                        padding: "9px 11px",
                        borderRadius: 10,
                        cursor: "pointer",
                        border: 0,
                        background:
                          horizon === months
                            ? "rgba(255,115,80,0.22)"
                            : "transparent",
                        color:
                          horizon === months
                            ? "#ffffff"
                            : "rgba(255,255,255,0.52)",
                        fontWeight: 950,
                      }}
                    >
                      {months}M
                    </button>
                  ))}
                </div>
              </div>

              <div
                style={{
                  marginTop: 24,
                  height: 285,
                  display: "flex",
                  gap: 9,
                  alignItems: "flex-end",
                  padding: "16px 6px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                  background:
                    "linear-gradient(180deg, rgba(34,197,94,0.025), transparent)",
                }}
              >
                {forecast.map((item) => {
                  const profitHeight =
                    Math.max(0, item.netProfit) / maxChartProfit;
                  const revenueHeight =
                    Math.max(0, item.revenue) / maxChartRevenue;

                  return (
                    <div
                      key={item.month}
                      title={`${language === "it" ? "Mese" : "Month"} ${item.month}: ${money(item.netProfit)}`}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "flex-end",
                        alignItems: "stretch",
                        gap: 7,
                      }}
                    >
                      <div
                        style={{
                          textAlign: "center",
                          color:
                            item.month === horizon
                              ? "#4ade80"
                              : "rgba(255,255,255,0.44)",
                          fontSize: 10,
                          fontWeight: 900,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {compactMoney(item.netProfit)}
                      </div>

                      <div
                        style={{
                          height: `${Math.max(4, revenueHeight * 74)}%`,
                          maxHeight: "74%",
                          borderRadius: "9px 9px 3px 3px",
                          background:
                            "linear-gradient(180deg, rgba(56,189,248,0.18), rgba(56,189,248,0.04))",
                          border: "1px solid rgba(56,189,248,0.13)",
                          position: "relative",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            left: 3,
                            right: 3,
                            bottom: 3,
                            height: `${Math.max(4, profitHeight * 100)}%`,
                            borderRadius: "7px 7px 2px 2px",
                            background:
                              item.netProfit >= 0
                                ? "linear-gradient(180deg, #4ade80, #16a34a)"
                                : "linear-gradient(180deg, #fb7185, #e11d48)",
                            boxShadow:
                              item.netProfit >= 0
                                ? "0 0 18px rgba(34,197,94,0.22)"
                                : "0 0 18px rgba(225,29,72,0.18)",
                            transition: "height 220ms ease",
                          }}
                        />
                      </div>

                      <div
                        style={{
                          textAlign: "center",
                          color: "rgba(255,255,255,0.38)",
                          fontSize: 10,
                          fontWeight: 850,
                        }}
                      >
                        M{item.month}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3,1fr)",
                  gap: 12,
                  marginTop: 18,
                }}
              >
                <div
                  style={{
                    padding: 15,
                    borderRadius: 16,
                    background: "rgba(255,255,255,0.035)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <div
                    style={{
                      color: "rgba(255,255,255,0.43)",
                      fontSize: 10,
                      fontWeight: 950,
                      textTransform: "uppercase",
                    }}
                  >
                    {language === "it"
                      ? "Mese migliore"
                      : "Best Month"}
                  </div>
                  <div
                    style={{
                      marginTop: 7,
                      color: "#f8fafc",
                      fontWeight: 950,
                      fontSize: 18,
                    }}
                  >
                    M{bestMonth.month}
                  </div>
                  <div
                    style={{
                      marginTop: 3,
                      color: "#22c55e",
                      fontWeight: 850,
                      fontSize: 12,
                    }}
                  >
                    {money(bestMonth.netProfit)}
                  </div>
                </div>

                <div
                  style={{
                    padding: 15,
                    borderRadius: 16,
                    background: "rgba(255,255,255,0.035)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <div
                    style={{
                      color: "rgba(255,255,255,0.43)",
                      fontSize: 10,
                      fontWeight: 950,
                      textTransform: "uppercase",
                    }}
                  >
                    {language === "it"
                      ? "Margine medio"
                      : "Average Margin"}
                  </div>
                  <div
                    style={{
                      marginTop: 7,
                      color: "#f8fafc",
                      fontWeight: 950,
                      fontSize: 18,
                    }}
                  >
                    {pct(averageProjectedNetMargin)}
                  </div>
                  <div
                    style={{
                      marginTop: 3,
                      color: "rgba(255,255,255,0.48)",
                      fontWeight: 800,
                      fontSize: 12,
                    }}
                  >
                    {language === "it"
                      ? "sull'intero periodo"
                      : "across the period"}
                  </div>
                </div>

                <div
                  style={{
                    padding: 15,
                    borderRadius: 16,
                    background: "rgba(255,255,255,0.035)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <div
                    style={{
                      color: "rgba(255,255,255,0.43)",
                      fontSize: 10,
                      fontWeight: 950,
                      textTransform: "uppercase",
                    }}
                  >
                    {language === "it"
                      ? "Salute prevista"
                      : "Forecast Health"}
                  </div>
                  <div
                    style={{
                      marginTop: 7,
                      color:
                        finalPoint.netMargin >= 10
                          ? "#22c55e"
                          : finalPoint.netMargin >= 0
                            ? "#f59e0b"
                            : "#fb7185",
                      fontWeight: 950,
                      fontSize: 18,
                    }}
                  >
                    {health}
                  </div>
                  <div
                    style={{
                      marginTop: 3,
                      color: "rgba(255,255,255,0.48)",
                      fontWeight: 800,
                      fontSize: 12,
                    }}
                  >
                    {pct(finalPoint.netMargin)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 22,
              display: "grid",
              gridTemplateColumns: "1.1fr 0.9fr",
              gap: 20,
            }}
          >
            <div
              style={{
                borderRadius: 24,
                padding: 24,
                background:
                  "linear-gradient(135deg, rgba(255,115,60,0.11), rgba(8,13,22,0.96))",
                border: "1px solid rgba(255,115,60,0.24)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 14,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div
                    style={{
                      color: "#ff9a70",
                      fontSize: 11,
                      fontWeight: 950,
                      textTransform: "uppercase",
                      letterSpacing: "0.13em",
                    }}
                  >
                    {language === "it"
                      ? "Raccomandazione MarginLab"
                      : "MarginLab Recommendation"}
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      color: "#f8fafc",
                      fontSize: 20,
                      fontWeight: 950,
                    }}
                  >
                    {language === "it"
                      ? "Il percorso più credibile verso più profitto"
                      : "The most credible path to more profit"}
                  </div>
                </div>

                <div
                  style={{
                    padding: "8px 11px",
                    borderRadius: 999,
                    color: "#86efac",
                    background: "rgba(34,197,94,0.10)",
                    border: "1px solid rgba(34,197,94,0.22)",
                    fontSize: 11,
                    fontWeight: 950,
                  }}
                >
                  {language === "it"
                    ? `Affidabilità ${dataConfidence.toFixed(0)}%`
                    : `Confidence ${dataConfidence.toFixed(0)}%`}
                </div>
              </div>

              <div
                style={{
                  marginTop: 17,
                  color: "rgba(255,255,255,0.78)",
                  lineHeight: 1.75,
                  fontSize: 14,
                  fontWeight: 730,
                }}
              >
                {recommendation}
              </div>

              <div
                style={{
                  marginTop: 18,
                  display: "grid",
                  gap: 10,
                }}
              >
                {actions.map((action, index) => (
                  <div
                    key={action}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "28px 1fr",
                      gap: 10,
                      alignItems: "start",
                      padding: 13,
                      borderRadius: 14,
                      background: "rgba(255,255,255,0.035)",
                      border: "1px solid rgba(255,115,60,0.11)",
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 9,
                        display: "grid",
                        placeItems: "center",
                        color: "#ffffff",
                        background: "rgba(255,115,80,0.20)",
                        border: "1px solid rgba(255,115,80,0.28)",
                        fontSize: 11,
                        fontWeight: 950,
                      }}
                    >
                      {index + 1}
                    </div>
                    <div
                      style={{
                        color: "rgba(255,255,255,0.72)",
                        lineHeight: 1.5,
                        fontSize: 13,
                        fontWeight: 780,
                      }}
                    >
                      {action}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                borderRadius: 24,
                padding: 24,
                background:
                  "radial-gradient(circle at top right, rgba(56,189,248,0.10), transparent 40%), linear-gradient(180deg, rgba(17,24,39,0.98), rgba(7,12,21,0.99))",
                border: "1px solid rgba(56,189,248,0.18)",
              }}
            >
              <div
                style={{
                  color: "#7dd3fc",
                  fontSize: 11,
                  fontWeight: 950,
                  textTransform: "uppercase",
                  letterSpacing: "0.13em",
                }}
              >
                {language === "it"
                  ? "Obiettivo mensile"
                  : "Monthly Goal"}
              </div>

              <div
                style={{
                  marginTop: 8,
                  color: "#f8fafc",
                  fontSize: 20,
                  fontWeight: 950,
                }}
              >
                {language === "it"
                  ? "Quando raggiungerai il tuo obiettivo?"
                  : "When will you reach your target?"}
              </div>

              <div
                style={{
                  marginTop: 16,
                  padding: 15,
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.035)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div
                  style={{
                    color: "rgba(255,255,255,0.48)",
                    fontSize: 11,
                    fontWeight: 900,
                    textTransform: "uppercase",
                  }}
                >
                  {language === "it"
                    ? "Profitto netto mensile desiderato"
                    : "Target Monthly Net Profit"}
                </div>

                <input
                  type="number"
                  min={0}
                  step={100}
                  value={profitGoal}
                  onChange={(event) =>
                    setProfitGoal(Math.max(0, Number(event.target.value) || 0))
                  }
                  style={{
                    width: "100%",
                    marginTop: 9,
                    padding: "12px 13px",
                    borderRadius: 12,
                    color: "#f8fafc",
                    background: "rgba(4,8,15,0.75)",
                    border: "1px solid rgba(56,189,248,0.23)",
                    outline: "none",
                    fontSize: 20,
                    fontWeight: 950,
                  }}
                />
              </div>

              <div
                style={{
                  marginTop: 16,
                  padding: 18,
                  borderRadius: 18,
                  background:
                    firstGoalMonth !== undefined
                      ? "rgba(34,197,94,0.09)"
                      : "rgba(245,158,11,0.08)",
                  border:
                    firstGoalMonth !== undefined
                      ? "1px solid rgba(34,197,94,0.22)"
                      : "1px solid rgba(245,158,11,0.20)",
                }}
              >
                <div
                  style={{
                    color:
                      firstGoalMonth !== undefined
                        ? "#86efac"
                        : "#fbbf24",
                    fontSize: 11,
                    fontWeight: 950,
                    textTransform: "uppercase",
                    letterSpacing: "0.10em",
                  }}
                >
                  {language === "it"
                    ? "Tempo stimato"
                    : "Estimated Timing"}
                </div>

                <div
                  style={{
                    marginTop: 8,
                    color: "#f8fafc",
                    fontSize: 28,
                    fontWeight: 950,
                    letterSpacing: "-0.04em",
                  }}
                >
                  {firstGoalMonth !== undefined
                    ? language === "it"
                      ? `Mese ${firstGoalMonth}`
                      : `Month ${firstGoalMonth}`
                    : language === "it"
                      ? "Oltre l'orizzonte"
                      : "Beyond horizon"}
                </div>

                <div
                  style={{
                    marginTop: 6,
                    color: "rgba(255,255,255,0.58)",
                    lineHeight: 1.5,
                    fontSize: 12,
                    fontWeight: 750,
                  }}
                >
                  {firstGoalMonth !== undefined
                    ? language === "it"
                      ? `Con queste ipotesi il profitto mensile supera ${money(
                          profitGoal,
                        )}.`
                      : `Under these assumptions, monthly profit exceeds ${money(
                          profitGoal,
                        )}.`
                    : language === "it"
                      ? `Lo scenario non raggiunge ${money(
                          profitGoal,
                        )} entro ${horizon} mesi.`
                      : `The scenario does not reach ${money(
                          profitGoal,
                        )} within ${horizon} months.`}
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 22,
              padding: 18,
              borderRadius: 18,
              background: "rgba(255,115,60,0.07)",
              border: "1px solid rgba(255,115,60,0.18)",
              color: "rgba(255,255,255,0.66)",
              lineHeight: 1.6,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {language === "it"
              ? `Le previsioni sono costruite sui dati Shopify degli ultimi ${periodDays} giorni, normalizzati su base mensile, sulle ipotesi di costo salvate e sulle opportunità di recupero individuate. Sono scenari decisionali, non risultati garantiti.`
              : `Forecasts are built from the last ${periodDays} days of Shopify data, normalized monthly, saved cost assumptions and identified recovery opportunities. They are decision scenarios, not guaranteed outcomes.`}
          </div>
        </div>
      </div>
    </div>
  );
}