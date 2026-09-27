import { Prisma, type PrismaClient } from "@prisma/client";

type PartnerDb = PrismaClient | Prisma.TransactionClient;

export const PARTNER_REWARD_CURRENCY = "USD";
export const PARTNER_REWARD_SCALE = 2;

export const PARTNER_REWARD_TIERS = [
  { key: "STARTER", label: "Starter", qualifiedCustomers: 1, cumulativeRewardAtoms: 2500n },
  { key: "BUILDER", label: "Builder", qualifiedCustomers: 3, cumulativeRewardAtoms: 7500n },
  { key: "GROWTH", label: "Growth", qualifiedCustomers: 5, cumulativeRewardAtoms: 15000n },
  { key: "PRO", label: "Pro", qualifiedCustomers: 10, cumulativeRewardAtoms: 40000n },
  { key: "ACCELERATOR", label: "Accelerator", qualifiedCustomers: 25, cumulativeRewardAtoms: 100000n },
  { key: "ELITE", label: "Elite", qualifiedCustomers: 50, cumulativeRewardAtoms: 250000n },
  { key: "AMBASSADOR", label: "Ambassador", qualifiedCustomers: 100, cumulativeRewardAtoms: 500000n },
  { key: "LEGEND", label: "Legend", qualifiedCustomers: 250, cumulativeRewardAtoms: 1000000n },
] as const;

const uniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

export async function evaluatePartnerRewardMilestones(db: PrismaClient, partnerId: string, unlockedAt = new Date()) {
  const normalizedPartnerId = partnerId.trim();
  if (!normalizedPartnerId) throw new Error("partnerId is required");

  return db.$transaction(async (tx) => {
    const partner = await tx.partner.findUnique({ where: { id: normalizedPartnerId } });
    if (!partner) throw new Error("Partner not found");

    const qualifiedCustomers = await tx.partnerReferral.count({
      where: { partnerId: normalizedPartnerId, status: "QUALIFIED" },
    });

    const unlocked = [];
    for (const tier of PARTNER_REWARD_TIERS) {
      if (qualifiedCustomers < tier.qualifiedCustomers) break;
      const existing = await tx.partnerRewardMilestone.findUnique({
        where: { partnerId_tierKey: { partnerId: normalizedPartnerId, tierKey: tier.key } },
      });
      if (existing) {
        unlocked.push(existing);
        continue;
      }
      try {
        unlocked.push(await tx.partnerRewardMilestone.create({
          data: {
            partnerId: normalizedPartnerId,
            tierKey: tier.key,
            qualifiedCustomerThreshold: tier.qualifiedCustomers,
            cumulativeRewardAtoms: tier.cumulativeRewardAtoms,
            amountScale: PARTNER_REWARD_SCALE,
            currencyCode: PARTNER_REWARD_CURRENCY,
            unlockedAt,
          },
        }));
      } catch (error) {
        if (!uniqueViolation(error)) throw error;
        unlocked.push(await tx.partnerRewardMilestone.findUniqueOrThrow({
          where: { partnerId_tierKey: { partnerId: normalizedPartnerId, tierKey: tier.key } },
        }));
      }
    }

    const nextTier = PARTNER_REWARD_TIERS.find((tier) => qualifiedCustomers < tier.qualifiedCustomers) ?? null;
    return { qualifiedCustomers, unlocked, nextTier };
  });
}

export async function getPartnerRewardProgress(db: PartnerDb, partnerId: string) {
  const qualifiedCustomers = await db.partnerReferral.count({ where: { partnerId, status: "QUALIFIED" } });
  const unlocked = await db.partnerRewardMilestone.findMany({
    where: { partnerId },
    orderBy: [{ qualifiedCustomerThreshold: "asc" }, { unlockedAt: "asc" }],
  });
  const nextTier = PARTNER_REWARD_TIERS.find((tier) => qualifiedCustomers < tier.qualifiedCustomers) ?? null;
  const highestUnlocked = unlocked.at(-1) ?? null;
  return {
    qualifiedCustomers,
    unlocked,
    highestUnlocked,
    nextTier,
    customersToNextTier: nextTier ? Math.max(0, nextTier.qualifiedCustomers - qualifiedCustomers) : 0,
    maxCumulativeRewardAtoms: PARTNER_REWARD_TIERS.at(-1)!.cumulativeRewardAtoms,
    currencyCode: PARTNER_REWARD_CURRENCY,
    amountScale: PARTNER_REWARD_SCALE,
  };
}
