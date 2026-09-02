import * as React from "react";
import { uiMoney as money, pct, type Row } from "~/utils/margin";
import { useI18n } from "~/components/i18n/I18nProvider";
import MetricTooltip from "~/components/ui/MetricTooltip";
import {
  PremiumEmptyState,
  PremiumPanel,
  SegmentedTabs,
  StatusChip,
  VisualButton,
  type VisualTone,
} from "~/components/ui/VisualSystem";

type Props = {
  sortedRiskRows: Row[];
  exportRows: Row[];
  onlyLosing: boolean;
  setOnlyLosing: React.Dispatch<React.SetStateAction<boolean>>;
  period: string;
  riskLabel: (row: Row) => string;
  shopHandle: string;
  currencyCode: string;
};

function escapeCsvCell(value: string | number | boolean | null | undefined) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

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
  exportRows,
  onlyLosing,
  setOnlyLosing,
  period,
  riskLabel,
  shopHandle,
  currencyCode,
}: Props) {
  const { language, locale, messages, t } = useI18n();
  const copy = messages.productRiskTable;

  function translatedSuggestion(row: Row) {
    if (row.missingCost) {
      return language === "it"
        ? "Inserisci il costo del prodotto in Shopify"
        : language === "de"
          ? "Produktkosten in Shopify eintragen"
          : language === "es"
            ? "Añade el coste del producto en Shopify"
            : language === "pt-BR"
              ? "Adicione o custo do produto na Shopify"
              : "Add the product cost in Shopify";
    }

    if (
      language !== "it" &&
      language !== "de" &&
      language !== "es" &&
      language !== "pt-BR"
    ) {
      return row.suggestion;
    }

    if (row.profit < 0) {
      return language === "de"
        ? row.targetDelta > 0
          ? `Erhöhen Sie den Preis auf ${money(row.targetPrice)}, um eine gesündere Marge zu erreichen.`
          : "Die aktuellen Margen liegen kritisch unter dem Zielwert. Prüfen Sie Produktkosten, Preisstruktur und Rabatte."
        : language === "es"
          ? row.targetDelta > 0
            ? `Aumenta el precio a ${money(row.targetPrice)} para conseguir un margen más saludable.`
            : "Los márgenes actuales están muy por debajo del objetivo. Revisa los costes del producto, la estructura de precios y los descuentos."
          : language === "pt-BR"
            ? row.targetDelta > 0
              ? `Aumente o preço para ${money(row.targetPrice, currencyCode, locale)} para alcançar uma margem mais saudável.`
              : "As margens atuais estão muito abaixo da meta. Revise os custos do produto, a estrutura de preços e os descontos."
            : row.targetDelta > 0
              ? `Aumenta il prezzo a ${money(row.targetPrice)} per raggiungere un margine più sano.`
              : "I margini attuali sono criticamente sotto il valore target. Controlla costi prodotto, struttura dei prezzi e sconti.";
    }

    if (row.targetDelta > 0) {
      return language === "de"
        ? `Erwägen Sie eine Preiserhöhung auf ${money(row.targetPrice)}, um die Produktmarge zu verbessern.`
        : language === "es"
          ? `Valora aumentar el precio a ${money(row.targetPrice)} para mejorar el margen del producto.`
          : language === "pt-BR"
            ? `Considere aumentar o preço para ${money(row.targetPrice, currencyCode, locale)} para melhorar a margem do produto.`
            : `Valuta di aumentare il prezzo a ${money(row.targetPrice)} per migliorare il margine del prodotto.`;
    }

    return language === "de"
      ? "Preise und Margen sind auf Grundlage der verfügbaren Daten stabil."
      : language === "es"
        ? "Los precios y márgenes son estables según los datos disponibles."
        : language === "pt-BR"
          ? "Os preços e as margens estão estáveis com base nos dados disponíveis."
          : "Prezzi e margini risultano stabili sulla base dei dati disponibili.";
  }

  function visibleRiskLabel(row: Row) {
    if (language === "fr") {
      if (row.losing) return "Critique";
      if (row.missingCost) return "Coût manquant";
      if (row.lowMargin) return "Élevé";
      return "Sain";
    }
    if (language === "de") {
      if (row.losing) return "Kritisch";
      if (row.missingCost) return "Fehlende Kosten";
      if (row.lowMargin) return "Hoch";
      return "Gesund";
    }
    if (language === "es") {
      if (row.losing) return "Crítico";
      if (row.missingCost) return "Coste faltante";
      if (row.lowMargin) return "Alto";
      return "Saludable";
    }
    if (language === "pt-BR") {
      if (row.losing) return "Crítico";
      if (row.missingCost) return "Custo não informado";
      if (row.lowMargin) return "Alto";
      return "Saudável";
    }
    return riskLabel(row);
  }

  return (
    <PremiumPanel
      className="products-v2-table-panel"
      id="products-section"
      tone="orange"
    >
      <div className="section-header">
        <div>
          <div className="panel-eyebrow">{copy.eyebrow}</div>

          <div className="section-title" style={{ marginTop: 8 }}>
            {copy.title}
          </div>

          <div className="section-subtitle">{copy.description}</div>

          <SegmentedTabs
            className="products-v2-filters"
            tabs={[
              { id: "all", label: copy.allProducts },
              { id: "losing", label: copy.losingOnly },
            ]}
            activeId={onlyLosing ? "losing" : "all"}
            onChange={(id) => setOnlyLosing(id === "losing")}
            ariaLabel={copy.title}
          />
        </div>

        <VisualButton
          variant="secondary"
          onClick={() => {
            const isItalian = language === "it";
            const headers = isItalian
              ? [
                  "Store",
                  "Periodo (giorni)",
                  "Filtro",
                  "Valuta",
                  "ID prodotto",
                  "Prodotto",
                  "Quantità",
                  "Ricavi",
                  "COGS",
                  "Sconti",
                  "Rimborsi",
                  "Profitto",
                  "Margine %",
                  "Margine precedente %",
                  "Variazione margine (pp)",
                  "Prezzo medio",
                  "Costo medio",
                  "Prezzo di pareggio",
                  "Prezzo target",
                  "Delta prezzo",
                  "Punteggio rischio",
                  "Rischio",
                  "In perdita",
                  "Margine basso",
                  "Costo mancante",
                  "Azione consigliata",
                ]
              : [
                  "Store",
                  "Period (days)",
                  "Filter",
                  "Currency",
                  "Product ID",
                  "Product",
                  "Quantity",
                  "Revenue",
                  "COGS",
                  "Discounts",
                  "Refunds",
                  "Profit",
                  "Margin %",
                  "Previous margin %",
                  "Margin change (pp)",
                  "Average price",
                  "Average cost",
                  "Break-even price",
                  "Target price",
                  "Price delta",
                  "Risk score",
                  "Risk",
                  "Losing",
                  "Low margin",
                  "Missing cost",
                  "Recommended action",
                ];

            const filterLabel = onlyLosing
              ? isItalian
                ? "Solo in perdita"
                : "Losing only"
              : isItalian
                ? "Tutti i prodotti"
                : "All products";

            const csvRows = exportRows.map((row) => [
              shopHandle,
              period,
              filterLabel,
              currencyCode,
              row.productId,
              row.productTitle,
              row.qty,
              row.revenue.toFixed(2),
              row.cogs.toFixed(2),
              row.discounts.toFixed(2),
              row.refunds.toFixed(2),
              row.profit.toFixed(2),
              row.marginPct.toFixed(2),
              row.previousMarginPct == null
                ? ""
                : row.previousMarginPct.toFixed(2),
              row.productMarginDelta == null
                ? ""
                : row.productMarginDelta.toFixed(2),
              row.avgPrice.toFixed(2),
              row.avgCost.toFixed(2),
              row.breakEvenPrice.toFixed(2),
              row.targetPrice.toFixed(2),
              row.targetDelta.toFixed(2),
              getProductRiskScore(row),
              riskLabel(row),
              row.losing,
              row.lowMargin,
              row.missingCost,
              translatedSuggestion(row),
            ]);

            const csvContent = [
              headers.map(escapeCsvCell).join(","),
              ...csvRows.map((row) => row.map(escapeCsvCell).join(",")),
            ].join("\n");

            const blob = new Blob(["\uFEFF", csvContent], {
              type: "text/csv;charset=utf-8;",
            });

            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = url;
            link.download = `marginlab-${shopHandle}-products-${period}d-${onlyLosing ? "losing" : "all"}.csv`;
            link.click();

            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 0);
          }}
        >
          {copy.exportCsv}
        </VisualButton>
      </div>

      {sortedRiskRows.length > 0 ? (
        <div className="desktop-table-wrapper products-v2-table-wrapper">
          <table className="product-table">
            <thead>
              <tr>
                {[
                  {
                    key: "product",
                    label: copy.columns.product,
                  },
                  {
                    key: "revenue",
                    label: "Revenue",
                  },
                  {
                    key: "cogs",
                    label: "COGS",
                  },
                  {
                    key: "profit",
                    label: copy.columns.profit,
                  },
                  {
                    key: "target-price",
                    label: copy.columns.targetPrice,
                    tooltip: {
                      title: copy.tooltips.targetPrice.title,

                      description: copy.tooltips.targetPrice.description,

                      formula: copy.tooltips.targetPrice.formula,

                      note: copy.tooltips.targetPrice.note,
                    },
                  },
                  {
                    key: "delta",
                    label: "Delta",
                    tooltip: {
                      title: copy.tooltips.delta.title,

                      description: copy.tooltips.delta.description,

                      formula: copy.tooltips.delta.formula,

                      note: copy.tooltips.delta.note,
                    },
                  },
                  {
                    key: "margin",
                    label: copy.columns.margin,
                  },
                  {
                    key: "risk-score",
                    label: copy.columns.riskScore,
                    tooltip: {
                      title: copy.tooltips.riskScore.title,

                      description: copy.tooltips.riskScore.description,

                      note: copy.tooltips.riskScore.note,
                    },
                  },
                  {
                    key: "risk",
                    label: copy.columns.risk,
                  },
                ].map((header) => (
                  <th
                    key={header.key}
                    style={{
                      color: "rgba(255,255,255,0.55)",
                      fontSize: 11,
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      fontWeight: 900,
                    }}
                  >
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span>{header.label}</span>

                      {header.tooltip ? (
                        <MetricTooltip content={header.tooltip} />
                      ) : null}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {sortedRiskRows.map((row) => {
                const score = getProductRiskScore(row);
                const scoreStyle = getScoreStyle(score, row);
                const statusTone: VisualTone = row.losing
                  ? "red"
                  : row.missingCost
                    ? "amber"
                    : row.lowMargin
                      ? "orange"
                      : "green";
                const marginRail = row.missingCost
                  ? 0
                  : Math.min(
                      100,
                      Math.max(0, ((row.marginPct + 20) / 60) * 100),
                    );

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
                            <div className="product-name">
                              {row.productTitle}
                            </div>

                            <div className="product-subtitle">
                              {copy.avgPrice} {money(row.avgPrice)}
                              {" • "}
                              {copy.avgCost} {money(row.avgCost)}
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
                                    {copy.setCost}
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
                          className={`products-v2-margin products-v2-margin-${statusTone}`}
                        >
                          <strong>
                            {row.missingCost
                              ? copy.missing
                              : pct(row.marginPct)}
                          </strong>
                          <span aria-hidden="true">
                            <i style={{ width: `${marginRail}%` }} />
                          </span>
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
                      <div className="products-v2-status-stack">
                        <StatusChip tone={statusTone} pulse={row.losing}>
                          {visibleRiskLabel(row)}
                        </StatusChip>
                        {row.productMarginDelta != null &&
                        row.productMarginDelta < 0 ? (
                          <StatusChip tone="amber">
                            ↓ {pct(Math.abs(row.productMarginDelta))}
                          </StatusChip>
                        ) : null}
                      </div>
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
                              {copy.aiRecommendedAction}
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
                                ? copy.missingCostRecommendation
                                : language === "en"
                                  ? translatedSuggestion(row)
                                  : row.profit < 0
                                    ? row.targetDelta > 0
                                      ? t(
                                          "productRiskTable.increasePriceForHealthierMargin",
                                          {
                                            price: money(
                                              row.targetPrice,
                                              currencyCode,
                                              locale,
                                            ),
                                          },
                                        )
                                      : copy.criticalMarginsRecommendation
                                    : row.targetDelta > 0
                                      ? t(
                                          "productRiskTable.considerPriceIncrease",
                                          {
                                            price: money(
                                              row.targetPrice,
                                              currencyCode,
                                              locale,
                                            ),
                                          },
                                        )
                                      : copy.stablePricesRecommendation}
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
                                  {copy.openInShopify}
                                  <span style={{ fontSize: 18 }}>↗</span>
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
      ) : (
        <PremiumEmptyState
          className="products-v2-table-empty"
          tone={onlyLosing ? "green" : "orange"}
          eyebrow={copy.eyebrow}
          title={onlyLosing ? copy.losingOnly : copy.title}
          description={copy.description}
          visual={
            <div className="products-v2-empty-bars">
              <i />
              <i />
              <i />
            </div>
          }
        />
      )}
    </PremiumPanel>
  );
}
