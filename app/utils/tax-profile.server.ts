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
  | "CANADA_GST_HST_UNREGISTERED"
  | "AUSTRALIA_GST_REGISTERED"
  | "AUSTRALIA_GST_FREE"
  | "AUSTRALIA_GST_UNREGISTERED"
  | "GERMANY_VAT_STANDARD"
  | "GERMANY_VAT_EXEMPT"
  | "GERMANY_VAT_UNREGISTERED"
  | "FRANCE_VAT_STANDARD"
  | "FRANCE_VAT_EXEMPT"
  | "FRANCE_VAT_UNREGISTERED"
  | "SPAIN_VAT_STANDARD"
  | "SPAIN_VAT_EXEMPT"
  | "SPAIN_VAT_UNREGISTERED"
  | "NETHERLANDS_VAT_STANDARD"
  | "NETHERLANDS_VAT_EXEMPT"
  | "NETHERLANDS_VAT_UNREGISTERED"
  | "IRELAND_VAT_STANDARD"
  | "IRELAND_VAT_EXEMPT"
  | "IRELAND_VAT_UNREGISTERED"
  | "NEW_ZEALAND_GST_REGISTERED"
  | "NEW_ZEALAND_GST_EXEMPT"
  | "NEW_ZEALAND_GST_UNREGISTERED";

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

type AdvancedCountryConfig = {
  countryCode: string;
  taxSystem: TaxSystem;
  standardProfile: TaxProfile;
  profiles: readonly TaxProfile[];
  defaultVatRatePct: number;
  pricesIncludeVat: boolean;
  costsIncludeVat: boolean;
  recoverInputVat: boolean;
  inputVatRecoveryPct: number;
  shippingIncludeVat: boolean;
  shippingVatRatePct: number;
};

const ADVANCED_COUNTRY_CONFIGS: Record<
  string,
  AdvancedCountryConfig
> = {
  IT: {
    countryCode: "IT",
    taxSystem: "VAT",
    standardProfile: "ITALY_STANDARD",
    profiles: [
      "ITALY_STANDARD",
      "ITALY_FORFETTARIO",
      "ITALY_EXEMPT",
    ],
    defaultVatRatePct: 22,
    pricesIncludeVat: true,
    costsIncludeVat: true,
    recoverInputVat: true,
    inputVatRecoveryPct: 100,
    shippingIncludeVat: true,
    shippingVatRatePct: 22,
  },

  GB: {
    countryCode: "GB",
    taxSystem: "VAT",
    standardProfile: "UK_VAT_STANDARD",
    profiles: [
      "UK_VAT_STANDARD",
      "UK_VAT_EXEMPT",
      "UK_VAT_UNREGISTERED",
    ],
    defaultVatRatePct: 20,
    pricesIncludeVat: true,
    costsIncludeVat: true,
    recoverInputVat: true,
    inputVatRecoveryPct: 100,
    shippingIncludeVat: true,
    shippingVatRatePct: 20,
  },

  CA: {
    countryCode: "CA",
    taxSystem: "GST_HST",
    standardProfile: "CANADA_GST_HST_REGISTERED",
    profiles: [
      "CANADA_GST_HST_REGISTERED",
      "CANADA_GST_HST_EXEMPT",
      "CANADA_GST_HST_UNREGISTERED",
    ],
    // Federal GST baseline only. Actual Shopify tax lines remain
    // authoritative for HST and provincial place-of-supply outcomes.
    defaultVatRatePct: 5,
    pricesIncludeVat: false,
    costsIncludeVat: false,
    recoverInputVat: true,
    inputVatRecoveryPct: 100,
    shippingIncludeVat: false,
    shippingVatRatePct: 5,
  },

  AU: {
    countryCode: "AU",
    taxSystem: "GST",
    standardProfile: "AUSTRALIA_GST_REGISTERED",
    profiles: [
      "AUSTRALIA_GST_REGISTERED",
      "AUSTRALIA_GST_FREE",
      "AUSTRALIA_GST_UNREGISTERED",
    ],
    defaultVatRatePct: 10,
    pricesIncludeVat: true,
    costsIncludeVat: true,
    recoverInputVat: true,
    inputVatRecoveryPct: 100,
    shippingIncludeVat: true,
    shippingVatRatePct: 10,
  },

  DE: {
    countryCode: "DE",
    taxSystem: "VAT",
    standardProfile: "GERMANY_VAT_STANDARD",
    profiles: [
      "GERMANY_VAT_STANDARD",
      "GERMANY_VAT_EXEMPT",
      "GERMANY_VAT_UNREGISTERED",
    ],
    defaultVatRatePct: 19,
    pricesIncludeVat: true,
    costsIncludeVat: true,
    recoverInputVat: true,
    inputVatRecoveryPct: 100,
    shippingIncludeVat: true,
    shippingVatRatePct: 19,
  },

  FR: {
    countryCode: "FR",
    taxSystem: "VAT",
    standardProfile: "FRANCE_VAT_STANDARD",
    profiles: [
      "FRANCE_VAT_STANDARD",
      "FRANCE_VAT_EXEMPT",
      "FRANCE_VAT_UNREGISTERED",
    ],
    defaultVatRatePct: 20,
    pricesIncludeVat: true,
    costsIncludeVat: true,
    recoverInputVat: true,
    inputVatRecoveryPct: 100,
    shippingIncludeVat: true,
    shippingVatRatePct: 20,
  },

  ES: {
    countryCode: "ES",
    taxSystem: "VAT",
    standardProfile: "SPAIN_VAT_STANDARD",
    profiles: [
      "SPAIN_VAT_STANDARD",
      "SPAIN_VAT_EXEMPT",
      "SPAIN_VAT_UNREGISTERED",
    ],
    defaultVatRatePct: 21,
    pricesIncludeVat: true,
    costsIncludeVat: true,
    recoverInputVat: true,
    inputVatRecoveryPct: 100,
    shippingIncludeVat: true,
    shippingVatRatePct: 21,
  },

  NL: {
    countryCode: "NL",
    taxSystem: "VAT",
    standardProfile: "NETHERLANDS_VAT_STANDARD",
    profiles: [
      "NETHERLANDS_VAT_STANDARD",
      "NETHERLANDS_VAT_EXEMPT",
      "NETHERLANDS_VAT_UNREGISTERED",
    ],
    defaultVatRatePct: 21,
    pricesIncludeVat: true,
    costsIncludeVat: true,
    recoverInputVat: true,
    inputVatRecoveryPct: 100,
    shippingIncludeVat: true,
    shippingVatRatePct: 21,
  },

  IE: {
    countryCode: "IE",
    taxSystem: "VAT",
    standardProfile: "IRELAND_VAT_STANDARD",
    profiles: [
      "IRELAND_VAT_STANDARD",
      "IRELAND_VAT_EXEMPT",
      "IRELAND_VAT_UNREGISTERED",
    ],
    defaultVatRatePct: 23,
    pricesIncludeVat: true,
    costsIncludeVat: true,
    recoverInputVat: true,
    inputVatRecoveryPct: 100,
    shippingIncludeVat: true,
    shippingVatRatePct: 23,
  },

  NZ: {
    countryCode: "NZ",
    taxSystem: "GST",
    standardProfile: "NEW_ZEALAND_GST_REGISTERED",
    profiles: [
      "NEW_ZEALAND_GST_REGISTERED",
      "NEW_ZEALAND_GST_EXEMPT",
      "NEW_ZEALAND_GST_UNREGISTERED",
    ],
    defaultVatRatePct: 15,
    pricesIncludeVat: true,
    costsIncludeVat: true,
    recoverInputVat: true,
    inputVatRecoveryPct: 100,
    shippingIncludeVat: true,
    shippingVatRatePct: 15,
  },
};

function getAdvancedCountryConfig(
  countryCode: string,
) {
  return ADVANCED_COUNTRY_CONFIGS[
    normalizeCountryCode(countryCode)
  ];
}

function profileMatchesCountry({
  profile,
  countryCode,
}: {
  profile: TaxProfile;
  countryCode: string;
}) {
  const config =
    getAdvancedCountryConfig(countryCode);

  return config
    ? config.profiles.includes(profile)
    : false;
}

function profileAllowsInputTaxRecovery(
  profile: TaxProfile,
) {
  return Object.values(
    ADVANCED_COUNTRY_CONFIGS,
  ).some(
    (config) =>
      config.standardProfile === profile,
  );
}

function getAdvancedCountryDefaults(
  countryCode: string,
) {
  const config =
    getAdvancedCountryConfig(countryCode);

  if (!config) {
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

  return {
    defaultVatRatePct:
      config.defaultVatRatePct,
    pricesIncludeVat:
      config.pricesIncludeVat,
    costsIncludeVat:
      config.costsIncludeVat,
    recoverInputVat:
      config.recoverInputVat,
    inputVatRecoveryPct:
      config.inputVatRecoveryPct,
    shippingIncludeVat:
      config.shippingIncludeVat,
    shippingVatRatePct:
      config.shippingVatRatePct,
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
      Boolean(getAdvancedCountryConfig(code)),

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