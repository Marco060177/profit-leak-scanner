import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuthenticatedTenantContext } from "~/core/authenticated-tenant-context";
import { normalizeVerifiedShopDomain } from "~/connectors/shopify/shop-domain";

type Db = PrismaClient | Prisma.TransactionClient;
export type AiUsageSafetyReason =
  | "TENANT_MAPPING_INVALID"
  | "AMBIGUOUS_SHOPIFY_OWNERSHIP"
  | "SHADOW_MISSING"
  | "LEGACY_MISSING"
  | "SHADOW_MISMATCH"
  | "COMPENSATION_BLOCKED";

export class AiUsageSafetyError extends Error {
  readonly reason: AiUsageSafetyReason;

  constructor(reason: AiUsageSafetyReason) {
    super("AI usage is temporarily unavailable.");
    this.name = "AiUsageSafetyError";
    this.reason = reason;
  }
}

function unsafe(reason: AiUsageSafetyReason, periodKey: string): never {
  console.error("[AI_USAGE_SHADOW]", { reason, periodKey });
  throw new AiUsageSafetyError(reason);
}

export async function verifySingleShopifyOwner(
  tx: Db,
  shop: string,
  tenant: AuthenticatedTenantContext,
  periodKey: string,
) {
  let normalizedShop: string;
  try {
    normalizedShop = normalizeVerifiedShopDomain(shop);
  } catch {
    return unsafe("TENANT_MAPPING_INVALID", periodKey);
  }
  if (tenant.channel !== "SHOPIFY" || tenant.legacyShopDomain !== normalizedShop) {
    return unsafe("TENANT_MAPPING_INVALID", periodKey);
  }
  const mapping = await tx.legacyShopMapping.findUnique({
    where: { shopDomain: normalizedShop },
    include: { channelConnection: true },
  });
  if (
    !mapping || !mapping.channelConnection || mapping.accountId !== tenant.accountId ||
    mapping.channelConnectionId !== tenant.channelConnectionId ||
    mapping.channelConnection.accountId !== tenant.accountId ||
    mapping.channelConnection.channel !== "SHOPIFY" ||
    mapping.channelConnection.externalAccountId !== normalizedShop ||
    mapping.channelConnection.status !== "ACTIVE"
  ) return unsafe("TENANT_MAPPING_INVALID", periodKey);

  const shopifyMappings = await tx.legacyShopMapping.count({
    where: { accountId: tenant.accountId, channelConnection: { channel: "SHOPIFY" } },
  });
  if (shopifyMappings !== 1) return unsafe("AMBIGUOUS_SHOPIFY_OWNERSHIP", periodKey);
  return normalizedShop;
}
