import type { LoaderData, Row, TrendPoint } from "~/utils/margin";

import { extractNumericId, toYYYYMMDD } from "~/utils/margin";
import { formatMoney } from "~/utils/formatting";
import { buildEconomicSnapshot } from "~/utils/economic-snapshot";
import { getBillingStatus } from "~/utils/billing.server";
import { getStoreTaxContext } from "~/utils/tax-profile.server";

import { resolveTaxTreatment } from "~/utils/tax-aware-engine";
import { calculateTaxAwareEconomics } from "~/utils/tax-economics-engine";

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
  byDay: Record<
    string,
    {
      grossProductSales: number;
      discounts: number;
      refundedProductRevenue: number;
      netProductRevenue: number;
      shippingRevenue: number;
      productCogs: number;
    }
  >;
  byProduct: Record<string, ProductAggregate>;
  grossProductSales: number;
  discounts: number;
  productRefunds: number;
  shippingRevenue: number;
  taxes: number;
  productTaxAmount: number;
  shippingTaxAmount: number;
  refundedTaxAmount: number;

  includedProductTaxAmount: number;
  excludedProductTaxAmount: number;
  includedShippingTaxAmount: number;
  excludedShippingTaxAmount: number;
  includedRefundedTaxAmount: number;
  excludedRefundedTaxAmount: number;

  taxableLineCount: number;
  nonTaxableLineCount: number;
  taxedLineCount: number;

  taxExemptOrderCount: number;
  taxesIncludedOrderCount: number;
  taxesExcludedOrderCount: number;
  netProductRevenue: number;
  productCogs: number;
  orderCount: number;
  activeDays: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
};

const ORDERS_QUERY = `#graphql
  query MarginLabOrders($q: String!, $after: String) {
    orders(
      first: 50
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
          taxesIncluded
          taxExempt

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

          shippingLines(first: 10) {
            edges {
              node {
                title

                discountedPriceSet {
                  shopMoney {
                    amount
                  }
                }

                taxLines {
                  title
                  rate

                  priceSet {
                    shopMoney {
                      amount
                    }
                  }
                }
              }
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

                  totalTaxSet {
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

          lineItems(first: 150) {
            edges {
              node {
                id
                quantity
                taxable

                taxLines {
                  title
                  rate

                  priceSet {
                    shopMoney {
                      amount
                    }
                  }
                }

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
    let response: Response;

    try {
      response = await admin.graphql(ORDERS_QUERY, {
        variables: { q: query, after },
      });
    } catch (error: any) {
      console.error(
        "[SHOPIFY GRAPHQL ERROR]",
        JSON.stringify(error?.graphQLErrors ?? error, null, 2),
      );

      throw error;
    }

    const json = await response.json();

    if (json?.errors?.length) {
      throw new Error(
        `Unable to load Shopify orders: ${json.errors
          .map((error: any) => error?.message ?? "Unknown GraphQL error")
          .join("; ")
        } `,
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

  let productTaxAmount = 0;
  let shippingTaxAmount = 0;
  let refundedTaxAmount = 0;

  let includedProductTaxAmount = 0;
  let excludedProductTaxAmount = 0;
  let includedShippingTaxAmount = 0;
  let excludedShippingTaxAmount = 0;
  let includedRefundedTaxAmount = 0;
  let excludedRefundedTaxAmount = 0;

  let taxableLineCount = 0;
  let nonTaxableLineCount = 0;
  let taxedLineCount = 0;

  let taxExemptOrderCount = 0;
  let taxesIncludedOrderCount = 0;
  let taxesExcludedOrderCount = 0;

  let grossCogs = 0;
  let refundedCogs = 0;
  let firstOrderAt: string | null = null;
  let lastOrderAt: string | null = null;

  for (const edge of orderEdges) {
    const order = edge?.node;
    if (order?.taxExempt === true) {
      taxExemptOrderCount += 1;
    }

    if (order?.taxesIncluded === true) {
      taxesIncludedOrderCount += 1;
    } else {
      taxesExcludedOrderCount += 1;
    }

    const processedAt = String(order?.processedAt ?? "");
    const day = String(order?.processedAt ?? "").slice(0, 10);

    if (processedAt) {
      if (!firstOrderAt || processedAt < firstOrderAt) {
        firstOrderAt = processedAt;
      }
      if (!lastOrderAt || processedAt > lastOrderAt) {
        lastOrderAt = processedAt;
      }
    }

    if (day && !byDay[day]) {
      byDay[day] = {
        grossProductSales: 0,
        discounts: 0,
        refundedProductRevenue: 0,
        netProductRevenue: 0,
        shippingRevenue: 0,
        productCogs: 0,
      };
    }

    const orderShippingRevenue = amount(
      order?.totalShippingPriceSet?.shopMoney?.amount,
    );
    shippingRevenue += orderShippingRevenue;
    taxes += amount(order?.totalTaxSet?.shopMoney?.amount);

    if (day) {
      byDay[day].shippingRevenue += orderShippingRevenue;
    }

    for (const shippingEdge of order?.shippingLines?.edges ?? []) {
      const shippingLine = shippingEdge?.node;

      const shippingLineTax = (shippingLine?.taxLines ?? []).reduce(
        (sum: number, taxLine: any) =>
          sum + amount(taxLine?.priceSet?.shopMoney?.amount),
        0,
      );

      shippingTaxAmount += shippingLineTax;

      if (order?.taxesIncluded === true) {
        includedShippingTaxAmount += shippingLineTax;
      } else {
        excludedShippingTaxAmount += shippingLineTax;
      }
    }

    for (const lineEdge of order?.lineItems?.edges ?? []) {
      const line = lineEdge?.node;

      if (line?.taxable === true) {
        taxableLineCount += 1;
      } else {
        nonTaxableLineCount += 1;
      }

      const lineTaxAmount = (line?.taxLines ?? []).reduce(
        (sum: number, taxLine: any) =>
          sum + amount(taxLine?.priceSet?.shopMoney?.amount),
        0,
      );

      productTaxAmount += lineTaxAmount;

      if (order?.taxesIncluded === true) {
        includedProductTaxAmount += lineTaxAmount;
      } else {
        excludedProductTaxAmount += lineTaxAmount;
      }

      if (lineTaxAmount > 0) {
        taxedLineCount += 1;
      }

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
        byDay[day].grossProductSales += originalTotal;
        byDay[day].discounts += lineDiscount;
        byDay[day].netProductRevenue += netLineRevenue;
        byDay[day].productCogs += lineCogs;
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
        const refundTax = amount(
          refundLine?.totalTaxSet?.shopMoney?.amount,
        );
        const costRaw = line?.variant?.inventoryItem?.unitCost?.amount;
        const hasCost = costRaw !== null && costRaw !== undefined;
        const refundCogs = amount(costRaw) * refundedQuantity;

        aggregate.refundedQty += refundedQuantity;
        aggregate.refunds += refundSubtotal;
        aggregate.refundedCogs += refundCogs;
        aggregate.missingCost ||= !hasCost;

        productRefunds += refundSubtotal;
        refundedTaxAmount += refundTax;

        if (order?.taxesIncluded === true) {
          includedRefundedTaxAmount += refundTax;
        } else {
          excludedRefundedTaxAmount += refundTax;
        }

        refundedCogs += refundCogs;

        if (day) {
          byDay[day].refundedProductRevenue += refundSubtotal;
          byDay[day].netProductRevenue -= refundSubtotal;
          byDay[day].productCogs -= refundCogs;
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

    productTaxAmount,
    shippingTaxAmount,
    refundedTaxAmount,

    includedProductTaxAmount,
    excludedProductTaxAmount,
    includedShippingTaxAmount,
    excludedShippingTaxAmount,
    includedRefundedTaxAmount,
    excludedRefundedTaxAmount,

    taxableLineCount,
    nonTaxableLineCount,
    taxedLineCount,

    taxExemptOrderCount,
    taxesIncludedOrderCount,
    taxesExcludedOrderCount,

    netProductRevenue: grossProductSales - discounts - productRefunds,
    productCogs: Math.max(0, grossCogs - refundedCogs),
    orderCount: orderEdges.length,
    activeDays: Object.keys(byDay).length,
    firstOrderAt,
    lastOrderAt,
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

  const [appDataResponse, billing] = await Promise.all([
    admin.graphql(`
#graphql
    query MarginLabAppData {
      shop {
    currencyCode
    ianaTimezone
        billingAddress {
      countryCodeV2
    }
  }
}
`),
    getBillingStatus(admin),
  ]);

  const appDataJson = await appDataResponse.json();

  if (appDataJson?.errors?.length) {
    throw new Error(
      `Unable to load Shopify app data: ${appDataJson.errors
        .map((error: any) => error?.message ?? "Unknown GraphQL error")
        .join("; ")
      } `,
    );
  }

  const billingActive = billing.active;
  const currencyCode = appDataJson?.data?.shop?.currencyCode || "USD";
  const timeZone = appDataJson?.data?.shop?.ianaTimezone || "UTC";
  const shopCountryCode =
    appDataJson?.data?.shop?.billingAddress?.countryCodeV2 || "";
  const taxContext = await getStoreTaxContext({
    shop: session.shop,
    shopCountryCode,
  });


  const storeMoney = (value: number) =>
    formatMoney(value, { currencyCode, locale, timeZone });

  const [currentOrderEdges, previousOrderEdges] = await Promise.all([
    fetchAllOrders(admin, queryString),
    fetchAllOrders(admin, previousQueryString),
  ]);

  const current = aggregatePeriod(currentOrderEdges);
  const previous = aggregatePeriod(previousOrderEdges);

  const taxAwarePeriod = {
    totalShopifyTax: current.taxes,

    productTaxAmount: current.productTaxAmount,
    shippingTaxAmount: current.shippingTaxAmount,
    refundedTaxAmount: current.refundedTaxAmount,

    includedProductTaxAmount: current.includedProductTaxAmount,
    excludedProductTaxAmount: current.excludedProductTaxAmount,
    includedShippingTaxAmount: current.includedShippingTaxAmount,
    excludedShippingTaxAmount: current.excludedShippingTaxAmount,
    includedRefundedTaxAmount: current.includedRefundedTaxAmount,
    excludedRefundedTaxAmount: current.excludedRefundedTaxAmount,

    netCollectedTax: Math.max(
      0,
      current.productTaxAmount +
      current.shippingTaxAmount -
      current.refundedTaxAmount,
    ),

    taxableLineCount: current.taxableLineCount,
    nonTaxableLineCount: current.nonTaxableLineCount,
    taxedLineCount: current.taxedLineCount,

    taxExemptOrderCount: current.taxExemptOrderCount,
    taxesIncludedOrderCount: current.taxesIncludedOrderCount,
    taxesExcludedOrderCount: current.taxesExcludedOrderCount,

    hasActualShopifyTax:
      current.taxes > 0 ||
      current.productTaxAmount > 0 ||
      current.shippingTaxAmount > 0,

    hasTaxableProducts: current.taxableLineCount > 0,

    hasTaxExemptOrders: current.taxExemptOrderCount > 0,

    taxDataCoverage:
      current.orderCount === 0
        ? "none"
        : current.taxableLineCount +
          current.nonTaxableLineCount >
          0
          ? "complete"
          : "partial",
  } as const;

  const taxTreatment = resolveTaxTreatment({
    taxAwarePeriod,
    taxContext,
  });

  const taxAwareEconomics = calculateTaxAwareEconomics({
    revenue: current.netProductRevenue,
    cogs: current.productCogs,
    taxContext,
    taxTreatment,
  });

  

  

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
      const netProductSales = product.grossSales - product.discounts;
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
        orderedQuantity: product.orderedQty,
        refundedQuantity: product.refundedQty,
        netQuantity: qty,
        grossProductSales: product.grossSales,
        netProductSales,
        refundedProductRevenue: product.refunds,
        netProductRevenue: revenue,
        productCogs: cogs,
        grossProfit: profit,
        grossMarginPct: marginPct,
        discountRatePct:
          product.grossSales > 0
            ? (product.discounts / product.grossSales) * 100
            : 0,
        refundRatePct:
          netProductSales > 0
            ? (product.refunds / netProductSales) * 100
            : 0,
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

  const orderedQuantity = rows.reduce(
    (sum, row) => sum + (row.orderedQuantity ?? row.qty),
    0,
  );
  const refundedQuantity = rows.reduce(
    (sum, row) => sum + (row.refundedQuantity ?? 0),
    0,
  );
  const netQuantity = rows.reduce((sum, row) => sum + row.qty, 0);

  const losingProductRevenue = rows.reduce(
    (sum, row) => sum + (row.losing ? row.revenue : 0),
    0,
  );
  const lowMarginProductRevenue = rows.reduce(
    (sum, row) => sum + (row.lowMargin ? row.revenue : 0),
    0,
  );
  const missingCostRevenue = rows.reduce(
    (sum, row) => sum + (row.missingCost ? row.revenue : 0),
    0,
  );
  const revenueCoveragePct =
    totalRevenue > 0
      ? (Math.max(0, totalRevenue - missingCostRevenue) / totalRevenue) * 100
      : 100;

  for (const row of rows) {
    row.revenueSharePct =
      totalRevenue > 0 ? (row.revenue / totalRevenue) * 100 : 0;
    row.profitSharePct =
      totalProfit !== 0 ? (row.profit / totalProfit) * 100 : 0;
  }

  const trend: TrendPoint[] = Object.entries(current.byDay)
    .map(([date, values]) => ({
      date,
      revenue: values.netProductRevenue,
      profit: values.netProductRevenue - values.productCogs,
      grossProductSales: values.grossProductSales,
      discounts: values.discounts,
      refundedProductRevenue: values.refundedProductRevenue,
      netProductRevenue: values.netProductRevenue,
      shippingRevenue: values.shippingRevenue,
      productCogs: Math.max(0, values.productCogs),
      grossProfit:
        values.netProductRevenue - Math.max(0, values.productCogs),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const loaderData: LoaderData = {
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
      grossProductSales: current.grossProductSales,
      refundedProductRevenue: current.productRefunds,
      netProductRevenue: totalRevenue,
      shippingRevenue: current.shippingRevenue,
      productCogs: totalCogs,
      grossProfit: totalProfit,
      grossMarginPct: marginPct,
      orderedQuantity,
      refundedQuantity,
      netQuantity,
      discountRatePct:
        current.grossProductSales > 0
          ? (current.discounts / current.grossProductSales) * 100
          : 0,
      refundRatePct:
        current.grossProductSales - current.discounts > 0
          ?
          (current.productRefunds /
            (current.grossProductSales - current.discounts)) *
          100
          : 0,
      losingProductRevenue,
      lowMarginProductRevenue,
      missingCostRevenue,
      revenueCoveragePct,
    },
    rows,
    marginDeterioration,
    trend,
    billingActive,
    period: String(safeDays),
    shopHandle: session.shop.replace(".myshopify.com", ""),
    currencyCode,
    timeZone,
    analysisContext: {
      requestedDays: safeDays,
      current: {
        orderCount: current.orderCount,
        productCount: rows.length,
        orderedQuantity,
        netQuantity,
        activeDays: current.activeDays,
        firstOrderAt: current.firstOrderAt,
        lastOrderAt: current.lastOrderAt,
        hasSales: current.orderCount > 0,
      },
      previous: {
        orderCount: previous.orderCount,
        productCount: Object.keys(previous.byProduct).length,
        orderedQuantity: Object.values(previous.byProduct).reduce(
          (sum, product) => sum + product.orderedQty,
          0,
        ),
        netQuantity: Object.values(previous.byProduct).reduce(
          (sum, product) =>
            sum + Math.max(0, product.orderedQty - product.refundedQty),
          0,
        ),
        activeDays: previous.activeDays,
        firstOrderAt: previous.firstOrderAt,
        lastOrderAt: previous.lastOrderAt,
        hasSales: previous.orderCount > 0,
      },
      comparisonAvailable:
        current.orderCount > 0 && previous.orderCount > 0,
    },
  };

  return {
    ...loaderData,
    taxContext,
    taxAwarePeriod,
    taxTreatment,
    taxAwareEconomics,
    
    economicSnapshot: buildEconomicSnapshot({
      summary: loaderData.summary,
      rows: loaderData.rows,
      period: loaderData.period,
      currencyCode: loaderData.currencyCode,
      analysisContext: loaderData.analysisContext,
    }),
  };
}