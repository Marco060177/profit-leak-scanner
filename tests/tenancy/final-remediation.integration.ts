import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-tenancy-final-"));
const databasePath = path.join(directory, "final.sqlite");
const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA foreign_keys = ON");
try {
  for (const name of readdirSync(path.join(process.cwd(), "prisma/migrations")).filter((entry) => /^\d{14}_/.test(entry)).sort()) {
    sqlite.exec(readFileSync(path.join(process.cwd(), "prisma/migrations", name, "migration.sql"), "utf8"));
  }
  sqlite.close();
  process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;
  const [{ default: db }, tax, assumptions, monitor, impact, ownership] = await Promise.all([
    import("../../app/db.server"), import("../../app/utils/tax-profile.server"),
    import("../../app/services/profit-assumptions-ownership.server"),
    import("../../app/services/profit-monitor.server"),
    import("../../app/services/profit-impact.server"),
    import("../../app/services/shopify-record-ownership.server"),
  ]);
  const shop = "final-owner.myshopify.com";
  const account = await db.account.create({ data: {} });
  const connection = await db.channelConnection.create({ data: {
    accountId: account.id, channel: "SHOPIFY", externalAccountId: shop,
  } });
  const amazon = await db.channelConnection.create({ data: {
    accountId: account.id, channel: "AMAZON", externalAccountId: "final-amazon",
  } });
  await db.legacyShopMapping.create({ data: {
    shopDomain: shop, accountId: account.id, channelConnectionId: connection.id,
  } });
  const tenant = { accountId: account.id, channelConnectionId: connection.id,
    channel: "SHOPIFY" as const, legacyShopDomain: shop };
  try {
    const profileInput = { shop, tenant, countryCode: "IT", regime: "ITALY_STANDARD" as const,
      defaultVatRatePct: 22, pricesIncludeVat: true, costsIncludeVat: true,
      recoverInputVat: true, inputVatRecoveryPct: 100, shippingIncludeVat: true,
      shippingVatRatePct: 22 };
    await tax.saveStoreTaxProfile(profileInput);
    assert.equal((await db.storeTaxProfile.findUniqueOrThrow({ where: { shop } })).channelConnectionId, connection.id);
    const values = { monthlyAds: 10, monthlyShipping: 20, monthlyOperating: 30,
      paymentFeePct: 2, transactionFeePct: 1, taxReservePct: 0 };
    await assumptions.saveShopifyProfitAssumptions(shop, tenant, values);
    await assumptions.saveShopifyProfitAssumptions(shop, tenant, { ...values, monthlyAds: 11 });
    assert.equal((await db.profitAssumptions.findUniqueOrThrow({ where: { shop } })).channelConnectionId, connection.id);
    const alert = { id: "final-alert", severity: "warning" as const, category: "pricing" as const,
      title: "Title", description: "Description", monthlyImpact: 12, economicKind: "exposure" as const,
      priority: 1, actionLabel: "Review", route: "/app/products", businessAction: "review" as const,
      effort: "medium" as const, estimatedMinutes: 5, recommendedModule: "PRODUCTS" };
    await monitor.syncProfitMonitor({ shop, tenant, period: 30, alerts: [alert], snapshot: { value: 1 } });
    assert.equal((await db.profitMonitorSnapshot.findFirstOrThrow({ where: { shop } })).channelConnectionId, connection.id);
    assert.equal((await db.profitMonitorAlert.findFirstOrThrow({ where: { shop } })).channelConnectionId, connection.id);
    const action = await impact.createProfitImpactAction({ shop, tenant, idempotencyKey: "final-action",
      actionType: "OTHER", sourceModule: "ALERT_CENTER", title: "Title",
      changeDescription: "Description", currencyCode: "USD" });
    assert.equal(action.channelConnectionId, connection.id);
    assert.equal((await db.profitImpactEvent.findFirstOrThrow({ where: { actionId: action.id } })).actionId, action.id);
    await db.profitImpactAction.update({ where: { id: action.id }, data: { channelConnectionId: null } });
    const existingAction = await impact.createProfitImpactAction({ shop, tenant, idempotencyKey: "final-action",
      actionType: "OTHER", sourceModule: "ALERT_CENTER", title: "Title",
      changeDescription: "Description", currencyCode: "USD" });
    assert.equal(existingAction.id, action.id);
    assert.equal(existingAction.channelConnectionId, connection.id);
    await assert.rejects(ownership.requireShopifyRecordOwner(shop, { ...tenant, channelConnectionId: amazon.id }));
    await db.storeTaxProfile.update({ where: { shop }, data: { channelConnectionId: amazon.id } });
    await assert.rejects(tax.saveStoreTaxProfile(profileInput), /Contradictory/);
    await db.channelConnection.update({ where: { id: connection.id }, data: { status: "DISCONNECTED" } });
    await assert.rejects(assumptions.saveShopifyProfitAssumptions(shop, tenant, values));
    await assert.rejects(monitor.syncProfitMonitor({ shop, tenant, period: 30, alerts: [alert], snapshot: { value: 2 } }));
    await assert.rejects(impact.createProfitImpactAction({ shop, tenant, idempotencyKey: "after-disconnect",
      actionType: "OTHER", sourceModule: "ALERT_CENTER", title: "Title",
      changeDescription: "Description", currencyCode: "USD" }));
    await assert.rejects(impact.createImmutableProfitImpactMeasurement({
      shop, actionId: action.id, measurementType: "PROVISIONAL_7D",
      windowStart: new Date("2026-09-01T00:00:00Z"), windowEnd: new Date("2026-09-08T00:00:00Z"),
      observedDays: 7, revenue: 10, economicProfit: 2, economicMarginPct: 20,
      units: 1, cogs: 8, discounts: 0, refunds: 0, requireActiveShopifyOwner: true,
    }), (error: unknown) => error instanceof Response && error.status === 409);
    console.log("Final ownership writes, mismatch and disconnected-channel checks passed.");
  } finally {
    await db.$disconnect();
  }
} finally {
  try { sqlite.close(); } catch { /* already closed */ }
  rmSync(directory, { recursive: true, force: true });
}
