export type AuthenticatedTenantContext = {
  accountId: string;
  channelConnectionId: string;
  channel: "SHOPIFY" | "AMAZON";
  legacyShopDomain?: string;
};
