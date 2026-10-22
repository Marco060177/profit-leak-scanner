import assert from "node:assert/strict";

import {
  getInitialTaxRate,
  parseTaxRate,
  persistTaxProfile,
  TaxRateValidationError,
  transitionStandardTaxSettings,
} from "../../app/utils/tax-profile-form";

function expectRateError(
  value: FormDataEntryValue | null,
  code: TaxRateValidationError["code"],
  precision = 1,
) {
  assert.throws(
    () => parseTaxRate(value, "Tax rate", precision),
    (error) => error instanceof TaxRateValidationError && error.code === code,
  );
}

expectRateError(null, "MISSING");
expectRateError("", "EMPTY");
expectRateError("   ", "EMPTY");
expectRateError("not-a-number", "INVALID_NUMBER");
expectRateError("-1", "OUT_OF_RANGE");
expectRateError("101", "OUT_OF_RANGE");
expectRateError("5.55", "INVALID_PRECISION");
expectRateError("50.5", "INVALID_PRECISION", 0);

assert.equal(parseTaxRate("0", "Tax rate", 1), 0);
assert.equal(parseTaxRate("0.0", "Tax rate", 1), 0);
assert.equal(parseTaxRate("5.5", "Tax rate", 1), 5.5);
assert.equal(parseTaxRate("100", "Tax rate", 1), 100);

assert.equal(getInitialTaxRate(0, 22, true), 0,
  "a configured 0% rate must survive reload");
assert.equal(getInitialTaxRate(5.5, 20, true), 5.5);
assert.equal(getInitialTaxRate(0, 22, false), 22,
  "an absent profile uses the jurisdiction default");
assert.equal(getInitialTaxRate(null, 22, true), 22,
  "a missing stored value uses an explicit default, never implicit zero");
assert.equal(getInitialTaxRate(undefined, 20, true), 20);

const standardSettings = {
  defaultVatRatePct: 0,
  pricesIncludeVat: true,
  inputVatRecoveryPct: 75,
  shippingIncludeVat: true,
  shippingVatRatePct: 0,
};
const nonStandard = transitionStandardTaxSettings({
  wasStandard: true,
  isStandard: false,
  current: standardSettings,
  savedStandard: standardSettings,
});
assert.deepEqual(nonStandard.current, {
  defaultVatRatePct: 0,
  pricesIncludeVat: false,
  inputVatRecoveryPct: 0,
  shippingIncludeVat: false,
  shippingVatRatePct: 0,
});
const restoredStandard = transitionStandardTaxSettings({
  wasStandard: false,
  isStandard: true,
  current: nonStandard.current,
  savedStandard: nonStandard.savedStandard,
});
assert.deepEqual(restoredStandard.current, standardSettings,
  "standard → non-standard → standard must restore the edited standard settings");

let persistedValue: number | null = null;
const explicitZero = parseTaxRate("0", "Tax rate", 1);
const success = await persistTaxProfile(async () => {
  persistedValue = explicitZero;
});
assert.equal(success.status, 200);
assert.equal(persistedValue, 0, "explicit zero reaches persistence unchanged");

const persistenceFailure = await persistTaxProfile(async () => {
  throw new Error("database detail that must not reach the user");
});
assert.equal(persistenceFailure.status, 500);
assert.deepEqual(await persistenceFailure.json(), {
  ok: false,
  errorKind: "persistence",
  error: "Unable to save the Tax Profile. Please try again.",
});

const authenticationResponse = new Response(null, {
  status: 401,
  headers: { "X-Shopify-API-Request-Failure-Reauthorize-Url": "/auth" },
});
await assert.rejects(
  persistTaxProfile(async () => {
    throw authenticationResponse;
  }),
  (error) => error === authenticationResponse,
  "Shopify authentication Responses must remain untouched",
);

console.log("Tax Profile hardening tests passed");
