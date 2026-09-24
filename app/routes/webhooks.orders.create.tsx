import { authenticate } from "~/shopify.server";
import { queueProductSaleAlertsFromOrder } from "~/services/product-sale-alert.server";
import { findShopifyTenantContext } from "~/connectors/shopify/shopify-tenant-resolver.server";

export async function action({ request }: { request: Request }) {
  const { admin, payload, shop } = await authenticate.webhook(request);

  if (!admin) return new Response();

  try {
    if (!(await findShopifyTenantContext(shop))) return new Response();
    await queueProductSaleAlertsFromOrder({ admin, shop, payload });
  } catch (error) {
    console.error("MarginLab product-sale alert webhook failed", { shop, error });
    return new Response("Webhook processing failed", { status: 500 });
  }

  return new Response();
}
