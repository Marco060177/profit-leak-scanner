import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-t9e-"));
const databasePath = path.join(directory, "t9e.sqlite");
const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA foreign_keys = ON");
try {
  for (const name of readdirSync(path.join(process.cwd(), "prisma/migrations")).filter((entry) => /^\d{14}_/.test(entry)).sort()) {
    sqlite.exec(readFileSync(path.join(process.cwd(), "prisma/migrations", name, "migration.sql"), "utf8"));
  }
  sqlite.close();
  process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;
  const [{ PrismaClient }, service] = await Promise.all([
    import("@prisma/client"), import("../../app/services/account-ai-usage.server"),
  ]);
  const db = new PrismaClient();
  const shop = "t9e.myshopify.com";
  const month = "2026-09";
  const account = await db.account.create({ data: {} });
  const connection = await db.channelConnection.create({ data: {
    accountId: account.id, channel: "SHOPIFY", externalAccountId: shop,
  } });
  await db.legacyShopMapping.create({ data: { shopDomain: shop, accountId: account.id, channelConnectionId: connection.id } });
  const tenant = {
    accountId: account.id, channelConnectionId: connection.id,
    channel: "SHOPIFY" as const, legacyShopDomain: shop,
  };
  const input = { db, shop, tenant, month };
  const count = async (periodKey = month) => (await db.accountAiUsage.findUnique({
    where: { accountId_periodKey: { accountId: account.id, periodKey } },
  }))?.requests ?? null;
  const legacyCount = async () => (await db.aiUsage.findUnique({ where: { shop_month: { shop, month } } }))?.requests ?? null;
  const reserve = (periodKey = month) => service.reserveAccountAiUsage({ ...input, month: periodKey });
  const completed = (reservationId: string) => service.completeAccountAiUsage({ ...input, reservationId });
  const compensated = (reservationId: string) => service.compensateAccountAiUsage({ ...input, reservationId });
  try {
    await db.aiUsage.create({ data: { shop, month, requests: 3 } });
    // Historical legacy-only state cannot block the authoritative Account quota.
    const first = await reserve();
    assert.equal(first.status, "RESERVED");
    if (first.status !== "RESERVED") throw new Error("Unexpected quota response");
    assert.equal(await count(), 1);
    assert.equal(await legacyCount(), 3);
    assert.equal((await db.accountAiUsageReservation.findUniqueOrThrow({ where: { id: first.reservationId } })).status, "RESERVED");
    await completed(first.reservationId);
    await completed(first.reservationId); // Successful AI and fallback are both charged; completion is idempotent.
    assert.equal(await count(), 1);
    await assert.rejects(compensated(first.reservationId), /AI usage is temporarily unavailable/);

    const failure = await reserve();
    if (failure.status !== "RESERVED") throw new Error("Unexpected quota response");
    const other = await reserve();
    if (other.status !== "RESERVED") throw new Error("Unexpected quota response");
    assert.equal(await count(), 3);
    const disconnectCompletion = await reserve();
    const disconnectCompensation = await reserve();
    if (disconnectCompletion.status !== "RESERVED" || disconnectCompensation.status !== "RESERVED") {
      throw new Error("Unexpected quota response");
    }
    await db.channelConnection.update({ where: { id: connection.id }, data: { status: "DISCONNECTED" } });
    await assert.rejects(reserve(), /AI usage is temporarily unavailable/);
    await assert.rejects(service.completeAccountAiUsage({ ...input,
      tenant: { ...tenant, accountId: "wrong-account" }, reservationId: disconnectCompletion.reservationId,
    }), /AI usage is temporarily unavailable/);
    await completed(disconnectCompletion.reservationId);
    await completed(disconnectCompletion.reservationId);
    await compensated(disconnectCompensation.reservationId);
    await compensated(disconnectCompensation.reservationId);
    assert.equal((await db.accountAiUsageReservation.findUniqueOrThrow({ where: { id: disconnectCompletion.reservationId } })).status, "COMPLETED");
    assert.equal((await db.accountAiUsageReservation.findUniqueOrThrow({ where: { id: disconnectCompensation.reservationId } })).status, "COMPENSATED");
    await db.channelConnection.update({ where: { id: connection.id }, data: { status: "ACTIVE" } });
    await Promise.all([compensated(failure.reservationId), compensated(failure.reservationId)]);
    assert.equal(await count(), 3);
    assert.equal(await legacyCount(), 3);
    assert.equal((await db.accountAiUsageReservation.findUniqueOrThrow({ where: { id: failure.reservationId } })).status, "COMPENSATED");
    assert.equal((await db.accountAiUsageReservation.findUniqueOrThrow({ where: { id: other.reservationId } })).status, "RESERVED");

    const triggerDb = new DatabaseSync(databasePath);
    triggerDb.exec('CREATE TRIGGER reject_legacy_shadow BEFORE UPDATE ON "AiUsage" BEGIN SELECT RAISE(ABORT, \'test legacy shadow failure\'); END');
    triggerDb.close();
    const beforeShadowFailure = await count();
    const legacyWriteBlocked = await reserve();
    assert.equal(legacyWriteBlocked.status, "RESERVED");
    if (legacyWriteBlocked.status !== "RESERVED") throw new Error("Unexpected quota response");
    assert.equal(await count(), beforeShadowFailure! + 1);
    assert.equal((await db.accountAiUsageReservation.findUniqueOrThrow({ where: { id: legacyWriteBlocked.reservationId } })).legacyShadowApplied, false);
    await compensated(legacyWriteBlocked.reservationId); // The legacy UPDATE trigger remains active.
    assert.equal(await count(), beforeShadowFailure);
    assert.equal(await legacyCount(), 3);
    const removeTrigger = new DatabaseSync(databasePath);
    removeTrigger.exec('DROP TRIGGER reject_legacy_shadow');
    removeTrigger.close();
    await assert.rejects(service.compensateAccountAiUsage({ ...input, tenant: { ...tenant, accountId: "wrong-account" }, reservationId: other.reservationId }), /AI usage is temporarily unavailable/);
    assert.equal(await count(), 3);
    // Crash simulation: an uncompleted reservation stays charged.
    assert.equal((await db.accountAiUsageReservation.findUniqueOrThrow({ where: { id: other.reservationId } })).status, "RESERVED");

    await db.accountAiUsage.update({ where: { accountId_periodKey: { accountId: account.id, periodKey: month } }, data: { requests: 99 } });
    const last = await reserve();
    assert.equal(last.status, "RESERVED");
    assert.equal(await count(), 100);
    assert.deepEqual(await reserve(), { status: "QUOTA_EXCEEDED" });
    await db.accountAiUsage.update({ where: { accountId_periodKey: { accountId: account.id, periodKey: month } }, data: { requests: 99 } });
    const race = await Promise.allSettled([reserve(), reserve()]);
    assert.equal(race.filter((item) => item.status === "fulfilled" && item.value.status === "RESERVED").length, 1);
    assert.equal(await count(), 100);
    assert.ok((await count())! <= 100);
    // Legacy below cap cannot grant more Account quota.
    await db.aiUsage.update({ where: { shop_month: { shop, month } }, data: { requests: 0 } });
    assert.deepEqual(await reserve(), { status: "QUOTA_EXCEEDED" });

    // SHOP_REDACT-style account-only state: quota survives, no legacy re-creation.
    await db.aiUsage.delete({ where: { shop_month: { shop, month } } });
    await db.accountAiUsage.update({ where: { accountId_periodKey: { accountId: account.id, periodKey: month } }, data: { requests: 7 } });
    const accountOnly = await reserve();
    assert.equal(accountOnly.status, "RESERVED");
    assert.equal(await count(), 8);
    assert.equal(await legacyCount(), null);
    // A genuinely new month has neither row. Double submission counts twice.
    const newMonth = await Promise.allSettled([reserve("2026-10"), reserve("2026-10")]);
    assert.equal(newMonth.filter((item) => item.status === "fulfilled" && item.value.status === "RESERVED").length, 2);
    assert.equal(await count("2026-10"), 2);
    assert.equal(await db.aiUsage.count({ where: { shop, month: "2026-10" } }), 0);
    await db.channelConnection.create({ data: { accountId: account.id, channel: "AMAZON", externalAccountId: "amazon-t9e" } });
    assert.equal((await reserve("2026-11")).status, "RESERVED");
    await db.channelConnection.create({ data: { accountId: account.id, channel: "SHOPIFY", externalAccountId: "second.myshopify.com" } }).then(async (second) => {
      await db.legacyShopMapping.create({ data: { shopDomain: "second.myshopify.com", accountId: account.id, channelConnectionId: second.id } });
    });
    await assert.rejects(reserve("2026-12"), /AI usage is temporarily unavailable/);

    const route = readFileSync(path.join(process.cwd(), "app/routes/app.ai-advisor.tsx"), "utf8");
    assert.match(route, /prisma\.accountAiUsage\.findUnique/);
    assert.match(route, /accountId: tenant\.accountId/);
    assert.match(route, /reserveAccountAiUsage/);
    assert.match(route, /completeAccountAiUsage/);
    assert.match(route, /compensateAccountAiUsage/);
    assert.doesNotMatch(route, /prisma\.aiUsage\.findUnique|reserveAiUsage\(/);
    assert.match(route, /hasGrowthAccess\(billing\)/);
    console.log("T9E/T9F account authority, atomic cap, reservation lifecycle, legacy independence and tenant safety passed.");
  } finally {
    await db.$disconnect();
  }
} finally {
  try { sqlite.close(); } catch { /* already closed */ }
  rmSync(directory, { recursive: true, force: true });
}
