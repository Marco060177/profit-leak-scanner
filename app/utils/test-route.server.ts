const DEV_STORE = "profit-leak-dev.myshopify.com";

export function assertTestRouteAccess(shop: string) {
  if (process.env.NODE_ENV === "production" && shop !== DEV_STORE) {
    throw new Response("Not Found", { status: 404 });
  }
}
