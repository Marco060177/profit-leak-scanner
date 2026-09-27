import type { PrismaClient } from "@prisma/client";
import { getPartnerRewardProgress, PARTNER_REWARD_TIERS } from "~/services/partner-rewards.server";

export type AuthorizedPartnerIdentity = Readonly<{ partnerId: string }>;
type RewardAmount = { amountAtoms: string; amountScale: number; currencyCode: string; formatted: string };
export type PartnerDashboardViewModel = {
  partner: { displayName: string; referralCode: string; referralLink: string };
  summary: { attributedReferrals: number; qualifiedCustomers: number; rewardUnlocked: RewardAmount; maximumReward: RewardAmount };
  nextMilestone: null | { key: string; label: string; qualifiedCustomerTarget: number; customersRemaining: number; reward: RewardAmount; progressPercent: number };
  milestones: Array<{ key: string; label: string; qualifiedCustomerTarget: number; reward: RewardAmount; state: "UNLOCKED" | "NEXT" | "LOCKED" }>;
  progressToMaximumPercent: number;
};

function amount(amountAtoms: bigint, amountScale: number, currencyCode: string): RewardAmount {
  return {
    amountAtoms: amountAtoms.toString(), amountScale, currencyCode,
    formatted: new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode, maximumFractionDigits: 0 })
      .format(Number(amountAtoms) / (10 ** amountScale)),
  };
}

export async function getPartnerDashboard(db: PrismaClient, identity: AuthorizedPartnerIdentity): Promise<PartnerDashboardViewModel> {
  const partnerId = identity.partnerId.trim();
  if (!partnerId) throw new Error("Authorized Partner identity is required");
  const partner = await db.partner.findUnique({ where: { id: partnerId }, select: { displayName: true, referralCode: true } });
  if (!partner) throw new Error("Authorized Partner not found");
  const [attributedReferrals, progress] = await Promise.all([
    db.partnerReferral.count({ where: { partnerId } }), getPartnerRewardProgress(db, partnerId),
  ]);
  const reward = (atoms: bigint) => amount(atoms, progress.amountScale, progress.currencyCode);
  const next = progress.nextTier;
  return {
    partner: { displayName: partner.displayName, referralCode: partner.referralCode, referralLink: `https://marginlab.net/r/${encodeURIComponent(partner.referralCode)}` },
    summary: {
      attributedReferrals, qualifiedCustomers: progress.qualifiedCustomers,
      rewardUnlocked: reward(progress.highestUnlocked?.cumulativeRewardAtoms ?? 0n),
      maximumReward: reward(progress.maxCumulativeRewardAtoms),
    },
    nextMilestone: next ? {
      key: next.key, label: next.label, qualifiedCustomerTarget: next.qualifiedCustomers,
      customersRemaining: progress.customersToNextTier, reward: reward(next.cumulativeRewardAtoms),
      progressPercent: Math.min(100, Math.round((progress.qualifiedCustomers / next.qualifiedCustomers) * 100)),
    } : null,
    milestones: PARTNER_REWARD_TIERS.map((tier) => ({
      key: tier.key, label: tier.label, qualifiedCustomerTarget: tier.qualifiedCustomers,
      reward: reward(tier.cumulativeRewardAtoms),
      state: progress.qualifiedCustomers >= tier.qualifiedCustomers ? "UNLOCKED" as const : tier.key === next?.key ? "NEXT" as const : "LOCKED" as const,
    })),
    progressToMaximumPercent: Math.min(100, Math.round((progress.qualifiedCustomers / PARTNER_REWARD_TIERS.at(-1)!.qualifiedCustomers) * 100)),
  };
}
