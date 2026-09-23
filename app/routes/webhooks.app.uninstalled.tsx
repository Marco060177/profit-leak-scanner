import { authenticate } from "~/shopify.server";
import { normalizeVerifiedShopDomain } from "~/connectors/shopify/shop-domain";
import prisma from "../db.server";

export const action = async ({ request }: { request: Request }) => {
  const { shop, topic } = await authenticate.webhook(request);

  if (topic === "APP_UNINSTALLED") {
    let normalizedShop: string;
    try {
      normalizedShop = normalizeVerifiedShopDomain(shop);
    } catch {
      await prisma.session.deleteMany({ where: { shop } });
      console.error("[SHOPIFY_LIFECYCLE] Invalid authenticated uninstall shop domain");
      return new Response(null, { status: 503 });
    }

    // Never retain stale credentials even if the tenancy lookup fails unexpectedly.
    await prisma.session.deleteMany({ where: { shop } });
    const outcome = await prisma.$transaction(async (tx) => {
      const mapping = await tx.legacyShopMapping.findUnique({
        where: { shopDomain: normalizedShop },
        include: { channelConnection: true },
      });
      if (!mapping) return "MISSING_MAPPING";
      const connection = mapping.channelConnection;
      if (
        connection.accountId !== mapping.accountId ||
        connection.channel !== "SHOPIFY" ||
        connection.externalAccountId !== normalizedShop ||
        !["ACTIVE", "DISCONNECTED"].includes(connection.status)
      ) return "UNSAFE_MAPPING";
      await tx.channelConnection.updateMany({
        where: { id: connection.id, accountId: mapping.accountId, status: "ACTIVE" },
        data: { status: "DISCONNECTED" },
      });
      return "DISCONNECTED";
    });
    if (outcome !== "DISCONNECTED") {
      console.error("[SHOPIFY_LIFECYCLE] Uninstall tenancy state", { reason: outcome });
      return new Response(null, { status: outcome === "MISSING_MAPPING" ? 200 : 503 });
    }
  }

  return new Response(null, { status: 200 });
};
