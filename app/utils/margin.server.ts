import type { LoaderData, Row, TrendPoint } from "~/utils/margin";

import { extractNumericId, toYYYYMMDD } from "~/utils/margin";
import { formatMoney } from "~/utils/formatting";

type OrderEdge = { node?: any };

type ProductAggregate = {
  productId: string;
  productTitle: string;
  orderedQty: number;
  refundedQty: number;
  grossSales: number;
  discounts: number;
  refunds: number;
  grossCogs: number;
  refundedCogs: number;
  missingCost: boolean;
};

type PeriodAggregate = {
  byDay: Record<string, { revenue: number; cogs: number }>;
  byProduct: Record<string, ProductAggregate>;
  grossProductSales: number;
  discounts: number;
  productRefunds: number;
  shippingRevenue: number;
  taxes: number;
  netProductRevenue: number;
  productCogs: number;
};

const ORDERS_QUERY = `#graphql
  query MarginLabOrders($q: String!, $after: String) {
    orders(
      first: 100
      after: $after
      sortKey: PROCESSED_AT
      reverse: true
      query: $q
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }

      edges {
        node {
          id
          name
          processedAt

          totalShippingPriceSet {
            shopMoney {
              amount
            }
          }

          totalTaxSet {
            shopMoney {
              amount
            }
          }

          refunds {
            refundLineItems(first: 100) {
              edges {
                node {
                  quantity

                  subtotalSet {
                    shopMoney {
                      amount
                    }
                  }

                  lineItem {
                    id

                    variant {
                      product {
                        id
                        title
                      }

                      inventoryItem {
                        unitCost {
                          amount
                        }
                      }
                    }
                  }
                }
              }
            }
          }

          lineItems(first: 250) {
            edges {
              node {
                id
                quantity

                discountedTotalSet {
                  shopMoney {
                    amount
                  }
                }

                originalTotalSet {
                  shopMoney {
                    amount
                  }
                }

                discountAllocations {
                  allocatedAmountSet {
                    shopMoney {
                      amount
                    }
                  }
                }

                variant {
                  product {
                    id
                    title
                  }

                  inventoryItem {
                    unitCost {
                      amount
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function productKey(product: any, lineItemId: string) {
  if (product?.id) return `product:${product.id}`;
  return `line:${lineItemId || "unknown"}`;
}

function getOrCreateProduct(
  byProduct: Record<string, ProductAggregate>,
  key: string,
  product: any,
) {
  if (!byProduct[key]) {
    byProduct[key] = {
      productId: product?.id ? extractNumericId(product.id) : "",
      productTitle: product?.title ?? "Unknown product",
      orderedQty: 0,
      refundedQty: 0,
      grossSales: 0,
      discounts: 0,
      refunds: 0,
      grossCogs: 0,
      refundedCogs: 0,
      missingCost: false,
    };
  }

  return byProduct[key];
}

async function fetchAllOrders(admin: any, query: string) {
  const edges: OrderEdge[] = [];
  let after: string | null = null;

  do {
    const response = await admin.graphql(ORDERS_QUERY, {
      variables: { q: query, after },
    });

    const json = await response.json();

    if (json?.errors?.length) {
      throw new Error(
        `Unable to load Shopify orders: ${json.errors
          .map((error: any) => error?.message ?? "Unknown GraphQL error")
          .join("; ")}`,
      );
    }

    const connection = json?.data?.orders;
    edges.push(...(connection?.edges ?? []));

    after = connection?.pageInfo?.hasNextPage
      ? connection?.pageInfo?.endCursor ?? null
      : null;
  } while (after);

  return edges;
}

function aggregatePeriod(orderEdges: OrderEdge[]): PeriodAggregate {
  const byDay: PeriodAggregate["byDay"] = {};
  const byProduct: PeriodAggregate["byProduct"] = {};

  let grossProductSales = 0;
  let discounts = 0;
  let productRefunds = 0;
  let shippingRevenue = 0;
  let taxes = 0;
  let grossCogs = 0;
  let refundedCogs = 0;

  for (const edge of orderEdges) {
    const order = edge?.node;
    const day = String(order?.processedAt ?? "").slice(0, 10);

    if (day && !byDay[day]) {
      byDay[day] = { revenue: 0, cogs: 0 };
    }

    shippingRevenue += amount(
      order?.totalShippingPriceSet?.shopMoney?.amount,
    );
    taxes += amount(order?.totalTaxSet?.shopMoney?.amount);

    for (const lineEdge of order?.lineItems?.edges ?? []) {
      const line = lineEdge?.node;
      const lineItemId = String(line?.id ?? "");
      const product = line?.variant?.product;
      const key = productKey(product, lineItemId);
      const aggregate = getOrCreateProduct(byProduct, key, product);

      const quantity = amount(line?.quantity);
      const originalTotal = amount(
        line?.originalTotalSet?.shopMoney?.amount,
      );
      const discountedTotal = amount(
        line?.discountedTotalSet?.shopMoney?.amount,
      );
      const allocatedDiscount = (line?.discountAllocations ?? []).reduce(
        (sum: number, allocation: any) =>
          sum +
          amount(
            allocation?.allocatedAmountSet?.shopMoney?.amount,
          ),
        0,
      );
      const discountedTotalDifference = Math.max(
        0,
        originalTotal - discountedTotal,
      );
      const lineDiscount = Math.min(
        originalTotal,
        allocatedDiscount > 0
          ? allocatedDiscount
          : discountedTotalDifference,
      );
      const netLineRevenue = Math.max(0, originalTotal - lineDiscount);

      const costRaw = line?.variant?.inventoryItem?.unitCost?.amount;
      const hasCost = costRaw !== null && costRaw !== undefined;
      const unitCost = amount(costRaw);
      const lineCogs = unitCost * quantity;

      aggregate.orderedQty += quantity;
      aggregate.grossSales += originalTotal;
      aggregate.discounts += lineDiscount;
      aggregate.grossCogs += lineCogs;
      aggregate.missingCost ||= !hasCost;

      grossProductSales += originalTotal;
      discounts += lineDiscount;
      grossCogs += lineCogs;

      if (day) {
        byDay[day].revenue += netLineRevenue;
        byDay[day].cogs += lineCogs;
      }
    }

    for (const refund of order?.refunds ?? []) {
      for (const refundEdge of refund?.refundLineItems?.edges ?? []) {
        const refundLine = refundEdge?.node;
        const line = refundLine?.lineItem;
        const lineItemId = String(line?.id ?? "");
        const product = line?.variant?.product;
        const key = productKey(product, lineItemId);
        const aggregate = getOrCreateProduct(byProduct, key, product);

        const refundedQuantity = amount(refundLine?.quantity);
        const refundSubtotal = amount(
          refundLine?.subtotalSet?.shopMoney?.amount,
        );
        const costRaw = line?.variant?.inventoryItem?.unitCost?.amount;
        const hasCost = costRaw !== null && costRaw !== undefined;
        const refundCogs = amount(costRaw) * refundedQuantity;

        aggregate.refundedQty += refundedQuantity;
        aggregate.refunds += refundSubtotal;
        aggregate.refundedCogs += refundCogs;
        aggregate.missingCost ||= !hasCost;

        productRefunds += refundSubtotal;
        refundedCogs += refundCogs;

        if (day) {
          byDay[day].revenue -= refundSubtotal;
          byDay[day].cogs -= refundCogs;
        }
      }
    }
  }

  return {
    byDay,
    byProduct,
    grossProductSales,
    discounts,
    productRefunds,
    shippingRevenue,
    taxes,
    netProductRevenue: grossProductSales - discounts - productRefunds,
    productCogs: Math.max(0, grossCogs - refundedCogs),
  };
}

export async function loadMarginDashboardData({
  admin,
  session,
  period,
  locale = "en-US",
}: {
  admin: any;
  session: any;
  period: string;
  locale?: string;
}): Promise<LoaderData> {
  const days = Number.parseInt(period, 10);
  const safeDays = Number.isFinite(days) && days > 0 ? days : 30;

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - safeDays);

  const previousFromDate = new Date(fromDate);
  previousFromDate.setDate(previousFromDate.getDate() - safeDays);

  const fromYYYYMMDD = toYYYYMMDD(fromDate);
  const previousFromYYYYMMDD = toYYYYMMDD(previousFromDate);

  const queryString = `processed_at:>=${fromYYYYMMDD}`;
  const previousQueryString =
    `processed_at:>=${previousFromYYYYMMDD} processed_at:<${fromYYYYMMDD}`;

  const appDataResponse = await admin.graphql(`
    #graphql
    query MarginLabAppData {
      shop {
        currencyCode
        ianaTimezone
      }

      appInstallation {
        activeSubscriptions {
          id
          name
          status
        }
      }
    }
  `);

  const appDataJson = await appDataResponse.json();
  const activeSubscriptions =
    appDataJson?.data?.appInstallation?.activeSubscriptions ?? [];
  const billingActive = activeSubscriptions.length > 0;
  const currencyCode = appDataJson?.data?.shop?.currencyCode || "USD";
  const timeZone = appDataJson?.data?.shop?.ianaTimezone || "UTC";

  const storeMoney = (value: number) =>
    formatMoney(value, { currencyCode, locale, timeZone });

  const [currentOrderEdges, previousOrderEdges] = await Promise.all([
    fetchAllOrders(admin, queryString),
    fetchAllOrders(admin, previousQueryString),
  ]);

  const current = aggregatePeriod(currentOrderEdges);
  const previous = aggregatePeriod(previousOrderEdges);

  const previousMargins = new Map<string, number>();

  for (const [key, product] of Object.entries(previous.byProduct)) {
    const revenue =
      product.grossSales - product.discounts - product.refunds;
    const cogs = Math.max(0, product.grossCogs - product.refundedCogs);
    const profit = revenue - cogs;

    if (revenue > 0) {
      previousMargins.set(key, (profit / revenue) * 100);
    }
  }

  const rows: Row[] = Object.entries(current.byProduct)
    .map(([key, product]) => {
      const qty = Math.max(0, product.orderedQty - product.refundedQty);
      const revenue =
        product.grossSales - product.discounts - product.refunds;
      const cogs = Math.max(0, product.grossCogs - product.refundedCogs);
      const profit = revenue - cogs;
      const marginPct = revenue > 0 ? (profit / revenue) * 100 : 0;
      const previousMarginPct = previousMargins.get(key) ?? null;
      const productMarginDelta =
        previousMarginPct === null ? null : marginPct - previousMarginPct;

      const avgPrice = qty > 0 ? revenue / qty : 0;
      const avgCost = qty > 0 ? cogs / qty : 0;
      const breakEvenPrice = avgCost;
      const targetMargin = 0.2;
      const targetPrice =
        avgCost > 0 ? avgCost / (1 - targetMargin) : avgPrice;
      const targetDelta = targetPrice - avgPrice;
      const aggressiveIncrease =
        avgPrice > 0 && targetDelta / avgPrice > 0.3;

      const suggestion =
        profit < 0
          ? aggressiveIncrease
            ? "Current margins are critically below target. Review product costs, pricing structure and discounts."
            : `Increase price to ${storeMoney(targetPrice)} (${targetDelta >= 0 ? "+" : ""}${storeMoney(targetDelta)} per unit) to reach a healthier margin.`
          : targetDelta > 0
            ? aggressiveIncrease
              ? "Margin improvement opportunity detected. Review pricing and operational costs."
              : `Consider increasing price to ${storeMoney(targetPrice)} to improve product margins.`
            : "Current pricing and margins appear stable based on available cost data.";

      return {
        productId: product.productId,
        productTitle: product.productTitle,
        qty,
        revenue,
        cogs,
        discounts: product.discounts,
        refunds: product.refunds,
        profit,
        marginPct,
        previousMarginPct,
        productMarginDelta,
        losing: profit < 0,
        lowMargin: marginPct > 0 && marginPct < 10,
        avgPrice,
        avgCost,
        breakEvenPrice,
        targetPrice,
        targetDelta,
        suggestion,
        missingCost: product.missingCost,
      };
    })
    .sort((a, b) => a.profit - b.profit);

  const marginDeterioration = rows
    .filter(
      (row): row is Row & { productMarginDelta: number } =>
        row.productMarginDelta !== null,
    )
    .filter((row) => row.productMarginDelta < -3)
    .sort((a, b) => a.productMarginDelta - b.productMarginDelta)
    .slice(0, 5);

  const totalRevenue = current.netProductRevenue;
  const totalCogs = current.productCogs;
  const totalProfit = totalRevenue - totalCogs;
  const marginPct = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  const previousRevenue = previous.netProductRevenue;
  const previousProfit = previousRevenue - previous.productCogs;
  const previousMarginPct =
    previousRevenue > 0 ? (previousProfit / previousRevenue) * 100 : 0;

  const marginDelta = marginPct - previousMarginPct;
  const revenueDeltaPct =
    previousRevenue > 0
      ? ((totalRevenue - previousRevenue) / previousRevenue) * 100
      : 0;

  // Until actual carrier costs are supplied by the Growth model, this is a
  // gross contribution view: customer-paid shipping is revenue, not expense.
  const contributionProfit = totalProfit + current.shippingRevenue;
  const contributionRevenue = totalRevenue + current.shippingRevenue;
  const contributionMarginPct =
    contributionRevenue > 0
      ? (contributionProfit / contributionRevenue) * 100
      : 0;

  const totalLeak = Math.abs(
    rows.reduce((sum, row) => sum + (row.profit < 0 ? row.profit : 0), 0),
  );
  const losingCount = rows.filter((row) => row.losing).length;
  const missingCostCount = rows.filter((row) => row.missingCost).length;

  const trend: TrendPoint[] = Object.entries(current.byDay)
    .map(([date, values]) => ({
      date,
      revenue: values.revenue,
      profit: values.revenue - values.cogs,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    summary: {
      // Compatibility aliases used by the current UI:
      // revenue = net product revenue after discounts and product refunds
      // profit = gross product profit after net product COGS
      // marginPct = gross product margin
      revenue: totalRevenue,
      cogs: totalCogs,
      profit: totalProfit,
      marginPct,
      discounts: current.discounts,
      shipping: current.shippingRevenue,
      taxes: current.taxes,
      refunds: current.productRefunds,
      netRevenue: totalRevenue,
      contributionProfit,
      contributionMarginPct,
      totalLeak,
      losingCount,
      missingCostCount,
      previousMarginPct,
      marginDelta,
      previousRevenue,
      revenueDeltaPct,
    },
    rows,
    marginDeterioration,
    trend,
    billingActive,
    period: String(safeDays),
    shopHandle: session.shop.replace(".myshopify.com", ""),
    currencyCode,
    timeZone,
  };
}