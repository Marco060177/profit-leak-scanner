import { authenticate } from "~/shopify.server";

export const action = async ({ request }: { request: Request }) => {
  const { shop, topic } = await authenticate.webhook(request);
  if (topic !== "CUSTOMERS_DATA_REQUEST") {
    return new Response("Unexpected webhook topic", { status: 400 });
  }

  console.info("[GDPR] Customer data request completed; no customer-scoped data is stored.", {
    topic,
    shop,
  });
  return new Response(null, { status: 200 });
};
