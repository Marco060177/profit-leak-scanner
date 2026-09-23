import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-t9c1-"));
const databasePath = path.join(directory, "t9c1.sqlite");
const migrations = path.join(process.cwd(), "prisma/migrations");
const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA foreign_keys = ON");

try {
  for (const name of readdirSync(migrations).filter((entry) => /^\d{14}_/.test(entry)).sort()) {
    sqlite.exec(readFileSync(path.join(migrations, name, "migration.sql"), "utf8"));
  }
  sqlite.close();
  process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;
  const [{ PrismaClient }, { runAccountAiUsageBackfill }] = await Promise.all([
    import("@prisma/client"), import("../../scripts/tenancy-t9c1-ai-usage-backfill"),
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
  const snapshot = () => Promise.all([
    db.aiUsage.findMany({ orderBy: { id: "asc" } }),
    db.account.findMany({ orderBy: { id: "asc" } }),
    db.channelConnection.findMany({ orderBy: { id: "asc" } }),
    db.legacyShopMapping.findMany({ orderBy: { shopDomain: "asc" } }),
  ]);
  try {
    const first = await mapping("first.myshopify.com");
    await usage("first-aug", "first.myshopify.com", "2026-08", 4);
    await usage("first-sep", "first.myshopify.com", "2026-09", 5);
    await db.channelConnection.create({ data: {
      accountId: first.account.id, channel: "AMAZON", externalAccountId: "amazon-seller-1",
    } });
    const second = await mapping("second.myshopify.com");
    await usage("second-sep", "second.myshopify.com", "2026-09", 7);

    const sourceBefore = await snapshot();
    const dry = await runAccountAiUsageBackfill(db);
    assert.deepEqual([dry.outcome, dry.eligibleGroups, dry.wouldCreate, dry.alreadyMatching, dry.conflicts, dry.created],
      ["READY", 3, 3, 0, 0, 0]);
    assert.deepEqual(await runAccountAiUsageBackfill(db), dry);
    assert.equal(await db.accountAiUsage.count(), 0);
    assert.deepEqual(await snapshot(), sourceBefore);

    const command = ["--experimental-strip-types", "--loader", "./tests/tenancy/loader.mjs", "scripts/tenancy-t9c1-ai-usage-backfill.ts"];
    const cli = spawnSync(process.execPath, command, {
      cwd: process.cwd(), env: process.env, encoding: "utf8",
    });
    assert.equal(cli.status, 0);
    assert.equal(JSON.parse(cli.stdout).wouldCreate, 3);
    for (const secret of ["myshopify.com", first.account.id, first.connection.id, "amazon-seller-1"]) {
      assert.ok(!(cli.stdout + cli.stderr).includes(secret));
    }
    assert.equal(await db.accountAiUsage.count(), 0);

    const applied = await runAccountAiUsageBackfill(db, true);
    assert.deepEqual([applied.outcome, applied.created, applied.wouldCreate], ["APPLIED", 3, 3]);
    assert.deepEqual((await db.accountAiUsage.findMany({
      select: { accountId: true, periodKey: true, requests: true },
      orderBy: [{ accountId: "asc" }, { periodKey: "asc" }],
    })).map((row) => [row.accountId, row.periodKey, row.requests]).sort(), [
      [first.account.id, "2026-08", 4], [first.account.id, "2026-09", 5],
      [second.account.id, "2026-09", 7],
    ].sort());
    assert.deepEqual(await snapshot(), sourceBefore);
    const repeat = await runAccountAiUsageBackfill(db, true);
    assert.deepEqual([repeat.outcome, repeat.created, repeat.alreadyMatching], ["APPLIED", 0, 3]);
    assert.equal(await db.accountAiUsage.count(), 3);

    await db.accountAiUsage.update({
      where: { accountId_periodKey: { accountId: first.account.id, periodKey: "2026-08" } },
      data: { requests: 99 },
    });
    await usage("first-oct", "first.myshopify.com", "2026-10", 8);
    const conflict = await runAccountAiUsageBackfill(db);
    assert.deepEqual([conflict.outcome, conflict.conflicts, conflict.wouldCreate], ["BLOCKED", 1, 1]);
    const beforeBlocked = await db.accountAiUsage.findMany({ orderBy: { id: "asc" } });
    const blocked = await runAccountAiUsageBackfill(db, true);
    assert.deepEqual([blocked.outcome, blocked.created], ["BLOCKED", 0]);
    assert.deepEqual(await db.accountAiUsage.findMany({ orderBy: { id: "asc" } }), beforeBlocked);
    assert.equal((await db.accountAiUsage.findUniqueOrThrow({
      where: { accountId_periodKey: { accountId: first.account.id, periodKey: "2026-08" } },
    })).requests, 99);
    await db.accountAiUsage.update({
      where: { accountId_periodKey: { accountId: first.account.id, periodKey: "2026-08" } },
      data: { requests: 4 },
    });

    await mapping("third.myshopify.com", first.account.id);
    await usage("collision", "third.myshopify.com", "2026-09", 11);
    await usage("duplicate", "FIRST.MYSHOPIFY.COM", "2026-10", 9);
    await usage("missing", "missing.myshopify.com");
    await usage("invalid-shop", "invalid.example.com");
    await usage("invalid-period", "first.myshopify.com", "2026-13");
    await usage("invalid-count", "first.myshopify.com", "2026-11", -1);
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

    const unsafe = await runAccountAiUsageBackfill(db);
    assert.equal(unsafe.outcome, "BLOCKED");
    for (const reason of [
      "ACCOUNT_PERIOD_COLLISION", "DUPLICATE_NORMALIZED_SHOP_PERIOD", "MISSING_MAPPING",
      "INCONSISTENT_MAPPING", "WRONG_CHANNEL", "EXTERNAL_ID_MISMATCH",
      "UNSAFE_CONNECTION_STATUS", "INVALID_SHOP", "INVALID_PERIOD", "INVALID_REQUEST_COUNT",
    ] as const) assert.ok(unsafe.sourceCounts[reason] > 0, `${reason} missing`);
    const allBefore = await snapshot();
    const targetBefore = await db.accountAiUsage.findMany({ orderBy: { id: "asc" } });
    assert.deepEqual(await runAccountAiUsageBackfill(db), unsafe);
    const unsafeApply = await runAccountAiUsageBackfill(db, true);
    assert.deepEqual([unsafeApply.outcome, unsafeApply.created], ["BLOCKED", 0]);
    assert.deepEqual(await snapshot(), allBefore);
    assert.deepEqual(await db.accountAiUsage.findMany({ orderBy: { id: "asc" } }), targetBefore);

    const blockedCli = spawnSync(process.execPath, [...command, "--apply"], {
      cwd: process.cwd(), env: process.env, encoding: "utf8",
    });
    assert.equal(blockedCli.status, 1);
    assert.equal(JSON.parse(blockedCli.stdout).created, 0);
    for (const secret of ["myshopify.com", first.account.id, first.connection.id, "amazon-seller-1"]) {
      assert.ok(!(blockedCli.stdout + blockedCli.stderr).includes(secret));
    }
    assert.deepEqual(await db.accountAiUsage.findMany({ orderBy: { id: "asc" } }), targetBefore);
    console.log("T9C1 dry-run, atomic apply, idempotency, conflict/unsafe block, privacy and legacy preservation passed.");
  } finally {
    await db.$disconnect();
  }
} finally {
  try { sqlite.close(); } catch { /* already closed */ }
  rmSync(directory, { recursive: true, force: true });
}
