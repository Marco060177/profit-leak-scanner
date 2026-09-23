import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-t9d-"));
const databasePath = path.join(directory, "t9d.sqlite");
const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA foreign_keys = ON");
try {
  for (const name of readdirSync(path.join(process.cwd(), "prisma/migrations")).filter((entry) => /^\d{14}_/.test(entry)).sort()) {
    sqlite.exec(readFileSync(path.join(process.cwd(), "prisma/migrations", name, "migration.sql"), "utf8"));
  }
  sqlite.close();
  process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;
  const [{ PrismaClient }, { reconcileAiUsage }, { reserveAiUsage }] = await Promise.all([
    import("@prisma/client"), import("../../scripts/tenancy-t9d-ai-usage-reconcile"),
    import("../../app/services/ai-usage-shadow.server"),
  ]);
  const db = new PrismaClient();
  const now = new Date("2026-09-23T12:00:00.000Z");
  let serial = 0;
  const shop = () => `shop${++serial}.myshopify.com`;
  const owner = async (domain = shop(), accountId?: string, options: { channel?: "SHOPIFY" | "AMAZON"; status?: string; external?: string } = {}) => {
    const account = accountId ? await db.account.findUniqueOrThrow({ where: { id: accountId } }) : await db.account.create({ data: {} });
    const connection = await db.channelConnection.create({ data: {
      accountId: account.id, channel: options.channel ?? "SHOPIFY", status: options.status ?? "ACTIVE",
      externalAccountId: options.external ?? domain,
    } });
    await db.legacyShopMapping.create({ data: { shopDomain: domain, accountId: account.id, channelConnectionId: connection.id } });
    return { domain, account, connection };
  };
  const legacy = (domain: string, period = "2026-09", requests = 1) =>
    db.aiUsage.create({ data: { shop: domain, month: period, requests } });
  const target = (accountId: string, period = "2026-09", requests = 1) =>
    db.accountAiUsage.create({ data: { accountId, periodKey: period, requests } });
  const report = () => reconcileAiUsage(db, now);
  const check = async (reason: string) => {
    const result = await report();
    assert.equal(result.verdict, "BLOCKED");
    assert.ok(result.counts[reason as keyof typeof result.counts] > 0, `${reason} not found`);
  };
  const reset = async () => {
    await db.accountAiUsage.deleteMany();
    await db.aiUsage.deleteMany();
    await db.legacyShopMapping.deleteMany();
    await db.channelConnection.deleteMany();
    await db.account.deleteMany();
  };
  try {
    const first = await owner();
    await legacy(first.domain, "2026-08", 4);
    await target(first.account.id, "2026-08", 4);
    await legacy(first.domain, "2026-09", 0);
    await target(first.account.id, "2026-09", 0);
    await db.channelConnection.create({ data: { accountId: first.account.id, channel: "AMAZON", externalAccountId: "amazon-seller" } });
    let result = await report();
    assert.equal(result.verdict, "READY_FOR_T9E");
    assert.equal(result.matchedPairs, 2);
    assert.equal(result.current.matchedPairs, 1);
    assert.equal(result.historical.matchedPairs, 1);
    assert.deepEqual(await report(), result);
    const command = ["--experimental-strip-types", "--loader", "./tests/tenancy/loader.mjs", "scripts/tenancy-t9d-ai-usage-reconcile.ts"];
    const readyCli = spawnSync(process.execPath, command, { cwd: process.cwd(), env: process.env, encoding: "utf8" });
    assert.equal(readyCli.status, 0);
    assert.equal(JSON.parse(readyCli.stdout).verdict, "READY_FOR_T9E");
    const before = await Promise.all([db.aiUsage.findMany(), db.accountAiUsage.findMany()]);
    await report();
    assert.deepEqual(await Promise.all([db.aiUsage.findMany(), db.accountAiUsage.findMany()]), before);
    assert.doesNotMatch(JSON.stringify(result), /myshopify|amazon-seller|accountId|channelConnectionId/);

    await db.accountAiUsage.delete({ where: { accountId_periodKey: { accountId: first.account.id, periodKey: "2026-09" } } });
    await check("LEGACY_ONLY"); // A zero row is not absence.
    await target(first.account.id, "2026-09", 2);
    await check("COUNT_MISMATCH");
    await db.accountAiUsage.update({ where: { accountId_periodKey: { accountId: first.account.id, periodKey: "2026-09" } }, data: { requests: 0 } });
    await db.aiUsage.delete({ where: { shop_month: { shop: first.domain, month: "2026-08" } } });
    await check("ACCOUNT_ONLY"); // Also characterizes possible SHOP_REDACT divergence.
    await reset();

    const second = await owner();
    await legacy(second.domain, "2026-09", 1);
    await target(second.account.id, "2026-09", 1);
    assert.equal((await report()).verdict, "READY_FOR_T9E"); // T9C2-compatible paired month.
    await legacy(second.domain, "2026-07", 3);
    await target(second.account.id, "2026-07", 3);
    assert.equal((await report()).verdict, "READY_FOR_T9E"); // T9C1 historical copy.
    const tenant = {
      accountId: second.account.id, channelConnectionId: second.connection.id,
      channel: "SHOPIFY" as const, legacyShopDomain: second.domain,
    };
    const concurrent = await Promise.allSettled([
      report(), reserveAiUsage({ db, shop: second.domain, tenant, month: "2026-09", limit: 100 }),
    ]);
    assert.equal(concurrent[0].status, "fulfilled");
    assert.equal(concurrent[1].status, "fulfilled");
    assert.equal((concurrent[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof report>>>).value.verdict, "READY_FOR_T9E");
    assert.equal((await report()).verdict, "READY_FOR_T9E");
    await legacy(second.domain, "2026-13", 2);
    await check("INVALID_LEGACY_PERIOD");
    await db.aiUsage.delete({ where: { shop_month: { shop: second.domain, month: "2026-13" } } });
    await legacy(second.domain, "2026-06", -1);
    await check("INVALID_LEGACY_COUNT");
    await db.aiUsage.delete({ where: { shop_month: { shop: second.domain, month: "2026-06" } } });
    await target(second.account.id, "2026-13", 2);
    await check("INVALID_ACCOUNT_PERIOD");
    await db.accountAiUsage.delete({ where: { accountId_periodKey: { accountId: second.account.id, periodKey: "2026-13" } } });
    await target(second.account.id, "2026-06", -1);
    await check("INVALID_ACCOUNT_COUNT");
    await reset();

    await legacy("invalid.example.com");
    await check("INVALID_SHOP");
    await reset();
    await legacy(shop());
    await check("MISSING_MAPPING");
    await reset();
    const wrong = await owner(shop(), undefined, { channel: "AMAZON" });
    await legacy(wrong.domain);
    await check("WRONG_CHANNEL");
    await reset();
    const external = await owner(shop(), undefined, { external: "other.myshopify.com" });
    await legacy(external.domain);
    await check("EXTERNAL_ID_MISMATCH");
    await reset();
    const inactive = await owner(shop(), undefined, { status: "DISCONNECTED" });
    await legacy(inactive.domain, "2026-08");
    await check("UNSAFE_CONNECTION_STATUS");
    await reset();

    const multi = await owner();
    await legacy(multi.domain);
    await target(multi.account.id);
    await owner(shop(), multi.account.id);
    await check("AMBIGUOUS_SHOPIFY_OWNERSHIP");
    await reset();
    const collision = await owner();
    const secondShop = await owner(shop(), collision.account.id);
    await legacy(collision.domain);
    await legacy(secondShop.domain);
    await check("ACCOUNT_PERIOD_COLLISION");
    await reset();
    const duplicated = await owner();
    await legacy(duplicated.domain);
    await legacy(duplicated.domain.toUpperCase());
    await check("DUPLICATE_NORMALIZED_SHOP_PERIOD");
    await reset();
    const orphanAccount = await db.account.create({ data: {} });
    await target(orphanAccount.id, "2026-09", 0);
    result = await report();
    assert.equal(result.totalLegacyRows, 0);
    assert.equal(result.totalAccountRows, 1);
    await check("ACCOUNT_ONLY");
    await reset();
    const inconsistent = await owner();
    await legacy(inconsistent.domain);
    const other = await db.account.create({ data: {} });
    const corrupt = new DatabaseSync(databasePath);
    corrupt.exec("PRAGMA foreign_keys = OFF");
    corrupt.prepare('UPDATE "LegacyShopMapping" SET "accountId"=? WHERE "shopDomain"=?').run(other.id, inconsistent.domain);
    corrupt.close();
    await check("INCONSISTENT_MAPPING");

    const blocked = spawnSync(process.execPath, command, { cwd: process.cwd(), env: process.env, encoding: "utf8" });
    assert.equal(blocked.status, 1);
    assert.equal(JSON.parse(blocked.stdout).verdict, "BLOCKED");
    assert.doesNotMatch(blocked.stdout + blocked.stderr, /myshopify|accountId|channelConnectionId/);
    for (const flag of ["--apply", "--unexpected"]) {
      const rejected = spawnSync(process.execPath, [...command, flag], { cwd: process.cwd(), env: process.env, encoding: "utf8" });
      assert.equal(rejected.status, 2);
    }
    console.log("T9D reconciliation, attribution, zero/absent, privacy, CLI and read-only checks passed.");
  } finally {
    await db.$disconnect();
  }
} finally {
  try { sqlite.close(); } catch { /* already closed */ }
  rmSync(directory, { recursive: true, force: true });
}
