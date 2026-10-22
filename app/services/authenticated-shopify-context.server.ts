import type { AuthenticatedTenantContext } from "~/core/authenticated-tenant-context";
import { resolveShopifyTenantContext } from "~/connectors/shopify/shopify-tenant-resolver.server";
import { authenticate } from "~/shopify.server";
import type { ServerPerformanceTrace } from "~/utils/server-performance.server";

export type AuthenticatedShopifyContext = Awaited<ReturnType<typeof authenticate.admin>> & {
  tenant: AuthenticatedTenantContext;
};

/** Tenant identity is derived only after Shopify verifies the admin session. */
export async function authenticateShopifyTenant(
  request: Request,
  performanceTrace?: ServerPerformanceTrace,
): Promise<AuthenticatedShopifyContext> {
  const authenticated = performanceTrace
    ? await performanceTrace.measure("authentication", () => authenticate.admin(request))
    : await authenticate.admin(request);
  const tenant = performanceTrace
    ? await performanceTrace.measure("tenantResolution", () =>
        resolveShopifyTenantContext(authenticated.session))
    : await resolveShopifyTenantContext(authenticated.session);
  return { ...authenticated, tenant };
}
