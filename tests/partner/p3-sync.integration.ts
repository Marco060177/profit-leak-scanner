import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "marginlab-partner-p3-sync-"));
const databasePath = path.join(temporaryDirectory, "sync.sqlite");
const setup = new DatabaseSync(databasePath);
setup.exec("PRAGMA foreign_keys = ON");
for (const name of readdirSync("prisma/migrations").filter((entry) => /^\d{14}_/.test(entry)).sort()) setup.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
setup.close();
process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;

const sale = (id: string, shop = "sync.myshopify.com", apiKey = "marginlab-key", amount: unknown = "39.00") => ({
  id, createdAt: "2026-10-01T00:00:00Z", chargeId: `charge-${id}`, billingInterval: "EVERY_30_DAYS",
  grossAmount: { amount, currencyCode: "USD" }, app: { apiKey }, shop: { myshopifyDomain: shop },
});
const edge = (cursor: string, node: unknown) => ({ cursor, node });
const page = (edges: unknown[], hasNextPage = false) => ({ data: { transactions: { edges, pageInfo: { hasNextPage } } } });

try {
  const [{ PrismaClient }, partner, sync] = await Promise.all([
    import("@prisma/client"), import("../../app/services/partner-program.server"), import("../../app/services/shopify-billing-sync.server"),
  ]);
  const db = new PrismaClient();
  try {
    const creator = await partner.registerPartner(db, { displayName: "Sync Creator", referralCode: "P3SYNC" });
    const account = await db.account.create({ data: {} });
    const connection = await db.channelConnection.create({ data: { accountId: account.id, channel: "SHOPIFY", externalAccountId: "sync.myshopify.com" } });
    await db.legacyShopMapping.create({ data: { shopDomain: "sync.myshopify.com", accountId: account.id, channelConnectionId: connection.id } });
    const referral = await partner.attributeAccountToPartner(db, { accountId: account.id, partnerId: creator.id, attributionSource: "REFERRAL_LINK", attributedAt: new Date("2026-09-01T00:00:00Z") });

    const cursors: Array<string | null> = [];
    const isolationAndPagination = await sync.synchronizeShopifyPartnerBilling({ db, expectedApiKey: "marginlab-key", fetchPage: async ({ after }) => {
      cursors.push(after);
      if (after === null) return page([
        edge("c1", sale("other-app", "sync.myshopify.com", "another-key")),
        edge("c2", { id: "malformed", createdAt: "not-a-date" }),
        edge("c3", sale("unknown-shop", "unknown.myshopify.com")),
        edge("c4", sale("paid-1")),
      ], true);
      return page([edge("c5", sale("paid-2"))]);
    } });
    assert.deepEqual(cursors, [null, "c4"]); // B,C
    assert.equal(isolationAndPagination.ok, false);
    assert.equal(isolationAndPagination.pagesProcessed, 2);
    assert.equal(isolationAndPagination.recordsProcessed, 2); // G,H
    assert.ok(isolationAndPagination.diagnostics.some((item) => item.code === "APP_MISMATCH")); // A,P
    assert.ok(isolationAndPagination.diagnostics.some((item) => item.code === "INVALID_TRANSACTION_IDENTITY"));
    assert.ok(isolationAndPagination.diagnostics.some((item) => item.code === "UNKNOWN_OR_INCONSISTENT_SHOP"));
    assert.equal(await db.normalizedBillingEvent.count({ where: { externalEventId: { in: ["other-app", "malformed", "unknown-shop"] } } }), 0);
    assert.equal((await db.partnerReferral.findUnique({ where: { id: referral.id } }))?.status, "QUALIFIED");
    assert.equal(await db.partnerMilestoneEvent.count({ where: { referralId: referral.id, eventType: "QUALIFIED" } }), 1);

    const replay = await sync.synchronizeShopifyPartnerBilling({ db, expectedApiKey: "marginlab-key", fetchPage: async () => page([edge("replay", sale("paid-1")), edge("new", sale("paid-2"))]) });
    assert.equal(replay.ok, true);
    assert.equal(await db.normalizedBillingEvent.count({ where: { externalEventId: { in: ["paid-1", "paid-2"] } } }), 2); // L,N,O
    assert.equal(await db.partnerMilestoneEvent.count({ where: { referralId: referral.id, eventType: "QUALIFIED" } }), 1); // S

    const repeatedCalls: Array<string | null> = [];
    const repeated = await sync.synchronizeShopifyPartnerBilling({ db, expectedApiKey: "marginlab-key", fetchPage: async ({ after }) => {
      repeatedCalls.push(after); return page([edge("stuck", sale("cursor-event"))], true);
    } });
    assert.deepEqual(repeatedCalls, [null, "stuck"]);
    assert.ok(repeated.diagnostics.some((item) => item.code === "NON_PROGRESSING_CURSOR")); // D

    const empty = await sync.synchronizeShopifyPartnerBilling({ db, expectedApiKey: "marginlab-key", fetchPage: async () => page([], true) });
    assert.ok(empty.diagnostics.some((item) => item.code === "MISSING_NEXT_CURSOR")); // E
    const malformedPage = await sync.synchronizeShopifyPartnerBilling({ db, expectedApiKey: "marginlab-key", fetchPage: async () => ({ data: { transactions: { edges: [] } } }) });
    assert.ok(malformedPage.diagnostics.some((item) => item.code === "INVALID_CONNECTION")); // F
    for (const fetchPage of [
      async () => { throw new Error("HTTP 503 secret-token-value"); },
      async () => ({ errors: [{ message: "secret-token-value" }] }),
      async () => Promise.reject(new TypeError("network secret-token-value")),
    ]) {
      const failed = await sync.synchronizeShopifyPartnerBilling({ db, expectedApiKey: "marginlab-key", fetchPage });
      assert.equal(failed.ok, false);
      assert.equal(JSON.stringify(failed).includes("secret-token-value"), false); // I,J,K,R
    }
    const httpClient = sync.createShopifyPartnerApiClient({ organizationId: "org", accessToken: "secret-token-value", fetchImpl: async () => new Response("secret-token-value", { status: 503 }) });
    const httpFailure = await sync.synchronizeShopifyPartnerBilling({ db, expectedApiKey: "marginlab-key", fetchPage: httpClient });
    assert.equal(httpFailure.ok, false);
    assert.equal(JSON.stringify(httpFailure).includes("secret-token-value"), false); // I,R

    const malformedMoney = await sync.synchronizeShopifyPartnerBilling({ db, expectedApiKey: "marginlab-key", fetchPage: async () => page([edge("bad-money", sale("bad-money", undefined, undefined, "not-money")), edge("after-bad", sale("paid-3"))]) });
    assert.equal(malformedMoney.recordsProcessed, 1);
    assert.equal(await db.normalizedBillingEvent.findUnique({ where: { platform_externalEventId: { platform: "SHOPIFY", externalEventId: "bad-money" } } }), null); // Q

    const recoveryAccount = await db.account.create({ data: {} });
    const recoveryConnection = await db.channelConnection.create({ data: { accountId: recoveryAccount.id, channel: "SHOPIFY", externalAccountId: "recovery.myshopify.com" } });
    await db.legacyShopMapping.create({ data: { shopDomain: "recovery.myshopify.com", accountId: recoveryAccount.id, channelConnectionId: recoveryConnection.id } });
    const recoveryReferral = await partner.attributeAccountToPartner(db, { accountId: recoveryAccount.id, partnerId: creator.id, attributionSource: "REFERRAL_LINK", attributedAt: new Date("2026-09-01T00:00:00Z") });
    await db.$executeRawUnsafe(`CREATE TRIGGER "P3_test_evidence_failure" BEFORE INSERT ON "PartnerQualificationEvidence" BEGIN SELECT RAISE(ABORT, 'test failure'); END`);
    const recoveryPage = page([edge("r1", sale("recovery-1", "recovery.myshopify.com")), edge("r2", sale("recovery-2", "recovery.myshopify.com"))]);
    const partial = await sync.synchronizeShopifyPartnerBilling({ db, expectedApiKey: "marginlab-key", fetchPage: async ({ shopDomain }) => shopDomain === "recovery.myshopify.com" ? recoveryPage : page([]) });
    assert.equal(partial.ok, false);
    assert.equal(await db.normalizedBillingEvent.count({ where: { accountId: recoveryAccount.id } }), 2);
    await db.$executeRawUnsafe(`DROP TRIGGER "P3_test_evidence_failure"`);
    const recovered = await sync.synchronizeShopifyPartnerBilling({ db, expectedApiKey: "marginlab-key", fetchPage: async ({ shopDomain }) => shopDomain === "recovery.myshopify.com" ? recoveryPage : page([]) });
    assert.equal(recovered.ok, true);
    assert.equal((await db.partnerReferral.findUnique({ where: { id: recoveryReferral.id } }))?.status, "QUALIFIED"); // M

    await Promise.all([
      sync.synchronizeShopifyPartnerBilling({ db, expectedApiKey: "marginlab-key", fetchPage: async ({ shopDomain }) => shopDomain === "recovery.myshopify.com" ? recoveryPage : page([]) }),
      sync.synchronizeShopifyPartnerBilling({ db, expectedApiKey: "marginlab-key", fetchPage: async ({ shopDomain }) => shopDomain === "recovery.myshopify.com" ? recoveryPage : page([]) }),
    ]);
    assert.equal(await db.normalizedBillingEvent.count({ where: { accountId: recoveryAccount.id } }), 2);
    assert.equal(await db.partnerMilestoneEvent.count({ where: { referralId: recoveryReferral.id, eventType: "QUALIFIED" } }), 1); // S

    const independentAccount = await db.account.create({ data: {} });
    const independentConnection = await db.channelConnection.create({ data: { accountId: independentAccount.id, channel: "SHOPIFY", externalAccountId: "independent.myshopify.com" } });
    await db.legacyShopMapping.create({ data: { shopDomain: "independent.myshopify.com", accountId: independentAccount.id, channelConnectionId: independentConnection.id } });
    const shopIsolation = await sync.synchronizeShopifyPartnerBilling({ db, expectedApiKey: "marginlab-key", fetchPage: async ({ shopDomain }) => {
      if (shopDomain === "sync.myshopify.com") throw new Error("temporary failure");
      return shopDomain === "independent.myshopify.com" ? page([edge("independent", sale("independent-paid", shopDomain))]) : page([]);
    } });
    assert.equal(shopIsolation.ok, false);
    assert.equal(await db.normalizedBillingEvent.count({ where: { accountId: independentAccount.id } }), 1); // page failure is isolated to its shop

    let disconnected = 0, exitCode = 0;
    await sync.executeBillingSyncCli({ run: async () => { throw new Error("fatal secret-token-value"); }, disconnect: async () => { disconnected += 1; }, report: () => assert.fail(), reportFatal: (code) => assert.equal(code, "BILLING_SYNC_FATAL"), setExitCode: (code) => { exitCode = code; } });
    assert.equal(disconnected, 1); assert.equal(exitCode, 1); // T
    console.log("Partner P3.2 production sync safety checks passed.");
  } finally { await db.$disconnect(); }
} finally { rmSync(temporaryDirectory, { recursive: true, force: true }); }
