import { resolveShopifyTenantContext as resolveActual } from "../../app/connectors/shopify/shopify-tenant-resolver.server";
import { authenticationEvents } from "./authenticate.stub";

export async function resolveShopifyTenantContext(...args: Parameters<typeof resolveActual>) {
  authenticationEvents.push("resolveShopifyTenantContext");
  return resolveActual(...args);
}
