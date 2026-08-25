import assert from "node:assert/strict";
import fs from "node:fs";

import prisma from "~/db.server";
import {
  claimProfitImpactMeasurement,
  createImmutableProfitImpactMeasurement,
  createProfitImpactAction,
  getProfitImpactActionForShop,
  releaseProfitImpactMeasurementClaim,
  startProfitImpactMeasurement,
  transitionProfitImpactAction,
} from "~/services/profit-impact.server";
import {
  calculateAttribution,
  calculateAttributionConfidence,
  calculateMeasuredChanges,
} from "~/services/profit-impact-measurement.server";
import { deleteShopData } from "~/services/shop-data-redaction.server";
import { hasGrowthAccess } from "~/utils/billing.server";
import { translations } from "~/utils/i18n";
import {
  aggregateProfitImpact,
  classifyProfitImpactAction,
} from "~/utils/profit-impact-summary";

const migrationFiles = fs
  .readdirSync("prisma/migrations", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `prisma/migrations/${entry.name}/migration.sql`)
  .filter((file) => fs.existsSync(file))
  .sort();
for (const file of migrationFiles) {
  const migration = fs.readFileSync(file, "utf8");
  for (const statement of migration.split(";").map((part) => part.trim()).filter(Boolean)) {
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("already exists") && !message.includes("duplicate column name")) throw error;
    }
  }
}

const shop = "impact-test.myshopify.com";
const otherShop = "other-impact-test.myshopify.com";
const baseInput = {
  shop,
  actionType: "PRICE_CHANGE" as const,
  sourceModule: "RECOVERY_SIMULATOR" as const,
  productId: "101",
  productTitle: "Test product",
  title: "Raise price",
  changeDescription: "Raise price from 10 to 12",
  currencyCode: "USD",
  previousValue: 10,
  appliedValue: 12,
};

assert.equal(
  hasGrowthAccess({ active: true, plan: "STARTER", subscriptionName: "Starter" }),
  false,
  "Starter must not pass the server-side Growth gate",
);
assert.equal(
  hasGrowthAccess({ active: true, plan: "GROWTH", subscriptionName: "Growth" }),
  true,
  "Growth must pass the server-side gate",
);

const summaryFixture = (status: string, profit: number | null, margin: number | null, attribution: number | null, confidenceLevel = "HIGH") => ({
  status,
  measurements: [{ measurementType: "FINAL_14D", observedDays: 14, revenue: 0, economicProfit: 0, economicMarginPct: 0, units: 0,
    measuredProfitChange: profit, measuredMarginChange: margin, estimatedAttributableImpact: attribution, confidenceLevel,
    dataConfidenceScore: 90, attributionConfidenceScore: 80, attributionMethod: null, confidenceReasonsJson: null }],
});
const aggregate = aggregateProfitImpact([
  summaryFixture("COMPLETED", 10, 2, 6),
  summaryFixture("COMPLETED", 4, 4, null, "LOW"),
  summaryFixture("INVALIDATED", 999, 99, 999),
  summaryFixture("MEASURING", 999, 99, 999),
]);
assert.equal(aggregate.measuredProfitChange, 14);
assert.equal(aggregate.estimatedAttributableProfit, 6, "null attribution must not become zero or enter the sum");
assert.equal(aggregate.averageMarginLift, 3);
assert.equal(aggregate.lowConfidenceCompleted, 1);
assert.equal(classifyProfitImpactAction("ACCEPTED"), "active");
assert.equal(classifyProfitImpactAction("COMPLETED"), "completed");
assert.equal(classifyProfitImpactAction("INVALIDATED"), "attention");

const first = await createProfitImpactAction({
  ...baseInput,
  idempotencyKey: "intent:first",
});
const retry = await createProfitImpactAction({
  ...baseInput,
  idempotencyKey: "intent:first",
});
assert.equal(first.id, retry.id, "retry must return the existing action");
const sourceFirst = await createProfitImpactAction({ ...baseInput, productId: "source-lookup", sourceAlertKey: "alert:stable", idempotencyKey: "source:first" });
const sourceRetry = await createProfitImpactAction({ ...baseInput, productId: "source-lookup", sourceAlertKey: "alert:stable", idempotencyKey: "source:second" });
assert.equal(sourceFirst.id, sourceRetry.id, "an integration source must not create duplicate actions");
assert.equal(
  await prisma.profitImpactEvent.count({ where: { actionId: first.id } }),
  1,
  "retry must not create a second ACCEPTED event",
);

await assert.rejects(
  createProfitImpactAction({
    ...baseInput,
    idempotencyKey: "intent:invalid-price",
    previousValue: -1,
  }),
);
await assert.rejects(
  createProfitImpactAction({
    ...baseInput,
    idempotencyKey: "intent:invalid-window",
    measurementWindowDays: 7,
  }),
);
assert.equal(
  await getProfitImpactActionForShop({ shop: otherShop, actionId: first.id }),
  null,
  "actions must remain shop-isolated",
);

const second = await createProfitImpactAction({
  ...baseInput,
  idempotencyKey: "intent:second",
});
await transitionProfitImpactAction({
  shop,
  actionId: first.id,
  toStatus: "AWAITING_APPLICATION",
});
await transitionProfitImpactAction({
  shop,
  actionId: second.id,
  toStatus: "AWAITING_APPLICATION",
});

const appliedAt = new Date("2026-08-25T00:00:00.000Z");
const baseline = {
  windowStart: new Date("2026-08-11T00:00:00.000Z"),
  windowEnd: appliedAt,
  observedDays: 14,
  revenue: 100,
  economicProfit: 20,
  economicMarginPct: 20,
  units: 10,
  cogs: 80,
  discounts: 0,
  refunds: 0,
  averageUnitRevenue: 10,
  averageUnitCost: 8,
  discountRatePct: 0,
  dataConfidenceScore: 80,
  confidenceReasons: [],
  sourceCompleteness: { complete: true },
};
const measurementEnd = new Date("2026-09-08T00:00:00.000Z");
const starts = await Promise.allSettled([
  startProfitImpactMeasurement({
    shop,
    actionId: first.id,
    appliedAt,
    measurementEnd,
    baseline,
  }),
  startProfitImpactMeasurement({
    shop,
    actionId: second.id,
    appliedAt,
    measurementEnd,
    baseline,
  }),
]);
assert.equal(starts.filter((result) => result.status === "fulfilled").length, 1);
assert.equal(
  await prisma.profitImpactAction.count({
    where: { shop, productId: "101", status: "MEASURING" },
  }),
  1,
  "only one same-product action may enter MEASURING",
);
const rejectedActionId = starts[0].status === "rejected" ? first.id : second.id;
const measuringActionId = starts[0].status === "fulfilled" ? first.id : second.id;
assert.equal(
  await prisma.profitImpactMeasurement.count({ where: { actionId: rejectedActionId } }),
  0,
  "failed start must roll back its baseline",
);

const baselineForMath = {
  observedDays: 14,
  revenue: 140,
  economicProfit: 28,
  economicMarginPct: 20,
  units: 14,
  cogs: 112,
  averageUnitRevenue: 10,
  averageUnitCost: 8,
  discountRatePct: 10,
  sourceCompletenessJson: JSON.stringify({ grossProductSales: 155.56 }),
};
const postForMath = {
  revenue: 84,
  economicProfit: 21,
  economicMarginPct: 25,
  units: 7,
  cogs: 63,
  discounts: 4,
  refunds: 0,
  averageUnitRevenue: 12,
  averageUnitCost: 9,
  discountRatePct: 5,
  grossProductSales: 88,
  dataConfidenceScore: 90,
  confidenceReasons: [],
  missingCogs: false,
  truncated: false,
  sourceCompleteness: { observedDays: 7 },
};
const changes = calculateMeasuredChanges({ baseline: baselineForMath, post: postForMath });
assert.equal(changes.measuredProfitChange, 7, "7d profit must use daily-rate normalization");
assert.equal(changes.measuredRevenueChange, 14, "7d revenue must use daily-rate normalization");
assert.equal(changes.measuredMarginChange, 5);
assert.equal(
  calculateAttribution({
    actionType: "PRICE_CHANGE",
    previousValue: 10,
    appliedValue: 12,
    baseline: baselineForMath,
    post: postForMath,
    measuredProfitChange: changes.measuredProfitChange,
  }).estimatedAttributableImpact,
  7,
);
assert.equal(
  calculateAttribution({
    actionType: "COGS_CHANGE",
    previousValue: 10,
    appliedValue: 8,
    baseline: { ...baselineForMath, averageUnitCost: 10 },
    post: { ...postForMath, averageUnitCost: 8 },
    measuredProfitChange: 20,
  }).estimatedAttributableImpact,
  14,
);
assert.equal(
  calculateAttribution({
    actionType: "DISCOUNT_CHANGE",
    previousValue: 10,
    appliedValue: 5,
    baseline: baselineForMath,
    post: postForMath,
    measuredProfitChange: 20,
  }).attributionMethod,
  "DISCOUNT_COMPONENT_CAPPED_BY_MEASURED_PROFIT",
);
assert.equal(
  calculateAttribution({
    actionType: "PRODUCT_ACTION",
    previousValue: null,
    appliedValue: null,
    baseline: baselineForMath,
    post: postForMath,
    measuredProfitChange: 20,
  }).estimatedAttributableImpact,
  null,
);
assert.ok(
  calculateAttributionConfidence({
    actionType: "PRICE_CHANGE", dataConfidenceScore: 90, observedDays: 7,
    postUnits: 3, baselineUnits: 14, missingCogs: false, truncated: false,
    changeVerified: true,
  }).score < 80,
  "low volume provisional result must not be HIGH",
);
assert.ok(
  calculateAttributionConfidence({
    actionType: "PRICE_CHANGE", dataConfidenceScore: 100, observedDays: 14,
    postUnits: 20, baselineUnits: 20, missingCogs: true, truncated: false,
    changeVerified: true,
  }).score <= 39,
);
assert.ok(
  calculateAttributionConfidence({
    actionType: "PRICE_CHANGE", dataConfidenceScore: 100, observedDays: 14,
    postUnits: 20, baselineUnits: 20, missingCogs: false, truncated: true,
    changeVerified: true,
  }).score <= 49,
);

const measurementInput = {
  shop,
  actionId: measuringActionId,
  measurementType: "PROVISIONAL_7D" as const,
  windowStart: appliedAt,
  windowEnd: new Date("2026-09-01T00:00:00.000Z"),
  observedDays: 7,
  revenue: 84,
  economicProfit: 21,
  economicMarginPct: 25,
  units: 7,
  cogs: 63,
  discounts: 4,
  refunds: 0,
  measuredProfitChange: 7,
  measuredMarginChange: 5,
  measuredRevenueChange: 14,
  measuredUnitsChange: 0,
  measuredCogsChange: 7,
  estimatedAttributableImpact: 7,
  attributionMethod: "PRICE_COMPONENT_CAPPED_BY_MEASURED_PROFIT",
  dataConfidenceScore: 90,
  attributionConfidenceScore: 70,
  confidenceLevel: "MEDIUM" as const,
};
const provisional = await createImmutableProfitImpactMeasurement(measurementInput);
const provisionalRetry = await createImmutableProfitImpactMeasurement(measurementInput);
assert.equal(provisional.id, provisionalRetry.id, "measurement retry must be idempotent");
await assert.rejects(
  createImmutableProfitImpactMeasurement({ ...measurementInput, shop: otherShop }),
  "measurement mutation must remain shop-scoped",
);

await createImmutableProfitImpactMeasurement({
  ...measurementInput,
  measurementType: "FINAL_14D",
  windowEnd: measurementEnd,
  observedDays: 14,
  finalStatus: "COMPLETED",
});
const completed = await prisma.profitImpactAction.findUniqueOrThrow({
  where: { id: measuringActionId },
});
assert.equal(completed.status, "COMPLETED");
assert.equal(completed.measuringProductKey, null, "finalization must free product guard");

const claimAction = await createProfitImpactAction({
  ...baseInput,
  productId: "303",
  idempotencyKey: "intent:claim",
});
await transitionProfitImpactAction({ shop, actionId: claimAction.id, toStatus: "AWAITING_APPLICATION" });
await startProfitImpactMeasurement({
  shop,
  actionId: claimAction.id,
  appliedAt,
  measurementEnd,
  baseline,
});
const claims = await Promise.all([
  claimProfitImpactMeasurement({ shop, actionId: claimAction.id, measurementType: "PROVISIONAL_7D" }),
  claimProfitImpactMeasurement({ shop, actionId: claimAction.id, measurementType: "PROVISIONAL_7D" }),
]);
assert.equal(claims.filter(Boolean).length, 1, "concurrent processors need a single claim winner");
await releaseProfitImpactMeasurementClaim({
  shop,
  actionId: claimAction.id,
  measurementType: "PROVISIONAL_7D",
});
assert.equal(
  await claimProfitImpactMeasurement({
    shop,
    actionId: claimAction.id,
    measurementType: "PROVISIONAL_7D",
  }),
  true,
  "a processing failure release must allow retry",
);
await releaseProfitImpactMeasurementClaim({ shop, actionId: claimAction.id, measurementType: "PROVISIONAL_7D" });

const insufficientAction = await createProfitImpactAction({
  ...baseInput,
  productId: "404",
  idempotencyKey: "intent:insufficient",
});
await transitionProfitImpactAction({
  shop,
  actionId: insufficientAction.id,
  toStatus: "AWAITING_APPLICATION",
});
await startProfitImpactMeasurement({
  shop,
  actionId: insufficientAction.id,
  appliedAt,
  measurementEnd,
  baseline,
});
await createImmutableProfitImpactMeasurement({
  ...measurementInput,
  actionId: insufficientAction.id,
  measurementType: "FINAL_14D",
  windowEnd: measurementEnd,
  observedDays: 14,
  revenue: 0,
  economicProfit: 0,
  economicMarginPct: 0,
  units: 0,
  cogs: 0,
  finalStatus: "INSUFFICIENT_DATA",
});
const insufficient = await prisma.profitImpactAction.findUniqueOrThrow({
  where: { id: insufficientAction.id },
});
assert.equal(insufficient.status, "INSUFFICIENT_DATA");
assert.equal(insufficient.measuringProductKey, null);

for (const language of ["en", "it", "fr", "de", "es", "pt-BR"] as const) {
  assert.ok(translations[language].profitImpactPage.estimatedAttributableImpact);
  assert.ok(translations[language].profitImpactPage.attributionConfidence);
  for (const key of ["active", "completed", "needsAttention", "noActions", "measuredProfitChange", "estimatedAttributableProfit", "averageMarginLift", "measuredChangeDefinition", "attributableDefinition", "dataConfidenceDefinition", "attributionConfidenceDefinition"] as const) {
    assert.ok(translations[language].profitImpactPage[key], `${language}.${key} is required`);
  }
  for (const status of ["ACCEPTED", "AWAITING_APPLICATION", "MEASURING", "COMPLETED", "INSUFFICIENT_DATA", "INVALIDATED", "CANCELLED"] as const) {
    assert.ok(translations[language].profitImpactPage[status]);
  }
}

await deleteShopData(shop);
assert.equal(await prisma.profitImpactAction.count({ where: { shop } }), 0);
assert.equal(await prisma.profitImpactMeasurement.count(), 0);
assert.equal(await prisma.profitImpactEvent.count(), 0);

console.log("Profit Impact integration checks passed.");
await prisma.$disconnect();
