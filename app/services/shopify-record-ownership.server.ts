import type { AuthenticatedTenantContext } from "~/core/authenticated-tenant-context";
import { findShopifyTenantContext } from "~/connectors/shopify/shopify-tenant-resolver.server";

/** Non-creating check for Shopify compatibility rows. The caller's tenant must
 * originate from authenticated Shopify Admin, never request input.
 */
export async function requireShopifyRecordOwner(shop: string, tenant: AuthenticatedTenantContext) {
  const owner = await findShopifyTenantContext(shop);
  if (!owner || owner.channel !== "SHOPIFY" ||
    owner.accountId !== tenant.accountId ||
    owner.channelConnectionId !== tenant.channelConnectionId ||
    owner.legacyShopDomain !== tenant.legacyShopDomain) {
    throw new Error("Shopify record ownership is unavailable.");
  }
  return owner.channelConnectionId;
}

export function assertExistingShopifyRecordOwner(existingId: string | null, expectedId: string) {
  if (existingId && existingId !== expectedId) {
    throw new Error("Contradictory Shopify record ownership.");
  }
}
