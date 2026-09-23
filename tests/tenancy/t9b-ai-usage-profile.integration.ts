import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-t9b-"));
const databasePath = path.join(directory, "t9b.sqlite");
const migrations = path.join(process.cwd(), "prisma/migrations");
const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA foreign_keys = ON");

try {
  for (const name of readdirSync(migrations).filter((entry) => /^\d{14}_/.test(entry)).sort()) {
    sqlite.exec(readFileSync(path.join(migrations, name, "migration.sql"), "utf8"));
  }
  sqlite.close();
  process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;
  const [{ PrismaClient }, { profileLegacyAiUsage }] = await Promise.all([
    import("@prisma/client"), import("../../scripts/tenancy-t9b-ai-usage-profile"),
  ]);
  const db = new PrismaClient();
  const usage = (id: string, shop: string, month = "2026-09", requests = 1) =>
    db.aiUsage.create({ data: { id, shop, month, requests } });
  const mapping = async (
    shop: string, accountId?: string,
    options: { channel?: "SHOPIFY" | "AMAZON"; external?: string; status?: string } = {},
  ) => {
    const account = accountId
      ? await db.account.findUniqueOrThrow({ where: { id: accountId } })
      : await db.account.create({ data: {} });
    const connection = await db.channelConnection.create({ data: {
      accountId: account.id, channel: options.channel ?? "SHOPIFY",
      externalAccountId: options.external ?? shop, status: options.status ?? "ACTIVE",
    } });
    await db.legacyShopMapping.create({ data: {
      shopDomain: shop, accountId: account.id, channelConnectionId: connection.id,
    } });
    return { account, connection };
  };
  try {
    const first = await mapping("first.myshopify.com");
    await usage("first-aug", "first.myshopify.com", "2026-08", 4);
    await usage("first-sep", "first.myshopify.com", "2026-09", 5);
    await usage("first-nov", "first.myshopify.com", "2026-11", 2);
    await usage("first-nov-case", "FIRST.MYSHOPIFY.COM", "2026-11", 3);
    await mapping("second.myshopify.com");
    await usage("second-sep", "second.myshopify.com", "2026-09", 7);
    await mapping("third.myshopify.com", first.account.id);
    await usage("third-sep", "third.myshopify.com", "2026-09", 11);
    await mapping("fourth.myshopify.com", first.account.id);
    await usage("fourth-sep", "fourth.myshopify.com", "2026-09", 13);
    await usage("missing", "missing.myshopify.com");
    await usage("invalid-shop", "invalid.example.com");
    await usage("invalid-period", "first.myshopify.com", "2026-13");
    await usage("invalid-count", "first.myshopify.com", "2026-10", -1);
    await mapping("wrong.myshopify.com", undefined, { channel: "AMAZON" });
    await usage("wrong", "wrong.myshopify.com");
    await mapping("external.myshopify.com", undefined, { external: "other.myshopify.com" });
    await usage("external", "external.myshopify.com");
    await mapping("inactive.myshopify.com", undefined, { status: "DISCONNECTED" });
    await usage("inactive", "inactive.myshopify.com");
    const inconsistent = await mapping("inconsistent.myshopify.com");
    await usage("inconsistent", "inconsistent.myshopify.com");
    const otherAccount = await db.account.create({ data: {} });
    const corrupt = new DatabaseSync(databasePath);
    corrupt.exec("PRAGMA foreign_keys = OFF");
    corrupt.prepare(`UPDATE "LegacyShopMapping" SET "accountId"=? WHERE "shopDomain"=?`).run(
      otherAccount.id, "inconsistent.myshopify.com",
    );
    corrupt.close();
    assert.equal((await db.channelConnection.findUniqueOrThrow({ where: { id: inconsistent.connection.id } })).accountId, inconsistent.account.id);
    await db.channelConnection.create({ data: {
      accountId: first.account.id, channel: "AMAZON", externalAccountId: "amazon-seller-1",
    } });
    const before = await Promise.all([
      db.aiUsage.findMany({ orderBy: { id: "asc" } }),
      db.account.findMany({ orderBy: { id: "asc" } }),
      db.channelConnection.findMany({ orderBy: { id: "asc" } }),
      db.legacyShopMapping.findMany({ orderBy: { shopDomain: "asc" } }),
    ]);

    const result = await profileLegacyAiUsage(db);
    const byId = Object.fromEntries(result.rows.map((row) => [row.id, row]));
    assert.equal(byId["first-aug"].category, "READY");
    assert.equal(byId["second-sep"].category, "READY");
    assert.equal(byId["first-nov"].category, "DUPLICATE_NORMALIZED_SHOP_PERIOD");
    assert.equal(byId["first-nov-case"].category, "DUPLICATE_NORMALIZED_SHOP_PERIOD");
    for (const id of ["first-sep", "third-sep", "fourth-sep"]) {
      assert.equal(byId[id].category, "ACCOUNT_PERIOD_COLLISION");
    }
    assert.equal(byId.missing.category, "MISSING_MAPPING");
    assert.equal(byId["invalid-shop"].category, "INVALID_SHOP");
    assert.equal(byId["invalid-period"].category, "INVALID_PERIOD");
    assert.equal(byId["invalid-count"].category, "INVALID_REQUEST_COUNT");
    assert.equal(byId.wrong.category, "WRONG_CHANNEL");
    assert.equal(byId.external.category, "EXTERNAL_ID_MISMATCH");
    assert.equal(byId.inactive.category, "UNSAFE_CONNECTION_STATUS");
    assert.equal(byId.inconsistent.category, "INCONSISTENT_MAPPING");
    assert.equal(result.summary.safeSingleShopGroups, 2);
    assert.equal(result.summary.collisionGroups, 1);
    assert.equal(result.summary.collisionRows, 3);
    assert.equal(result.summary.duplicateNormalizedShopGroups, 1);
    assert.deepEqual(result.summary.collisionSummaries, [{
      rowCount: 3, distinctShopCount: 3, diagnosticRequestSum: 29,
      minRequests: 5, maxRequests: 13,
    }]);
    assert.equal(await db.accountAiUsage.count(), 0);
    assert.deepEqual(await profileLegacyAiUsage(db), result);
    assert.deepEqual(await Promise.all([
      db.aiUsage.findMany({ orderBy: { id: "asc" } }),
      db.account.findMany({ orderBy: { id: "asc" } }),
      db.channelConnection.findMany({ orderBy: { id: "asc" } }),
      db.legacyShopMapping.findMany({ orderBy: { shopDomain: "asc" } }),
    ]), before);
    assert.equal(await db.accountAiUsage.count(), 0);
    const operationalOutput = JSON.stringify({ mode: "read-only", ...result.summary });
    for (const secret of ["myshopify.com", first.account.id, inconsistent.connection.id, "amazon-seller-1"]) {
      assert.ok(!operationalOutput.includes(secret));
    }

    const script = readFileSync(path.join(process.cwd(), "scripts/tenancy-t9b-ai-usage-profile.ts"), "utf8");
    assert.doesNotMatch(script, /resolveShopifyTenantContext|\.create\(|\.update\(|\.upsert\(|\.delete\(|\.createMany\(|\.updateMany\(|\.deleteMany\(|\$transaction/);
    const command = ["--experimental-strip-types", "--loader", "./tests/tenancy/loader.mjs", "scripts/tenancy-t9b-ai-usage-profile.ts"];
    const operational = spawnSync(process.execPath, command, {
      cwd: process.cwd(), env: process.env, encoding: "utf8",
    });
    assert.equal(operational.status, 0);
    assert.equal(JSON.parse(operational.stdout).collisionGroups, 1);
    assert.doesNotMatch(operational.stdout + operational.stderr, /myshopify\.com|amazon-seller-1/);
    for (const identifier of [first.account.id, inconsistent.connection.id]) {
      assert.ok(!operational.stdout.includes(identifier));
    }
    const rejected = spawnSync(process.execPath, [
      ...command, "--apply",
    ], { cwd: process.cwd(), env: process.env, encoding: "utf8" });
    assert.equal(rejected.status, 2);
    assert.doesNotMatch(rejected.stdout + rejected.stderr, /myshopify\.com|amazon-seller-1/);
    assert.equal(await db.accountAiUsage.count(), 0);
    console.log("T9B read-only classifications, collision diagnostics, privacy, repeatability and zero-write checks passed.");
  } finally {
    await db.$disconnect();
  }
} finally {
  try { sqlite.close(); } catch { /* already closed */ }
  rmSync(directory, { recursive: true, force: true });
}
