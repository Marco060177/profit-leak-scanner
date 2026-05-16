import * as React from "react";
import { money, pct, type Row } from "~/utils/margin";

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
  return (
    <div className="panel" id="products-section">
      <div className="section-header">
        <div>
          <div className="section-title">Product Risk Table</div>

          <div className="section-subtitle">
            Products ranked by real margin risk and potential profit leaks.
          </div>

          <div className="table-filters">
            <button
              className={onlyLosing ? "table-filter-btn" : "table-filter-btn active"}
              onClick={() => setOnlyLosing(false)}
            >
              All products
            </button>

            <button
              className={onlyLosing ? "table-filter-btn active" : "table-filter-btn"}
              onClick={() => setOnlyLosing(true)}
            >
              Losing only
            </button>
          </div>
        </div>

        <button
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
          Export CSV
        </button>
      </div>

      <div className="desktop-table-wrapper">
        <table className="product-table">
          <thead>
            <tr>
              {[
                "Product",
                "Revenue",
                "COGS",
                "Profit",
                "Target Price",
                "Delta",
                "Margin",
                "Risk",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {sortedRiskRows.map((row) => (
              <React.Fragment key={row.productTitle}>
                <tr>
                  <td>
                    <div className="product-name-cell">
                      <div className="product-icon">📦</div>

                      <div>
                        <div className="product-name">
                          {row.productTitle}
                        </div>

                        <div className="product-subtitle">
                          Avg price {money(row.avgPrice)} • Avg cost{" "}
                          {money(row.avgCost)}

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
                                Set cost
                              </a>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td>{money(row.revenue)}</td>

                  <td>{money(row.cogs)}</td>

                  <td
                    style={{
                      color: row.profit < 0 ? "#ef4444" : "#22c55e",
                    }}
                  >
                    <div
                      style={{
                        color: row.profit < 0 ? "#ff6b4a" : "#22c55e",
                        fontWeight: 800,
                        fontSize: 28,
                        letterSpacing: "-0.03em",
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
                    }}
                  >
                    {row.targetDelta > 0 ? "↑ " : "↓ "}
                    {money(row.targetDelta)}
                  </td>

                  <div
                    style={{
                      color:
                        row.marginPct < 0
                          ? "#ff6b4a"
                          : row.marginPct < 10
                            ? "#f59e0b"
                            : "#22c55e",
                      fontWeight: 700,
                      fontSize: 15,
                      whiteSpace: "nowrap",
                      display: "flex",
                      alignItems: "center",
                      height: "100%",
                    }}
                  >
                    {pct(row.marginPct)}
                  </div>

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

                {(row.losing || row.targetDelta > 0) && (
                  <tr>
                    <td colSpan={8}>
                      <div
                        className="desktop-suggestion"
                        style={{
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.06)",
                          borderRadius: 18,
                          padding: 18,
                        }}
                      >
                        <div className="suggestion-title">
                          AI Suggestion
                        </div>

                        <div
                          className="suggestion-copy"
                          style={{
                            lineHeight: 1.6,
                            color: "#d6d9e0",
                            fontSize: 15,
                          }}
                        >
                          {row.suggestion}

                          {row.productId ? (
                            <div style={{ marginTop: 14 }}>
                              <a
                                href={`https://admin.shopify.com/store/${shopHandle}/products/${row.productId}`}
                                target="_blank"
                                rel="noreferrer"
                                className="apply-button"
                              >
                                Review pricing
                              </a>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}