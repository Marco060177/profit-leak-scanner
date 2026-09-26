import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { marketplaceScopeKey } from "./data-core-contracts";
import {
  financialMoney,
  type AuthorityClass,
  type CoverageFamily,
  type ProjectionKind,
  type Provenance,
  type VerifiedCoreTenant,
} from "./data-core-d2b-contracts";
export type Tx = Prisma.TransactionClient;

/** Hash canonical data, preserving BigInt as decimal text. Metadata integers are not money. */
export function canonicalChecksum(value: unknown): string {
  const canonical = (input: unknown): unknown => {
    if (typeof input === "bigint") return { bigint: input.toString() };
    if (input instanceof Date) {
      if (Number.isNaN(input.getTime()))
        throw new Error("Invalid D2B timestamp");
      return input.toISOString();
    }
    if (Array.isArray(input)) return input.map(canonical);
    if (input && typeof input === "object")
      return Object.fromEntries(
        Object.entries(input)
          .filter(([, v]) => v !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, canonical(v)]),
      );
    return input;
  };
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
export async function requireTenantTx(tx: Tx, tenant: VerifiedCoreTenant) {
  const channel = await tx.channelConnection.findUnique({
    where: { id: tenant.channelConnectionId },
    include: { account: true },
  });
  if (
    !channel ||
    channel.accountId !== tenant.accountId ||
    channel.status !== "ACTIVE" ||
    channel.account.status !== "ACTIVE"
  )
    throw new Error("D2B inactive or cross-tenant context");
}
export async function requireScopeTx(
  tx: Tx,
  tenant: VerifiedCoreTenant,
  id: string,
) {
  await requireTenantTx(tx, tenant);
  const scope = await tx.financialAuthorityScope.findUnique({ where: { id } });
  if (
    !scope ||
    scope.accountId !== tenant.accountId ||
    scope.channelConnectionId !== tenant.channelConnectionId
  )
    throw new Error("D2B scope ownership mismatch");
  return scope;
}
export type ScopeInput = Readonly<{
  marketplaceId: string | null;
  economicEventKey: string;
  coverageFamily: CoverageFamily;
  provisionalSourceAuthority: string;
  actualSourceAuthority: string;
  policyMappingVersionId: string;
  periodStart?: Date | null;
  periodEnd?: Date | null;
}>;
export async function createFinancialAuthorityScopeTx(
  tx: Tx,
  tenant: VerifiedCoreTenant,
  input: ScopeInput,
) {
  await requireTenantTx(tx, tenant);
  const data = {
    ...input,
    ...tenant,
    marketplaceScopeKey: marketplaceScopeKey(input.marketplaceId),
    periodStart: input.periodStart ?? null,
    periodEnd: input.periodEnd ?? null,
  };
  const existing = await tx.financialAuthorityScope.findUnique({
    where: {
      accountId_channelConnectionId_marketplaceScopeKey_economicEventKey_coverageFamily:
        {
          ...tenant,
          marketplaceScopeKey: data.marketplaceScopeKey,
          economicEventKey: input.economicEventKey,
          coverageFamily: input.coverageFamily,
        },
    },
  });
  if (existing) {
    for (const key of Object.keys(data) as (keyof typeof data)[])
      if (canonicalChecksum(existing[key]) !== canonicalChecksum(data[key]))
        throw new Error("D2B conflicting scope identity");
    return existing;
  }
  return tx.financialAuthorityScope.create({ data });
}
type BindingData = Provenance & {
  authorityScopeId: string;
  authorityClass: AuthorityClass;
  sourceAuthority: string;
  sourceSystem: string;
  sourceEventNamespace: string;
  sourceEventIdentity: string;
  sourceLeafPath: string;
  correlationRuleKey: string;
  operationKey: string;
};
export type BindingInput = BindingData & {
  expectedPreviousBindingId: string | null;
};
export async function recordFinancialAuthorityBindingTx(
  tx: Tx,
  tenant: VerifiedCoreTenant,
  input: BindingInput,
) {
  await requireScopeTx(tx, tenant, input.authorityScopeId);
  const { expectedPreviousBindingId, ...data } = input;
  const inputChecksum = canonicalChecksum(data);
  const identity = {
    channelConnectionId: tenant.channelConnectionId,
    sourceAuthority: input.sourceAuthority,
    sourceEventNamespace: input.sourceEventNamespace,
    sourceEventIdentity: input.sourceEventIdentity,
  };
  const existing = await tx.financialAuthorityBinding.findUnique({
    where: {
      channelConnectionId_sourceAuthority_sourceEventNamespace_sourceEventIdentity_operationKey:
        { ...identity, operationKey: input.operationKey },
    },
  });
  if (existing) {
    if (
      existing.accountId !== tenant.accountId ||
      existing.inputChecksum !== inputChecksum
    )
      throw new Error("D2B conflicting binding replay");
    return existing;
  }
  const previous = await tx.financialAuthorityBinding.findFirst({
    where: identity,
    orderBy: { revision: "desc" },
  });
  if ((previous?.id ?? null) !== expectedPreviousBindingId)
    throw new Error("D2B stale binding predecessor");
  return tx.financialAuthorityBinding.create({
    data: {
      ...data,
      ...tenant,
      previousBindingId: expectedPreviousBindingId,
      revision: (previous?.revision ?? 0) + 1,
      inputChecksum,
    },
  });
}
type LedgerData = Provenance & {
  authorityScopeId: string;
  authorityClass: AuthorityClass;
  bindingId: string;
  operationKey: string;
  state?: "PRESENT" | "WITHDRAWN";
  projectionKind: ProjectionKind;
  sourceSubtype: string;
  amountAtoms: bigint;
  amountScale: number;
  currencyCode: string;
  sourceAmountText: string;
  sourceSignConvention: string;
  signRuleKey: string;
  economicRole?: "ECONOMIC" | "INFORMATIONAL";
  informationalRuleKey?: string | null;
  sourceLeafPath: string;
  occurredAt?: Date | null;
  postedAt?: Date | null;
  effectiveAt: Date;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  orderId?: string | null;
  orderRevisionId?: string | null;
  itemId?: string | null;
  itemRevisionId?: string | null;
};
export type LedgerInput = LedgerData & {
  sourceAuthority: string;
  sourceComponentKey: string;
  expectedPreviousEntryId: string | null;
};
/** Caller must allow any error to abort its short transaction. No nested transactions or external I/O. */
export async function recordFinancialLedgerEntryTx(
  tx: Tx,
  tenant: VerifiedCoreTenant,
  input: LedgerInput,
) {
  const scope = await requireScopeTx(tx, tenant, input.authorityScopeId);
  financialMoney({
    amountAtoms: input.amountAtoms,
    amountScale: input.amountScale,
    currencyCode: input.currencyCode,
  });
  const {
    sourceAuthority,
    sourceComponentKey,
    expectedPreviousEntryId,
    ...rawData
  } = input;
  const data = {
    ...rawData,
    state: rawData.state ?? "PRESENT",
    economicRole: rawData.economicRole ?? "ECONOMIC",
    informationalRuleKey: rawData.informationalRuleKey ?? null,
    occurredAt: rawData.occurredAt ?? null,
    postedAt: rawData.postedAt ?? null,
    periodStart: rawData.periodStart ?? null,
    periodEnd: rawData.periodEnd ?? null,
    orderId: rawData.orderId ?? null,
    orderRevisionId: rawData.orderRevisionId ?? null,
    itemId: rawData.itemId ?? null,
    itemRevisionId: rawData.itemRevisionId ?? null,
  };
  const identity = {
    authorityScopeId: scope.id,
    authorityClass: input.authorityClass,
    sourceAuthority,
    sourceComponentKey,
  };
  const inputChecksum = canonicalChecksum({ ...data, ...identity });
  const head = await tx.financialComponentHead.upsert({
    where: {
      authorityScopeId_authorityClass_sourceAuthority_sourceComponentKey:
        identity,
    },
    create: { ...identity, ...tenant },
    update: {},
  });
  const existing = await tx.financialLedgerEntry.findUnique({
    where: {
      componentId_operationKey: {
        componentId: head.id,
        operationKey: input.operationKey,
      },
    },
  });
  if (existing) {
    if (existing.inputChecksum !== inputChecksum)
      throw new Error("D2B conflicting ledger replay");
    return { entry: existing, replay: true };
  }
  if (head.currentEntryId !== expectedPreviousEntryId)
    throw new Error("D2B stale component predecessor");
  const entry = await tx.financialLedgerEntry.create({
    data: {
      ...data,
      ...tenant,
      componentId: head.id,
      marketplaceScopeKey: scope.marketplaceScopeKey,
      economicEventKey: scope.economicEventKey,
      previousEntryId: expectedPreviousEntryId,
      revision: head.revision + 1,
      inputChecksum,
    },
  });
  return { entry, replay: false };
}
export type ScopeAuthority = {
  id: string;
  inputVersion: number;
  currentDecisionId: string | null;
  pId: string | null;
  aId: string | null;
  authorityState:
    | "NO_ACTUAL"
    | "ACTUAL_INCOMPLETE"
    | "ACTUAL_COMPLETE"
    | "ACTUAL_UNKNOWN";
  selectedClass: AuthorityClass | "BLOCKED";
};
export async function scopeAuthorityTx(
  tx: Tx,
  scopeId: string,
): Promise<ScopeAuthority> {
  const rows = await tx.$queryRaw<
    ScopeAuthority[]
  >`SELECT id,inputVersion,currentDecisionId,pId,aId,authorityState,selectedClass FROM FinancialScopeAuthority WHERE id=${scopeId}`;
  if (rows.length !== 1) throw new Error("D2B missing authority state");
  // Prisma raw SQLite integer results may be bigint. This is a version counter, never money.
  const inputVersion = Number(rows[0].inputVersion);
  if (!Number.isSafeInteger(inputVersion))
    throw new Error("D2B input version overflow");
  return { ...rows[0], inputVersion };
}
