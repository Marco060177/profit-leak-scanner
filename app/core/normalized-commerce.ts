/**
 * Small in-memory boundary used by the current Shopify compatibility path.
 *
 * This is not the future persisted canonical ledger. Several fields preserve
 * legacy MarginLab semantics so the existing economic orchestration can remain
 * byte-for-byte compatible while Shopify DTOs stop crossing the connector
 * boundary.
 */
export type NormalizedProductAggregate = {
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

  productTaxAmount: number;
  refundedTaxAmount: number;
  includedProductTaxAmount: number;
  excludedProductTaxAmount: number;
  includedRefundedTaxAmount: number;
  excludedRefundedTaxAmount: number;
  taxableLineCount: number;
  nonTaxableLineCount: number;
  taxedLineCount: number;
  taxExemptLineCount: number;
  taxesIncludedLineCount: number;
  taxesExcludedLineCount: number;
};

export type NormalizedCommercePeriod = {
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
  byProduct: Record<string, NormalizedProductAggregate>;
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
  truncatedConnections: string[];
};

export type NormalizedCommerceDataset = {
  current: NormalizedCommercePeriod;
  previous: NormalizedCommercePeriod;
};
