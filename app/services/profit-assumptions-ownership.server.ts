import prisma from "~/db.server";
import type { AuthenticatedTenantContext } from "~/core/authenticated-tenant-context";
import { requireShopifyRecordOwner, assertExistingShopifyRecordOwner } from "~/services/shopify-record-ownership.server";

type Assumptions = {
  monthlyAds: number;
  monthlyShipping: number;
  monthlyOperating: number;
  paymentFeePct: number;
  transactionFeePct: number;
  taxReservePct: number;
};

export async function saveShopifyProfitAssumptions(shop: string, tenant: AuthenticatedTenantContext, values: Assumptions) {
  const ownerId = await requireShopifyRecordOwner(shop, tenant);
  const existing = await prisma.profitAssumptions.findUnique({ where: { shop } });
  assertExistingShopifyRecordOwner(existing?.channelConnectionId ?? null, ownerId);
  return prisma.profitAssumptions.upsert({
    where: { shop },
    update: { ...values, channelConnectionId: ownerId },
    create: { shop, ...values, channelConnectionId: ownerId },
  });
}
