import { authenticate } from "~/shopify.server";

export const action = async ({ request }: { request: Request }) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.info("[GDPR] Customer data request completed; no customer-scoped data is stored.", {
    topic,
    shop,
  });
  return new Response(null, { status: 200 });
};
