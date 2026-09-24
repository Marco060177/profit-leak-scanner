import prisma from "~/db.server";

/** Trusted internal boundary only; never call from a Shopify uninstall/redact webhook. */
export async function requestAccountDeletion(accountId: string) {
  if (!accountId.trim()) throw new Error("Account identity is required.");
  return prisma.$transaction(async (tx) => {
    const account = await tx.account.findUnique({ where: { id: accountId } });
    if (!account) throw new Error("Account not found.");
    if (account.status === "PENDING_DELETION") return { status: "PENDING_DELETION" as const, changed: false };
    if (account.status !== "ACTIVE") throw new Error("Unsafe Account lifecycle state.");
    const inFlight = await tx.notificationDelivery.count({ where: { accountId, status: "processing" } });
    if (inFlight) throw new Error("Account deletion waits for in-flight notification deliveries.");
    const shops = await tx.legacyShopMapping.findMany({ where: { accountId }, select: { shopDomain: true } });
    const changed = await tx.account.updateMany({
      where: { id: accountId, status: "ACTIVE" },
      data: { status: "PENDING_DELETION", deletionRequestedAt: new Date() },
    });
    if (changed.count !== 1) throw new Error("Account lifecycle changed concurrently.");
    await tx.channelConnection.updateMany({
      where: { accountId }, data: { status: "PENDING_DELETION" },
    });
    await tx.notificationDelivery.updateMany({
      where: { accountId, status: "pending" }, data: { status: "cancelled" },
    });
    await tx.session.deleteMany({ where: { shop: { in: shops.map((item) => item.shopDomain) } } });
    return { status: "PENDING_DELETION" as const, changed: true };
  });
}
