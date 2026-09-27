import type { PrismaClient } from "@prisma/client";
import { ingestNormalizedBillingEvent, evaluatePartnerQualification, SUCCESSFUL_PAID_EVENT } from "~/services/billing-qualification.server";

export type ShopifySubscriptionSale = {
  id: string;
  createdAt: string;
  chargeId?: string | null;
  billingInterval?: string | null;
  grossAmount?: { amount: string; currencyCode: string } | null;
  app: { apiKey: string };
  shop?: { myshopifyDomain: string } | null;
};

export function decimalMoneyToAtoms(value: string) {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new Error("Invalid decimal money value");
  const fraction = match[3] ?? "";
  return { atoms: BigInt(`${match[1]}${match[2]}${fraction}`), scale: fraction.length };
}

export function adaptShopifySubscriptionSale(accountId: string, sale: ShopifySubscriptionSale) {
  const money = sale.grossAmount ? decimalMoneyToAtoms(sale.grossAmount.amount) : null;
  const isPaid = money !== null && money.atoms > 0n;
  return {
    accountId, platform: "SHOPIFY", externalEventId: sale.id,
    eventType: isPaid ? SUCCESSFUL_PAID_EVENT : "PAYMENT_NOT_PAID", occurredAt: new Date(sale.createdAt),
    amountAtoms: money?.atoms ?? null, amountScale: money?.scale ?? null,
    currencyCode: sale.grossAmount?.currencyCode ?? null,
    subscriptionReference: sale.chargeId ?? null,
    provenance: { transactionType: "APP_SUBSCRIPTION_SALE", billingInterval: sale.billingInterval ?? null },
  };
}

export async function ingestShopifySubscriptionSale(db: PrismaClient, sale: ShopifySubscriptionSale, expectedApiKey: string) {
  if (sale.app.apiKey !== expectedApiKey) throw new Error("Shopify transaction belongs to another app");
  const shopDomain = String(sale.shop?.myshopifyDomain ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
  const mapping = await db.legacyShopMapping.findUnique({ where: { shopDomain }, include: { channelConnection: true } });
  if (!mapping || mapping.channelConnection.channel !== "SHOPIFY" ||
      mapping.channelConnection.externalAccountId !== shopDomain || mapping.channelConnection.accountId !== mapping.accountId) {
    throw new Error("Shopify transaction has no trusted canonical Account mapping");
  }
  const event = await ingestNormalizedBillingEvent(db, adaptShopifySubscriptionSale(mapping.accountId, sale));
  await evaluatePartnerQualification(db, mapping.accountId);
  return event;
}
