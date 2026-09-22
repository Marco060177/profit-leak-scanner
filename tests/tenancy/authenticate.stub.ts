const verifiedSessions = new WeakMap<Request, { shop: string }>();
const verifiedWebhooks = new WeakMap<Request, { shop: string; topic: string }>();
export const authenticationEvents: string[] = [];
export const adminClient = { graphql: async () => ({}) };

export function registerVerifiedSession(request: Request, shop: string) {
  const session = { shop };
  verifiedSessions.set(request, session);
  return session;
}

export function registerVerifiedWebhook(request: Request, shop: string, topic = "ORDERS_CREATE") {
  const webhook = { shop, topic };
  verifiedWebhooks.set(request, webhook);
  return webhook;
}

export const authenticate = {
  admin: async (request: Request) => {
    authenticationEvents.push("authenticate.admin");
    const session = verifiedSessions.get(request);
    if (!session) throw new Error("Shopify authentication rejected the request");
    return { admin: adminClient, session };
  },
  webhook: async (request: Request) => {
    authenticationEvents.push("authenticate.webhook");
    const webhook = verifiedWebhooks.get(request);
    if (!webhook) throw new Error("Shopify webhook authentication rejected the request");
    return webhook;
  },
};
