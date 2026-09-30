import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { LoaderData } from "../../app/utils/margin";
import type { FeatureData, FeatureMoney, FeatureOptionalMoney, FeatureSummaryEconomics } from
  "../../app/features/feature-data-contract";
import { adaptShopifyLoaderDataToFeatureData } from "../../app/features/shopify-feature-data-adapter";
import { buildProfitIntelligenceModel } from "../../app/features/profit-intelligence-model";

const value = (amountAtoms: bigint, amountScale = 0): FeatureOptionalMoney => ({ status: "AVAILABLE",
  value: { amountAtoms, amountScale, currencyCode: "EUR" } });
const unavailable = (reasonCode: string): FeatureOptionalMoney => ({ status: "UNAVAILABLE", reasonCodes: [reasonCode] });
const currentPeriod = { startInclusive: new Date("2026-09-01T00:00:00Z"),
  endExclusive: new Date("2026-10-01T00:00:00Z") };
const previousPeriod = { startInclusive: new Date("2026-08-01T00:00:00Z"),
  endExclusive: new Date("2026-09-01T00:00:00Z") };

const shopifyLoader = {
  currencyCode: "EUR",
  summary: { revenue: 100, cogs: 35, profit: 65, marginPct: 65, discounts: 10, refunds: 5,
    shipping: 5, taxes: 20, previousRevenue: 80, economicRevenue: 100, economicCogs: 35,
    economicProfit: 65 },
  rows: [{ productId: "shopify-product-1", productTitle: "Shared Widget", qty: 1, revenue: 100,
    cogs: 35, profit: 65, marginPct: 65, discounts: 10, refunds: 5, missingCost: false,
    economicRevenue: 100, economicCogs: 35, economicProfit: 65, salesTaxes: 20 }],
  trend: [{ date: "2026-09-01", revenue: 80, profit: 40 },
    { date: "2026-09-30", revenue: 100, profit: 65 }],
  analysisContext: { dataCompleteness: { currentPeriodComplete: true, previousPeriodComplete: true,
    truncatedConnections: [] } },
} as unknown as LoaderData;
const shopifyFeature = adaptShopifyLoaderDataToFeatureData({ data: shopifyLoader, accountId: "account-shopify",
  channelConnectionId: "connection-shopify", currentPeriod, previousPeriod });
assert.equal(shopifyFeature.status, "READY");

const amazonSummary: FeatureSummaryEconomics = {
  revenue: value(100n), fees: value(-18n), cogs: value(35n), tax: value(0n), profit: value(47n),
  otherContribution: value(0n), discounts: unavailable("AMAZON_DISCOUNTS_NOT_SEPARATED"),
  refunds: unavailable("AMAZON_REFUNDS_UNAVAILABLE"), shippingRevenue: unavailable("AMAZON_SHIPPING_UNAVAILABLE"),
};
const amazonFeature: FeatureData = {
  status: "READY", accountId: "account-amazon", channelConnectionId: "connection-amazon",
  source: { channel: "AMAZON", sourceSystem: "DATA_CORE_D2D", adapterVersion: "amazon-canonical-d2d-v1" },
  currencyCode: "EUR", current: { period: currentPeriod, summary: amazonSummary, trend: [], products: [{
    productId: "product-1", skuId: "sku-1", title: "Canonical Widget",
    quantity: { quantityAtoms: 1n, quantityScale: 0 }, revenue: unavailable("PRODUCT_REVENUE_NOT_ALLOCATED"),
    cogs: value(35n), profit: unavailable("PRODUCT_PROFIT_NOT_ALLOCATED"),
    discounts: unavailable("PRODUCT_DISCOUNTS_NOT_ALLOCATED"), refunds: unavailable("PRODUCT_REFUNDS_NOT_ALLOCATED"),
    fees: unavailable("ORDER_FEES_NOT_ALLOCATED"), tax: unavailable("PRODUCT_TAX_NOT_ALLOCATED"),
  }] }, previous: null, completeness: { status: "COMPLETE", reasonCodes: [] }, capabilities: {
    productEconomics: { status: "AVAILABLE" }, trend: { status: "UNAVAILABLE",
      reasonCodes: ["AMAZON_CANONICAL_TREND_TIMESTAMP_RULE_UNDEFINED"] },
    periodComparison: { status: "UNAVAILABLE", reasonCodes: ["PREVIOUS_PERIOD_NOT_PROVIDED"] },
    fees: { status: "AVAILABLE" }, tax: { status: "AVAILABLE" },
    refunds: { status: "UNAVAILABLE", reasonCodes: ["AMAZON_REFUNDS_UNAVAILABLE"] },
    assumptions: { status: "NOT_APPLICABLE" }, orderLevelAllocation: { status: "UNAVAILABLE",
      reasonCodes: ["AMAZON_ORDER_LEVEL_ECONOMICS_NOT_ALLOCATED_TO_PRODUCT"] },
  }, provenance: { fingerprints: ["fa1c-deterministic-fingerprint"], references: [
    { kind: "NORMALIZED_ORDER", id: "order-1" }, { kind: "INVENTORY_ECONOMIC_LOT", id: "lot-1" }] },
};

const models = [shopifyFeature, amazonFeature].map(buildProfitIntelligenceModel);
assert(models.every((model) => model.status === "READY"));
const shopify = models[0]; const amazon = models[1];
if (shopify.status !== "READY" || amazon.status !== "READY") throw new Error("shared model expected READY");

assert.deepEqual(shopify.summary.revenue, value(100n));
assert.deepEqual(shopify.summary.cogs, value(35n));
assert.deepEqual(shopify.summary.profit, value(65n));
assert.deepEqual(shopify.store, { status: "AVAILABLE", value: { marginPercentage: 65,
  profitability: "PROFITABLE" } });
assert.equal(shopify.products.status, "AVAILABLE");
assert.deepEqual(shopify.productQuality, { status: "AVAILABLE", value: { losingProducts: 0,
  weakMarginProducts: 0, healthyMarginProducts: 1, level: "HEALTHY" } });
assert.deepEqual(shopify.revenueConcentration, { status: "AVAILABLE", value: { topProductPercentage: 100,
  top3Percentage: 100, top5Percentage: 100, dependencyLevel: "HIGH" } });
assert.equal(shopify.periodComparison.status, "AVAILABLE");
if (shopify.periodComparison.status === "AVAILABLE") {
  assert.deepEqual(shopify.periodComparison.value.revenueChange,
    { amountAtoms: 20n, amountScale: 0, currencyCode: "EUR" });
  assert.equal(shopify.periodComparison.value.revenueChangePercentage, 25);
}
assert.equal(shopify.trendMovement.status, "AVAILABLE");

assert.deepEqual(amazon.summary.revenue, value(100n));
assert.deepEqual(amazon.summary.fees, value(-18n));
assert.deepEqual(amazon.summary.cogs, value(35n));
assert.deepEqual(amazon.summary.profit, value(47n));
assert.deepEqual(amazon.store, { status: "AVAILABLE", value: { marginPercentage: 47,
  profitability: "PROFITABLE" } });
assert.equal(amazon.products.status, "AVAILABLE");
assert.deepEqual(amazon.productQuality, { status: "UNAVAILABLE",
  reasonCodes: ["PRODUCT_QUALITY_ECONOMICS_UNAVAILABLE"] });
if (amazon.products.status === "AVAILABLE") {
  assert.equal(amazon.products.value[0].productId, "product-1");
  assert.equal(amazon.products.value[0].skuId, "sku-1");
  assert.equal(amazon.products.value[0].title, "Canonical Widget");
  assert.equal(amazon.products.value[0].profit.status, "UNAVAILABLE");
  assert.equal(amazon.products.value[0].marginPercentage.status, "UNAVAILABLE");
}
assert.equal(amazon.revenueConcentration.status, "UNAVAILABLE");
assert.equal(amazon.trendMovement.status, "UNAVAILABLE");
if (amazon.trendMovement.status === "UNAVAILABLE")
  assert.deepEqual(amazon.trendMovement.reasonCodes, ["AMAZON_CANONICAL_TREND_TIMESTAMP_RULE_UNDEFINED"]);
assert.equal(amazon.businessDrivers.status, "UNAVAILABLE");
assert.equal(typeof (amazon.summary.profit as { status: "AVAILABLE"; value: FeatureMoney }).value.amountAtoms, "bigint");

const blocked = buildProfitIntelligenceModel({ status: "BLOCKED", accountId: "blocked-account",
  channelConnectionId: "blocked-connection", source: { channel: "CHANNEL", sourceSystem: "SYSTEM",
    adapterVersion: "v1" }, reasonCodes: ["UNKNOWN_COST"] });
assert.deepEqual(blocked, { status: "BLOCKED", accountId: "blocked-account",
  channelConnectionId: "blocked-connection", source: { channel: "CHANNEL", sourceSystem: "SYSTEM",
    adapterVersion: "v1" }, reasonCodes: ["UNKNOWN_COST"] });

const source = readFileSync("app/features/profit-intelligence-model.ts", "utf8");
assert(!source.includes('"AMAZON"')); assert(!source.includes('"SHOPIFY"'));
assert(!source.includes("source.channel"));
console.log("FA1D shared multichannel Profit Intelligence model: PASS");
