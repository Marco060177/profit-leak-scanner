import assert from "node:assert/strict";
import type { LoaderData, Row } from "../../app/utils/margin";
import { adaptShopifyLoaderDataToFeatureData, shopifyNumberToFeatureMoney } from
  "../../app/features/shopify-feature-data-adapter";

const row: Row = {
  productId: "101", productTitle: "Widget", qty: 4, revenue: 100.25, cogs: 29, discounts: 5.5,
  refunds: 0, profit: 71.25, marginPct: 71.072319, previousMarginPct: 60, productMarginDelta: 11.072319,
  losing: false, lowMargin: false, avgPrice: 25.0625, avgCost: 7.25, breakEvenPrice: 7.25,
  targetPrice: 9.0625, targetDelta: -16, suggestion: "Stable", missingCost: false,
  orderedQuantity: 4, refundedQuantity: 0, netQuantity: 4, grossProductSales: 105.75,
  netProductSales: 100.25, refundedProductRevenue: 0, salesTaxes: 20.05,
  netProductRevenue: 100.25, productCogs: 29, grossProfit: 71.25, grossMarginPct: 71.072319,
  discountRatePct: 5.2, refundRatePct: 0, economicRevenue: 100.25, economicCogs: 29,
  economicProfit: 71.25, economicMarginPct: 71.072319,
};
const summary: LoaderData["summary"] = {
  revenue: 100.25, cogs: 29, profit: 71.25, marginPct: 71.072319, discounts: 5.5, shipping: 3,
  taxes: 20.05, refunds: 0, netRevenue: 100.25, contributionProfit: 74.25, contributionMarginPct: 71,
  totalLeak: 0, losingCount: 0, missingCostCount: 0, previousMarginPct: 60, marginDelta: 11.072319,
  previousRevenue: 80.1, revenueDeltaPct: 25.156, economicRevenue: 100.25, economicCogs: 29,
  economicProfit: 71.25, economicMarginPct: 71.072319,
};
const data: LoaderData = {
  summary, rows: [row], marginDeterioration: [], trend: [{ date: "2026-09-10", revenue: 100.25,
    profit: 71.25, discounts: 5.5, refundedProductRevenue: 0, netProductRevenue: 100.25,
    shippingRevenue: 3, productCogs: 29, grossProfit: 71.25 }], billingActive: true,
  period: "30", shopHandle: "fixture", currencyCode: "EUR", timeZone: "Europe/Rome",
  analysisContext: { requestedDays: 30, current: { orderCount: 1, productCount: 1, orderedQuantity: 4,
    netQuantity: 4, activeDays: 1, firstOrderAt: "2026-09-10T10:00:00Z",
    lastOrderAt: "2026-09-10T10:00:00Z", hasSales: true }, previous: { orderCount: 1,
    productCount: 1, orderedQuantity: 2, netQuantity: 2, activeDays: 1,
    firstOrderAt: "2026-08-10T10:00:00Z", lastOrderAt: "2026-08-10T10:00:00Z", hasSales: true },
    comparisonAvailable: true, dataCompleteness: { currentPeriodComplete: true,
      previousPeriodComplete: true, truncatedConnections: [] } },
};
const currentPeriod = { startInclusive: new Date("2026-09-01T00:00:00Z"),
  endExclusive: new Date("2026-10-01T00:00:00Z") };
const previousPeriod = { startInclusive: new Date("2026-08-01T00:00:00Z"),
  endExclusive: new Date("2026-09-01T00:00:00Z") };

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Shopify adapter must not fetch"); };
try {
  const result = adaptShopifyLoaderDataToFeatureData({ data, accountId: "account-1",
    channelConnectionId: "shopify-1", currentPeriod, previousPeriod });
  assert.equal(result.status, "READY"); if (result.status !== "READY") throw new Error("READY expected");
  assert.equal(result.accountId, "account-1"); assert.equal(result.channelConnectionId, "shopify-1");
  assert.equal(result.currencyCode, "EUR"); assert.deepEqual(result.current.period, currentPeriod);
  assert.deepEqual(result.previous?.period, previousPeriod);
  assert.deepEqual(result.current.summary.revenue,
    { status: "AVAILABLE", value: { amountAtoms: 10025n, amountScale: 2, currencyCode: "EUR" } });
  assert.deepEqual(result.current.summary.cogs,
    { status: "AVAILABLE", value: { amountAtoms: 29n, amountScale: 0, currencyCode: "EUR" } });
  assert.deepEqual(result.current.summary.profit,
    { status: "AVAILABLE", value: { amountAtoms: 7125n, amountScale: 2, currencyCode: "EUR" } });
  const product = result.current.products[0];
  assert.equal(product.productId, "101"); assert.equal(product.title, "Widget");
  assert.deepEqual(product.quantity, { quantityAtoms: 4n, quantityScale: 0 });
  assert.deepEqual(product.revenue, result.current.summary.revenue);
  assert.deepEqual(result.current.trend[0].economics.revenue, result.current.summary.revenue);
  assert.deepEqual(result.previous?.summary.revenue,
    { status: "AVAILABLE", value: { amountAtoms: 801n, amountScale: 1, currencyCode: "EUR" } });

  const missingData: LoaderData = { ...data, rows: [{ ...row, productId: "102", missingCost: true,
    cogs: 0, profit: 100.25, economicCogs: undefined, economicProfit: undefined }] };
  const missing = adaptShopifyLoaderDataToFeatureData({ data: missingData, accountId: "account-1",
    channelConnectionId: "shopify-1", currentPeriod, previousPeriod });
  assert.equal(missing.status, "READY"); if (missing.status !== "READY") throw new Error("READY expected");
  assert.equal(missing.completeness.status, "DEGRADED"); assert(missing.completeness.reasonCodes.includes("MISSING_COST"));
  assert.deepEqual(missing.current.products[0].cogs, { status: "UNAVAILABLE", reasonCodes: ["MISSING_COST"] });
  assert.deepEqual(missing.current.products[0].profit, { status: "UNAVAILABLE", reasonCodes: ["MISSING_COST"] });

  const invalid = adaptShopifyLoaderDataToFeatureData({ data: { ...data,
    summary: { ...summary, economicRevenue: Number.NaN } }, accountId: "account-1",
    channelConnectionId: "shopify-1", currentPeriod, previousPeriod });
  assert.equal(invalid.status, "BLOCKED"); if (invalid.status !== "BLOCKED") throw new Error("BLOCKED expected");
  assert(invalid.reasonCodes.includes("SHOPIFY_NON_FINITE_COMPATIBILITY_VALUE"));
  assert.throws(() => shopifyNumberToFeatureMoney(0.30000000000000004, "EUR"),
    /EXCEEDS_EXACT_SCALE/);
} finally { globalThis.fetch = originalFetch; }

console.log("FA1B Shopify FeatureData compatibility adapter: PASS");
