import type { Session } from "@shopify/shopify-api";
import { Prisma } from "@prisma/client";
import type { AuthenticatedTenantContext } from "~/core/authenticated-tenant-context";
import prisma from "~/db.server";
import { normalizeVerifiedShopDomain } from "./shop-domain";

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

/** Authenticated reinstall only: reactivate the existing owner without creating or resetting usage. */
async function activateExistingShopifyMapping(shopDomain: string): Promise<AuthenticatedTenantContext | null> {
  // Normal authenticated requests must not open an interactive SQLite transaction.
  // Only a genuinely disconnected connection needs a conditional state change.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const mapping = await prisma.legacyShopMapping.findUnique({
      where: { shopDomain }, include: { channelConnection: true },
    });
    if (!mapping) return null;
    const connection = mapping.channelConnection;
    if (
      connection.accountId !== mapping.accountId || connection.channel !== "SHOPIFY" ||
      connection.externalAccountId !== shopDomain ||
      !["ACTIVE", "DISCONNECTED"].includes(connection.status)
    ) throw new Error("Inconsistent Shopify tenant mapping or unsafe status");
    if (connection.status === "DISCONNECTED") {
      const changed = await prisma.channelConnection.updateMany({
        where: { id: connection.id, accountId: mapping.accountId, status: "DISCONNECTED" },
        data: { status: "ACTIVE" },
      });
      if (changed.count === 0) continue; // A concurrent reinstall/uninstall changed the state; re-read it.
    }
    return {
      accountId: mapping.accountId, channelConnectionId: mapping.channelConnectionId,
      channel: "SHOPIFY" as const, legacyShopDomain: shopDomain,
    };
  }
  throw new Error("Shopify tenant activation could not be resolved safely");
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
    const existing = await activateExistingShopifyMapping(shopDomain);
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
      const created = await activateExistingShopifyMapping(shopDomain);
      if (!created) throw new Error("Shopify tenant mapping was not persisted");
      return created;
    } catch (error) {
      if (!isRetryableBootstrapConflict(error) || attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
    }
  }

  throw new Error("Shopify tenant mapping could not be resolved");
}
