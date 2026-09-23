import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-t8a-"));
const databasePath = path.join(directory, "t8a.sqlite");
const migrations = path.join(process.cwd(), "prisma/migrations");
const t8a = "20260923140000_profit_monitor_shadow_owner";
const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA foreign_keys = ON");
const stripShadow = (row: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(row).filter(([key]) => key !== "channelConnectionId"));

try {
  for (const name of readdirSync(migrations).filter((entry) => /^\d{14}_/.test(entry)).sort()) {
    if (name === t8a) break;
    sqlite.exec(readFileSync(path.join(migrations, name, "migration.sql"), "utf8"));
  }
  sqlite.exec(`INSERT INTO "ProfitMonitorSnapshot" ("id","shop","periodDays","fingerprint","payloadJson","capturedAt") VALUES ('old-snapshot','old.myshopify.com',30,'fingerprint','{"profit":42}','2026-01-01T00:00:00.000Z')`);
  sqlite.exec(`INSERT INTO "ProfitMonitorAlert" ("id","shop","periodDays","alertKey","alertType","productId","severity","category","title","description","monthlyImpact","economicKind","priority","actionLabel","route","businessAction","effort","estimatedMinutes","recommendedModule","productTitle","metadataJson","createdAt","updatedAt") VALUES ('old-alert','old.myshopify.com',30,'pricing-opportunity-123','pricing-opportunity','123','warning','pricing','Old title','Old description',19.25,'gross',7,'Review','/app/products','review','medium',5,'PRODUCTS','Old product','{"flag":true}','2026-01-01T00:00:00.000Z','2026-01-02T00:00:00.000Z')`);
  sqlite.exec(`INSERT INTO "ProfitMonitorAlertEvent" ("id","alertId","toStatus","source","createdAt") VALUES ('old-event','old-alert','new','monitor-sync','2026-01-01T00:00:00.000Z')`);
  const oldSnapshot = sqlite.prepare(`SELECT * FROM "ProfitMonitorSnapshot" WHERE id='old-snapshot'`).get() as Record<string, unknown>;
  const oldAlert = sqlite.prepare(`SELECT * FROM "ProfitMonitorAlert" WHERE id='old-alert'`).get() as Record<string, unknown>;
  const oldEvent = sqlite.prepare(`SELECT * FROM "ProfitMonitorAlertEvent" WHERE id='old-event'`).get() as Record<string, unknown>;
  sqlite.exec(readFileSync(path.join(migrations, t8a, "migration.sql"), "utf8"));
  const newSnapshot = sqlite.prepare(`SELECT * FROM "ProfitMonitorSnapshot" WHERE id='old-snapshot'`).get() as Record<string, unknown>;
  const newAlert = sqlite.prepare(`SELECT * FROM "ProfitMonitorAlert" WHERE id='old-alert'`).get() as Record<string, unknown>;
  assert.deepEqual(stripShadow(newSnapshot), { ...oldSnapshot });
  assert.deepEqual(stripShadow(newAlert), { ...oldAlert });
  assert.equal(newSnapshot.channelConnectionId, null);
  assert.equal(newAlert.channelConnectionId, null);
  assert.deepEqual(sqlite.prepare(`SELECT * FROM "ProfitMonitorAlertEvent" WHERE id='old-event'`).get(), oldEvent);
  assert.equal((sqlite.prepare(`SELECT "on_delete" FROM pragma_foreign_key_list('ProfitMonitorAlertEvent')`).get() as { on_delete: string }).on_delete, "CASCADE");
  assert.equal((sqlite.prepare(`SELECT "on_delete" FROM pragma_foreign_key_list('ProfitMonitorSnapshot')`).get() as { on_delete: string }).on_delete, "RESTRICT");
  assert.equal((sqlite.prepare(`SELECT "on_delete" FROM pragma_foreign_key_list('ProfitMonitorAlert')`).get() as { on_delete: string }).on_delete, "RESTRICT");
  for (const table of ["ProfitMonitorSnapshot", "ProfitMonitorAlert"]) {
    const indexes = sqlite.prepare(`SELECT name FROM pragma_index_list('${table}')`).all().map((row) => (row as { name: string }).name);
    assert.ok(indexes.includes(`${table}_channelConnectionId_idx`));
    assert.ok(indexes.some((name) => name.startsWith(`${table}_shop_periodDays_`)));
  }
  const eventColumns = sqlite.prepare(`SELECT name FROM pragma_table_info('ProfitMonitorAlertEvent')`).all().map((row) => (row as { name: string }).name);
  assert.ok(!eventColumns.includes("channelConnectionId") && !eventColumns.includes("accountId"));
  assert.throws(() => sqlite.exec(`INSERT INTO "ProfitMonitorSnapshot" ("id","shop","periodDays","fingerprint","payloadJson") VALUES ('duplicate','old.myshopify.com',30,'fingerprint','{}')`), /UNIQUE/);
  assert.throws(() => sqlite.exec(`INSERT INTO "ProfitMonitorAlert" ("id","shop","periodDays","alertKey","alertType","severity","category","title","description","economicKind","actionLabel","route","businessAction","effort","recommendedModule","updatedAt") VALUES ('duplicate','old.myshopify.com',30,'pricing-opportunity-123','pricing','warning','pricing','x','x','gross','x','/','review','medium','PRODUCTS','2026-01-02T00:00:00.000Z')`), /UNIQUE/);
  sqlite.close();
  process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;

  const [{ PrismaClient }, { runProfitMonitorShadowBackfill }] = await Promise.all([
    import("@prisma/client"), import("../../scripts/tenancy-t8a-profit-monitor-backfill"),
  ]);
  const db = new PrismaClient();
  const makeMapping = async (shop: string, channel: "SHOPIFY" | "AMAZON" = "SHOPIFY", external = shop, status = "ACTIVE") => {
    const account = await db.account.create({ data: {} });
    const connection = await db.channelConnection.create({ data: { accountId: account.id, channel, externalAccountId: external, status } });
    await db.legacyShopMapping.create({ data: { shopDomain: shop, accountId: account.id, channelConnectionId: connection.id } });
    return { account, connection };
  };
  const makeSnapshot = (id: string, shop: string) => db.profitMonitorSnapshot.create({ data: { id, shop, periodDays: 30, fingerprint: id, payloadJson: "{}" } });
  const makeAlert = (id: string, shop: string) => db.profitMonitorAlert.create({ data: {
    id, shop, periodDays: 30, alertKey: id, alertType: "test", severity: "warning", category: "pricing",
    title: "Title", description: "Description", economicKind: "gross", actionLabel: "Review",
    route: "/app/products", businessAction: "review", effort: "medium", recommendedModule: "PRODUCTS",
  } });
  try {
    const valid = await makeMapping("old.myshopify.com");
    const baselineSnapshot = await db.profitMonitorSnapshot.findUniqueOrThrow({ where: { id: "old-snapshot" } });
    const baselineAlert = await db.profitMonitorAlert.findUniqueOrThrow({ where: { id: "old-alert" } });
    const dry = await runProfitMonitorShadowBackfill(db);
    assert.equal(dry.models.snapshot.counts.READY, 1);
    assert.equal(dry.models.alert.counts.READY, 1);
    assert.equal(dry.updated, 0);
    assert.deepEqual(await db.profitMonitorSnapshot.findUniqueOrThrow({ where: { id: "old-snapshot" } }), baselineSnapshot);
    assert.deepEqual(await db.profitMonitorAlert.findUniqueOrThrow({ where: { id: "old-alert" } }), baselineAlert);
    assert.equal((await runProfitMonitorShadowBackfill(db, true)).updated, 2);
    assert.equal((await db.profitMonitorSnapshot.findUniqueOrThrow({ where: { id: "old-snapshot" } })).channelConnectionId, valid.connection.id);
    assert.equal((await db.profitMonitorAlert.findUniqueOrThrow({ where: { id: "old-alert" } })).channelConnectionId, valid.connection.id);
    const second = await runProfitMonitorShadowBackfill(db, true);
    assert.equal(second.updated, 0);
    assert.equal(second.models.snapshot.counts.ALREADY_MATCHED, 1);
    assert.equal(second.models.alert.counts.ALREADY_MATCHED, 1);
    await assert.rejects(db.channelConnection.delete({ where: { id: valid.connection.id } }));

    await makeSnapshot("mixed-ready-s", "mixed-ready.myshopify.com");
    await makeAlert("mixed-ready-a", "mixed-ready.myshopify.com");
    await makeMapping("mixed-ready.myshopify.com");
    await makeAlert("mixed-unsafe-a", "missing.myshopify.com");
    const mixed = await runProfitMonitorShadowBackfill(db, true);
    assert.equal(mixed.updated, 0);
    assert.equal(mixed.models.alert.counts.MISSING_MAPPING, 1);
    assert.equal((await db.profitMonitorSnapshot.findUniqueOrThrow({ where: { id: "mixed-ready-s" } })).channelConnectionId, null);
    assert.equal((await db.profitMonitorAlert.findUniqueOrThrow({ where: { id: "mixed-ready-a" } })).channelConnectionId, null);
    assert.equal(await db.account.count(), 2);
    assert.equal(await db.channelConnection.count(), 2);
    assert.equal(await db.legacyShopMapping.count(), 2);

    await makeSnapshot("wrong", "wrong.myshopify.com");
    await makeMapping("wrong.myshopify.com", "AMAZON");
    await makeAlert("external", "external.myshopify.com");
    await makeMapping("external.myshopify.com", "SHOPIFY", "elsewhere.myshopify.com");
    await makeSnapshot("inactive", "inactive.myshopify.com");
    await makeMapping("inactive.myshopify.com", "SHOPIFY", "inactive.myshopify.com", "DISCONNECTED");
    await makeAlert("invalid", "invalid.example.com");
    await makeSnapshot("conflict", "conflict.myshopify.com");
    await makeMapping("conflict.myshopify.com");
    await db.profitMonitorSnapshot.update({ where: { id: "conflict" }, data: { channelConnectionId: valid.connection.id } });
    const reasons = await runProfitMonitorShadowBackfill(db);
    assert.equal(reasons.models.snapshot.counts.WRONG_CHANNEL, 1);
    assert.equal(reasons.models.alert.counts.EXTERNAL_ID_MISMATCH, 1);
    assert.equal(reasons.models.snapshot.counts.UNSAFE_CONNECTION_STATUS, 1);
    assert.equal(reasons.models.alert.counts.INVALID_SHOP, 1);
    assert.equal(reasons.models.snapshot.counts.SHADOW_CONFLICT, 1);
    assert.equal((await runProfitMonitorShadowBackfill(db, true)).updated, 0);

    const inconsistent = await makeMapping("inconsistent.myshopify.com");
    await makeAlert("inconsistent", "inconsistent.myshopify.com");
    const otherAccount = await db.account.create({ data: {} });
    const corrupt = new DatabaseSync(databasePath);
    corrupt.exec("PRAGMA foreign_keys = OFF");
    corrupt.prepare(`UPDATE "LegacyShopMapping" SET "accountId"=? WHERE "shopDomain"=?`).run(otherAccount.id, "inconsistent.myshopify.com");
    corrupt.close();
    assert.equal((await runProfitMonitorShadowBackfill(db)).models.alert.counts.INCONSISTENT_MAPPING, 1);
    assert.equal((await runProfitMonitorShadowBackfill(db, true)).updated, 0);
    assert.equal((await db.profitMonitorAlert.findUniqueOrThrow({ where: { id: "inconsistent" } })).channelConnectionId, null);
    assert.equal((await db.channelConnection.findUniqueOrThrow({ where: { id: inconsistent.connection.id } })).accountId, inconsistent.account.id);

    const tool = readFileSync(path.join(process.cwd(), "scripts/tenancy-t8a-profit-monitor-backfill.ts"), "utf8");
    assert.doesNotMatch(tool, /resolveShopifyTenantContext|\.account\.create|\.channelConnection\.create|\.legacyShopMapping\.create|request\.url|URLSearchParams/);
    const production = readFileSync(path.join(process.cwd(), "app/services/profit-monitor.server.ts"), "utf8");
    assert.ok(/shop_periodDays_fingerprint:\s*\{ shop, periodDays, fingerprint \}/.test(production));
    assert.ok(/shop_periodDays_alertKey:\s*\{ shop, periodDays, alertKey: alert\.id \}/.test(production));
    assert.ok(/where:\s*\{ shop, periodDays \}/.test(production));
    assert.ok(!production.includes("channelConnectionId"));
    const redaction = readFileSync(path.join(process.cwd(), "app/services/shop-data-redaction.server.ts"), "utf8");
    assert.ok(/profitMonitorAlert\.deleteMany\(\{ where: \{ shop \} \}/.test(redaction));
    assert.ok(/profitMonitorSnapshot\.deleteMany\(\{ where: \{ shop \} \}/.test(redaction));
    console.log("T8A migration, child preservation, atomic two-model backfill and shop-authority checks passed.");
  } finally {
    await db.$disconnect();
  }
} finally {
  try { sqlite.close(); } catch { /* already closed */ }
  rmSync(directory, { recursive: true, force: true });
}
