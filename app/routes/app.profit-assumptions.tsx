import * as React from "react";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import prisma from "~/db.server";
import DashboardNav from "~/components/dashboard/DashboardNav";
import { authenticate } from "~/shopify.server";
import { loadMarginDashboardData } from "~/utils/margin.server";
import { getBillingStatus, hasGrowthAccess } from "~/utils/billing.server";
import {
  type LoaderData,
  money as formatStoreMoney,
  pct as formatStorePercent,
} from "~/utils/margin";
import { getStoredLanguage } from "~/utils/i18n";

import "~/styles/dashboard.css";

export async function loader({ request }: { request: Request }) {
  const { admin, session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const locale = url.searchParams.get("lang") === "it" ? "it-IT" : "en-US";
  const period = url.searchParams.get("period") ?? "30";

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
      monthlyAds: 500,
      monthlyShipping: 300,
      monthlyOperating: 200,
      paymentFeePct: 2.9,
      transactionFeePct: 0.5,
      taxReservePct: 0,
    }
    : {
      monthlyAds: 500,
      monthlyShipping: 300,
      monthlyOperating: 200,
      paymentFeePct: 2.9,
      transactionFeePct: 0.5,
      taxReservePct: 0,
    };

  return {
    ...dashboardData,
    billing,
    growthAccess,
    assumptions,
  };
}

export async function action({ request }: { request: Request }) {
  const { admin, session } = await authenticate.admin(request);

  const billing = await getBillingStatus(admin);
  if (!hasGrowthAccess(billing)) {
    return {
      ok: false,
      error: "growth_required",
    };
  }

  const formData = await request.formData();

  const safeAmount = (value: FormDataEntryValue | null) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? clamp(parsed, 0, 10_000_000) : 0;
  };

  const safePercentage = (value: FormDataEntryValue | null) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? clamp(parsed, 0, 100) : 0;
  };

  const monthlyAds = safeAmount(formData.get("monthlyAds"));
  const monthlyShipping = safeAmount(formData.get("monthlyShipping"));
  const monthlyOperating = safeAmount(formData.get("monthlyOperating"));
  const paymentFeePct = safePercentage(formData.get("paymentFeePct"));
  const transactionFeePct = safePercentage(formData.get("transactionFeePct"));
  const taxReservePct = safePercentage(formData.get("taxReservePct"));

  await prisma.profitAssumptions.upsert({
    where: {
      shop: session.shop,
    },
    update: {
      monthlyAds,
      monthlyShipping,
      monthlyOperating,
      paymentFeePct,
      transactionFeePct,
      taxReservePct,
    },
    create: {
      shop: session.shop,
      monthlyAds,
      monthlyShipping,
      monthlyOperating,
      paymentFeePct,
      transactionFeePct,
      taxReservePct,
    },
  });

  return {
    ok: true,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundCsvNumber(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function csvCell(value: string | number) {
  const text = String(value);
  const protectedText =
    typeof value === "string" && /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${protectedText.replace(/"/g, '""')}"`;
}

function KpiCard({
  label,
  value,
  note,
  color = "#f8fafc",
  highlight = false,
}: {
  label: string;
  value: string;
  note: string;
  color?: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        minWidth: 0,
        padding: 20,
        borderRadius: 20,
        background: highlight
          ? "radial-gradient(circle at top left, rgba(34,197,94,0.16), transparent 42%), linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))"
          : "linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))",
        border: highlight
          ? "1px solid rgba(34,197,94,0.28)"
          : "1px solid rgba(255,115,60,0.16)",
      }}
    >
      <div
        style={{
          color: highlight ? "#4ade80" : "rgba(255,255,255,0.45)",
          fontSize: 10,
          fontWeight: 950,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 12,
          color,
          fontSize: value.length >= 14 ? 21 : value.length >= 10 ? 25 : 30,
          lineHeight: 1,
          fontWeight: 950,
          letterSpacing: "-0.04em",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>

      <div
        style={{
          marginTop: 8,
          color: "rgba(255,255,255,0.55)",
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

function FieldCard({
  label,
  helper,
  value,
  onChange,
  prefix,
  suffix,
  min = 0,
  max,
}: {
  label: string;
  helper: string;
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label
      style={{
        display: "block",
        padding: 16,
        borderRadius: 17,
        background: "rgba(255,255,255,0.035)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div
        style={{
          color: "#f8fafc",
          fontSize: 13,
          fontWeight: 900,
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 4,
          color: "rgba(255,255,255,0.44)",
          fontSize: 11,
          fontWeight: 720,
          lineHeight: 1.4,
        }}
      >
        {helper}
      </div>

      <div
        style={{
          marginTop: 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 13px",
          borderRadius: 13,
          border: "1px solid rgba(255,115,60,0.18)",
          background: "rgba(4,8,15,0.72)",
        }}
      >
        {prefix && (
          <span
            style={{
              color: "rgba(255,255,255,0.48)",
              fontWeight: 850,
            }}
          >
            {prefix}
          </span>
        )}

        <input
          type="number"
          min={min}
          max={max}
          step={suffix === "%" ? 0.1 : 1}
          value={value}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            onChange(
              Number.isFinite(parsed)
                ? clamp(parsed, min, max ?? Number.MAX_SAFE_INTEGER)
                : min,
            );
          }}
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#f8fafc",
            fontWeight: 950,
            fontSize: 16,
          }}
        />

        {suffix && (
          <span
            style={{
              color: "rgba(255,255,255,0.48)",
              fontWeight: 850,
            }}
          >
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

export default function ProfitAssumptionsPage() {
  const navigate = useNavigate();
  const language = getStoredLanguage();
  const saveFetcher = useFetcher<{ ok: boolean; error?: string }>();

  const {
    summary,
    assumptions,
    currencyCode,
    period,
    shopHandle,
    growthAccess,
  } = useLoaderData() as LoaderData & {
    shopHandle?: string;
    growthAccess: boolean;
    assumptions: {
      monthlyAds: number;
      monthlyShipping: number;
      monthlyOperating: number;
      paymentFeePct: number;
      transactionFeePct: number;
      taxReservePct: number;
    };
  };

  const locale = language === "it" ? "it-IT" : "en-US";
  const periodValue = Number(period ?? 30);
  const periodDays =
    Number.isFinite(periodValue) && periodValue > 0 ? periodValue : 30;
  const periodFractionOfMonth = periodDays / 30;
  const annualizationMultiplier = 360 / periodDays;

  const money = (value: number, digits = 0) =>
    formatStoreMoney(value, currencyCode, locale, digits);

  const pct = (value: number, digits = 1) =>
    formatStorePercent(value, locale, digits);

  const currencySymbol =
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: "narrowSymbol",
    })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value ?? currencyCode;

  const [monthlyAds, setMonthlyAds] = React.useState(assumptions.monthlyAds);

  const [monthlyShipping, setMonthlyShipping] = React.useState(
    assumptions.monthlyShipping,
  );

  const [monthlyOperating, setMonthlyOperating] = React.useState(
    assumptions.monthlyOperating,
  );

  const [paymentFeePct, setPaymentFeePct] = React.useState(
    assumptions.paymentFeePct,
  );

  const [transactionFeePct, setTransactionFeePct] = React.useState(
    assumptions.transactionFeePct,
  );

  const [taxReservePct, setTaxReservePct] = React.useState(
    assumptions.taxReservePct,
  );

  const economicRevenue =
    summary.economicRevenue ?? summary.revenue;

  const economicCogs =
    summary.economicCogs ?? summary.cogs;

  const economicProfit =
    summary.economicProfit ?? summary.profit;

  const economicMarginPct =
    summary.economicMarginPct ?? summary.marginPct;

  const estimatedPaymentFees =
    economicRevenue * (paymentFeePct / 100);

  const estimatedTransactionFees =
    economicRevenue * (transactionFeePct / 100);

  const estimatedTaxReserve =
    economicRevenue * (taxReservePct / 100);

  const monthlyFixedCosts = monthlyAds + monthlyShipping + monthlyOperating;
  const totalFixedCosts = monthlyFixedCosts * periodFractionOfMonth;

  const totalVariableCosts =
    estimatedPaymentFees + estimatedTransactionFees + estimatedTaxReserve;

  const totalEstimatedCosts = totalFixedCosts + totalVariableCosts;

  const estimatedNetProfit =
    economicProfit - totalEstimatedCosts;

  const estimatedNetMargin =
    economicRevenue > 0
      ? (estimatedNetProfit / economicRevenue) * 100
      : 0;

  const displayedEstimatedNetProfit = roundCsvNumber(estimatedNetProfit);
  const displayedTotalEstimatedCosts = roundCsvNumber(totalEstimatedCosts);

  const annualNetProfit = roundCsvNumber(
    displayedEstimatedNetProfit * annualizationMultiplier,
  );
  const annualEstimatedCosts = roundCsvNumber(
    displayedTotalEstimatedCosts * annualizationMultiplier,
  );

  const grossMarginRate =
    economicRevenue > 0
      ? economicProfit / economicRevenue
      : 0;

  const variableCostRate =
    paymentFeePct / 100 + transactionFeePct / 100 + taxReservePct / 100;

  const contributionRate = grossMarginRate - variableCostRate;

  const breakEvenRevenue =
    contributionRate > 0 ? monthlyFixedCosts / contributionRate : 0;

  const profitAfterFees =
    economicProfit -
    estimatedPaymentFees -
    estimatedTransactionFees -
    estimatedTaxReserve;

  const costItems = [
    {
      key: "ads",
      label: language === "it" ? "Pubblicità" : "Advertising",
      value: monthlyAds * periodFractionOfMonth,
      color: "#ff6b4a",
    },
    {
      key: "shipping",
      label: language === "it" ? "Spedizioni" : "Shipping",
      value: monthlyShipping * periodFractionOfMonth,
      color: "#38bdf8",
    },
    {
      key: "operating",
      label: language === "it" ? "Costi operativi" : "Operating Costs",
      value: monthlyOperating * periodFractionOfMonth,
      color: "#f59e0b",
    },
    {
      key: "payment",
      label:
        language === "it"
          ? "Commissioni di pagamento"
          : "Payment Fees",
      value: estimatedPaymentFees,
      color: "#a78bfa",
    },
    {
      key: "transaction",
      label:
        language === "it"
          ? "Commissioni sulle transazioni"
          : "Transaction Fees",
      value: estimatedTransactionFees,
      color: "#fb7185",
    },
    {
      key: "tax",
      label: language === "it" ? "Riserva fiscale gestionale" : "Business Tax Reserve",
      value: estimatedTaxReserve,
      color: "#22c55e",
    },
  ];

  const maxCost = Math.max(1, ...costItems.map((item) => item.value));

  const largestCost = [...costItems].sort((a, b) => b.value - a.value)[0];

  const largestCostMonthlySaving = largestCost
    ? roundCsvNumber(largestCost.value * 0.1)
    : 0;
  const largestCostAnnualSaving = roundCsvNumber(
    largestCostMonthlySaving * 12,
  );

  const whatIfScenarios = [
    {
      key: "ads",
      label:
        language === "it"
          ? "Riduci la pubblicità del 10%"
          : "Reduce advertising by 10%",
      impact: roundCsvNumber(monthlyAds * periodFractionOfMonth * 0.1),
      note:
        language === "it"
          ? "Effetto mensile immediato"
          : "Immediate monthly effect",
    },
    {
      key: "shipping",
      label:
        language === "it"
          ? "Riduci le spedizioni del 10%"
          : "Reduce shipping by 10%",
      impact: roundCsvNumber(monthlyShipping * periodFractionOfMonth * 0.1),
      note:
        language === "it"
          ? "Miglioramento operativo"
          : "Operational improvement",
    },
    {
      key: "fees",
      label:
        language === "it"
          ? "Riduci le commissioni dello 0,5%"
          : "Reduce fees by 0.5%",
      impact: roundCsvNumber(economicRevenue * 0.005),
      note:
        language === "it"
          ? "Rinegoziazione o cambio provider"
          : "Renegotiation or provider change",
    },
  ];

  const healthScore = clamp(
    Math.round(
      100 -
      Math.max(0, -estimatedNetMargin) * 2 -
      (totalEstimatedCosts > economicProfit ? 20 : 0) -
      (largestCost && totalEstimatedCosts > 0
        ? (largestCost.value / totalEstimatedCosts) * 12
        : 0),
    ),
    0,
    100,
  );

  const healthLabel =
    language === "it"
      ? healthScore >= 80
        ? "Modello solido"
        : healthScore >= 60
          ? "Da ottimizzare"
          : "A rischio"
      : healthScore >= 80
        ? "Strong model"
        : healthScore >= 60
          ? "Needs optimization"
          : "At risk";

  const advice =
    language === "it"
      ? largestCost && totalEstimatedCosts > 0
        ? `${largestCost.label} rappresenta circa ${pct(
          (largestCost.value / totalEstimatedCosts) * 100,
          0,
        )} dei costi stimati. Una riduzione del 10% in questa area migliorerebbe il profitto mensile di circa ${money(
          largestCostMonthlySaving,
        )} e quello annuale di circa ${money(largestCostAnnualSaving)}.`
        : "Inserisci i costi principali per ottenere una raccomandazione economica più affidabile."
      : largestCost && totalEstimatedCosts > 0
        ? `${largestCost.label} represents approximately ${pct(
          (largestCost.value / totalEstimatedCosts) * 100,
          0,
        )} of estimated costs. A 10% reduction in this area would improve monthly profit by about ${money(
          largestCostMonthlySaving,
        )} and annual profit by about ${money(largestCostAnnualSaving)}.`
        : "Add your main costs to generate a more reliable financial recommendation.";

  const exportBusinessModelCsv = () => {
    const labels =
      language === "it"
        ? {
          section: "Sezione",
          metric: "Voce",
          value: "Valore",
          unit: "Unità",
          nature: "Natura",
          note: "Nota",
          metadata: "Metadati",
          observed: "Baseline economica osservata",
          assumptions: "Ipotesi del modello",
          costStructure: "Struttura dei costi stimata",
          results: "Risultati stimati",
          scenarios: "Simulazioni rapide",
          guidance: "Indicazione strategica",
          observedNature: "Osservato",
          assumptionNature: "Ipotesi",
          estimateNature: "Stima",
          simulationNature: "Simulazione",
          textNature: "Qualitativo",
          amount: "Importo",
          percentage: "Percentuale",
          score: "Punteggio",
          text: "Testo",
          generatedAt: "Generato il",
          store: "Store",
          period: "Periodo analizzato",
          currency: "Valuta",
          language: "Lingua",
          days: "giorni",
          revenue: "Ricavi economici",
          cogs: "COGS",
          grossProfit: "Profitto economico",
          grossMargin: "Margine economico",
          monthlyAds: "Pubblicità mensile",
          monthlyShipping: "Spedizioni mensili",
          monthlyOperating: "Costi operativi mensili",
          paymentFeePct: "Commissione di pagamento",
          transactionFeePct: "Commissione sulle transazioni",
          taxReservePct: "Riserva fiscale gestionale",
          fixedCosts: "Costi fissi",
          variableCosts: "Commissioni e riserva gestionale",
          totalCosts: "Costi stimati totali",
          annualCosts: "Costi stimati annuali",
          paymentFees: "Commissioni di pagamento stimate",
          transactionFees: "Commissioni sulle transazioni stimate",
          taxReserve: "Riserva fiscale gestionale stimata",
          netProfit: "Profitto netto stimato",
          netMargin: "Margine netto stimato",
          annualNetProfit: "Profitto netto annuale",
          breakEven: "Ricavi mensili di pareggio",
          profitAfterFees: "Profitto dopo commissioni",
          modelHealth: "Salute del modello",
          mainCost: "Costo principale",
          recommendation: "Raccomandazione",
          simulationNote:
            "Scenario alternativo; non sommare alle altre simulazioni.",
          estimateNote:
            "Stima basata sulla baseline del periodo e sulle ipotesi inserite; non è un risultato osservato.",
        }
        : {
          section: "Section",
          metric: "Metric",
          value: "Value",
          unit: "Unit",
          nature: "Nature",
          note: "Note",
          metadata: "Metadata",
          observed: "Observed economic baseline",
          assumptions: "Model assumptions",
          costStructure: "Estimated cost structure",
          results: "Estimated results",
          scenarios: "Quick what-if scenarios",
          guidance: "Strategic guidance",
          observedNature: "Observed",
          assumptionNature: "Assumption",
          estimateNature: "Estimate",
          simulationNature: "Simulation",
          textNature: "Qualitative",
          amount: "Amount",
          percentage: "Percentage",
          score: "Score",
          text: "Text",
          generatedAt: "Generated at",
          store: "Store",
          period: "Analysis period",
          currency: "Currency",
          language: "Language",
          days: "days",
          revenue: "Economic revenue",
          cogs: "COGS",
          grossProfit: "Economic profit",
          grossMargin: "Economic margin",
          monthlyAds: "Monthly advertising",
          monthlyShipping: "Monthly shipping",
          monthlyOperating: "Monthly operating costs",
          paymentFeePct: "Payment processing fee",
          transactionFeePct: "Transaction fee",
          taxReservePct: "Business tax reserve",
          fixedCosts: "Fixed costs",
          variableCosts: "Fees and business reserve",
          totalCosts: "Total estimated costs",
          annualCosts: "Annual estimated costs",
          paymentFees: "Estimated payment fees",
          transactionFees: "Estimated transaction fees",
          taxReserve: "Estimated business tax reserve",
          netProfit: "Estimated net profit",
          netMargin: "Estimated net margin",
          annualNetProfit: "Annual net profit",
          breakEven: "Monthly break-even revenue",
          profitAfterFees: "Profit after fees",
          modelHealth: "Model health",
          mainCost: "Largest cost",
          recommendation: "Recommendation",
          simulationNote:
            "Alternative scenario; do not add to the other simulations.",
          estimateNote:
            "Estimate based on the period baseline and entered assumptions; it is not an observed result.",
        };

    const rows: Array<Array<string | number>> = [
      [labels.section, labels.metric, labels.value, labels.unit, labels.nature, labels.note],
      [labels.metadata, labels.generatedAt, new Date().toISOString(), "ISO 8601", labels.textNature, ""],
      [labels.metadata, labels.store, shopHandle ?? "", "", labels.textNature, ""],
      [labels.metadata, labels.period, periodDays, labels.days, labels.observedNature, ""],
      [labels.metadata, labels.currency, currencyCode, "ISO 4217", labels.textNature, ""],
      [labels.metadata, labels.language, language, "", labels.textNature, ""],
      [labels.observed, labels.revenue, roundCsvNumber(economicRevenue), currencyCode, labels.observedNature, ""],
      [labels.observed, labels.cogs, roundCsvNumber(economicCogs), currencyCode, labels.observedNature, ""],
      [labels.observed, labels.grossProfit, roundCsvNumber(economicProfit), currencyCode, labels.observedNature, ""],
      [labels.observed, labels.grossMargin, roundCsvNumber(economicMarginPct), "%", labels.observedNature, ""],
      [labels.assumptions, labels.monthlyAds, roundCsvNumber(monthlyAds), currencyCode, labels.assumptionNature, ""],
      [labels.assumptions, labels.monthlyShipping, roundCsvNumber(monthlyShipping), currencyCode, labels.assumptionNature, ""],
      [labels.assumptions, labels.monthlyOperating, roundCsvNumber(monthlyOperating), currencyCode, labels.assumptionNature, ""],
      [labels.assumptions, labels.paymentFeePct, roundCsvNumber(paymentFeePct), "%", labels.assumptionNature, ""],
      [labels.assumptions, labels.transactionFeePct, roundCsvNumber(transactionFeePct), "%", labels.assumptionNature, ""],
      [labels.assumptions, labels.taxReservePct, roundCsvNumber(taxReservePct), "%", labels.assumptionNature, ""],
      [labels.costStructure, labels.fixedCosts, roundCsvNumber(totalFixedCosts), currencyCode, labels.estimateNature, labels.estimateNote],
      [labels.costStructure, labels.paymentFees, roundCsvNumber(estimatedPaymentFees), currencyCode, labels.estimateNature, labels.estimateNote],
      [labels.costStructure, labels.transactionFees, roundCsvNumber(estimatedTransactionFees), currencyCode, labels.estimateNature, labels.estimateNote],
      [labels.costStructure, labels.taxReserve, roundCsvNumber(estimatedTaxReserve), currencyCode, labels.estimateNature, labels.estimateNote],
      [labels.costStructure, labels.variableCosts, roundCsvNumber(totalVariableCosts), currencyCode, labels.estimateNature, labels.estimateNote],
      [labels.costStructure, labels.totalCosts, roundCsvNumber(totalEstimatedCosts), currencyCode, labels.estimateNature, labels.estimateNote],
      [labels.costStructure, labels.annualCosts, roundCsvNumber(annualEstimatedCosts), currencyCode, labels.estimateNature, labels.estimateNote],
      [labels.results, labels.netProfit, roundCsvNumber(estimatedNetProfit), currencyCode, labels.estimateNature, labels.estimateNote],
      [labels.results, labels.netMargin, roundCsvNumber(estimatedNetMargin), "%", labels.estimateNature, labels.estimateNote],
      [labels.results, labels.annualNetProfit, roundCsvNumber(annualNetProfit), currencyCode, labels.estimateNature, labels.estimateNote],
      [labels.results, labels.breakEven, roundCsvNumber(breakEvenRevenue), currencyCode, labels.estimateNature, labels.estimateNote],
      [labels.results, labels.profitAfterFees, roundCsvNumber(profitAfterFees), currencyCode, labels.estimateNature, labels.estimateNote],
      [labels.results, labels.modelHealth, healthScore, "/100", labels.estimateNature, healthLabel],
      ...costItems.map((item) => [labels.costStructure, item.label, roundCsvNumber(item.value), currencyCode, labels.estimateNature, labels.estimateNote]),
      ...whatIfScenarios.map((scenario) => [labels.scenarios, scenario.label, roundCsvNumber(scenario.impact), `${currencyCode}/month`, labels.simulationNature, labels.simulationNote]),
      ...whatIfScenarios.map((scenario) => [labels.scenarios, `${scenario.label} — 12 months`, roundCsvNumber(scenario.impact * 12), currencyCode, labels.simulationNature, labels.simulationNote]),
      [labels.guidance, labels.mainCost, largestCost?.label ?? "", labels.text, labels.textNature, ""],
      [labels.guidance, labels.recommendation, advice, labels.text, labels.textNature, ""],
    ];

    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `marginlab-business-model-${shopHandle ?? "store"}-${date}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardNav active="profit-assumptions" navigate={navigate} />

        <div className="hero-header">
          <div>
            <div className="alert-pill">
              <span className="alert-dot" />
              {growthAccess
                ? language === "it"
                  ? "Piano Growth attivo"
                  : "Growth Plan Active"
                : language === "it"
                  ? "Funzione Growth"
                  : "Growth Feature"}
            </div>

            <div className="eyebrow">
              {language === "it"
                ? "BUSINESS MODEL STUDIO"
                : "BUSINESS MODEL STUDIO"}
            </div>

            <div className="hero-title">
              {language === "it"
                ? "Costruisci il modello economico reale del tuo store"
                : "Build the real economics of your store"}
            </div>

            <div className="hero-description">
              {language === "it"
                ? "Definisci costi, commissioni e riserve. MarginLab applica queste ipotesi alla base economica tax-aware per stimare profitto netto, break-even e impatto delle decisioni."
                : "Define costs, fees and reserves. MarginLab applies these assumptions to the tax-aware economic basis to estimate net profit, break-even and decision impact."}
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
              {language === "it"
                ? "Base economica tax-aware"
                : "Tax-aware economic basis"}
            </div>
          </div>

          {!growthAccess && (
            <button
              className="primary-button"
              onClick={() => navigate("/app/billing")}
              style={{
                boxShadow:
                  "0 12px 32px rgba(255,115,80,0.28), 0 0 30px rgba(255,115,80,0.15)",
              }}
            >
              {language === "it" ? "Sblocca Growth →" : "Unlock Growth →"}
            </button>
          )}
        </div>

        <div
          style={{
            position: "relative",
            ...(growthAccess ? {} : { overflow: "hidden", borderRadius: 24 }),
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
                paddingTop: 120,
                background:
                  "linear-gradient(180deg, rgba(5,9,16,0.22), rgba(5,9,16,0.78) 22%, rgba(5,9,16,0.92))",
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
                  border: "1px solid rgba(255,115,60,0.30)",
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
                  {language === "it" ? "FUNZIONE GROWTH" : "GROWTH FEATURE"}
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
                  {language === "it"
                    ? "Business Model Studio è incluso nel piano Growth"
                    : "Business Model Studio is included with Growth"}
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
                  {language === "it"
                    ? "Passa a Growth per salvare costi, commissioni e riserve e alimentare le stime economiche delle funzioni Growth."
                    : "Upgrade to Growth to save costs, fees and reserves and power the financial estimates used across Growth."}
                </div>

                <button
                  type="button"
                  className="primary-button"
                  onClick={() => navigate("/app/billing")}
                  style={{ marginTop: 18 }}
                >
                  {language === "it" ? "Sblocca Growth →" : "Unlock Growth →"}
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
                gridTemplateColumns: "repeat(6,minmax(0,1fr))",
                gap: 14,
              }}
            >
              <KpiCard
                label={
                  language === "it"
                    ? "Profitto netto stimato"
                    : "Estimated Net Profit"
                }
                value={money(estimatedNetProfit)}
                note={`${pct(estimatedNetMargin)} ${language === "it" ? "di margine netto" : "net margin"
                  }`}
                color={estimatedNetProfit >= 0 ? "#22c55e" : "#ff6b4a"}
                highlight
              />

              <KpiCard
                label={
                  language === "it" ? "Costi mensili totali" : "Total Monthly Costs"
                }
                value={money(totalEstimatedCosts)}
                note={
                  language === "it"
                    ? "Fissi, commissioni e riserva"
                    : "Fixed, fees and reserve"
                }
              />

              <KpiCard
                label={
                  language === "it" ? "Ricavi di pareggio" : "Break-even Revenue"
                }
                value={money(breakEvenRevenue)}
                note={
                  language === "it"
                    ? "Ricavi mensili minimi stimati"
                    : "Estimated minimum monthly revenue"
                }
              />

              <KpiCard
                label={
                  language === "it"
                    ? "Profitto dopo commissioni"
                    : "Profit After Fees"
                }
                value={money(profitAfterFees)}
                note={
                  language === "it" ? "Prima dei costi fissi" : "Before fixed costs"
                }
                color={profitAfterFees >= 0 ? "#f8fafc" : "#ff6b4a"}
              />

              <KpiCard
                label={
                  language === "it" ? "Profitto netto annuale" : "Annual Net Profit"
                }
                value={money(annualNetProfit)}
                note={
                  language === "it"
                    ? "Proiezione su 12 mesi"
                    : "12-month projection"
                }
                color={annualNetProfit >= 0 ? "#22c55e" : "#ff6b4a"}
              />

              <KpiCard
                label={language === "it" ? "Salute del modello" : "Model Health"}
                value={`${healthScore}/100`}
                note={healthLabel}
                color={
                  healthScore >= 80
                    ? "#22c55e"
                    : healthScore >= 60
                      ? "#f59e0b"
                      : "#ff6b4a"
                }
              />
            </div>

            <div
              style={{
                marginTop: 22,
                display: "grid",
                gridTemplateColumns: "0.95fr 1.05fr",
                gap: 22,
                alignItems: "stretch",
              }}
            >
              <div className="panel" style={{ margin: 0, padding: 24 }}>
                <div className="panel-eyebrow">
                  {language === "it" ? "INPUT DEL MODELLO" : "MODEL INPUTS"}
                </div>

                <h2 className="panel-title" style={{ marginTop: 6 }}>
                  {language === "it"
                    ? "Definisci costi e commissioni"
                    : "Define costs and fees"}
                </h2>

                <div
                  style={{
                    marginTop: 7,
                    color: "rgba(255,255,255,0.54)",
                    fontSize: 12,
                    lineHeight: 1.5,
                    fontWeight: 720,
                  }}
                >
                  {language === "it"
                    ? "Le modifiche aggiornano tutti i risultati in tempo reale."
                    : "Changes update all results in real time."}
                </div>

                <saveFetcher.Form method="post">
                  <div
                    style={{
                      marginTop: 20,
                      display: "grid",
                      gap: 16,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          color: "#ff9a70",
                          fontSize: 10,
                          fontWeight: 950,
                          textTransform: "uppercase",
                          letterSpacing: "0.12em",
                          marginBottom: 10,
                        }}
                      >
                        {language === "it"
                          ? "Costi fissi mensili"
                          : "Monthly Fixed Costs"}
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 11,
                        }}
                      >
                        <FieldCard
                          label={language === "it" ? "Pubblicità" : "Advertising"}
                          helper={
                            language === "it"
                              ? "Spesa media mensile per campagne."
                              : "Average monthly campaign spend."
                          }
                          value={monthlyAds}
                          onChange={setMonthlyAds}
                          prefix={currencySymbol}
                        />

                        <FieldCard
                          label={language === "it" ? "Spedizioni" : "Shipping"}
                          helper={
                            language === "it"
                              ? "Costo mensile sostenuto dallo store."
                              : "Monthly cost paid by the store."
                          }
                          value={monthlyShipping}
                          onChange={setMonthlyShipping}
                          prefix={currencySymbol}
                        />

                        <FieldCard
                          label={
                            language === "it"
                              ? "Costi operativi"
                              : "Operating Costs"
                          }
                          helper={
                            language === "it"
                              ? "Software, personale e gestione."
                              : "Software, staff and operations."
                          }
                          value={monthlyOperating}
                          onChange={setMonthlyOperating}
                          prefix={currencySymbol}
                        />
                      </div>
                    </div>

                    <div>
                      <div
                        style={{
                          color: "#7dd3fc",
                          fontSize: 10,
                          fontWeight: 950,
                          textTransform: "uppercase",
                          letterSpacing: "0.12em",
                          marginBottom: 10,
                        }}
                      >
                        {language === "it"
                          ? "Commissioni variabili"
                          : "Variable Fees"}
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 11,
                        }}
                      >
                        <FieldCard
                          label={
                            language === "it"
                              ? "Commissioni di pagamento"
                              : "Payment Processing Fee"
                          }
                          helper={
                            language === "it"
                              ? "Percentuale sui ricavi elaborati."
                              : "Percentage of processed revenue."
                          }
                          value={paymentFeePct}
                          onChange={setPaymentFeePct}
                          suffix="%"
                          max={100}
                        />

                        <FieldCard
                          label={
                            language === "it"
                              ? "Commissioni sulle transazioni"
                              : "Transaction Fee"
                          }
                          helper={
                            language === "it"
                              ? "Commissione aggiuntiva della piattaforma."
                              : "Additional platform transaction fee."
                          }
                          value={transactionFeePct}
                          onChange={setTransactionFeePct}
                          suffix="%"
                          max={100}
                        />
                      </div>
                    </div>

                    <div>
                      <div
                        style={{
                          color: "#86efac",
                          fontSize: 10,
                          fontWeight: 950,
                          textTransform: "uppercase",
                          letterSpacing: "0.12em",
                          marginBottom: 10,
                        }}
                      >
                        {language === "it" ? "Riserva fiscale gestionale" : "Business Tax Reserve"}
                      </div>

                      <FieldCard
                        label={
                          language === "it"
                            ? "Riserva fiscale gestionale"
                            : "Business Tax Reserve Percentage"
                        }
                        helper={
                          language === "it"
                            ? "Quota prudenziale gestionale applicata ai ricavi economici. Non sostituisce VAT/GST/Sales Tax."
                            : "Managerial reserve applied to economic revenue. It does not replace VAT/GST/Sales Tax."
                        }
                        value={taxReservePct}
                        onChange={setTaxReservePct}
                        suffix="%"
                        max={100}
                      />
                    </div>
                  </div>

                  <input type="hidden" name="monthlyAds" value={monthlyAds} />
                  <input
                    type="hidden"
                    name="monthlyShipping"
                    value={monthlyShipping}
                  />
                  <input
                    type="hidden"
                    name="monthlyOperating"
                    value={monthlyOperating}
                  />
                  <input type="hidden" name="paymentFeePct" value={paymentFeePct} />
                  <input
                    type="hidden"
                    name="transactionFeePct"
                    value={transactionFeePct}
                  />
                  <input type="hidden" name="taxReservePct" value={taxReservePct} />

                  <button
                    type="submit"
                    className="primary-button"
                    style={{
                      width: "100%",
                      marginTop: 20,
                      background:
                        "linear-gradient(135deg, rgba(34,197,94,0.30), rgba(34,197,94,0.13))",
                      border: "1px solid rgba(34,197,94,0.32)",
                      boxShadow: "0 14px 34px rgba(34,197,94,0.12)",
                    }}
                  >
                    {saveFetcher.state !== "idle"
                      ? language === "it"
                        ? "Salvataggio in corso..."
                        : "Saving..."
                      : saveFetcher.data?.ok
                        ? language === "it"
                          ? "Modello salvato ✓"
                          : "Model Saved ✓"
                        : language === "it"
                          ? "Salva il modello"
                          : "Save Model"}
                  </button>
                </saveFetcher.Form>
              </div>

              <div
                style={{
                  borderRadius: 26,
                  padding: 24,
                  background:
                    "radial-gradient(circle at top left, rgba(34,197,94,0.14), transparent 36%), linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))",
                  border: "1px solid rgba(34,197,94,0.22)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                  <div
                    style={{
                      color: "#4ade80",
                      fontSize: 11,
                      fontWeight: 950,
                      textTransform: "uppercase",
                      letterSpacing: "0.13em",
                    }}
                  >
                    {language === "it"
                      ? "CONTO ECONOMICO STIMATO"
                      : "ESTIMATED PROFIT MODEL"}
                  </div>

                  <button
                    type="button"
                    onClick={exportBusinessModelCsv}
                    className="secondary-button"
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {language === "it"
                      ? "Esporta modello CSV"
                      : "Export model CSV"}
                  </button>
                </div>

                <div
                  style={{
                    marginTop: 11,
                    color: estimatedNetProfit >= 0 ? "#22c55e" : "#ff6b4a",
                    fontSize: 54,
                    fontWeight: 950,
                    lineHeight: 1,
                    letterSpacing: "-0.05em",
                  }}
                >
                  {money(estimatedNetProfit)}
                </div>

                <div
                  style={{
                    marginTop: 8,
                    color: "rgba(255,255,255,0.60)",
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  {language === "it"
                    ? "Margine netto stimato"
                    : "Estimated net margin"}
                  : {pct(estimatedNetMargin)}
                </div>

                <div
                  style={{
                    marginTop: 22,
                    display: "grid",
                    gap: 10,
                  }}
                >
                  {[
                    {
                      label: language === "it" ? "Ricavi economici" : "Economic Revenue",
                      value: money(economicRevenue),
                      color: "#f8fafc",
                    },
                    {
                      label: language === "it" ? "Profitto economico" : "Economic Profit",
                      value: money(economicProfit),
                      color: "#22c55e",
                    },
                    {
                      label: language === "it" ? "Costi fissi" : "Fixed Costs",
                      value: `-${money(totalFixedCosts)}`,
                      color: "#f8fafc",
                    },
                    {
                      label:
                        language === "it"
                          ? "Commissioni e riserva"
                          : "Fees and Reserve",
                      value: `-${money(totalVariableCosts)}`,
                      color: "#f8fafc",
                    },
                    {
                      label:
                        language === "it"
                          ? "Costi stimati totali"
                          : "Total Estimated Costs",
                      value: `-${money(totalEstimatedCosts)}`,
                      color: "#ff9a70",
                    },
                    {
                      label: language === "it" ? "Profitto netto" : "Net Profit",
                      value: money(estimatedNetProfit),
                      color: estimatedNetProfit >= 0 ? "#22c55e" : "#ff6b4a",
                    },
                  ].map((item, index) => (
                    <div
                      key={item.label}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 14,
                        padding: "10px 0",
                        borderTop:
                          index === 5 ? "1px solid rgba(255,115,60,0.20)" : "none",
                        borderBottom:
                          index < 5 ? "1px solid rgba(255,255,255,0.06)" : "none",
                        color: "rgba(255,255,255,0.68)",
                        fontSize: 13,
                        fontWeight: 800,
                      }}
                    >
                      <span>{item.label}</span>
                      <strong style={{ color: item.color }}>{item.value}</strong>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    marginTop: 20,
                    padding: 16,
                    borderRadius: 17,
                    background:
                      estimatedNetProfit >= 0
                        ? "rgba(34,197,94,0.08)"
                        : "rgba(255,107,74,0.08)",
                    border:
                      estimatedNetProfit >= 0
                        ? "1px solid rgba(34,197,94,0.20)"
                        : "1px solid rgba(255,107,74,0.20)",
                  }}
                >
                  <div
                    style={{
                      color: estimatedNetProfit >= 0 ? "#86efac" : "#ff9a70",
                      fontSize: 10,
                      fontWeight: 950,
                      textTransform: "uppercase",
                      letterSpacing: "0.11em",
                    }}
                  >
                    {language === "it" ? "Lettura del modello" : "Model Reading"}
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      color: "rgba(255,255,255,0.76)",
                      fontSize: 13,
                      lineHeight: 1.6,
                      fontWeight: 740,
                    }}
                  >
                    {estimatedNetProfit >= 0
                      ? language === "it"
                        ? `Il modello genera un profitto netto positivo di ${money(
                          estimatedNetProfit,
                        )}. Il break-even stimato è ${money(
                          breakEvenRevenue,
                        )} di ricavi mensili.`
                        : `The model generates positive net profit of ${money(
                          estimatedNetProfit,
                        )}. Estimated break-even is ${money(
                          breakEvenRevenue,
                        )} in monthly revenue.`
                      : language === "it"
                        ? `Il modello attuale produce una perdita stimata di ${money(
                          Math.abs(estimatedNetProfit),
                        )}. Riduci i costi o aumenta il margine prima di scalare.`
                        : `The current model produces an estimated loss of ${money(
                          Math.abs(estimatedNetProfit),
                        )}. Reduce costs or improve margin before scaling.`}
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 22,
                display: "grid",
                gridTemplateColumns: "1.05fr 0.95fr",
                gap: 22,
              }}
            >
              <div className="panel" style={{ margin: 0, padding: 24 }}>
                <div className="panel-eyebrow">
                  {language === "it" ? "STRUTTURA DEI COSTI" : "COST STRUCTURE"}
                </div>

                <h2 className="panel-title" style={{ marginTop: 6 }}>
                  {language === "it"
                    ? "Dove viene assorbito il profitto"
                    : "Where profit is being absorbed"}
                </h2>

                <div
                  style={{
                    marginTop: 20,
                    display: "grid",
                    gap: 13,
                  }}
                >
                  {costItems.map((item) => {
                    const share =
                      totalEstimatedCosts > 0
                        ? (item.value / totalEstimatedCosts) * 100
                        : 0;

                    return (
                      <div key={item.key}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 14,
                            color: "rgba(255,255,255,0.68)",
                            fontSize: 12,
                            fontWeight: 850,
                          }}
                        >
                          <span>{item.label}</span>
                          <span style={{ color: item.color }}>
                            {money(item.value)} · {pct(share, 0)}
                          </span>
                        </div>

                        <div
                          style={{
                            marginTop: 7,
                            height: 9,
                            borderRadius: 999,
                            background: "rgba(255,255,255,0.07)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.max(
                                item.value > 0 ? 4 : 0,
                                (item.value / maxCost) * 100,
                              )}%`,
                              height: "100%",
                              borderRadius: 999,
                              background: item.color,
                              boxShadow: `0 0 16px ${item.color}44`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div
                  style={{
                    marginTop: 20,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 11,
                  }}
                >
                  <div
                    style={{
                      padding: 15,
                      borderRadius: 15,
                      background: "rgba(255,255,255,0.035)",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    <div
                      style={{
                        color: "rgba(255,255,255,0.42)",
                        fontSize: 9,
                        fontWeight: 950,
                        textTransform: "uppercase",
                      }}
                    >
                      {language === "it" ? "Costi fissi" : "Fixed Costs"}
                    </div>

                    <div
                      style={{
                        marginTop: 7,
                        color: "#f8fafc",
                        fontSize: 21,
                        fontWeight: 950,
                      }}
                    >
                      {money(totalFixedCosts)}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: 15,
                      borderRadius: 15,
                      background: "rgba(255,255,255,0.035)",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    <div
                      style={{
                        color: "rgba(255,255,255,0.42)",
                        fontSize: 9,
                        fontWeight: 950,
                        textTransform: "uppercase",
                      }}
                    >
                      {language === "it" ? "Costi annuali" : "Annual Costs"}
                    </div>

                    <div
                      style={{
                        marginTop: 7,
                        color: "#ff9a70",
                        fontSize: 21,
                        fontWeight: 950,
                      }}
                    >
                      {money(annualEstimatedCosts)}
                    </div>
                  </div>
                </div>
              </div>

              <div
                style={{
                  borderRadius: 26,
                  padding: 24,
                  background:
                    "radial-gradient(circle at top right, rgba(56,189,248,0.10), transparent 40%), linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))",
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
                  {language === "it" ? "SIMULAZIONI RAPIDE" : "QUICK WHAT-IF"}
                </div>

                <div
                  style={{
                    marginTop: 9,
                    color: "#f8fafc",
                    fontSize: 22,
                    fontWeight: 950,
                  }}
                >
                  {language === "it"
                    ? "Quanto vale ogni ottimizzazione"
                    : "What each optimization is worth"}
                </div>

                <div
                  style={{
                    marginTop: 18,
                    display: "grid",
                    gap: 11,
                  }}
                >
                  {whatIfScenarios.map((scenario) => (
                    <div
                      key={scenario.key}
                      style={{
                        padding: 16,
                        borderRadius: 17,
                        background: "rgba(255,255,255,0.035)",
                        border: "1px solid rgba(255,255,255,0.07)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 14,
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              color: "#f8fafc",
                              fontSize: 14,
                              fontWeight: 900,
                            }}
                          >
                            {scenario.label}
                          </div>

                          <div
                            style={{
                              marginTop: 4,
                              color: "rgba(255,255,255,0.44)",
                              fontSize: 11,
                              fontWeight: 720,
                            }}
                          >
                            {scenario.note}
                          </div>
                        </div>

                        <div style={{ textAlign: "right" }}>
                          <div
                            style={{
                              color: "#22c55e",
                              fontSize: 20,
                              fontWeight: 950,
                            }}
                          >
                            +{money(scenario.impact)}
                          </div>

                          <div
                            style={{
                              marginTop: 3,
                              color: "rgba(255,255,255,0.38)",
                              fontSize: 9,
                              fontWeight: 900,
                              textTransform: "uppercase",
                            }}
                          >
                            {language === "it" ? "al mese" : "per month"}
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          marginTop: 12,
                          color: "rgba(255,255,255,0.55)",
                          fontSize: 11,
                          fontWeight: 760,
                        }}
                      >
                        {language === "it"
                          ? `Impatto annuale stimato: +${money(
                            scenario.impact * 12,
                          )}`
                          : `Estimated annual impact: +${money(
                            scenario.impact * 12,
                          )}`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 22,
                display: "grid",
                gridTemplateColumns: "1.15fr 0.85fr",
                gap: 22,
              }}
            >
              <div
                style={{
                  borderRadius: 26,
                  padding: 24,
                  background:
                    "radial-gradient(circle at top left, rgba(255,115,80,0.12), transparent 38%), linear-gradient(135deg, rgba(16,23,37,0.99), rgba(7,12,21,0.99))",
                  border: "1px solid rgba(255,115,60,0.22)",
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
                  {language === "it" ? "CONSIGLIO MARGINLAB" : "MARGINLAB ADVICE"}
                </div>

                <div
                  style={{
                    marginTop: 9,
                    color: "#f8fafc",
                    fontSize: 22,
                    fontWeight: 950,
                  }}
                >
                  {language === "it"
                    ? "La leva economica più importante"
                    : "Your most important financial lever"}
                </div>

                <div
                  style={{
                    marginTop: 16,
                    color: "rgba(255,255,255,0.76)",
                    fontSize: 14,
                    lineHeight: 1.75,
                    fontWeight: 730,
                  }}
                >
                  {advice}
                </div>

                <div
                  style={{
                    marginTop: 18,
                    display: "grid",
                    gridTemplateColumns: "repeat(3,1fr)",
                    gap: 11,
                  }}
                >
                  <div
                    style={{
                      padding: 14,
                      borderRadius: 15,
                      background: "rgba(255,255,255,0.035)",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    <div
                      style={{
                        color: "rgba(255,255,255,0.42)",
                        fontSize: 9,
                        fontWeight: 950,
                        textTransform: "uppercase",
                      }}
                    >
                      {language === "it" ? "Costo principale" : "Largest Cost"}
                    </div>

                    <div
                      style={{
                        marginTop: 7,
                        color: "#f8fafc",
                        fontSize: 14,
                        fontWeight: 900,
                      }}
                    >
                      {largestCost?.label ?? "-"}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: 14,
                      borderRadius: 15,
                      background: "rgba(255,255,255,0.035)",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    <div
                      style={{
                        color: "rgba(255,255,255,0.42)",
                        fontSize: 9,
                        fontWeight: 950,
                        textTransform: "uppercase",
                      }}
                    >
                      {language === "it" ? "Risparmio 10%" : "10% Savings"}
                    </div>

                    <div
                      style={{
                        marginTop: 7,
                        color: "#22c55e",
                        fontSize: 20,
                        fontWeight: 950,
                      }}
                    >
                      +{money((largestCost?.value ?? 0) * 0.1)}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: 14,
                      borderRadius: 15,
                      background: "rgba(255,255,255,0.035)",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    <div
                      style={{
                        color: "rgba(255,255,255,0.42)",
                        fontSize: 9,
                        fontWeight: 950,
                        textTransform: "uppercase",
                      }}
                    >
                      {language === "it" ? "Impatto annuo" : "Annual Impact"}
                    </div>

                    <div
                      style={{
                        marginTop: 7,
                        color: "#22c55e",
                        fontSize: 20,
                        fontWeight: 950,
                      }}
                    >
                      +{money((largestCost?.value ?? 0) * 1.2)}
                    </div>
                  </div>
                </div>
              </div>

              <div
                style={{
                  borderRadius: 26,
                  padding: 24,
                  background:
                    "radial-gradient(circle at top right, rgba(34,197,94,0.10), transparent 40%), linear-gradient(180deg, rgba(16,23,37,0.98), rgba(7,12,21,0.99))",
                  border: "1px solid rgba(34,197,94,0.18)",
                }}
              >
                <div
                  style={{
                    color: "#86efac",
                    fontSize: 11,
                    fontWeight: 950,
                    textTransform: "uppercase",
                    letterSpacing: "0.13em",
                  }}
                >
                  {language === "it" ? "MODULI COLLEGATI" : "CONNECTED MODULES"}
                </div>

                <div
                  style={{
                    marginTop: 9,
                    color: "#f8fafc",
                    fontSize: 22,
                    fontWeight: 950,
                  }}
                >
                  {language === "it"
                    ? "Il modello alimenta tutto il Growth"
                    : "This model powers Growth"}
                </div>

                <div
                  style={{
                    marginTop: 17,
                    display: "grid",
                    gap: 10,
                  }}
                >
                  {[
                    {
                      label: "Profit Copilot",
                      route: "/app/ai-advisor",
                      text:
                        language === "it"
                          ? "Stima profitto netto e priorità."
                          : "Estimates net profit and priorities.",
                    },
                    {
                      label: "Recovery Simulator",
                      route: "/app/recovery-simulator",
                      text:
                        language === "it"
                          ? "Confronta scenari prima di agire."
                          : "Compares scenarios before acting.",
                    },
                    {
                      label: "Forecasting",
                      route: "/app/forecasting",
                      text:
                        language === "it"
                          ? "Proietta il modello nel futuro."
                          : "Projects the model into the future.",
                    },
                  ].map((module) => (
                    <button
                      key={module.label}
                      type="button"
                      onClick={() => navigate(module.route)}
                      style={{
                        cursor: "pointer",
                        textAlign: "left",
                        padding: 14,
                        borderRadius: 15,
                        background: "rgba(255,255,255,0.035)",
                        border: "1px solid rgba(255,255,255,0.07)",
                      }}
                    >
                      <div
                        style={{
                          color: "#f8fafc",
                          fontSize: 14,
                          fontWeight: 900,
                        }}
                      >
                        ✓ {module.label}
                      </div>

                      <div
                        style={{
                          marginTop: 4,
                          color: "rgba(255,255,255,0.46)",
                          fontSize: 11,
                          fontWeight: 720,
                        }}
                      >
                        {module.text}
                      </div>
                    </button>
                  ))}
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
                color: "rgba(255,255,255,0.64)",
                lineHeight: 1.6,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {language === "it"
                ? "I valori inseriti manualmente vengono salvati e applicati alla base economica tax-aware utilizzata dalle funzioni Growth. La riserva fiscale gestionale è un'ipotesi separata e non sostituisce il trattamento VAT/GST/Sales Tax del Tax Engine."
                : "Manually entered values are saved and applied to the tax-aware economic basis used by Growth features. The business tax reserve is a separate assumption and does not replace the Tax Engine's VAT/GST/Sales Tax treatment."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}