import * as React from "react";
import { useLoaderData, useNavigate } from "react-router";

import DashboardNav from "~/components/dashboard/DashboardNav";
import MetricTooltip from "~/components/ui/MetricTooltip";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";
import { loadMarginDashboardData } from "~/utils/margin.server";
import {
  getBillingStatus,
  hasGrowthAccess,
} from "~/utils/billing.server";
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
  const period = url.searchParams.get("period") ?? "30";

  const language = url.searchParams.get("lang") === "it" ? "it" : "en";

  const locale = language === "it" ? "it-IT" : "en-US";

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
      paymentFeePct: 0,
      transactionFeePct: 0,
      taxReservePct: 0,
    }
    : {
      paymentFeePct: 0,
      transactionFeePct: 0,
      taxReservePct: 0,
    };

  return {
    ...dashboardData,
    billing,
    growthAccess,
    assumptions: {
      paymentFeePct: assumptions.paymentFeePct,
      transactionFeePct: assumptions.transactionFeePct,
      taxReservePct: assumptions.taxReservePct,
    },
  };
}

type ScenarioKey = "conservative" | "balanced" | "aggressive" | "custom";

type Scenario = {
  key: Exclude<ScenarioKey, "custom">;
  priceChangePct: number;
  costReductionPct: number;
  salesChangePct: number;
};

type SavedScenario = {
  id: string;
  name: string;
  productId: string;
  productTitle: string;
  simulatedPrice: number;
  costReductionPct: number;
  salesChangePct: number;
  monthlyProfit: number;
  annualRecovery: number;
  marginPct: number;
  createdAt: string;
};

const cardStyle: React.CSSProperties = {
  borderRadius: 26,
  padding: 26,
  background:
    "linear-gradient(180deg, rgba(17,24,39,0.97), rgba(7,12,21,0.99))",
  border: "1px solid rgba(255,115,60,0.18)",
};

const mutedLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: "0.13em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.48)",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function safeNumber(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function roundCurrency(value: number) {
  return Math.round((safeNumber(value) + Number.EPSILON) * 100) / 100;
}

export default function RecoverySimulatorPage() {
  const navigate = useNavigate();
  const language = getStoredLanguage();
  const loaderData = useLoaderData() as LoaderData & {
    growthAccess: boolean;
    assumptions: {
      paymentFeePct: number;
      transactionFeePct: number;
      taxReservePct: number;
    };
  };

  const { rows, currencyCode, growthAccess } = loaderData;

  const economicProducts = React.useMemo(
    () =>
      rows.map((row) => {
        const qty = Math.max(0, safeNumber(row.qty));

        const economicRevenue =
          row.economicRevenue ?? row.revenue;
        const economicCogs =
          row.economicCogs ?? row.cogs;
        const economicProfit =
          row.economicProfit ?? row.profit;
        const economicMarginPct =
          row.economicMarginPct ?? row.marginPct;

        const economicAvgPrice =
          qty > 0
            ? economicRevenue / qty
            : row.avgPrice;

        const economicAvgCost =
          qty > 0
            ? economicCogs / qty
            : row.avgCost;

        return {
          ...row,
          economicRevenue,
          economicCogs,
          economicProfit,
          economicMarginPct,
          avgPrice: economicAvgPrice,
          avgCost: economicAvgCost,
          revenue: economicRevenue,
          cogs: economicCogs,
          profit: economicProfit,
          marginPct: economicMarginPct,
        };
      }),
    [rows],
  );

  const periodValue = Number(loaderData.period ?? 30);
  const periodDays =
    Number.isFinite(periodValue) && periodValue > 0 ? periodValue : 30;
  const monthlyMultiplier = 30 / periodDays;

  const availableProducts = React.useMemo(
    () =>
      economicProducts
        .filter((row) => row.avgPrice > 0 && row.qty > 0)
        .sort((a, b) => b.revenue - a.revenue),
    [economicProducts],
  );

  const [selectedProductId, setSelectedProductId] = React.useState(
    availableProducts[0]?.productId ?? "",
  );
  const [searchQuery, setSearchQuery] = React.useState("");
  const [scenario, setScenario] = React.useState<ScenarioKey>("balanced");
  const [simulatedPrice, setSimulatedPrice] = React.useState(0);
  const [costReductionPct, setCostReductionPct] = React.useState(0);
  const [salesChangePct, setSalesChangePct] = React.useState(0);
  const [savedScenarios, setSavedScenarios] = React.useState<SavedScenario[]>(
    [],
  );
  const [scenarioName, setScenarioName] = React.useState("");
  const [saveMessage, setSaveMessage] = React.useState("");
  const [pendingScenario, setPendingScenario] =
    React.useState<SavedScenario | null>(null);

  const storageKey = React.useMemo(
    () => `marginlab:recovery-scenarios:${loaderData.shopHandle || "store"}`,
    [loaderData.shopHandle],
  );

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) {
        setSavedScenarios([]);
        return;
      }

      const parsed = JSON.parse(stored);
      setSavedScenarios(Array.isArray(parsed) ? parsed : []);
    } catch {
      setSavedScenarios([]);
    }
  }, [storageKey]);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(savedScenarios));
    } catch {
      // The simulator remains fully usable if browser storage is unavailable.
    }
  }, [savedScenarios, storageKey]);

  React.useEffect(() => {
    if (
      availableProducts.length > 0 &&
      !availableProducts.some((row) => row.productId === selectedProductId)
    ) {
      setSelectedProductId(availableProducts[0].productId);
    }
  }, [availableProducts, selectedProductId]);

  const selectedProduct = React.useMemo(
    () =>
      availableProducts.find((row) => row.productId === selectedProductId) ??
      availableProducts[0],
    [availableProducts, selectedProductId],
  );

  const scenarios: Scenario[] = [
    {
      key: "conservative",
      priceChangePct: 2,
      costReductionPct: 1,
      salesChangePct: 0,
    },
    {
      key: "balanced",
      priceChangePct: 5,
      costReductionPct: 3,
      salesChangePct: 0,
    },
    {
      key: "aggressive",
      priceChangePct: 10,
      costReductionPct: 5,
      salesChangePct: -5,
    },
  ];

  const applyScenario = React.useCallback(
    (nextScenario: Exclude<ScenarioKey, "custom">) => {
      if (!selectedProduct) return;

      const config = scenarios.find((item) => item.key === nextScenario);
      if (!config) return;

      setScenario(nextScenario);
      setSimulatedPrice(
        roundCurrency(
          selectedProduct.avgPrice * (1 + config.priceChangePct / 100),
        ),
      );
      setCostReductionPct(config.costReductionPct);
      setSalesChangePct(config.salesChangePct);
    },
    [selectedProduct],
  );

  React.useEffect(() => {
    if (!selectedProduct) return;

    const balanced = scenarios.find((item) => item.key === "balanced");
    if (!balanced) return;

    setScenario("balanced");
    setSimulatedPrice(
      roundCurrency(
        selectedProduct.avgPrice * (1 + balanced.priceChangePct / 100),
      ),
    );
    setCostReductionPct(balanced.costReductionPct);
    setSalesChangePct(balanced.salesChangePct);
  }, [selectedProduct?.productId]);

  React.useEffect(() => {
    if (
      !pendingScenario ||
      pendingScenario.productId !== selectedProduct?.productId
    ) {
      return;
    }

    setScenario("custom");
    setSimulatedPrice(roundCurrency(pendingScenario.simulatedPrice));
    setCostReductionPct(pendingScenario.costReductionPct);
    setSalesChangePct(pendingScenario.salesChangePct);
    setPendingScenario(null);
  }, [pendingScenario, selectedProduct?.productId]);

  const filteredProducts = React.useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) return availableProducts.slice(0, 8);

    return availableProducts
      .filter((row) => row.productTitle.toLowerCase().includes(normalizedQuery))
      .slice(0, 8);
  }, [availableProducts, searchQuery]);

  if (!selectedProduct) {
    return (
      <div className="dashboard-shell">
        <div className="dashboard-container">
          <DashboardNav active="recovery-simulator" navigate={navigate} />

          <div className="hero-header">
            <div>
              <div className="eyebrow">
                {language === "it"
                  ? "SIMULATORE DI RECUPERO"
                  : "RECOVERY SIMULATOR"}
              </div>
              <div className="hero-title">
                {language === "it"
                  ? "Nessun prodotto disponibile per la simulazione"
                  : "No products available for simulation"}
              </div>
              <div className="hero-description">
                {language === "it"
                  ? "MarginLab necessita di almeno un prodotto con prezzo e vendite registrate nel periodo selezionato."
                  : "MarginLab needs at least one product with a selling price and recorded sales in the selected period."}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentPrice = safeNumber(selectedProduct.avgPrice);
  const currentCost = safeNumber(selectedProduct.avgCost);
  const currentPeriodQty = safeNumber(selectedProduct.qty);
  const currentMonthlyQty = currentPeriodQty * monthlyMultiplier;

  const currentPeriodEconomicRevenue = safeNumber(
    selectedProduct.economicRevenue ?? selectedProduct.revenue,
  );
  const currentPeriodEconomicCogs = safeNumber(
    selectedProduct.economicCogs ?? selectedProduct.cogs,
  );
  const currentPeriodEconomicProfit = safeNumber(
    selectedProduct.economicProfit ?? selectedProduct.profit,
  );

  const currentUnitProfit =
    currentPeriodQty > 0
      ? currentPeriodEconomicProfit / currentPeriodQty
      : currentPrice - currentCost;

  const currentMarginPct = safeNumber(
    selectedProduct.economicMarginPct ??
    selectedProduct.marginPct,
  );

  const currentMonthlyRevenue =
    currentPeriodEconomicRevenue * monthlyMultiplier;
  const variableFeeRate = clamp(
    (safeNumber(loaderData.assumptions.paymentFeePct) +
      safeNumber(loaderData.assumptions.transactionFeePct)) /
    100,
    0,
    1,
  );
  const currentMonthlyProfitBeforeFees =
    currentPeriodEconomicProfit * monthlyMultiplier;
  const currentMonthlyFees = currentMonthlyRevenue * variableFeeRate;
  const currentMonthlyProfit =
    currentMonthlyProfitBeforeFees - currentMonthlyFees;

  const simulatedCost = Math.max(0, currentCost * (1 - costReductionPct / 100));
  const simulatedMonthlyQty = Math.max(
    0,
    currentMonthlyQty * (1 + salesChangePct / 100),
  );
  const simulatedUnitProfit = simulatedPrice - simulatedCost;
  const simulatedMarginPct =
    simulatedPrice > 0 ? (simulatedUnitProfit / simulatedPrice) * 100 : 0;
  const simulatedMonthlyRevenue = simulatedPrice * simulatedMonthlyQty;
  const simulatedMonthlyProfitBeforeFees =
    simulatedUnitProfit * simulatedMonthlyQty;
  const simulatedMonthlyFees = simulatedMonthlyRevenue * variableFeeRate;
  const simulatedMonthlyProfit =
    simulatedMonthlyProfitBeforeFees - simulatedMonthlyFees;
  const recoveredMonthlyProfit = simulatedMonthlyProfit - currentMonthlyProfit;
  const recoveredAnnualProfit = recoveredMonthlyProfit * 12;
  const taxReserveRate = clamp(
    safeNumber(loaderData.assumptions.taxReservePct) / 100,
    0,
    1,
  );
  const taxReserveMonthly =
    Math.max(0, recoveredMonthlyProfit) * taxReserveRate;
  const taxReserveAnnual = taxReserveMonthly * 12;
  const netRecoveredMonthlyProfit =
    recoveredMonthlyProfit - taxReserveMonthly;
  const netRecoveredAnnualProfit = netRecoveredMonthlyProfit * 12;
  const marginDelta = simulatedMarginPct - currentMarginPct;
  const profitDeltaPct =
    Math.abs(currentMonthlyProfit) > 0
      ? (recoveredMonthlyProfit / Math.abs(currentMonthlyProfit)) * 100
      : recoveredMonthlyProfit > 0
        ? 100
        : 0;

  const breakEvenPrice =
    variableFeeRate < 1
      ? simulatedCost / (1 - variableFeeRate)
      : simulatedCost;
  const priceChangePct =
    currentPrice > 0
      ? ((simulatedPrice - currentPrice) / currentPrice) * 100
      : 0;

  const priceRecoveryMonthly =
    (simulatedPrice - currentPrice) * simulatedMonthlyQty;
  const costRecoveryMonthly =
    (currentCost - simulatedCost) * simulatedMonthlyQty;
  const volumeRecoveryMonthly =
    (simulatedMonthlyQty - currentMonthlyQty) *
    (currentPrice - currentCost);
  const feeImpactMonthly = currentMonthlyFees - simulatedMonthlyFees;
  const recoveryBreakdown = [
    {
      key: "price",
      label: language === "it" ? "Variazione prezzo" : "Price change",
      value: priceRecoveryMonthly * 12,
    },
    {
      key: "cost",
      label: language === "it" ? "Riduzione costo" : "Cost reduction",
      value: costRecoveryMonthly * 12,
    },
    {
      key: "volume",
      label: language === "it" ? "Variazione volume" : "Volume change",
      value: volumeRecoveryMonthly * 12,
    },
    {
      key: "fees",
      label:
        language === "it"
          ? "Impatto commissioni"
          : "Variable fee impact",
      value: feeImpactMonthly * 12,
    },
    {
      key: "tax-reserve",
      label:
        language === "it"
          ? `Riserva fiscale gestionale (${formatStorePercent(
            taxReserveRate * 100,
            "it-IT",
            1,
          )})`
          : `Business-model tax reserve (${formatStorePercent(
            taxReserveRate * 100,
            "en-US",
            1,
          )})`,
      value: -taxReserveAnnual,
    },
  ];

  const commercialRiskScore = clamp(
    Math.round(
      Math.max(0, priceChangePct) * 6 +
      Math.max(0, -salesChangePct) * 4 +
      (priceChangePct > 8 ? 12 : 0),
    ),
    0,
    100,
  );
  const riskLabel =
    commercialRiskScore >= 65
      ? language === "it"
        ? "Alto"
        : "High"
      : commercialRiskScore >= 35
        ? language === "it"
          ? "Medio"
          : "Medium"
        : language === "it"
          ? "Basso"
          : "Low";
  const riskColor =
    commercialRiskScore >= 65
      ? "#f87171"
      : commercialRiskScore >= 35
        ? "#f59e0b"
        : "#4ade80";

  const timeline = [1, 3, 6, 12].map((month) => ({
    month,
    value: netRecoveredMonthlyProfit * month,
  }));
  const priceMin = Math.max(0.01, currentPrice * 0.7);
  const priceMax = Math.max(currentPrice * 1.5, currentPrice + 1);
  const priceStep = Math.max(0.01, currentPrice / 500);

  const dataConfidenceScore = clamp(
    Math.round(
      (currentCost > 0 ? 40 : 0) +
      (currentPeriodQty >= 10 ? 30 : currentPeriodQty > 0 ? 15 : 0) +
      (selectedProduct.revenue > 0 ? 20 : 0) +
      (!selectedProduct.missingCost ? 10 : 0),
    ),
    0,
    100,
  );

  const confidenceLabel =
    dataConfidenceScore >= 80
      ? language === "it"
        ? "Alta"
        : "High"
      : dataConfidenceScore >= 55
        ? language === "it"
          ? "Media"
          : "Medium"
        : language === "it"
          ? "Bassa"
          : "Low";

  const profitHealth =
    simulatedMarginPct < 0
      ? language === "it"
        ? "In perdita"
        : "Loss-making"
      : simulatedMarginPct < 10
        ? language === "it"
          ? "Critico"
          : "Critical"
        : simulatedMarginPct < 20
          ? language === "it"
            ? "Debole"
            : "Weak"
          : simulatedMarginPct < 35
            ? language === "it"
              ? "Solido"
              : "Healthy"
            : language === "it"
              ? "Forte"
              : "Strong";

  const locale = language === "it" ? "it-IT" : "en-US";

  const money = (value: number, digits = 0) =>
    formatStoreMoney(value, currencyCode, locale, digits);

  const pct = (value: number, digits = 1) =>
    formatStorePercent(value, locale, digits);

  const formatSignedMoney = (value: number, digits = 0) => {
    const sign = value > 0 ? "+" : value < 0 ? "−" : "";
    return `${sign}${money(Math.abs(value), digits)}`;
  };

  const formatSignedPct = (value: number, digits = 1) => {
    const sign = value > 0 ? "+" : value < 0 ? "−" : "";
    return `${sign}${pct(Math.abs(value), digits)}`;
  };

  const recommendation = (() => {
    const priceIncreasePct =
      currentPrice > 0
        ? ((simulatedPrice - currentPrice) / currentPrice) * 100
        : 0;

    if (simulatedMonthlyProfit <= currentMonthlyProfit) {
      return language === "it"
        ? `Questo scenario riduce il profitto mensile stimato. La variazione delle vendite non compensa il nuovo equilibrio tra prezzo e costo. Riduci l'ipotesi di calo delle vendite oppure aumenta il prezzo sopra ${money(
          Math.max(currentPrice, breakEvenPrice),
          2,
        )}.`
        : `This scenario lowers estimated monthly profit. The sales change does not compensate for the new price and cost balance. Reduce the assumed sales decline or move the price above ${money(
          Math.max(currentPrice, breakEvenPrice),
          2,
        )}.`;
    }

    if (costReductionPct >= 4 && priceIncreasePct < 4) {
      return language === "it"
        ? `La leva più efficace in questo scenario è il costo. Una riduzione del ${pct(
          costReductionPct,
        )} porta il margine dal ${pct(currentMarginPct)} al ${pct(
          simulatedMarginPct,
        )} con un aumento di prezzo limitato. Prima di intervenire sul listino, valuta una negoziazione con il fornitore.`
        : `Cost reduction is the strongest lever in this scenario. A ${pct(
          costReductionPct,
        )} reduction moves margin from ${pct(currentMarginPct)} to ${pct(
          simulatedMarginPct,
        )} with only a limited price increase. Consider supplier negotiation before changing the retail price.`;
    }

    if (priceIncreasePct >= 8) {
      return language === "it"
        ? `Portare il prezzo a ${money(
          simulatedPrice,
          2,
        )} genera un impatto importante, ma l'aumento del ${pct(
          priceIncreasePct,
        )} è significativo. Testa la modifica su un periodo breve o su una parte del traffico per verificare la risposta della domanda.`
        : `Moving the price to ${money(
          simulatedPrice,
          2,
        )} creates a meaningful impact, but the ${pct(
          priceIncreasePct,
        )} increase is material. Test it over a short period or on part of your traffic to validate demand response.`;
    }

    return language === "it"
      ? `Portare il prezzo a ${money(
        simulatedPrice,
        2,
      )} e ridurre il costo del ${pct(
        costReductionPct,
      )} aumenta il margine dal ${pct(currentMarginPct)} al ${pct(
        simulatedMarginPct,
      )}. Con i volumi ipotizzati, il recupero stimato è ${formatSignedMoney(
        netRecoveredAnnualProfit,
        0,
      )} all'anno. Questo è un equilibrio credibile tra redditività e rischio commerciale.`
      : `Moving the price to ${money(
        simulatedPrice,
        2,
      )} and reducing cost by ${pct(
        costReductionPct,
      )} increases margin from ${pct(currentMarginPct)} to ${pct(
        simulatedMarginPct,
      )}. At the assumed volume, estimated recovery is ${formatSignedMoney(
        netRecoveredAnnualProfit,
        0,
      )} per year. This is a credible balance between profitability and commercial risk.`;
  })();

  const suggestedActions = [
    {
      visible: simulatedPrice > currentPrice,
      text:
        language === "it"
          ? `Valuta un prezzo di ${money(simulatedPrice, 2)}`
          : `Evaluate a ${money(simulatedPrice, 2)} selling price`,
    },
    {
      visible: costReductionPct > 0,
      text:
        language === "it"
          ? `Negozia una riduzione costo del ${pct(costReductionPct)}`
          : `Negotiate a ${pct(costReductionPct)} cost reduction`,
    },
    {
      visible: salesChangePct < 0,
      text:
        language === "it"
          ? "Controlla il possibile calo di conversione dopo il cambio prezzo"
          : "Monitor possible conversion decline after the price change",
    },
    {
      visible: salesChangePct >= 0,
      text:
        language === "it"
          ? "Monitora vendite e margine per confermare l'impatto reale"
          : "Monitor sales and margin to confirm the real impact",
    },
  ].filter((item) => item.visible);

  const handleManualPriceChange = (value: number) => {
    setScenario("custom");
    setSimulatedPrice(roundCurrency(value));
  };

  const handleManualCostChange = (value: number) => {
    setScenario("custom");
    setCostReductionPct(value);
  };

  const handleManualSalesChange = (value: number) => {
    setScenario("custom");
    setSalesChangePct(value);
  };

  const applyAiSuggestedScenario = () => {
    const targetMarginPct =
      currentMarginPct < 20 ? 20 : Math.min(30, currentMarginPct + 5);
    const suggestedCostReduction = currentCost > 0 ? 2 : 0;
    const suggestedCost = currentCost * (1 - suggestedCostReduction / 100);
    const priceForTargetMargin =
      targetMarginPct < 100
        ? suggestedCost / (1 - targetMarginPct / 100)
        : currentPrice;
    const suggestedPriceIncrease = clamp(
      currentPrice > 0
        ? ((priceForTargetMargin - currentPrice) / currentPrice) * 100
        : 0,
      0,
      8,
    );

    setScenario("custom");
    setSimulatedPrice(
      roundCurrency(currentPrice * (1 + suggestedPriceIncrease / 100)),
    );
    setCostReductionPct(suggestedCostReduction);
    setSalesChangePct(-Math.round(suggestedPriceIncrease * 0.35 * 10) / 10);
    setSaveMessage(
      language === "it"
        ? "Scenario suggerito applicato"
        : "Suggested scenario applied",
    );
  };

  const saveCurrentScenario = () => {
    const defaultName =
      language === "it"
        ? `Scenario ${savedScenarios.length + 1}`
        : `Scenario ${savedScenarios.length + 1}`;
    const saved: SavedScenario = {
      id: `${Date.now()}-${selectedProduct.productId}`,
      name: scenarioName.trim() || defaultName,
      productId: selectedProduct.productId,
      productTitle: selectedProduct.productTitle,
      simulatedPrice,
      costReductionPct,
      salesChangePct,
      monthlyProfit: simulatedMonthlyProfit,
      annualRecovery: netRecoveredAnnualProfit,
      marginPct: simulatedMarginPct,
      createdAt: new Date().toISOString(),
    };

    setSavedScenarios((current) => [saved, ...current].slice(0, 6));
    setScenarioName("");
    setSaveMessage(language === "it" ? "Scenario salvato" : "Scenario saved");
  };

  const loadSavedScenario = (saved: SavedScenario) => {
    const productExists = availableProducts.some(
      (product) => product.productId === saved.productId,
    );
    if (!productExists) return;

    if (saved.productId === selectedProduct.productId) {
      setScenario("custom");
      setSimulatedPrice(roundCurrency(saved.simulatedPrice));
      setCostReductionPct(saved.costReductionPct);
      setSalesChangePct(saved.salesChangePct);
    } else {
      setPendingScenario(saved);
      setSelectedProductId(saved.productId);
    }
    setSaveMessage(language === "it" ? "Scenario caricato" : "Scenario loaded");
  };

  const deleteSavedScenario = (id: string) => {
    setSavedScenarios((current) => current.filter((item) => item.id !== id));
  };

  const exportCurrentScenario = () => {
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

    const scenarioLabel =
      scenario === "conservative"
        ? language === "it"
          ? "Conservativo"
          : "Conservative"
        : scenario === "balanced"
          ? language === "it"
            ? "Bilanciato"
            : "Balanced"
          : scenario === "aggressive"
            ? language === "it"
              ? "Aggressivo"
              : "Aggressive"
            : language === "it"
              ? "Personalizzato"
              : "Custom";

    const rowsToExport: CsvValue[][] = [
      ["MarginLab Recovery Simulator"],
      [],
      [language === "it" ? "METADATI" : "METADATA"],
      [language === "it" ? "Voce" : "Field", language === "it" ? "Valore" : "Value"],
      [language === "it" ? "Store" : "Store", loaderData.shopHandle || ""],
      [language === "it" ? "Data esportazione" : "Export date", new Date().toISOString()],
      [language === "it" ? "Periodo osservato (giorni)" : "Observed period (days)", periodDays],
      [language === "it" ? "Valuta" : "Currency", currencyCode],
      [language === "it" ? "Lingua" : "Language", language.toUpperCase()],
      [language === "it" ? "Scenario" : "Scenario", scenarioLabel],
      [],
      [language === "it" ? "PRODOTTO E BASELINE ECONOMICA" : "PRODUCT AND ECONOMIC BASELINE"],
      [language === "it" ? "Voce" : "Metric", language === "it" ? "Valore" : "Value"],
      [language === "it" ? "Prodotto" : "Product", selectedProduct.productTitle],
      ["Product ID", selectedProduct.productId],
      [language === "it" ? "Prezzo attuale" : "Current price", round(currentPrice)],
      [language === "it" ? "Costo attuale" : "Current cost", round(currentCost)],
      [language === "it" ? "Unità nel periodo" : "Units in observed period", round(currentPeriodQty)],
      [language === "it" ? "Unità mensili normalizzate" : "Normalized monthly units", round(currentMonthlyQty)],
      [language === "it" ? "Ricavi economici mensili attuali" : "Current monthly economic revenue", round(currentMonthlyRevenue)],
      [language === "it" ? "Profitto economico mensile attuale" : "Current monthly economic profit", round(currentMonthlyProfit)],
      [language === "it" ? "Margine economico attuale (%)" : "Current economic margin (%)", round(currentMarginPct)],
      [],
      [language === "it" ? "IPOTESI DELLO SCENARIO" : "SCENARIO ASSUMPTIONS"],
      [language === "it" ? "Voce" : "Assumption", language === "it" ? "Valore" : "Value"],
      [language === "it" ? "Prezzo simulato" : "Simulated price", round(simulatedPrice)],
      [language === "it" ? "Variazione prezzo (%)" : "Price change (%)", round(priceChangePct)],
      [language === "it" ? "Riduzione costo (%)" : "Cost reduction (%)", round(costReductionPct)],
      [language === "it" ? "Variazione vendite (%)" : "Sales change (%)", round(salesChangePct)],
      [language === "it" ? "Commissioni pagamento (%)" : "Payment fees (%)", round(loaderData.assumptions.paymentFeePct)],
      [language === "it" ? "Commissioni transazione (%)" : "Transaction fees (%)", round(loaderData.assumptions.transactionFeePct)],
      [language === "it" ? "Riserva fiscale gestionale (%)" : "Business-model tax reserve (%)", round(loaderData.assumptions.taxReservePct)],
      [],
      [language === "it" ? "RISULTATO SIMULATO" : "SIMULATED RESULT"],
      [language === "it" ? "Voce" : "Metric", language === "it" ? "Valore" : "Value"],
      [language === "it" ? "Costo simulato" : "Simulated cost", round(simulatedCost)],
      [language === "it" ? "Unità mensili simulate" : "Simulated monthly units", round(simulatedMonthlyQty)],
      [language === "it" ? "Ricavi mensili simulati" : "Simulated monthly revenue", round(simulatedMonthlyRevenue)],
      [language === "it" ? "Profitto mensile simulato" : "Simulated monthly profit", round(simulatedMonthlyProfit)],
      [language === "it" ? "Margine simulato (%)" : "Simulated margin (%)", round(simulatedMarginPct)],
      [language === "it" ? "Variazione margine (punti %)" : "Margin change (percentage points)", round(marginDelta)],
      [language === "it" ? "Recupero mensile lordo" : "Gross monthly recovery", round(recoveredMonthlyProfit)],
      [language === "it" ? "Riserva fiscale mensile" : "Monthly tax reserve", round(taxReserveMonthly)],
      [language === "it" ? "Recupero mensile netto" : "Net monthly recovery", round(netRecoveredMonthlyProfit)],
      [language === "it" ? "Recupero annuale netto" : "Net annual recovery", round(netRecoveredAnnualProfit)],
      [language === "it" ? "Salute del profitto" : "Profit health", profitHealth],
      [language === "it" ? "Rischio commerciale" : "Commercial risk", riskLabel],
      [language === "it" ? "Punteggio rischio commerciale" : "Commercial risk score", commercialRiskScore],
      [language === "it" ? "Data Confidence" : "Data Confidence", dataConfidenceScore],
      [language === "it" ? "Livello Data Confidence" : "Data Confidence level", confidenceLabel],
      [],
      [language === "it" ? "IMPATTO ANNUALE PER LEVA" : "ANNUAL IMPACT BY LEVER"],
      [language === "it" ? "Leva" : "Lever", language === "it" ? "Importo" : "Amount"],
      ...recoveryBreakdown.map((item) => [item.label, round(item.value)] as CsvValue[]),
      [],
      [language === "it" ? "RACCOMANDAZIONE" : "RECOMMENDATION"],
      [recommendation],
      [],
      [
        language === "it"
          ? "Nota: questo file contiene una simulazione, non risultati osservati. MarginLab non modifica automaticamente prezzi o costi."
          : "Note: this file contains a simulation, not observed results. MarginLab does not automatically change prices or costs.",
      ],
    ];

    const csv = `\uFEFF${rowsToExport
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeProductName = selectedProduct.productTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
    link.href = url;
    link.download = `${loaderData.shopHandle || "store"}-recovery-scenario-${safeProductName || "product"}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="dashboard-shell">
      <style>{`
        @keyframes recoveryMetricIn {
          0% { opacity: 0.55; transform: translateY(5px) scale(0.985); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes recoveryUnlockIn {
          0% { opacity: 0; transform: translateY(8px) scale(0.96); }
          55% { opacity: 1; transform: translateY(-2px) scale(1.02); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }

        .recovery-growth-button {
          min-height: 48px;
          padding-inline: 22px !important;
          font-weight: 950 !important;
          box-shadow: 0 0 0 1px rgba(255,115,60,0.18), 0 12px 34px rgba(255,115,60,0.28) !important;
          transition: transform 180ms ease, box-shadow 180ms ease !important;
        }

        .recovery-growth-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 0 0 1px rgba(255,115,60,0.3), 0 16px 42px rgba(255,115,60,0.38) !important;
        }

        .recovery-range {
          appearance: none;
          -webkit-appearance: none;
          height: 26px;
          background: transparent;
          cursor: pointer;
        }

        .recovery-range::-webkit-slider-runnable-track {
          height: 7px;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(255,115,60,0.95), rgba(255,154,112,0.72));
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08), 0 0 18px rgba(255,115,60,0.12);
        }

        .recovery-range::-webkit-slider-thumb {
          appearance: none;
          -webkit-appearance: none;
          width: 22px;
          height: 22px;
          margin-top: -7.5px;
          border-radius: 999px;
          background: #ff8a5c;
          border: 3px solid #121826;
          box-shadow: 0 0 0 2px rgba(255,138,92,0.32), 0 5px 16px rgba(255,115,60,0.42);
        }

        .recovery-range::-moz-range-track {
          height: 7px;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(255,115,60,0.95), rgba(255,154,112,0.72));
        }

        .recovery-range::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          background: #ff8a5c;
          border: 3px solid #121826;
          box-shadow: 0 0 0 2px rgba(255,138,92,0.32), 0 5px 16px rgba(255,115,60,0.42);
        }

        .recovery-metric-card,
        .recovery-annual-value {
          animation: recoveryMetricIn 260ms ease-out;
        }

        .recovery-unlocked-badge {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          margin-top: 16px;
          padding: 10px 13px;
          border-radius: 14px;
          color: #86efac;
          background: rgba(34,197,94,0.09);
          border: 1px solid rgba(34,197,94,0.19);
          font-size: 12px;
          line-height: 1.4;
          font-weight: 900;
          animation: recoveryUnlockIn 380ms ease-out;
        }

        @media (max-width: 980px) {
          .recovery-growth-button { width: 100%; }
        }
      `}</style>
      <div className="dashboard-container">
        <DashboardNav active="recovery-simulator" navigate={navigate} />

        <div className="hero-header">
          <div>
            <div className="alert-pill">
              <span className="alert-dot" />
              {growthAccess
                ? language === "it"
                  ? "Piano Growth attivo"
                  : "Growth Plan Active"
                : language === "it"
                  ? "Anteprima del piano Growth"
                  : "Growth Plan Preview"}
            </div>

            <div className="eyebrow">
              {language === "it"
                ? "SIMULATORE DI RECUPERO"
                : "RECOVERY SIMULATOR"}
            </div>

            <div className="hero-title">
              {language === "it"
                ? "Simula una decisione prima di applicarla al tuo store"
                : "See the profit impact before changing your store"}
            </div>

            <div className="hero-description">
              {language === "it"
                ? "Modifica prezzo, costo e volume di vendita. MarginLab mostra subito l’impatto sul margine, sul profitto mensile e sul risultato annuale."
                : "Adjust price, cost and sales volume. MarginLab instantly shows the impact on margin, monthly profit and annual results."}
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
              className="primary-button recovery-growth-button"
              onClick={() => navigate("/app/billing")}
            >
              {language === "it" ? "Sblocca Growth →" : "Unlock Growth →"}
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
                    ? "Recovery Simulator è incluso nel piano Growth"
                    : "Recovery Simulator is included with Growth"}
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
                    ? "Passa a Growth per simulare prezzo, costo e volume, confrontare scenari ed esportare le decisioni."
                    : "Upgrade to Growth to simulate price, cost and volume, compare scenarios and export decisions."}
                </div>

                <button
                  type="button"
                  className="primary-button recovery-growth-button"
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
            <div style={{ ...cardStyle, padding: 22 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1.25fr) minmax(280px, 0.75fr)",
                  gap: 20,
                  alignItems: "end",
                }}
              >
                <div>
                  <div style={mutedLabelStyle}>
                    {language === "it"
                      ? "Selezione prodotto"
                      : "Product selection"}
                  </div>
                  <div
                    style={{
                      marginTop: 9,
                      color: "#f8fafc",
                      fontSize: 20,
                      fontWeight: 950,
                    }}
                  >
                    {language === "it"
                      ? "Scegli il prodotto da simulare"
                      : "Choose the product to simulate"}
                  </div>
                </div>

                <div style={{ position: "relative" }}>
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={
                      language === "it"
                        ? "Cerca un prodotto..."
                        : "Search a product..."
                    }
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      borderRadius: 16,
                      padding: "14px 16px",
                      color: "#f8fafc",
                      background: "rgba(255,255,255,0.045)",
                      border: "1px solid rgba(255,115,60,0.2)",
                      outline: "none",
                      fontWeight: 800,
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 10,
                  marginTop: 18,
                }}
              >
                {filteredProducts.map((product) => {
                  const isActive =
                    product.productId === selectedProduct.productId;

                  return (
                    <button
                      key={product.productId || product.productTitle}
                      type="button"
                      onClick={() => {
                        setSelectedProductId(product.productId);
                        setSearchQuery("");
                      }}
                      style={{
                        minHeight: 74,
                        padding: 14,
                        borderRadius: 16,
                        textAlign: "left",
                        cursor: "pointer",
                        background: isActive
                          ? "linear-gradient(135deg, rgba(255,115,60,0.17), rgba(255,115,60,0.07))"
                          : "rgba(255,255,255,0.035)",
                        border: isActive
                          ? "1px solid rgba(255,115,60,0.48)"
                          : "1px solid rgba(255,255,255,0.075)",
                      }}
                    >
                      <div
                        style={{
                          color: "#f8fafc",
                          fontWeight: 900,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {product.productTitle}
                      </div>
                      <div
                        style={{
                          marginTop: 7,
                          color: "rgba(255,255,255,0.52)",
                          fontSize: 12,
                          fontWeight: 800,
                        }}
                      >
                        {money(product.avgPrice, 2)} · {product.qty}{" "}
                        {language === "it" ? "unità" : "units"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(280px, 0.72fr) minmax(0, 1.28fr)",
                gap: 24,
                marginTop: 24,
              }}
            >
              <div style={cardStyle}>
                <div style={mutedLabelStyle}>
                  {language === "it"
                    ? "Baseline economica attuale"
                    : "Current economic baseline"}
                </div>

                <div
                  style={{
                    marginTop: 12,
                    color: "#f8fafc",
                    fontSize: 23,
                    lineHeight: 1.25,
                    fontWeight: 950,
                  }}
                >
                  {selectedProduct.productTitle}
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 12,
                    marginTop: 22,
                  }}
                >
                  {[
                    [
                      language === "it" ? "Prezzo" : "Selling price",
                      money(currentPrice, 2),
                    ],
                    [language === "it" ? "Costo" : "Cost", money(currentCost, 2)],
                    [
                      language === "it" ? "Vendite mensili" : "Monthly sales",
                      Math.round(currentMonthlyQty).toString(),
                    ],
                    [
                      language === "it" ? "Margine" : "Margin",
                      pct(currentMarginPct),
                    ],
                    [
                      language === "it" ? "Profitto mensile" : "Monthly profit",
                      money(currentMonthlyProfit, 0),
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 18,
                        alignItems: "center",
                        paddingBottom: 12,
                        borderBottom: "1px solid rgba(255,255,255,0.07)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span
                          style={{
                            color: "rgba(255,255,255,0.54)",
                            fontSize: 13,
                            fontWeight: 800,
                          }}
                        >
                          {label}
                        </span>

                        {label ===
                          (language === "it" ? "Profitto mensile" : "Monthly profit") && (
                            <MetricTooltip
                              content={{
                                title:
                                  language === "it"
                                    ? "Profitto mensile attuale"
                                    : "Current monthly profit",
                                description:
                                  language === "it"
                                    ? "Profitto economico del prodotto normalizzato su 30 giorni e al netto delle commissioni variabili configurate in MarginLab. Rappresenta la base di partenza usata dal simulatore."
                                    : "The product's economic profit normalized to 30 days and reduced by the variable fees configured in MarginLab. This is the starting baseline used by the simulator.",
                              }}
                            />
                          )}
                      </div>
                      <strong style={{ color: "#f8fafc", fontSize: 16 }}>
                        {value}
                      </strong>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    marginTop: 22,
                    padding: 16,
                    borderRadius: 16,
                    background:
                      currentPrice <= currentCost
                        ? "rgba(239,68,68,0.09)"
                        : "rgba(255,115,60,0.075)",
                    border:
                      currentPrice <= currentCost
                        ? "1px solid rgba(239,68,68,0.22)"
                        : "1px solid rgba(255,115,60,0.17)",
                  }}
                >
                  <div style={mutedLabelStyle}>
                    {language === "it"
                      ? "Prezzo di pareggio"
                      : "Break-even price"}
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      color: currentPrice <= currentCost ? "#f87171" : "#ff9a70",
                      fontSize: 25,
                      fontWeight: 950,
                    }}
                  >
                    {money(currentCost, 2)}
                  </div>
                  <div
                    style={{
                      marginTop: 5,
                      color: "rgba(255,255,255,0.52)",
                      fontSize: 12,
                      lineHeight: 1.5,
                      fontWeight: 750,
                    }}
                  >
                    {language === "it"
                      ? "Sotto questo valore il prodotto non copre il costo economico unitario e le commissioni variabili impostate."
                      : "Below this value, the product does not cover its economic unit cost and configured variable fees."}
                  </div>
                </div>
              </div>

              <div
                style={{
                  ...cardStyle,
                  background:
                    "radial-gradient(circle at top right, rgba(255,115,60,0.11), transparent 34%), linear-gradient(180deg, rgba(17,24,39,0.98), rgba(7,12,21,0.99))",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div style={mutedLabelStyle}>
                      {language === "it" ? "Simulazione live" : "Live simulation"}
                    </div>
                    <div
                      style={{
                        marginTop: 9,
                        color: "#f8fafc",
                        fontSize: 20,
                        fontWeight: 950,
                      }}
                    >
                      {language === "it"
                        ? "Modifica le tre leve di profitto"
                        : "Adjust the three profit levers"}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "8px 12px",
                      borderRadius: 999,
                      background: "rgba(255,115,60,0.1)",
                      border: "1px solid rgba(255,115,60,0.2)",
                      color: "#ff9a70",
                      fontSize: 11,
                      fontWeight: 900,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    {scenario === "custom"
                      ? language === "it"
                        ? "Scenario personalizzato"
                        : "Custom scenario"
                      : scenario === "conservative"
                        ? language === "it"
                          ? "Prudente"
                          : "Conservative"
                        : scenario === "balanced"
                          ? language === "it"
                            ? "Bilanciato"
                            : "Balanced"
                          : language === "it"
                            ? "Aggressivo"
                            : "Aggressive"}
                  </div>
                </div>

                <div style={{ display: "grid", gap: 26, marginTop: 30 }}>
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 16,
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ color: "#f8fafc", fontWeight: 900 }}>
                          {language === "it"
                            ? "Prezzo di vendita"
                            : "Selling price"}
                        </div>
                        <div
                          style={{
                            marginTop: 4,
                            color: "rgba(255,255,255,0.48)",
                            fontSize: 12,
                            fontWeight: 750,
                          }}
                        >
                          {language === "it"
                            ? `Attuale ${money(currentPrice, 2)}`
                            : `Current ${money(currentPrice, 2)}`}
                        </div>
                      </div>
                      <div
                        style={{
                          color:
                            simulatedPrice >= currentPrice
                              ? "#4ade80"
                              : "#f59e0b",
                          fontSize: 24,
                          fontWeight: 950,
                        }}
                      >
                        {money(simulatedPrice, 2)}
                      </div>
                    </div>
                    <input
                      className="recovery-range"
                      type="range"
                      min={priceMin}
                      max={priceMax}
                      step={priceStep}
                      value={simulatedPrice}
                      onChange={(event) =>
                        handleManualPriceChange(Number(event.target.value))
                      }
                      style={{
                        width: "100%",
                        marginTop: 16,
                        accentColor: "#ff733c",
                      }}
                    />
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginTop: 6,
                        color: "rgba(255,255,255,0.38)",
                        fontSize: 11,
                        fontWeight: 750,
                      }}
                    >
                      <span>{money(priceMin, 2)}</span>
                      <span>{money(priceMax, 2)}</span>
                    </div>
                  </div>

                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 16,
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ color: "#f8fafc", fontWeight: 900 }}>
                          {language === "it"
                            ? "Riduzione del costo"
                            : "Cost reduction"}
                        </div>
                        <div
                          style={{
                            marginTop: 4,
                            color: "rgba(255,255,255,0.48)",
                            fontSize: 12,
                            fontWeight: 750,
                          }}
                        >
                          {language === "it"
                            ? `Nuovo costo ${money(simulatedCost, 2)}`
                            : `New cost ${money(simulatedCost, 2)}`}
                        </div>
                      </div>
                      <div
                        style={{
                          color: "#4ade80",
                          fontSize: 24,
                          fontWeight: 950,
                        }}
                      >
                        {pct(costReductionPct, 1)}
                      </div>
                    </div>
                    <input
                      className="recovery-range"
                      type="range"
                      min={0}
                      max={20}
                      step={0.5}
                      value={costReductionPct}
                      onChange={(event) =>
                        handleManualCostChange(Number(event.target.value))
                      }
                      style={{
                        width: "100%",
                        marginTop: 16,
                        accentColor: "#ff733c",
                      }}
                    />
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginTop: 6,
                        color: "rgba(255,255,255,0.38)",
                        fontSize: 11,
                        fontWeight: 750,
                      }}
                    >
                      <span>0%</span>
                      <span>20%</span>
                    </div>
                  </div>

                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 16,
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ color: "#f8fafc", fontWeight: 900 }}>
                          {language === "it"
                            ? "Variazione delle vendite"
                            : "Sales change"}
                        </div>
                        <div
                          style={{
                            marginTop: 4,
                            color: "rgba(255,255,255,0.48)",
                            fontSize: 12,
                            fontWeight: 750,
                          }}
                        >
                          {language === "it"
                            ? `${Math.round(simulatedMonthlyQty)} unità mensili stimate`
                            : `${Math.round(simulatedMonthlyQty)} estimated monthly units`}
                        </div>
                      </div>
                      <div
                        style={{
                          color: salesChangePct >= 0 ? "#4ade80" : "#f59e0b",
                          fontSize: 24,
                          fontWeight: 950,
                        }}
                      >
                        {formatSignedPct(salesChangePct, 1)}
                      </div>
                    </div>
                    <input
                      className="recovery-range"
                      type="range"
                      min={-30}
                      max={30}
                      step={1}
                      value={salesChangePct}
                      onChange={(event) =>
                        handleManualSalesChange(Number(event.target.value))
                      }
                      style={{
                        width: "100%",
                        marginTop: 16,
                        accentColor: "#ff733c",
                      }}
                    />
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginTop: 6,
                        color: "rgba(255,255,255,0.38)",
                        fontSize: 11,
                        fontWeight: 750,
                      }}
                    >
                      <span>−30%</span>
                      <span>+30%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 14,
                marginTop: 24,
              }}
            >
              {scenarios.map((item) => {
                const active = scenario === item.key;
                const label =
                  item.key === "conservative"
                    ? language === "it"
                      ? "Prudente"
                      : "Conservative"
                    : item.key === "balanced"
                      ? language === "it"
                        ? "Bilanciato"
                        : "Balanced"
                      : language === "it"
                        ? "Aggressivo"
                        : "Aggressive";

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => applyScenario(item.key)}
                    style={{
                      padding: 18,
                      borderRadius: 20,
                      cursor: "pointer",
                      textAlign: "left",
                      background: active
                        ? "linear-gradient(135deg, rgba(255,115,60,0.18), rgba(255,115,60,0.07))"
                        : "rgba(255,255,255,0.03)",
                      border: active
                        ? "1px solid rgba(255,115,60,0.48)"
                        : "1px solid rgba(255,255,255,0.075)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 9,
                        color: "#f8fafc",
                        fontSize: 15,
                        fontWeight: 950,
                      }}
                    >
                      <span
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: 999,
                          background: active
                            ? "#ff733c"
                            : "rgba(255,255,255,0.2)",
                        }}
                      />
                      {label}
                    </div>
                    <div
                      style={{
                        marginTop: 9,
                        color: "rgba(255,255,255,0.52)",
                        fontSize: 12,
                        lineHeight: 1.55,
                        fontWeight: 750,
                      }}
                    >
                      {language === "it"
                        ? `Prezzo +${item.priceChangePct}% · Costo −${item.costReductionPct}% · Vendite ${formatSignedPct(item.salesChangePct, 0)}`
                        : `Price +${item.priceChangePct}% · Cost −${item.costReductionPct}% · Sales ${formatSignedPct(item.salesChangePct, 0)}`}
                    </div>
                  </button>
                );
              })}
            </div>

            <div
              style={{
                ...cardStyle,
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 0.9fr)",
                gap: 22,
                marginTop: 24,
                alignItems: "center",
                background:
                  "radial-gradient(circle at top left, rgba(124,58,237,0.16), transparent 42%), linear-gradient(180deg, rgba(17,24,39,0.98), rgba(7,12,21,0.99))",
                border: "1px solid rgba(167,139,250,0.24)",
              }}
            >
              <div>
                <div style={{ ...mutedLabelStyle, color: "#c4b5fd" }}>
                  {language === "it"
                    ? "SCENARIO SUGGERITO"
                    : "SUGGESTED SCENARIO"}
                </div>
                <div
                  style={{
                    marginTop: 9,
                    color: "#f8fafc",
                    fontSize: 21,
                    fontWeight: 950,
                  }}
                >
                  {language === "it"
                    ? "Lascia che MarginLab trovi un equilibrio credibile"
                    : "Let MarginLab find a credible balance"}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    color: "rgba(255,255,255,0.58)",
                    lineHeight: 1.65,
                    fontSize: 13,
                    fontWeight: 750,
                  }}
                >
                  {language === "it"
                    ? "La proposta usa margine economico, costo economico e volume storico del prodotto, limita l'aumento di prezzo e include una stima prudente della risposta delle vendite."
                    : "The proposal uses the product's economic margin, economic cost and sales history, caps the price increase and includes a cautious estimate of demand response."}
                </div>
              </div>
              <button
                type="button"
                onClick={applyAiSuggestedScenario}
                style={{
                  minHeight: 52,
                  padding: "14px 20px",
                  borderRadius: 16,
                  cursor: "pointer",
                  color: "#fff",
                  background:
                    "linear-gradient(135deg, rgba(124,58,237,0.95), rgba(255,115,60,0.9))",
                  border: "1px solid rgba(255,255,255,0.16)",
                  boxShadow: "0 14px 34px rgba(124,58,237,0.2)",
                  fontWeight: 950,
                }}
              >
                {language === "it"
                  ? "Applica scenario suggerito"
                  : "Apply suggested scenario"}
              </button>
            </div>

            <div style={{ marginTop: 24 }}>
              <div className="section-header">
                <div>
                  <div className="section-title">
                    {language === "it"
                      ? "Risultato in tempo reale"
                      : "Live result"}
                  </div>
                  <div className="section-subtitle">
                    {language === "it"
                      ? "Confronto tra la situazione attuale e lo scenario simulato."
                      : "Comparison between the current situation and the simulated scenario."}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={exportCurrentScenario}
                  style={{
                    minHeight: 42,
                    padding: "0 15px",
                    borderRadius: 13,
                    cursor: "pointer",
                    color: "#f8fafc",
                    background: "rgba(255,255,255,0.055)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    fontSize: 12,
                    fontWeight: 900,
                    whiteSpace: "nowrap",
                  }}
                >
                  {language === "it" ? "Esporta scenario CSV" : "Export scenario CSV"}
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: 16,
                  marginTop: 18,
                }}
              >
                {[
                  {
                    label: language === "it" ? "Nuovo margine" : "New margin",
                    value: pct(simulatedMarginPct),
                    note: formatSignedPct(marginDelta, 1),
                    positive: marginDelta >= 0,
                  },
                  {
                    label:
                      language === "it"
                        ? "Nuovo profitto mensile"
                        : "New monthly profit",
                    value: money(simulatedMonthlyProfit, 0),
                    note: formatSignedPct(profitDeltaPct, 1),
                    positive: recoveredMonthlyProfit >= 0,
                  },
                  {
                    label:
                      language === "it"
                        ? "Recupero mensile netto"
                        : "Net monthly recovery",
                    value: formatSignedMoney(netRecoveredMonthlyProfit, 0),
                    note:
                      language === "it" ? "Impatto stimato" : "Estimated impact",
                    positive: netRecoveredMonthlyProfit >= 0,
                  },
                  {
                    label:
                      language === "it"
                        ? "Recupero annuale netto"
                        : "Net annual recovery",
                    value: formatSignedMoney(netRecoveredAnnualProfit, 0),
                    note:
                      language === "it"
                        ? "Proiezione 12 mesi"
                        : "12-month projection",
                    positive: netRecoveredAnnualProfit >= 0,
                  },
                ].map((item) => (
                  <div
                    key={`${item.label}-${item.value}`}
                    className="recovery-metric-card"
                    style={{
                      borderRadius: 23,
                      padding: 22,
                      background: item.positive
                        ? "radial-gradient(circle at top left, rgba(34,197,94,0.13), transparent 40%), linear-gradient(180deg, rgba(17,24,39,0.97), rgba(7,12,21,0.99))"
                        : "radial-gradient(circle at top left, rgba(239,68,68,0.12), transparent 40%), linear-gradient(180deg, rgba(17,24,39,0.97), rgba(7,12,21,0.99))",
                      border: item.positive
                        ? "1px solid rgba(34,197,94,0.22)"
                        : "1px solid rgba(239,68,68,0.22)",
                    }}
                  >
                    <div
                      style={{
                        ...mutedLabelStyle,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span>{item.label}</span>

                      {item.label ===
                        (language === "it"
                          ? "Recupero mensile netto"
                          : "Net monthly recovery") && (
                          <MetricTooltip
                            content={{
                              title:
                                language === "it"
                                  ? "Recupero mensile netto"
                                  : "Net monthly recovery",
                              description:
                                language === "it"
                                  ? "Differenza stimata tra il profitto mensile dello scenario simulato e quello attuale, dopo l'eventuale riserva fiscale gestionale configurata. È un risultato della simulazione, non profitto già realizzato."
                                  : "Estimated difference between the simulated monthly profit and the current monthly profit, after any configured business-model tax reserve. It is a simulation result, not profit already realized.",
                            }}
                          />
                        )}
                    </div>
                    <div
                      style={{
                        marginTop: 12,
                        color: item.positive ? "#4ade80" : "#f87171",
                        fontSize: 29,
                        lineHeight: 1,
                        fontWeight: 950,
                        letterSpacing: "-0.035em",
                      }}
                    >
                      {item.value}
                    </div>
                    <div
                      style={{
                        marginTop: 9,
                        color: "rgba(255,255,255,0.54)",
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      {item.note}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                ...cardStyle,
                marginTop: 24,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 20,
                  alignItems: "flex-end",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={mutedLabelStyle}>
                    {language === "it" ? "SCENARI SALVATI" : "SAVED SCENARIOS"}
                  </div>
                  <div
                    style={{
                      marginTop: 9,
                      color: "#f8fafc",
                      fontSize: 21,
                      fontWeight: 950,
                    }}
                  >
                    {language === "it"
                      ? "Salva e confronta le decisioni"
                      : "Save and compare decisions"}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <input
                    value={scenarioName}
                    onChange={(event) => setScenarioName(event.target.value)}
                    placeholder={
                      language === "it" ? "Nome dello scenario" : "Scenario name"
                    }
                    style={{
                      minHeight: 46,
                      minWidth: 220,
                      padding: "0 14px",
                      borderRadius: 14,
                      color: "#f8fafc",
                      background: "rgba(255,255,255,0.045)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      outline: "none",
                      fontWeight: 800,
                    }}
                  />
                  <button
                    type="button"
                    onClick={saveCurrentScenario}
                    style={{
                      minHeight: 46,
                      padding: "0 18px",
                      borderRadius: 14,
                      cursor: "pointer",
                      color: "#fff",
                      background: "#ff733c",
                      border: "1px solid rgba(255,255,255,0.12)",
                      fontWeight: 950,
                    }}
                  >
                    {language === "it" ? "Salva scenario" : "Save scenario"}
                  </button>
                </div>
              </div>

              {saveMessage && (
                <div
                  style={{
                    marginTop: 12,
                    color: "#86efac",
                    fontSize: 12,
                    fontWeight: 900,
                  }}
                >
                  ✓ {saveMessage}
                </div>
              )}

              {savedScenarios.length === 0 ? (
                <div
                  style={{
                    marginTop: 20,
                    padding: 18,
                    borderRadius: 16,
                    color: "rgba(255,255,255,0.5)",
                    background: "rgba(255,255,255,0.025)",
                    border: "1px dashed rgba(255,255,255,0.1)",
                    fontSize: 13,
                    lineHeight: 1.6,
                    fontWeight: 750,
                  }}
                >
                  {language === "it"
                    ? "Salva almeno due scenari per confrontare rapidamente margine, profitto e recupero annuale."
                    : "Save at least two scenarios to quickly compare margin, profit and annual recovery."}
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                    gap: 14,
                    marginTop: 20,
                  }}
                >
                  {savedScenarios.map((saved) => (
                    <div
                      key={saved.id}
                      style={{
                        padding: 17,
                        borderRadius: 17,
                        background: "rgba(255,255,255,0.035)",
                        border: "1px solid rgba(255,115,60,0.15)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          alignItems: "flex-start",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              color: "#f8fafc",
                              fontWeight: 950,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {saved.name}
                          </div>
                          <div
                            style={{
                              marginTop: 5,
                              color: "rgba(255,255,255,0.44)",
                              fontSize: 11,
                              fontWeight: 750,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {saved.productTitle}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteSavedScenario(saved.id)}
                          aria-label={
                            language === "it"
                              ? "Elimina scenario"
                              : "Delete scenario"
                          }
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 10,
                            cursor: "pointer",
                            color: "rgba(255,255,255,0.52)",
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            fontWeight: 900,
                          }}
                        >
                          ×
                        </button>
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                          gap: 10,
                          marginTop: 15,
                        }}
                      >
                        {[
                          [
                            language === "it" ? "Margine" : "Margin",
                            pct(saved.marginPct),
                          ],
                          [
                            language === "it"
                              ? "Profitto/mese"
                              : "Monthly profit",
                            money(saved.monthlyProfit, 0),
                          ],
                          [
                            language === "it"
                              ? "Recupero/anno"
                              : "Annual recovery",
                            formatSignedMoney(saved.annualRecovery, 0),
                          ],
                          [
                            language === "it" ? "Prezzo" : "Price",
                            money(saved.simulatedPrice, 2),
                          ],
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            style={{
                              padding: 10,
                              borderRadius: 12,
                              background: "rgba(255,255,255,0.025)",
                            }}
                          >
                            <div
                              style={{
                                color: "rgba(255,255,255,0.42)",
                                fontSize: 10,
                                fontWeight: 850,
                                textTransform: "uppercase",
                              }}
                            >
                              {label}
                            </div>
                            <div
                              style={{
                                marginTop: 5,
                                color: "#f8fafc",
                                fontSize: 14,
                                fontWeight: 950,
                              }}
                            >
                              {value}
                            </div>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => loadSavedScenario(saved)}
                        style={{
                          width: "100%",
                          minHeight: 40,
                          marginTop: 13,
                          borderRadius: 12,
                          cursor: "pointer",
                          color: "#ff9a70",
                          background: "rgba(255,115,60,0.075)",
                          border: "1px solid rgba(255,115,60,0.18)",
                          fontWeight: 900,
                        }}
                      >
                        {language === "it"
                          ? "Carica questo scenario"
                          : "Load this scenario"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(0, 1.15fr) minmax(260px, 0.7fr) minmax(0, 1fr)",
                gap: 24,
                marginTop: 24,
              }}
            >
              <div style={cardStyle}>
                <div style={mutedLabelStyle}>
                  {language === "it"
                    ? "ORIGINE DEL RECUPERO"
                    : "RECOVERY BREAKDOWN"}
                </div>
                <div
                  style={{
                    marginTop: 9,
                    color: "#f8fafc",
                    fontSize: 20,
                    fontWeight: 950,
                  }}
                >
                  {language === "it"
                    ? "Da dove nasce l'impatto annuale"
                    : "Where the annual impact comes from"}
                </div>
                <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
                  {recoveryBreakdown.map((item) => (
                    <div
                      key={item.key}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 18,
                        paddingBottom: 12,
                        borderBottom: "1px solid rgba(255,255,255,0.07)",
                      }}
                    >
                      <span
                        style={{
                          color: "rgba(255,255,255,0.58)",
                          fontWeight: 800,
                        }}
                      >
                        {item.label}
                      </span>
                      <strong
                        style={{
                          color: item.value >= 0 ? "#4ade80" : "#f87171",
                        }}
                      >
                        {formatSignedMoney(item.value, 0)}
                      </strong>
                    </div>
                  ))}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 18,
                      paddingTop: 2,
                      color: "#f8fafc",
                      fontWeight: 950,
                    }}
                  >
                    <span>
                      {language === "it" ? "Totale netto" : "Net total"}
                    </span>
                    <span
                      style={{
                        color:
                          netRecoveredAnnualProfit >= 0 ? "#4ade80" : "#f87171",
                      }}
                    >
                      {formatSignedMoney(netRecoveredAnnualProfit, 0)}
                    </span>
                  </div>
                </div>
              </div>

              <div style={cardStyle}>
                <div
                  style={{
                    ...mutedLabelStyle,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>{language === "it" ? "RISCHIO" : "RISK"}</span>

                  <MetricTooltip
                    content={{
                      title:
                        language === "it"
                          ? "Rischio commerciale"
                          : "Commercial risk",
                      description:
                        language === "it"
                          ? "Stima del rischio commerciale dello scenario basata soprattutto sull'aumento di prezzo ipotizzato e sull'eventuale calo delle vendite. Un rischio più alto indica che lo scenario richiede maggiore cautela e verifica sul campo."
                          : "Estimate of the scenario's commercial risk, based mainly on the assumed price increase and any expected sales decline. A higher risk means the scenario requires more caution and real-world validation.",
                    }}
                  />
                </div>
                <div
                  style={{
                    marginTop: 14,
                    color: riskColor,
                    fontSize: 31,
                    fontWeight: 950,
                  }}
                >
                  {riskLabel}
                </div>
                <div
                  style={{
                    height: 9,
                    marginTop: 16,
                    borderRadius: 999,
                    overflow: "hidden",
                    background: "rgba(255,255,255,0.075)",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.max(6, commercialRiskScore)}%`,
                      height: "100%",
                      borderRadius: 999,
                      background: riskColor,
                    }}
                  />
                </div>
                <div
                  style={{
                    marginTop: 15,
                    color: "rgba(255,255,255,0.56)",
                    fontSize: 13,
                    lineHeight: 1.65,
                    fontWeight: 750,
                  }}
                >
                  {language === "it"
                    ? `Aumento prezzo ${formatSignedPct(priceChangePct)} e risposta vendite ${formatSignedPct(salesChangePct)}. Verifica il risultato reale per 30 giorni.`
                    : `Price change ${formatSignedPct(priceChangePct)} and sales response ${formatSignedPct(salesChangePct)}. Validate the real result for 30 days.`}
                </div>
              </div>

              <div style={cardStyle}>
                <div style={mutedLabelStyle}>
                  {language === "it" ? "TIMELINE" : "TIMELINE"}
                </div>
                <div
                  style={{
                    marginTop: 9,
                    color: "#f8fafc",
                    fontSize: 20,
                    fontWeight: 950,
                  }}
                >
                  {language === "it"
                    ? "Recupero cumulativo"
                    : "Cumulative recovery"}
                </div>
                <div style={{ display: "grid", gap: 11, marginTop: 20 }}>
                  {timeline.map((item) => (
                    <div
                      key={item.month}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 16,
                        alignItems: "center",
                        padding: "10px 12px",
                        borderRadius: 13,
                        background: "rgba(255,255,255,0.035)",
                        border: "1px solid rgba(255,255,255,0.065)",
                      }}
                    >
                      <span
                        style={{
                          color: "rgba(255,255,255,0.58)",
                          fontSize: 12,
                          fontWeight: 850,
                        }}
                      >
                        {item.month === 1
                          ? language === "it"
                            ? "1 mese"
                            : "1 month"
                          : `${item.month} ${language === "it" ? "mesi" : "months"}`}
                      </span>
                      <strong
                        style={{
                          color: item.value >= 0 ? "#4ade80" : "#f87171",
                        }}
                      >
                        {formatSignedMoney(item.value, 0)}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.15fr) minmax(300px, 0.85fr)",
                gap: 24,
                marginTop: 24,
              }}
            >
              <div style={cardStyle}>
                <div style={mutedLabelStyle}>
                  {language === "it" ? "Confronto" : "Comparison"}
                </div>
                <div
                  style={{
                    marginTop: 9,
                    color: "#f8fafc",
                    fontSize: 20,
                    fontWeight: 950,
                  }}
                >
                  {language === "it" ? "Attuale → Nuovo" : "Current → New"}
                </div>

                <div style={{ display: "grid", gap: 18, marginTop: 24 }}>
                  {[
                    {
                      label: language === "it" ? "Margine" : "Margin",
                      current: pct(currentMarginPct, 1),
                      next: pct(simulatedMarginPct, 1),
                      currentBar: clamp(currentMarginPct, 0, 60),
                      nextBar: clamp(simulatedMarginPct, 0, 60),
                      max: 60,
                    },
                    {
                      label:
                        language === "it" ? "Profitto mensile" : "Monthly profit",
                      current: money(currentMonthlyProfit, 0),
                      next: money(simulatedMonthlyProfit, 0),
                      currentBar: Math.max(0, currentMonthlyProfit),
                      nextBar: Math.max(0, simulatedMonthlyProfit),
                      max: Math.max(
                        1,
                        currentMonthlyProfit,
                        simulatedMonthlyProfit,
                      ),
                    },
                    {
                      label:
                        language === "it" ? "Ricavi mensili" : "Monthly revenue",
                      current: money(currentMonthlyRevenue, 0),
                      next: money(simulatedMonthlyRevenue, 0),
                      currentBar: Math.max(0, currentMonthlyRevenue),
                      nextBar: Math.max(0, simulatedMonthlyRevenue),
                      max: Math.max(
                        1,
                        currentMonthlyRevenue,
                        simulatedMonthlyRevenue,
                      ),
                    },
                  ].map((item) => (
                    <div key={item.label}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 16,
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{
                            color: "rgba(255,255,255,0.58)",
                            fontWeight: 850,
                          }}
                        >
                          {item.label}
                        </span>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 9,
                            color: "#f8fafc",
                            fontWeight: 900,
                          }}
                        >
                          <span style={{ color: "rgba(255,255,255,0.58)" }}>
                            {item.current}
                          </span>
                          <span
                            style={{
                              display: "inline-grid",
                              placeItems: "center",
                              width: 24,
                              height: 24,
                              borderRadius: 999,
                              color:
                                recoveredMonthlyProfit >= 0
                                  ? "#4ade80"
                                  : "#f87171",
                              background:
                                recoveredMonthlyProfit >= 0
                                  ? "rgba(34,197,94,0.11)"
                                  : "rgba(239,68,68,0.11)",
                              border:
                                recoveredMonthlyProfit >= 0
                                  ? "1px solid rgba(34,197,94,0.2)"
                                  : "1px solid rgba(239,68,68,0.2)",
                            }}
                          >
                            →
                          </span>
                          <span
                            style={{
                              color:
                                recoveredMonthlyProfit >= 0
                                  ? "#4ade80"
                                  : "#f87171",
                            }}
                          >
                            {item.next}
                          </span>
                        </span>
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gap: 7,
                          marginTop: 10,
                        }}
                      >
                        <div
                          style={{
                            height: 8,
                            borderRadius: 999,
                            background: "rgba(255,255,255,0.07)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${clamp((item.currentBar / item.max) * 100, 0, 100)}%`,
                              height: "100%",
                              borderRadius: 999,
                              background: "rgba(255,255,255,0.34)",
                            }}
                          />
                        </div>
                        <div
                          style={{
                            height: 8,
                            borderRadius: 999,
                            background: "rgba(255,255,255,0.07)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${clamp((item.nextBar / item.max) * 100, 0, 100)}%`,
                              height: "100%",
                              borderRadius: 999,
                              background:
                                recoveredMonthlyProfit >= 0
                                  ? "#22c55e"
                                  : "#ef4444",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{
                  ...cardStyle,
                  background:
                    "radial-gradient(circle at top left, rgba(34,197,94,0.13), transparent 38%), linear-gradient(180deg, rgba(17,24,39,0.98), rgba(7,12,21,0.99))",
                  border: "1px solid rgba(34,197,94,0.22)",
                }}
              >
                <div style={{ ...mutedLabelStyle, color: "#4ade80" }}>
                  {language === "it" ? "Impatto annuale" : "Annual impact"}
                </div>
                <div
                  key={`annual-${Math.round(netRecoveredAnnualProfit)}`}
                  className="recovery-annual-value"
                  style={{
                    marginTop: 15,
                    color:
                      netRecoveredAnnualProfit >= 0 ? "#22c55e" : "#f87171",
                    fontSize: 48,
                    lineHeight: 1,
                    letterSpacing: "-0.05em",
                    fontWeight: 950,
                  }}
                >
                  {formatSignedMoney(netRecoveredAnnualProfit, 0)}
                </div>
                <div
                  style={{
                    marginTop: 10,
                    color: "rgba(255,255,255,0.58)",
                    lineHeight: 1.6,
                    fontWeight: 750,
                  }}
                >
                  {language === "it"
                    ? `Profitto netto stimato dopo la riserva fiscale del ${pct(taxReserveRate * 100)}.`
                    : `Estimated net profit after the ${pct(taxReserveRate * 100)} tax reserve.`}
                </div>

                {netRecoveredAnnualProfit > 0 && (
                  <div
                    key={`unlock-${Math.round(netRecoveredAnnualProfit)}`}
                    className="recovery-unlocked-badge"
                  >
                    <span>↗</span>
                    <span>
                      {language === "it"
                        ? `${formatSignedMoney(netRecoveredAnnualProfit, 0)} di profitto annuale netto sbloccato`
                        : `${formatSignedMoney(netRecoveredAnnualProfit, 0)} net annual profit unlocked`}
                    </span>
                  </div>
                )}

                <div
                  style={{
                    marginTop: 24,
                    paddingTop: 20,
                    borderTop: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 16,
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          ...mutedLabelStyle,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span>
                          {language === "it"
                            ? "Salute del profitto"
                            : "Profit health"}
                        </span>

                        <MetricTooltip
                          content={{
                            title:
                              language === "it"
                                ? "Salute del profitto"
                                : "Profit health",
                            description:
                              language === "it"
                                ? "Valutazione sintetica del margine simulato. MarginLab classifica lo scenario come in perdita, critico, debole, solido o forte in base al livello di margine raggiunto."
                                : "Summary assessment of the simulated margin. MarginLab classifies the scenario as loss-making, critical, weak, healthy or strong based on the margin level achieved.",
                          }}
                        />
                      </div>
                      <div
                        style={{
                          marginTop: 7,
                          color: "#f8fafc",
                          fontSize: 18,
                          fontWeight: 950,
                        }}
                      >
                        {profitHealth}
                      </div>
                    </div>
                    <div
                      style={{
                        color: simulatedMarginPct >= 20 ? "#4ade80" : "#f59e0b",
                        fontSize: 25,
                        fontWeight: 950,
                      }}
                    >
                      {pct(simulatedMarginPct, 1)}
                    </div>
                  </div>
                  <div
                    style={{
                      height: 10,
                      marginTop: 13,
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.075)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${clamp((simulatedMarginPct / 50) * 100, 0, 100)}%`,
                        height: "100%",
                        borderRadius: 999,
                        background:
                          simulatedMarginPct >= 20 ? "#22c55e" : "#f59e0b",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                ...cardStyle,
                marginTop: 24,
                background:
                  "linear-gradient(135deg, rgba(255,115,60,0.12), rgba(8,13,22,0.98) 46%, rgba(17,24,39,0.98))",
                border: "1px solid rgba(255,115,60,0.25)",
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
                  <div style={{ ...mutedLabelStyle, color: "#ff9a70" }}>
                    {language === "it"
                      ? "RACCOMANDAZIONE ESECUTIVA"
                      : "EXECUTIVE RECOMMENDATION"}
                  </div>
                  <div
                    style={{
                      marginTop: 9,
                      color: "#f8fafc",
                      fontSize: 21,
                      fontWeight: 950,
                    }}
                  >
                    {language === "it"
                      ? "La decisione suggerita da MarginLab"
                      : "MarginLab's suggested decision"}
                  </div>
                </div>

                <div
                  style={{
                    padding: "9px 13px",
                    borderRadius: 999,
                    background: "rgba(34,197,94,0.1)",
                    border: "1px solid rgba(34,197,94,0.2)",
                    color: "#86efac",
                    fontSize: 12,
                    fontWeight: 900,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>
                    {language === "it" ? "Affidabilità" : "Confidence"}:{" "}
                    {confidenceLabel} · {dataConfidenceScore}% ·{" "}
                    {language === "it" ? "Rischio" : "Risk"} {riskLabel}
                  </span>

                  <MetricTooltip
                    content={{
                      title:
                        language === "it"
                          ? "Affidabilità dei dati"
                          : "Data confidence",
                      description:
                        language === "it"
                          ? "Misura la qualità dei dati utilizzati dalla simulazione, considerando disponibilità dei costi, volume di vendite e completezza dei dati del prodotto. Non rappresenta la probabilità che il profitto simulato venga effettivamente realizzato."
                          : "Measures the quality of the data used by the simulation, considering cost availability, sales volume and product data completeness. It does not represent the probability that the simulated profit will actually be achieved.",
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  marginTop: 20,
                  color: "rgba(255,255,255,0.78)",
                  fontSize: 15,
                  lineHeight: 1.75,
                  fontWeight: 750,
                }}
              >
                {recommendation}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
                  gap: 12,
                  marginTop: 22,
                }}
              >
                {suggestedActions.map((action) => (
                  <div
                    key={action.text}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                      padding: 14,
                      borderRadius: 15,
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,115,60,0.13)",
                      color: "rgba(255,255,255,0.72)",
                      lineHeight: 1.5,
                      fontSize: 13,
                      fontWeight: 800,
                    }}
                  >
                    <span style={{ color: "#4ade80", fontWeight: 950 }}>✓</span>
                    <span>{action.text}</span>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                marginTop: 24,
                padding: 18,
                borderRadius: 18,
                background: "rgba(255,115,60,0.075)",
                border: "1px solid rgba(255,115,60,0.18)",
                color: "rgba(255,255,255,0.66)",
                lineHeight: 1.65,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {growthAccess
                ? language === "it"
                  ? `Le stime partono dalla base economica tax-aware costruita sui dati Shopify degli ultimi ${periodDays} giorni e sono normalizzate su base mensile. La riserva fiscale gestionale resta un'ipotesi separata del Business Model Studio. Il simulatore non modifica automaticamente prezzi o costi.`
                  : `Estimates start from the tax-aware economic basis built from Shopify data over the last ${periodDays} days and are normalized to a monthly basis. The business-model tax reserve remains a separate Business Model Studio assumption. The simulator does not automatically change prices or costs.`
                : language === "it"
                  ? "Anteprima Growth. Passa a Growth per utilizzare il simulatore completo."
                  : "Growth preview. Upgrade to Growth to use the full simulator."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}