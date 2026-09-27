import type { Prisma, PrismaClient } from "@prisma/client";
import { getPartnerRewardProgress, PARTNER_REWARD_CURRENCY, PARTNER_REWARD_SCALE } from "~/services/partner-rewards.server";

type PayoutDb = PrismaClient | Prisma.TransactionClient;
const finalStatuses = ["PENDING", "APPROVED", "PAID"];

export async function reconcilePartnerPayout(db: PrismaClient, partnerId: string) {
  const normalized = partnerId.trim();
  if (!normalized) throw new Error("partnerId is required");
  return db.$transaction(async (tx) => {
    const progress = await getPartnerRewardProgress(tx, normalized);
    const entitlement = progress.highestUnlocked?.cumulativeRewardAtoms ?? 0n;
    if (progress.currencyCode !== PARTNER_REWARD_CURRENCY || progress.amountScale !== PARTNER_REWARD_SCALE) throw new Error("Unsupported payout money identity");
    const ranges = await tx.partnerPayout.findMany({
      where: { partnerId: normalized, status: { in: finalStatuses } },
      orderBy: [{ entitlementFromAtoms: "asc" }, { entitlementToAtoms: "asc" }],
    });
    let from = 0n;
    for (const range of ranges) {
      if (range.entitlementFromAtoms > from) break;
      if (range.entitlementToAtoms > from) from = range.entitlementToAtoms;
    }
    if (from >= entitlement) return null;
    const nextRange = ranges.find((range) => range.entitlementFromAtoms > from);
    const to = nextRange && nextRange.entitlementFromAtoms < entitlement ? nextRange.entitlementFromAtoms : entitlement;
    return tx.partnerPayout.create({ data: { partnerId: normalized, amountAtoms: to - from, amountScale: PARTNER_REWARD_SCALE, currencyCode: PARTNER_REWARD_CURRENCY, entitlementFromAtoms: from, entitlementToAtoms: to } });
  });
}

export async function listPartnerPayouts(db: PayoutDb, partnerId?: string) {
  return db.partnerPayout.findMany({ where: partnerId ? { partnerId } : undefined, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
}

export async function approvePartnerPayout(db: PrismaClient, id: string, approvedAt = new Date()) {
  return db.$transaction(async (tx) => {
    const row = await tx.partnerPayout.findUniqueOrThrow({ where: { id } });
    if (row.status === "APPROVED") return row;
    if (row.status !== "PENDING") throw new Error(`Cannot approve payout in ${row.status} state`);
    return tx.partnerPayout.update({ where: { id }, data: { status: "APPROVED", approvedAt } });
  });
}

export async function markPartnerPayoutPaid(db: PrismaClient, id: string, externalReference: string, paidAt = new Date()) {
  const reference = externalReference.trim();
  if (!reference) throw new Error("external payment reference is required");
  return db.$transaction(async (tx) => {
    const row = await tx.partnerPayout.findUniqueOrThrow({ where: { id } });
    if (row.status === "PAID") {
      if (row.externalReference !== reference) throw new Error("Paid payout reference cannot be changed");
      return row;
    }
    if (row.status !== "APPROVED") throw new Error(`Cannot mark payout paid from ${row.status} state`);
    return tx.partnerPayout.update({ where: { id }, data: { status: "PAID", paidAt, externalReference: reference } });
  });
}

export async function cancelPartnerPayout(db: PrismaClient, id: string, adminNote: string, cancelledAt = new Date()) {
  const note = adminNote.trim();
  if (!note) throw new Error("cancellation note is required");
  return db.$transaction(async (tx) => {
    const row = await tx.partnerPayout.findUniqueOrThrow({ where: { id } });
    if (row.status === "CANCELLED") return row;
    if (row.status === "PAID") throw new Error("Paid payout cannot be cancelled");
    return tx.partnerPayout.update({ where: { id }, data: { status: "CANCELLED", cancelledAt, adminNote: note } });
  });
}
