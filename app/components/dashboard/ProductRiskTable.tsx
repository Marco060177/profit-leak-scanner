import * as React from "react";
import { money, pct, type Row } from "~/utils/margin";
import { getStoredLanguage } from "~/utils/i18n";

type Props = {
  sortedRiskRows: Row[];
  onlyLosing: boolean;
  setOnlyLosing: React.Dispatch<React.SetStateAction<boolean>>;
  period: string;
  riskLabel: (row: Row) => string;
  riskColor: (row: Row) => string;
  riskBackground: (row: Row) => string;
  shopHandle: string;
};

function getProductRiskScore(row: Row) {
  let score = 0;

  if (row.losing) score += 45;
  if (row.missingCost) score += 25;
  if (row.lowMargin) score += 20;
  if (row.marginPct < 5) score += 10;
  if (row.targetDelta > 0) score += Math.min(10, row.targetDelta / 10);

  return Math.min(100, Math.round(score));
}

function getScoreStyle(score: number, row: Row) {
  if (row.missingCost) {
    return {
      label: "Data issue",
      color: "#f59e0b",
      background: "rgba(245,158,11,0.14)",
    };
  }

  if (score >= 70) {
    return {
      label: "Critical",
      color: "#ff6b4a",
      background: "rgba(255,107,74,0.14)",
    };
  }

  if (score >= 40) {
    return {
      label: "High",
      color: "#f59e0b",
      background: "rgba(245,158,11,0.14)",
    };
  }

  return {
    label: "Healthy",
    color: "#22c55e",
    background: "rgba(34,197,94,0.14)",
  };
}

export default function ProductRiskTable({
  sortedRiskRows,
  onlyLosing,
  setOnlyLosing,
  period,
  riskLabel,
  riskColor,
  riskBackground,
  shopHandle,
}: Props) {

  const language = getStoredLanguage();

  function translatedSuggestion(row: Row) {
    if (language !== "it") {
      return row.suggestion;
    }

    if (row.missingCost) {
      return "Manca il costo di questo prodotto. Inserisci il costo in Shopify per ottenere un monitoraggio accurato dei margini e un'analisi del rischio affidabile.";
    }

    if (row.profit < 0) {
      return row.targetDelta > 0
        ? `Aumenta il prezzo a ${money(row.targetPrice)} per raggiungere un margine più sano.`
        : "I margini attuali sono criticamente sotto il valore target. Controlla costi prodotto, struttura dei prezzi e sconti.";
    }

    if (row.targetDelta > 0) {
      return `Valuta di aumentare il prezzo a ${money(row.targetPrice)} per migliorare il margine del prodotto.`;
    }

    return "Prezzi e margini risultano stabili sulla base dei dati disponibili.";
  }

  return (
    <div className="panel" id="products-section">
      <div className="section-header">
        <div>
          <div className="panel-eyebrow">
            {language === "it"
              ? "CLASSIFICA RISCHIO PRODOTTI"
              : "PRODUCT RISK RANKING"}
          </div>

          <div className="section-title" style={{ marginTop: 8 }}>
            {language === "it"
              ? "Revisione prioritaria prodotti"
              : "Prioritized product review"}
          </div>

          <div className="section-subtitle">
            {language === "it"
              ? "Prodotti ordinati per rischio di margine, costi mancanti e potenziali perdite di profitto."
              : "Products ranked by margin risk, missing cost data and potential profit leakage."}
          </div>

          <div className="table-filters">
            <button
              type="button"
              className={onlyLosing ? "table-filter-btn" : "table-filter-btn active"}
              onClick={() => setOnlyLosing(false)}
            >
              {language === "it" ? "Tutti i prodotti" : "All products"}
            </button>

            <button
              type="button"
              className={onlyLosing ? "table-filter-btn active" : "table-filter-btn"}
              onClick={() => setOnlyLosing(true)}
            >
              {language === "it" ? "Solo in perdita" : "Losing only"}
            </button>
          </div>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            const headers = [
              "Product",
              "Revenue",
              "COGS",
              "Profit",
              "Margin %",
              "Target Price",
              "Price Delta",
              "Risk Score",
              "Risk",
            ];

            const csvRows = sortedRiskRows.map((row) => [
              row.productTitle,
              row.revenue.toFixed(2),
              row.cogs.toFixed(2),
              row.profit.toFixed(2),
              row.marginPct.toFixed(1),
              row.targetPrice.toFixed(2),
              row.targetDelta.toFixed(2),
              getProductRiskScore(row),
              riskLabel(row),
            ]);

            const csvContent = [
              headers.join(","),
              ...csvRows.map((row) =>
                row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
              ),
            ].join("\n");

            const blob = new Blob([csvContent], {
              type: "text/csv;charset=utf-8;",
            });

            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = url;
            link.download = `marginlab-products-${period}d.csv`;
            link.click();

            URL.revokeObjectURL(url);
          }}
        >
          {language === "it" ? "Esporta CSV" : "Export CSV"}
        </button>
      </div>

      <div className="desktop-table-wrapper">
        <table className="product-table">
          <thead>
            <tr>
              {[
                language === "it" ? "Prodotto" : "Product",
                "Revenue",
                "COGS",
                language === "it" ? "Profitto" : "Profit",
                language === "it" ? "Prezzo target" : "Target Price",
                "Delta",
                language === "it" ? "Margine" : "Margin",
                language === "it" ? "Punteggio" : "Risk Score",
                language === "it" ? "Rischio" : "Risk",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    color: "rgba(255,255,255,0.55)",
                    fontSize: 11,
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    fontWeight: 900,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {sortedRiskRows.map((row) => {
              const score = getProductRiskScore(row);
              const scoreStyle = getScoreStyle(score, row);

              return (
                <React.Fragment key={row.productTitle}>
                  <tr
                    style={{
                      background:
                        score >= 84
                          ? "linear-gradient(90deg, rgba(255,107,74,0.08), transparent 42%)"
                          : undefined,
                    }}
                  >
                    <td>
                      <div className="product-name-cell">
                        <div
                          className="product-icon"
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: 12,
                            background: "rgba(255,115,60,0.10)",
                            border: "1px solid rgba(255,115,60,0.18)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#ff733c",
                            fontWeight: 900,
                          }}
                        >
                          P
                        </div>

                        <div>
                          <div className="product-name">{row.productTitle}</div>

                          <div className="product-subtitle">
                            {language === "it" ? "Prezzo medio" : "Avg price"} {money(row.avgPrice)}
                            {" • "}
                            {language === "it" ? "Costo medio" : "Avg cost"} {money(row.avgCost)}

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
                                  {language === "it" ? "Imposta costo" : "Set cost"}
                                </a>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>{money(row.revenue)}</td>

                    <td>{money(row.cogs)}</td>

                    <td>
                      <div
                        style={{
                          color: row.profit < 0 ? "#ff6b4a" : "#22c55e",
                          fontWeight: 950,
                          fontSize: 26,
                          letterSpacing: "-0.03em",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {money(row.profit)}
                      </div>
                    </td>

                    <td>{money(row.targetPrice)}</td>

                    <td
                      style={{
                        color: row.targetDelta > 0 ? "#ff6b4a" : "#22c55e",
                        fontWeight: 900,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.targetDelta > 0 ? "↑ " : "↓ "}
                      {money(row.targetDelta)}
                    </td>

                    <td>
                      <div
                        style={{
                          color: row.missingCost
                            ? "#f59e0b"
                            : row.marginPct < 0
                              ? "#ff6b4a"
                              : row.marginPct < 10
                                ? "#f59e0b"
                                : "#22c55e",
                          fontWeight: 900,
                          fontSize: 15,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.missingCost
                          ? language === "it"
                            ? "Mancante"
                            : "Missing"
                          : pct(row.marginPct)}
                      </div>
                    </td>

                    <td>
                      <div style={{ minWidth: 140 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 20,
                              fontWeight: 950,
                              color: "#f3f4f6",
                            }}
                          >
                            {score}
                          </span>


                        </div>

                        <div
                          style={{
                            height: 7,
                            borderRadius: 999,
                            background: "rgba(255,255,255,0.08)",
                            overflow: "hidden",
                            marginTop: 9,
                          }}
                        >
                          <div
                            style={{
                              width: `${score}%`,
                              height: "100%",
                              borderRadius: 999,
                              background: scoreStyle.color,
                            }}
                          />
                        </div>
                      </div>
                    </td>

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
                  </tr>

                  {(row.losing || row.missingCost || row.marginPct < 10) && (
                    <tr>
                      <td colSpan={9}>
                        <div
                          className="desktop-suggestion"
                          style={{
                            background:
                              "linear-gradient(180deg, rgba(255,90,54,0.07), rgba(255,255,255,0.025))",
                            border: "1px solid rgba(255,90,54,0.12)",
                            borderRadius: 20,
                            padding: "14px 18px",
                          }}
                        >
                          <div className="suggestion-title">
                            {language === "it"
                              ? "AZIONE CONSIGLIATA DALL'AI"
                              : "AI Recommended Action"}
                          </div>

                          <div
                            className="suggestion-copy"
                            style={{
                              lineHeight: 1.65,
                              color: "#d6d9e0",
                              fontSize: 15,
                              maxWidth: 900,
                            }}
                          >
                            {row.missingCost
                              ? language === "it"
                                ? "Manca il costo di questo prodotto. Inserisci il costo in Shopify per ottenere un monitoraggio accurato dei margini e un'analisi del rischio affidabile."
                                : "Cost data is missing for this product. Add product cost in Shopify to unlock accurate margin tracking and risk analysis."
                              : language === "it"
                                ? row.profit < 0
                                  ? row.targetDelta > 0
                                    ? `Aumenta il prezzo a ${money(row.targetPrice)} per raggiungere un margine più sano.`
                                    : "I margini attuali sono criticamente sotto il valore target. Controlla costi prodotto, struttura dei prezzi e sconti."
                                  : row.targetDelta > 0
                                    ? `Valuta di aumentare il prezzo a ${money(row.targetPrice)} per migliorare il margine del prodotto.`
                                    : "Prezzi e margini risultano stabili sulla base dei dati disponibili."
                                : translatedSuggestion(row)}
                          </div>

                          {row.productId ? (
                            <div style={{ marginTop: 10 }}>
                              <a
                                href={`https://admin.shopify.com/store/${shopHandle}/products/${row.productId}`}
                                target="_blank"
                                rel="noreferrer"
                                className="apply-button"
                                style={{
                                  textDecoration: "none",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 8,
                                }}
                              >
                                {row.missingCost
                                  ? language === "it"
                                    ? "Aggiorna costo"
                                    : "Update cost"
                                  : language === "it"
                                    ? "Controlla prezzo"
                                    : "Review pricing"}
                                <span style={{ fontSize: 18 }}>→</span>
                              </a>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}