import assert from "node:assert/strict";

import { buildMarginAssessment } from "~/utils/margin-decision-engine";
import { loadMarginDashboardData } from "~/utils/margin.server";
import { generateProfitAlerts } from "~/utils/profit-monitor";
import { comprehensiveScenario, createAdmin, fallbackTaxScenario } from "./fixtures";
import { comprehensiveGolden } from "./golden";

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
