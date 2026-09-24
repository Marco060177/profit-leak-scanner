import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-t7-"));
const databasePath = path.join(directory, "t7.sqlite");
const migrations = path.join(process.cwd(), "prisma/migrations");
const t7 = "20260923130000_profit_assumptions_shadow_owner";
const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA foreign_keys = ON");
const economicKeys = [
  "monthlyAds", "monthlyShipping", "monthlyOperating",
  "paymentFeePct", "transactionFeePct", "taxReservePct",
] as const;
const economics = (row: Record<string, unknown>) =>
  Object.fromEntries(economicKeys.map((key) => [key, row[key]]));
const sampleResult = (row: Record<string, unknown>) => {
  const revenue = 1000;
  const grossProfit = 430;
  const periodFraction = 0.5;
  const monthlyFixed = Number(row.monthlyAds) + Number(row.monthlyShipping) + Number(row.monthlyOperating);
  const variable = revenue * (Number(row.paymentFeePct) + Number(row.transactionFeePct) + Number(row.taxReservePct)) / 100;
  return { monthlyFixed, variable, estimatedNetProfit: grossProfit - monthlyFixed * periodFraction - variable };
};

try {
  for (const name of readdirSync(migrations).filter((entry) => /^\d{14}_/.test(entry)).sort()) {
    if (name === t7) break;
    sqlite.exec(readFileSync(path.join(migrations, name, "migration.sql"), "utf8"));
  }
  sqlite.exec(`INSERT INTO "ProfitAssumptions" ("id","shop","monthlyAds","monthlyShipping","monthlyOperating","paymentFeePct","transactionFeePct","taxReservePct","createdAt","updatedAt") VALUES ('before','before.myshopify.com',123.45,67.89,10.5,2.9,0.5,7.25,'2026-01-01T00:00:00.000Z','2026-01-02T00:00:00.000Z')`);
  const before = sqlite.prepare(`SELECT * FROM "ProfitAssumptions" WHERE id='before'`).get() as Record<string, unknown>;
  sqlite.exec(readFileSync(path.join(migrations, t7, "migration.sql"), "utf8"));
  const after = sqlite.prepare(`SELECT * FROM "ProfitAssumptions" WHERE id='before'`).get() as Record<string, unknown>;
  assert.deepEqual(Object.fromEntries(Object.entries(after).filter(([key]) => key !== "channelConnectionId")), { ...before });
  assert.deepEqual(economics(after), economics(before));
  assert.deepEqual(sampleResult(after), sampleResult(before));
  assert.equal(after.channelConnectionId, null);
  assert.throws(() => sqlite.exec(`INSERT INTO "ProfitAssumptions" ("id","shop","updatedAt") VALUES ('duplicate','before.myshopify.com','2026-01-02T00:00:00.000Z')`), /UNIQUE/);
  assert.equal((sqlite.prepare(`SELECT "on_delete" FROM pragma_foreign_key_list('ProfitAssumptions')`).get() as { on_delete: string }).on_delete, "RESTRICT");
  const defaults = sqlite.prepare(`SELECT name,dflt_value FROM pragma_table_info('ProfitAssumptions')`).all() as { name: string; dflt_value: string | null }[];
  for (const key of economicKeys) assert.equal(defaults.find((column) => column.name === key)?.dflt_value, "0");
  sqlite.exec('ALTER TABLE "Account" ADD COLUMN "status" TEXT NOT NULL DEFAULT \'ACTIVE\'');
  sqlite.exec('ALTER TABLE "Account" ADD COLUMN "deletionRequestedAt" DATETIME');
  sqlite.close();
  process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;

  const [{ PrismaClient }, { runProfitAssumptionsShadowBackfill }] = await Promise.all([
    import("@prisma/client"), import("../../scripts/tenancy-t7-profit-assumptions-backfill"),
  ]);
  const db = new PrismaClient();
  const makeRow = (id: string, shop: string) => db.profitAssumptions.create({ data: { id, shop } });
  const makeMapping = async (shop: string, channel: "SHOPIFY" | "AMAZON" = "SHOPIFY", external = shop, status = "ACTIVE") => {
    const account = await db.account.create({ data: {} });
    const connection = await db.channelConnection.create({ data: { accountId: account.id, channel, externalAccountId: external, status } });
    await db.legacyShopMapping.create({ data: { shopDomain: shop, accountId: account.id, channelConnectionId: connection.id } });
    return { account, connection };
  };
  try {
    const valid = await makeMapping("before.myshopify.com");
    const beforeDryRun = await db.profitAssumptions.findUniqueOrThrow({ where: { shop: "before.myshopify.com" } });
    assert.equal((await runProfitAssumptionsShadowBackfill(db)).counts.READY, 1);
    assert.deepEqual(await db.profitAssumptions.findUniqueOrThrow({ where: { shop: "before.myshopify.com" } }), beforeDryRun);
    assert.equal((await runProfitAssumptionsShadowBackfill(db, true)).updated, 1);
    const assigned = await db.profitAssumptions.findUniqueOrThrow({ where: { shop: "before.myshopify.com" } });
    assert.equal(assigned.channelConnectionId, valid.connection.id);
    assert.deepEqual(economics(assigned as unknown as Record<string, unknown>), economics(beforeDryRun as unknown as Record<string, unknown>));
    assert.deepEqual(sampleResult(assigned as unknown as Record<string, unknown>), sampleResult(beforeDryRun as unknown as Record<string, unknown>));
    assert.equal((await runProfitAssumptionsShadowBackfill(db, true)).counts.ALREADY_MATCHED, 1);
    assert.equal((await runProfitAssumptionsShadowBackfill(db, true)).updated, 0);
    await assert.rejects(db.channelConnection.delete({ where: { id: valid.connection.id } }));

    await makeRow("missing", "missing.myshopify.com");
    assert.equal((await runProfitAssumptionsShadowBackfill(db)).counts.MISSING_MAPPING, 1);
    assert.equal((await runProfitAssumptionsShadowBackfill(db, true)).updated, 0);
    assert.equal(await db.account.count(), 1);
    await makeRow("ready-mixed", "ready-mixed.myshopify.com");
    await makeMapping("ready-mixed.myshopify.com");
    assert.equal((await runProfitAssumptionsShadowBackfill(db, true)).updated, 0);
    assert.equal((await db.profitAssumptions.findUniqueOrThrow({ where: { id: "ready-mixed" } })).channelConnectionId, null);

    await makeRow("wrong", "wrong.myshopify.com");
    await makeMapping("wrong.myshopify.com", "AMAZON");
    await makeRow("external", "external.myshopify.com");
    await makeMapping("external.myshopify.com", "SHOPIFY", "elsewhere.myshopify.com");
    await makeRow("inactive", "inactive.myshopify.com");
    await makeMapping("inactive.myshopify.com", "SHOPIFY", "inactive.myshopify.com", "DISCONNECTED");
    await makeRow("invalid", "invalid.example.com");
    await makeRow("conflict", "conflict.myshopify.com");
    await makeMapping("conflict.myshopify.com");
    await db.profitAssumptions.update({ where: { id: "conflict" }, data: { channelConnectionId: valid.connection.id } });
    const summary = await runProfitAssumptionsShadowBackfill(db);
    for (const reason of ["WRONG_CHANNEL", "EXTERNAL_ID_MISMATCH", "UNSAFE_CONNECTION_STATUS", "INVALID_SHOP", "SHADOW_CONFLICT"] as const) {
      assert.equal(summary.counts[reason], 1);
    }
    assert.equal((await runProfitAssumptionsShadowBackfill(db, true)).updated, 0);
    assert.equal((await db.profitAssumptions.findUniqueOrThrow({ where: { id: "conflict" } })).channelConnectionId, valid.connection.id);

    const inconsistent = await makeMapping("inconsistent.myshopify.com");
    await makeRow("inconsistent", "inconsistent.myshopify.com");
    const otherAccount = await db.account.create({ data: {} });
    const corrupt = new DatabaseSync(databasePath);
    corrupt.exec("PRAGMA foreign_keys = OFF");
    corrupt.prepare(`UPDATE "LegacyShopMapping" SET "accountId"=? WHERE "shopDomain"=?`).run(otherAccount.id, "inconsistent.myshopify.com");
    corrupt.close();
    assert.equal((await runProfitAssumptionsShadowBackfill(db)).counts.INCONSISTENT_MAPPING, 1);
    assert.equal((await runProfitAssumptionsShadowBackfill(db, true)).updated, 0);
    assert.equal((await db.profitAssumptions.findUniqueOrThrow({ where: { id: "inconsistent" } })).channelConnectionId, null);
    assert.equal((await db.channelConnection.findUniqueOrThrow({ where: { id: inconsistent.connection.id } })).accountId, inconsistent.account.id);

    const tool = readFileSync(path.join(process.cwd(), "scripts/tenancy-t7-profit-assumptions-backfill.ts"), "utf8");
    assert.doesNotMatch(tool, /resolveShopifyTenantContext|\.account\.create|\.channelConnection\.create|\.legacyShopMapping\.create|request\.url|URLSearchParams/);
    assert.match(tool, /flag !== "--apply"/);
    for (const route of ["app.profit-assumptions.tsx", "app.forecasting.tsx", "app.recovery-simulator.tsx", "app.ai-advisor.tsx"]) {
      const source = readFileSync(path.join(process.cwd(), "app/routes", route), "utf8");
      assert.ok(/profitAssumptions\.findUnique\(\{\s*where:\s*\{\s*shop:\s*session\.shop/.test(source), `shop-scoped read missing in ${route}`);
      assert.doesNotMatch(source, /channelConnectionId/);
    }
    const write = readFileSync(path.join(process.cwd(), "app/routes/app.profit-assumptions.tsx"), "utf8");
    assert.ok(/profitAssumptions\.upsert\(\{\s*where:\s*\{\s*shop:\s*session\.shop/.test(write), "shop-scoped upsert missing");
    console.log("T7 migration, six-field economics, atomic shadow backfill and shop-authority checks passed.");
  } finally {
    await db.$disconnect();
  }
} finally {
  try { sqlite.close(); } catch { /* already closed */ }
  rmSync(directory, { recursive: true, force: true });
}
