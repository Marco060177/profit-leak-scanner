export type TaxProfile =
  | "NOT_APPLICABLE"
  | "ITALY_STANDARD"
  | "ITALY_FORFETTARIO"
  | "ITALY_EXEMPT";

export type TaxContext = {
  shopCountryCode: string;
  effectiveCountryCode: string;
  isItalianStore: boolean;
  profile: TaxProfile;
};

export function getEffectiveCountryCode(shopCountryCode: string) {
  const testCountry = process.env.MARGINLAB_TEST_COUNTRY?.trim().toUpperCase();

  if (testCountry) {
    return testCountry;
  }

  return shopCountryCode.trim().toUpperCase();
}

export function buildTaxContext(shopCountryCode: string): TaxContext {
  const effectiveCountryCode = getEffectiveCountryCode(shopCountryCode);
  const isItalianStore = effectiveCountryCode === "IT";

  return {
    shopCountryCode: shopCountryCode.trim().toUpperCase(),
    effectiveCountryCode,
    isItalianStore,
    profile: isItalianStore ? "ITALY_STANDARD" : "NOT_APPLICABLE",
  };
}