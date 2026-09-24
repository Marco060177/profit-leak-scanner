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

/** Internal, read-only gate for a separately authorized irreversible purge.
 * No retention duration or deletion authority has been approved yet.
 */
export async function assessAccountPurge(accountId: string) {
  if (!accountId.trim()) throw new Error("Account identity is required.");
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) throw new Error("Account not found.");
  const shops = await prisma.legacyShopMapping.findMany({
    where: { accountId }, select: { shopDomain: true },
  });
  const shopDomains = shops.map(({ shopDomain }) => shopDomain);
  const [channels, usage, reservations, preferences, deliveries, taxProfiles, assumptions, snapshots, alerts, alertEvents,
    actions, impactMeasurements, impactEvents, legacyAiUsage, sessions] = await Promise.all([
    prisma.channelConnection.count({ where: { accountId } }),
    prisma.accountAiUsage.count({ where: { accountId } }),
    prisma.accountAiUsageReservation.count({ where: { accountId } }),
    prisma.notificationPreferences.count({ where: { accountId } }),
    prisma.notificationDelivery.count({ where: { accountId } }),
    prisma.storeTaxProfile.count({ where: { shop: { in: shopDomains } } }),
    prisma.profitAssumptions.count({ where: { shop: { in: shopDomains } } }),
    prisma.profitMonitorSnapshot.count({ where: { shop: { in: shopDomains } } }),
    prisma.profitMonitorAlert.count({ where: { shop: { in: shopDomains } } }),
    prisma.profitMonitorAlertEvent.count({ where: { alert: { shop: { in: shopDomains } } } }),
    prisma.profitImpactAction.count({ where: { shop: { in: shopDomains } } }),
    prisma.profitImpactMeasurement.count({ where: { action: { shop: { in: shopDomains } } } }),
    prisma.profitImpactEvent.count({ where: { action: { shop: { in: shopDomains } } } }),
    prisma.aiUsage.count({ where: { shop: { in: shopDomains } } }),
    prisma.session.count({ where: { shop: { in: shopDomains } } }),
  ]);
  return {
    eligible: false as const,
    accountStatus: account.status,
    retained: { channels, mappings: shops.length, usage, reservations, preferences, deliveries,
      taxProfiles, assumptions, snapshots, alerts, alertEvents, actions, impactMeasurements,
      impactEvents, legacyAiUsage, sessions },
    unresolved: [
      "Approved retention period and purge authorization are not defined.",
      "Channel provenance, Account quota, notification history and Shopify operational data need an approved deletion policy.",
    ],
  };
}
