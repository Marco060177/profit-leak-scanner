// app/routes/app._index.tsx
import * as React from "react";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "~/shopify.server";

type Summary = {
  revenue: number;
  cogs: number;
  profit: number;
  marginPct: number;
  totalLeak: number;
  losingCount: number;
  missingCostCount: number;
};

type Row = {
  productId: string;
  productTitle: string;
  qty: number;
  revenue: number;
  cogs: number;
  profit: number;
  marginPct: number;
  losing: boolean;
  lowMargin: boolean;
  avgPrice: number;
  avgCost: number;
  breakEvenPrice: number;
  targetPrice: number;
  targetDelta: number;
  suggestion: string;
  missingCost: boolean;
};

type LoaderData = {
  summary: Summary;
  rows: Row[];
  billingActive: boolean;
  period: string;
  shopHandle: string;
};

type SortKey =
  | "profit"
  | "marginPct"
  | "revenue"
  | "cogs"
  | "qty"
  | "productTitle"
  | "targetPrice"
  | "targetDelta";

type SortDir = "asc" | "desc";

function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function pct(n: number) {
  return `${n.toFixed(1)}%`;
}

function toYYYYMMDD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function extractNumericId(gid: string) {
  return gid.split("/").pop() || "";
}

export const loader = async ({
  request,
}: {
  request: Request;
}): Promise<LoaderData> => {
  const url = new URL(request.url);
  const period = url.searchParams.get("period") || "30";
  const days = Number.parseInt(period, 10);
  const safeDays = Number.isFinite(days) && days > 0 ? days : 30;

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - safeDays);
  const fromYYYYMMDD = toYYYYMMDD(fromDate);

  const { admin, session } = await authenticate.admin(request);

  try {
    await admin.graphql(`query { shop { id } }`);
  } catch {
    throw new Response("Auth/scopes not ready. Reinstall the app.", { status: 401 });
  }
  let billingActive = false;

const billingRes = await admin.graphql(`
  #graphql
  query {
    appInstallation {
      activeSubscriptions {
        id
        name
        status
      }
    }
  }
`);

const billingJson = await billingRes.json();

const activeSubscriptions =
  billingJson?.data?.appInstallation?.activeSubscriptions ?? [];

billingActive = activeSubscriptions.length > 0;

  

  const queryString = `processed_at:>=${fromYYYYMMDD}`;

  const response = await admin.graphql(
    `#graphql
    query OrdersForLeak($q: String!) {
      orders(first: 100, sortKey: PROCESSED_AT, reverse: true, query: $q) {
        edges {
          node {
            id
            name
            processedAt
            lineItems(first: 250) {
              edges {
                node {
                  quantity
                  originalUnitPriceSet {
                    shopMoney { amount }
                  }
                  variant {
                    product {
                      id
                      title
                    }
                    inventoryItem {
                      unitCost { amount }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }`,
    { variables: { q: queryString } },
  );

  const gql = await response.json();
  const orderEdges = gql?.data?.orders?.edges ?? [];

  const byProduct: Record<
    string,
    {
      productId: string;
      productTitle: string;
      qty: number;
      revenue: number;
      cogs: number;
      missingCost: boolean;
    }
  > = {};

  let totalRevenue = 0;
  let totalCogs = 0;

  for (const o of orderEdges) {
    const items = o?.node?.lineItems?.edges ?? [];

    for (const li of items) {
      const qty = Number(li?.node?.quantity ?? 0);
      const price = Number(li?.node?.originalUnitPriceSet?.shopMoney?.amount ?? 0);
      const costRaw = li?.node?.variant?.inventoryItem?.unitCost?.amount;
      const hasCost = costRaw !== null && costRaw !== undefined;
      const cost = Number(costRaw ?? 0);

      const product = li?.node?.variant?.product;
      const productTitle = product?.title ?? "Unknown product";
      const productId = product?.id ? extractNumericId(product.id) : "";

      const lineRevenue = price * qty;
      const lineCogs = cost * qty;

      if (!byProduct[productTitle]) {
        byProduct[productTitle] = {
          productId,
          productTitle,
          qty: 0,
          revenue: 0,
          cogs: 0,
          missingCost: false,
        };
      }

      if (!hasCost) {
        byProduct[productTitle].missingCost = true;
      }

      byProduct[productTitle].qty += qty;
      byProduct[productTitle].revenue += lineRevenue;
      byProduct[productTitle].cogs += lineCogs;

      totalRevenue += lineRevenue;
      totalCogs += lineCogs;
    }
  }

  const rows: Row[] = Object.values(byProduct)
    .map((r) => {
      const profit = r.revenue - r.cogs;
      const marginPct = r.revenue > 0 ? (profit / r.revenue) * 100 : 0;

      const avgPrice = r.qty > 0 ? r.revenue / r.qty : 0;
      const avgCost = r.qty > 0 ? r.cogs / r.qty : 0;

      const breakEvenPrice = avgCost;
      const targetMargin = 0.2;
      const targetPrice = avgCost > 0 ? avgCost / (1 - targetMargin) : avgPrice;
      const targetDelta = targetPrice - avgPrice;

      const suggestion =
        profit < 0
          ? `Increase price to ${money(targetPrice)} (${targetDelta >= 0 ? "+" : ""}${money(
              targetDelta,
            )} per unit) to reach a 20% margin.`
          : `Pricing looks healthy for a 20% margin.`;

      return {
        ...r,
        profit,
        marginPct,
        losing: profit < 0,
        lowMargin: marginPct > 0 && marginPct < 10,
        avgPrice,
        avgCost,
        breakEvenPrice,
        targetPrice,
        targetDelta,
        missingCost: r.missingCost,
        suggestion,
      };
    })
    .sort((a, b) => a.profit - b.profit);

  const totalProfit = totalRevenue - totalCogs;
  const totalLeak = Math.abs(rows.reduce((acc, r) => acc + (r.profit < 0 ? r.profit : 0), 0));
  const losingCount = rows.filter((r) => r.losing).length;
  const missingCostCount = rows.filter((r) => r.missingCost).length;
  const shopHandle = session.shop.replace(".myshopify.com", "");

  return {
    summary: {
      revenue: totalRevenue,
      cogs: totalCogs,
      profit: totalProfit,
      marginPct: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
      totalLeak,
      losingCount,
      missingCostCount,
    },
    rows,
    billingActive,
    period: String(safeDays),
    shopHandle,
  };
};

export default function AppIndex() {
  const { summary, rows, billingActive, period, shopHandle } = useLoaderData() as LoaderData;
  const navigate = useNavigate();

  const [onlyLosing, setOnlyLosing] = React.useState(false);
  const [sortKey, setSortKey] = React.useState<SortKey>("profit");
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");

  function setPeriod(next: "7" | "30" | "90") {
    navigate(`/app?period=${next}`);
  }

  const visibleRows = React.useMemo(() => {
    const base = onlyLosing ? rows.filter((r) => r.losing) : rows.slice();
    const dir = sortDir === "asc" ? 1 : -1;

    base.sort((a, b) => {
      const ka = a[sortKey];
      const kb = b[sortKey];

      if (typeof ka === "number" && typeof kb === "number") {
        return (ka - kb) * dir;
      }

      return String(ka).localeCompare(String(kb)) * dir;
    });

    return base;
  }, [rows, onlyLosing, sortKey, sortDir]);

  function onSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(nextKey);
      setSortDir(nextKey === "profit" ? "asc" : "desc");
    }
  }

  const hasLosing = summary.losingCount > 0;
  const hasMissingCost = summary.missingCostCount > 0;

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <div style={styles.title}>Profit Leak Scanner</div>

          <div style={styles.subtitleRow}>
            <div style={styles.subtitle}>
              Find products selling below cost and pricing leaks • Last {period} days
            </div>

            <div style={styles.periodWrap}>
              <button
                onClick={() => setPeriod("7")}
                style={{ ...styles.periodBtn, ...(period === "7" ? styles.periodBtnActive : {}) }}
              >
                7d
              </button>
              <button
                onClick={() => setPeriod("30")}
                style={{ ...styles.periodBtn, ...(period === "30" ? styles.periodBtnActive : {}) }}
              >
                30d
              </button>
              <button
                onClick={() => setPeriod("90")}
                style={{ ...styles.periodBtn, ...(period === "90" ? styles.periodBtnActive : {}) }}
              >
                90d
              </button>
            </div>
          </div>
        </div>

        <div style={styles.toggleWrap}>
          <button
            onClick={() => setOnlyLosing(false)}
            style={{
              ...styles.toggleBtn,
              ...(onlyLosing ? {} : styles.toggleBtnActive),
            }}
          >
            All products
          </button>

          <button
            onClick={() => setOnlyLosing(true)}
            style={{
              ...styles.toggleBtn,
              ...(onlyLosing ? styles.toggleBtnActive : {}),
            }}
          >
            Losing only
          </button>
        </div>
      </div>

      {!billingActive ? (
        <div style={styles.paywallBanner}>
          <div style={{ fontWeight: 800 }}>🔒 Plan inactive</div>
          <div style={{ opacity: 0.9, marginTop: 4 }}>
            You are viewing the dashboard in preview mode. Activate your plan to unlock full
            analysis.
          </div>
          <button style={styles.paywallBtn} onClick={() => navigate("/app/billing")}>
            Go to billing
          </button>
        </div>
      ) : null}

      {hasMissingCost && (
        <div style={styles.bannerWarning}>
          <div style={{ fontWeight: 700 }}>⚠️ Missing product costs</div>
          <div style={{ opacity: 0.9, marginTop: 4 }}>
            {summary.missingCostCount} products have no cost set. Profit analysis may be inaccurate.
          </div>
          <div style={{ opacity: 0.75, marginTop: 6, fontSize: 13 }}>
            Set product costs to unlock full analysis.
          </div>
        </div>
      )}

      {hasLosing ? (
        <div style={styles.bannerDanger}>
          <div style={{ fontWeight: 700 }}>⚠️ Products selling below cost detected</div>
          <div style={{ opacity: 0.9, marginTop: 4 }}>
            {summary.losingCount} products are selling below cost. “Total Leak” shows your
            estimated loss.
          </div>

          <button style={styles.bannerBtn} onClick={() => setOnlyLosing(true)}>
            Show losing products
          </button>
        </div>
      ) : (
        <div style={styles.bannerOk}>
          <div style={{ fontWeight: 700 }}>✅ No products selling below cost</div>
          <div style={{ opacity: 0.9, marginTop: 4 }}>
            Great news: no products appear to be selling below cost in the selected period.
          </div>
        </div>
      )}

      <div style={styles.kpiGrid}>
        <KpiCard label="Revenue" value={money(summary.revenue)} />
        <KpiCard label="COGS" value={money(summary.cogs)} />
        <KpiCard label="Profit" value={money(summary.profit)} accent="success" />
        <KpiCard label="Margin" value={pct(summary.marginPct)} accent="success" />
        <KpiCard
          label="Total Leak"
          value={money(summary.totalLeak)}
          accent={hasLosing ? "danger" : "neutral"}
        />
      </div>

      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={{ fontWeight: 700 }}>Products</div>
          <div style={styles.cardHint}>Click columns to sort • Worst-first by default</div>
        </div>

        {visibleRows.length === 0 ? (
          <div style={styles.empty}>
  <div style={{ fontSize: 42 }}>🧾</div>
  <div style={{ fontWeight: 700, marginTop: 8 }}>
    No sales data yet
  </div>
  <div style={{ opacity: 0.8, marginTop: 6 }}>
    Once your store receives orders, Profit Leak Scanner will analyze profit,
    margins, and detect products selling below cost.
  </div>
</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <Th
                    onClick={() => onSort("productTitle")}
                    active={sortKey === "productTitle"}
                    dir={sortDir}
                  >
                    Product
                  </Th>

                  <ThRight onClick={() => onSort("qty")} active={sortKey === "qty"} dir={sortDir}>
                    Qty
                  </ThRight>

                  <ThRight
                    onClick={() => onSort("revenue")}
                    active={sortKey === "revenue"}
                    dir={sortDir}
                  >
                    Revenue
                  </ThRight>

                  <ThRight
                    onClick={() => onSort("cogs")}
                    active={sortKey === "cogs"}
                    dir={sortDir}
                  >
                    COGS
                  </ThRight>

                  <ThRight
                    onClick={() => onSort("profit")}
                    active={sortKey === "profit"}
                    dir={sortDir}
                  >
                    Profit
                  </ThRight>

                  <ThRight
                    onClick={() => onSort("targetPrice")}
                    active={sortKey === "targetPrice"}
                    dir={sortDir}
                  >
                    Target Price
                  </ThRight>

                  <ThRight
                    onClick={() => onSort("targetDelta")}
                    active={sortKey === "targetDelta"}
                    dir={sortDir}
                  >
                    Price Delta
                  </ThRight>

                  <ThRight
                    onClick={() => onSort("marginPct")}
                    active={sortKey === "marginPct"}
                    dir={sortDir}
                  >
                    Margin %
                  </ThRight>

                  <ThRight active={false} dir="asc" onClick={() => {}}>
                    Action
                  </ThRight>
                </tr>
              </thead>

              <tbody>
                {visibleRows.map((r) => (
                  <React.Fragment key={r.productTitle}>
                    <tr
  style={{
    ...(r.losing
      ? styles.trLosing
      : r.lowMargin
      ? styles.trLowMargin
      : r.missingCost
      ? styles.trMissingCost
      : styles.tr),
  }}
  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.035)")}
  onMouseLeave={(e) =>
    (e.currentTarget.style.background =
      r.losing
        ? "rgba(220, 38, 38, 0.06)"
        : r.lowMargin
        ? "rgba(245, 158, 11, 0.08)"
        : r.missingCost
        ? "rgba(245, 158, 11, 0.05)"
        : "transparent")
  }
>
                      <td style={styles.tdProduct}>
                        <div style={{ fontWeight: 700 }}>{r.productTitle}</div>
                        <div style={styles.mini}>
                          Avg price: {money(r.avgPrice)} • Avg cost: {money(r.avgCost)} • Break-even
                          price: {money(r.breakEvenPrice)}
                          {r.missingCost ? (
                            <span style={styles.missingCostBadge}>Missing cost</span>
                          ) : null}
                          {r.lowMargin && !r.losing ? (
                            <span style={styles.lowMarginBadge}>Low margin</span>
                          ) : null}
                        </div>
                      </td>

                      <td style={styles.tdRight}>{r.qty}</td>
                      <td style={styles.tdRight}>{money(r.revenue)}</td>
                      <td style={styles.tdRight}>{money(r.cogs)}</td>

                      <td
                        style={{
                          ...styles.tdRight,
                          fontWeight: 700,
                          color: r.profit < 0 ? "crimson" : "#059669",
                        }}
                      >
                        {money(r.profit)}
                      </td>

                      <td style={styles.tdRight}>{money(r.targetPrice)}</td>

                      <td
                        style={{
                          ...styles.tdRight,
                          fontWeight: 700,
                          color: r.targetDelta > 0 ? "crimson" : "#059669",
                        }}
                      >
                        {r.targetDelta > 0 ? "↑ " : "↓ "}
                        {money(r.targetDelta)}
                      </td>

                      <td style={styles.tdRight}>
                        <div style={styles.marginWrap}>
                          <div
                            style={{
                              ...styles.marginBar,
                              width: `${Math.min(Math.max(r.marginPct, 0), 100)}%`,
                              background:
                                r.marginPct < 0
                                  ? "crimson"
                                  : r.marginPct < 20
                                    ? "#f59e0b"
                                    : "#059669",
                            }}
                          />
                        </div>
                        <div style={{ marginTop: 4 }}>{pct(r.marginPct)}</div>
                      </td>

                      <td style={styles.tdRight}>
                        {r.missingCost && r.productId ? (
                          <a
                            href={`https://admin.shopify.com/store/${shopHandle}/products/${r.productId}`}
                            target="_blank"
                            rel="noreferrer"
                            style={styles.costLink}
                          >
                            Set cost in Shopify
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>

                    {r.losing || r.targetDelta > 0 ? (
                      <tr>
                        <td colSpan={9} style={styles.tdSuggestion}>
                          <div style={styles.suggestionBox}>
                            <div style={{ fontWeight: 700 }}>Suggestion</div>
                            <div style={{ marginTop: 4 }}>{r.suggestion}</div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={styles.footerHint}>
        Tip: analysis is based on orders in the selected period (7 / 30 / 90 days).
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent = "neutral",
}: {
  label: string;
  value: string;
  accent?: "neutral" | "danger" | "success";
}) {
  const border =
    accent === "danger"
      ? "1px solid rgba(220, 38, 38, 0.35)"
      : accent === "success"
        ? "1px solid rgba(5, 150, 105, 0.25)"
        : "1px solid rgba(0,0,0,0.08)";

  const bg =
    accent === "danger"
      ? "rgba(220, 38, 38, 0.06)"
      : accent === "success"
        ? "rgba(5, 150, 105, 0.06)"
        : "#fff";

  return (
    <div style={{ ...styles.kpiCard, border, background: bg }}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={styles.kpiValue}>{value}</div>
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: "asc" | "desc";
}) {
  return (
    <th onClick={onClick} style={{ ...styles.th, ...(active ? styles.thActive : {}) }}>
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        {children}
        <span style={{ opacity: active ? 1 : 0.3 }}>
          {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </span>
    </th>
  );
}

function ThRight({
  children,
  onClick,
  active,
  dir,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: "asc" | "desc";
}) {
  return (
    <th onClick={onClick} style={{ ...styles.thRight, ...(active ? styles.thActive : {}) }}>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6 }}>
        {children}
        <span style={{ opacity: active ? 1 : 0.3 }}>
          {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </div>
    </th>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 18,
    maxWidth: 1200,
    margin: "0 auto",
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 900,
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 4,
    opacity: 0.7,
    fontSize: 13,
  },
  subtitleRow: {
    marginTop: 4,
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  periodWrap: {
    display: "inline-flex",
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 8,
    overflow: "hidden",
  },
  periodBtn: {
    padding: "4px 10px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontWeight: 700,
    opacity: 0.7,
  },
  periodBtnActive: {
    background: "rgba(0,0,0,0.06)",
    opacity: 1,
  },
  toggleWrap: {
    display: "inline-flex",
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 10,
    overflow: "hidden",
  },
  toggleBtn: {
    padding: "8px 12px",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontWeight: 700,
    opacity: 0.75,
  },
  toggleBtnActive: {
    background: "rgba(0,0,0,0.06)",
    opacity: 1,
  },
  bannerDanger: {
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    border: "1px solid rgba(220, 38, 38, 0.35)",
    background: "rgba(220, 38, 38, 0.06)",
  },
  bannerWarning: {
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    border: "1px solid rgba(245, 158, 11, 0.35)",
    background: "rgba(245, 158, 11, 0.08)",
  },
  bannerBtn: {
    marginTop: 10,
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid rgba(220, 38, 38, 0.35)",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 800,
  },
  bannerOk: {
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    border: "1px solid rgba(34, 197, 94, 0.28)",
    background: "rgba(34, 197, 94, 0.06)",
  },
  kpiGrid: {
    marginTop: 14,
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: 12,
  },
  kpiCard: {
    padding: 14,
    borderRadius: 16,
  },
  kpiLabel: {
    fontSize: 12,
    opacity: 0.7,
    fontWeight: 800,
  },
  kpiValue: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: 900,
  },
  card: {
    marginTop: 14,
    background: "#fff",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 16,
    overflow: "hidden",
  },
  cardHeader: {
    padding: "12px 14px",
    borderBottom: "1px solid rgba(0,0,0,0.06)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardHint: {
    fontSize: 12,
    opacity: 0.65,
  },
  table: {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
  },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    fontSize: 12,
    opacity: 0.75,
    borderBottom: "1px solid rgba(0,0,0,0.08)",
    cursor: "pointer",
    userSelect: "none",
    background: "rgba(0,0,0,0.02)",
  },
  thRight: {
    textAlign: "right",
    padding: "10px 12px",
    fontSize: 12,
    opacity: 0.75,
    borderBottom: "1px solid rgba(0,0,0,0.08)",
    cursor: "pointer",
    userSelect: "none",
    background: "rgba(0,0,0,0.02)",
    width: 120,
    whiteSpace: "nowrap",
  },
  thActive: {
    opacity: 1,
  },
  tr: {
  background: "transparent",
  transition: "background 0.15s ease",
},
trHover: {
  background: "rgba(0,0,0,0.035)",
},
  trLosing: {
    background: "rgba(220, 38, 38, 0.06)",
  },
  trLowMargin: {
    background: "rgba(245, 158, 11, 0.08)",
  },
  trMissingCost: {
    background: "rgba(245, 158, 11, 0.05)",
  },
  tdProduct: {
    padding: "10px 12px",
    borderBottom: "1px solid rgba(0,0,0,0.06)",
    verticalAlign: "top",
  },
  tdRight: {
    padding: "10px 12px",
    borderBottom: "1px solid rgba(0,0,0,0.06)",
    textAlign: "right",
    width: 120,
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
  },
  mini: {
    marginTop: 4,
    fontSize: 12,
    opacity: 0.7,
  },
  marginWrap: {
    width: "100%",
    height: 6,
    background: "rgba(0,0,0,0.08)",
    borderRadius: 999,
    overflow: "hidden",
  },
  marginBar: {
    height: "100%",
    borderRadius: 999,
  },
  missingCostBadge: {
    marginLeft: 8,
    padding: "2px 8px",
    borderRadius: 999,
    border: "1px solid rgba(245, 158, 11, 0.35)",
    background: "rgba(245, 158, 11, 0.10)",
    fontWeight: 800,
    fontSize: 12,
    opacity: 0.9,
    whiteSpace: "nowrap",
  },
  lowMarginBadge: {
    marginLeft: 8,
    padding: "2px 8px",
    borderRadius: 999,
    border: "1px solid rgba(245, 158, 11, 0.35)",
    background: "rgba(245, 158, 11, 0.10)",
    color: "#92400e",
    fontWeight: 800,
    fontSize: 12,
    opacity: 0.95,
  },
  tdSuggestion: {
    padding: 0,
    borderBottom: "1px solid rgba(0,0,0,0.06)",
  },
  suggestionBox: {
    padding: "10px 12px",
    background: "rgba(220, 38, 38, 0.04)",
  },
  empty: {
    padding: 28,
    textAlign: "center",
  },
  footerHint: {
    marginTop: 10,
    fontSize: 12,
    opacity: 0.65,
  },
  paywallBanner: {
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "rgba(0,0,0,0.03)",
  },
  paywallBtn: {
    marginTop: 10,
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.15)",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 800,
  },
  costLink: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid rgba(245, 158, 11, 0.35)",
    background: "rgba(245, 158, 11, 0.10)",
    color: "#92400e",
    textDecoration: "none",
    fontWeight: 800,
  },
};