import prisma from "~/db.server";

export type TaxSystem =
  | "VAT"
  | "GST"
  | "GST_HST"
  | "SALES_TAX"
  | "UNKNOWN";

export type TaxProfile =
  | "UNCONFIGURED"
  | "NOT_APPLICABLE"
  | "ITALY_STANDARD"
  | "ITALY_FORFETTARIO"
  | "ITALY_EXEMPT"
  | "UK_VAT_STANDARD"
  | "UK_VAT_EXEMPT"
  | "UK_VAT_UNREGISTERED"
  | "CANADA_GST_HST_REGISTERED"
  | "CANADA_GST_HST_EXEMPT"
  | "CANADA_GST_HST_UNREGISTERED";

export type CountryTaxCapabilities = {
  countryCode: string;
  taxSystem: TaxSystem;
  advancedProfileAvailable: boolean;
  supportsRecoverableInputTaxModel: boolean;
};

export type TaxContext = {
  shopCountryCode: string;
  effectiveCountryCode: string;

  taxSystem: TaxSystem;
  advancedProfileAvailable: boolean;
  supportsRecoverableInputTaxModel: boolean;

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

const EU_VAT_COUNTRIES = new Set([
  "AT","BE","BG","HR","CY","CZ","DE","DK","EE","ES","FI","FR","GR","HU",
  "IE","IT","LT","LU","LV","MT","NL","PL","PT","RO","SE","SI","SK",
]);

const VAT_COUNTRIES = new Set([
  ...EU_VAT_COUNTRIES,
  "GB",
  "CH",
  "NO",
]);

const GST_COUNTRIES = new Set([
  "AU",
  "NZ",
  "SG",
]);

function normalizeCountryCode(value: string) {
  return value.trim().toUpperCase();
}

function clampPct(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function isItalianProfile(profile: TaxProfile) {
  return (
    profile === "ITALY_STANDARD" ||
    profile === "ITALY_FORFETTARIO" ||
    profile === "ITALY_EXEMPT"
  );
}

function isUkProfile(profile: TaxProfile) {
  return (
    profile === "UK_VAT_STANDARD" ||
    profile === "UK_VAT_EXEMPT" ||
    profile === "UK_VAT_UNREGISTERED"
  );
}

function isCanadaProfile(profile: TaxProfile) {
  return (
    profile === "CANADA_GST_HST_REGISTERED" ||
    profile === "CANADA_GST_HST_EXEMPT" ||
    profile === "CANADA_GST_HST_UNREGISTERED"
  );
}

function profileMatchesCountry({
  profile,
  countryCode,
}: {
  profile: TaxProfile;
  countryCode: string;
}) {
  if (countryCode === "IT") {
    return isItalianProfile(profile);
  }

  if (countryCode === "GB") {
    return isUkProfile(profile);
  }

  if (countryCode === "CA") {
    return isCanadaProfile(profile);
  }

  return false;
}

function profileAllowsInputTaxRecovery(
  profile: TaxProfile,
) {
  return (
    profile === "ITALY_STANDARD" ||
    profile === "UK_VAT_STANDARD" ||
    profile === "CANADA_GST_HST_REGISTERED"
  );
}

function getAdvancedCountryDefaults(
  countryCode: string,
) {
  if (countryCode === "IT") {
    return {
      defaultVatRatePct: 22,
      pricesIncludeVat: true,
      costsIncludeVat: true,
      recoverInputVat: true,
      inputVatRecoveryPct: 100,
      shippingIncludeVat: true,
      shippingVatRatePct: 22,
    };
  }

  if (countryCode === "GB") {
    return {
      defaultVatRatePct: 20,
      pricesIncludeVat: true,
      costsIncludeVat: true,
      recoverInputVat: true,
      inputVatRecoveryPct: 100,
      shippingIncludeVat: true,
      shippingVatRatePct: 20,
    };
  }

  if (countryCode === "CA") {
    return {
      // Canada is destination/place-of-supply sensitive.
      // 5% is the federal GST baseline only; actual Shopify tax lines
      // remain authoritative when HST or provincial taxes apply.
      defaultVatRatePct: 5,
      pricesIncludeVat: false,
      costsIncludeVat: false,
      recoverInputVat: true,
      inputVatRecoveryPct: 100,
      shippingIncludeVat: false,
      shippingVatRatePct: 5,
    };
  }

  return {
    defaultVatRatePct: 0,
    pricesIncludeVat: false,
    costsIncludeVat: false,
    recoverInputVat: false,
    inputVatRecoveryPct: 0,
    shippingIncludeVat: false,
    shippingVatRatePct: 0,
  };
}

export function getEffectiveCountryCode(
  shopCountryCode: string,
) {
  const testCountry =
    process.env.MARGINLAB_TEST_COUNTRY
      ?.trim()
      .toUpperCase();

  if (testCountry) {
    return testCountry;
  }

  return normalizeCountryCode(shopCountryCode);
}

export function getTaxSystemForCountry(
  countryCode: string,
): TaxSystem {
  const code = normalizeCountryCode(countryCode);

  if (!code) {
    return "UNKNOWN";
  }

  if (code === "US") {
    return "SALES_TAX";
  }

  if (code === "CA") {
    return "GST_HST";
  }

  if (GST_COUNTRIES.has(code)) {
    return "GST";
  }

  if (VAT_COUNTRIES.has(code)) {
    return "VAT";
  }

  return "UNKNOWN";
}

export function getCountryTaxCapabilities(
  countryCode: string,
): CountryTaxCapabilities {
  const code = normalizeCountryCode(countryCode);
  const taxSystem = getTaxSystemForCountry(code);

  return {
    countryCode: code,
    taxSystem,

    advancedProfileAvailable:
      code === "IT" ||
      code === "GB" ||
      code === "CA",

    supportsRecoverableInputTaxModel:
      taxSystem === "VAT" ||
      taxSystem === "GST" ||
      taxSystem === "GST_HST",
  };
}

function buildGlobalFallbackContext({
  shopCountryCode,
  effectiveCountryCode,
}: {
  shopCountryCode: string;
  effectiveCountryCode: string;
}): TaxContext {
  const capabilities =
    getCountryTaxCapabilities(effectiveCountryCode);

  return {
    shopCountryCode,
    effectiveCountryCode,

    taxSystem: capabilities.taxSystem,
    advancedProfileAvailable:
      capabilities.advancedProfileAvailable,
    supportsRecoverableInputTaxModel:
      capabilities.supportsRecoverableInputTaxModel,

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

function buildUnconfiguredAdvancedContext({
  shopCountryCode,
  effectiveCountryCode,
}: {
  shopCountryCode: string;
  effectiveCountryCode: string;
}): TaxContext {
  const capabilities =
    getCountryTaxCapabilities(effectiveCountryCode);

  const defaults =
    getAdvancedCountryDefaults(effectiveCountryCode);

  return {
    shopCountryCode,
    effectiveCountryCode,

    taxSystem: capabilities.taxSystem,
    advancedProfileAvailable: true,
    supportsRecoverableInputTaxModel:
      capabilities.supportsRecoverableInputTaxModel,

    isItalianStore:
      effectiveCountryCode === "IT",

    profile: "UNCONFIGURED",

    ...defaults,

    configured: false,
  };
}

export async function getStoreTaxContext({
  shop,
  shopCountryCode,
}: {
  shop: string;
  shopCountryCode: string;
}): Promise<TaxContext> {
  const normalizedShopCountryCode =
    normalizeCountryCode(shopCountryCode);

  const effectiveCountryCode =
    getEffectiveCountryCode(shopCountryCode);

  const capabilities =
    getCountryTaxCapabilities(effectiveCountryCode);

  const isItalianStore =
    effectiveCountryCode === "IT";

  if (!capabilities.advancedProfileAvailable) {
    return buildGlobalFallbackContext({
      shopCountryCode: normalizedShopCountryCode,
      effectiveCountryCode,
    });
  }

  const savedProfile =
    await prisma.storeTaxProfile.findUnique({
      where: { shop },
    });

  if (!savedProfile) {
    return buildUnconfiguredAdvancedContext({
      shopCountryCode: normalizedShopCountryCode,
      effectiveCountryCode,
    });
  }

  const profile =
    savedProfile.regime as TaxProfile;

  if (
    !profileMatchesCountry({
      profile,
      countryCode: effectiveCountryCode,
    })
  ) {
    return buildUnconfiguredAdvancedContext({
      shopCountryCode: normalizedShopCountryCode,
      effectiveCountryCode,
    });
  }

  const storedRecoveryPct =
    clampPct(savedProfile.inputVatRecoveryPct);

  const inputVatRecoveryPct =
    profileAllowsInputTaxRecovery(profile) &&
    savedProfile.recoverInputVat
      ? storedRecoveryPct
      : 0;

  return {
    shopCountryCode: normalizedShopCountryCode,
    effectiveCountryCode,

    taxSystem: capabilities.taxSystem,
    advancedProfileAvailable:
      capabilities.advancedProfileAvailable,
    supportsRecoverableInputTaxModel:
      capabilities.supportsRecoverableInputTaxModel,

    isItalianStore,
    profile,

    defaultVatRatePct:
      clampPct(savedProfile.defaultVatRatePct),

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
      clampPct(savedProfile.shippingVatRatePct),

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
    normalizeCountryCode(countryCode);

  if (
    !profileMatchesCountry({
      profile: regime,
      countryCode: normalizedCountryCode,
    })
  ) {
    throw new Error(
      `Tax profile ${regime} is not valid for ${normalizedCountryCode || "this jurisdiction"}.`,
    );
  }

  const normalizedVatRate =
    clampPct(defaultVatRatePct);

  const normalizedShippingVatRate =
    clampPct(shippingVatRatePct);

  const normalizedRecoveryPct =
    profileAllowsInputTaxRecovery(regime) &&
    recoverInputVat
      ? clampPct(inputVatRecoveryPct)
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