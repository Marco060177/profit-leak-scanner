import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "marginlab-partner-p5-"));
const databasePath = path.join(temporaryDirectory, "partner.sqlite");
const setup = new DatabaseSync(databasePath);
setup.exec("PRAGMA foreign_keys = ON");
for (const name of readdirSync("prisma/migrations").filter((entry) => /^\d{14}_/.test(entry)).sort()) setup.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
setup.close();
process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;

try {
  const [{ PrismaClient }, program, rewards, dashboard] = await Promise.all([
    import("@prisma/client"), import("../../app/services/partner-program.server"),
    import("../../app/services/partner-rewards.server"), import("../../app/services/partner-dashboard.server"),
  ]);
  const db = new PrismaClient();
  try {
    const createPartnerWithQualified = async (code: string, qualified: number, attributedOnly = 0) => {
      const partner = await program.registerPartner(db, { displayName: `${code} Partner`, referralCode: code });
      for (let index = 0; index < qualified + attributedOnly; index += 1) {
        const account = await db.account.create({ data: {} });
        const referral = await program.attributeAccountToPartner(db, { accountId: account.id, partnerId: partner.id, attributionSource: "P5_TEST" });
        if (index < qualified) await db.partnerReferral.update({ where: { id: referral.id }, data: { status: "QUALIFIED", qualifiedAt: new Date("2026-10-01T00:00:00Z") } });
      }
      await rewards.evaluatePartnerRewardMilestones(db, partner.id, new Date("2026-10-02T00:00:00Z"));
      return { partner, view: await dashboard.getPartnerDashboard(db, { partnerId: partner.id }) };
    };

    const zero = await createPartnerWithQualified("ZERO_CODE", 0);
    assert.equal(zero.view.summary.qualifiedCustomers, 0);
    assert.deepEqual(zero.view.nextMilestone && [zero.view.nextMilestone.key, zero.view.nextMilestone.qualifiedCustomerTarget, zero.view.nextMilestone.reward.amountAtoms], ["STARTER", 1, "2500"]);

    const one = await createPartnerWithQualified("ONE_CODE", 1, 2);
    assert.equal(one.view.summary.rewardUnlocked.amountAtoms, "2500");
    assert.equal(one.view.nextMilestone?.key, "BUILDER");
    assert.equal(one.view.nextMilestone?.customersRemaining, 2);
    assert.equal(one.view.summary.attributedReferrals, 3);
    assert.equal(one.view.summary.qualifiedCustomers, 1); // attributed-only referrals do not affect rewards

    const five = await createPartnerWithQualified("FIVE_CODE", 5);
    assert.equal(five.view.summary.rewardUnlocked.amountAtoms, "15000");
    assert.equal(five.view.nextMilestone?.key, "PRO");
    assert.equal(five.view.nextMilestone?.customersRemaining, 5);

    const legend = await createPartnerWithQualified("LEGEND_CODE", 250);
    assert.equal(legend.view.summary.rewardUnlocked.amountAtoms, "1000000");
    assert.equal(legend.view.nextMilestone, null);
    assert.equal(legend.view.progressToMaximumPercent, 100);

    const expectedLadder = rewards.PARTNER_REWARD_TIERS.map((tier) => [tier.key, tier.qualifiedCustomers, tier.cumulativeRewardAtoms.toString()]);
    assert.deepEqual(zero.view.milestones.map((tier) => [tier.key, tier.qualifiedCustomerTarget, tier.reward.amountAtoms]), expectedLadder);
    assert.deepEqual(zero.view.milestones.map((tier) => tier.state), ["NEXT", "LOCKED", "LOCKED", "LOCKED", "LOCKED", "LOCKED", "LOCKED", "LOCKED"]);
    assert.equal(one.view.partner.referralLink, "https://marginlab.net/r/ONE_CODE");

    const forbidden = ["accountId", "referralId", "shopDomain", "myshopify", "billingEvent", "subscription", "revenue", "orders", "products", "email"];
    const serialized = JSON.stringify(one.view).toLowerCase();
    for (const term of forbidden) assert.equal(serialized.includes(term.toLowerCase()), false, `private field leaked: ${term}`);

    assert.equal(zero.view.summary.qualifiedCustomers, 0);
    assert.equal(zero.view.summary.attributedReferrals, 0);
    assert.notEqual(zero.partner.id, one.partner.id);
    await assert.rejects(dashboard.getPartnerDashboard(db, { partnerId: "missing-partner" }), /not found/);
    console.log("Partner P5 dashboard aggregate, reward, privacy and isolation checks passed.");
  } finally { await db.$disconnect(); }
} finally { rmSync(temporaryDirectory, { recursive: true, force: true }); }
