import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-notification-dispatch-"));
const databasePath = path.join(directory, "dispatch.sqlite");
const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA foreign_keys = ON");
try {
  for (const name of readdirSync(path.join(process.cwd(), "prisma/migrations")).filter((entry) => /^\d{14}_/.test(entry)).sort()) {
    sqlite.exec(readFileSync(path.join(process.cwd(), "prisma/migrations", name, "migration.sql"), "utf8"));
  }
  sqlite.close();
  process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;
  const [{ default: db }, { processPendingNotificationDeliveries }, stub] = await Promise.all([
    import("../../app/db.server"), import("../../app/services/notification-delivery.server"),
    import("./notification-dispatch.stub"),
  ]);
  const account = await db.account.create({ data: {} });
  const inactiveAccount = await db.account.create({ data: { status: "PENDING_DELETION" } });
  const shop = "dispatch.myshopify.com";
  const disconnectedShop = "disconnected-dispatch.myshopify.com";
  const connect = async (domain: string, status: string) => {
    const channel = await db.channelConnection.create({ data: {
      accountId: account.id, channel: "SHOPIFY", externalAccountId: domain, status,
    } });
    await db.legacyShopMapping.create({ data: {
      shopDomain: domain, accountId: account.id, channelConnectionId: channel.id,
    } });
    return channel;
  };
  const shopChannel = await connect(shop, "ACTIVE");
  const disconnectedChannel = await connect(disconnectedShop, "DISCONNECTED");
  const amazon = await db.channelConnection.create({ data: {
    accountId: account.id, channel: "AMAZON", externalAccountId: "dispatch-amazon",
  } });
  const payload = JSON.stringify({ source: "weekly-profit-report", language: "en", currencyCode: "USD",
    summary: { economicRevenue: 100, economicProfit: 20, economicMarginPct: 20 },
    economics: { periodLoss: 0, periodExposure: 0, periodProfitGapToTarget: 0 },
    alertCounts: { critical: 0, warning: 0, opportunity: 0 } });
  const create = (key: string, data: { accountId: string; shop?: string; channelConnectionId?: string }) =>
    db.notificationDelivery.create({ data: { ...data, notificationType: "weekly_profit_report",
      recipient: "owner@example.com", deduplicationKey: key, payloadJson: payload } });
  try {
    const shopDelivery = await create("dispatch:shopify", {
      accountId: account.id, shop, channelConnectionId: shopChannel.id,
    });
    const accountWide = await create("dispatch:account", { accountId: account.id });
    const amazonDelivery = await create("dispatch:amazon", { accountId: account.id, channelConnectionId: amazon.id });
    const disconnected = await create("dispatch:disconnected", {
      accountId: account.id, shop: disconnectedShop, channelConnectionId: disconnectedChannel.id,
    });
    const pendingDeletion = await create("dispatch:deleted", { accountId: inactiveAccount.id });
    const result = await processPendingNotificationDeliveries({ limit: 10 });
    assert.equal(result.sent, 1);
    assert.equal(stub.sentEmails.length, 1);
    assert.equal((await db.notificationDelivery.findUniqueOrThrow({ where: { id: shopDelivery.id } })).status, "sent");
    for (const id of [accountWide.id, amazonDelivery.id]) {
      const row = await db.notificationDelivery.findUniqueOrThrow({ where: { id } });
      assert.equal(row.status, "failed");
      assert.match(row.errorMessage ?? "", /adapter is not configured/);
    }
    for (const id of [disconnected.id, pendingDeletion.id]) {
      assert.equal((await db.notificationDelivery.findUniqueOrThrow({ where: { id } })).status, "pending");
    }
    const raced = await create("dispatch:race", {
      accountId: account.id, shop, channelConnectionId: shopChannel.id,
    });
    stub.setBeforeBillingReturn(async () => {
      await db.channelConnection.update({ where: { id: shopChannel.id }, data: { status: "DISCONNECTED" } });
      stub.setBeforeBillingReturn(null);
    });
    const raceResult = await processPendingNotificationDeliveries({ limit: 10, shop });
    assert.equal(raceResult.sent, 0);
    assert.equal(stub.sentEmails.length, 1);
    assert.equal((await db.notificationDelivery.findUniqueOrThrow({ where: { id: raced.id } })).status, "failed");
    console.log("Shopify dispatch, Account-wide/unsupported explicit failure and inactive-owner checks passed.");
  } finally {
    await db.$disconnect();
  }
} finally {
  try { sqlite.close(); } catch { /* already closed */ }
  rmSync(directory, { recursive: true, force: true });
}
