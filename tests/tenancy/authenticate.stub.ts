const verifiedSessions = new WeakMap<Request, { shop: string }>();
export const authenticationEvents: string[] = [];
export const adminClient = { graphql: async () => ({}) };

export function registerVerifiedSession(request: Request, shop: string) {
  const session = { shop };
  verifiedSessions.set(request, session);
  return session;
}

export const authenticate = {
  admin: async (request: Request) => {
    authenticationEvents.push("authenticate.admin");
    const session = verifiedSessions.get(request);
    if (!session) throw new Error("Shopify authentication rejected the request");
    return { admin: adminClient, session };
  },
};
