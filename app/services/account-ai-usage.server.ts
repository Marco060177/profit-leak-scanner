import { Prisma, type PrismaClient } from "@prisma/client";
import type { AuthenticatedTenantContext } from "~/core/authenticated-tenant-context";
import { AiUsageSafetyError, verifySingleShopifyOwner } from "~/services/ai-usage-ownership.server";
import { normalizeVerifiedShopDomain } from "~/connectors/shopify/shop-domain";

type Input = {
  db: PrismaClient;
  shop: string;
  tenant: AuthenticatedTenantContext;
  month: string;
};
type ReservationInput = Input & { reservationId: string };
export type AccountReservationResult = { status: "RESERVED"; reservationId: string } | { status: "QUOTA_EXCEEDED" };

function period(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Invalid UTC AI usage period");
  return month;
}

function safety(reason: string, month: string): never {
  console.error("[ACCOUNT_AI_USAGE]", { reason, periodKey: month });
  throw new AiUsageSafetyError("COMPENSATION_BLOCKED");
}

function retryable(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P2002", "P2034", "P1008"].includes(error.code);
}

/** Account quota and durable reservation are updated atomically. */
export async function reserveAccountAiUsage({ db, shop, tenant, month, limit = 100 }: Input & { limit?: number }): Promise<AccountReservationResult> {
  const periodKey = period(month);
  const verifiedShop = normalizeVerifiedShopDomain(shop);
  if (limit !== 100) throw new Error("Unsupported AI usage limit");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const result = await db.$transaction(async (tx) => {
        await verifySingleShopifyOwner(tx, verifiedShop, tenant, periodKey);
        const updated = await tx.accountAiUsage.updateMany({
          where: { accountId: tenant.accountId, periodKey, requests: { gte: 0, lt: limit } },
          data: { requests: { increment: 1 } },
        });
        if (updated.count === 0) {
          const existing = await tx.accountAiUsage.findUnique({
            where: { accountId_periodKey: { accountId: tenant.accountId, periodKey } },
          });
          if (existing) {
            if (existing.requests === limit) return { status: "QUOTA_EXCEEDED" as const };
            return safety("INVALID_ACCOUNT_COUNT", periodKey);
          }
          await tx.accountAiUsage.create({ data: { accountId: tenant.accountId, periodKey, requests: 1 } });
        }
        const reservation = await tx.accountAiUsageReservation.create({
          data: { accountId: tenant.accountId, periodKey, status: "RESERVED" },
        });
        return { status: "RESERVED" as const, reservationId: reservation.id };
      });
      return result;
    } catch (error) {
      if (!retryable(error)) throw error;
      if (attempt === 4) return safety("ACCOUNT_RESERVATION_CONTENTION", periodKey);
      await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
    }
  }
  return safety("ACCOUNT_RESERVATION_CONTENTION", periodKey);
}

export async function completeAccountAiUsage({ db, shop, tenant, month, reservationId }: ReservationInput): Promise<void> {
  const periodKey = period(month);
  const verifiedShop = normalizeVerifiedShopDomain(shop);
  if (tenant.channel !== "SHOPIFY" || tenant.legacyShopDomain !== verifiedShop) {
    return safety("COMPLETION_OWNER_INVALID", periodKey);
  }
  await db.$transaction(async (tx) => {
    // Finalize a previously authorized reservation by its immutable Account owner;
    // uninstall must not strand an already charged request.
    const changed = await tx.accountAiUsageReservation.updateMany({
      where: { id: reservationId, accountId: tenant.accountId, periodKey, status: "RESERVED" },
      data: { status: "COMPLETED" },
    });
    if (changed.count === 1) return;
    const existing = await tx.accountAiUsageReservation.findUnique({ where: { id: reservationId } });
    if (existing?.accountId === tenant.accountId && existing.periodKey === periodKey && existing.status === "COMPLETED") return;
    return safety("COMPLETION_BLOCKED", periodKey);
  });
}

export async function compensateAccountAiUsage({ db, shop, tenant, month, reservationId }: ReservationInput): Promise<void> {
  const periodKey = period(month);
  const verifiedShop = normalizeVerifiedShopDomain(shop);
  if (tenant.channel !== "SHOPIFY" || tenant.legacyShopDomain !== verifiedShop) {
    return safety("COMPENSATION_OWNER_INVALID", periodKey);
  }
  await db.$transaction(async (tx) => {
    const reservation = await tx.accountAiUsageReservation.findUnique({ where: { id: reservationId } });
    if (!reservation || reservation.accountId !== tenant.accountId || reservation.periodKey !== periodKey) {
      return safety("RESERVATION_OWNERSHIP_INVALID", periodKey);
    }
    if (reservation.status === "COMPENSATED") return;
    if (reservation.status !== "RESERVED") return safety("COMPENSATION_BLOCKED", periodKey);
    const changed = await tx.accountAiUsageReservation.updateMany({
      where: { id: reservationId, accountId: tenant.accountId, periodKey, status: "RESERVED" },
      data: { status: "COMPENSATED" },
    });
    if (changed.count !== 1) return safety("COMPENSATION_RACE", periodKey);
    const usage = await tx.accountAiUsage.updateMany({
      where: { accountId: tenant.accountId, periodKey, requests: { gt: 0 } },
      data: { requests: { decrement: 1 } },
    });
    if (usage.count !== 1) return safety("ACCOUNT_DECREMENT_BLOCKED", periodKey);
    return;
  });
}
