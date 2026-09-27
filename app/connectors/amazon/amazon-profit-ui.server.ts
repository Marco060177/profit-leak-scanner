import type { Prisma, PrismaClient } from "@prisma/client";
import { getAmazonOrderProfitTx } from "~/connectors/amazon/amazon-cogs-profit.server";
import { presentAmazonProfit } from "~/connectors/amazon/amazon-profit-presentation";

type Db = Pick<PrismaClient, "channelConnection" | "normalizedOrderRevision" | "currencyPolicyVersion" | "$transaction">;

export async function loadAmazonProfitDiagnostic(input: { db: Db; accountId: string;
  readProfit?: typeof getAmazonOrderProfitTx; now?: Date }) {
  const connection = await input.db.channelConnection.findFirst({ where: { accountId: input.accountId,
    channel: "AMAZON", status: "ACTIVE" }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }] });
  if (!connection) return { state: "NO_CONNECTION" as const };
  const latest = await input.db.normalizedOrderRevision.findFirst({ where: { accountId: input.accountId,
    channelConnectionId: connection.id, order: { sourceSystem: "AMAZON" } },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    include: { order: { include: { marketplace: true } } } });
  if (!latest) return { state: "NO_ORDERS" as const };
  const now = input.now ?? new Date();
  const policy = await input.db.currencyPolicyVersion.findFirst({ where: { activatedAt: { lte: now },
    OR: [{ deactivatedAt: null }, { deactivatedAt: { gt: now } }] },
    orderBy: [{ activatedAt: "desc" }, { id: "desc" }] });
  if (!policy) return { state: "RESULT" as const, result: presentAmazonProfit({ status: "BLOCKED",
    orderId: latest.order.id, sourceOrderId: latest.order.sourceOrderKey,
    marketplaceId: latest.order.marketplace?.externalMarketplaceId ?? null,
    reasonCodes: ["INVALID_CURRENCY_POLICY"] }) };
  const economicAt = latest.occurredAt ?? latest.createdAt;
  const startInclusive = new Date(Date.UTC(economicAt.getUTCFullYear(), economicAt.getUTCMonth(), 1));
  const endExclusive = new Date(Date.UTC(economicAt.getUTCFullYear(), economicAt.getUTCMonth() + 1, 1));
  const readProfit = input.readProfit ?? getAmazonOrderProfitTx;
  const result = await input.db.$transaction((tx) => readProfit(tx as Prisma.TransactionClient, {
    tenant: { accountId: input.accountId, channelConnectionId: connection.id }, orderId: latest.order.id,
    startInclusive, endExclusive, currencyPolicyVersionId: policy.id }));
  return { state: "RESULT" as const, result: presentAmazonProfit({ ...result,
    marketplaceId: latest.order.marketplace?.externalMarketplaceId ?? null }) };
}
