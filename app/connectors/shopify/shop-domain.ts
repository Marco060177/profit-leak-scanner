/** Canonical identity for a Shopify-authenticated shop domain. */
export function normalizeVerifiedShopDomain(shop: string): string {
  const domain = shop.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) {
    throw new Error("Invalid verified Shopify shop domain");
  }
  return domain;
}
