import type { FeatureMoney } from "./feature-data-contract";

export const FEATURE_MONEY_MAX_SCALE = 12;
const RATIO_DECIMAL_PLACES = 6;

export type FeatureExactRate = Readonly<{ numerator: bigint; denominator: bigint }>;
export type FeatureMoneyRoundingMode = "HALF_UP";

export function assertFeatureExactRate(rate: FeatureExactRate): FeatureExactRate {
  if (typeof rate.numerator !== "bigint" || typeof rate.denominator !== "bigint")
    throw new TypeError("Feature rate values must be bigint");
  if (rate.denominator <= 0n) throw new RangeError("Feature rate denominator must be positive");
  return rate;
}

function validateScale(scale: number) {
  if (!Number.isInteger(scale) || scale < 0 || scale > FEATURE_MONEY_MAX_SCALE)
    throw new RangeError(`Invalid feature-money scale: ${scale}`);
}

function validateCurrency(currencyCode: string) {
  if (!/^[A-Z]{3}$/.test(currencyCode))
    throw new RangeError(`Invalid feature-money currency: ${currencyCode}`);
}

export function assertFeatureMoney(value: FeatureMoney): FeatureMoney {
  validateScale(value.amountScale);
  validateCurrency(value.currencyCode);
  if (typeof value.amountAtoms !== "bigint") throw new TypeError("Feature-money atoms must be bigint");
  return value;
}

function assertSameCurrency(left: FeatureMoney, right: FeatureMoney) {
  assertFeatureMoney(left);
  assertFeatureMoney(right);
  if (left.currencyCode !== right.currencyCode)
    throw new RangeError(`Feature-money currency mismatch: ${left.currencyCode}/${right.currencyCode}`);
}

export function normalizeFeatureMoneyScale(value: FeatureMoney, targetScale: number): FeatureMoney {
  assertFeatureMoney(value);
  validateScale(targetScale);
  if (targetScale === value.amountScale) return value;
  if (targetScale > value.amountScale) return { ...value,
    amountAtoms: value.amountAtoms * 10n ** BigInt(targetScale - value.amountScale), amountScale: targetScale };
  const divisor = 10n ** BigInt(value.amountScale - targetScale);
  if (value.amountAtoms % divisor !== 0n) throw new RangeError("Inexact feature-money downscale");
  return { ...value, amountAtoms: value.amountAtoms / divisor, amountScale: targetScale };
}

function commonScale(left: FeatureMoney, right: FeatureMoney) {
  assertSameCurrency(left, right);
  return Math.max(left.amountScale, right.amountScale);
}

export function addFeatureMoney(left: FeatureMoney, right: FeatureMoney): FeatureMoney {
  const amountScale = commonScale(left, right);
  return { amountAtoms: normalizeFeatureMoneyScale(left, amountScale).amountAtoms +
    normalizeFeatureMoneyScale(right, amountScale).amountAtoms, amountScale, currencyCode: left.currencyCode };
}

export function subtractFeatureMoney(left: FeatureMoney, right: FeatureMoney): FeatureMoney {
  const amountScale = commonScale(left, right);
  return { amountAtoms: normalizeFeatureMoneyScale(left, amountScale).amountAtoms -
    normalizeFeatureMoneyScale(right, amountScale).amountAtoms, amountScale, currencyCode: left.currencyCode };
}

export function multiplyFeatureMoneyByInteger(value: FeatureMoney, quantity: bigint): FeatureMoney {
  assertFeatureMoney(value);
  if (typeof quantity !== "bigint") throw new TypeError("Feature-money quantity must be bigint");
  return { ...value, amountAtoms: value.amountAtoms * quantity };
}

function divideRoundedHalfUp(numerator: bigint, denominator: bigint) {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === 0n || (remainder < 0n ? -remainder : remainder) * 2n < denominator) return quotient;
  return quotient + (numerator < 0n ? -1n : 1n);
}

/** Applies an exact rational rate and rounds once at the explicit output scale. */
export function multiplyFeatureMoneyByRate(value: FeatureMoney, rate: FeatureExactRate,
targetScale: number, roundingMode: FeatureMoneyRoundingMode = "HALF_UP"): FeatureMoney {
  assertFeatureMoney(value); assertFeatureExactRate(rate); validateScale(targetScale);
  if (roundingMode !== "HALF_UP") throw new RangeError(`Unsupported feature-money rounding: ${roundingMode}`);
  const scaleDelta = targetScale - value.amountScale;
  const scaledNumerator = value.amountAtoms * rate.numerator *
    (scaleDelta > 0 ? 10n ** BigInt(scaleDelta) : 1n);
  const scaledDenominator = rate.denominator * (scaleDelta < 0 ? 10n ** BigInt(-scaleDelta) : 1n);
  return { amountAtoms: divideRoundedHalfUp(scaledNumerator, scaledDenominator), amountScale: targetScale,
    currencyCode: value.currencyCode };
}

export function roundFeatureMoney(value: FeatureMoney, targetScale: number,
roundingMode: FeatureMoneyRoundingMode = "HALF_UP") {
  return multiplyFeatureMoneyByRate(value, { numerator: 1n, denominator: 1n }, targetScale, roundingMode);
}

export function compareFeatureMoney(left: FeatureMoney, right: FeatureMoney): -1 | 0 | 1 {
  const amountScale = commonScale(left, right);
  const leftAtoms = normalizeFeatureMoneyScale(left, amountScale).amountAtoms;
  const rightAtoms = normalizeFeatureMoneyScale(right, amountScale).amountAtoms;
  return leftAtoms < rightAtoms ? -1 : leftAtoms > rightAtoms ? 1 : 0;
}

export type FeatureRatioResult =
  | Readonly<{ status: "DEFINED"; value: number }>
  | Readonly<{ status: "UNDEFINED"; reason: "ZERO_DENOMINATOR" | "OUT_OF_SAFE_RANGE" }>;

function deriveScaledRatio(numerator: FeatureMoney, denominator: FeatureMoney, multiplier: bigint): FeatureRatioResult {
  const amountScale = commonScale(numerator, denominator);
  const numeratorAtoms = normalizeFeatureMoneyScale(numerator, amountScale).amountAtoms;
  const denominatorAtoms = normalizeFeatureMoneyScale(denominator, amountScale).amountAtoms;
  if (denominatorAtoms === 0n) return { status: "UNDEFINED", reason: "ZERO_DENOMINATOR" };
  const presentationScale = 10n ** BigInt(RATIO_DECIMAL_PLACES);
  const scaled = numeratorAtoms * multiplier * presentationScale / denominatorAtoms;
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER) || scaled < BigInt(Number.MIN_SAFE_INTEGER))
    return { status: "UNDEFINED", reason: "OUT_OF_SAFE_RANGE" };
  return { status: "DEFINED", value: Number(scaled) / 10 ** RATIO_DECIMAL_PLACES };
}

export function deriveFeatureRatio(numerator: FeatureMoney, denominator: FeatureMoney): FeatureRatioResult {
  return deriveScaledRatio(numerator, denominator, 1n);
}

export function deriveFeaturePercentage(numerator: FeatureMoney, denominator: FeatureMoney): FeatureRatioResult {
  return deriveScaledRatio(numerator, denominator, 100n);
}
