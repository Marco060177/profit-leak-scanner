import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "marginlab-tenancy-t1-"));
const databasePath = path.join(temporaryDirectory, "tenancy.sqlite");
const migrationsDirectory = path.join(process.cwd(), "prisma/migrations");
const setup = new DatabaseSync(databasePath);
setup.exec("PRAGMA foreign_keys = ON");
for (const name of readdirSync(migrationsDirectory).filter((entry) => /^\d{14}_/.test(entry)).sort()) {
  setup.exec(readFileSync(path.join(migrationsDirectory, name, "migration.sql"), "utf8"));
}
setup.close();
process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;

try {
  const [{ resolveShopifyTenantContext }, { default: prisma }] = await Promise.all([
    import("~/connectors/shopify/shopify-tenant-resolver.server"),
    import("~/db.server"),
  ]);

  try {
    const first = await resolveShopifyTenantContext({ shop: " Alpha-Store.MyShopify.Com " });
    assert.equal(first.channel, "SHOPIFY");
    assert.equal(first.legacyShopDomain, "alpha-store.myshopify.com");

    const second = await resolveShopifyTenantContext({ shop: "alpha-store.myshopify.com" });
    assert.deepEqual(second, first);
    const withIgnoredBrowserIds = await resolveShopifyTenantContext({
      shop: "alpha-store.myshopify.com",
      accountId: "browser-account",
      channelConnectionId: "browser-connection",
    } as never);
    assert.deepEqual(withIgnoredBrowserIds, first);

    const another = await resolveShopifyTenantContext({ shop: "another-store.myshopify.com" });
    assert.notEqual(another.accountId, first.accountId);
    assert.notEqual(another.channelConnectionId, first.channelConnectionId);

    const connection = await prisma.channelConnection.findUniqueOrThrow({
      where: { id: first.channelConnectionId },
    });
    assert.equal(connection.accountId, first.accountId);
    assert.equal(connection.channel, "SHOPIFY");
    assert.equal(connection.externalAccountId, first.legacyShopDomain);
    assert.equal(await prisma.account.count(), 2);
    assert.equal(await prisma.channelConnection.count(), 2);
    assert.equal(await prisma.legacyShopMapping.count(), 2);

    const concurrent = await Promise.all([
      resolveShopifyTenantContext({ shop: "simultaneous.myshopify.com" }),
      resolveShopifyTenantContext({ shop: "SIMULTANEOUS.myshopify.com" }),
    ]);
    assert.deepEqual(concurrent[0], concurrent[1]);
    assert.equal(await prisma.account.count(), 3);
    assert.equal(await prisma.channelConnection.count(), 3);
    assert.equal(await prisma.legacyShopMapping.count(), 3);

    await assert.rejects(
      resolveShopifyTenantContext({ shop: "not-a-shop.example.com" }),
      /Invalid verified Shopify shop domain/,
    );
    console.log("Tenancy T1 integration checks passed.");
  } finally {
    await prisma.$disconnect();
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
