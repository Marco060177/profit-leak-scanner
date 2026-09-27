import { createHash } from "node:crypto";
import {
  MAX_ATOMS,
  MAX_SCALE,
  MIN_ATOMS,
  money,
  type FixedMoney,
} from "./fixed-money";

export type SourceExactMoney = Readonly<{
  sourceAmountText: string;
  amountAtoms: bigint;
  amountScale: number;
  currencyCode: string;
}>;

export type MoneyRepresentabilityReason =
  | "MONEY_ATOMS_OUT_OF_RANGE"
  | "MONEY_SCALE_OUT_OF_RANGE";

export type FixedMoneyRepresentability =
  | Readonly<{
      status: "REPRESENTABLE";
      fixedMoney: FixedMoney;
      canonicalAmountAtoms: bigint;
      canonicalAmountScale: number;
    }>
  | Readonly<{
      status: "UNREPRESENTABLE";
      reasonCode: MoneyRepresentabilityReason;
      canonicalAmountAtoms: bigint;
      canonicalAmountScale: number;
    }>;

export type UnrepresentableMoneySource = Readonly<{
  sourceSystem: string;
  sourceEventNamespace: string;
  sourceEventIdentity: string;
  sourcePayloadChecksum: string;
  sourceLeafPath: string;
  economicEventKey: string;
  money: SourceExactMoney;
}>;

export type UnrepresentableMoneyBlocker = Readonly<{
  blockerIdentity: string;
  evidenceFingerprint: string;
  reasonCode: MoneyRepresentabilityReason;
  economicEventKey: string;
  source: UnrepresentableMoneySource;
}>;

/** Parse source decimal text without passing through an IEEE-754 Number. */
export function parseSourceExactMoney(
  sourceAmountText: string,
  currencyCode: string,
): SourceExactMoney {
  if (!/^[A-Z]{3}$/.test(currencyCode))
    throw new Error("Invalid ISO-style currency code");
  const match = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?$/.exec(sourceAmountText);
  if (!match) throw new Error("Invalid source decimal amount");
  const fraction = match[3] ?? "";
  const unsignedDigits = (match[2] + fraction).replace(/^0+(?=\d)/, "");
  const unsignedAtoms = BigInt(unsignedDigits);
  return {
    sourceAmountText,
    amountAtoms: match[1] === "-" ? -unsignedAtoms : unsignedAtoms,
    amountScale: fraction.length,
    currencyCode,
  };
}

/**
 * Reduce only mathematically redundant decimal trailing zeroes, then assess the
 * exact value against the closed SQLite-backed FixedMoney contract.
 */
export function assessFixedMoneyRepresentability(
  source: SourceExactMoney,
): FixedMoneyRepresentability {
  if (!/^[A-Z]{3}$/.test(source.currencyCode))
    throw new Error("Invalid ISO-style currency code");
  if (!Number.isSafeInteger(source.amountScale) || source.amountScale < 0)
    throw new RangeError("Invalid source money scale");

  let canonicalAmountAtoms = source.amountAtoms;
  let canonicalAmountScale = source.amountScale;
  while (
    canonicalAmountScale > 0 &&
    canonicalAmountAtoms % 10n === 0n
  ) {
    canonicalAmountAtoms /= 10n;
    canonicalAmountScale -= 1;
  }

  if (canonicalAmountScale > MAX_SCALE) {
    return {
      status: "UNREPRESENTABLE",
      reasonCode: "MONEY_SCALE_OUT_OF_RANGE",
      canonicalAmountAtoms,
      canonicalAmountScale,
    };
  }
  if (canonicalAmountAtoms < MIN_ATOMS || canonicalAmountAtoms > MAX_ATOMS) {
    return {
      status: "UNREPRESENTABLE",
      reasonCode: "MONEY_ATOMS_OUT_OF_RANGE",
      canonicalAmountAtoms,
      canonicalAmountScale,
    };
  }
  return {
    status: "REPRESENTABLE",
    fixedMoney: money(
      canonicalAmountAtoms,
      canonicalAmountScale,
      source.currencyCode,
    ),
    canonicalAmountAtoms,
    canonicalAmountScale,
  };
}

function fingerprint(value: Readonly<Record<string, string>>): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/**
 * Build a stable unresolved-money descriptor for later D1/D2B ingestion.
 * Identity follows the source leaf; evidence changes when its exact content or
 * reason changes. No unrepresentable integer is converted to SQLite Int64.
 */
export function createUnrepresentableMoneyBlocker(
  source: UnrepresentableMoneySource,
  assessment: FixedMoneyRepresentability =
    assessFixedMoneyRepresentability(source.money),
): UnrepresentableMoneyBlocker {
  if (assessment.status !== "UNREPRESENTABLE")
    throw new Error("Representable money does not create an unresolved blocker");

  const identityProjection = {
    sourceSystem: source.sourceSystem,
    sourceEventNamespace: source.sourceEventNamespace,
    sourceEventIdentity: source.sourceEventIdentity,
    sourceLeafPath: source.sourceLeafPath,
    economicEventKey: source.economicEventKey,
    currencyCode: source.money.currencyCode,
  };
  const blockerIdentity = fingerprint(identityProjection);
  const evidenceFingerprint = fingerprint({
    ...identityProjection,
    sourcePayloadChecksum: source.sourcePayloadChecksum,
    sourceAmountText: source.money.sourceAmountText,
    sourceAmountAtoms: source.money.amountAtoms.toString(),
    sourceAmountScale: source.money.amountScale.toString(),
    reasonCode: assessment.reasonCode,
  });
  return {
    blockerIdentity,
    evidenceFingerprint,
    reasonCode: assessment.reasonCode,
    economicEventKey: source.economicEventKey,
    source,
  };
}
