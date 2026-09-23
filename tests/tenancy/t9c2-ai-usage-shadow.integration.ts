import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-t9c2-"));
const databasePath = path.join(directory, "t9c2.sqlite");
const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA foreign_keys = ON");
try {
  const migrations = path.join(process.cwd(), "prisma/migrations");
  for (const name of readdirSync(migrations).filter((entry) => /^\d{14}_/.test(entry)).sort()) {
    sqlite.exec(readFileSync(path.join(migrations, name, "migration.sql"), "utf8"));
  }
  sqlite.close();
  process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;
  const [{ PrismaClient }, { reserveAiUsage, compensateAiUsage, AiUsageSafetyError }] = await Promise.all([
    import("@prisma/client"), import("../../app/services/ai-usage-shadow.server"),
  ]);
  const db = new PrismaClient();
  const shop = "first.myshopify.com";
  const month = "2026-09";
  const limit = 100;
  const mapped = async (domain: string, accountId?: string, status = "ACTIVE") => {
    const account = accountId
      ? await db.account.findUniqueOrThrow({ where: { id: accountId } })
      : await db.account.create({ data: {} });
    const connection = await db.channelConnection.create({ data: {
      accountId: account.id, channel: "SHOPIFY", externalAccountId: domain, status,
    } });
    await db.legacyShopMapping.create({ data: {
      shopDomain: domain, accountId: account.id, channelConnectionId: connection.id,
    } });
    return { account, connection, tenant: {
      accountId: account.id, channelConnectionId: connection.id,
      channel: "SHOPIFY" as const, legacyShopDomain: domain,
    } };
  };
  const counts = async (domain: string, accountId: string, period = month) => ({
    legacy: (await db.aiUsage.findUnique({ where: { shop_month: { shop: domain, month: period } } }))?.requests ?? null,
    shadow: (await db.accountAiUsage.findUnique({
      where: { accountId_periodKey: { accountId, periodKey: period } },
    }))?.requests ?? null,
  });
  const expectReason = async (work: Promise<unknown>, reason: string) => {
    await assert.rejects(work, (error: unknown) => error instanceof AiUsageSafetyError && error.reason === reason);
  };
  try {
    const { account, tenant } = await mapped(shop);
    await db.channelConnection.create({ data: {
      accountId: account.id, channel: "AMAZON", externalAccountId: "seller-1",
    } });
    await db.aiUsage.create({ data: { shop, month, requests: 4 } });
    await db.accountAiUsage.create({ data: { accountId: account.id, periodKey: month, requests: 4 } });
    const input = { db, shop, tenant, month, limit };
    assert.equal(await reserveAiUsage(input), "RESERVED");
    assert.deepEqual(await counts(shop, account.id), { legacy: 5, shadow: 5 });
    await compensateAiUsage(input);
    assert.deepEqual(await counts(shop, account.id), { legacy: 4, shadow: 4 });
    await compensateAiUsage({ ...input, month: "2026-10" }).then(
      () => assert.fail("missing compensation should fail"),
      (error: unknown) => assert.ok(error instanceof AiUsageSafetyError),
    );
    assert.deepEqual(await counts(shop, account.id), { legacy: 4, shadow: 4 });

    await db.aiUsage.update({ where: { shop_month: { shop, month } }, data: { requests: 100 } });
    await db.accountAiUsage.update({ where: { accountId_periodKey: { accountId: account.id, periodKey: month } }, data: { requests: 100 } });
    assert.equal(await reserveAiUsage(input), "QUOTA_EXCEEDED");
    assert.deepEqual(await counts(shop, account.id), { legacy: 100, shadow: 100 });
    await db.aiUsage.update({ where: { shop_month: { shop, month } }, data: { requests: 4 } });
    await db.accountAiUsage.update({ where: { accountId_periodKey: { accountId: account.id, periodKey: month } }, data: { requests: 4 } });

    assert.equal(await reserveAiUsage({ ...input, month: "2026-10" }), "RESERVED");
    assert.deepEqual(await counts(shop, account.id, "2026-10"), { legacy: 1, shadow: 1 });
    await compensateAiUsage({ ...input, month: "2026-10" });
    assert.deepEqual(await counts(shop, account.id, "2026-10"), { legacy: 0, shadow: 0 });
    assert.equal(await db.accountAiUsage.count(), 2);

    await db.accountAiUsage.update({ where: { accountId_periodKey: { accountId: account.id, periodKey: month } }, data: { requests: 3 } });
    await expectReason(reserveAiUsage(input), "SHADOW_MISMATCH");
    await expectReason(compensateAiUsage(input), "COMPENSATION_BLOCKED");
    assert.deepEqual(await counts(shop, account.id), { legacy: 4, shadow: 3 });
    await db.accountAiUsage.update({ where: { accountId_periodKey: { accountId: account.id, periodKey: month } }, data: { requests: 4 } });

    await db.accountAiUsage.delete({ where: { accountId_periodKey: { accountId: account.id, periodKey: month } } });
    await expectReason(reserveAiUsage(input), "SHADOW_MISSING");
    assert.deepEqual(await counts(shop, account.id), { legacy: 4, shadow: null });
    await db.aiUsage.delete({ where: { shop_month: { shop, month } } });
    await db.accountAiUsage.create({ data: { accountId: account.id, periodKey: month, requests: 4 } });
    await expectReason(reserveAiUsage(input), "LEGACY_MISSING");
    assert.deepEqual(await counts(shop, account.id), { legacy: null, shadow: 4 });
    await db.aiUsage.create({ data: { shop, month, requests: 4 } });

    await expectReason(reserveAiUsage({ ...input, tenant: { ...tenant, accountId: "wrong-account" } }), "TENANT_MAPPING_INVALID");
    await expectReason(reserveAiUsage({ ...input, tenant: { ...tenant, channelConnectionId: "wrong-connection" } }), "TENANT_MAPPING_INVALID");
    await expectReason(reserveAiUsage({ ...input, shop: "absent.myshopify.com", tenant: {
      ...tenant, legacyShopDomain: "absent.myshopify.com",
    } }), "TENANT_MAPPING_INVALID");
    const inactive = await mapped("inactive.myshopify.com", undefined, "DISCONNECTED");
    await expectReason(reserveAiUsage({ db, shop: "inactive.myshopify.com", tenant: inactive.tenant, month, limit }), "TENANT_MAPPING_INVALID");
    assert.deepEqual(await counts(shop, account.id), { legacy: 4, shadow: 4 });
    const second = await mapped("second.myshopify.com", account.id);
    await expectReason(reserveAiUsage(input), "AMBIGUOUS_SHOPIFY_OWNERSHIP");
    await expectReason(reserveAiUsage({ db, shop: "second.myshopify.com", tenant: second.tenant, month, limit }), "AMBIGUOUS_SHOPIFY_OWNERSHIP");
    assert.deepEqual(await counts(shop, account.id), { legacy: 4, shadow: 4 });
    await db.legacyShopMapping.delete({ where: { shopDomain: "second.myshopify.com" } });
    await db.channelConnection.delete({ where: { id: second.connection.id } });

    // A repeated submission is still a separate accepted legacy request.
    assert.equal(await reserveAiUsage(input), "RESERVED");
    assert.equal(await reserveAiUsage(input), "RESERVED");
    assert.deepEqual(await counts(shop, account.id), { legacy: 6, shadow: 6 });
    const concurrent = await Promise.allSettled([reserveAiUsage(input), reserveAiUsage(input)]);
    const committed = concurrent.filter((item) => item.status === "fulfilled" && item.value === "RESERVED").length;
    assert.ok(committed >= 0 && committed <= 2);
    assert.deepEqual(await counts(shop, account.id), { legacy: 6 + committed, shadow: 6 + committed });

    const beforeFailure = await counts(shop, account.id);
    await db.$executeRawUnsafe(`CREATE TRIGGER reject_shadow_update BEFORE UPDATE ON "AccountAiUsage" BEGIN SELECT RAISE(ABORT, 'test shadow failure'); END`);
    await assert.rejects(reserveAiUsage(input));
    assert.deepEqual(await counts(shop, account.id), beforeFailure);
    await db.$executeRawUnsafe(`DROP TRIGGER reject_shadow_update`);

    const route = readFileSync(path.join(process.cwd(), "app/routes/app.ai-advisor.tsx"), "utf8");
    assert.match(route, /const usage = growthAccess\s*\? await prisma\.accountAiUsage\.findUnique/);
    assert.match(route, /if \(!hasGrowthAccess\(billing\)\)/);
    assert.match(route, /const MONTHLY_AI_LIMIT = 100/);
    assert.match(route, /getUTCFullYear\(\)/);
    assert.match(route, /reserveAccountAiUsage\(\{/);
    assert.match(route, /compensateAccountAiUsage\(\{/);
    assert.doesNotMatch(route, /prisma\.aiUsage\.findUnique/);
    assert.doesNotMatch(route, /tx\.aiUsage\.upsert|prisma\.aiUsage\.updateMany/);
    const openai = readFileSync(path.join(process.cwd(), "app/utils/openai.server.ts"), "utf8");
    assert.doesNotMatch(openai, /aiUsage|accountAiUsage/);
    assert.equal((await db.channelConnection.count({ where: { channel: "AMAZON" } })), 1);
    console.log("T9C2 legacy service characterization, safety states and concurrency passed; route now uses T9E Account authority.");
  } finally {
    await db.$disconnect();
  }
} finally {
  try { sqlite.close(); } catch { /* already closed */ }
  rmSync(directory, { recursive: true, force: true });
}
