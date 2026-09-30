import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { LoaderData } from "../../app/utils/margin";
import type { FeatureData, FeatureOptionalMoney } from "../../app/features/feature-data-contract";
import { adaptShopifyLoaderDataToFeatureData } from "../../app/features/shopify-feature-data-adapter";
import { loadAmazonFeatureDataTx } from "../../app/features/amazon-feature-data-adapter.server";
import { buildForecastingModel, type ForecastingAssumptions, type ForecastingScenario } from
  "../../app/features/forecasting-model";

const money = (amountAtoms: bigint, amountScale = 2, currencyCode = "EUR"): FeatureOptionalMoney =>
  ({ status: "AVAILABLE", value: { amountAtoms, amountScale, currencyCode } });
const unavailable = (reasonCode: string): FeatureOptionalMoney => ({ status: "UNAVAILABLE", reasonCodes: [reasonCode] });
const rate = (numerator: bigint, denominator = 1n) => ({ status: "AVAILABLE" as const,
  value: { numerator, denominator } });
const period = { startInclusive: new Date("2026-09-01T00:00:00Z"),
  endExclusive: new Date("2026-10-01T00:00:00Z") };
const zeroAssumptions: ForecastingAssumptions = {
  monthlyAdvertising: money(0n), monthlyShipping: money(0n), monthlyOperating: money(0n),
  additionalPaymentFeeRate: rate(0n), additionalTransactionFeeRate: rate(0n),
  managerialTaxReserveRate: rate(0n), recoveryOpportunity: unavailable("RECOVERY_UNAVAILABLE"),
};
const flatScenario: ForecastingScenario = { monthlyRevenueGrowthRate: { numerator: 0n, denominator: 1n },
  marginImprovementRate: { numerator: 0n, denominator: 1n },
  monthlyFixedCostGrowthRate: { numerator: 0n, denominator: 1n },
  recoveryCaptureRate: { numerator: 0n, denominator: 1n }, outputScale: 2 };

const shopifyLoader = { currencyCode: "EUR", summary: { revenue: 100, cogs: 35, profit: 65,
  economicRevenue: 100, economicCogs: 35, economicProfit: 65, discounts: 0, refunds: 0,
  shipping: 0, taxes: 0, previousRevenue: 0 }, rows: [], trend: [],
  analysisContext: { dataCompleteness: { currentPeriodComplete: true, previousPeriodComplete: true,
    truncatedConnections: [] } } } as unknown as LoaderData;
const shopifyFeature = adaptShopifyLoaderDataToFeatureData({ data: shopifyLoader, accountId: "shopify-account",
  channelConnectionId: "shopify-connection", currentPeriod: period, previousPeriod: null });
assert.equal(shopifyFeature.status, "READY");

const amazonContractFixture: FeatureData = { status: "READY", accountId: "amazon-account",
  channelConnectionId: "amazon-connection", source: { channel: "AMAZON", sourceSystem: "DATA_CORE_D2D",
    adapterVersion: "amazon-canonical-d2d-v1" }, currencyCode: "EUR", current: { period, summary: {
      revenue: money(10000n), fees: money(-1800n), cogs: money(3500n), tax: money(0n),
      profit: money(4700n), otherContribution: money(0n), discounts: unavailable("NOT_SEPARATED"),
      refunds: unavailable("NOT_AVAILABLE"), shippingRevenue: unavailable("NOT_SEPARATED"),
    }, products: [], trend: [] }, previous: null, completeness: { status: "COMPLETE", reasonCodes: [] },
  capabilities: { productEconomics: { status: "AVAILABLE" }, trend: { status: "UNAVAILABLE", reasonCodes: ["NO_RULE"] },
    periodComparison: { status: "UNAVAILABLE", reasonCodes: ["NO_PREVIOUS"] }, fees: { status: "AVAILABLE" },
    tax: { status: "AVAILABLE" }, refunds: { status: "UNAVAILABLE", reasonCodes: ["NOT_AVAILABLE"] },
    assumptions: { status: "NOT_APPLICABLE" }, orderLevelAllocation: { status: "UNAVAILABLE", reasonCodes: ["NO_ALLOCATION"] } },
  provenance: { fingerprints: ["fa1c-deterministic-fingerprint"], references: [{ kind: "NORMALIZED_ORDER", id: "order-1" }] } };

const amazonOrder = { id: "order-1", marketplaceId: "market-1", revisionId: "order-revision-1", revision: 1,
  inputChecksum: "order-checksum", mappingVersionId: "mapping-1", occurredAt: period.startInclusive,
  postedAt: period.startInclusive };
const amazonItem = { id: "item-1", orderId: amazonOrder.id, revisionId: "item-revision-1", revision: 1,
  inputChecksum: "item-checksum", mappingVersionId: "mapping-1", skuId: "sku-1", quantityAtoms: 1n,
  quantityScale: 0 };
const financialComponents = [
  { id: "revenue-1", orderId: amazonOrder.id, itemId: null, projectionKind: "PRODUCT_REVENUE",
    economicRole: "ECONOMIC", amountAtoms: 100n, amountScale: 0, currencyCode: "EUR" },
  { id: "fee-1", orderId: amazonOrder.id, itemId: null, projectionKind: "MARKETPLACE_COMMISSION",
    economicRole: "ECONOMIC", amountAtoms: -18n, amountScale: 0, currencyCode: "EUR" },
] as never;
const canonicalDataset = (scope: { kind: string; orderId?: string }) => ({ status: "READY", contractVersion:
  "D2D_CANONICAL_ECONOMIC_DATASET_V1", requestedScope: scope, economicWindow: period,
  currency: { mode: "SINGLE_CURRENCY", currencyCode: "EUR" },
  currencyPolicy: { id: "policy-1", version: "fixture", checksum: "fixture" },
  commerce: { orders: [amazonOrder], items: [amazonItem] }, financialComponents,
  cogs: [{ lotId: "lot-1", orderId: amazonOrder.id, itemId: amazonItem.id, skuId: "sku-1",
    originKind: "SALE_RECOGNITION", quantityAtoms: 1n, quantityScale: 0, unitCostAtoms: 35n,
    unitCostScale: 0, currencyCode: "EUR", recognitionEconomicAt: period.startInclusive,
    costRecordRevisionId: "cost-1", costEvidenceEventId: null, inputChecksum: "lot-checksum" }],
  inventoryEvents: [], reimbursementLinks: [], replacements: [], taxEvidence: [], completeness: "COMPLETE",
  evidenceManifest: {}, fingerprint: "fa1c-deterministic-fingerprint" });
const fakeTx = { currencyPolicyVersion: { findFirst: async () => ({ id: "policy-1" }) },
  sku: { findMany: async () => [{ id: "sku-1", productId: "product-1", product: { title: "Canonical Widget" } }] } };
const amazonFeature = await loadAmazonFeatureDataTx(fakeTx as never, { accountId: "amazon-account",
  channelConnectionId: "amazon-connection", currentPeriod: period, previousPeriod: null,
  readCanonical: (async (_tx: unknown, request: { scope: { kind: string; orderId?: string } }) =>
    canonicalDataset(request.scope)) as never });
assert.equal(amazonFeature.status, "READY");
assert.equal(amazonContractFixture.status, amazonFeature.status);

const shopifyAssumptions: ForecastingAssumptions = { ...zeroAssumptions,
  monthlyAdvertising: money(1000n), additionalPaymentFeeRate: rate(2n, 100n),
  managerialTaxReserveRate: rate(10n, 100n), recoveryOpportunity: money(2000n) };
const shopify = buildForecastingModel({ data: shopifyFeature, assumptions: shopifyAssumptions,
  scenario: flatScenario, horizonMonths: 2 });
assert.equal(shopify.status, "READY"); if (shopify.status !== "READY") throw new Error("Shopify forecast expected READY");
assert.deepEqual(shopify.baseline.monthlyRevenue, { amountAtoms: 10000n, amountScale: 2, currencyCode: "EUR" });
assert.deepEqual(shopify.baseline.monthlyFixedCosts, { amountAtoms: 1000n, amountScale: 2, currencyCode: "EUR" });
assert.deepEqual(shopify.baseline.monthlyAdditionalVariableFees,
  { amountAtoms: 200n, amountScale: 2, currencyCode: "EUR" });
assert.deepEqual(shopify.baseline.monthlyManagerialTaxReserve,
  { amountAtoms: 530n, amountScale: 2, currencyCode: "EUR" });
assert.deepEqual(shopify.baseline.monthlyNetProfit, { amountAtoms: 4770n, amountScale: 2, currencyCode: "EUR" });
assert.deepEqual(shopify.points[1].cumulativeNetProfit,
  { amountAtoms: 9540n, amountScale: 2, currencyCode: "EUR" });

const amazon = buildForecastingModel({ data: amazonFeature, assumptions: zeroAssumptions,
  scenario: flatScenario, horizonMonths: 3 });
assert.equal(amazon.status, "READY"); if (amazon.status !== "READY") throw new Error("Amazon forecast expected READY");
assert.deepEqual(amazon.baseline.sourceRevenue, { amountAtoms: 100n, amountScale: 0, currencyCode: "EUR" });
assert.deepEqual(amazon.baseline.sourceCogs, { amountAtoms: 35n, amountScale: 0, currencyCode: "EUR" });
assert.deepEqual(amazon.baseline.sourceFees, money(-18n, 0));
assert.deepEqual(amazon.baseline.sourceCanonicalProfit, { amountAtoms: 47n, amountScale: 0, currencyCode: "EUR" });
assert.deepEqual(amazon.baseline.monthlyAdditionalVariableFees,
  { amountAtoms: 0n, amountScale: 2, currencyCode: "EUR" });
assert.deepEqual(amazon.baseline.monthlyNetProfit, { amountAtoms: 4700n, amountScale: 2, currencyCode: "EUR" });
assert.deepEqual(amazon.points[2].cumulativeRevenue, { amountAtoms: 30000n, amountScale: 2, currencyCode: "EUR" });
assert.deepEqual(amazon.points[2].cumulativeNetProfit, { amountAtoms: 14100n, amountScale: 2, currencyCode: "EUR" });
assert(amazon.points.every((point) => point.additionalVariableFees.amountAtoms === 0n));

const blocked = buildForecastingModel({ data: { status: "BLOCKED", accountId: "a", channelConnectionId: "c",
  source: { channel: "ANY", sourceSystem: "TEST", adapterVersion: "1" }, reasonCodes: ["UNKNOWN_COST"] },
  assumptions: zeroAssumptions, scenario: flatScenario, horizonMonths: 1 });
assert.equal(blocked.status, "BLOCKED");
const expectUnavailable = (result: ReturnType<typeof buildForecastingModel>, reason: string) => {
  assert.equal(result.status, "UNAVAILABLE");
  if (result.status === "UNAVAILABLE") assert(result.reasonCodes.some((value) => value.includes(reason)), result.reasonCodes.join(","));
};
const mutate = (data: FeatureData, field: "revenue" | "profit", value: FeatureOptionalMoney): FeatureData => {
  if (data.status !== "READY") return data;
  return { ...data, current: { ...data.current, summary: { ...data.current.summary, [field]: value } } };
};
expectUnavailable(buildForecastingModel({ data: mutate(amazonFeature, "revenue", unavailable("MISSING")),
  assumptions: zeroAssumptions, scenario: flatScenario, horizonMonths: 1 }), "REVENUE_UNAVAILABLE");
expectUnavailable(buildForecastingModel({ data: mutate(amazonFeature, "profit", unavailable("MISSING")),
  assumptions: zeroAssumptions, scenario: flatScenario, horizonMonths: 1 }), "PROFIT_UNAVAILABLE");
expectUnavailable(buildForecastingModel({ data: amazonFeature, assumptions: { ...zeroAssumptions,
  monthlyAdvertising: unavailable("MISSING") }, scenario: flatScenario, horizonMonths: 1 }), "MONTHLY_ADVERTISING_UNAVAILABLE");
expectUnavailable(buildForecastingModel({ data: amazonFeature, assumptions: { ...zeroAssumptions,
  monthlyAdvertising: money(0n, 2, "USD") }, scenario: flatScenario, horizonMonths: 1 }), "CURRENCY_MISMATCH");
expectUnavailable(buildForecastingModel({ data: amazonFeature, assumptions: zeroAssumptions,
  scenario: { ...flatScenario, monthlyRevenueGrowthRate: { numerator: 1n, denominator: 0n } }, horizonMonths: 1 }),
  "denominator");
expectUnavailable(buildForecastingModel({ data: amazonFeature, assumptions: zeroAssumptions,
  scenario: flatScenario, horizonMonths: 0 }), "INVALID_FORECAST_HORIZON");
expectUnavailable(buildForecastingModel({ data: amazonFeature, assumptions: zeroAssumptions,
  scenario: { ...flatScenario, outputScale: 13 }, horizonMonths: 1 }), "INVALID_FORECAST_OUTPUT_SCALE");
const invalidPeriod = amazonFeature.status === "READY" ? { ...amazonFeature, current: { ...amazonFeature.current,
  period: { startInclusive: period.startInclusive, endExclusive: period.startInclusive } } } : amazonFeature;
expectUnavailable(buildForecastingModel({ data: invalidPeriod, assumptions: zeroAssumptions,
  scenario: flatScenario, horizonMonths: 1 }), "INVALID_FORECAST_PERIOD_LENGTH");
expectUnavailable(buildForecastingModel({ data: amazonFeature, assumptions: zeroAssumptions,
  scenario: { ...flatScenario, recoveryCaptureRate: { numerator: 1n, denominator: 2n } }, horizonMonths: 1 }),
  "RECOVERY_OPPORTUNITY_UNAVAILABLE");

const huge = 9007199254740993123456789n;
const hugeFeature = mutate(amazonFeature, "revenue", money(huge));
const hugeProfit = mutate(hugeFeature, "profit", money(huge));
const hugeResult = buildForecastingModel({ data: hugeProfit, assumptions: zeroAssumptions,
  scenario: flatScenario, horizonMonths: 1 });
assert.equal(hugeResult.status, "READY"); if (hugeResult.status === "READY")
  assert.equal(typeof hugeResult.points[0].revenue.amountAtoms, "bigint");

const source = readFileSync("app/features/forecasting-model.ts", "utf8");
assert(!source.includes('"AMAZON"')); assert(!source.includes('"SHOPIFY"'));
assert(!source.includes("source.channel")); assert(!/switch\s*\([^)]*channel/.test(source));
console.log("FA2B shared exact multichannel forecasting model: PASS");
