import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "marginlab-tenancy-t1-"));
const databasePath = path.join(temporaryDirectory, "tenancy.sqlite");
const migrationsDirectory = path.join(process.cwd(), "prisma/migrations");
const routeFiles = readdirSync(path.join(process.cwd(), "app/routes"), { recursive: true })
  .map(String)
  .filter((name) => /\.[jt]sx?$/.test(name));
const directAdminExceptions = new Set(["app.billing.tsx", "auth.$.tsx"]);
for (const name of routeFiles) {
  const source = readFileSync(path.join(process.cwd(), "app/routes", name), "utf8");
  if (/authenticate\.admin\s*\(/.test(source)) {
    assert.ok(directAdminExceptions.has(name), `Direct Admin authentication bypass in ${name}`);
  }
  if (/^app(?:\.|\.tsx$)/.test(name) && !directAdminExceptions.has(name)) {
    const handlers = [...source.matchAll(/export (?:const|async function) (?:loader|action)\b/g)].length;
    const tenantCalls = [...source.matchAll(/authenticateShopifyTenant\s*\(request\)/g)].length;
    assert.ok(tenantCalls >= handlers, `Admin handler without tenant boundary in ${name}`);
  }
}
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

    const [{ authenticateShopifyTenant }, stub] = await Promise.all([
      import("~/services/authenticated-shopify-context.server"),
      import("./authenticate.stub"),
    ]);
    const browserControlledRequest = new Request(
      "https://marginlab.example/app?accountId=browser-account&channelConnectionId=browser-connection&shop=another-store.myshopify.com",
      {
        method: "POST",
        body: new URLSearchParams({
          accountId: "browser-account",
          channelConnectionId: "browser-connection",
          shop: "another-store.myshopify.com",
        }),
      },
    );
    const verifiedSession = stub.registerVerifiedSession(browserControlledRequest, "alpha-store.myshopify.com");
    stub.authenticationEvents.length = 0;
    const authenticated = await authenticateShopifyTenant(browserControlledRequest);
    assert.deepEqual(stub.authenticationEvents, ["authenticate.admin", "resolveShopifyTenantContext"]);
    assert.equal(authenticated.admin, stub.adminClient);
    assert.equal(authenticated.session, verifiedSession);
    assert.deepEqual(authenticated.tenant, first);

    const repeatedRequest = new Request("https://marginlab.example/app?tenantId=ignored");
    stub.registerVerifiedSession(repeatedRequest, "alpha-store.myshopify.com");
    assert.deepEqual((await authenticateShopifyTenant(repeatedRequest)).tenant, first);

    const otherRequest = new Request("https://marginlab.example/app?shop=alpha-store.myshopify.com");
    stub.registerVerifiedSession(otherRequest, "another-store.myshopify.com");
    assert.deepEqual((await authenticateShopifyTenant(otherRequest)).tenant, another);

    const unverifiedRequest = new Request("https://marginlab.example/app?shop=unknown.myshopify.com");
    stub.authenticationEvents.length = 0;
    await assert.rejects(authenticateShopifyTenant(unverifiedRequest), /Shopify authentication rejected/);
    assert.deepEqual(stub.authenticationEvents, ["authenticate.admin"]);
    assert.equal(await prisma.account.count(), 3);
    console.log("Tenancy T1/T2 integration and route coverage checks passed.");
  } finally {
    await prisma.$disconnect();
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
