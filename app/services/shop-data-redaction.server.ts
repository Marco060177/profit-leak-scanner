import prisma from "~/db.server";

export async function deleteShopData(shop: string) {
  return prisma.$transaction(async (tx) => {
    const alertEvents = await tx.profitMonitorAlertEvent.deleteMany({
      where: { alert: { shop } },
    });
    const alerts = await tx.profitMonitorAlert.deleteMany({ where: { shop } });
    const snapshots = await tx.profitMonitorSnapshot.deleteMany({ where: { shop } });
    const deliveries = await tx.notificationDelivery.deleteMany({ where: { shop } });
    const notificationPreferences = await tx.notificationPreferences.deleteMany({
      where: { shop },
    });
    const taxProfiles = await tx.storeTaxProfile.deleteMany({ where: { shop } });
    const profitAssumptions = await tx.profitAssumptions.deleteMany({ where: { shop } });
    const aiUsage = await tx.aiUsage.deleteMany({ where: { shop } });
    const sessions = await tx.session.deleteMany({ where: { shop } });

    return {
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
