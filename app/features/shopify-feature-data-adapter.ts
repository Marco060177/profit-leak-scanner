import type { LoaderData, Row, TrendPoint } from "~/utils/margin";
import type { FeatureData, FeatureEconomicPeriod, FeatureMoney, FeatureOptionalMoney,
  FeaturePeriodData, FeatureProductEconomics, FeatureSummaryEconomics } from "./feature-data-contract";
import { assertFeatureMoney, FEATURE_MONEY_MAX_SCALE } from "./feature-money";

export const SHOPIFY_FEATURE_ADAPTER_VERSION = "shopify-compatibility-v1";
const unavailable = (...reasonCodes: string[]): FeatureOptionalMoney => ({ status: "UNAVAILABLE", reasonCodes });
const notApplicable = (...reasonCodes: string[]): FeatureOptionalMoney => ({ status: "NOT_APPLICABLE", reasonCodes });

function decimalParts(value: number) {
  if (!Number.isFinite(value)) throw new RangeError("SHOPIFY_NON_FINITE_COMPATIBILITY_VALUE");
  const negative = value < 0 || Object.is(value, -0);
  const [coefficient, exponentText = "0"] = Math.abs(value).toString().toLowerCase().split("e");
  const exponent = Number.parseInt(exponentText, 10);
  const [whole, fraction = ""] = coefficient.split(".");
  let digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, "");
  let scale = fraction.length - exponent;
  if (scale < 0) { digits += "0".repeat(-scale); scale = 0; }
  while (scale > 0 && digits.endsWith("0")) { digits = digits.slice(0, -1); scale -= 1; }
  if (scale > FEATURE_MONEY_MAX_SCALE) throw new RangeError("SHOPIFY_COMPATIBILITY_VALUE_EXCEEDS_EXACT_SCALE");
  return { atoms: BigInt(digits || "0") * (negative ? -1n : 1n), scale };
}

export function shopifyNumberToFeatureMoney(value: number, currencyCode: string): FeatureMoney {
  const decimal = decimalParts(value);
  return assertFeatureMoney({ amountAtoms: decimal.atoms, amountScale: decimal.scale, currencyCode });
}

function available(value: number, currencyCode: string): FeatureOptionalMoney {
  return { status: "AVAILABLE", value: shopifyNumberToFeatureMoney(value, currencyCode) };
}

function optional(value: number | undefined, currencyCode: string, reason: string): FeatureOptionalMoney {
  return value === undefined ? unavailable(reason) : available(value, currencyCode);
}

function summaryEconomics(data: LoaderData): FeatureSummaryEconomics {
  const summary = data.summary, currency = data.currencyCode;
  return {
    revenue: available(summary.economicRevenue ?? summary.revenue, currency),
    cogs: available(summary.economicCogs ?? summary.cogs, currency),
    profit: available(summary.economicProfit ?? summary.profit, currency),
    fees: unavailable("SHOPIFY_COMPATIBILITY_FEES_NOT_SEPARATELY_AVAILABLE"),
    tax: available(summary.taxes, currency), discounts: available(summary.discounts, currency),
    refunds: available(summary.refunds, currency), shippingRevenue: available(summary.shipping, currency),
    otherContribution: notApplicable("SHOPIFY_COMPATIBILITY_OTHER_CONTRIBUTION_NOT_MODELLED"),
  };
}

function productEconomics(row: Row, currencyCode: string): FeatureProductEconomics {
  const missing = row.missingCost;
  const quantity = decimalParts(row.qty);
  return {
    productId: row.productId || null, skuId: null, title: row.productTitle || null,
    quantity: { quantityAtoms: quantity.atoms, quantityScale: quantity.scale },
    revenue: available(row.economicRevenue ?? row.revenue, currencyCode),
    cogs: missing ? unavailable("MISSING_COST") : available(row.economicCogs ?? row.cogs, currencyCode),
    profit: missing ? unavailable("MISSING_COST") : available(row.economicProfit ?? row.profit, currencyCode),
    discounts: available(row.discounts, currencyCode), refunds: available(row.refunds, currencyCode),
    fees: unavailable("SHOPIFY_PRODUCT_FEES_NOT_ALLOCATED"),
    tax: optional(row.salesTaxes, currencyCode, "SHOPIFY_PRODUCT_TAX_NOT_AVAILABLE"),
  };
}

function trendEconomics(point: TrendPoint, currencyCode: string): FeatureSummaryEconomics {
  return {
    revenue: available(point.netProductRevenue ?? point.revenue, currencyCode),
    cogs: optional(point.productCogs, currencyCode, "SHOPIFY_TREND_COGS_NOT_AVAILABLE"),
    profit: available(point.grossProfit ?? point.profit, currencyCode),
    fees: unavailable("SHOPIFY_COMPATIBILITY_FEES_NOT_SEPARATELY_AVAILABLE"),
    tax: unavailable("SHOPIFY_TREND_TAX_NOT_AVAILABLE"),
    discounts: optional(point.discounts, currencyCode, "SHOPIFY_TREND_DISCOUNTS_NOT_AVAILABLE"),
    refunds: optional(point.refundedProductRevenue, currencyCode, "SHOPIFY_TREND_REFUNDS_NOT_AVAILABLE"),
    shippingRevenue: optional(point.shippingRevenue, currencyCode, "SHOPIFY_TREND_SHIPPING_NOT_AVAILABLE"),
    otherContribution: notApplicable("SHOPIFY_COMPATIBILITY_OTHER_CONTRIBUTION_NOT_MODELLED"),
  };
}

function previousPeriod(data: LoaderData, period: FeatureEconomicPeriod | null): FeaturePeriodData | null {
  if (!period) return null;
  return { period, summary: {
    revenue: available(data.summary.previousRevenue, data.currencyCode),
    cogs: unavailable("SHOPIFY_PREVIOUS_COGS_NOT_EXPOSED"),
    profit: unavailable("SHOPIFY_PREVIOUS_PROFIT_NOT_EXPOSED"),
    fees: unavailable("SHOPIFY_PREVIOUS_FEES_NOT_EXPOSED"), tax: unavailable("SHOPIFY_PREVIOUS_TAX_NOT_EXPOSED"),
    discounts: unavailable("SHOPIFY_PREVIOUS_DISCOUNTS_NOT_EXPOSED"),
    refunds: unavailable("SHOPIFY_PREVIOUS_REFUNDS_NOT_EXPOSED"),
    shippingRevenue: unavailable("SHOPIFY_PREVIOUS_SHIPPING_NOT_EXPOSED"),
    otherContribution: notApplicable("SHOPIFY_COMPATIBILITY_OTHER_CONTRIBUTION_NOT_MODELLED"),
  }, products: [], trend: [] };
}

function validatePeriod(period: FeatureEconomicPeriod) {
  if (!(period.startInclusive instanceof Date) || !(period.endExclusive instanceof Date) ||
      !Number.isFinite(period.startInclusive.getTime()) || !Number.isFinite(period.endExclusive.getTime()) ||
      period.startInclusive >= period.endExclusive) throw new RangeError("INVALID_FEATURE_PERIOD");
}

export function adaptShopifyLoaderDataToFeatureData(input: {
  data: LoaderData; accountId: string; channelConnectionId: string;
  currentPeriod: FeatureEconomicPeriod; previousPeriod: FeatureEconomicPeriod | null;
}): FeatureData {
  const identity = { accountId: input.accountId, channelConnectionId: input.channelConnectionId,
    source: { channel: "SHOPIFY", sourceSystem: "SHOPIFY_ADMIN_COMPATIBILITY",
      adapterVersion: SHOPIFY_FEATURE_ADAPTER_VERSION } } as const;
  try {
    if (!input.accountId || !input.channelConnectionId) throw new RangeError("VERIFIED_FEATURE_OWNERSHIP_REQUIRED");
    validatePeriod(input.currentPeriod); if (input.previousPeriod) validatePeriod(input.previousPeriod);
    const incomplete = input.data.analysisContext?.dataCompleteness;
    const missingCost = input.data.rows.some((row) => row.missingCost);
    const reasonCodes = [
      ...(missingCost ? ["MISSING_COST"] : []),
      ...(incomplete?.currentPeriodComplete === false ? ["CURRENT_PERIOD_SOURCE_INCOMPLETE"] : []),
      ...(incomplete?.previousPeriodComplete === false ? ["PREVIOUS_PERIOD_SOURCE_INCOMPLETE"] : []),
      ...(incomplete?.truncatedConnections ?? []).map((value) => `TRUNCATED_CONNECTION:${value}`),
      "SHOPIFY_CURRENT_COST_APPLIED_TO_HISTORICAL_SALES",
      "SHOPIFY_REFUNDS_ATTRIBUTED_TO_ORDER_PERIOD",
    ];
    const previous = previousPeriod(input.data, input.previousPeriod);
    return { ...identity, status: "READY", currencyCode: input.data.currencyCode,
      current: { period: input.currentPeriod, summary: summaryEconomics(input.data),
        products: input.data.rows.map((row) => productEconomics(row, input.data.currencyCode)),
        trend: input.data.trend.map((point) => ({ date: point.date,
          economics: trendEconomics(point, input.data.currencyCode) })) }, previous,
      completeness: { status: reasonCodes.some((code) => code === "MISSING_COST" || code.includes("INCOMPLETE") ||
        code.startsWith("TRUNCATED_CONNECTION:")) ? "DEGRADED" : "PROVISIONAL", reasonCodes },
      capabilities: {
        productEconomics: { status: "AVAILABLE" }, trend: { status: "AVAILABLE" },
        periodComparison: previous ? { status: "AVAILABLE" } :
          { status: "UNAVAILABLE", reasonCodes: ["PREVIOUS_PERIOD_NOT_PROVIDED"] },
        fees: { status: "UNAVAILABLE", reasonCodes: ["SHOPIFY_COMPATIBILITY_FEES_NOT_SEPARATELY_AVAILABLE"] },
        tax: { status: "AVAILABLE" }, refunds: { status: "AVAILABLE" },
        assumptions: { status: "NOT_APPLICABLE", reasonCodes: ["ASSUMPTIONS_OUTSIDE_FEATURE_DATA_ADAPTER"] },
        orderLevelAllocation: { status: "UNAVAILABLE", reasonCodes: ["SHOPIFY_ORDER_LEVEL_ALLOCATION_NOT_EXPOSED"] },
      }, provenance: { fingerprints: [], references: [] } };
  } catch (error) {
    return { ...identity, status: "BLOCKED", reasonCodes: [error instanceof Error ? error.message :
      "SHOPIFY_FEATURE_ADAPTER_FAILURE"] };
  }
}
