import type {
  NormalizedCommercePeriod,
  NormalizedProductAggregate,
} from "~/core/normalized-commerce";
import type { ShopifyMarginOrderEdge } from "~/connectors/shopify/shopify-margin-source.server";
import { extractNumericId } from "~/utils/margin";

type OrderNode = ShopifyMarginOrderEdge["node"];
type OrderLineItem = OrderNode["lineItems"]["edges"][number]["node"];
type OrderProduct =
  | NonNullable<OrderLineItem["variant"]>["product"]
  | Extract<OrderLineItem["variant"], null | undefined>;
type OrderRefund = OrderNode["refunds"][number];
type ShippingTaxLine = OrderNode["shippingLines"]["edges"][number]["node"]["taxLines"][number];
type ProductTaxLine = OrderLineItem["taxLines"][number];
type DiscountAllocation = OrderLineItem["discountAllocations"][number];

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function productKey(product: OrderProduct, lineItemId: string) {
  if (product?.id) return `product:${product.id}`;
  return `line:${lineItemId || "unknown"}`;
}

function getOrCreateProduct(
  byProduct: Record<string, NormalizedProductAggregate>,
  key: string,
  product: OrderProduct,
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
      productTaxAmount: 0,
      refundedTaxAmount: 0,
      includedProductTaxAmount: 0,
      excludedProductTaxAmount: 0,
      includedRefundedTaxAmount: 0,
      excludedRefundedTaxAmount: 0,
      taxableLineCount: 0,
      nonTaxableLineCount: 0,
      taxedLineCount: 0,
      taxExemptLineCount: 0,
      taxesIncludedLineCount: 0,
      taxesExcludedLineCount: 0,
    };
  }

  return byProduct[key];
}

/**
 * Maps Shopify source DTOs into the small in-memory compatibility contract.
 *
 * This deliberately preserves legacy behavior: current Shopify unitCost is
 * used for historical lines, refunds stay on the order day and reverse that
 * current COGS, shipping has revenue/tax but no carrier cost, nested connection
 * truncation is only marked, and all money is assumed to be shopMoney in the
 * store's single currency. These are not future canonical ledger semantics.
 */
export function mapShopifyOrdersToNormalizedPeriod(
  orderEdges: ShopifyMarginOrderEdge[],
): NormalizedCommercePeriod {
  const byDay: NormalizedCommercePeriod["byDay"] = {};
  const byProduct: NormalizedCommercePeriod["byProduct"] = {};
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
  const truncatedConnections = new Set<string>();

  for (const edge of orderEdges) {
    const order = edge?.node;
    if (order?.shippingLines?.pageInfo?.hasNextPage === true) truncatedConnections.add("shippingLines");
    if (order?.lineItems?.pageInfo?.hasNextPage === true) truncatedConnections.add("lineItems");
    if ((order?.refunds ?? []).some((refund: OrderRefund) => refund?.refundLineItems?.pageInfo?.hasNextPage === true)) {
      truncatedConnections.add("refundLineItems");
    }
    if (order?.taxExempt === true) taxExemptOrderCount += 1;
    if (order?.taxesIncluded === true) taxesIncludedOrderCount += 1;
    else taxesExcludedOrderCount += 1;

    const processedAt = String(order?.processedAt ?? "");
    const day = processedAt.slice(0, 10);
    if (processedAt) {
      if (!firstOrderAt || processedAt < firstOrderAt) firstOrderAt = processedAt;
      if (!lastOrderAt || processedAt > lastOrderAt) lastOrderAt = processedAt;
    }
    if (day && !byDay[day]) {
      byDay[day] = { grossProductSales: 0, discounts: 0, refundedProductRevenue: 0, netProductRevenue: 0, shippingRevenue: 0, productCogs: 0 };
    }

    const orderShippingRevenue = amount(order?.totalShippingPriceSet?.shopMoney?.amount);
    shippingRevenue += orderShippingRevenue;
    taxes += amount(order?.totalTaxSet?.shopMoney?.amount);
    if (day) byDay[day].shippingRevenue += orderShippingRevenue;

    for (const shippingEdge of order?.shippingLines?.edges ?? []) {
      const shippingLineTax = (shippingEdge?.node?.taxLines ?? []).reduce(
        (sum: number, taxLine: ShippingTaxLine) => sum + amount(taxLine?.priceSet?.shopMoney?.amount),
        0,
      );
      shippingTaxAmount += shippingLineTax;
      if (order?.taxesIncluded === true) includedShippingTaxAmount += shippingLineTax;
      else excludedShippingTaxAmount += shippingLineTax;
    }

    for (const lineEdge of order?.lineItems?.edges ?? []) {
      const line = lineEdge?.node;
      const lineItemId = String(line?.id ?? "");
      const product = line?.variant?.product;
      const aggregate = getOrCreateProduct(byProduct, productKey(product, lineItemId), product);

      if (line?.taxable === true) {
        taxableLineCount += 1;
        aggregate.taxableLineCount += 1;
      } else {
        nonTaxableLineCount += 1;
        aggregate.nonTaxableLineCount += 1;
      }

      const lineTaxAmount = (line?.taxLines ?? []).reduce(
        (sum: number, taxLine: ProductTaxLine) => sum + amount(taxLine?.priceSet?.shopMoney?.amount),
        0,
      );
      productTaxAmount += lineTaxAmount;
      aggregate.productTaxAmount += lineTaxAmount;
      if (order?.taxesIncluded === true) {
        includedProductTaxAmount += lineTaxAmount;
        aggregate.includedProductTaxAmount += lineTaxAmount;
        aggregate.taxesIncludedLineCount += 1;
      } else {
        excludedProductTaxAmount += lineTaxAmount;
        aggregate.excludedProductTaxAmount += lineTaxAmount;
        aggregate.taxesExcludedLineCount += 1;
      }
      if (order?.taxExempt === true) aggregate.taxExemptLineCount += 1;
      if (lineTaxAmount > 0) {
        taxedLineCount += 1;
        aggregate.taxedLineCount += 1;
      }

      const quantity = amount(line?.quantity);
      const originalTotal = amount(line?.originalTotalSet?.shopMoney?.amount);
      const discountedTotal = amount(line?.discountedTotalSet?.shopMoney?.amount);
      const allocatedDiscount = (line?.discountAllocations ?? []).reduce(
        (sum: number, allocation: DiscountAllocation) => sum + amount(allocation?.allocatedAmountSet?.shopMoney?.amount),
        0,
      );
      const lineDiscount = Math.min(
        originalTotal,
        allocatedDiscount > 0 ? allocatedDiscount : Math.max(0, originalTotal - discountedTotal),
      );
      const netLineRevenue = Math.max(0, originalTotal - lineDiscount);
      const costRaw = line?.variant?.inventoryItem?.unitCost?.amount;
      const hasCost = costRaw !== null && costRaw !== undefined;
      const lineCogs = amount(costRaw) * quantity;

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
        const aggregate = getOrCreateProduct(byProduct, productKey(product, lineItemId), product);
        const refundedQuantity = amount(refundLine?.quantity);
        const refundSubtotal = amount(refundLine?.subtotalSet?.shopMoney?.amount);
        const refundTax = amount(refundLine?.totalTaxSet?.shopMoney?.amount);
        const costRaw = line?.variant?.inventoryItem?.unitCost?.amount;
        const hasCost = costRaw !== null && costRaw !== undefined;
        const refundCogs = amount(costRaw) * refundedQuantity;

        aggregate.refundedQty += refundedQuantity;
        aggregate.refunds += refundSubtotal;
        aggregate.refundedCogs += refundCogs;
        aggregate.missingCost ||= !hasCost;
        productRefunds += refundSubtotal;
        refundedTaxAmount += refundTax;
        aggregate.refundedTaxAmount += refundTax;
        if (order?.taxesIncluded === true) {
          includedRefundedTaxAmount += refundTax;
          aggregate.includedRefundedTaxAmount += refundTax;
        } else {
          excludedRefundedTaxAmount += refundTax;
          aggregate.excludedRefundedTaxAmount += refundTax;
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
    truncatedConnections: [...truncatedConnections],
  };
}
