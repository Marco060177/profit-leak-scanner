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
  // Reason and UTC period only: never log tenant, shop, prompt or token identifiers.
  console.error("[AI_USAGE_SHADOW]", { reason, periodKey });
  throw new AiUsageSafetyError(reason);
}

function verifiedPeriodKey(month: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("Invalid UTC AI usage period");
  }
  return month;
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

export async function reserveAiUsage({
  db, shop, tenant, month, limit,
}: {
  db: PrismaClient;
  shop: string;
  tenant: AuthenticatedTenantContext;
  month: string;
  limit: number;
}): Promise<"RESERVED" | "QUOTA_EXCEEDED"> {
  const periodKey = verifiedPeriodKey(month);
  return db.$transaction(async (tx) => {
    const verifiedShop = await verifySingleShopifyOwner(tx, shop, tenant, periodKey);
    const [legacy, shadow] = await Promise.all([
      tx.aiUsage.findUnique({ where: { shop_month: { shop: verifiedShop, month } } }),
      tx.accountAiUsage.findUnique({
        where: { accountId_periodKey: { accountId: tenant.accountId, periodKey } },
      }),
    ]);

    // The legacy count alone still decides admission. Observe any shadow anomaly
    // at the limit, but preserve the existing quota-denied response.
    if ((legacy?.requests ?? 0) >= limit) {
      if (!shadow) console.error("[AI_USAGE_SHADOW]", { reason: "SHADOW_MISSING", periodKey });
      else if (shadow.requests !== legacy?.requests) {
        console.error("[AI_USAGE_SHADOW]", { reason: "SHADOW_MISMATCH", periodKey });
      }
      return "QUOTA_EXCEEDED";
    }
    if (legacy && !shadow) return unsafe("SHADOW_MISSING", periodKey);
    if (!legacy && shadow) return unsafe("LEGACY_MISSING", periodKey);
    if (legacy && shadow && legacy.requests !== shadow.requests) {
      return unsafe("SHADOW_MISMATCH", periodKey);
    }

    await tx.aiUsage.upsert({
      where: { shop_month: { shop: verifiedShop, month } },
      create: { shop: verifiedShop, month, requests: 1 },
      update: { requests: { increment: 1 } },
    });
    if (shadow) {
      await tx.accountAiUsage.update({
        where: { accountId_periodKey: { accountId: tenant.accountId, periodKey } },
        data: { requests: { increment: 1 } },
      });
    } else {
      await tx.accountAiUsage.create({
        data: { accountId: tenant.accountId, periodKey, requests: 1 },
      });
    }
    return "RESERVED";
  });
}

export async function compensateAiUsage({
  db, shop, tenant, month,
}: {
  db: PrismaClient;
  shop: string;
  tenant: AuthenticatedTenantContext;
  month: string;
}): Promise<void> {
  const periodKey = verifiedPeriodKey(month);
  await db.$transaction(async (tx) => {
    const verifiedShop = await verifySingleShopifyOwner(tx, shop, tenant, periodKey);
    const [legacy, shadow] = await Promise.all([
      tx.aiUsage.findUnique({ where: { shop_month: { shop: verifiedShop, month } } }),
      tx.accountAiUsage.findUnique({
        where: { accountId_periodKey: { accountId: tenant.accountId, periodKey } },
      }),
    ]);
    if (!legacy || !shadow || legacy.requests !== shadow.requests || legacy.requests <= 0) {
      return unsafe("COMPENSATION_BLOCKED", periodKey);
    }
    await tx.aiUsage.update({
      where: { shop_month: { shop: verifiedShop, month } },
      data: { requests: { decrement: 1 } },
    });
    await tx.accountAiUsage.update({
      where: { accountId_periodKey: { accountId: tenant.accountId, periodKey } },
      data: { requests: { decrement: 1 } },
    });
  });
}
