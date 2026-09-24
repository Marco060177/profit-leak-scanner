import prisma from "~/db.server";

export async function deleteShopData(shop: string) {
  return prisma.$transaction(async (tx) => {
    const mapping = await tx.legacyShopMapping.findUnique({
      where: { shopDomain: shop }, include: { channelConnection: true },
    });
    if (mapping && mapping.channelConnection.accountId === mapping.accountId &&
      mapping.channelConnection.channel === "SHOPIFY" &&
      mapping.channelConnection.externalAccountId === shop) {
      await tx.channelConnection.updateMany({
        where: { id: mapping.channelConnectionId, accountId: mapping.accountId, status: { in: ["ACTIVE", "REAUTH_REQUIRED"] } },
        data: { status: "DISCONNECTED" },
      });
    }
    const profitImpactEvents = await tx.profitImpactEvent.deleteMany({
      where: { action: { shop } },
    });
    const profitImpactMeasurements = await tx.profitImpactMeasurement.deleteMany({
      where: { action: { shop } },
    });
    const profitImpactActions = await tx.profitImpactAction.deleteMany({
      where: { shop },
    });
    const alertEvents = await tx.profitMonitorAlertEvent.deleteMany({
      where: { alert: { shop } },
    });
    const alerts = await tx.profitMonitorAlert.deleteMany({ where: { shop } });
    const snapshots = await tx.profitMonitorSnapshot.deleteMany({ where: { shop } });
    const deliveries = await tx.notificationDelivery.deleteMany({ where: { shop } });
    const notificationPreferences = await tx.notificationPreferences.deleteMany({
      where: { shop, accountId: null },
    });
    // Account-owned settings survive redaction; remove only Shopify provenance.
    await tx.notificationPreferences.updateMany({
      where: { shop, accountId: { not: null } }, data: { shop: null },
    });
    const taxProfiles = await tx.storeTaxProfile.deleteMany({ where: { shop } });
    const profitAssumptions = await tx.profitAssumptions.deleteMany({ where: { shop } });
    const aiUsage = await tx.aiUsage.deleteMany({ where: { shop } });
    const sessions = await tx.session.deleteMany({ where: { shop } });

    return {
      profitImpactEvents: profitImpactEvents.count,
      profitImpactMeasurements: profitImpactMeasurements.count,
      profitImpactActions: profitImpactActions.count,
      alertEvents: alertEvents.count,
      alerts: alerts.count,
      snapshots: snapshots.count,
      deliveries: deliveries.count,
      notificationPreferences: notificationPreferences.count,
      taxProfiles: taxProfiles.count,
      profitAssumptions: profitAssumptions.count,
      aiUsage: aiUsage.count,
      sessions: sessions.count,
    };
  });
}
