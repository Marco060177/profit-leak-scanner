import prisma from "~/db.server";
import { resolveNotificationShopOwner } from "~/services/notification-ownership.server";

type DeliveryOwner = {
  accountId: string | null;
  channelConnectionId: string | null;
  shop: string | null;
};

/** Ownership classification only; content and entitlement remain adapter-specific. */
export async function classifyNotificationDispatchOwner(delivery: DeliveryOwner) {
  if (!delivery.accountId) return { kind: "UNATTRIBUTED" as const };
  const account = await prisma.account.findUnique({ where: { id: delivery.accountId }, select: { status: true } });
  if (account?.status !== "ACTIVE") return { kind: "INACTIVE" as const };
  if (!delivery.channelConnectionId) {
    return delivery.shop
      ? { kind: "UNATTRIBUTED" as const }
      : { kind: "UNSUPPORTED" as const, reason: "Account-wide notification adapter is not configured." };
  }
  const connection = await prisma.channelConnection.findUnique({ where: { id: delivery.channelConnectionId } });
  if (!connection || connection.accountId !== delivery.accountId || connection.status !== "ACTIVE") {
    return { kind: "INACTIVE" as const };
  }
  if (connection.channel !== "SHOPIFY") {
    return { kind: "UNSUPPORTED" as const, reason: `${connection.channel} notification adapter is not configured.` };
  }
  if (!delivery.shop) return { kind: "UNATTRIBUTED" as const };
  try {
    const owner = await resolveNotificationShopOwner(delivery.shop);
    if (owner.accountId !== delivery.accountId || owner.channelConnectionId !== connection.id) {
      return { kind: "INACTIVE" as const };
    }
  } catch {
    return { kind: "INACTIVE" as const };
  }
  return { kind: "SHOPIFY" as const, shop: delivery.shop };
}
