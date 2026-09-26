import type { Prisma } from "@prisma/client";
import type { VerifiedCoreTenant } from "./data-core-d2a.server";
import { canonicalChecksum } from "./data-core-d2b.server";
import type { FixedMoney } from "./fixed-money";
import { d2cMoney } from "./data-core-d2c-contracts";
export async function recordNormalizedTaxEvidenceTx(
  tx: Prisma.TransactionClient,
  tenant: VerifiedCoreTenant,
  input: {
    evidenceKey: string;
    operationKey: string;
    status?: "PRESENT" | "WITHDRAWN";
    category: string;
    economicRole:
      | "COLLECTED"
      | "WITHHELD"
      | "REMITTED"
      | "REFUNDED"
      | "ASSESSED"
      | "INFORMATIONAL"
      | "UNKNOWN";
    priceRelation: "INCLUDED" | "EXCLUDED" | "NOT_APPLICABLE" | "UNKNOWN";
    authorityClass: "ACTUAL" | "PROVISIONAL" | "UNKNOWN";
    availability: "PRESENT" | "CONFIRMED_ZERO" | "UNAVAILABLE" | "UNKNOWN";
    coverageState: "COMPLETE" | "INCOMPLETE" | "UNKNOWN";
    confidence: string;
    amount?: FixedMoney | null;
    marketplaceId?: string | null;
    orderId?: string | null;
    orderRevisionId?: string | null;
    itemId?: string | null;
    itemRevisionId?: string | null;
    financialLedgerEntryId?: string | null;
    jurisdictionCode?: string | null;
    periodStart?: Date | null;
    periodEnd?: Date | null;
    rawSourceRecordId?: string | null;
    normalizationRunId?: string | null;
    mappingVersionId?: string | null;
    normalizationRevision?: number | null;
    syncSliceEvidenceId?: string | null;
    sourceLeafPath?: string | null;
    actorRef?: string | null;
    manualReasonCode?: string | null;
  },
) {
  const amount = input.amount ? d2cMoney(input.amount) : null;
  if (
    (input.availability === "UNAVAILABLE" ||
      input.availability === "UNKNOWN") &&
    amount
  )
    throw new Error("Unavailable tax cannot have amount");
  if (
    input.availability === "CONFIRMED_ZERO" &&
    (amount?.amountAtoms !== 0n ||
      !input.rawSourceRecordId ||
      !input.syncSliceEvidenceId)
  )
    throw new Error(
      "Confirmed zero requires explicit zero and source evidence",
    );
  const data = {
    accountId: tenant.accountId,
    channelConnectionId: tenant.channelConnectionId,
    status: input.status ?? "PRESENT",
    marketplaceId: input.marketplaceId ?? null,
    orderId: input.orderId ?? null,
    orderRevisionId: input.orderRevisionId ?? null,
    itemId: input.itemId ?? null,
    itemRevisionId: input.itemRevisionId ?? null,
    financialLedgerEntryId: input.financialLedgerEntryId ?? null,
    category: input.category,
    economicRole: input.economicRole,
    priceRelation: input.priceRelation,
    authorityClass: input.authorityClass,
    availability: input.availability,
    coverageState: input.coverageState,
    confidence: input.confidence,
    amountAtoms: amount?.amountAtoms ?? null,
    amountScale: amount?.amountScale ?? null,
    currencyCode: amount?.currencyCode ?? null,
    jurisdictionCode: input.jurisdictionCode ?? null,
    periodStart: input.periodStart ?? null,
    periodEnd: input.periodEnd ?? null,
    rawSourceRecordId: input.rawSourceRecordId ?? null,
    normalizationRunId: input.normalizationRunId ?? null,
    mappingVersionId: input.mappingVersionId ?? null,
    normalizationRevision: input.normalizationRevision ?? null,
    syncSliceEvidenceId: input.syncSliceEvidenceId ?? null,
    sourceLeafPath: input.sourceLeafPath ?? null,
    actorRef: input.actorRef ?? null,
    manualReasonCode: input.manualReasonCode ?? null,
  };
  const inputChecksum = canonicalChecksum(data);
  const old = await tx.normalizedTaxEvidence.findUnique({
    where: {
      accountId_channelConnectionId_evidenceKey_operationKey: {
        accountId: tenant.accountId,
        channelConnectionId: tenant.channelConnectionId,
        evidenceKey: input.evidenceKey,
        operationKey: input.operationKey,
      },
    },
  });
  if (old) {
    if (old.inputChecksum !== inputChecksum)
      throw new Error("Conflicting tax replay");
    return { ...old, replayed: true };
  }
  const latest = await tx.normalizedTaxEvidence.findFirst({
    where: {
      accountId: tenant.accountId,
      channelConnectionId: tenant.channelConnectionId,
      evidenceKey: input.evidenceKey,
    },
    orderBy: { revision: "desc" },
  });
  return {
    ...(await tx.normalizedTaxEvidence.create({
      data: {
        ...data,
        evidenceKey: input.evidenceKey,
        revision: (latest?.revision ?? 0) + 1,
        previousEvidenceId: latest?.id ?? null,
        operationKey: input.operationKey,
        inputChecksum,
      },
    })),
    replayed: false,
  };
}
export async function recordTaxInterpretationPolicyVersionTx(
  tx: Prisma.TransactionClient,
  tenant: VerifiedCoreTenant,
  input: {
    policyKey: string;
    operationKey: string;
    status?: "PRESENT" | "WITHDRAWN";
    rules: unknown;
    effectiveFrom: Date;
    effectiveTo?: Date | null;
    actorRef: string;
    reasonCode: string;
  },
) {
  const rulesJson = JSON.stringify(input.rules);
  const data = {
    accountId: tenant.accountId,
    policyKey: input.policyKey,
    status: input.status ?? "PRESENT",
    rulesJson,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo ?? null,
    actorRef: input.actorRef,
    reasonCode: input.reasonCode,
  };
  const inputChecksum = canonicalChecksum(data);
  const old = await tx.taxInterpretationPolicyVersion.findUnique({
    where: {
      accountId_policyKey_operationKey: {
        accountId: tenant.accountId,
        policyKey: input.policyKey,
        operationKey: input.operationKey,
      },
    },
  });
  if (old) {
    if (old.inputChecksum !== inputChecksum)
      throw new Error("Conflicting tax policy replay");
    return { ...old, replayed: true };
  }
  const latest = await tx.taxInterpretationPolicyVersion.findFirst({
    where: { accountId: tenant.accountId, policyKey: input.policyKey },
    orderBy: { revision: "desc" },
  });
  return {
    ...(await tx.taxInterpretationPolicyVersion.create({
      data: {
        ...data,
        revision: (latest?.revision ?? 0) + 1,
        previousPolicyVersionId: latest?.id ?? null,
        operationKey: input.operationKey,
        inputChecksum,
      },
    })),
    replayed: false,
  };
}
