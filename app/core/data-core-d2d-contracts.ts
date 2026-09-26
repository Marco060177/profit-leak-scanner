import type {
  FinancialLedgerEntry,
  ReplacementLink,
} from "@prisma/client";
import type { VerifiedCoreTenant } from "./data-core-d2a.server";

export const DATA_CORE_D2D_CONTRACT_VERSION = "D2D_CANONICAL_ECONOMIC_DATASET_V1" as const;
export type CanonicalEconomicScope =
  | { kind: "CHANNEL" }
  | { kind: "MARKETPLACE"; marketplaceId: string }
  | { kind: "ORDER"; orderId: string }
  | { kind: "ORDER_ITEM"; orderId: string; itemId: string };
export type CanonicalEconomicDatasetRequest = Readonly<{
  tenant: VerifiedCoreTenant;
  scope: CanonicalEconomicScope;
  economicWindow: { startInclusive: Date; endExclusive: Date };
  currencyPolicyVersionId: string;
}>;
export type CanonicalCommerceOrder = Readonly<{
  id: string; marketplaceId: string | null; revisionId: string; revision: number;
  inputChecksum: string; mappingVersionId: string; occurredAt: Date | null; postedAt: Date | null;
}>;
export type CanonicalCommerceItem = Readonly<{
  id: string; orderId: string; revisionId: string; revision: number; inputChecksum: string;
  mappingVersionId: string; skuId: string | null; quantityAtoms: bigint; quantityScale: number;
}>;
export type CanonicalCompleteness = "COMPLETE" | "PROVISIONAL" | "NO_OBSERVATIONS" | "BLOCKED";
export type CanonicalCogs = Readonly<{
  lotId: string; orderId: string | null; itemId: string | null; skuId: string; originKind: string;
  quantityAtoms: bigint; quantityScale: number; unitCostAtoms: bigint; unitCostScale: number;
  currencyCode: string; recognitionEconomicAt: Date; costRecordRevisionId: string;
  costEvidenceEventId: string | null; inputChecksum: string;
}>;
export type CanonicalInventoryEvent = Readonly<{
  id: string; lotId: string; eventType: string; effectClass: string; quantityAtoms: bigint; quantityScale: number;
  economicAt: Date; inputChecksum: string;
  monetaryEffect: null | { unitCostAtoms: bigint; unitCostScale: number; currencyCode: string };
}>;
export type CanonicalReimbursementLink = Readonly<{
  eventId: string; lotId: string; financialLedgerEntryId: string; eventType: string; quantityAtoms: bigint; quantityScale: number; economicAt: Date; inputChecksum: string;
}>;
export type CanonicalTaxEvidence = Readonly<{
  id: string; category: string; economicRole: string; priceRelation: string; authorityClass: string;
  availability: string; coverageState: string; confidence: string; jurisdictionCode: string | null;
  periodStart: Date | null; periodEnd: Date | null; monetaryAuthorityEntryId: string | null; inputChecksum: string;
}>;
export type CanonicalEconomicDatasetReady = Readonly<{
  status: "READY"; contractVersion: typeof DATA_CORE_D2D_CONTRACT_VERSION;
  requestedScope: CanonicalEconomicScope; economicWindow: CanonicalEconomicDatasetRequest["economicWindow"];
  currency: { mode: "SINGLE_CURRENCY" | "NO_MONETARY_OBSERVATIONS"; currencyCode: string | null };
  currencyPolicy: { id: string; version: string; checksum: string };
  commerce: { orders: CanonicalCommerceOrder[]; items: CanonicalCommerceItem[] };
  financialComponents: FinancialLedgerEntry[]; cogs: CanonicalCogs[];
  inventoryEvents: CanonicalInventoryEvent[]; reimbursementLinks: CanonicalReimbursementLink[];
  replacements: ReplacementLink[]; taxEvidence: CanonicalTaxEvidence[];
  completeness: CanonicalCompleteness;
  evidenceManifest: Record<string, unknown>; fingerprint: string;
}>;
export type CanonicalEconomicDatasetBlocked = Readonly<{
  status: "BLOCKED"; contractVersion: typeof DATA_CORE_D2D_CONTRACT_VERSION;
  requestedScope: CanonicalEconomicScope; blockedScopes: string[]; reasonCodes: string[];
  completeness: "BLOCKED"; diagnosticReferences: Array<{ kind: string; id: string }>;
  fingerprint: string;
}>;
