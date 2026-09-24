import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-t6-"));
const databasePath = path.join(directory, "t6.sqlite");
const migrationDirectory = path.join(process.cwd(), "prisma/migrations");
const t6 = "20260923120000_store_tax_profile_shadow_owner";
const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA foreign_keys = ON");

try {
  for (const name of readdirSync(migrationDirectory).filter((entry) => /^\d{14}_/.test(entry)).sort()) {
    if (name === t6) break;
    sqlite.exec(readFileSync(path.join(migrationDirectory, name, "migration.sql"), "utf8"));
  }
  sqlite.exec(`INSERT INTO "StoreTaxProfile" ("id","shop","countryCode","regime","defaultVatRatePct","pricesIncludeVat","costsIncludeVat","recoverInputVat","inputVatRecoveryPct","shippingIncludeVat","shippingVatRatePct","createdAt","updatedAt") VALUES ('before','before.myshopify.com','IT','ITALY_STANDARD',19,0,1,0,37,0,9,'2026-01-01T00:00:00.000Z','2026-01-02T00:00:00.000Z')`);
  const before = sqlite.prepare(`SELECT * FROM "StoreTaxProfile" WHERE id='before'`).get() as Record<string, unknown>;
  sqlite.exec(readFileSync(path.join(migrationDirectory, t6, "migration.sql"), "utf8"));
  const after = sqlite.prepare(`SELECT * FROM "StoreTaxProfile" WHERE id='before'`).get() as Record<string, unknown>;
  assert.deepEqual(Object.fromEntries(Object.entries(after).filter(([key]) => key !== "channelConnectionId")), { ...before });
  assert.equal(after.channelConnectionId, null);
  assert.throws(() => sqlite.exec(`INSERT INTO "StoreTaxProfile" ("id","shop","countryCode","updatedAt") VALUES ('duplicate','before.myshopify.com','IT','2026-01-02T00:00:00.000Z')`), /UNIQUE/);
  assert.equal((sqlite.prepare(`SELECT "on_delete" FROM pragma_foreign_key_list('StoreTaxProfile')`).get() as { on_delete: string }).on_delete, "RESTRICT");
  sqlite.exec('ALTER TABLE "Account" ADD COLUMN "status" TEXT NOT NULL DEFAULT \'ACTIVE\'');
  sqlite.exec('ALTER TABLE "Account" ADD COLUMN "deletionRequestedAt" DATETIME');
  sqlite.close();
  process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;

  const [{ PrismaClient }, { runTaxProfileShadowBackfill }, { getStoreTaxContext, saveStoreTaxProfile }, { default: appPrisma }] = await Promise.all([
    import("@prisma/client"), import("../../scripts/tenancy-t6-tax-profile-backfill"),
    import("~/utils/tax-profile.server"), import("~/db.server"),
  ]);
  const db = new PrismaClient();
  const makeProfile = (id: string, shop: string) => db.storeTaxProfile.create({ data: { id, shop, countryCode: "IT" } });
  const makeMapping = async (shop: string, channel: "SHOPIFY" | "AMAZON" = "SHOPIFY", external = shop, status = "ACTIVE") => {
    const account = await db.account.create({ data: {} });
    const connection = await db.channelConnection.create({ data: { accountId: account.id, channel, externalAccountId: external, status } });
    await db.legacyShopMapping.create({ data: { shopDomain: shop, accountId: account.id, channelConnectionId: connection.id } });
    return { account, connection };
  };
  try {
    const valid = await makeMapping("before.myshopify.com");
    const taxBeforeShadow = await getStoreTaxContext({ shop: "before.myshopify.com", shopCountryCode: "IT" });
    const beforeDryRun = await db.storeTaxProfile.findUniqueOrThrow({ where: { id: "before" } });
    assert.equal((await runTaxProfileShadowBackfill(db)).counts.READY, 1);
    assert.deepEqual(await db.storeTaxProfile.findUniqueOrThrow({ where: { id: "before" } }), beforeDryRun);
    assert.equal((await runTaxProfileShadowBackfill(db, true)).updated, 1);
    assert.equal((await db.storeTaxProfile.findUniqueOrThrow({ where: { id: "before" } })).channelConnectionId, valid.connection.id);
    assert.deepEqual(await getStoreTaxContext({ shop: "before.myshopify.com", shopCountryCode: "IT" }), taxBeforeShadow);
    await saveStoreTaxProfile({
      shop: "before.myshopify.com", countryCode: "IT", regime: "ITALY_STANDARD",
      defaultVatRatePct: 19, pricesIncludeVat: false, costsIncludeVat: true,
      recoverInputVat: false, inputVatRecoveryPct: 37,
      shippingIncludeVat: false, shippingVatRatePct: 9,
    });
    assert.equal((await db.storeTaxProfile.findUniqueOrThrow({ where: { shop: "before.myshopify.com" } })).channelConnectionId, valid.connection.id);
    assert.equal((await runTaxProfileShadowBackfill(db, true)).counts.ALREADY_MATCHED, 1);
    assert.equal((await runTaxProfileShadowBackfill(db, true)).updated, 0);

    await makeProfile("missing", "missing.myshopify.com");
    assert.equal((await runTaxProfileShadowBackfill(db)).counts.MISSING_MAPPING, 1);
    assert.equal((await runTaxProfileShadowBackfill(db, true)).updated, 0);
    assert.equal(await db.account.count(), 1);
    assert.equal((await db.storeTaxProfile.findUniqueOrThrow({ where: { id: "missing" } })).channelConnectionId, null);

    await makeProfile("wrong", "wrong.myshopify.com");
    await makeMapping("wrong.myshopify.com", "AMAZON");
    await makeProfile("external", "external.myshopify.com");
    await makeMapping("external.myshopify.com", "SHOPIFY", "elsewhere.myshopify.com");
    await makeProfile("invalid", "not-a-shop.example.com");
    await makeProfile("inactive", "inactive.myshopify.com");
    await makeMapping("inactive.myshopify.com", "SHOPIFY", "inactive.myshopify.com", "DISCONNECTED");
    await makeProfile("conflict", "conflict.myshopify.com");
    await makeMapping("conflict.myshopify.com");
    await db.storeTaxProfile.update({ where: { id: "conflict" }, data: { channelConnectionId: valid.connection.id } });
    const summary = await runTaxProfileShadowBackfill(db);
    for (const reason of ["WRONG_CHANNEL", "EXTERNAL_ID_MISMATCH", "INVALID_SHOP", "UNSAFE_CONNECTION_STATUS", "SHADOW_CONFLICT"] as const) assert.equal(summary.counts[reason], 1);
    assert.equal((await runTaxProfileShadowBackfill(db, true)).updated, 0);
    assert.equal((await db.storeTaxProfile.findUniqueOrThrow({ where: { id: "conflict" } })).channelConnectionId, valid.connection.id);

    // A mismatched mapping cannot be created with FK checks enabled. Simulate legacy corruption in disposable SQLite.
    const inconsistent = await makeMapping("inconsistent.myshopify.com");
    await makeProfile("inconsistent", "inconsistent.myshopify.com");
    const otherAccount = await db.account.create({ data: {} });
    const corrupt = new DatabaseSync(databasePath);
    corrupt.exec("PRAGMA foreign_keys = OFF");
    corrupt.prepare(`UPDATE "LegacyShopMapping" SET "accountId"=? WHERE "shopDomain"=?`).run(otherAccount.id, "inconsistent.myshopify.com");
    corrupt.close();
    assert.equal((await runTaxProfileShadowBackfill(db)).counts.INCONSISTENT_MAPPING, 1);
    assert.equal((await runTaxProfileShadowBackfill(db, true)).updated, 0);
    assert.equal((await db.storeTaxProfile.findUniqueOrThrow({ where: { id: "inconsistent" } })).channelConnectionId, null);
    assert.equal((await db.channelConnection.findUniqueOrThrow({ where: { id: inconsistent.connection.id } })).accountId, inconsistent.account.id);

    const tool = readFileSync(path.join(process.cwd(), "scripts/tenancy-t6-tax-profile-backfill.ts"), "utf8");
    assert.doesNotMatch(tool, /resolveShopifyTenantContext|\.account\.create|\.channelConnection\.create|\.legacyShopMapping\.create|request\.url|URLSearchParams/);
    const tax = readFileSync(path.join(process.cwd(), "app/utils/tax-profile.server.ts"), "utf8");
    assert.match(tax, /storeTaxProfile\.findUnique\(\{\s*where:\s*\{ shop \}/);
    assert.match(tax, /storeTaxProfile\.upsert\(\{\s*where:\s*\{ shop \}/);
    const redaction = readFileSync(path.join(process.cwd(), "app/services/shop-data-redaction.server.ts"), "utf8");
    assert.match(redaction, /storeTaxProfile\.deleteMany\(\{ where:\s*\{ shop \}/);
    console.log("T6 migration, shadow backfill, isolation and legacy shop-authority checks passed.");
  } finally {
    await db.$disconnect();
    await appPrisma.$disconnect();
  }
} finally {
  try { sqlite.close(); } catch { /* already closed */ }
  rmSync(directory, { recursive: true, force: true });
}
