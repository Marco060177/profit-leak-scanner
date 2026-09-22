const defaults = {
  shopCountryCode: "US",
  effectiveCountryCode: "US",
  taxSystem: "SALES_TAX" as const,
  advancedProfileAvailable: false,
  supportsRecoverableInputTaxModel: false,
  isItalianStore: false,
  profile: "NOT_APPLICABLE" as const,
  defaultVatRatePct: 0,
  pricesIncludeVat: false,
  costsIncludeVat: false,
  recoverInputVat: false,
  inputVatRecoveryPct: 0,
  shippingIncludeVat: false,
  shippingVatRatePct: 0,
  configured: false,
};

export async function getStoreTaxContext({
  shop,
  shopCountryCode,
}: {
  shop: string;
  shopCountryCode: string;
}) {
  if (shop.startsWith("configured-it")) {
    return {
      ...defaults,
      shopCountryCode: shopCountryCode || "IT",
      effectiveCountryCode: "IT",
      taxSystem: "VAT" as const,
      advancedProfileAvailable: true,
      supportsRecoverableInputTaxModel: true,
      isItalianStore: true,
      profile: "ITALY_STANDARD" as const,
      defaultVatRatePct: 22,
      pricesIncludeVat: true,
      costsIncludeVat: true,
      recoverInputVat: true,
      inputVatRecoveryPct: 100,
      shippingIncludeVat: true,
      shippingVatRatePct: 22,
      configured: true,
    };
  }

  return {
    ...defaults,
    shopCountryCode,
    effectiveCountryCode: shopCountryCode || "US",
  };
}
