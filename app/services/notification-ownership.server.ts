import prisma from "~/db.server";
import type { AuthenticatedTenantContext } from "~/core/authenticated-tenant-context";
import { normalizeVerifiedShopDomain } from "~/connectors/shopify/shop-domain";

/** Lookup only. Call with a Shopify-authenticated shop or a shop read from persisted notification data. */
export async function resolveNotificationShopOwner(
  shop: string,
  tenant?: AuthenticatedTenantContext,
  allowDisconnected = false,
) {
  const normalizedShop = normalizeVerifiedShopDomain(shop);
  const mapping = await prisma.legacyShopMapping.findUnique({
    where: { shopDomain: normalizedShop }, include: { channelConnection: true, account: true },
  });
  const connection = mapping?.channelConnection;
  if (!mapping || !connection || mapping.account.status !== "ACTIVE" || connection.accountId !== mapping.accountId ||
    connection.channel !== "SHOPIFY" || connection.externalAccountId !== normalizedShop ||
    (connection.status !== "ACTIVE" && !(allowDisconnected && connection.status === "DISCONNECTED")) ||
    (tenant && (tenant.accountId !== mapping.accountId ||
      tenant.channelConnectionId !== connection.id || tenant.channel !== "SHOPIFY" ||
      tenant.legacyShopDomain !== normalizedShop))) {
    throw new Error("Notification tenant ownership is unavailable.");
  }
  return { accountId: mapping.accountId, channelConnectionId: connection.id, shop: normalizedShop };
}

/** Cron selects only persisted, active, internally consistent Shopify channel mappings. */
export async function listActiveNotificationShopMappings(accountId: string) {
  const mappings = await prisma.legacyShopMapping.findMany({
    where: { accountId, account: { status: "ACTIVE" }, channelConnection: { channel: "SHOPIFY", status: "ACTIVE" } },
    include: { channelConnection: true },
  });
  return mappings.filter((mapping) =>
    mapping.channelConnection.accountId === accountId &&
    mapping.channelConnection.externalAccountId === mapping.shopDomain);
}

export function sameNotificationPreferences(a: Record<string, unknown>, b: Record<string, unknown>) {
  const fields = ["recipientEmail", "emailAlertsEnabled", "weeklyReportEnabled", "notifyCritical",
    "notifyWarnings", "notifyOpportunities", "weeklyReportDay", "weeklyReportHour", "timezone", "language"];
  return fields.every((field) => a[field] === b[field]);
}
