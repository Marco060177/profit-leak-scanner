import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "marginlab-partner-p4-"));
const databasePath = path.join(temporaryDirectory, "partner.sqlite");
const setup = new DatabaseSync(databasePath);
setup.exec("PRAGMA foreign_keys = ON");
for (const name of readdirSync("prisma/migrations").filter((entry) => /^\d{14}_/.test(entry)).sort()) {
  setup.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
}
setup.close();
process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;

try {
  const [{ PrismaClient }, partner, rewards] = await Promise.all([
    import("@prisma/client"),
    import("../../app/services/partner-program.server"),
    import("../../app/services/partner-rewards.server"),
  ]);
  const db = new PrismaClient();
  try {
    assert.deepEqual(
      rewards.PARTNER_REWARD_TIERS.map((tier) => [tier.qualifiedCustomers, tier.cumulativeRewardAtoms]),
      [[1, 2500n], [3, 7500n], [5, 15000n], [10, 40000n], [25, 100000n], [50, 250000n], [100, 500000n], [250, 1000000n]],
    );

    const creator = await partner.registerPartner(db, { displayName: "P4 Creator", referralCode: "P4CREATOR" });
    const qualify = async (index: number) => {
      const account = await db.account.create({ data: {} });
      const referral = await partner.attributeAccountToPartner(db, {
        accountId: account.id, partnerId: creator.id, attributionSource: "P4_TEST",
      });
      return db.partnerReferral.update({
        where: { id: referral.id }, data: { status: "QUALIFIED", qualifiedAt: new Date(`2026-10-${String(index + 1).padStart(2, "0")}T00:00:00Z`) },
      });
    };

    let result = await rewards.evaluatePartnerRewardMilestones(db, creator.id, new Date("2026-10-01T00:00:00Z"));
    assert.equal(result.qualifiedCustomers, 0);
    assert.equal(result.unlocked.length, 0);
    assert.equal(result.nextTier?.key, "STARTER");

    await qualify(0);
    result = await rewards.evaluatePartnerRewardMilestones(db, creator.id, new Date("2026-10-02T00:00:00Z"));
    assert.equal(result.unlocked.length, 1);
    assert.equal(result.unlocked[0].tierKey, "STARTER");
    assert.equal(result.unlocked[0].cumulativeRewardAtoms, 2500n);

    await rewards.evaluatePartnerRewardMilestones(db, creator.id, new Date("2026-10-03T00:00:00Z"));
    assert.equal(await db.partnerRewardMilestone.count({ where: { partnerId: creator.id } }), 1);

    await qualify(1); await qualify(2); await qualify(3); await qualify(4);
    result = await rewards.evaluatePartnerRewardMilestones(db, creator.id, new Date("2026-10-06T00:00:00Z"));
    assert.deepEqual(result.unlocked.map((row) => row.tierKey), ["STARTER", "BUILDER", "GROWTH"]);
    assert.equal(result.nextTier?.key, "PRO");

    const progress = await rewards.getPartnerRewardProgress(db, creator.id);
    assert.equal(progress.qualifiedCustomers, 5);
    assert.equal(progress.highestUnlocked?.cumulativeRewardAtoms, 15000n);
    assert.equal(progress.customersToNextTier, 5);
    assert.equal(progress.maxCumulativeRewardAtoms, 1000000n);

    const starter = await db.partnerRewardMilestone.findUniqueOrThrow({
      where: { partnerId_tierKey: { partnerId: creator.id, tierKey: "STARTER" } },
    });
    const immutableRejected = (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "P2003";
    await assert.rejects(db.partnerRewardMilestone.update({ where: { id: starter.id }, data: { cumulativeRewardAtoms: 9999n } }), immutableRejected);
    await assert.rejects(db.partnerRewardMilestone.delete({ where: { id: starter.id } }), immutableRejected);

    console.log("Partner P4 reward milestone integration checks passed.");
  } finally { await db.$disconnect(); }
} finally { rmSync(temporaryDirectory, { recursive: true, force: true }); }
