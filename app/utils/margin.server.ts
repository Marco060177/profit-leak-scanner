import type {
  LoaderData,
  Row,
  TrendPoint,
} from "~/utils/margin";

import {
  extractNumericId,
  toYYYYMMDD,
} from "~/utils/margin";

export async function loadMarginDashboardData({
  admin,
  session,
  period,
}: {
  admin: any;
  session: any;
  period: string;
}): Promise<LoaderData> {
  const days = Number.parseInt(period, 10);

  const safeDays =
    Number.isFinite(days) && days > 0
      ? days
      : 30;

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - safeDays);

  const fromYYYYMMDD = toYYYYMMDD(fromDate);

  const previousFromDate = new Date(fromDate);
  previousFromDate.setDate(previousFromDate.getDate() - safeDays);

  const previousFromYYYYMMDD = toYYYYMMDD(previousFromDate);

  const queryString = `processed_at:>=${fromYYYYMMDD}`;

  const previousQueryString =
    `processed_at:>=${previousFromYYYYMMDD} processed_at:<${fromYYYYMMDD}`;

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

  const billingActive = activeSubscriptions.length > 0;

  const response = await admin.graphql(
    `#graphql
  query OrdersForLeak($q: String!) {
    orders(first: 100, sortKey: PROCESSED_AT, reverse: true, query: $q) {
      edges {
        node {
          id
          name
          processedAt

          subtotalPriceSet {
            shopMoney { amount }
          }

          totalDiscountsSet {
            shopMoney { amount }
          }

          totalShippingPriceSet {
            shopMoney { amount }
          }

          totalTaxSet {
            shopMoney { amount }
          }

          totalRefundedSet {
            shopMoney { amount }
          }

          lineItems(first: 250) {
            edges {
              node {
                quantity

                discountedTotalSet {
                  shopMoney { amount }
                }

                originalTotalSet {
                  shopMoney { amount }
                }

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

  

  const previousResponse = await admin.graphql(
    `#graphql
    query OrdersForLeakPrevious($q: String!) {
      orders(first: 100, sortKey: PROCESSED_AT, reverse: true, query: $q) {
        edges {
          node {
            lineItems(first: 250) {
              edges {
                node {
                  quantity
                  originalUnitPriceSet {
                    shopMoney { amount }
                  }
                  variant {
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
    { variables: { q: previousQueryString } },
  );

  const previousGql = await previousResponse.json();

  const previousOrderEdges =
    previousGql?.data?.orders?.edges ?? [];

  const orderEdges =
    gql?.data?.orders?.edges ?? [];

  const byDay: Record<
    string,
    {
      revenue: number;
      cogs: number;
    }
  > = {};

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

  let previousRevenue = 0;
  let previousCogs = 0;

  for (const o of orderEdges) {
    const items = o?.node?.lineItems?.edges ?? [];

    for (const li of items) {
      const qty = Number(li?.node?.quantity ?? 0);

      const price = Number(
        li?.node?.originalUnitPriceSet?.shopMoney?.amount ?? 0,
      );

      const costRaw =
        li?.node?.variant?.inventoryItem?.unitCost?.amount;

      const hasCost =
        costRaw !== null && costRaw !== undefined;

      const cost = Number(costRaw ?? 0);

      const product = li?.node?.variant?.product;

      const productTitle =
        product?.title ?? "Unknown product";

      const productId =
        product?.id ? extractNumericId(product.id) : "";

      const lineRevenue = price * qty;
      const lineCogs = cost * qty;

      const processedAt = o?.node?.processedAt ?? "";
      const day = processedAt.slice(0, 10);

      if (!byDay[day]) {
        byDay[day] = {
          revenue: 0,
          cogs: 0,
        };
      }

      byDay[day].revenue += lineRevenue;
      byDay[day].cogs += lineCogs;

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

  for (const o of previousOrderEdges) {
    const items = o?.node?.lineItems?.edges ?? [];

    for (const li of items) {
      const qty = Number(li?.node?.quantity ?? 0);

      const price = Number(
        li?.node?.originalUnitPriceSet?.shopMoney?.amount ?? 0,
      );

      const costRaw =
        li?.node?.variant?.inventoryItem?.unitCost?.amount;

      const cost = Number(costRaw ?? 0);

      previousRevenue += price * qty;
      previousCogs += cost * qty;
    }
  }

  const rows: Row[] = Object.values(byProduct)
    .map((r) => {
      const profit = r.revenue - r.cogs;

      const marginPct =
        r.revenue > 0
          ? (profit / r.revenue) * 100
          : 0;

      const avgPrice =
        r.qty > 0 ? r.revenue / r.qty : 0;

      const avgCost =
        r.qty > 0 ? r.cogs / r.qty : 0;

      const breakEvenPrice = avgCost;

      const targetMargin = 0.2;

      const targetPrice =
        avgCost > 0
          ? avgCost / (1 - targetMargin)
          : avgPrice;

      const targetDelta = targetPrice - avgPrice;

      const aggressiveIncrease =
        avgPrice > 0 && targetDelta / avgPrice > 0.3;

      const suggestion =
        profit < 0
          ? aggressiveIncrease
            ? "Current margins are critically below target. Review product costs, pricing structure and discounts."
            : `Increase price to ${moneyServer(targetPrice)} (${targetDelta >= 0 ? "+" : ""}${moneyServer(
              targetDelta,
            )} per unit) to reach a healthier margin.`
          : targetDelta > 0
            ? aggressiveIncrease
              ? "Margin improvement opportunity detected. Review pricing and fulfillment costs."
              : `Consider increasing price to ${moneyServer(
                targetPrice,
              )} to improve product margins.`
            : "Current pricing and margins appear stable based on available cost data."

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
  const previousProfit = previousRevenue - previousCogs;

  const previousMarginPct =
    previousRevenue > 0
      ? (previousProfit / previousRevenue) * 100
      : 0;

  const marginPct =
    totalRevenue > 0
      ? (totalProfit / totalRevenue) * 100
      : 0;

  const marginDelta = marginPct - previousMarginPct;

  const revenueDeltaPct =
    previousRevenue > 0
      ? ((totalRevenue - previousRevenue) / previousRevenue) * 100
      : 0;

  const totalLeak = Math.abs(
    rows.reduce(
      (acc, r) => acc + (r.profit < 0 ? r.profit : 0),
      0,
    ),
  );

  const losingCount =
    rows.filter((r) => r.losing).length;

  const missingCostCount =
    rows.filter((r) => r.missingCost).length;

  const shopHandle =
    session.shop.replace(".myshopify.com", "");

  const trend: TrendPoint[] = Object.entries(byDay)
    .map(([date, values]) => ({
      date,
      revenue: values.revenue,
      profit: values.revenue - values.cogs,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    summary: {
      revenue: totalRevenue,
      cogs: totalCogs,
      profit: totalProfit,
      marginPct,
      totalLeak,
      losingCount,
      missingCostCount,
      previousMarginPct,
      marginDelta,
      previousRevenue,
      revenueDeltaPct,
    },
    rows,
    trend,
    billingActive,
    period: String(safeDays),
    shopHandle,
  };
}

function moneyServer(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}