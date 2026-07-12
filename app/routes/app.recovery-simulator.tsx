import * as React from "react";
import { useLoaderData, useNavigate } from "react-router";

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

  return loadMarginDashboardData({
    admin,
    session,
    period,
  });
}

type ScenarioKey = "conservative" | "balanced" | "aggressive" | "custom";

type Scenario = {
  key: Exclude<ScenarioKey, "custom">;
  priceChangePct: number;
  costReductionPct: number;
  salesChangePct: number;
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

export default function RecoverySimulatorPage() {
  const navigate = useNavigate();
  const language = getStoredLanguage();
  const loaderData = useLoaderData() as LoaderData;
  const { rows } = loaderData;

  const periodValue = Number(loaderData.period ?? 30);
  const periodDays =
    Number.isFinite(periodValue) && periodValue > 0 ? periodValue : 30;
  const monthlyMultiplier = 30 / periodDays;

  const availableProducts = React.useMemo(
    () =>
      rows
        .filter((row) => row.avgPrice > 0 && row.qty > 0)
        .sort((a, b) => b.revenue - a.revenue),
    [rows],
  );

  const [selectedProductId, setSelectedProductId] = React.useState(
    availableProducts[0]?.productId ?? "",
  );
  const [searchQuery, setSearchQuery] = React.useState("");
  const [scenario, setScenario] = React.useState<ScenarioKey>("balanced");
  const [simulatedPrice, setSimulatedPrice] = React.useState(0);
  const [costReductionPct, setCostReductionPct] = React.useState(0);
  const [salesChangePct, setSalesChangePct] = React.useState(0);

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
        selectedProduct.avgPrice * (1 + config.priceChangePct / 100),
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
      selectedProduct.avgPrice * (1 + balanced.priceChangePct / 100),
    );
    setCostReductionPct(balanced.costReductionPct);
    setSalesChangePct(balanced.salesChangePct);
  }, [selectedProduct?.productId]);

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
  const currentUnitProfit = currentPrice - currentCost;
  const currentMarginPct =
    currentPrice > 0 ? (currentUnitProfit / currentPrice) * 100 : 0;
  const currentMonthlyRevenue = currentPrice * currentMonthlyQty;
  const currentMonthlyProfit = currentUnitProfit * currentMonthlyQty;

  const simulatedCost = Math.max(0, currentCost * (1 - costReductionPct / 100));
  const simulatedMonthlyQty = Math.max(
    0,
    currentMonthlyQty * (1 + salesChangePct / 100),
  );
  const simulatedUnitProfit = simulatedPrice - simulatedCost;
  const simulatedMarginPct =
    simulatedPrice > 0 ? (simulatedUnitProfit / simulatedPrice) * 100 : 0;
  const simulatedMonthlyRevenue = simulatedPrice * simulatedMonthlyQty;
  const simulatedMonthlyProfit = simulatedUnitProfit * simulatedMonthlyQty;
  const recoveredMonthlyProfit = simulatedMonthlyProfit - currentMonthlyProfit;
  const recoveredAnnualProfit = recoveredMonthlyProfit * 12;
  const marginDelta = simulatedMarginPct - currentMarginPct;
  const profitDeltaPct =
    Math.abs(currentMonthlyProfit) > 0
      ? (recoveredMonthlyProfit / Math.abs(currentMonthlyProfit)) * 100
      : recoveredMonthlyProfit > 0
        ? 100
        : 0;

  const breakEvenPrice = simulatedCost;
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

  const formatMoney = (value: number, digits = 0) =>
    `$${safeNumber(value).toLocaleString(
      language === "it" ? "it-IT" : "en-US",
      {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      },
    )}`;

  const formatSignedMoney = (value: number, digits = 0) => {
    const sign = value > 0 ? "+" : value < 0 ? "−" : "";
    return `${sign}${formatMoney(Math.abs(value), digits)}`;
  };

  const formatSignedPct = (value: number, digits = 1) => {
    const sign = value > 0 ? "+" : value < 0 ? "−" : "";
    return `${sign}${Math.abs(value).toFixed(digits)}%`;
  };

  const recommendation = (() => {
    const priceIncreasePct =
      currentPrice > 0
        ? ((simulatedPrice - currentPrice) / currentPrice) * 100
        : 0;

    if (simulatedMonthlyProfit <= currentMonthlyProfit) {
      return language === "it"
        ? `Questo scenario riduce il profitto mensile stimato. La variazione delle vendite non compensa il nuovo equilibrio tra prezzo e costo. Riduci l'ipotesi di calo delle vendite oppure aumenta il prezzo sopra ${formatMoney(
            Math.max(currentPrice, breakEvenPrice),
            2,
          )}.`
        : `This scenario lowers estimated monthly profit. The sales change does not compensate for the new price and cost balance. Reduce the assumed sales decline or move the price above ${formatMoney(
            Math.max(currentPrice, breakEvenPrice),
            2,
          )}.`;
    }

    if (costReductionPct >= 4 && priceIncreasePct < 4) {
      return language === "it"
        ? `La leva più efficace in questo scenario è il costo. Una riduzione del ${costReductionPct.toFixed(
            1,
          )}% porta il margine dal ${currentMarginPct.toFixed(
            1,
          )}% al ${simulatedMarginPct.toFixed(
            1,
          )}% con un aumento di prezzo limitato. Prima di intervenire sul listino, valuta una negoziazione con il fornitore.`
        : `Cost reduction is the strongest lever in this scenario. A ${costReductionPct.toFixed(
            1,
          )}% reduction moves margin from ${currentMarginPct.toFixed(
            1,
          )}% to ${simulatedMarginPct.toFixed(
            1,
          )}% with only a limited price increase. Consider supplier negotiation before changing the retail price.`;
    }

    if (priceIncreasePct >= 8) {
      return language === "it"
        ? `Portare il prezzo a ${formatMoney(
            simulatedPrice,
            2,
          )} genera un impatto importante, ma l'aumento del ${priceIncreasePct.toFixed(
            1,
          )}% è significativo. Testa la modifica su un periodo breve o su una parte del traffico per verificare la risposta della domanda.`
        : `Moving the price to ${formatMoney(
            simulatedPrice,
            2,
          )} creates a meaningful impact, but the ${priceIncreasePct.toFixed(
            1,
          )}% increase is material. Test it over a short period or on part of your traffic to validate demand response.`;
    }

    return language === "it"
      ? `Portare il prezzo a ${formatMoney(
          simulatedPrice,
          2,
        )} e ridurre il costo del ${costReductionPct.toFixed(
          1,
        )}% aumenta il margine dal ${currentMarginPct.toFixed(
          1,
        )}% al ${simulatedMarginPct.toFixed(
          1,
        )}%. Con i volumi ipotizzati, il recupero stimato è ${formatSignedMoney(
          recoveredAnnualProfit,
          0,
        )} all'anno. Questo è un equilibrio credibile tra redditività e rischio commerciale.`
      : `Moving the price to ${formatMoney(
          simulatedPrice,
          2,
        )} and reducing cost by ${costReductionPct.toFixed(
          1,
        )}% increases margin from ${currentMarginPct.toFixed(
          1,
        )}% to ${simulatedMarginPct.toFixed(
          1,
        )}%. At the assumed volume, estimated recovery is ${formatSignedMoney(
          recoveredAnnualProfit,
          0,
        )} per year. This is a credible balance between profitability and commercial risk.`;
  })();

  const suggestedActions = [
    {
      visible: simulatedPrice > currentPrice,
      text:
        language === "it"
          ? `Valuta un prezzo di ${formatMoney(simulatedPrice, 2)}`
          : `Evaluate a ${formatMoney(simulatedPrice, 2)} selling price`,
    },
    {
      visible: costReductionPct > 0,
      text:
        language === "it"
          ? `Negozia una riduzione costo del ${costReductionPct.toFixed(1)}%`
          : `Negotiate a ${costReductionPct.toFixed(1)}% cost reduction`,
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
    setSimulatedPrice(value);
  };

  const handleManualCostChange = (value: number) => {
    setScenario("custom");
    setCostReductionPct(value);
  };

  const handleManualSalesChange = (value: number) => {
    setScenario("custom");
    setSalesChangePct(value);
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
              {language === "it"
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
          </div>

          <button
            className="primary-button recovery-growth-button"
            onClick={() => navigate("/app/billing")}
          >
            {language === "it" ? "Sblocca Growth →" : "Unlock Growth →"}
          </button>
        </div>

        <div className="panel">
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
                      {formatMoney(product.avgPrice, 2)} · {product.qty}{" "}
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
                {language === "it" ? "Situazione attuale" : "Current situation"}
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
                    formatMoney(currentPrice, 2),
                  ],
                  [
                    language === "it" ? "Costo" : "Cost",
                    formatMoney(currentCost, 2),
                  ],
                  [
                    language === "it" ? "Vendite mensili" : "Monthly sales",
                    currentMonthlyQty.toFixed(0),
                  ],
                  [
                    language === "it" ? "Margine" : "Margin",
                    `${currentMarginPct.toFixed(1)}%`,
                  ],
                  [
                    language === "it" ? "Profitto mensile" : "Monthly profit",
                    formatMoney(currentMonthlyProfit, 0),
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
                    <span
                      style={{
                        color: "rgba(255,255,255,0.54)",
                        fontSize: 13,
                        fontWeight: 800,
                      }}
                    >
                      {label}
                    </span>
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
                  {formatMoney(currentCost, 2)}
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
                    ? "Sotto questo valore il prodotto non copre il costo unitario."
                    : "Below this value, the product does not cover its unit cost."}
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
                          ? `Attuale ${formatMoney(currentPrice, 2)}`
                          : `Current ${formatMoney(currentPrice, 2)}`}
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
                      {formatMoney(simulatedPrice, 2)}
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
                    <span>{formatMoney(priceMin, 2)}</span>
                    <span>{formatMoney(priceMax, 2)}</span>
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
                          ? `Nuovo costo ${formatMoney(simulatedCost, 2)}`
                          : `New cost ${formatMoney(simulatedCost, 2)}`}
                      </div>
                    </div>
                    <div
                      style={{
                        color: "#4ade80",
                        fontSize: 24,
                        fontWeight: 950,
                      }}
                    >
                      {costReductionPct.toFixed(1)}%
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
                          ? `${simulatedMonthlyQty.toFixed(0)} unità mensili stimate`
                          : `${simulatedMonthlyQty.toFixed(0)} estimated monthly units`}
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
                  value: `${simulatedMarginPct.toFixed(1)}%`,
                  note: formatSignedPct(marginDelta, 1),
                  positive: marginDelta >= 0,
                },
                {
                  label:
                    language === "it"
                      ? "Nuovo profitto mensile"
                      : "New monthly profit",
                  value: formatMoney(simulatedMonthlyProfit, 0),
                  note: formatSignedPct(profitDeltaPct, 1),
                  positive: recoveredMonthlyProfit >= 0,
                },
                {
                  label:
                    language === "it" ? "Recupero mensile" : "Monthly recovery",
                  value: formatSignedMoney(recoveredMonthlyProfit, 0),
                  note:
                    language === "it" ? "Impatto stimato" : "Estimated impact",
                  positive: recoveredMonthlyProfit >= 0,
                },
                {
                  label:
                    language === "it" ? "Recupero annuale" : "Annual recovery",
                  value: formatSignedMoney(recoveredAnnualProfit, 0),
                  note:
                    language === "it"
                      ? "Proiezione 12 mesi"
                      : "12-month projection",
                  positive: recoveredAnnualProfit >= 0,
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
                  <div style={mutedLabelStyle}>{item.label}</div>
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
                    current: `${currentMarginPct.toFixed(1)}%`,
                    next: `${simulatedMarginPct.toFixed(1)}%`,
                    currentBar: clamp(currentMarginPct, 0, 60),
                    nextBar: clamp(simulatedMarginPct, 0, 60),
                    max: 60,
                  },
                  {
                    label:
                      language === "it" ? "Profitto mensile" : "Monthly profit",
                    current: formatMoney(currentMonthlyProfit, 0),
                    next: formatMoney(simulatedMonthlyProfit, 0),
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
                    current: formatMoney(currentMonthlyRevenue, 0),
                    next: formatMoney(simulatedMonthlyRevenue, 0),
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
                key={`annual-${recoveredAnnualProfit.toFixed(0)}`}
                className="recovery-annual-value"
                style={{
                  marginTop: 15,
                  color: recoveredAnnualProfit >= 0 ? "#22c55e" : "#f87171",
                  fontSize: 48,
                  lineHeight: 1,
                  letterSpacing: "-0.05em",
                  fontWeight: 950,
                }}
              >
                {formatSignedMoney(recoveredAnnualProfit, 0)}
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
                  ? "Profitto stimato recuperato ogni anno mantenendo questo scenario."
                  : "Estimated profit recovered every year if this scenario is maintained."}
              </div>

              {recoveredAnnualProfit > 0 && (
                <div
                  key={`unlock-${recoveredAnnualProfit.toFixed(0)}`}
                  className="recovery-unlocked-badge"
                >
                  <span>↗</span>
                  <span>
                    {language === "it"
                      ? `${formatSignedMoney(recoveredAnnualProfit, 0)} di profitto annuale sbloccato`
                      : `${formatSignedMoney(recoveredAnnualProfit, 0)} annual profit unlocked`}
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
                    <div style={mutedLabelStyle}>
                      {language === "it"
                        ? "Salute del profitto"
                        : "Profit health"}
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
                    {simulatedMarginPct.toFixed(1)}%
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
                    ? "Raccomandazione AI"
                    : "AI recommendation"}
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
                }}
              >
                {language === "it" ? "Affidabilità" : "Confidence"}:{" "}
                {confidenceLabel} · {dataConfidenceScore}%
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
            {language === "it"
              ? `Anteprima Growth. Le stime sono calcolate sui dati Shopify degli ultimi ${periodDays} giorni e normalizzate su base mensile. Il simulatore non modifica automaticamente prezzi o costi.`
              : `Growth preview. Estimates use Shopify data from the last ${periodDays} days and are normalized to a monthly basis. The simulator does not automatically change prices or costs.`}
          </div>
        </div>
      </div>
    </div>
  );
}