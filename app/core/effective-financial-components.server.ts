import type { FinancialLedgerEntry } from "@prisma/client";
import type { VerifiedCoreTenant } from "./data-core-d2b-contracts";
import { requireTenantTx, type Tx } from "./data-core-d2b.server";
export type EffectiveFilter = {
  marketplaceId?: string | null;
  orderId?: string;
  effectiveWindow?: { start: Date; end: Date };
};
type ScopeDecision = {
  scopeId: string;
  decisionId: string;
  authorityState: string;
  selectedClass: string;
};
export type EffectiveFinancialResult =
  | {
      status: "READY";
      components: FinancialLedgerEntry[];
      scopeDecisions: ScopeDecision[];
      provisionalScopes: string[];
      completeness: "COMPLETE_FOR_SCOPE" | "PROVISIONAL" | "NO_OBSERVATIONS";
      reconciliation: "NOT_EVALUATED";
    }
  | {
      status: "BLOCKED";
      blockedScopes: string[];
      reasonCodes: string[];
      diagnosticComponents: FinancialLedgerEntry[];
    };
/** Only supported future economic read path. Does not sum, convert currencies, or imply reconciliation. */
export async function getEffectiveFinancialComponentsTx(
  tx: Tx,
  tenant: VerifiedCoreTenant,
  filter: EffectiveFilter = {},
): Promise<EffectiveFinancialResult> {
  await requireTenantTx(tx, tenant);
  const window = filter.effectiveWindow;
  if (
    window &&
    (!Number.isFinite(window.start.getTime()) ||
      !Number.isFinite(window.end.getTime()) ||
      window.start >= window.end)
  )
    throw new Error("D2B invalid effective window");
  if (filter.orderId) {
    const order = await tx.normalizedOrder.findUnique({
      where: { id: filter.orderId },
    });
    if (
      !order ||
      order.accountId !== tenant.accountId ||
      order.channelConnectionId !== tenant.channelConnectionId
    )
      throw new Error("D2B order ownership mismatch");
  }
  const scopes = await tx.financialAuthorityScope.findMany({
    where: tenant,
    include: {
      FinancialComponentHead_scope: { include: { current: true } },
      decision: {
        include: {
          FinancialComponentSelection_decision: { include: { entry: true } },
        },
      },
    },
  });
  const blockedScopes: string[] = [],
    reasonCodes: string[] = [],
    diagnosticComponents: FinancialLedgerEntry[] = [],
    components: FinancialLedgerEntry[] = [];
  const scopeDecisions: ScopeDecision[] = [];
  for (const scope of scopes) {
    const heads = scope.FinancialComponentHead_scope,
      current = heads.flatMap((h) => (h.current ? [h.current] : []));
    const unresolved = scope.coverageFamily === "UNRESOLVED_EVENT";
    const resolution = unresolved
      ? await tx.$queryRaw<
          { resolved: bigint | number }[]
        >`SELECT resolved FROM FinancialScopeResolution WHERE id=${scope.id}`
      : [];
    const unresolvedBlocker = unresolved && !resolution[0]?.resolved;
    // Unresolved uncertainty has its own perimeter: NULL marketplace means unknown,
    // not an ordinary @none scope. An order filter cannot narrow this perimeter.
    if (unresolved) {
      if (scope.periodStart && scope.periodEnd) {
        if (
          scope.marketplaceId !== null &&
          filter.marketplaceId !== undefined &&
          scope.marketplaceId !== filter.marketplaceId
        )
          continue;
        if (
          window &&
          !(scope.periodStart < window.end && scope.periodEnd > window.start)
        )
          continue;
      }
      // Without a reliable period, preserve the channel-wide blocker.
    } else {
      if (
        filter.marketplaceId !== undefined &&
        scope.marketplaceId !== filter.marketplaceId
      )
        continue;
      if (filter.orderId && !current.some((e) => e.orderId === filter.orderId))
        continue;
      if (window) {
        const overlapsPeriod =
          scope.periodStart &&
          scope.periodEnd &&
          scope.periodStart < window.end &&
          scope.periodEnd > window.start;
        const overlapsEntries = current.some(
          (e) => e.effectiveAt >= window.start && e.effectiveAt < window.end,
        );
        // Empty unbounded scopes stay visible.
        if (current.length > 0 && !overlapsPeriod && !overlapsEntries) continue;
      }
    }
    const d = scope.decision;
    const validity = d
      ? await tx.$queryRaw<
          { valid: bigint | number }[]
        >`SELECT valid FROM FinancialDecisionValidity WHERE id=${d.id}`
      : [];
    // FinancialDecisionValidity dynamically proves every referenced manifest valid,
    // including the suppressed representation; epoch equality alone is insufficient.
    const selections = d?.FinancialComponentSelection_decision ?? [];
    const inventoryValid =
      selections.length === heads.length &&
      heads.every((h) =>
        selections.some(
          (x) => x.componentId === h.id && x.entryId === h.currentEntryId,
        ),
      );
    const rolesValid =
      d &&
      selections.every(
        (x) =>
          x.role ===
          (x.entry.state === "WITHDRAWN"
            ? "WITHDRAWN"
            : x.entry.economicRole === "INFORMATIONAL"
              ? "INFORMATIONAL"
              : x.entry.authorityClass === d.selectedClass
                ? "SELECTED"
                : "SUPPRESSED"),
      );
    if (
      unresolvedBlocker ||
      !d ||
      d.status !== "PUBLISHED" ||
      d.inputVersion !== scope.inputVersion ||
      !inventoryValid ||
      !rolesValid ||
      !validity.length ||
      !validity[0].valid ||
      d.selectedClass === "BLOCKED"
    ) {
      blockedScopes.push(scope.id);
      reasonCodes.push(
        unresolvedBlocker
          ? "UNRESOLVED_ECONOMIC_EVENT"
          : !d ||
              d.inputVersion !== scope.inputVersion ||
              !inventoryValid ||
              !rolesValid ||
              !validity[0]?.valid
            ? "MISSING_OR_STALE_DECISION"
            : d.reasonCode,
      );
      diagnosticComponents.push(...current);
      continue;
    }
    scopeDecisions.push({
      scopeId: scope.id,
      decisionId: d.id,
      authorityState: d.authorityState,
      selectedClass: d.selectedClass,
    });
    for (const x of selections)
      if (
        x.role === "SELECTED" &&
        (!window ||
          (x.entry.effectiveAt >= window.start &&
            x.entry.effectiveAt < window.end))
      )
        components.push(x.entry);
  }
  if (blockedScopes.length)
    return {
      status: "BLOCKED",
      blockedScopes,
      reasonCodes: [...new Set(reasonCodes)],
      diagnosticComponents,
    };
  const provisionalScopes = scopeDecisions
    .filter((s) => s.selectedClass === "PROVISIONAL")
    .map((s) => s.scopeId);
  return {
    status: "READY",
    components,
    scopeDecisions,
    provisionalScopes,
    completeness: !scopeDecisions.length
      ? "NO_OBSERVATIONS"
      : provisionalScopes.length
        ? "PROVISIONAL"
        : "COMPLETE_FOR_SCOPE",
    reconciliation: "NOT_EVALUATED",
  };
}
