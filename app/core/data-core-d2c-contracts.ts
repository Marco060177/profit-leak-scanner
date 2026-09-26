import {
  money,
  quantity,
  type FixedMoney,
  type FixedQuantity,
} from "./fixed-money";

export const INVENTORY_STATES = [
  "SOLD",
  "RETURN_IN_TRANSIT",
  "RETURNED_PENDING_INSPECTION",
  "SELLABLE",
  "UNSELLABLE",
  "LOST",
  "DAMAGED",
  "DISPOSED",
  "LIQUIDATED",
] as const;
export type InventoryState = (typeof INVENTORY_STATES)[number];
export const INVENTORY_EVENT_TYPES = [
  "SALE_RECOGNITION",
  "COST_BASIS_RESOLVED",
  "COST_CORRECTION",
  "RETURN_INITIATED",
  "RETURN_RECEIVED",
  "RESTOCKED_SELLABLE",
  "RESTOCKED_UNSELLABLE",
  "LOST",
  "DAMAGED",
  "DISPOSED",
  "LIQUIDATED",
  "REIMBURSEMENT_LINKED",
  "REPLACEMENT_SENT",
  "COMPENSATION",
] as const;
export type InventoryEventType = (typeof INVENTORY_EVENT_TYPES)[number];
export type D2cProvenance = Readonly<{
  rawSourceRecordId: string;
  normalizationRunId: string;
  mappingVersionId: string;
  normalizationRevision: number;
  syncSliceEvidenceId: string;
  sourceLeafPath: string;
}>;
export type D2cManualEvidence = Readonly<{
  actorRef: string;
  manualReasonCode: string;
}>;
export type CostSelection =
  | { status: "KNOWN"; revisionId: string; unitCost: FixedMoney }
  | { status: "UNKNOWN"; reason: string }
  | { status: "AMBIGUOUS"; reason: string };
export type EffectiveD2c =
  | {
      status: "READY";
      lots: readonly unknown[];
      events: readonly unknown[];
      taxEvidence: readonly unknown[];
    }
  | {
      status: "BLOCKED";
      reasons: readonly string[];
      diagnostics: readonly unknown[];
    };
export function d2cMoney(value: FixedMoney) {
  return money(value.amountAtoms, value.amountScale, value.currencyCode);
}
export function d2cQuantity(value: FixedQuantity) {
  return quantity(value.quantityAtoms, value.quantityScale);
}
