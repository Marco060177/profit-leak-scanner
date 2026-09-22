import assert from "node:assert/strict";

import {
  buildCanonicalProfitResult,
  CANONICAL_PROFIT_RESULT_VERSION,
  PROFIT_FORMULA_VERSION,
} from "~/core/canonical-profit-result";
import {
  LEGACY_MARGIN_PROJECTION_VERSION,
  projectLegacyMarginV1,
} from "~/core/legacy-margin-projection";
import { mapShopifyOrdersToNormalizedPeriod } from "~/connectors/shopify/shopify-margin-mapper";
import { calculateProductEconomics, calculateProfitEngine } from "~/core/profit-engine";
import { buildMarginAssessment } from "~/utils/margin-decision-engine";
import { loadMarginDashboardData } from "~/utils/margin.server";
import { generateProfitAlerts } from "~/utils/profit-monitor";
import { comprehensiveScenario, createAdmin, fallbackTaxScenario, lineItem, order } from "./fixtures";
import { comprehensiveGolden } from "./golden";
import { getStoreTaxContext } from "./tax-profile.stub";

const billing = { active: true, plan: "GROWTH" as const, subscriptionName: "Growth" };
const session = { shop: "characterization.myshopify.com" } as never;
const closeTo = (actual: number, expected: number, message?: string) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? "value"}: expected ${expected}, received ${actual}`);

const { admin, documents, queries } = createAdmin(comprehensiveScenario);
const data = await loadMarginDashboardData({
  admin: admin as never,
  session,
  period: "30",
  locale: "en-US",
  billingStatus: billing,
  analysisEndDate: "2026-08-31",
});

// The test loader counts only calls made by the live margin.server facade.
const boundaryCalls = globalThis as typeof globalThis & {
  __profitEngineCalls?: number;
  __canonicalBuildCalls?: number;
  __legacyProjectionCalls?: number;
};
assert.equal(boundaryCalls.__profitEngineCalls, 1);
assert.equal(boundaryCalls.__canonicalBuildCalls, 1);
assert.equal(boundaryCalls.__legacyProjectionCalls, 1);

const normalizedDataset = {
  current: mapShopifyOrdersToNormalizedPeriod(comprehensiveScenario.currentPages.flat() as never),
  previous: mapShopifyOrdersToNormalizedPeriod(comprehensiveScenario.previousPages.flat() as never),
};
const canonical = buildCanonicalProfitResult({
  dataset: normalizedDataset,
  currencyCode: data.currencyCode,
  requestedDays: 30,
  currentPeriodStart: "2026-08-01",
  currentPeriodEndExclusive: "2026-08-31",
  previousPeriodStart: "2026-07-02",
  grossProfit: data.summary.profit,
  grossMarginPct: data.summary.marginPct,
  legacyShippingContribution: data.summary.contributionProfit,
  legacyShippingContributionMarginPct: data.summary.contributionMarginPct,
  revenueCoveragePct: data.summary.revenueCoveragePct ?? 0,
  tax: {
    source: data.taxTreatment?.source ?? "insufficient_data",
    reportedTax: data.summary.taxes,
    netCollectedTax: data.taxAwarePeriod?.netCollectedTax ?? 0,
    economicRevenue: data.summary.economicRevenue ?? 0,
    economicCogs: data.summary.economicCogs ?? 0,
    economicProfit: data.summary.economicProfit ?? 0,
    economicMarginPct: data.summary.economicMarginPct ?? 0,
  },
});
assert.equal(canonical.version, CANONICAL_PROFIT_RESULT_VERSION);
assert.equal(canonical.formulaVersion, PROFIT_FORMULA_VERSION);
assert.deepEqual(
  { source: canonical.scope.sourceCurrencyCode, reporting: canonical.scope.reportingCurrencyCode },
  { source: "EUR", reporting: "EUR" },
);
assert.equal(LEGACY_MARGIN_PROJECTION_VERSION, 1);
assert.deepEqual(canonical.components, {
  grossProductSales: 295,
  discounts: -20,
  productRefunds: -150,
  productCogs: -45,
  shippingRevenue: 15,
});
assert.equal(
  canonical.components.grossProductSales +
    canonical.components.discounts +
    canonical.components.productRefunds,
  canonical.totals.netSales,
);
assert.equal(canonical.totals.marketplaceContribution, null);
assert.equal(canonical.totals.fulfillmentContribution, null);
assert.equal(canonical.totals.acquisitionContribution, null);
assert.equal(canonical.totals.fullyLoadedResult, null);
assert.equal(canonical.unknownAmount, null);
assert.equal(canonical.roundingResidual, null);
assert.equal(canonical.quality, "DEGRADED");
assert.equal(canonical.reconciliation, "NOT_ATTEMPTED");
const sidecar = { ...data };
delete sidecar.economicSnapshot;
assert.deepEqual(projectLegacyMarginV1(canonical, sidecar), data);
assert.deepEqual(projectLegacyMarginV1(canonical, sidecar), projectLegacyMarginV1(canonical, sidecar));

const directTaxContext = await getStoreTaxContext({ shop: "engine-test.myshopify.com", shopCountryCode: "US" });
const directProductRows = Object.entries(normalizedDataset.current.byProduct).map(([key, product]) =>
  calculateProductEconomics({ product, previousProduct: normalizedDataset.previous.byProduct[key], taxContext: directTaxContext }),
);
const directEngineResult = calculateProfitEngine({
  dataset: normalizedDataset,
  productRows: directProductRows,
  taxContext: directTaxContext,
  currencyCode: "EUR",
  requestedDays: 30,
  currentPeriodStart: "2026-08-01",
  currentPeriodEndExclusive: "2026-08-31",
  previousPeriodStart: "2026-07-02",
});
assert.deepEqual(directEngineResult.components, canonical.components);
assert.deepEqual(directEngineResult.totals, canonical.totals);
assert.deepEqual(directEngineResult.tax, canonical.tax);
assert.deepEqual(directEngineResult.trend, data.trend);
assert.equal(directEngineResult.taxTreatment.source, "shopify_actual_tax");
assert.equal(directEngineResult.legacyMetrics.previousRevenue, 100);
assert.equal(directEngineResult.quality, "DEGRADED");
assert.equal(directEngineResult.reconciliation, "NOT_ATTEMPTED");

const simpleProductLine = lineItem({ id: "engine-1", productId: "engine-product", original: 100, cost: 20 });
const simpleDataset = {
  current: mapShopifyOrdersToNormalizedPeriod([
    order({ id: "engine-order", processedAt: "2026-08-12T10:00:00Z", lines: [simpleProductLine] }),
  ] as never),
  previous: mapShopifyOrdersToNormalizedPeriod([]),
};
const simpleProduct = Object.values(simpleDataset.current.byProduct)[0];
const simpleEngine = calculateProfitEngine({
  dataset: simpleDataset,
  productRows: [calculateProductEconomics({ product: simpleProduct, taxContext: directTaxContext })],
  taxContext: directTaxContext,
  currencyCode: "USD",
  requestedDays: 30,
  currentPeriodStart: "2026-08-01",
  currentPeriodEndExclusive: "2026-08-31",
  previousPeriodStart: "2026-07-02",
});
assert.deepEqual(simpleEngine.components, {
  grossProductSales: 100,
  discounts: -0,
  productRefunds: -0,
  productCogs: -20,
  shippingRevenue: 0,
});
assert.equal(simpleEngine.totals.netSales, 100);
assert.equal(simpleEngine.totals.grossProfit, 80);
assert.equal(simpleEngine.taxTreatment.source, "shopify_zero_tax");
assert.equal(simpleEngine.legacyMetrics.previousRevenue, 0);
assert.equal(simpleEngine.legacyMetrics.revenueDeltaPct, 0);
assert.equal(simpleEngine.quality, "PROVISIONAL");
assert.equal(simpleEngine.totals.marketplaceContribution, null);
assert.equal(simpleEngine.mappingVersions, null);
assert.equal(
  projectLegacyMarginV1(
    { ...canonical, totals: { ...canonical.totals, netSales: 999 } },
    sidecar,
  ).summary.revenue,
  999,
  "the legacy projection must obtain economic revenue from the canonical result",
);

assert.deepEqual(
  Object.fromEntries(Object.keys(comprehensiveGolden.summary).map((key) => [key, data.summary[key as keyof typeof data.summary]])),
  comprehensiveGolden.summary,
  "legacy Summary aliases and economic totals changed",
);
assert.equal(data.currencyCode, "EUR");
assert.equal(data.timeZone, "Europe/Rome");
assert.equal(data.shopHandle, "characterization");
assert.deepEqual(data.rows.map((row) => row.productId), comprehensiveGolden.rowOrder);

const alpha = data.rows.find((row) => row.productId === "1");
assert.ok(alpha);
for (const [key, expected] of Object.entries(comprehensiveGolden.alpha)) {
  closeTo(Number(alpha[key as keyof typeof alpha]), expected, `Alpha.${key}`);
}
closeTo(alpha.marginPct, (50 / 95) * 100, "partial-refund margin");
closeTo(alpha.productMarginDelta ?? 0, (50 / 95) * 100 - 80, "period comparison");

const fullyRefunded = data.rows.find((row) => row.productId === "2");
assert.ok(fullyRefunded);
assert.deepEqual({ qty: fullyRefunded.qty, revenue: fullyRefunded.revenue, cogs: fullyRefunded.cogs, profit: fullyRefunded.profit, missingCost: fullyRefunded.missingCost }, { qty: 0, revenue: 0, cogs: 0, profit: 0, missingCost: true });
const fullyRefundedWithCost = data.rows.find((row) => row.productId === "5");
assert.ok(fullyRefundedWithCost);
assert.deepEqual(
  { qty: fullyRefundedWithCost.qty, revenue: fullyRefundedWithCost.revenue, cogs: fullyRefundedWithCost.cogs, profit: fullyRefundedWithCost.profit },
  { qty: 0, revenue: 0, cogs: 0, profit: 0 },
  "a full refund reverses current Shopify COGS in the order period",
);
const unknownProduct = data.rows.find((row) => row.productTitle === "Unknown product");
assert.ok(unknownProduct);
assert.equal(unknownProduct.productId, "");
assert.equal(unknownProduct.revenue, 0);
assert.equal(data.summary.missingCostRevenue, 30);
closeTo(data.summary.revenueCoveragePct ?? 0, 76, "missing-cost revenue coverage");

assert.deepEqual(
  data.trend.map(({ date, revenue, profit, shippingRevenue, productCogs }) => ({ date, revenue, profit, shippingRevenue, productCogs })),
  comprehensiveGolden.trend,
);
assert.deepEqual(data.analysisContext?.dataCompleteness, comprehensiveGolden.completeness);
assert.equal(data.analysisContext?.current.firstOrderAt, "2026-08-10T10:00:00Z");
assert.equal(data.analysisContext?.current.lastOrderAt, "2026-08-25T10:00:00Z");
assert.equal(data.analysisContext?.comparisonAvailable, true);
assert.deepEqual(
  {
    includedOrders: data.taxAwarePeriod?.taxesIncludedOrderCount,
    excludedOrders: data.taxAwarePeriod?.taxesExcludedOrderCount,
    exemptOrders: data.taxAwarePeriod?.taxExemptOrderCount,
  },
  { includedOrders: 1, excludedOrders: 2, exemptOrders: 1 },
);
assert.equal(data.summary.contributionProfit, data.summary.profit + data.summary.shipping, "shipping revenue increases contribution profit without a carrier-cost deduction");

assert.equal(data.taxTreatment?.source, comprehensiveGolden.tax.source);
closeTo(data.taxAwarePeriod?.includedProductTaxAmount ?? 0, comprehensiveGolden.tax.includedProductTaxAmount);
closeTo(data.taxAwarePeriod?.excludedProductTaxAmount ?? 0, comprehensiveGolden.tax.excludedProductTaxAmount);
closeTo(data.taxAwarePeriod?.refundedTaxAmount ?? 0, comprehensiveGolden.tax.refundedTaxAmount);
closeTo(data.taxAwarePeriod?.shippingTaxAmount ?? 0, comprehensiveGolden.tax.shippingTaxAmount);
closeTo(data.taxAwarePeriod?.netCollectedTax ?? 0, comprehensiveGolden.tax.netCollectedTax, "net collected tax");
closeTo(data.taxAwareEconomics?.netRevenue ?? 0, 116.82, "included tax removed from revenue");
closeTo(data.taxAwareEconomics?.realProfit ?? 0, 71.82, "tax-aware profit");

assert.ok(data.economicSnapshot);
assert.deepEqual(data.economicSnapshot.facts, {
  grossProductSales: 295,
  discounts: 20,
  productRefunds: 150,
  netProductRevenue: 116.82,
  productCogs: 45,
  grossProductProfit: 71.82,
  grossProductMarginPct: 61.47919876733435,
  shippingRevenue: 15,
  reportedTaxes: 22.27,
});
assert.equal(data.economicSnapshot.confidence.usesCurrentShopifyCosts, true);
assert.equal(data.economicSnapshot.confidence.refundBasis, "order_period");
assert.equal(data.economicSnapshot.confidence.sourceDataComplete, false);
assert.ok(data.economicSnapshot.confidence.reasons.includes("CURRENT_SHOPIFY_COSTS_APPLIED_TO_HISTORICAL_SALES"));
assert.ok(data.economicSnapshot.confidence.reasons.includes("CURRENT_PERIOD_SHOPIFY_CONNECTION_TRUNCATED"));
assert.ok(data.economicSnapshot.confidence.reasons.includes("PREVIOUS_PERIOD_SHOPIFY_CONNECTION_TRUNCATED"));

const assessment = buildMarginAssessment({ summary: data.summary, rows: data.rows, trend: data.trend, analysisContext: data.analysisContext });
assert.deepEqual({ status: assessment.economicStatus, observed: assessment.observedStatus, comparison: assessment.comparison.quality, revenue: assessment.facts.revenue, profit: assessment.facts.profit }, { status: "insufficient_data", observed: "incomplete_costs_observed", comparison: "limited", revenue: 125, profit: 80 });
assert.ok(assessment.risks.some((risk) => risk.code === "MISSING_COSTS"));

const alerts = generateProfitAlerts({ summary: data.summary, rows: data.rows, language: "en", period: data.period, currencyCode: data.currencyCode });
assert.deepEqual(alerts.map(({ id, severity, category, route }) => ({ id, severity, category, route })), [
  { id: "missing-product-costs", severity: "critical", category: "data-quality", route: "/app/products" },
  { id: "revenue-up-margin-down", severity: "warning", category: "growth", route: "/app/ai-advisor" },
  { id: "refund-exposure", severity: "warning", category: "refunds", route: "/app/profit-intelligence" },
  { id: "discount-exposure", severity: "info", category: "discounts", route: "/app/profit-intelligence" },
]);

assert.deepEqual(
  [...new Set(queries.map((entry) => entry.q))].sort(),
  ["processed_at:>=2026-07-02 processed_at:<2026-08-01", "processed_at:>=2026-08-01 processed_at:<2026-08-31"],
  "current/previous period boundaries changed",
);
assert.ok(queries.some((entry) => entry.after === "current-1"), "outer Shopify order pagination must continue");
assert.ok(documents.some((query) => query.includes("query MarginLabAppData")));
const ordersDocument = documents.find((query) => query.includes("query MarginLabOrders"));
assert.ok(ordersDocument);
assert.match(ordersDocument, /orders\(\s*first:\s*50/);
assert.match(ordersDocument, /lineItems\(first:\s*150\)/);
assert.match(ordersDocument, /refundLineItems\(first:\s*100\)/);
assert.match(ordersDocument, /shippingLines\(first:\s*10\)/);

const fallback = createAdmin(fallbackTaxScenario);
const fallbackData = await loadMarginDashboardData({
  admin: fallback.admin as never,
  session: { shop: "configured-it.myshopify.com" } as never,
  period: "30",
  billingStatus: billing,
  analysisEndDate: "2026-08-31",
});
assert.equal(fallbackData.taxTreatment?.source, "tax_profile_fallback");
closeTo(fallbackData.taxAwareEconomics?.outputVat ?? 0, 22, "configured included-tax fallback");
closeTo(fallbackData.taxAwareEconomics?.netRevenue ?? 0, 100, "fallback net revenue");
closeTo(fallbackData.taxAwareEconomics?.recoverableInputVat ?? 0, 11, "recoverable input VAT");
closeTo(fallbackData.taxAwareEconomics?.economicCogs ?? 0, 50, "fallback economic COGS");
closeTo(fallbackData.taxAwareEconomics?.realProfit ?? 0, 50, "fallback real profit");

console.log("Shopify margin characterization checks passed.");
