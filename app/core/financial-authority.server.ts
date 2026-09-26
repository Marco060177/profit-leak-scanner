import type { Prisma } from "@prisma/client";
import type {
  AuthorityClass,
  CoverageState,
  Provenance,
  VerifiedCoreTenant,
} from "./data-core-d2b-contracts";
import {
  canonicalChecksum,
  requireScopeTx,
  scopeAuthorityTx,
  type Tx,
} from "./data-core-d2b.server";
export type EvidenceInput = {
  authorityScopeId: string;
  authorityClass: AuthorityClass;
  operationKey: string;
  expectedPreviousEvidenceId: string | null;
  mappingVersionId: string;
  coverageState: CoverageState;
  boundariesJson: string;
  sourceWatermark?: Date | null;
  closureSyncSliceEvidenceId?: string | null;
  closureLeafPath?: string | null;
  closureRuleKey?: string | null;
  reasonCode?: string | null;
  sources: readonly Provenance[];
  entryIds: readonly string[];
};
export async function recordFinancialAuthorityEvidenceTx(
  tx: Tx,
  tenant: VerifiedCoreTenant,
  input: EvidenceInput,
) {
  await requireScopeTx(tx, tenant, input.authorityScopeId);
  const { sources, entryIds, expectedPreviousEvidenceId, ...header } = input;
  if (
    new Set(sources.map((x) => x.syncSliceEvidenceId)).size !==
      sources.length ||
    new Set(entryIds).size !== entryIds.length
  )
    throw new Error("D2B duplicate manifest member/source");
  const data = {
    ...header,
    boundariesJson: JSON.stringify(JSON.parse(header.boundariesJson)),
    sourceWatermark: header.sourceWatermark ?? null,
    closureSyncSliceEvidenceId: header.closureSyncSliceEvidenceId ?? null,
    closureLeafPath: header.closureLeafPath ?? null,
    closureRuleKey: header.closureRuleKey ?? null,
    reasonCode: header.reasonCode ?? null,
  };
  const inputChecksum = canonicalChecksum({
    ...data,
    sources: [...sources].sort((a, b) =>
      a.syncSliceEvidenceId.localeCompare(b.syncSliceEvidenceId),
    ),
    entryIds: [...entryIds].sort(),
  });
  const existing = await tx.financialAuthorityEvidence.findUnique({
    where: {
      authorityScopeId_authorityClass_operationKey: {
        authorityScopeId: input.authorityScopeId,
        authorityClass: input.authorityClass,
        operationKey: input.operationKey,
      },
    },
  });
  if (existing) {
    if (
      existing.inputChecksum !== inputChecksum ||
      existing.status !== "SEALED"
    )
      throw new Error("D2B conflicting or unfinished evidence replay");
    return existing;
  }
  const previous = await tx.financialAuthorityEvidence.findFirst({
    where: {
      authorityScopeId: input.authorityScopeId,
      authorityClass: input.authorityClass,
    },
    orderBy: { revision: "desc" },
  });
  if ((previous?.id ?? null) !== expectedPreviousEvidenceId)
    throw new Error("D2B stale evidence predecessor");
  const evidence = await tx.financialAuthorityEvidence.create({
    data: {
      ...data,
      ...tenant,
      inputChecksum,
      revision: (previous?.revision ?? 0) + 1,
      previousEvidenceId: expectedPreviousEvidenceId,
      expectedSourceCount: sources.length,
      expectedMemberCount: entryIds.length,
    },
  });
  for (const source of sources)
    await tx.financialAuthorityEvidenceSource.create({
      data: { ...source, ...tenant, evidenceId: evidence.id },
    });
  for (const entryId of entryIds) {
    const entry = await tx.financialLedgerEntry.findUniqueOrThrow({
      where: { id: entryId },
    });
    await tx.financialAuthorityEvidenceMember.create({
      data: {
        ...tenant,
        evidenceId: evidence.id,
        componentId: entry.componentId,
        entryId,
      },
    });
  }
  return tx.financialAuthorityEvidence.update({
    where: { id: evidence.id },
    data: { status: "SEALED" },
  });
}
export type PublishInput = {
  authorityScopeId: string;
  operationKey: string;
  expectedPreviousDecisionId: string | null;
  expectedInputVersion: number;
};
/** Immutable draft + selection become published in this caller-owned transaction. */
export async function publishFinancialAuthorityDecisionTx(
  tx: Tx,
  tenant: VerifiedCoreTenant,
  input: PublishInput,
) {
  const scope = await requireScopeTx(tx, tenant, input.authorityScopeId);
  const existing = await tx.financialAuthorityDecision.findUnique({
    where: {
      authorityScopeId_operationKey: {
        authorityScopeId: scope.id,
        operationKey: input.operationKey,
      },
    },
  });
  const inputChecksum = canonicalChecksum(input);
  if (existing) {
    if (
      existing.inputChecksum !== inputChecksum ||
      existing.status !== "PUBLISHED"
    )
      throw new Error("D2B conflicting decision replay");
    return existing;
  }
  const state = await scopeAuthorityTx(tx, scope.id);
  if (
    state.currentDecisionId !== input.expectedPreviousDecisionId ||
    state.inputVersion !== input.expectedInputVersion
  )
    throw new Error("D2B stale authority CAS");
  const prior = scope.currentDecisionId
    ? await tx.financialAuthorityDecision.findUniqueOrThrow({
        where: { id: scope.currentDecisionId },
      })
    : null;
  const decision = await tx.financialAuthorityDecision.create({
    data: {
      ...tenant,
      authorityScopeId: scope.id,
      revision: (prior?.revision ?? 0) + 1,
      previousDecisionId: input.expectedPreviousDecisionId,
      inputVersion: input.expectedInputVersion,
      operationKey: input.operationKey,
      inputChecksum,
      mappingVersionId: scope.policyMappingVersionId,
      provisionalEvidenceId: state.pId,
      actualEvidenceId: state.aId,
      authorityState: state.authorityState,
      selectedClass: state.selectedClass,
      reasonCode:
        state.selectedClass === "BLOCKED"
          ? "UNKNOWN_OR_NO_COMPLETE_REPRESENTATION"
          : state.authorityState,
    },
  });
  const heads = await tx.financialComponentHead.findMany({
    where: { authorityScopeId: scope.id },
    include: { current: true },
  });
  for (const head of heads) {
    if (!head.current) throw new Error("D2B head without revision");
    const role =
      head.current.state === "WITHDRAWN"
        ? "WITHDRAWN"
        : head.current.economicRole === "INFORMATIONAL"
          ? "INFORMATIONAL"
          : head.authorityClass === decision.selectedClass
            ? "SELECTED"
            : "SUPPRESSED";
    await tx.financialComponentSelection.create({
      data: {
        ...tenant,
        decisionId: decision.id,
        componentId: head.id,
        entryId: head.current.id,
        role,
      },
    });
  }
  return tx.financialAuthorityDecision.update({
    where: { id: decision.id },
    data: { status: "PUBLISHED" },
  });
}
export type DecisionWithSelection =
  Prisma.FinancialAuthorityDecisionGetPayload<{
    include: { FinancialComponentSelection_decision: true };
  }>;
