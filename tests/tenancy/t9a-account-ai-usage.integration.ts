import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-t9a-"));
const db = new DatabaseSync(path.join(directory, "t9a.sqlite"));
const migrations = path.join(process.cwd(), "prisma/migrations");
const t9a = "20260923160000_account_ai_usage_foundation";

function columns(table: string) {
  return db.prepare(`PRAGMA table_info('${table}')`).all() as Array<{
    name: string; notnull: number; dflt_value: string | null;
  }>;
}

try {
  db.exec("PRAGMA foreign_keys = ON");
  for (const name of readdirSync(migrations).filter((entry) => /^\d{14}_/.test(entry)).sort()) {
    if (name === t9a) break;
    db.exec(readFileSync(path.join(migrations, name, "migration.sql"), "utf8"));
  }

  db.exec(`INSERT INTO "Account" ("id", "createdAt", "updatedAt") VALUES
    ('account-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('account-2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`);
  db.exec(`INSERT INTO "AiUsage" ("id", "shop", "month", "requests", "updatedAt") VALUES
    ('usage-1', 'one.myshopify.com', '2026-08', 17, CURRENT_TIMESTAMP),
    ('usage-2', 'one.myshopify.com', '2026-09', 42, CURRENT_TIMESTAMP),
    ('usage-3', 'two.myshopify.com', '2026-09', 9, CURRENT_TIMESTAMP)`);
  const legacyRows = db.prepare(`SELECT * FROM "AiUsage" ORDER BY "id"`).all();
  const legacySchema = db.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_master WHERE tbl_name='AiUsage' ORDER BY type, name`).all();
  const accountRows = db.prepare(`SELECT * FROM "Account" ORDER BY "id"`).all();

  const migration = readFileSync(path.join(migrations, t9a, "migration.sql"), "utf8");
  assert.match(migration, /CREATE TABLE "AccountAiUsage"/);
  assert.doesNotMatch(migration, /(?:ALTER|DROP|INSERT INTO|UPDATE|DELETE FROM)\s+"?(?:AiUsage|Account|ChannelConnection)"?/i);
  db.exec(migration);

  assert.deepEqual(db.prepare(`SELECT * FROM "AiUsage" ORDER BY "id"`).all(), legacyRows);
  assert.deepEqual(db.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_master WHERE tbl_name='AiUsage' ORDER BY type, name`).all(), legacySchema);
  assert.deepEqual(db.prepare(`SELECT * FROM "Account" ORDER BY "id"`).all(), accountRows);
  assert.equal((db.prepare(`SELECT COUNT(*) AS count FROM "AccountAiUsage"`).get() as { count: number }).count, 0);
  assert.deepEqual(columns("AccountAiUsage").map((column) => column.name), [
    "id", "accountId", "periodKey", "requests", "createdAt", "updatedAt",
  ]);
  assert.equal(columns("AccountAiUsage").find((column) => column.name === "accountId")?.notnull, 1);
  assert.equal(columns("AccountAiUsage").find((column) => column.name === "periodKey")?.notnull, 1);
  assert.equal(columns("AccountAiUsage").find((column) => column.name === "requests")?.dflt_value, "0");
  assert.ok(!columns("AccountAiUsage").some((column) => ["shop", "channelConnectionId"].includes(column.name)));

  const fk = db.prepare(`PRAGMA foreign_key_list('AccountAiUsage')`).get() as {
    table: string; from: string; to: string; on_delete: string; on_update: string;
  };
  assert.deepEqual([fk.table, fk.from, fk.to, fk.on_delete, fk.on_update],
    ["Account", "accountId", "id", "RESTRICT", "CASCADE"]);
  assert.throws(() => db.exec(`INSERT INTO "AccountAiUsage" ("id", "periodKey", "updatedAt") VALUES ('no-account', '2026-09', CURRENT_TIMESTAMP)`), /NOT NULL/);
  assert.throws(() => db.exec(`INSERT INTO "AccountAiUsage" ("id", "accountId", "updatedAt") VALUES ('no-period', 'account-1', CURRENT_TIMESTAMP)`), /NOT NULL/);
  assert.throws(() => db.exec(`INSERT INTO "AccountAiUsage" ("id", "accountId", "periodKey", "updatedAt") VALUES ('orphan', 'absent', '2026-09', CURRENT_TIMESTAMP)`), /FOREIGN KEY/);

  db.exec(`INSERT INTO "AccountAiUsage" ("id", "accountId", "periodKey", "updatedAt") VALUES
    ('a1-sep', 'account-1', '2026-09', CURRENT_TIMESTAMP),
    ('a1-oct', 'account-1', '2026-10', CURRENT_TIMESTAMP),
    ('a2-sep', 'account-2', '2026-09', CURRENT_TIMESTAMP)`);
  assert.equal((db.prepare(`SELECT "requests" FROM "AccountAiUsage" WHERE "id"='a1-sep'`).get() as { requests: number }).requests, 0);
  assert.throws(() => db.exec(`INSERT INTO "AccountAiUsage" ("id", "accountId", "periodKey", "updatedAt") VALUES ('duplicate', 'account-1', '2026-09', CURRENT_TIMESTAMP)`), /UNIQUE/);
  assert.throws(() => db.exec(`DELETE FROM "Account" WHERE "id"='account-1'`), /FOREIGN KEY/);
  assert.equal((db.prepare(`SELECT COUNT(*) AS count FROM "AccountAiUsage"`).get() as { count: number }).count, 3);
  const indexes = db.prepare(`PRAGMA index_list('AccountAiUsage')`).all() as Array<{ name: string; unique: number }>;
  assert.ok(indexes.some((index) => index.name === "AccountAiUsage_accountId_periodKey_key" && index.unique === 1));
  assert.ok((legacySchema as Array<{ name: string }>).some((item) => item.name === "AiUsage_shop_month_key"));
  assert.throws(() => db.exec(`INSERT INTO "AiUsage" ("id", "shop", "month", "updatedAt") VALUES ('duplicate-legacy', 'one.myshopify.com', '2026-09', CURRENT_TIMESTAMP)`), /UNIQUE/);

  const aiAdvisor = readFileSync(path.join(process.cwd(), "app/routes/app.ai-advisor.tsx"), "utf8");
  assert.doesNotMatch(aiAdvisor, /AccountAiUsage|accountAiUsage/);
  assert.match(aiAdvisor, /prisma\.aiUsage\.findUnique/);
  assert.match(aiAdvisor, /tx\.aiUsage\.upsert/);
  assert.match(aiAdvisor, /prisma\.aiUsage\.updateMany/);
  console.log("T9A additive migration, legacy preservation, Account FK/uniqueness and unchanged AI Advisor authority passed.");
} finally {
  db.close();
  rmSync(directory, { recursive: true, force: true });
}
