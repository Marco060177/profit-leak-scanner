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
  | "ITALY_EXEMPT";

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

  // Temporary compatibility flag while the rest of MarginLab
  // is migrated away from Italy-specific checks.
  isItalianStore: boolean;

  profile: TaxProfile;

  // Legacy VAT-named fields retained during the international migration.
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
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
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

export function getEffectiveCountryCode(shopCountryCode: string) {
  const testCountry = process.env.MARGINLAB_TEST_COUNTRY
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

    // Italy remains the first fully configurable advanced profile.
    advancedProfileAvailable: code === "IT",

    // This is only a model capability flag, not a legal determination
    // for a specific merchant.
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

    // No country-specific assumptions are manufactured here.
    // The global engine can still use actual Shopify tax data.
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

function buildUnconfiguredItalyContext({
  shopCountryCode,
  effectiveCountryCode,
}: {
  shopCountryCode: string;
  effectiveCountryCode: string;
}): TaxContext {
  return {
    shopCountryCode,
    effectiveCountryCode,

    taxSystem: "VAT",
    advancedProfileAvailable: true,
    supportsRecoverableInputTaxModel: true,

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

  if (!isItalianStore) {
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
    return buildUnconfiguredItalyContext({
      shopCountryCode: normalizedShopCountryCode,
      effectiveCountryCode,
    });
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

    taxSystem: capabilities.taxSystem,
    advancedProfileAvailable:
      capabilities.advancedProfileAvailable,
    supportsRecoverableInputTaxModel:
      capabilities.supportsRecoverableInputTaxModel,

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
    normalizeCountryCode(countryCode);

  // The persisted advanced profile is still Italy-specific.
  // Do not silently write Italian regimes for another jurisdiction.
  if (normalizedCountryCode !== "IT") {
    throw new Error(
      `Advanced tax profile persistence is not available for ${normalizedCountryCode || "this jurisdiction"} yet.`,
    );
  }

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