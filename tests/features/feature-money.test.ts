import assert from "node:assert/strict";
import type { FeatureDataBlocked, FeatureDataReady, FeatureMoney } from
  "../../app/features/feature-data-contract";
import { addFeatureMoney, compareFeatureMoney, deriveFeaturePercentage, deriveFeatureRatio,
  assertFeatureExactRate, multiplyFeatureMoneyByInteger, multiplyFeatureMoneyByRate,
  normalizeFeatureMoneyScale, roundFeatureMoney, subtractFeatureMoney } from
  "../../app/features/feature-money";

const eur = (amountAtoms: bigint, amountScale: number): FeatureMoney => ({ amountAtoms, amountScale, currencyCode: "EUR" });

assert.deepEqual(multiplyFeatureMoneyByInteger(eur(725n, 2), 4n), eur(2900n, 2));
assert.deepEqual(addFeatureMoney(eur(10n, 1), eur(25n, 2)), eur(125n, 2));
assert.deepEqual(subtractFeatureMoney(eur(100n, 2), eur(5n, 1)), eur(50n, 2));
assert.equal(compareFeatureMoney(eur(100n, 2), eur(1n, 0)), 0);
assert.equal(compareFeatureMoney(eur(999n, 2), eur(10n, 0)), -1);

const aboveSafeInteger = 9007199254740993123456789n;
assert.deepEqual(addFeatureMoney(eur(aboveSafeInteger, 2), eur(1n, 2)), eur(aboveSafeInteger + 1n, 2));
assert.deepEqual(multiplyFeatureMoneyByInteger(eur(aboveSafeInteger, 2), 4n), eur(aboveSafeInteger * 4n, 2));
assert.deepEqual(multiplyFeatureMoneyByRate(eur(725n, 2), { numerator: 4n, denominator: 1n }, 2), eur(2900n, 2));
assert.deepEqual(multiplyFeatureMoneyByRate(eur(10000n, 2), { numerator: 30n, denominator: 31n }, 2), eur(9677n, 2));
assert.deepEqual(roundFeatureMoney(eur(1005n, 3), 2), eur(101n, 2));
assert.deepEqual(roundFeatureMoney(eur(-1005n, 3), 2), eur(-101n, 2));
assert.deepEqual(multiplyFeatureMoneyByRate(eur(aboveSafeInteger, 2),
  { numerator: 3n, denominator: 2n }, 2), eur(aboveSafeInteger * 3n / 2n + 1n, 2));
assert.throws(() => assertFeatureExactRate({ numerator: 1n, denominator: 0n }), /denominator/);

assert.throws(() => addFeatureMoney(eur(1n, 2), { amountAtoms: 1n, amountScale: 2, currencyCode: "USD" }),
  /currency mismatch/);
assert.throws(() => addFeatureMoney(eur(1n, -1), eur(1n, 2)), /Invalid feature-money scale/);
assert.throws(() => normalizeFeatureMoneyScale(eur(101n, 2), 1), /Inexact feature-money downscale/);
assert.deepEqual(normalizeFeatureMoneyScale(eur(100n, 2), 1), eur(10n, 1));

assert.deepEqual(deriveFeatureRatio(eur(1n, 2), eur(4n, 2)), { status: "DEFINED", value: 0.25 });
assert.deepEqual(deriveFeaturePercentage(eur(35n, 0), eur(100n, 0)), { status: "DEFINED", value: 35 });
assert.deepEqual(deriveFeatureRatio(eur(1n, 0), eur(0n, 0)),
  { status: "UNDEFINED", reason: "ZERO_DENOMINATOR" });

const blocked: FeatureDataBlocked = { status: "BLOCKED", accountId: "a", channelConnectionId: "c",
  source: { channel: "TEST", sourceSystem: "FIXTURE", adapterVersion: "1" }, reasonCodes: ["UNKNOWN_COST"] };
assert.equal(blocked.status, "BLOCKED");
const readyShape = null as FeatureDataReady | null;
assert.equal(readyShape, null);

console.log("FA1A feature money and contract foundation: PASS");
