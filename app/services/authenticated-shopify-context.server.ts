import type { AuthenticatedTenantContext } from "~/core/authenticated-tenant-context";
import { resolveShopifyTenantContext } from "~/connectors/shopify/shopify-tenant-resolver.server";
import { authenticate } from "~/shopify.server";

export type AuthenticatedShopifyContext = Awaited<ReturnType<typeof authenticate.admin>> & {
  tenant: AuthenticatedTenantContext;
};

/** Tenant identity is derived only after Shopify verifies the admin session. */
export async function authenticateShopifyTenant(
  request: Request,
): Promise<AuthenticatedShopifyContext> {
  const authenticated = await authenticate.admin(request);
  const tenant = await resolveShopifyTenantContext(authenticated.session);
  return { ...authenticated, tenant };
}
