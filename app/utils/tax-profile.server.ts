import prisma from "~/db.server";

export type TaxProfile =
  | "UNCONFIGURED"
  | "NOT_APPLICABLE"
  | "ITALY_STANDARD"
  | "ITALY_FORFETTARIO"
  | "ITALY_EXEMPT";

export type TaxContext = {
  shopCountryCode: string;
  effectiveCountryCode: string;
  isItalianStore: boolean;
  profile: TaxProfile;
  defaultVatRatePct: number;
  pricesIncludeVat: boolean;
  costsIncludeVat: boolean;
  recoverInputVat: boolean;
  shippingIncludeVat: boolean;
  shippingVatRatePct: number;
  configured: boolean;
};

export function getEffectiveCountryCode(shopCountryCode: string) {
  const testCountry = process.env.MARGINLAB_TEST_COUNTRY?.trim().toUpperCase();

  if (testCountry) {
    return testCountry;
  }

  return shopCountryCode.trim().toUpperCase();
}

export async function getStoreTaxContext({
  shop,
  shopCountryCode,
}: {
  shop: string;
  shopCountryCode: string;
}): Promise<TaxContext> {
  const normalizedShopCountryCode = shopCountryCode.trim().toUpperCase();
  const effectiveCountryCode = getEffectiveCountryCode(shopCountryCode);
  const isItalianStore = effectiveCountryCode === "IT";

  if (!isItalianStore) {
    return {
      shopCountryCode: normalizedShopCountryCode,
      effectiveCountryCode,
      isItalianStore: false,
      profile: "NOT_APPLICABLE",
      defaultVatRatePct: 0,
      pricesIncludeVat: false,
      costsIncludeVat: false,
      recoverInputVat: false,
      shippingIncludeVat: false,
      shippingVatRatePct: 0,
      configured: true,
    };
  }

  const savedProfile = await prisma.storeTaxProfile.findUnique({
    where: { shop },
  });

  if (!savedProfile) {
    return {
      shopCountryCode: normalizedShopCountryCode,
      effectiveCountryCode,
      isItalianStore: true,
      profile: "UNCONFIGURED",
      defaultVatRatePct: 22,
      pricesIncludeVat: true,
      costsIncludeVat: true,
      recoverInputVat: true,
      shippingIncludeVat: true,
      shippingVatRatePct: 22,
      configured: false,
    };
  }

  return {
    shopCountryCode: normalizedShopCountryCode,
    effectiveCountryCode,
    isItalianStore: true,
    profile: savedProfile.regime as TaxProfile,
    defaultVatRatePct: savedProfile.defaultVatRatePct,
    pricesIncludeVat: savedProfile.pricesIncludeVat,
    costsIncludeVat: savedProfile.costsIncludeVat,
    recoverInputVat: savedProfile.recoverInputVat,
    shippingIncludeVat: savedProfile.shippingIncludeVat,
    shippingVatRatePct: savedProfile.shippingVatRatePct,
    configured: savedProfile.regime !== "UNCONFIGURED",
  };
}

export async function saveStoreTaxProfile({
  shop,
  countryCode,
  regime,
  defaultVatRatePct,
  pricesIncludeVat,
  costsIncludeVat,
  recoverInputVat,
  shippingIncludeVat,
  shippingVatRatePct,
}: {
  shop: string;
  countryCode: string;
  regime: Exclude<TaxProfile, "UNCONFIGURED" | "NOT_APPLICABLE">;
  defaultVatRatePct: number;
  pricesIncludeVat: boolean;
  costsIncludeVat: boolean;
  recoverInputVat: boolean;
  shippingIncludeVat: boolean;
  shippingVatRatePct: number;
}) {
  return prisma.storeTaxProfile.upsert({
    where: { shop },
    create: {
      shop,
      countryCode,
      regime,
      defaultVatRatePct,
      pricesIncludeVat,
      costsIncludeVat,
      recoverInputVat,
      shippingIncludeVat,
      shippingVatRatePct,
    },
    update: {
      countryCode,
      regime,
      defaultVatRatePct,
      pricesIncludeVat,
      costsIncludeVat,
      recoverInputVat,
      shippingIncludeVat,
      shippingVatRatePct,
    },
  });
}