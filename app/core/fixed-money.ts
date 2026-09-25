export type FixedMoney = Readonly<{ amountAtoms: bigint; amountScale: number; currencyCode: string }>;
export const MIN_ATOMS = -(1n << 63n);
export const MAX_ATOMS = (1n << 63n) - 1n;
export const MAX_SCALE = 12;

export function money(amountAtoms: bigint, amountScale: number, currencyCode: string): FixedMoney {
  if (amountAtoms < MIN_ATOMS || amountAtoms > MAX_ATOMS) throw new RangeError("Money atoms overflow SQLite Int64");
  if (!Number.isInteger(amountScale) || amountScale < 0 || amountScale > MAX_SCALE) throw new RangeError("Invalid money scale");
  if (!/^[A-Z]{3}$/.test(currencyCode)) throw new Error("Invalid ISO-style currency code");
  return { amountAtoms, amountScale, currencyCode };
}

export type RoundingMode = "REJECT" | "HALF_UP" | "HALF_EVEN";
export type RoundingPolicy = Readonly<{ policyVersion: string; mode: RoundingMode }>;

export function normalizeMoneyScale(value: FixedMoney, targetScale: number, policy: RoundingPolicy): FixedMoney {
  money(value.amountAtoms, value.amountScale, value.currencyCode);
  if (!policy.policyVersion) throw new Error("Currency policy version required");
  if (!Number.isInteger(targetScale) || targetScale < 0 || targetScale > MAX_SCALE) throw new RangeError("Invalid target scale");
  const delta = targetScale - value.amountScale;
  if (delta >= 0) return money(value.amountAtoms * 10n ** BigInt(delta), targetScale, value.currencyCode);
  const divisor = 10n ** BigInt(-delta);
  const absolute = value.amountAtoms < 0n ? -value.amountAtoms : value.amountAtoms;
  const quotient = absolute / divisor;
  const remainder = absolute % divisor;
  if (remainder && policy.mode === "REJECT") throw new Error("Money rounding required");
  if (!["REJECT", "HALF_UP", "HALF_EVEN"].includes(policy.mode)) throw new Error("Unsupported rounding mode");
  const roundUp = policy.mode === "HALF_UP" ? remainder * 2n >= divisor :
    policy.mode === "HALF_EVEN" && (remainder * 2n > divisor || (remainder * 2n === divisor && quotient % 2n === 1n));
  const rounded = (quotient + (roundUp ? 1n : 0n)) * (value.amountAtoms < 0n ? -1n : 1n);
  return money(rounded, targetScale, value.currencyCode);
}

export function addMoney(left: FixedMoney, right: FixedMoney, policy: RoundingPolicy): FixedMoney {
  if (left.currencyCode !== right.currencyCode) throw new Error("Currency mismatch");
  const scale = Math.max(left.amountScale, right.amountScale);
  const a = normalizeMoneyScale(left, scale, policy);
  const b = normalizeMoneyScale(right, scale, policy);
  return money(a.amountAtoms + b.amountAtoms, scale, left.currencyCode);
}
