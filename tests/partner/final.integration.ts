import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-partner-final-"));
const databasePath = path.join(directory, "partner.sqlite");
const sqlite = new DatabaseSync(databasePath); sqlite.exec("PRAGMA foreign_keys=ON");
for (const name of readdirSync("prisma/migrations").filter((name) => /^\d{14}_/.test(name)).sort()) sqlite.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
sqlite.close(); process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`; process.env.NODE_ENV = "test";

const secret = "isolated-final-e2e-secret";
const cookieHeader = (setCookie: string) => setCookie.split(";", 1)[0];
try {
  const [{ PrismaClient }, program, referralFlow, billing, rewards, payouts, auth, dashboard] = await Promise.all([
    import("@prisma/client"), import("../../app/services/partner-program.server"), import("../../app/services/partner-referral-flow.server"),
    import("../../app/services/billing-qualification.server"), import("../../app/services/partner-rewards.server"),
    import("../../app/services/partner-payouts.server"), import("../../app/services/partner-auth.server"), import("../../app/services/partner-dashboard.server"),
  ]);
  const db = new PrismaClient();
  try {
    const partnerA = await program.registerPartner(db, { displayName: "Final Creator A", referralCode: "FINAL-A" });
    const partnerB = await program.registerPartner(db, { displayName: "Final Creator B", referralCode: "FINAL-B" });
    const account = await db.account.create({ data: {} });
    const channel = await db.channelConnection.create({ data: { accountId: account.id, channel: "SHOPIFY", externalAccountId: "final.myshopify.com" } });
    const capturedAt = new Date("2026-10-10T00:00:00Z");
    const capture = await referralFlow.capturePartnerReferralCode(db, "final-a", null, secret, capturedAt);
    assert.equal(capture.captured, true); const cookie = cookieHeader(capture.setCookie!);
    const secondTouch = await referralFlow.capturePartnerReferralCode(db, "FINAL-B", cookie, secret, new Date("2026-10-10T00:01:00Z"));
    assert.equal("reason" in secondTouch && secondTouch.reason, "FIRST_TOUCH_PRESERVED");

    const event = (id: string, type: string, occurredAt: string, amountAtoms = 3900n) => billing.ingestNormalizedBillingEvent(db, {
      accountId: account.id, platform: "SHOPIFY", externalEventId: id, eventType: type, occurredAt: new Date(occurredAt),
      amountAtoms, amountScale: 2, currencyCode: "USD", subscriptionReference: "subscription-final",
    });
    await event("pre-attribution", billing.SUCCESSFUL_PAID_EVENT, "2026-10-09T00:00:00Z");
    const claim = await referralFlow.claimPartnerReferral(db, { accountId: account.id, channelConnectionId: channel.id, channel: "SHOPIFY" }, cookie, secret, new Date("2026-10-10T00:02:00Z"));
    assert.equal(claim.status, "ATTRIBUTED");
    const referral = await db.partnerReferral.findUniqueOrThrow({ where: { accountId: account.id } }); assert.equal(referral.partnerId, partnerA.id);
    await assert.rejects(program.attributeAccountToPartner(db, { accountId: account.id, partnerId: partnerB.id, attributionSource: "ATTACK" }), program.PartnerAttributionConflictError);
    await assert.rejects(db.partnerReferral.delete({ where: { id: referral.id } }));

    await event("failed", "PAYMENT_FAILED", "2026-10-11T00:00:00Z"); await event("zero", "PAYMENT_NOT_PAID", "2026-10-12T00:00:00Z", 0n);
    const first = await event("paid-1", billing.SUCCESSFUL_PAID_EVENT, "2026-10-13T00:00:00Z");
    assert.equal((await billing.evaluatePartnerQualification(db, account.id))?.status, "ATTRIBUTED");
    assert.equal((await event("paid-1", billing.SUCCESSFUL_PAID_EVENT, "2026-10-13T00:00:00Z")).id, first.id);
    assert.equal((await billing.evaluatePartnerQualification(db, account.id))?.status, "ATTRIBUTED");
    await event("paid-2", billing.SUCCESSFUL_PAID_EVENT, "2026-10-14T00:00:00Z");
    assert.equal((await billing.evaluatePartnerQualification(db, account.id))?.status, "QUALIFIED");
    await billing.evaluatePartnerQualification(db, account.id);
    assert.equal(await db.partnerQualificationEvidence.count({ where: { referralId: referral.id } }), 2);
    assert.equal(await db.partnerMilestoneEvent.count({ where: { referralId: referral.id, eventType: "QUALIFIED" } }), 1);
    assert.equal(await db.partnerRewardMilestone.count({ where: { partnerId: partnerA.id, tierKey: "STARTER" } }), 1);
    const progress = await rewards.getPartnerRewardProgress(db, partnerA.id); assert.equal(progress.highestUnlocked?.cumulativeRewardAtoms, 2500n);
    const payout = await payouts.reconcilePartnerPayout(db, partnerA.id); assert.equal(payout?.amountAtoms, 2500n); assert.equal(payout?.status, "PENDING");
    assert.equal(await payouts.reconcilePartnerPayout(db, partnerA.id), null);

    await db.channelConnection.update({ where: { id: channel.id }, data: { externalAccountId: "final-changed.myshopify.com" } });
    assert.equal((await db.partnerReferral.findUniqueOrThrow({ where: { accountId: account.id } })).partnerId, partnerA.id);
    assert.equal(await auth.authenticatePartner(db, new Request("https://app.test/partner", { headers: { Cookie: `ml_partner_session=${partnerA.referralCode}` } })), null);
    const invitation = await auth.issuePartnerAccessToken(db, partnerA.id, new Date("2026-10-15T00:00:00Z"));
    assert.equal(await db.partnerAccessToken.findFirst({ where: { tokenHash: invitation.rawToken } }), null);
    const session = await auth.consumePartnerAccessToken(db, invitation.rawToken, new Date("2026-10-15T00:01:00Z")); assert.ok(session);
    assert.equal(await auth.consumePartnerAccessToken(db, invitation.rawToken, new Date("2026-10-15T00:02:00Z")), null);
    const identity = await auth.authenticatePartner(db, new Request("https://app.test/partner", { headers: { Cookie: cookieHeader(session!.setCookie) } }), new Date("2026-10-15T00:03:00Z"));
    assert.deepEqual(identity, { partnerId: partnerA.id });
    const viewA = await dashboard.getPartnerDashboard(db, identity!); const viewB = await dashboard.getPartnerDashboard(db, { partnerId: partnerB.id });
    assert.equal(viewA.summary.qualifiedCustomers, 1); assert.equal(viewA.summary.rewardUnlocked.amountAtoms, "2500"); assert.equal(viewA.payouts.pending.amountAtoms, "2500");
    assert.equal(viewB.summary.qualifiedCustomers, 0); assert.equal(viewB.payouts.pending.amountAtoms, "0");
    const serialized = JSON.stringify(viewA).toLowerCase();
    for (const forbidden of ["accountid", "referralid", "myshopify", "email", "orders", "revenue", "products", "subscription", "adminnote", "externalreference", "tokenhash", account.id.toLowerCase(), referral.id.toLowerCase()]) assert.equal(serialized.includes(forbidden), false, `private field leaked: ${forbidden}`);
    console.log("Partner Program v1 final isolated referral-to-payout E2E checks passed.");
  } finally { await db.$disconnect(); }
} finally { rmSync(directory, { recursive: true, force: true }); }
