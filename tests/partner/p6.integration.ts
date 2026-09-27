import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-partner-p6-"));
const databasePath = path.join(directory, "partner.sqlite");
const sqlite = new DatabaseSync(databasePath); sqlite.exec("PRAGMA foreign_keys=ON");
for (const name of readdirSync("prisma/migrations").filter((name) => /^\d{14}_/.test(name)).sort()) sqlite.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
sqlite.close(); process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;

try {
  const [{ PrismaClient }, program, rewards, payouts, dashboard] = await Promise.all([
    import("@prisma/client"), import("../../app/services/partner-program.server"), import("../../app/services/partner-rewards.server"),
    import("../../app/services/partner-payouts.server"), import("../../app/services/partner-dashboard.server"),
  ]);
  const db = new PrismaClient();
  try {
    assert.deepEqual(rewards.PARTNER_REWARD_TIERS.map((tier) => [tier.qualifiedCustomers, tier.cumulativeRewardAtoms]), [[1, 2500n], [3, 7500n], [5, 15000n], [10, 40000n], [25, 100000n], [50, 250000n], [100, 500000n], [250, 1000000n]]);
    const creator = await program.registerPartner(db, { displayName: "P6 Creator", referralCode: "P6CREATOR" });
    const other = await program.registerPartner(db, { displayName: "Other", referralCode: "P6OTHER" });
    const qualifyTo = async (target: number) => {
      const current = await db.partnerReferral.count({ where: { partnerId: creator.id, status: "QUALIFIED" } });
      for (let index = current; index < target; index += 1) {
        const account = await db.account.create({ data: {} });
        const referral = await program.attributeAccountToPartner(db, { accountId: account.id, partnerId: creator.id, attributionSource: "P6_TEST" });
        await db.partnerReferral.update({ where: { id: referral.id }, data: { status: "QUALIFIED", qualifiedAt: new Date("2026-10-03T00:00:00Z") } });
      }
      await rewards.evaluatePartnerRewardMilestones(db, creator.id, new Date("2026-10-03T00:00:00Z"));
    };
    const totalLive = async () => (await db.partnerPayout.aggregate({ where: { partnerId: creator.id, status: { not: "CANCELLED" } }, _sum: { amountAtoms: true } }))._sum.amountAtoms ?? 0n;

    assert.equal(await payouts.reconcilePartnerPayout(db, creator.id), null);
    await qualifyTo(1); const first = await payouts.reconcilePartnerPayout(db, creator.id); assert.equal(first?.amountAtoms, 2500n); assert.equal(first?.status, "PENDING");
    assert.equal(await payouts.reconcilePartnerPayout(db, creator.id), null); assert.equal(await db.partnerPayout.count({ where: { partnerId: creator.id } }), 1);
    await qualifyTo(3); assert.equal((await payouts.reconcilePartnerPayout(db, creator.id))?.amountAtoms, 5000n); assert.equal(await totalLive(), 7500n);
    await qualifyTo(5); assert.equal((await payouts.reconcilePartnerPayout(db, creator.id))?.amountAtoms, 7500n); assert.equal(await totalLive(), 15000n);
    await qualifyTo(10); assert.equal((await payouts.reconcilePartnerPayout(db, creator.id))?.amountAtoms, 25000n); assert.equal(await totalLive(), 40000n);

    const approved = await payouts.approvePartnerPayout(db, first!.id, new Date("2026-10-04T00:00:00Z")); assert.equal(approved.status, "APPROVED");
    assert.equal((await payouts.approvePartnerPayout(db, first!.id)).status, "APPROVED");
    const paid = await payouts.markPartnerPayoutPaid(db, first!.id, "WIRE-001", new Date("2026-10-05T00:00:00Z")); assert.equal(paid.status, "PAID");
    assert.equal((await payouts.markPartnerPayoutPaid(db, first!.id, "WIRE-001")).status, "PAID");
    await assert.rejects(payouts.markPartnerPayoutPaid(db, first!.id, "WIRE-CHANGED"), /cannot be changed/);
    await assert.rejects(payouts.cancelPartnerPayout(db, first!.id, "fraud"), /cannot be cancelled/);
    await assert.rejects(db.partnerPayout.delete({ where: { id: first!.id } }));
    await assert.rejects(db.partnerPayout.update({ where: { id: first!.id }, data: { amountAtoms: 1n } }));

    const cancellable = (await db.partnerPayout.findFirstOrThrow({ where: { partnerId: creator.id, status: "PENDING" }, orderBy: { createdAt: "asc" } }));
    await assert.rejects(payouts.markPartnerPayoutPaid(db, cancellable.id, "TOO-EARLY"), /from PENDING/);
    await payouts.approvePartnerPayout(db, cancellable.id);
    await payouts.cancelPartnerPayout(db, cancellable.id, "manual review");
    const replacement = await payouts.reconcilePartnerPayout(db, creator.id); assert.equal(replacement?.amountAtoms, cancellable.amountAtoms); assert.equal(await totalLive(), 40000n);

    await rewards.evaluatePartnerRewardMilestones(db, other.id); assert.equal(await payouts.reconcilePartnerPayout(db, other.id), null); assert.equal(await db.partnerPayout.count({ where: { partnerId: other.id } }), 0);
    const view = await dashboard.getPartnerDashboard(db, { partnerId: creator.id });
    assert.equal(view.payouts.paid.amountAtoms, "2500"); assert.equal(view.payouts.outstanding.amountAtoms, "37500");
    const serialized = JSON.stringify(view).toLowerCase();
    for (const forbidden of ["adminnote", "externalreference", "wire-001", "accountid", "shopdomain", creator.id.toLowerCase(), other.id.toLowerCase()]) assert.equal(serialized.includes(forbidden), false, `private field leaked: ${forbidden}`);

    await qualifyTo(250); await payouts.reconcilePartnerPayout(db, creator.id); assert.equal(await totalLive(), 1000000n); assert.equal(await payouts.reconcilePartnerPayout(db, creator.id), null);
    const concurrencyPartner = await program.registerPartner(db, { displayName: "Concurrent", referralCode: "P6RACE" });
    const account = await db.account.create({ data: {} }); const referral = await program.attributeAccountToPartner(db, { accountId: account.id, partnerId: concurrencyPartner.id, attributionSource: "P6_TEST" });
    await db.partnerReferral.update({ where: { id: referral.id }, data: { status: "QUALIFIED", qualifiedAt: new Date() } }); await rewards.evaluatePartnerRewardMilestones(db, concurrencyPartner.id);
    await Promise.allSettled([payouts.reconcilePartnerPayout(db, concurrencyPartner.id), payouts.reconcilePartnerPayout(db, concurrencyPartner.id)]);
    const raceRows = await db.partnerPayout.findMany({ where: { partnerId: concurrencyPartner.id } }); assert.equal(raceRows.length, 1); assert.equal(raceRows[0].amountAtoms, 2500n);
    console.log("Partner P6 payout accounting, state, audit, privacy and idempotency checks passed.");
  } finally { await db.$disconnect(); }
} finally { rmSync(directory, { recursive: true, force: true }); }
