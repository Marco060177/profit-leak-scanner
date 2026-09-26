import { money, normalizeMoneyScale, type FixedMoney } from "./fixed-money";
export type { VerifiedCoreTenant } from "./data-core-d2a.server";
export const AUTHORITY_CLASSES = ["PROVISIONAL", "ACTUAL"] as const;
export type AuthorityClass = (typeof AUTHORITY_CLASSES)[number];
export const COVERAGE_FAMILIES = [
  "SALE_BUNDLE",
  "REFUND_BUNDLE",
  "PERIODIC_CHARGE_BUNDLE",
  "REIMBURSEMENT_BUNDLE",
  "ADJUSTMENT_BUNDLE",
  "UNRESOLVED_EVENT",
] as const;
export type CoverageFamily = (typeof COVERAGE_FAMILIES)[number];
export const PROJECTION_KINDS = [
  "PRODUCT_REVENUE",
  "DISCOUNT_PROMOTION",
  "REFUND",
  "MARKETPLACE_COMMISSION",
  "FULFILLMENT_FEE",
  "SHIPPING_REVENUE",
  "SHIPPING_EXPENSE",
  "STORAGE_FEE",
  "REIMBURSEMENT",
  "ADJUSTMENT",
  "TAX_COMPONENT",
  "UNKNOWN_UNCLASSIFIED",
] as const;
export type ProjectionKind = (typeof PROJECTION_KINDS)[number];
export type AuthorityState =
  | "NO_ACTUAL"
  | "ACTUAL_INCOMPLETE"
  | "ACTUAL_COMPLETE"
  | "ACTUAL_UNKNOWN";
export type CoverageState = "COMPLETE" | "INCOMPLETE" | "UNKNOWN";
export type Provenance = Readonly<{
  rawSourceRecordId: string;
  normalizationRunId: string;
  mappingVersionId: string;
  normalizationRevision: number;
  syncSliceEvidenceId: string;
}>;
export function financialMoney(value: FixedMoney): FixedMoney {
  if (typeof value.amountAtoms !== "bigint")
    throw new TypeError("D2B monetary atoms must be bigint");
  return money(value.amountAtoms, value.amountScale, value.currencyCode);
}
export function rescaleFinancialMoney(
  value: FixedMoney,
  scale: number,
): FixedMoney {
  financialMoney(value);
  return normalizeMoneyScale(value, scale, {
    mode: "REJECT",
    policyVersion: "D2B_EXACT_ONLY_V1",
  });
}
/** Deliberately rejects mixed currencies; never used to sum unselected ledger rows. */
export function sumFinancialMoney(
  values: readonly FixedMoney[],
): FixedMoney | null {
  if (!values.length) return null;
  const currencyCode = values[0].currencyCode;
  const scale = Math.max(...values.map((value) => value.amountScale));
  let atoms = 0n;
  for (const value of values) {
    financialMoney(value);
    if (value.currencyCode !== currencyCode)
      throw new Error("D2B currency mismatch");
    atoms += rescaleFinancialMoney(value, scale).amountAtoms;
  }
  return financialMoney({
    amountAtoms: atoms,
    amountScale: scale,
    currencyCode,
  });
}
