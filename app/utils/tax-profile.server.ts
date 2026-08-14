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
  inputVatRecoveryPct: number;

  shippingIncludeVat: boolean;
  shippingVatRatePct: number;

  configured: boolean;
};

function clampPct(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function getEffectiveCountryCode(shopCountryCode: string) {
  const testCountry = process.env.MARGINLAB_TEST_COUNTRY
    ?.trim()
    .toUpperCase();

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
  const normalizedShopCountryCode =
    shopCountryCode.trim().toUpperCase();

  const effectiveCountryCode =
    getEffectiveCountryCode(shopCountryCode);

  const isItalianStore =
    effectiveCountryCode === "IT";

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
      inputVatRecoveryPct: 0,

      shippingIncludeVat: false,
      shippingVatRatePct: 0,

      configured: true,
    };
  }

  const savedProfile =
    await prisma.storeTaxProfile.findUnique({
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
      inputVatRecoveryPct: 100,

      shippingIncludeVat: true,
      shippingVatRatePct: 22,

      configured: false,
    };
  }

  const profile =
    savedProfile.regime as TaxProfile;

  const storedRecoveryPct =
    clampPct(savedProfile.inputVatRecoveryPct);

  const inputVatRecoveryPct =
    profile === "ITALY_STANDARD"
      ? savedProfile.recoverInputVat
        ? storedRecoveryPct
        : 0
      : 0;

  return {
    shopCountryCode: normalizedShopCountryCode,
    effectiveCountryCode,
    isItalianStore: true,
    profile,

    defaultVatRatePct:
      savedProfile.defaultVatRatePct,

    pricesIncludeVat:
      savedProfile.pricesIncludeVat,

    costsIncludeVat:
      savedProfile.costsIncludeVat,

    recoverInputVat:
      inputVatRecoveryPct > 0,

    inputVatRecoveryPct,

    shippingIncludeVat:
      savedProfile.shippingIncludeVat,

    shippingVatRatePct:
      savedProfile.shippingVatRatePct,

    configured:
      profile !== "UNCONFIGURED",
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
  inputVatRecoveryPct,
  shippingIncludeVat,
  shippingVatRatePct,
}: {
  shop: string;
  countryCode: string;
  regime: Exclude<
    TaxProfile,
    "UNCONFIGURED" | "NOT_APPLICABLE"
  >;

  defaultVatRatePct: number;

  pricesIncludeVat: boolean;
  costsIncludeVat: boolean;

  recoverInputVat: boolean;
  inputVatRecoveryPct: number;

  shippingIncludeVat: boolean;
  shippingVatRatePct: number;
}) {
  const normalizedCountryCode =
    countryCode.trim().toUpperCase();

  const normalizedVatRate =
    clampPct(defaultVatRatePct);

  const normalizedShippingVatRate =
    clampPct(shippingVatRatePct);

  const normalizedRecoveryPct =
    regime === "ITALY_STANDARD"
      ? recoverInputVat
        ? clampPct(inputVatRecoveryPct)
        : 0
      : 0;

  const normalizedRecoverInputVat =
    normalizedRecoveryPct > 0;

  return prisma.storeTaxProfile.upsert({
    where: { shop },

    create: {
      shop,
      countryCode: normalizedCountryCode,
      regime,

      defaultVatRatePct:
        normalizedVatRate,

      pricesIncludeVat,
      costsIncludeVat,

      recoverInputVat:
        normalizedRecoverInputVat,

      inputVatRecoveryPct:
        normalizedRecoveryPct,

      shippingIncludeVat,

      shippingVatRatePct:
        normalizedShippingVatRate,
    },

    update: {
      countryCode: normalizedCountryCode,
      regime,

      defaultVatRatePct:
        normalizedVatRate,

      pricesIncludeVat,
      costsIncludeVat,

      recoverInputVat:
        normalizedRecoverInputVat,

      inputVatRecoveryPct:
        normalizedRecoveryPct,

      shippingIncludeVat,

      shippingVatRatePct:
        normalizedShippingVatRate,
    },
  });
}