import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-t8b-"));
const databasePath = path.join(directory, "t8b.sqlite");
const migrations = path.join(process.cwd(), "prisma/migrations");
const t8b = "20260923150000_profit_impact_shadow_owner";
const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA foreign_keys = ON");

try {
  for (const name of readdirSync(migrations).filter((entry) => /^\d{14}_/.test(entry)).sort()) {
    if (name === t8b) break;
    sqlite.exec(readFileSync(path.join(migrations, name, "migration.sql"), "utf8"));
  }
  sqlite.exec(`INSERT INTO "ProfitImpactAction" ("id","shop","idempotencyKey","measuringProductKey","actionType","status","sourceModule","sourceAlertKey","productId","productTitle","title","changeDescription","currencyCode","previousValue","appliedValue","targetMetric","targetValue","notes","metadataJson","createdAt","updatedAt") VALUES ('old-action','old.myshopify.com','intent:old','123','PRICE_CHANGE','MEASURING','ALERT_CENTER','pricing-opportunity-123','123','Belt','Raise price','Target margin','USD',19.5,24.5,'margin',25,'merchant note','{"sourcePeriod":"30"}','2026-01-01T00:00:00.000Z','2026-01-02T00:00:00.000Z')`);
  sqlite.exec(`INSERT INTO "ProfitImpactMeasurement" ("id","actionId","measurementType","windowStart","windowEnd","observedDays","revenue","economicProfit","economicMarginPct","units","cogs","discounts","refunds") VALUES ('old-measurement','old-action','BASELINE','2025-12-18T00:00:00.000Z','2026-01-01T00:00:00.000Z',14,1000,200,20,40,600,100,0)`);
  sqlite.exec(`INSERT INTO "ProfitImpactEvent" ("id","actionId","toStatus","source","createdAt") VALUES ('old-event','old-action','ACCEPTED','merchant','2026-01-01T00:00:00.000Z')`);
  const beforeAction = sqlite.prepare(`SELECT * FROM "ProfitImpactAction" WHERE id='old-action'`).get() as Record<string, unknown>;
  const beforeMeasurement = sqlite.prepare(`SELECT * FROM "ProfitImpactMeasurement" WHERE id='old-measurement'`).get() as Record<string, unknown>;
  const beforeEvent = sqlite.prepare(`SELECT * FROM "ProfitImpactEvent" WHERE id='old-event'`).get() as Record<string, unknown>;
  sqlite.exec(readFileSync(path.join(migrations, t8b, "migration.sql"), "utf8"));
  const afterAction = sqlite.prepare(`SELECT * FROM "ProfitImpactAction" WHERE id='old-action'`).get() as Record<string, unknown>;
  assert.deepEqual(Object.fromEntries(Object.entries(afterAction).filter(([key]) => key !== "channelConnectionId")), { ...beforeAction });
  assert.equal(afterAction.channelConnectionId, null);
  assert.deepEqual(sqlite.prepare(`SELECT * FROM "ProfitImpactMeasurement" WHERE id='old-measurement'`).get(), beforeMeasurement);
  assert.deepEqual(sqlite.prepare(`SELECT * FROM "ProfitImpactEvent" WHERE id='old-event'`).get(), beforeEvent);
  for (const table of ["ProfitImpactMeasurement", "ProfitImpactEvent"]) {
    const columns = sqlite.prepare(`SELECT name FROM pragma_table_info('${table}')`).all().map((row) => (row as { name: string }).name);
    assert.ok(!columns.includes("channelConnectionId") && !columns.includes("accountId"));
    assert.equal((sqlite.prepare(`SELECT "on_delete" FROM pragma_foreign_key_list('${table}')`).get() as { on_delete: string }).on_delete, "CASCADE");
  }
  assert.equal((sqlite.prepare(`SELECT "on_delete" FROM pragma_foreign_key_list('ProfitImpactAction')`).get() as { on_delete: string }).on_delete, "RESTRICT");
  const indexes = sqlite.prepare(`SELECT name FROM pragma_index_list('ProfitImpactAction')`).all().map((row) => (row as { name: string }).name);
  for (const name of [
    "ProfitImpactAction_shop_status_createdAt_idx", "ProfitImpactAction_shop_productId_status_idx",
    "ProfitImpactAction_shop_sourceAlertKey_idx", "ProfitImpactAction_shop_idempotencyKey_key",
    "ProfitImpactAction_shop_measuringProductKey_key", "ProfitImpactAction_channelConnectionId_idx",
  ]) assert.ok(indexes.includes(name), `${name} missing`);
  const defaults = sqlite.prepare(`SELECT name,dflt_value FROM pragma_table_info('ProfitImpactAction')`).all() as { name: string; dflt_value: string | null }[];
  assert.equal(defaults.find((item) => item.name === "measurementWindowDays")?.dflt_value, "14");
  assert.equal(defaults.find((item) => item.name === "status")?.dflt_value, "'ACCEPTED'");
  assert.throws(() => sqlite.exec(`INSERT INTO "ProfitImpactAction" ("id","shop","idempotencyKey","actionType","sourceModule","title","changeDescription","currencyCode","updatedAt") VALUES ('duplicate','old.myshopify.com','intent:old','OTHER','ALERT_CENTER','x','x','USD','2026-01-02T00:00:00.000Z')`), /UNIQUE/);
  assert.throws(() => sqlite.exec(`INSERT INTO "ProfitImpactAction" ("id","shop","idempotencyKey","measuringProductKey","actionType","sourceModule","title","changeDescription","currencyCode","updatedAt") VALUES ('duplicate-measuring','old.myshopify.com','intent:other','123','OTHER','ALERT_CENTER','x','x','USD','2026-01-02T00:00:00.000Z')`), /UNIQUE/);
  sqlite.exec('ALTER TABLE "Account" ADD COLUMN "status" TEXT NOT NULL DEFAULT \'ACTIVE\'');
  sqlite.exec('ALTER TABLE "Account" ADD COLUMN "deletionRequestedAt" DATETIME');
  sqlite.close();
  process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;

  const [{ PrismaClient }, { runProfitImpactShadowBackfill }] = await Promise.all([
    import("@prisma/client"), import("../../scripts/tenancy-t8b-profit-impact-backfill"),
  ]);
  const db = new PrismaClient();
  const makeAction = (id: string, shop: string) => db.profitImpactAction.create({ data: {
    id, shop, idempotencyKey: id, actionType: "OTHER", sourceModule: "ALERT_CENTER",
    title: "Title", changeDescription: "Description", currencyCode: "USD",
  } });
  const makeMapping = async (shop: string, channel: "SHOPIFY" | "AMAZON" = "SHOPIFY", external = shop, status = "ACTIVE") => {
    const account = await db.account.create({ data: {} });
    const connection = await db.channelConnection.create({ data: { accountId: account.id, channel, externalAccountId: external, status } });
    await db.legacyShopMapping.create({ data: { shopDomain: shop, accountId: account.id, channelConnectionId: connection.id } });
    return { account, connection };
  };
  try {
    const valid = await makeMapping("old.myshopify.com");
    const preDryRun = await db.profitImpactAction.findUniqueOrThrow({ where: { id: "old-action" } });
    assert.equal((await runProfitImpactShadowBackfill(db)).counts.READY, 1);
    assert.deepEqual(await db.profitImpactAction.findUniqueOrThrow({ where: { id: "old-action" } }), preDryRun);
    assert.equal((await runProfitImpactShadowBackfill(db, true)).updated, 1);
    assert.equal((await db.profitImpactAction.findUniqueOrThrow({ where: { id: "old-action" } })).channelConnectionId, valid.connection.id);
    assert.equal((await db.profitImpactMeasurement.count({ where: { actionId: "old-action" } })), 1);
    assert.equal((await db.profitImpactEvent.count({ where: { actionId: "old-action" } })), 1);
    const repeat = await runProfitImpactShadowBackfill(db, true);
    assert.equal(repeat.counts.ALREADY_MATCHED, 1);
    assert.equal(repeat.updated, 0);
    await assert.rejects(db.channelConnection.delete({ where: { id: valid.connection.id } }));

    await makeAction("ready-mixed", "ready-mixed.myshopify.com");
    await makeMapping("ready-mixed.myshopify.com");
    await makeAction("missing", "missing.myshopify.com");
    assert.equal((await runProfitImpactShadowBackfill(db)).counts.MISSING_MAPPING, 1);
    assert.equal((await runProfitImpactShadowBackfill(db, true)).updated, 0);
    assert.equal((await db.profitImpactAction.findUniqueOrThrow({ where: { id: "ready-mixed" } })).channelConnectionId, null);
    assert.equal(await db.account.count(), 2);
    assert.equal(await db.channelConnection.count(), 2);
    assert.equal(await db.legacyShopMapping.count(), 2);

    await makeAction("wrong", "wrong.myshopify.com");
    await makeMapping("wrong.myshopify.com", "AMAZON");
    await makeAction("external", "external.myshopify.com");
    await makeMapping("external.myshopify.com", "SHOPIFY", "elsewhere.myshopify.com");
    await makeAction("inactive", "inactive.myshopify.com");
    await makeMapping("inactive.myshopify.com", "SHOPIFY", "inactive.myshopify.com", "DISCONNECTED");
    await makeAction("invalid", "invalid.example.com");
    await makeAction("conflict", "conflict.myshopify.com");
    await makeMapping("conflict.myshopify.com");
    await db.profitImpactAction.update({ where: { id: "conflict" }, data: { channelConnectionId: valid.connection.id } });
    const reasons = await runProfitImpactShadowBackfill(db);
    for (const name of ["WRONG_CHANNEL", "EXTERNAL_ID_MISMATCH", "UNSAFE_CONNECTION_STATUS", "INVALID_SHOP", "SHADOW_CONFLICT"] as const) {
      assert.equal(reasons.counts[name], 1);
    }
    assert.equal((await runProfitImpactShadowBackfill(db, true)).updated, 0);
    assert.equal((await db.profitImpactAction.findUniqueOrThrow({ where: { id: "conflict" } })).channelConnectionId, valid.connection.id);

    const inconsistent = await makeMapping("inconsistent.myshopify.com");
    await makeAction("inconsistent", "inconsistent.myshopify.com");
    const otherAccount = await db.account.create({ data: {} });
    const corrupt = new DatabaseSync(databasePath);
    corrupt.exec("PRAGMA foreign_keys = OFF");
    corrupt.prepare(`UPDATE "LegacyShopMapping" SET "accountId"=? WHERE "shopDomain"=?`).run(otherAccount.id, "inconsistent.myshopify.com");
    corrupt.close();
    assert.equal((await runProfitImpactShadowBackfill(db)).counts.INCONSISTENT_MAPPING, 1);
    assert.equal((await runProfitImpactShadowBackfill(db, true)).updated, 0);
    assert.equal((await db.profitImpactAction.findUniqueOrThrow({ where: { id: "inconsistent" } })).channelConnectionId, null);
    assert.equal((await db.channelConnection.findUniqueOrThrow({ where: { id: inconsistent.connection.id } })).accountId, inconsistent.account.id);

    const tool = readFileSync(path.join(process.cwd(), "scripts/tenancy-t8b-profit-impact-backfill.ts"), "utf8");
    assert.doesNotMatch(tool, /resolveShopifyTenantContext|\.account\.create|\.channelConnection\.create|\.legacyShopMapping\.create|request\.url|URLSearchParams/);
    const service = readFileSync(path.join(process.cwd(), "app/services/profit-impact.server.ts"), "utf8");
    assert.ok(/shop_idempotencyKey:\s*\{\s*shop/.test(service));
    for (const name of ["getProfitImpactActionForShop", "listProfitImpactActionsForShop", "createProfitImpactAction", "transitionProfitImpactAction", "claimProfitImpactMeasurement", "releaseProfitImpactMeasurementClaim", "createImmutableProfitImpactMeasurement"]) {
      assert.ok(service.includes(name), `${name} missing`);
    }
    assert.ok(/where:\s*\{ id: actionId, shop \}/.test(service));
    assert.ok(service.includes("channelConnectionId")); // Authenticated creation now maintains the shadow owner.
    const worker = readFileSync(path.join(process.cwd(), "app/services/profit-impact-measurement.server.ts"), "utf8");
    assert.ok(/where:\s*\{ status: "MEASURING", appliedAt: \{ not: null \} \}/.test(worker));
    assert.ok(/unauthenticated\.admin\(action\.shop\)/.test(worker));
    assert.ok(/const shop = session\.shop/.test(worker));
    assert.ok(worker.includes("findShopifyTenantContext(action.shop)"));
    assert.ok(worker.includes("action.channelConnectionId !== owner.channelConnectionId"));
    assert.ok(worker.indexOf("findShopifyTenantContext(action.shop)") < worker.indexOf("unauthenticated.admin(action.shop)"));
    const redaction = readFileSync(path.join(process.cwd(), "app/services/shop-data-redaction.server.ts"), "utf8");
    assert.ok(/profitImpactAction\.deleteMany\(\{\s*where:\s*\{ shop \}/.test(redaction));
    console.log("T8B migration, child preservation, atomic backfill and T11-guarded Shopify worker checks passed.");
  } finally {
    await db.$disconnect();
  }
} finally {
  try { sqlite.close(); } catch { /* already closed */ }
  rmSync(directory, { recursive: true, force: true });
}
