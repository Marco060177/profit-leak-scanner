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

export default function RecoverySimulatorPage() {
  const navigate = useNavigate();
  const language = getStoredLanguage();
  const { rows } = useLoaderData() as LoaderData;

  const [targetMargin, setTargetMargin] = React.useState(20);

  const simulatorRows = rows
    .map((row) => {
      const targetPrice =
        row.avgCost > 0
          ? row.avgCost / (1 - targetMargin / 100)
          : row.avgPrice;

      const priceDelta = Math.max(0, targetPrice - row.avgPrice);
      const increasePct =
        row.avgPrice > 0 ? (priceDelta / row.avgPrice) * 100 : 0;
      const potentialProfit = priceDelta * row.qty;

      return {
        ...row,
        simulatorTargetPrice: targetPrice,
        simulatorPriceDelta: priceDelta,
        simulatorIncreasePct: increasePct,
        simulatorPotentialProfit: potentialProfit,
      };
    })
    .filter((row) => row.simulatorPotentialProfit > 0)
    .sort(
      (a, b) =>
        b.simulatorPotentialProfit - a.simulatorPotentialProfit,
    )
    .slice(0, 8);

  const totalPotentialProfit = simulatorRows.reduce(
    (sum, row) => sum + row.simulatorPotentialProfit,
    0,
  );

  const averageIncrease =
    simulatorRows.length > 0
      ? simulatorRows.reduce(
        (sum, row) => sum + row.simulatorIncreasePct,
        0,
      ) / simulatorRows.length
      : 0;

  const highestOpportunity = simulatorRows[0];

  const impactedProducts = simulatorRows.length;

  const topRecoveryProducts =
    simulatorRows.slice(0, 3);

  const recoverySummary =
    totalPotentialProfit > 0
      ? language === "it"
        ? `MarginLab ha individuato circa $${totalPotentialProfit.toFixed(
            0,
          )} di profitto recuperabile su ${impactedProducts} prodotti.`
        : `MarginLab identified approximately $${totalPotentialProfit.toFixed(
            0,
          )} in recoverable profit opportunities across ${impactedProducts} products.`
      : language === "it"
        ? "Non sono state rilevate opportunità di recupero significative per il margine obiettivo selezionato."
        : "No significant recovery opportunities were detected for the selected target margin.";


  const averagePriceIncrease =
    simulatorRows.length > 0
      ? simulatorRows.reduce(
          (sum, row) => sum + row.simulatorPriceDelta,
          0,
        ) / simulatorRows.length
      : 0;

  const recoveryKpis = [
    {
      key: "totalRecoverableProfit",
      label:
        language === "it"
          ? "Profitto totale recuperabile"
          : "Total Recoverable Profit",
      value: `$${totalPotentialProfit.toFixed(0)}`,
      note:
        language === "it"
          ? "Opportunità stimata"
          : "Estimated opportunity",
    },
    {
      key: "productsImpacted",
      label:
        language === "it" ? "Prodotti interessati" : "Products Impacted",
      value: impactedProducts.toString(),
      note:
        language === "it"
          ? "Differenze di prezzo rilevate"
          : "Pricing gaps detected",
    },
    {
      key: "averagePriceIncrease",
      label:
        language === "it"
          ? "Aumento medio del prezzo"
          : "Average Price Increase",
      value: `$${averagePriceIncrease.toFixed(2)}`,
      note: language === "it" ? "Per prodotto" : "Per product",
    },
    {
      key: "highestRecoveryProduct",
      label:
        language === "it"
          ? "Migliore opportunità di recupero"
          : "Highest Recovery Product",
      value:
        highestOpportunity?.productTitle ??
        (language === "it" ? "Nessuna" : "None"),
      note: highestOpportunity
        ? `+$${highestOpportunity.simulatorPotentialProfit.toFixed(0)}`
        : language === "it"
          ? "Nessuna opportunità"
          : "No opportunity",
    },
  ];

  const recoveryScenarios = [
    {
      label: language === "it" ? "Prudente" : "Conservative",
      margin: 20,
      description:
        language === "it"
          ? "Piccoli adeguamenti di prezzo"
          : "Low pricing adjustments",
    },
    {
      label: language === "it" ? "Bilanciato" : "Balanced",
      margin: 25,
      description:
        language === "it"
          ? "Scenario consigliato"
          : "Recommended scenario",
    },
    {
      label: language === "it" ? "Massimo" : "Aggressive",
      margin: 30,
      description:
        language === "it"
          ? "Massimo recupero possibile"
          : "Maximum recovery focus",
    },
  ];
    return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        <DashboardNav
          active="recovery-simulator"
          navigate={navigate}
        />

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
                ? "Simula quanto profitto puoi recuperare modificando i prezzi"
                : "Simulate how pricing changes could recover profit"}
            </div>

            <div className="hero-description">
              {language === "it"
                ? "Prova diversi margini obiettivo e stima quanto profitto aggiuntivo potresti recuperare correggendo i prezzi."
                : "Test target margin scenarios and estimate how much additional profit MarginLab could help recover from pricing gaps."}
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
              gridTemplateColumns: "repeat(4,1fr)",
              gap: 20,
              marginBottom: 24,
            }}
          >
            {recoveryKpis.map((item) => (
              <div
                key={item.key}
                style={{
                  borderRadius: 24,
                  padding: 24,
                  background:
                    item.key === "totalRecoverableProfit"
                      ? "radial-gradient(circle at top left, rgba(34,197,94,0.16), transparent 35%), linear-gradient(180deg, rgba(17,24,39,0.96), rgba(8,13,22,0.98))"
                      : "linear-gradient(180deg, rgba(17,24,39,0.96), rgba(8,13,22,0.98))",
                  border:
                    item.key === "totalRecoverableProfit"
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
                      item.key === "totalRecoverableProfit"
                        ? "#4ade80"
                        : "rgba(255,255,255,0.55)",
                    fontWeight: 900,
                  }}
                >
                  {item.label}
                </div>

                <div
                  style={{
                    marginTop: 14,
                    fontSize: 28,
                    fontWeight: 950,
                    color:
                      item.key === "totalRecoverableProfit"
                        ? "#22c55e"
                        : "#f8fafc",
                    lineHeight: 1.1,
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
          <div className="section-header">
            <div>
              <div className="section-title">

                {language === "it"
                  ? "Scenario di recupero del profitto"
                  : "Profit Recovery Scenario"}
              </div>

              <div className="section-subtitle">
                {language === "it"
                  ? "Scegli un margine obiettivo e visualizza il profitto recuperabile stimato in base a costi, prezzi e quantità vendute."
                  : "Choose a target margin and see estimated recoverable profit based on current product costs, prices and quantities sold."}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "0.75fr 1.25fr",
              gap: 24,
              marginTop: 24,
            }}
          >
            <div
              style={{
                borderRadius: 26,
                padding: 28,
                background:
                  "radial-gradient(circle at top left, rgba(34,197,94,0.12), transparent 36%), linear-gradient(135deg, rgba(17,24,39,0.98), rgba(6,12,24,0.98))",
                border: "1px solid rgba(34,197,94,0.24)",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "#4ade80",
                }}
              >
                {language === "it" ? "Recupero stimato" : "Estimated Recovery"}
              </div>

              <div
                style={{
                  marginTop: 16,
                  color: "#22c55e",
                  fontSize: 54,
                  fontWeight: 950,
                  lineHeight: 1,
                  letterSpacing: "-0.05em",
                }}
              >
                ${totalPotentialProfit.toFixed(0)}
              </div>

              <div
                style={{
                  marginTop: 12,
                  color: "rgba(255,255,255,0.68)",
                  fontWeight: 750,
                  lineHeight: 1.6,
                }}
              >
                {language === "it" ? (
                  <>
                    Profitto aggiuntivo stimato se i prodotti selezionati
                    raggiungono un margine obiettivo del{" "}
                    <strong>{targetMargin}%</strong>.
                  </>
                ) : (
                  <>
                    Estimated additional profit if selected products move
                    toward a <strong>{targetMargin}%</strong> target margin.
                  </>
                )}
              </div>

              <div
                style={{
                  marginTop: 24,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ color: "rgba(255,255,255,0.62)", fontWeight: 800 }}>
                  {language === "it" ? "Prodotti interessati" : "Products impacted"}:{" "}
                  <strong style={{ color: "#f8fafc" }}>
                    {simulatorRows.length}
                  </strong>
                </div>

                <div style={{ color: "rgba(255,255,255,0.62)", fontWeight: 800 }}>
                  {language === "it"
                    ? "Aumento medio necessario"
                    : "Average increase required"}:{" "}
                  <strong style={{ color: "#f8fafc" }}>
                    +{averageIncrease.toFixed(1)}%
                  </strong>
                </div>

                <div style={{ color: "rgba(255,255,255,0.62)", fontWeight: 800 }}>
                  {language === "it"
                    ? "Migliore opportunità"
                    : "Highest opportunity"}:{" "}
                  <strong style={{ color: "#22c55e" }}>
                    {highestOpportunity
                      ? `${highestOpportunity.productTitle} (+$${highestOpportunity.simulatorPotentialProfit.toFixed(0)})`
                      : language === "it"
                        ? "Nessuna opportunità rilevata"
                        : "No opportunity detected"}
                  </strong>
                </div>
              </div>

              <div
                style={{
                  marginTop: 26,
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.52)",
                }}
              >
                {language === "it" ? "Scenario di recupero" : "Recovery Scenario"}
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 10,
                  marginTop: 14,
                }}
              >
                {recoveryScenarios.map((scenario) => (
                  <button
                    key={scenario.margin}
                    onClick={() => setTargetMargin(scenario.margin)}
                    style={{
                      padding: 14,
                      borderRadius: 16,
                      textAlign: "left",
                      border:
                        targetMargin === scenario.margin
                          ? "1px solid rgba(34,197,94,0.45)"
                          : "1px solid rgba(255,115,60,0.14)",
                      background:
                        targetMargin === scenario.margin
                          ? "rgba(34,197,94,0.12)"
                          : "rgba(255,115,60,0.08)",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        color: "#f8fafc",
                        fontWeight: 900,
                        fontSize: 14,
                      }}
                    >
                      {scenario.label}
                    </div>

                    <div
                      style={{
                        marginTop: 4,
                        color: "rgba(255,255,255,0.55)",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {scenario.description}
                    </div>

                    <div
                      style={{
                        marginTop: 6,
                        color: "#22c55e",
                        fontSize: 12,
                        fontWeight: 900,
                      }}
                    >
                      {language === "it" ? "Margine obiettivo" : "Target margin"}{" "}
                      {scenario.margin}%
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{
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
                  color: "rgba(255,255,255,0.55)",
                }}
              >
                {language === "it" ? "Prodotti interessati" : "Products Impacted"}
              </div>

              <div
                style={{
                  marginTop: 18,
                  display: "grid",
                  gap: 12,
                }}
              >
                {simulatorRows.length > 0 ? (
                  simulatorRows.map((row) => (
                    <div
                      key={row.productId || row.productTitle}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        gap: 18,
                        alignItems: "center",
                        padding: 16,
                        borderRadius: 16,
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,115,60,0.12)",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            color: "#f8fafc",
                            fontWeight: 900,
                          }}
                        >
                          {row.productTitle}
                        </div>

                        <div
                          style={{
                            marginTop: 6,
                            color: "rgba(255,255,255,0.52)",
                            fontSize: 13,
                            fontWeight: 750,
                          }}
                        >
                          {language === "it" ? "Margine attuale" : "Current margin"}{" "}
                          {row.marginPct.toFixed(1)}% ·{" "}
                          {language === "it" ? "Prezzo obiettivo" : "Target price"}{" "}
                          ${row.simulatorTargetPrice.toFixed(2)}
                        </div>

                        <div
                          style={{
                            marginTop: 5,
                            color: "#f59e0b",
                            fontSize: 12,
                            fontWeight: 900,
                          }}
                        >
                          {language === "it"
                            ? "Aumento necessario"
                            : "Increase needed"}{" "}
                          +{row.simulatorIncreasePct.toFixed(1)}%{" "}
                          (${row.simulatorPriceDelta.toFixed(2)})
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div
                          style={{
                            color: "#22c55e",
                            fontSize: 22,
                            fontWeight: 950,
                          }}
                        >
                          +${row.simulatorPotentialProfit.toFixed(0)}
                        </div>

                        <div
                          style={{
                            marginTop: 4,
                            color: "rgba(255,255,255,0.45)",
                            fontSize: 12,
                            fontWeight: 800,
                          }}
                        >
                          {language === "it" ? "profitto stimato" : "estimated profit"}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div
                    style={{
                      padding: 22,
                      borderRadius: 18,
                      background: "rgba(34,197,94,0.08)",
                      border: "1px solid rgba(34,197,94,0.18)",
                      color: "#86efac",
                      fontWeight: 800,
                    }}
                  >
                    {language === "it"
                      ? "Nessuna opportunità di recupero rilevata per questo margine obiettivo."
                      : "No pricing recovery opportunities detected for this target margin."}
                  </div>
                )}
              </div>
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
                ? "Riepilogo AI del recupero"
                : "AI Recovery Summary"}
            </div>

            <div
              style={{
                marginTop: 14,
                color: "rgba(255,255,255,0.78)",
                lineHeight: 1.7,
                fontWeight: 750,
              }}
            >
              {recoverySummary}
            </div>

            {topRecoveryProducts.length > 0 && (
              <div
                style={{
                  marginTop: 18,
                  display: "grid",
                  gap: 10,
                }}
              >
                {topRecoveryProducts.map((product) => (
                  <div
                    key={product.productId}
                    style={{
                      padding: 14,
                      borderRadius: 14,
                      background: "rgba(255,255,255,0.04)",
                      border:
                        "1px solid rgba(255,115,60,0.12)",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 900,
                        color: "#f8fafc",
                      }}
                    >
                      {product.productTitle}
                    </div>

                    <div
                      style={{
                        marginTop: 4,
                        color: "#22c55e",
                        fontWeight: 800,
                      }}
                    >
                      {language === "it"
                        ? "Recupero potenziale"
                        : "Potential Recovery"}{" "}
                      ${product.simulatorPotentialProfit.toFixed(0)}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
              ? "Anteprima Growth. Le stime si basano sugli ordini Shopify, sui costi dei prodotti e sul margine obiettivo selezionato. Il simulatore non modifica automaticamente i prezzi."
              : "Growth preview. Estimates are based on Shopify order data, product costs and selected target margin. This simulator does not change prices automatically."}
          </div>
        </div>
      </div>
    </div>
  );
}