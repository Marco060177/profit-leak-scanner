import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: { request: Request }) => {
  const { shop, topic } = await authenticate.webhook(request);

  if (topic === "APP_UNINSTALLED") {
    await prisma.session.deleteMany({
      where: { shop },
    });

    console.log(`App uninstalled for shop: ${shop}`);
  }

  return new Response(null, { status: 200 });
};