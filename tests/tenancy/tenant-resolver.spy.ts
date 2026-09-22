import {
  findShopifyTenantContext as findActual,
  resolveShopifyTenantContext as resolveActual,
} from "../../app/connectors/shopify/shopify-tenant-resolver.server";
import { authenticationEvents } from "./authenticate.stub";

export async function resolveShopifyTenantContext(...args: Parameters<typeof resolveActual>) {
  authenticationEvents.push("resolveShopifyTenantContext");
  return resolveActual(...args);
}

export async function findShopifyTenantContext(...args: Parameters<typeof findActual>) {
  authenticationEvents.push("findShopifyTenantContext");
  return findActual(...args);
}
