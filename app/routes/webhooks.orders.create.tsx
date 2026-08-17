import { authenticate } from "~/shopify.server";
import { queueProductSaleAlertsFromOrder } from "~/services/product-sale-alert.server";

export async function action({ request }: { request: Request }) {
  const { admin, payload, shop } = await authenticate.webhook(request);

  if (!admin) return new Response();

  try {
    await queueProductSaleAlertsFromOrder({ admin, shop, payload });
  } catch (error) {
    console.error("MarginLab product-sale alert webhook failed", { shop, error });
    return new Response("Webhook processing failed", { status: 500 });
  }

  return new Response();
}