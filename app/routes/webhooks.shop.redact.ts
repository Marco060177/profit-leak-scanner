import { authenticate } from "~/shopify.server";
import { deleteShopData } from "~/services/shop-data-redaction.server";

export const action = async ({ request }: { request: Request }) => {
  const { shop, topic } = await authenticate.webhook(request);

  try {
    const removed = await deleteShopData(shop);
    console.info("[GDPR] Shop data redaction completed.", {
      topic,
      shop,
      removed,
    });
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("[GDPR] Shop data redaction failed.", {
      topic,
      shop,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
};
