import type { Session } from "@shopify/shopify-api";
import { Prisma } from "@prisma/client";
import type { AuthenticatedTenantContext } from "~/core/authenticated-tenant-context";
import prisma from "~/db.server";

function normalizeVerifiedShopDomain(shop: string): string {
  const domain = shop.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) {
    throw new Error("Invalid verified Shopify shop domain");
  }
  return domain;
}

async function findShopifyMapping(shopDomain: string): Promise<AuthenticatedTenantContext | null> {
  const mapping = await prisma.legacyShopMapping.findUnique({
    where: { shopDomain },
    include: { channelConnection: true },
  });
  if (!mapping) return null;
  if (
    mapping.channelConnection.accountId !== mapping.accountId ||
    mapping.channelConnection.channel !== "SHOPIFY" ||
    mapping.channelConnection.externalAccountId !== shopDomain
  ) {
    throw new Error("Inconsistent Shopify tenant mapping");
  }
  return {
    accountId: mapping.accountId,
    channelConnectionId: mapping.channelConnectionId,
    channel: "SHOPIFY",
    legacyShopDomain: shopDomain,
  };
}

/** Lookup only. The shop must come from Shopify authentication or trusted persisted server data. */
export async function findShopifyTenantContext(
  shop: string,
): Promise<AuthenticatedTenantContext | null> {
  return findShopifyMapping(normalizeVerifiedShopDomain(shop));
}

function isRetryableBootstrapConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P2002", "P2034", "P1008"].includes(error.code);
}

/** Call only after Shopify authentication has verified the session. */
export async function resolveShopifyTenantContext(
  session: Pick<Session, "shop">,
): Promise<AuthenticatedTenantContext> {
  const shopDomain = normalizeVerifiedShopDomain(session.shop);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await findShopifyMapping(shopDomain);
    if (existing) return existing;

    try {
      await prisma.$transaction(async (tx) => {
        const account = await tx.account.create({ data: {} });
        const connection = await tx.channelConnection.create({
          data: {
            accountId: account.id,
            channel: "SHOPIFY",
            externalAccountId: shopDomain,
          },
        });
        await tx.legacyShopMapping.create({
          data: {
            shopDomain,
            accountId: account.id,
            channelConnectionId: connection.id,
          },
        });
      });
      const created = await findShopifyMapping(shopDomain);
      if (!created) throw new Error("Shopify tenant mapping was not persisted");
      return created;
    } catch (error) {
      if (!isRetryableBootstrapConflict(error) || attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
    }
  }

  throw new Error("Shopify tenant mapping could not be resolved");
}
