import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-t11-"));
const databasePath = path.join(directory, "t11.sqlite");
const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA foreign_keys = ON");
try {
  for (const name of readdirSync(path.join(process.cwd(), "prisma/migrations")).filter((entry) => /^\d{14}_/.test(entry)).sort()) {
    sqlite.exec(readFileSync(path.join(process.cwd(), "prisma/migrations", name, "migration.sql"), "utf8"));
  }
  sqlite.close();
  process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;
  const [dbModule, resolver, { action: uninstall }, { action: redact }, stub, lifecycle, notification, notificationService] = await Promise.all([
    import("~/db.server"), import("~/connectors/shopify/shopify-tenant-resolver.server"),
    import(pathToFileURL(path.join(process.cwd(), "app/routes/webhooks.app.uninstalled.tsx")).href),
    import(pathToFileURL(path.join(process.cwd(), "app/routes/webhooks.shop.redact.ts")).href),
    import("./authenticate.stub"), import("../../app/services/account-lifecycle.server"),
    import("../../app/services/notification-ownership.server"), import("../../app/services/notification.server"),
  ]);
  const db = dbModule.default;
  const shop = "t11.myshopify.com";
  const unrelatedShop = "unrelated-t11.myshopify.com";
  const tenant = await resolver.resolveShopifyTenantContext({ shop });
  const unrelated = await resolver.resolveShopifyTenantContext({ shop: unrelatedShop });
  const amazon = await db.channelConnection.create({ data: {
    accountId: tenant.accountId, channel: "AMAZON", externalAccountId: "t11-amazon",
  } });
  const session = async (id: string) => db.session.create({ data: { id, shop, state: "state", accessToken: "test-token" } });
  const event = async (action: ({ request }: { request: Request }) => Promise<Response>, topic: string) => {
    const request = new Request(`https://marginlab.example/webhooks/${topic}`, { method: "POST" });
    stub.registerVerifiedWebhook(request, shop, topic);
    return action({ request });
  };
  try {
    await session("t11-session");
    await db.accountAiUsage.create({ data: { accountId: tenant.accountId, periodKey: "2026-09", requests: 8 } });
    await db.accountAiUsageReservation.create({ data: { accountId: tenant.accountId, periodKey: "2026-09", status: "COMPLETED" } });
    await db.notificationPreferences.create({ data: { shop, accountId: tenant.accountId, recipientEmail: "owner@example.com" } });
    await db.accountAiUsage.create({ data: { accountId: unrelated.accountId, periodKey: "2026-09", requests: 3 } });
    await db.notificationPreferences.create({ data: { shop: unrelatedShop, accountId: unrelated.accountId, recipientEmail: "other@example.com" } });
    await db.notificationDelivery.create({ data: {
      shop, accountId: tenant.accountId, channelConnectionId: tenant.channelConnectionId,
      notificationType: "weekly_profit_report", recipient: "owner@example.com", deduplicationKey: "t11:weekly:one",
    } });
    await db.profitAssumptions.create({ data: { shop, channelConnectionId: tenant.channelConnectionId } });
    const preserved = async () => {
      assert.equal(await db.account.count({ where: { id: tenant.accountId } }), 1);
      assert.equal((await db.accountAiUsage.findUniqueOrThrow({ where: { accountId_periodKey: {
        accountId: tenant.accountId, periodKey: "2026-09",
      } } })).requests, 8);
      assert.equal(await db.accountAiUsageReservation.count({ where: { accountId: tenant.accountId } }), 1);
      assert.equal(await db.notificationPreferences.count({ where: { accountId: tenant.accountId } }), 1);
      assert.equal((await db.channelConnection.findUniqueOrThrow({ where: { id: amazon.id } })).status, "ACTIVE");
      assert.equal((await db.account.findUniqueOrThrow({ where: { id: unrelated.accountId } })).status, "ACTIVE");
    };
    assert.equal((await event(uninstall, "APP_UNINSTALLED")).status, 200);
    assert.equal((await event(uninstall, "APP_UNINSTALLED")).status, 200);
    assert.equal((await db.channelConnection.findUniqueOrThrow({ where: { id: tenant.channelConnectionId } })).status, "DISCONNECTED");
    assert.equal(await db.session.count({ where: { shop } }), 0);
    assert.equal(await resolver.findShopifyTenantContext(shop), null);
    assert.deepEqual((await notification.listActiveNotificationShopMappings(tenant.accountId)).map((item) => item.shopDomain), []);
    await preserved();
    assert.equal(await db.legacyShopMapping.count({ where: { shopDomain: shop } }), 1);
    assert.deepEqual(await resolver.resolveShopifyTenantContext({ shop }), tenant);
    assert.deepEqual(await resolver.resolveShopifyTenantContext({ shop }), tenant);
    await db.channelConnection.update({ where: { id: tenant.channelConnectionId }, data: { status: "REAUTH_REQUIRED" } });
    assert.equal(await resolver.findShopifyTenantContext(shop), null);
    assert.deepEqual(await resolver.resolveShopifyTenantContext({ shop }), tenant);
    await db.channelConnection.update({ where: { id: tenant.channelConnectionId }, data: { status: "REAUTH_REQUIRED" } });
    assert.equal((await event(uninstall, "APP_UNINSTALLED")).status, 200);
    assert.equal((await db.channelConnection.findUniqueOrThrow({ where: { id: tenant.channelConnectionId } })).status, "DISCONNECTED");
    assert.deepEqual(await resolver.resolveShopifyTenantContext({ shop }), tenant);
    await db.channelConnection.update({ where: { id: tenant.channelConnectionId }, data: { status: "PENDING_DELETION" } });
    await assert.rejects(resolver.resolveShopifyTenantContext({ shop }), /unsafe status/);
    await db.channelConnection.update({ where: { id: tenant.channelConnectionId }, data: { status: "ACTIVE" } });
    await session("t11-redact-session");
    assert.equal((await event(redact, "SHOP_REDACT")).status, 200);
    assert.equal((await event(redact, "SHOP_REDACT")).status, 200);
    await preserved();
    assert.equal((await db.channelConnection.findUniqueOrThrow({ where: { id: tenant.channelConnectionId } })).status, "DISCONNECTED");
    assert.equal(await db.notificationDelivery.count({ where: { shop } }), 0);
    assert.equal(await db.profitAssumptions.count({ where: { shop } }), 0);
    assert.equal(await db.session.count({ where: { shop } }), 0);
    assert.equal((await db.notificationPreferences.findUniqueOrThrow({ where: { accountId: tenant.accountId } })).shop, null);
    assert.equal(await resolver.findShopifyTenantContext(shop), null);
    assert.deepEqual((await notification.listActiveNotificationShopMappings(tenant.accountId)).map((item) => item.shopDomain), []);
    assert.deepEqual(await resolver.resolveShopifyTenantContext({ shop }), tenant);
    assert.equal(await db.profitAssumptions.count({ where: { shop } }), 0); // Authentication alone cannot recreate redacted operations.

    await session("t11-delete-session");
    await db.notificationDelivery.create({ data: {
      shop, accountId: tenant.accountId, channelConnectionId: tenant.channelConnectionId,
      notificationType: "weekly_profit_report", recipient: "owner@example.com", deduplicationKey: "t11:weekly:two",
    } });
    await db.notificationDelivery.create({ data: {
      shop, accountId: tenant.accountId, channelConnectionId: tenant.channelConnectionId,
      notificationType: "weekly_profit_report", recipient: "owner@example.com", deduplicationKey: "t11:weekly:inflight", status: "processing",
    } });
    await assert.rejects(lifecycle.requestAccountDeletion(tenant.accountId), /in-flight/);
    assert.equal((await db.account.findUniqueOrThrow({ where: { id: tenant.accountId } })).status, "ACTIVE");
    await db.notificationDelivery.update({ where: { deduplicationKey: "t11:weekly:inflight" }, data: { status: "failed" } });
    const deletion = await lifecycle.requestAccountDeletion(tenant.accountId);
    assert.deepEqual(deletion, { status: "PENDING_DELETION", changed: true });
    const purge = await lifecycle.assessAccountPurge(tenant.accountId);
    assert.equal(purge.eligible, false);
    assert.equal(purge.accountStatus, "PENDING_DELETION");
    assert.equal(purge.retained.channels, 2);
    assert.ok(purge.unresolved.length > 0);
    assert.deepEqual(await lifecycle.requestAccountDeletion(tenant.accountId), { status: "PENDING_DELETION", changed: false });
    assert.equal((await db.account.findUniqueOrThrow({ where: { id: tenant.accountId } })).status, "PENDING_DELETION");
    assert.equal((await db.channelConnection.findUniqueOrThrow({ where: { id: tenant.channelConnectionId } })).status, "PENDING_DELETION");
    assert.equal((await db.channelConnection.findUniqueOrThrow({ where: { id: amazon.id } })).status, "PENDING_DELETION");
    assert.equal((await db.notificationDelivery.findUniqueOrThrow({ where: { deduplicationKey: "t11:weekly:two" } })).status, "cancelled");
    const stalePending = await db.notificationDelivery.create({ data: {
      shop, accountId: tenant.accountId, channelConnectionId: tenant.channelConnectionId,
      notificationType: "weekly_profit_report", recipient: "owner@example.com", deduplicationKey: "t11:weekly:stale",
    } });
    assert.equal(await notificationService.claimPendingNotificationDelivery(stalePending.id), false);
    assert.equal(await db.session.count({ where: { shop } }), 0);
    assert.equal(await resolver.findShopifyTenantContext(shop), null);
    await assert.rejects(resolver.resolveShopifyTenantContext({ shop }));
    assert.equal((await event(uninstall, "APP_UNINSTALLED")).status, 200);
    assert.equal((await db.account.findUniqueOrThrow({ where: { id: unrelated.accountId } })).status, "ACTIVE");
    assert.equal((await db.accountAiUsage.findUniqueOrThrow({ where: { accountId_periodKey: {
      accountId: unrelated.accountId, periodKey: "2026-09",
    } } })).requests, 3);
    assert.equal((await db.notificationPreferences.findUniqueOrThrow({ where: { accountId: unrelated.accountId } })).recipientEmail, "other@example.com");
    assert.equal(await db.accountAiUsage.count({ where: { accountId: tenant.accountId } }), 1); // Tombstone, no implicit purge.
    assert.equal(await db.notificationPreferences.count({ where: { accountId: tenant.accountId } }), 1);
    const measurementWorker = readFileSync(path.join(process.cwd(), "app/services/profit-impact-measurement.server.ts"), "utf8");
    assert.ok(measurementWorker.indexOf("findShopifyTenantContext(action.shop)") < measurementWorker.indexOf("unauthenticated.admin(action.shop)"));
    console.log("T11 uninstall/reinstall, reauth, redaction, account tombstone and cross-channel isolation passed.");
  } finally {
    await db.$disconnect();
  }
} finally {
  try { sqlite.close(); } catch { /* already closed */ }
  rmSync(directory, { recursive: true, force: true });
}
