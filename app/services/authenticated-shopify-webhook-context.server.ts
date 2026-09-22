import { findShopifyTenantContext } from "~/connectors/shopify/shopify-tenant-resolver.server";
import { authenticate } from "~/shopify.server";

/** Non-creating boundary for webhooks that need tenant context in a later stage. */
export async function authenticateShopifyWebhookTenant(request: Request) {
  const webhook = await authenticate.webhook(request);
  const tenant = await findShopifyTenantContext(webhook.shop);
  return { ...webhook, tenant };
}
