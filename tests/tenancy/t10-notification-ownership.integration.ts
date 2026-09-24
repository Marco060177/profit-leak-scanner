import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-t10-"));
const databasePath = path.join(directory, "t10.sqlite");
const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA foreign_keys = ON");
try {
  for (const name of readdirSync(path.join(process.cwd(), "prisma/migrations")).filter((entry) => /^\d{14}_/.test(entry)).sort()) {
    sqlite.exec(readFileSync(path.join(process.cwd(), "prisma/migrations", name, "migration.sql"), "utf8"));
  }
  sqlite.close();
  process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;
  const [{ PrismaClient }, backfill, service, ownership, dispatch, { deleteShopData }, appDb] = await Promise.all([
    import("@prisma/client"), import("../../scripts/tenancy-t10-notification-backfill"),
    import("../../app/services/notification.server"), import("../../app/services/notification-ownership.server"),
    import("../../app/services/notification-dispatch-owner.server"),
    import("../../app/services/shop-data-redaction.server"), import("../../app/db.server"),
  ]);
  const db = new PrismaClient();
  const shop = "t10-a.myshopify.com";
  const secondShop = "t10-b.myshopify.com";
  const otherShop = "t10-other.myshopify.com";
  const account = await db.account.create({ data: {} });
  const otherAccount = await db.account.create({ data: {} });
  const connect = async (domain: string, accountId: string, status = "ACTIVE") => {
    const connection = await db.channelConnection.create({ data: {
      accountId, channel: "SHOPIFY", externalAccountId: domain, status,
    } });
    await db.legacyShopMapping.create({ data: { shopDomain: domain, accountId, channelConnectionId: connection.id } });
    return connection;
  };
  const connection = await connect(shop, account.id);
  const second = await connect(secondShop, account.id);
  await connect(otherShop, otherAccount.id);
  const amazon = await db.channelConnection.create({ data: { accountId: account.id, channel: "AMAZON", externalAccountId: "t10-amazon" } });
  const tenant = { accountId: account.id, channelConnectionId: connection.id,
    channel: "SHOPIFY" as const, legacyShopDomain: shop };
  try {
    await db.notificationPreferences.create({ data: { id: "a-pref", shop, recipientEmail: "owner@example.com", language: "it",
      weeklyReportEnabled: true, weeklyReportDay: 2, weeklyReportHour: 14, timezone: "Europe/Rome", notifyCritical: false } });
    await db.notificationPreferences.create({ data: { id: "b-pref", shop: secondShop, recipientEmail: "other@example.com", language: "it",
      weeklyReportEnabled: true, weeklyReportDay: 2, weeklyReportHour: 14, timezone: "Europe/Rome", notifyCritical: false } });
    const originalDelivery = await db.notificationDelivery.create({ data: {
      shop, notificationType: "weekly_profit_report", recipient: "owner@example.com", deduplicationKey: "t10:weekly:2026-w39",
    } });
    let report = await backfill.runNotificationOwnershipBackfill(db);
    assert.equal(report.verdict, "BLOCKED");
    assert.equal(report.counts.CONFLICT, 2);
    assert.equal(report.updated, 0);
    assert.equal((await db.notificationDelivery.findUniqueOrThrow({ where: { id: originalDelivery.id } })).accountId, null);
    await db.notificationPreferences.update({ where: { shop: secondShop }, data: { recipientEmail: "owner@example.com" } });
    report = await backfill.runNotificationOwnershipBackfill(db);
    assert.equal(report.verdict, "READY");
    assert.equal(report.updated, 0);
    report = await backfill.runNotificationOwnershipBackfill(db, true);
    assert.equal(report.verdict, "READY");
    assert.equal(report.updated, 2); // One canonical Account preference and one delivery.
    assert.equal((await backfill.runNotificationOwnershipBackfill(db, true)).updated, 0);
    const preference = await db.notificationPreferences.findUniqueOrThrow({ where: { accountId: account.id } });
    assert.equal(preference.recipientEmail, "owner@example.com");
    assert.equal(preference.language, "it");
    assert.deepEqual([preference.weeklyReportEnabled, preference.weeklyReportDay, preference.weeklyReportHour,
      preference.timezone, preference.notifyCritical], [true, 2, 14, "Europe/Rome", false]);
    const attributed = await db.notificationDelivery.findUniqueOrThrow({ where: { id: originalDelivery.id } });
    assert.equal(attributed.accountId, account.id);
    assert.equal(attributed.channelConnectionId, connection.id);
    const created = await service.createWeeklyReportDelivery({
      shop, recipient: "owner@example.com", weekKey: "2026-w40", payload: { source: "test" },
    });
    assert.equal(created.created, true);
    assert.equal(created.delivery.accountId, account.id);
    assert.equal(created.delivery.channelConnectionId, connection.id);
    assert.equal((await dispatch.classifyNotificationDispatchOwner(created.delivery)).kind, "SHOPIFY");
    const accountWide = await db.notificationDelivery.create({ data: {
      accountId: account.id, notificationType: "weekly_profit_report", recipient: "owner@example.com",
      deduplicationKey: "t10:account-wide",
    } });
    const accountDispatch = await dispatch.classifyNotificationDispatchOwner(accountWide);
    assert.equal(accountDispatch.kind, "UNSUPPORTED"); // Owned, but content/entitlement adapter is not yet configured.
    assert.equal(await service.claimPendingNotificationDelivery(accountWide.id), true);
    await service.markNotificationDeliveryFailed({ id: accountWide.id, errorMessage: "Account-wide notification adapter is not configured." });
    const amazonDelivery = await db.notificationDelivery.create({ data: {
      accountId: account.id, channelConnectionId: amazon.id, notificationType: "profit_alert",
      recipient: "owner@example.com", deduplicationKey: "t10:amazon",
    } });
    assert.equal((await dispatch.classifyNotificationDispatchOwner(amazonDelivery)).kind, "UNSUPPORTED");
    assert.equal((await service.createWeeklyReportDelivery({ shop, recipient: "owner@example.com", weekKey: "2026-w40" })).created, false);
    const alertDelivery = await service.createAlertNotificationDelivery({
      shop, alert: { id: "t10-alert" } as Parameters<typeof service.createAlertNotificationDelivery>[0]["alert"],
      recipient: "owner@example.com", periodDays: 1, monitorEventId: "t10-event",
    });
    assert.equal(alertDelivery.delivery.accountId, account.id);
    assert.equal(alertDelivery.delivery.channelConnectionId, connection.id);
    await db.channelConnection.update({ where: { id: connection.id }, data: { status: "DISCONNECTED" } });
    assert.equal((await dispatch.classifyNotificationDispatchOwner(created.delivery)).kind, "INACTIVE");
    assert.equal((await db.notificationDelivery.findUniqueOrThrow({ where: { id: originalDelivery.id } })).channelConnectionId, connection.id);
    await assert.rejects(ownership.resolveNotificationShopOwner(shop));
    assert.deepEqual((await ownership.listActiveNotificationShopMappings(account.id)).map((mapping) => mapping.shopDomain), [secondShop]);
    assert.deepEqual(await ownership.listActiveNotificationShopMappings(otherAccount.id).then((rows) => rows.map((row) => row.shopDomain)), [otherShop]);
    await db.channelConnection.update({ where: { id: connection.id }, data: { status: "ACTIVE" } });
    assert.equal((await service.getNotificationPreferences(shop, tenant))?.id, preference.id);
    await assert.rejects(service.getNotificationPreferences(shop, { ...tenant, accountId: otherAccount.id }));
    await service.updateNotificationPreferences({ shop, tenant, input: { notifyWarnings: true } });
    assert.equal((await db.notificationPreferences.findUniqueOrThrow({ where: { accountId: account.id } })).notifyWarnings, true);
    assert.equal(await db.notificationPreferences.count({ where: { accountId: otherAccount.id } }), 0);
    await assert.rejects(ownership.resolveNotificationShopOwner("missing.myshopify.com"));
    await db.channelConnection.update({ where: { id: second.id }, data: { status: "DISCONNECTED" } });
    assert.deepEqual((await ownership.listActiveNotificationShopMappings(account.id)).map((mapping) => mapping.shopDomain), [shop]);
    await deleteShopData(shop);
    assert.equal((await db.channelConnection.findUniqueOrThrow({ where: { id: connection.id } })).status, "DISCONNECTED");
    const preserved = await db.notificationPreferences.findUniqueOrThrow({ where: { accountId: account.id } });
    assert.equal(preserved.shop, null);
    assert.equal(await db.notificationDelivery.count({ where: { shop } }), 0); // Existing redaction privacy policy.
    await db.notificationDelivery.create({ data: {
      shop: "unmapped.myshopify.com", notificationType: "weekly_profit_report",
      recipient: "owner@example.com", deduplicationKey: "unmapped:weekly:2026-w40",
    } });
    const blocked = await backfill.runNotificationOwnershipBackfill(db, true);
    assert.equal(blocked.verdict, "BLOCKED");
    assert.ok(blocked.counts.MISSING_MAPPING > 0);
    assert.equal(blocked.updated, 0);
    await db.account.update({ where: { id: account.id }, data: { status: "PENDING_DELETION" } });
    assert.equal((await dispatch.classifyNotificationDispatchOwner(accountWide)).kind, "INACTIVE");
    console.log("T10 migration, conflict, idempotence, Account isolation, channel history and redaction passed.");
  } finally {
    await db.$disconnect();
    await appDb.default.$disconnect();
  }
} finally {
  try { sqlite.close(); } catch { /* already closed */ }
  rmSync(directory, { recursive: true, force: true });
}
