import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-pre-t9e-"));
const databasePath = path.join(directory, "lifecycle.sqlite");
const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA foreign_keys = ON");
try {
  for (const name of readdirSync(path.join(process.cwd(), "prisma/migrations")).filter((entry) => /^\d{14}_/.test(entry)).sort()) {
    sqlite.exec(readFileSync(path.join(process.cwd(), "prisma/migrations", name, "migration.sql"), "utf8"));
  }
  sqlite.close();
  process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;
  const [{ default: db }, { resolveShopifyTenantContext }, { action }, stub] = await Promise.all([
    import("~/db.server"), import("~/connectors/shopify/shopify-tenant-resolver.server"),
    import(pathToFileURL(path.join(process.cwd(), "app/routes/webhooks.app.uninstalled.tsx")).href),
    import("./authenticate.stub"),
  ]);
  const shop = "lifecycle.myshopify.com";
  const original = await resolveShopifyTenantContext({ shop });
  const accountCount = await db.account.count();
  const connectionCount = await db.channelConnection.count();
  const mappingCount = await db.legacyShopMapping.count();
  await db.session.create({ data: { id: "session-lifecycle", shop, state: "state", accessToken: "test-token" } });
  await db.aiUsage.create({ data: { shop, month: "2026-09", requests: 4 } });
  await db.accountAiUsage.create({ data: { accountId: original.accountId, periodKey: "2026-09", requests: 4 } });
  const amazon = await db.channelConnection.create({ data: {
    accountId: original.accountId, channel: "AMAZON", externalAccountId: "amazon-test-seller",
  } });
  const event = async (verifiedShop: string, topic = "APP_UNINSTALLED") => {
    const request = new Request("https://marginlab.example/webhooks/app/uninstalled", { method: "POST" });
    stub.registerVerifiedWebhook(request, verifiedShop, topic);
    return action({ request });
  };
  const status = () => db.channelConnection.findUniqueOrThrow({ where: { id: original.channelConnectionId } });
  const unchanged = async () => {
    assert.equal(await db.account.count(), accountCount);
    assert.equal(await db.channelConnection.count(), connectionCount + 1);
    assert.equal(await db.legacyShopMapping.count(), mappingCount);
    assert.equal((await db.aiUsage.findUniqueOrThrow({ where: { shop_month: { shop, month: "2026-09" } } })).requests, 4);
    assert.equal((await db.accountAiUsage.findUniqueOrThrow({ where: {
      accountId_periodKey: { accountId: original.accountId, periodKey: "2026-09" },
    } })).requests, 4);
    assert.equal((await db.channelConnection.findUniqueOrThrow({ where: { id: amazon.id } })).status, "ACTIVE");
  };
  try {
    assert.equal((await status()).status, "ACTIVE");
    assert.equal((await event(shop)).status, 200);
    assert.equal((await status()).status, "DISCONNECTED");
    assert.equal(await db.session.count({ where: { shop } }), 0);
    await unchanged();
    assert.equal((await event(shop)).status, 200);
    assert.equal((await status()).status, "DISCONNECTED");
    await unchanged();

    const reinstalled = await resolveShopifyTenantContext({ shop });
    assert.deepEqual(reinstalled, original);
    assert.equal((await status()).status, "ACTIVE");
    await unchanged();
    assert.deepEqual(await resolveShopifyTenantContext({ shop }), original);
    const concurrent = await Promise.all([
      resolveShopifyTenantContext({ shop }), resolveShopifyTenantContext({ shop: shop.toUpperCase() }),
    ]);
    assert.deepEqual(concurrent, [original, original]);
    await unchanged();

    await db.session.create({ data: { id: "missing-session", shop: "missing.myshopify.com", state: "state", accessToken: "test-token" } });
    assert.equal((await event("missing.myshopify.com")).status, 200);
    assert.equal(await db.session.count({ where: { shop: "missing.myshopify.com" } }), 0);
    assert.equal(await db.account.count(), accountCount);

    await db.session.create({ data: { id: "unsafe-session", shop, state: "state", accessToken: "test-token" } });
    await db.channelConnection.update({ where: { id: original.channelConnectionId }, data: { status: "PENDING_DELETION" } });
    assert.equal((await event(shop)).status, 503);
    assert.equal(await db.session.count({ where: { shop } }), 0);
    assert.equal((await status()).status, "PENDING_DELETION");
    await assert.rejects(resolveShopifyTenantContext({ shop }), /unsafe status/);
    await unchanged();
    await db.channelConnection.update({ where: { id: original.channelConnectionId }, data: { status: "ACTIVE", channel: "AMAZON" } });
    assert.equal((await event(shop)).status, 503);
    await assert.rejects(resolveShopifyTenantContext({ shop }), /Inconsistent Shopify tenant mapping/);
    assert.equal((await status()).status, "ACTIVE");
    await unchanged();
    assert.equal((await event(shop, "OTHER_TOPIC")).status, 200);
    assert.equal((await status()).status, "ACTIVE");
    console.log("Pre-T9E Shopify uninstall/reinstall lifecycle and usage preservation passed.");
  } finally {
    await db.$disconnect();
  }
} finally {
  try { sqlite.close(); } catch { /* already closed */ }
  rmSync(directory, { recursive: true, force: true });
}
