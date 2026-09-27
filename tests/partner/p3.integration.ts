import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "marginlab-partner-p3-"));
const databasePath = path.join(temporaryDirectory, "partner.sqlite");
const setup = new DatabaseSync(databasePath);
setup.exec("PRAGMA foreign_keys = ON");
for (const name of readdirSync("prisma/migrations").filter((entry) => /^\d{14}_/.test(entry)).sort()) {
  setup.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
}
setup.close();
process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;

try {
  const [{ PrismaClient }, partner, billing, shopify] = await Promise.all([
    import("@prisma/client"), import("../../app/services/partner-program.server"),
    import("../../app/services/billing-qualification.server"), import("../../app/services/shopify-billing-adapter.server"),
  ]);
  const db = new PrismaClient();
  try {
    const creator = await partner.registerPartner(db, { displayName: "Creator", referralCode: "P3CREATOR" });
    const accountA = await db.account.create({ data: {} });
    const accountB = await db.account.create({ data: {} });
    const accountNoReferral = await db.account.create({ data: {} });
    const referralA = await partner.attributeAccountToPartner(db, { accountId: accountA.id, partnerId: creator.id, attributionSource: "REFERRAL_LINK", attributedAt: new Date("2026-08-31T00:00:00Z") });
    const referralB = await partner.attributeAccountToPartner(db, { accountId: accountB.id, partnerId: creator.id, attributionSource: "REFERRAL_LINK", attributedAt: new Date("2026-09-10T00:00:00Z") });
    assert.equal((await billing.evaluatePartnerQualification(db, accountA.id))?.status, "ATTRIBUTED"); // A

    const makeEvent = (accountId: string, externalEventId: string, eventType: string, day: number) => billing.ingestNormalizedBillingEvent(db, {
      accountId, platform: "TEST", externalEventId, eventType, occurredAt: new Date(`2026-09-${String(day).padStart(2, "0")}T00:00:00Z`),
      amountAtoms: 3900n, amountScale: 2, currencyCode: "USD", subscriptionReference: "sub-test",
    });
    for (const [id, type, day] of [["trial", "TRIAL_STARTED", 1], ["free", "FREE_PERIOD", 2], ["failed", "PAYMENT_FAILED", 3], ["cancel", "SUBSCRIPTION_CANCELLED", 4]] as const) {
      await makeEvent(accountA.id, id, type, day);
    }
    assert.equal((await billing.evaluatePartnerQualification(db, accountA.id))?.status, "ATTRIBUTED"); // G-J
    const first = await makeEvent(accountA.id, "paid-1", billing.SUCCESSFUL_PAID_EVENT, 5);
    const replay = await makeEvent(accountA.id, "paid-1", billing.SUCCESSFUL_PAID_EVENT, 5);
    assert.equal(replay.id, first.id);
    assert.equal(await db.normalizedBillingEvent.count({ where: { platform: "TEST", externalEventId: "paid-1" } }), 1); // E,N
    await assert.rejects(makeEvent(accountB.id, "paid-1", billing.SUCCESSFUL_PAID_EVENT, 5), /conflicts/);
    assert.equal((await billing.evaluatePartnerQualification(db, accountA.id))?.status, "ATTRIBUTED"); // B

    await makeEvent(accountB.id, "other-paid", billing.SUCCESSFUL_PAID_EVENT, 5);
    assert.equal((await billing.evaluatePartnerQualification(db, accountB.id))?.status, "ATTRIBUTED");
    await makeEvent(accountB.id, "other-paid-2", billing.SUCCESSFUL_PAID_EVENT, 6);
    assert.equal((await billing.evaluatePartnerQualification(db, accountB.id))?.status, "ATTRIBUTED"); // pre-attribution history does not count
    assert.equal((await db.partnerReferral.findUnique({ where: { id: referralA.id } }))?.status, "ATTRIBUTED"); // L

    await makeEvent(accountA.id, "paid-2", billing.SUCCESSFUL_PAID_EVENT, 6);
    await makeEvent(accountA.id, "paid-2", billing.SUCCESSFUL_PAID_EVENT, 6); // F
    const qualified = await billing.evaluatePartnerQualification(db, accountA.id);
    assert.equal(qualified?.status, "QUALIFIED"); // C
    const qualifiedAt = qualified?.qualifiedAt?.getTime();
    assert.equal(await db.partnerQualificationEvidence.count({ where: { referralId: referralA.id } }), 2);
    assert.deepEqual((await db.partnerQualificationEvidence.findMany({ where: { referralId: referralA.id }, orderBy: { ordinal: "asc" }, include: { billingEvent: true } })).map((row) => row.billingEvent.externalEventId), ["paid-1", "paid-2"]); // Q
    assert.equal(await db.partnerMilestoneEvent.count({ where: { referralId: referralA.id, eventType: "QUALIFIED" } }), 1); // O
    await makeEvent(accountA.id, "paid-3", billing.SUCCESSFUL_PAID_EVENT, 7);
    await makeEvent(accountA.id, "post-cancel", "SUBSCRIPTION_CANCELLED", 8);
    await billing.evaluatePartnerQualification(db, accountA.id);
    assert.equal((await db.partnerReferral.findUnique({ where: { id: referralA.id } }))?.qualifiedAt?.getTime(), qualifiedAt); // D,K,P
    assert.equal(await db.partnerMilestoneEvent.count({ where: { referralId: referralA.id, eventType: "QUALIFIED" } }), 1);

    await makeEvent(accountNoReferral.id, "orphan-paid-1", billing.SUCCESSFUL_PAID_EVENT, 5);
    await makeEvent(accountNoReferral.id, "orphan-paid-2", billing.SUCCESSFUL_PAID_EVENT, 6);
    assert.equal(await billing.evaluatePartnerQualification(db, accountNoReferral.id), null);
    assert.equal(await db.partnerReferral.findUnique({ where: { accountId: accountNoReferral.id } }), null); // M

    const connection = await db.channelConnection.create({ data: { accountId: accountNoReferral.id, channel: "SHOPIFY", externalAccountId: "p3.myshopify.com" } });
    await db.legacyShopMapping.create({ data: { shopDomain: "p3.myshopify.com", accountId: accountNoReferral.id, channelConnectionId: connection.id } });
    const sale = { id: "gid://partners/AppSubscriptionSale/1", createdAt: "2026-09-09T00:00:00Z", chargeId: "gid://shopify/AppSubscription/1", billingInterval: "EVERY_30_DAYS", grossAmount: { amount: "39.00", currencyCode: "USD" }, app: { apiKey: "api-key" }, shop: { myshopifyDomain: "https://p3.myshopify.com/" } };
    const adapted = shopify.adaptShopifySubscriptionSale(accountNoReferral.id, sale);
    assert.deepEqual({ type: adapted.eventType, atoms: adapted.amountAtoms, scale: adapted.amountScale }, { type: billing.SUCCESSFUL_PAID_EVENT, atoms: 3900n, scale: 2 }); // R,S
    assert.equal(shopify.adaptShopifySubscriptionSale(accountNoReferral.id, { ...sale, id: "free-sale", grossAmount: { amount: "0.00", currencyCode: "USD" } }).eventType, "PAYMENT_NOT_PAID");
    assert.equal(shopify.adaptShopifySubscriptionSale(accountNoReferral.id, { ...sale, id: "unknown-amount", grossAmount: null }).eventType, "PAYMENT_NOT_PAID");
    await shopify.ingestShopifySubscriptionSale(db, sale, "api-key");
    await assert.rejects(shopify.ingestShopifySubscriptionSale(db, { ...sale, id: "wrong-app", app: { apiKey: "other" } }, "api-key"), /another app/);

    const databaseInvariantRejected = (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "P2003";
    await assert.rejects(db.normalizedBillingEvent.update({ where: { id: first.id }, data: { eventType: "PAYMENT_FAILED" } }), databaseInvariantRejected);
    await assert.rejects(db.normalizedBillingEvent.delete({ where: { id: first.id } }), databaseInvariantRejected);
    const evidence = await db.partnerQualificationEvidence.findFirstOrThrow({ where: { referralId: referralA.id } });
    await assert.rejects(db.partnerQualificationEvidence.delete({ where: { id: evidence.id } }), databaseInvariantRejected);
    await assert.rejects(db.partnerReferral.delete({ where: { id: referralB.id } }), databaseInvariantRejected); // U
    assert.equal((await db.partnerMilestoneEvent.findFirst({ where: { referralId: referralA.id, eventType: "QUALIFIED" } }))?.metadataJson, null); // T
    console.log("Partner P3 billing qualification integration checks passed.");
  } finally { await db.$disconnect(); }
} finally { rmSync(temporaryDirectory, { recursive: true, force: true }); }
