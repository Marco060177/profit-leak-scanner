import * as React from "react";
import { useLoaderData, useNavigate } from "react-router";

import prisma from "~/db.server";
import DashboardNav from "~/components/dashboard/DashboardNav";
import MetricTooltip from "~/components/ui/MetricTooltip";
import { authenticate } from "~/shopify.server";
import { loadMarginDashboardData } from "~/utils/margin.server";
import { getBillingStatus, hasGrowthAccess } from "~/utils/billing.server";
import {
  type LoaderData,
  money as formatStoreMoney,
  pct as formatStorePercent,
} from "~/utils/margin";
import { useI18n } from "~/components/i18n/I18nProvider";

import "~/styles/dashboard.css";

type Assumptions = {
  monthlyAds: number;
  monthlyShipping: number;
  monthlyOperating: number;
  paymentFeePct: number;
  transactionFeePct: number;
  taxReservePct: number;
};

type ScenarioKey = "worst" | "expected" | "best" | "custom";

type ScenarioInputs = {
  monthlyRevenueGrowth: number;
  marginImprovement: number;
  monthlyCostGrowth: number;
  recoveryCapture: number;
};

const SCENARIO_INPUTS: Record<
  Exclude<ScenarioKey, "custom">,
  ScenarioInputs
> = {
  worst: {
    monthlyRevenueGrowth: -1,
    marginImprovement: 0,
    monthlyCostGrowth: 2,
    recoveryCapture: 10,
  },
  expected: {
    monthlyRevenueGrowth: 2,
    marginImprovement: 2,
    monthlyCostGrowth: 1,
    recoveryCapture: 50,
  },
  best: {
    monthlyRevenueGrowth: 4,
    marginImprovement: 4,
    monthlyCostGrowth: 0.5,
    recoveryCapture: 100,
  },
};

export async function loader({ request }: { request: Request }) {
  const { admin, session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const locale = url.searchParams.get("lang") === "it" ? "it-IT" : "en-US";
  const period = url.searchParams.get("period") ?? "30";
  const parsedPeriod = Number(period);
  const forecastPeriod =
    Number.isFinite(parsedPeriod) && parsedPeriod > 0 ? parsedPeriod : 30;

  const billing = await getBillingStatus(admin);
  const growthAccess = hasGrowthAccess(billing);

  const dashboardData = await loadMarginDashboardData({
    admin,
    session,
    period,
    locale,
  });

  const assumptions = growthAccess
    ? (await prisma.profitAssumptions.findUnique({
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
    }
    : {
      monthlyAds: 0,
      monthlyShipping: 0,
      monthlyOperating: 0,
      paymentFeePct: 0,
      transactionFeePct: 0,
      taxReservePct: 0,
    };

  return {
    ...dashboardData,
    billing,
    growthAccess,
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

function roundMoney(value: number) {
  return Math.round((safeNumber(value) + Number.EPSILON) * 100) / 100;
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
  tooltip,
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
  tooltip?: React.ReactNode;
}) {
  const { locale } = useI18n();
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "#f8fafc",
              fontWeight: 900,
              fontSize: 14,
            }}
          >
            <span>{label}</span>
            {tooltip}
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
          {new Intl.NumberFormat(locale, {
            minimumFractionDigits: step < 1 ? 1 : 0,
            maximumFractionDigits: step < 1 ? 1 : 0,
          }).format(value)}
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
  tooltip,
}: {
  label: string;
  value: string;
  note: string;
  positive?: boolean;
  highlighted?: boolean;
  tooltip?: React.ReactNode;
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
        boxShadow: highlighted ? "0 18px 45px rgba(34,197,94,0.08)" : "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: highlighted ? "#4ade80" : "rgba(255,255,255,0.52)",
          fontSize: 10,
          fontWeight: 950,
          letterSpacing: "0.13em",
          textTransform: "uppercase",
        }}
      >
        <span>{label}</span>
        {tooltip}
      </div>

      <div
        style={{
          marginTop: 13,
          color: positive || highlighted ? "#22c55e" : "#f8fafc",
          fontSize: 30,
          lineHeight: 1,
          fontWeight: 950,
          letterSpacing: "-0.04em",
          overflowWrap: "anywhere",
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
  const { language, locale, messages, t } = useI18n();
  const copy = messages.forecastingPage;

  const {
    summary,
    rows,
    assumptions,
    forecastPeriod,
    currencyCode,
    economicSnapshot,
    shopHandle,
    growthAccess,
  } =
    useLoaderData() as LoaderData & {
      growthAccess: boolean;
      assumptions: Assumptions;
      forecastPeriod: number;
    };

  const money = (value: number, digits = 0) =>
    formatStoreMoney(value, currencyCode, locale, digits);

  const pct = (value: number, digits = 1) =>
    formatStorePercent(value, locale, digits);

  const number = (value: number, digits = 1) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(Number.isFinite(value) ? value : 0);

  function compactMoney(n: number) {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(safeNumber(n));
  }

  const periodDays = Math.max(1, forecastPeriod);
  const monthlyFactor = 30 / periodDays;

  const economicRevenueInPeriod = safeNumber(
    summary.economicRevenue ?? summary.revenue,
  );

  const economicCogsInPeriod = safeNumber(
    summary.economicCogs ?? summary.cogs,
  );

  const economicProfitInPeriod = safeNumber(
    summary.economicProfit ?? summary.profit,
  );

  const monthlyRevenue = economicRevenueInPeriod * monthlyFactor;
  const monthlyCogs = economicCogsInPeriod * monthlyFactor;
  const monthlyGrossProfit = economicProfitInPeriod * monthlyFactor;

  const recoverableProfitInPeriod = rows.reduce((sum, row) => {
    const qty = Math.max(0, safeNumber(row.qty));
    const economicRevenue = safeNumber(row.economicRevenue ?? row.revenue);
    const economicProfit = safeNumber(row.economicProfit ?? row.profit);
    const economicMarginPct = safeNumber(
      row.economicMarginPct ?? row.marginPct,
    );

    if (qty <= 0 || economicRevenue <= 0 || economicMarginPct >= 20) {
      return sum;
    }

    const targetEconomicProfit = economicRevenue * 0.2;
    return sum + Math.max(0, targetEconomicProfit - economicProfit);
  }, 0);
  const monthlyRecoverableProfit =
    economicSnapshot?.totals.monthlyOpportunity ??
    recoverableProfitInPeriod * monthlyFactor;

  const impactedProducts = rows.filter((row) => {
    const economicRevenue = safeNumber(row.economicRevenue ?? row.revenue);
    const economicMarginPct = safeNumber(
      row.economicMarginPct ?? row.marginPct,
    );

    return economicRevenue > 0 && economicMarginPct < 20;
  }).length;

  const monthlyFixedCosts =
    safeNumber(assumptions.monthlyAds) +
    safeNumber(assumptions.monthlyShipping) +
    safeNumber(assumptions.monthlyOperating);

  const variableFeePct =
    safeNumber(assumptions.paymentFeePct) +
    safeNumber(assumptions.transactionFeePct);

  const taxReserveRate = clamp(
    safeNumber(assumptions.taxReservePct) / 100,
    0,
    1,
  );

  const currentMonthlyVariableFees = monthlyRevenue * (variableFeePct / 100);

  const currentMonthlyProfitBeforeTaxReserve =
    monthlyGrossProfit - monthlyFixedCosts - currentMonthlyVariableFees;

  // This is a separate managerial reserve from Business Model Studio.
  // VAT/GST/Sales Tax treatment is already reflected in the economic baseline above.

  const currentMonthlyTaxReserve =
    Math.max(0, currentMonthlyProfitBeforeTaxReserve) * taxReserveRate;

  const currentMonthlyNetProfit =
    currentMonthlyProfitBeforeTaxReserve - currentMonthlyTaxReserve;

  const currentNetMargin =
    monthlyRevenue > 0 ? (currentMonthlyNetProfit / monthlyRevenue) * 100 : 0;

  const [selectedScenario, setSelectedScenario] =
    React.useState<ScenarioKey>("expected");
  const [horizon, setHorizon] = React.useState(12);
  const [monthlyRevenueGrowth, setMonthlyRevenueGrowth] = React.useState(2);
  const [marginImprovement, setMarginImprovement] = React.useState(2);
  const [monthlyCostGrowth, setMonthlyCostGrowth] = React.useState(1);
  const [recoveryCapture, setRecoveryCapture] = React.useState(50);
  const [profitGoal, setProfitGoal] = React.useState(
    Math.max(0, Math.round(currentMonthlyNetProfit * 1.5)),
  );

  const applyScenario = React.useCallback(
    (scenario: Exclude<ScenarioKey, "custom">) => {
      setSelectedScenario(scenario);
      const inputs = SCENARIO_INPUTS[scenario];
      setMonthlyRevenueGrowth(inputs.monthlyRevenueGrowth);
      setMarginImprovement(inputs.marginImprovement);
      setMonthlyCostGrowth(inputs.monthlyCostGrowth);
      setRecoveryCapture(inputs.recoveryCapture);
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
    const roundedCurrentMonthlyNetProfit = roundMoney(currentMonthlyNetProfit);

    for (let month = 1; month <= horizon; month += 1) {
      const revenueGrowthFactor = Math.pow(
        1 + monthlyRevenueGrowth / 100,
        month,
      );
      const costGrowthFactor = Math.pow(1 + monthlyCostGrowth / 100, month);

      const revenue = roundMoney(monthlyRevenue * revenueGrowthFactor);
      const baselineGrossMarginPct =
        monthlyRevenue > 0 ? (monthlyGrossProfit / monthlyRevenue) * 100 : 0;

      const improvedGrossMarginPct = clamp(
        baselineGrossMarginPct + marginImprovement * (month / horizon),
        -100,
        95,
      );

      const baselineGrossProfit = roundMoney(
        revenue * (baselineGrossMarginPct / 100),
      );
      const marginImprovementValue = roundMoney(
        revenue *
        ((improvedGrossMarginPct - baselineGrossMarginPct) / 100),
      );

      const capturedRecovery = roundMoney(
        monthlyRecoverableProfit *
        (recoveryCapture / 100) *
        Math.min(1, month / Math.max(1, horizon / 2)),
      );

      const grossProfit = roundMoney(
        baselineGrossProfit +
        Math.max(marginImprovementValue, capturedRecovery),
      );

      const fixedCosts = roundMoney(monthlyFixedCosts * costGrowthFactor);
      const variableFees = roundMoney(revenue * (variableFeePct / 100));
      const profitBeforeTaxReserve = roundMoney(
        grossProfit - fixedCosts - variableFees,
      );
      const taxReserve = roundMoney(
        Math.max(0, profitBeforeTaxReserve) * taxReserveRate,
      );
      const netProfit = roundMoney(profitBeforeTaxReserve - taxReserve);

      const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

      cumulativeNetProfit = roundMoney(cumulativeNetProfit + netProfit);

      points.push({
        month,
        revenue,
        grossProfit,
        netProfit,
        netMargin,
        cumulativeNetProfit,
        cumulativeLift: roundMoney(
          cumulativeNetProfit - roundedCurrentMonthlyNetProfit * month,
        ),
      });
    }

    return points;
  }, [
    horizon,
    currentMonthlyNetProfit,
    marginImprovement,
    monthlyCostGrowth,
    monthlyFixedCosts,
    monthlyGrossProfit,
    monthlyRecoverableProfit,
    monthlyRevenue,
    monthlyRevenueGrowth,
    recoveryCapture,
    taxReserveRate,
    variableFeePct,
  ]);

  const finalPoint = forecast[forecast.length - 1] ?? {
    revenue: monthlyRevenue,
    grossProfit: monthlyGrossProfit,
    netProfit: currentMonthlyNetProfit,
    netMargin: currentNetMargin,
    cumulativeNetProfit: currentMonthlyNetProfit,
    cumulativeLift: 0,
    month: horizon,
  };

  const scenarioComparison = (
    Object.entries(SCENARIO_INPUTS) as Array<
      [Exclude<ScenarioKey, "custom">, ScenarioInputs]
    >
  ).map(([key, inputs]) => {
    let cumulativeNetProfit = 0;
    const roundedCurrentMonthlyNetProfit = roundMoney(currentMonthlyNetProfit);
    let finalNetProfit = roundedCurrentMonthlyNetProfit;
    let finalNetMargin = currentNetMargin;

    for (let month = 1; month <= horizon; month += 1) {
      const revenue = roundMoney(
        monthlyRevenue *
        Math.pow(1 + inputs.monthlyRevenueGrowth / 100, month),
      );
      const baselineGrossMarginPct =
        monthlyRevenue > 0 ? (monthlyGrossProfit / monthlyRevenue) * 100 : 0;
      const improvedGrossMarginPct = clamp(
        baselineGrossMarginPct + inputs.marginImprovement * (month / horizon),
        -100,
        95,
      );
      const baselineGrossProfit = roundMoney(
        revenue * (baselineGrossMarginPct / 100),
      );
      const marginImprovementValue = roundMoney(
        revenue *
        ((improvedGrossMarginPct - baselineGrossMarginPct) / 100),
      );
      const capturedRecovery = roundMoney(
        monthlyRecoverableProfit *
        (inputs.recoveryCapture / 100) *
        Math.min(1, month / Math.max(1, horizon / 2)),
      );
      const grossProfit = roundMoney(
        baselineGrossProfit +
        Math.max(marginImprovementValue, capturedRecovery),
      );
      const fixedCosts = roundMoney(
        monthlyFixedCosts *
        Math.pow(1 + inputs.monthlyCostGrowth / 100, month),
      );
      const variableFees = roundMoney(revenue * (variableFeePct / 100));

      const profitBeforeTaxReserve = roundMoney(
        grossProfit - fixedCosts - variableFees,
      );
      const taxReserve = roundMoney(
        Math.max(0, profitBeforeTaxReserve) * taxReserveRate,
      );
      finalNetProfit = roundMoney(profitBeforeTaxReserve - taxReserve);
      finalNetMargin = revenue > 0 ? (finalNetProfit / revenue) * 100 : 0;
      cumulativeNetProfit = roundMoney(
        cumulativeNetProfit + finalNetProfit,
      );
    }

    return {
      key,
      finalNetProfit,
      finalNetMargin,
      cumulativeNetProfit,
      differenceFromCurrent: roundMoney(
        cumulativeNetProfit - roundedCurrentMonthlyNetProfit * horizon,
      ),
    };
  });

  const totalProjectedRevenue = forecast.reduce(
    (sum, item) => roundMoney(sum + item.revenue),
    0,
  );
  const totalProjectedNetProfit = forecast.reduce(
    (sum, item) => roundMoney(sum + item.netProfit),
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

  const dataConfidence =
    economicSnapshot?.confidence.score ??
    clamp(
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
      ? `Lo scenario ${selectedScenario === "custom"
        ? "personalizzato"
        : selectedScenario === "expected"
          ? "realistico"
          : selectedScenario === "worst"
            ? "negativo"
            : "positivo"
      } porta il profitto netto mensile stimato da ${money(
        currentMonthlyNetProfit,
      )} a ${money(
        finalPoint.netProfit,
      )} entro ${horizon} mesi. La leva con l'impatto maggiore è il ${strongestLever}. Con un miglioramento del margine di ${number(
        marginImprovement,
        1,
      )} punti e il recupero del ${pct(
        recoveryCapture,
        0,
      )} delle opportunità individuate, il profitto cumulativo aggiuntivo stimato è ${money(
        finalPoint.cumulativeLift,
      )}.`
      : `The ${selectedScenario === "custom"
        ? "custom"
        : selectedScenario === "expected"
          ? "expected-case"
          : selectedScenario === "worst"
            ? "worst-case"
            : "best-case"
      } scenario moves estimated monthly net profit from ${money(
        currentMonthlyNetProfit,
      )} to ${money(
        finalPoint.netProfit,
      )} within ${horizon} months. The strongest lever is ${strongestLever}. With a ${number(
        marginImprovement,
        1,
      )}-point margin improvement and ${pct(
        recoveryCapture,
        0,
      )} of identified opportunities captured, estimated cumulative additional profit is ${money(
        finalPoint.cumulativeLift,
      )}.`;

  const actions =
    language === "it"
      ? [
        marginImprovement > 0
          ? `Porta gradualmente il margine economico a +${number(
            marginImprovement,
            1,
          )} punti rispetto al livello attuale.`
          : "Mantieni stabile il margine economico e monitora i prodotti più deboli.",
        recoveryCapture > 0
          ? `Intervieni prima sui ${impactedProducts} prodotti con opportunità di recupero.`
          : "Valuta almeno una parte delle opportunità di recupero già individuate.",
        monthlyCostGrowth > 1
          ? "Contieni la crescita dei costi mensili: sta riducendo il beneficio della crescita."
          : "La crescita dei costi è sotto controllo nello scenario selezionato.",
      ]
      : [
        marginImprovement > 0
          ? `Gradually lift economic margin by ${number(
            marginImprovement,
            1,
          )} points from the current level.`
          : "Keep economic margin stable and monitor the weakest products.",
        recoveryCapture > 0
          ? `Prioritize the ${impactedProducts} products with identified recovery potential.`
          : "Capture at least part of the recovery opportunities already identified.",
        monthlyCostGrowth > 1
          ? "Contain monthly cost growth because it is reducing the benefit of revenue growth."
          : "Cost growth remains controlled in the selected scenario.",
      ];

  const displayHealth = language !== "fr"
    ? health
    : finalPoint.netMargin >= 20
      ? "Très solide"
      : finalPoint.netMargin >= 10
        ? "En amélioration"
        : finalPoint.netMargin >= 0
          ? "Fragile"
          : "À risque";

  const displayStrongestLever = language !== "fr"
    ? strongestLever
    : marginImprovement >= monthlyRevenueGrowth && marginImprovement >= recoveryCapture / 25
      ? "l'amélioration de la marge"
      : monthlyRevenueGrowth >= recoveryCapture / 25
        ? "la croissance du chiffre d'affaires"
        : "la récupération des opportunités";

  const displayRecommendation = language !== "fr"
    ? recommendation
    : `Le scénario ${selectedScenario === "custom" ? "personnalisé" : selectedScenario === "expected" ? "prévu" : selectedScenario === "worst" ? "défavorable" : "favorable"} fait passer le bénéfice net mensuel estimé de ${money(currentMonthlyNetProfit)} à ${money(finalPoint.netProfit)} en ${horizon} mois. Le levier le plus important est ${displayStrongestLever}. Avec une amélioration de la marge de ${number(marginImprovement, 1)} points et la récupération de ${pct(recoveryCapture, 0)} des opportunités identifiées, le bénéfice supplémentaire cumulé estimé atteint ${money(finalPoint.cumulativeLift)}.`;

  const displayActions = language !== "fr" ? actions : [
    marginImprovement > 0
      ? `Augmentez progressivement la marge économique de ${number(marginImprovement, 1)} points par rapport au niveau actuel.`
      : "Maintenez la marge économique stable et surveillez les produits les plus faibles.",
    recoveryCapture > 0
      ? `Donnez la priorité aux ${impactedProducts} produits présentant un potentiel de récupération identifié.`
      : "Exploitez au moins une partie des opportunités de récupération déjà identifiées.",
    monthlyCostGrowth > 1
      ? "Contenez la croissance mensuelle des coûts, car elle réduit le bénéfice de la croissance du chiffre d'affaires."
      : "La croissance des coûts reste maîtrisée dans le scénario sélectionné.",
  ];

  const exportForecastCsv = () => {
    type CsvValue = string | number;

    const round = (value: number, digits = 2) => {
      const factor = 10 ** digits;
      return Math.round((safeNumber(value) + Number.EPSILON) * factor) / factor;
    };

    const csvCell = (value: CsvValue) => {
      if (typeof value === "number") {
        return Number.isFinite(value) ? String(value) : "0";
      }

      const protectedValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
      return `"${protectedValue.replace(/"/g, '""')}"`;
    };

    const scenarioLabels: Record<ScenarioKey, string> = {
      worst: language === "it" ? "Negativo" : "Worst case",
      expected: language === "it" ? "Realistico" : "Expected case",
      best: language === "it" ? "Positivo" : "Best case",
      custom: language === "it" ? "Personalizzato" : "Custom",
    };

    const comparisonLabels: Record<Exclude<ScenarioKey, "custom">, string> = {
      worst: language === "it" ? "Negativo" : "Worst case",
      expected: language === "it" ? "Realistico" : "Expected case",
      best: language === "it" ? "Positivo" : "Best case",
    };

    const rowsToExport: CsvValue[][] = [
      ["MarginLab Profit Forecasting"],
      [],
      [language === "it" ? "METADATI" : "METADATA"],
      [language === "it" ? "Voce" : "Field", language === "it" ? "Valore" : "Value"],
      ["Store", shopHandle ?? ""],
      [language === "it" ? "Data esportazione" : "Export date", new Date().toISOString()],
      [language === "it" ? "Periodo osservato (giorni)" : "Observed period (days)", periodDays],
      [language === "it" ? "Orizzonte previsione (mesi)" : "Forecast horizon (months)", horizon],
      [language === "it" ? "Valuta" : "Currency", currencyCode],
      [language === "it" ? "Lingua" : "Language", language.toUpperCase()],
      [language === "it" ? "Scenario selezionato" : "Selected scenario", scenarioLabels[selectedScenario]],
      ["Data Confidence", round(dataConfidence)],
      [],
      [language === "it" ? "BASELINE ECONOMICA MENSILE" : "MONTHLY ECONOMIC BASELINE"],
      [language === "it" ? "Voce" : "Metric", language === "it" ? "Valore" : "Value"],
      [language === "it" ? "Ricavi economici mensili" : "Monthly economic revenue", round(monthlyRevenue)],
      ["COGS", round(monthlyCogs)],
      [language === "it" ? "Profitto economico mensile" : "Monthly economic profit", round(monthlyGrossProfit)],
      [language === "it" ? "Costi fissi mensili" : "Monthly fixed costs", round(monthlyFixedCosts)],
      [language === "it" ? "Commissioni variabili mensili" : "Monthly variable fees", round(currentMonthlyVariableFees)],
      [language === "it" ? "Riserva fiscale gestionale mensile" : "Monthly business-model tax reserve", round(currentMonthlyTaxReserve)],
      [language === "it" ? "Profitto netto mensile" : "Monthly net profit", round(currentMonthlyNetProfit)],
      [language === "it" ? "Margine netto attuale (%)" : "Current net margin (%)", round(currentNetMargin)],
      [language === "it" ? "Opportunita mensile recuperabile" : "Monthly recoverable opportunity", round(monthlyRecoverableProfit)],
      [language === "it" ? "Prodotti con opportunita" : "Products with opportunity", impactedProducts],
      [],
      [language === "it" ? "IPOTESI DELLO SCENARIO" : "SCENARIO ASSUMPTIONS"],
      [language === "it" ? "Ipotesi" : "Assumption", language === "it" ? "Valore" : "Value"],
      [language === "it" ? "Crescita mensile ricavi (%)" : "Monthly revenue growth (%)", round(monthlyRevenueGrowth)],
      [language === "it" ? "Miglioramento margine (punti %)" : "Margin improvement (percentage points)", round(marginImprovement)],
      [language === "it" ? "Crescita mensile costi (%)" : "Monthly cost growth (%)", round(monthlyCostGrowth)],
      [language === "it" ? "Recupero opportunita (%)" : "Opportunity recovery (%)", round(recoveryCapture)],
      [language === "it" ? "Obiettivo profitto mensile" : "Monthly profit goal", round(profitGoal)],
      [language === "it" ? "Spesa pubblicitaria mensile" : "Monthly advertising", round(assumptions.monthlyAds)],
      [language === "it" ? "Spedizioni mensili" : "Monthly shipping", round(assumptions.monthlyShipping)],
      [language === "it" ? "Costi operativi mensili" : "Monthly operating costs", round(assumptions.monthlyOperating)],
      [language === "it" ? "Commissioni pagamento (%)" : "Payment fees (%)", round(assumptions.paymentFeePct)],
      [language === "it" ? "Commissioni transazione (%)" : "Transaction fees (%)", round(assumptions.transactionFeePct)],
      [language === "it" ? "Riserva fiscale gestionale (%)" : "Business-model tax reserve (%)", round(assumptions.taxReservePct)],
      [],
      [language === "it" ? "RISULTATI DELLA PREVISIONE" : "FORECAST RESULTS"],
      [language === "it" ? "Voce" : "Metric", language === "it" ? "Valore" : "Value"],
      [language === "it" ? "Ricavi totali previsti" : "Total projected revenue", round(totalProjectedRevenue)],
      [language === "it" ? "Profitto netto totale previsto" : "Total projected net profit", round(totalProjectedNetProfit)],
      [language === "it" ? "Margine netto medio (%)" : "Average net margin (%)", round(averageProjectedNetMargin)],
      [language === "it" ? "Profitto netto al mese finale" : "Final-month net profit", round(finalPoint.netProfit)],
      [language === "it" ? "Margine netto al mese finale (%)" : "Final-month net margin (%)", round(finalPoint.netMargin)],
      [language === "it" ? "Profitto aggiuntivo cumulativo" : "Cumulative profit lift", round(finalPoint.cumulativeLift)],
      [language === "it" ? "Mese migliore" : "Best month", bestMonth.month],
      [language === "it" ? "Profitto nel mese migliore" : "Best-month net profit", round(bestMonth.netProfit)],
      [language === "it" ? "Primo mese obiettivo" : "First goal month", firstGoalMonth ?? (language === "it" ? "Oltre l'orizzonte" : "Beyond horizon")],
      [language === "it" ? "Salute prevista" : "Forecast health", health],
      [language === "it" ? "Leva principale" : "Strongest lever", strongestLever],
      [],
      [language === "it" ? "DETTAGLIO MENSILE" : "MONTHLY DETAIL"],
      [language === "it" ? "Mese" : "Month", language === "it" ? "Ricavi" : "Revenue", language === "it" ? "Profitto lordo" : "Gross profit", language === "it" ? "Profitto netto" : "Net profit", language === "it" ? "Margine netto (%)" : "Net margin (%)", language === "it" ? "Profitto netto cumulativo" : "Cumulative net profit", language === "it" ? "Incremento cumulativo" : "Cumulative lift"],
      ...forecast.map((item) => [item.month, round(item.revenue), round(item.grossProfit), round(item.netProfit), round(item.netMargin), round(item.cumulativeNetProfit), round(item.cumulativeLift)] as CsvValue[]),
      [],
      [language === "it" ? "CONFRONTO SCENARI" : "SCENARIO COMPARISON"],
      [language === "it" ? "Scenario" : "Scenario", language === "it" ? "Profitto netto mese finale" : "Final-month net profit", language === "it" ? "Margine netto finale (%)" : "Final net margin (%)", language === "it" ? "Profitto netto cumulativo" : "Cumulative net profit", language === "it" ? "Differenza cumulativa dalla baseline" : "Cumulative difference from baseline"],
      ...scenarioComparison.map((item) => [comparisonLabels[item.key], round(item.finalNetProfit), round(item.finalNetMargin), round(item.cumulativeNetProfit), round(item.differenceFromCurrent)] as CsvValue[]),
      [],
      [language === "it" ? "RACCOMANDAZIONE" : "RECOMMENDATION"],
      [recommendation],
      [],
      [language === "it" ? "AZIONI CONSIGLIATE" : "RECOMMENDED ACTIONS"],
      [language === "it" ? "Priorita" : "Priority", language === "it" ? "Azione" : "Action"],
      ...actions.map((action, index) => [index + 1, action] as CsvValue[]),
      [],
      [language === "it" ? "Nota: questa previsione e uno scenario decisionale basato sui dati e sulle ipotesi correnti, non un risultato garantito. Gli scenari alternativi non sono additivi." : "Note: this forecast is a decision scenario based on current data and assumptions, not a guaranteed outcome. Alternative scenarios are non-additive."],
    ];

    const csv = `\uFEFF${rowsToExport.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${shopHandle || "store"}-forecast-${scenarioLabels[selectedScenario].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}-${horizon}m.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardNav active="forecasting" navigate={navigate} />

        <div className="hero-header">
          <div>
            <div className="alert-pill">
              <span className="alert-dot" />
              {growthAccess
                ? copy.auto.f001
                : copy.auto.f002}
            </div>

            <div className="eyebrow">
              {copy.auto.f003}
            </div>

            <div className="hero-title">
              {copy.auto.f004}
            </div>

            <div className="hero-description">
              {copy.auto.f005}
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
              {copy.auto.f006}
            </div>
          </div>

          {!growthAccess && (
            <button
              className="primary-button"
              onClick={() => navigate("/app/billing")}
              style={{
                boxShadow:
                  "0 12px 30px rgba(255,115,80,0.28), 0 0 28px rgba(255,115,80,0.16)",
              }}
            >
              {copy.auto.f007}
            </button>
          )}
        </div>

        <div
          className="panel"
          style={{
            position: "relative",
            ...(growthAccess ? {} : { overflow: "hidden" }),
          }}
        >
          {!growthAccess && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 50,
                display: "grid",
                placeItems: "start center",
                paddingTop: 150,
                background:
                  "linear-gradient(180deg, rgba(5,9,16,0.28), rgba(5,9,16,0.74) 26%, rgba(5,9,16,0.9))",
                backdropFilter: "blur(2px)",
              }}
            >
              <div
                style={{
                  width: "min(560px, calc(100% - 40px))",
                  padding: 26,
                  borderRadius: 24,
                  textAlign: "center",
                  background:
                    "linear-gradient(180deg, rgba(17,24,39,0.98), rgba(7,12,21,0.99))",
                  border: "1px solid rgba(255,115,60,0.3)",
                  boxShadow: "0 24px 70px rgba(0,0,0,0.42)",
                }}
              >
                <div
                  style={{
                    color: "#ff9a70",
                    fontSize: 11,
                    fontWeight: 950,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  {copy.auto.f008}
                </div>

                <div
                  style={{
                    marginTop: 10,
                    color: "#f8fafc",
                    fontSize: 24,
                    lineHeight: 1.25,
                    fontWeight: 950,
                  }}
                >
                  {copy.auto.f009}
                </div>

                <div
                  style={{
                    marginTop: 10,
                    color: "rgba(255,255,255,0.62)",
                    fontSize: 13,
                    lineHeight: 1.65,
                    fontWeight: 750,
                  }}
                >
                  {copy.auto.f010}
                </div>

                <button
                  type="button"
                  className="primary-button"
                  onClick={() => navigate("/app/billing")}
                  style={{ marginTop: 18 }}
                >
                  {copy.auto.f011}
                </button>
              </div>
            </div>
          )}

          <div
            aria-hidden={!growthAccess}
            style={
              growthAccess
                ? undefined
                : {
                  pointerEvents: "none",
                  userSelect: "none",
                  opacity: 0.5,
                }
            }
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4,minmax(0,1fr))",
                gap: 16,
              }}
            >
              <MetricCard
                label={
                  copy.auto.f012
                }
                value={money(currentMonthlyNetProfit)}
                note={
                  t("forecastingPage.netMarginBasis", { value: pct(currentNetMargin) })
                }
                tooltip={
                  <MetricTooltip
                    content={{
                      title:
                        copy.auto.f013,
                      description:
                        copy.auto.f014,
                    }}
                  />
                }
              />

              <MetricCard
                label={
                  t("forecastingPage.profitAtMonth", { horizon })
                }
                value={money(finalPoint.netProfit)}
                note={
                  t("forecastingPage.projectedNetMargin", { value: pct(finalPoint.netMargin) })
                }
                positive={finalPoint.netProfit >= currentMonthlyNetProfit}
              />

              <MetricCard
                label={
                  copy.auto.f015
                }
                value={
                  finalPoint.cumulativeLift > 0
                    ? `+${money(finalPoint.cumulativeLift)}`
                    : money(finalPoint.cumulativeLift)
                }
                note={
                  t("forecastingPage.totalImpact", { horizon })
                }
                highlighted={finalPoint.cumulativeLift >= 0}
                tooltip={
                  <MetricTooltip
                    content={{
                      title:
                        copy.auto.f016,
                      description:
                        copy.auto.f017,
                    }}
                  />
                }
              />

              <MetricCard
                label={
                  copy.auto.f018
                }
                value={compactMoney(totalProjectedRevenue)}
                note={
                  t("forecastingPage.forecastTotal", { horizon })
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
                  {copy.auto.f019}
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
                  {copy.auto.f020}
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
                  {copy.auto.f021}
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
                      [
                        "worst",
                        copy.auto.f022,
                      ],
                      [
                        "expected",
                        copy.auto.f023,
                      ],
                      ["best", copy.auto.f024],
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
                    {copy.auto.f025}
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
                      copy.auto.f026
                    }
                    value={monthlyRevenueGrowth}
                    min={-5}
                    max={8}
                    step={0.5}
                    suffix="%"
                    helper={
                      copy.auto.f027
                    }
                    onChange={(value) =>
                      setCustomValue(setMonthlyRevenueGrowth, value)
                    }
                  />

                  <SliderControl
                    label={
                      copy.auto.f028
                    }
                    value={marginImprovement}
                    min={0}
                    max={10}
                    step={0.5}
                    suffix=" pt"
                    helper={
                      copy.auto.f029
                    }
                    onChange={(value) =>
                      setCustomValue(setMarginImprovement, value)
                    }
                    accent="#22c55e"
                  />

                  <SliderControl
                    label={
                      copy.auto.f030
                    }
                    value={monthlyCostGrowth}
                    min={-2}
                    max={6}
                    step={0.5}
                    suffix="%"
                    helper={
                      copy.auto.f031
                    }
                    onChange={(value) =>
                      setCustomValue(setMonthlyCostGrowth, value)
                    }
                    accent="#f59e0b"
                  />

                  <SliderControl
                    label={
                      copy.auto.f032
                    }
                    value={recoveryCapture}
                    min={0}
                    max={100}
                    step={5}
                    suffix="%"
                    helper={
                      copy.auto.f033
                    }
                    onChange={(value) =>
                      setCustomValue(setRecoveryCapture, value)
                    }
                    accent="#38bdf8"
                    tooltip={
                      <MetricTooltip
                        content={{
                          title:
                            copy.auto.f034,
                          description:
                            copy.auto.f035,
                        }}
                      />
                    }
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
                      {copy.auto.f036}
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
                      {copy.auto.f037}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      onClick={exportForecastCsv}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 12,
                        cursor: "pointer",
                        border: "1px solid rgba(74,222,128,0.28)",
                        background: "rgba(34,197,94,0.10)",
                        color: "#bbf7d0",
                        fontWeight: 900,
                      }}
                    >
                      {copy.auto.f038}
                    </button>

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
                        title={`${copy.auto.f039} ${item.month}: ${money(item.netProfit)}`}
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
                      {copy.auto.f040}
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
                      {copy.auto.f041}
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
                      {copy.auto.f042}
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
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        color: "rgba(255,255,255,0.43)",
                        fontSize: 10,
                        fontWeight: 950,
                        textTransform: "uppercase",
                      }}
                    >
                      <span>
                        {copy.auto.f043}
                      </span>

                      <MetricTooltip
                        content={{
                          title:
                            copy.auto.f044,
                          description:
                            copy.auto.f045,
                        }}
                      />
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
                      {displayHealth}
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
                borderRadius: 24,
                padding: 24,
                background:
                  "linear-gradient(180deg, rgba(17,24,39,0.98), rgba(7,12,21,0.99))",
                border: "1px solid rgba(255,115,60,0.18)",
              }}
            >
              <div
                style={{
                  color: "#ff9a70",
                  fontSize: 11,
                  fontWeight: 950,
                  textTransform: "uppercase",
                  letterSpacing: "0.13em",
                }}
              >
                {copy.auto.f046}
              </div>

              <div
                style={{
                  marginTop: 8,
                  color: "#f8fafc",
                  fontSize: 20,
                  fontWeight: 950,
                }}
              >
                {t("forecastingPage.possibleOutcomes", { horizon })}
              </div>

              <div
                style={{
                  marginTop: 18,
                  display: "grid",
                  gridTemplateColumns: "repeat(3,minmax(0,1fr))",
                  gap: 12,
                }}
              >
                {scenarioComparison.map((scenario) => {
                  const active = selectedScenario === scenario.key;
                  const label =
                    scenario.key === "worst"
                      ? copy.auto.f047
                      : scenario.key === "expected"
                        ? copy.auto.f048
                        : copy.auto.f049;
                  const accent =
                    scenario.key === "worst"
                      ? "#fb7185"
                      : scenario.key === "expected"
                        ? "#ff9a70"
                        : "#4ade80";

                  return (
                    <button
                      key={scenario.key}
                      type="button"
                      onClick={() => applyScenario(scenario.key)}
                      style={{
                        padding: 18,
                        borderRadius: 18,
                        cursor: "pointer",
                        textAlign: "left",
                        background: active
                          ? `${accent}12`
                          : "rgba(255,255,255,0.03)",
                        border: active
                          ? `1px solid ${accent}55`
                          : "1px solid rgba(255,255,255,0.07)",
                        color: "#f8fafc",
                      }}
                    >
                      <div
                        style={{
                          color: accent,
                          fontSize: 12,
                          fontWeight: 950,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                      >
                        {label}
                      </div>

                      {[
                        [
                          copy.auto.f050,
                          money(scenario.finalNetProfit),
                        ],
                        [
                          copy.auto.f051,
                          pct(scenario.finalNetMargin),
                        ],
                        [
                          copy.auto.f052,
                          money(scenario.cumulativeNetProfit),
                        ],
                        [
                          copy.auto.f053,
                          `${scenario.differenceFromCurrent >= 0 ? "+" : ""}${money(
                            scenario.differenceFromCurrent,
                          )}`,
                        ],
                      ].map(([metricLabel, metricValue]) => (
                        <div
                          key={metricLabel}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12,
                            marginTop: 13,
                            paddingTop: 13,
                            borderTop: "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          <span
                            style={{
                              color: "rgba(255,255,255,0.48)",
                              fontSize: 11,
                              fontWeight: 800,
                            }}
                          >
                            {metricLabel}
                          </span>
                          <span
                            style={{
                              color:
                                metricLabel ===
                                  (copy.auto.f054) &&
                                  scenario.differenceFromCurrent < 0
                                  ? "#fb7185"
                                  : "#f8fafc",
                              fontSize: 12,
                              fontWeight: 950,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {metricValue}
                          </span>
                        </div>
                      ))}
                    </button>
                  );
                })}
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
                      {copy.auto.f055}
                    </div>
                    <div
                      style={{
                        marginTop: 8,
                        color: "#f8fafc",
                        fontSize: 20,
                        fontWeight: 950,
                      }}
                    >
                      {copy.auto.f056}
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
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span>
                      {t("forecastingPage.dataQuality", { value: pct(dataConfidence, 0) })}
                    </span>

                    <MetricTooltip
                      content={{
                        title:
                          copy.auto.f057,
                        description:
                          copy.auto.f058,
                      }}
                    />
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
                  {displayRecommendation}
                </div>

                <div
                  style={{
                    marginTop: 18,
                    display: "grid",
                    gap: 10,
                  }}
                >
                  {displayActions.map((action, index) => (
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
                  {copy.auto.f059}
                </div>

                <div
                  style={{
                    marginTop: 8,
                    color: "#f8fafc",
                    fontSize: 20,
                    fontWeight: 950,
                  }}
                >
                  {copy.auto.f060}
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
                    {copy.auto.f061}
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
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      color: firstGoalMonth !== undefined ? "#86efac" : "#fbbf24",
                      fontSize: 11,
                      fontWeight: 950,
                      textTransform: "uppercase",
                      letterSpacing: "0.10em",
                    }}
                  >
                    <span>
                      {copy.auto.f062}
                    </span>

                    <MetricTooltip
                      content={{
                        title:
                          copy.auto.f063,
                        description:
                          copy.auto.f064,
                      }}
                    />
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
                      ? t("forecastingPage.month", { month: firstGoalMonth })
                      : copy.auto.f065}
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
                      ? t("forecastingPage.goalReached", { goal: money(profitGoal) })
                      : t("forecastingPage.goalNotReached", {
                        goal: money(profitGoal),
                        horizon,
                      })}
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
              {t("forecastingPage.methodNote", { periodDays })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
