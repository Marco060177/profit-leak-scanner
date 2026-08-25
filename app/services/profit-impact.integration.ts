import assert from "node:assert/strict";
import fs from "node:fs";

import prisma from "~/db.server";
import {
  createProfitImpactAction,
  getProfitImpactActionForShop,
  startProfitImpactMeasurement,
  transitionProfitImpactAction,
} from "~/services/profit-impact.server";
import { deleteShopData } from "~/services/shop-data-redaction.server";
import { hasGrowthAccess } from "~/utils/billing.server";

const migrationFiles = fs
  .readdirSync("prisma/migrations", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `prisma/migrations/${entry.name}/migration.sql`)
  .filter((file) => fs.existsSync(file))
  .sort();
for (const file of migrationFiles) {
  const migration = fs.readFileSync(file, "utf8");
  for (const statement of migration.split(";").map((part) => part.trim()).filter(Boolean)) {
    await prisma.$executeRawUnsafe(statement);
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

const first = await createProfitImpactAction({
  ...baseInput,
  idempotencyKey: "intent:first",
});
const retry = await createProfitImpactAction({
  ...baseInput,
  idempotencyKey: "intent:first",
});
assert.equal(first.id, retry.id, "retry must return the existing action");
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
assert.equal(
  await prisma.profitImpactMeasurement.count({ where: { actionId: rejectedActionId } }),
  0,
  "failed start must roll back its baseline",
);

await deleteShopData(shop);
assert.equal(await prisma.profitImpactAction.count({ where: { shop } }), 0);
assert.equal(await prisma.profitImpactMeasurement.count(), 0);
assert.equal(await prisma.profitImpactEvent.count(), 0);

console.log("Profit Impact integration checks passed.");
await prisma.$disconnect();
