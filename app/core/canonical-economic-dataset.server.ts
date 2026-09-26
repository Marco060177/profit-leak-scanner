import type {
  InventoryEconomicEvent,
  InventoryEconomicLot,
  NormalizedTaxEvidence,
  Prisma,
  ReplacementLink,
} from "@prisma/client";
import { canonicalEconomicFingerprint } from "./canonical-economic-fingerprint";
import {
  DATA_CORE_D2D_CONTRACT_VERSION,
  type CanonicalEconomicDatasetBlocked,
  type CanonicalEconomicDatasetReady,
  type CanonicalEconomicDatasetRequest,
} from "./data-core-d2d-contracts";
import { getEffectiveFinancialComponentsTx } from "./effective-financial-components.server";
import { getEffectiveCostInventoryTaxTx } from "./effective-cost-inventory-tax.server";

type RefRow = { id: string; marketplaceId?: string | null; orderId?: string | null; itemId?: string | null; periodStart?: Date | null; periodEnd?: Date | null };
const inWindow = (at: Date, request: CanonicalEconomicDatasetRequest) =>
  at >= request.economicWindow.startInclusive && at < request.economicWindow.endExclusive;
const scopeMatches = (marketplaceId: string | null, orderId: string | null, itemId: string | null, request: CanonicalEconomicDatasetRequest) => {
  const scope = request.scope;
  if (scope.kind === "MARKETPLACE") return marketplaceId === scope.marketplaceId;
  if (scope.kind === "ORDER") return orderId === scope.orderId;
  if (scope.kind === "ORDER_ITEM") return orderId === scope.orderId && itemId === scope.itemId;
  return true;
};
function diagnosticApplicable(value: unknown, request: CanonicalEconomicDatasetRequest) {
  if (!value || typeof value !== "object") return true;
  const row = value as RefRow;
  if (request.scope.kind === "MARKETPLACE" && row.marketplaceId != null && row.marketplaceId !== request.scope.marketplaceId) return false;
  if ((request.scope.kind === "ORDER" || request.scope.kind === "ORDER_ITEM") && row.orderId != null && row.orderId !== request.scope.orderId) return false;
  if (request.scope.kind === "ORDER_ITEM" && row.itemId != null && row.itemId !== request.scope.itemId) return false;
  if (row.periodStart && row.periodEnd && !(row.periodStart < request.economicWindow.endExclusive && row.periodEnd > request.economicWindow.startInclusive)) return false;
  return true;
}
const refs = (kind: string, rows: readonly unknown[]) => rows.flatMap((row) => {
  const id = row && typeof row === "object" && "id" in row ? String((row as { id: unknown }).id) : "unknown";
  return [{ kind, id }];
});

async function semanticRequestedScope(tx: Prisma.TransactionClient, request: CanonicalEconomicDatasetRequest) {
  const channel = await tx.channelConnection.findUnique({ where: { id: request.tenant.channelConnectionId }, select: { channel: true, externalAccountId: true } });
  const base = { channel: channel?.channel ?? "UNKNOWN", externalAccountId: channel?.externalAccountId ?? "UNKNOWN" };
  if (request.scope.kind === "CHANNEL") return { kind: "CHANNEL", ...base };
  if (request.scope.kind === "MARKETPLACE") {
    const marketplace = await tx.marketplace.findUnique({ where: { id: request.scope.marketplaceId }, select: { externalMarketplaceId: true } });
    return { kind: "MARKETPLACE", ...base, externalMarketplaceId: marketplace?.externalMarketplaceId ?? "UNKNOWN" };
  }
  const order = await tx.normalizedOrder.findUnique({ where: { id: request.scope.orderId }, select: { sourceSystem: true, sourceOrderKey: true } });
  if (request.scope.kind === "ORDER") return { kind: "ORDER", ...base, sourceSystem: order?.sourceSystem ?? "UNKNOWN", sourceOrderKey: order?.sourceOrderKey ?? "UNKNOWN" };
  const item = await tx.normalizedOrderItem.findUnique({ where: { id: request.scope.itemId }, select: { sourceItemKey: true } });
  return { kind: "ORDER_ITEM", ...base, sourceSystem: order?.sourceSystem ?? "UNKNOWN", sourceOrderKey: order?.sourceOrderKey ?? "UNKNOWN", sourceItemKey: item?.sourceItemKey ?? "UNKNOWN" };
}
async function blocked(tx: Prisma.TransactionClient, request: CanonicalEconomicDatasetRequest, blockedScopes: readonly string[], reasonCodes: readonly string[], diagnosticReferences: Array<{kind:string; id:string}>): Promise<CanonicalEconomicDatasetBlocked> {
  const body = {
    status: "BLOCKED" as const, contractVersion: DATA_CORE_D2D_CONTRACT_VERSION,
    requestedScope: request.scope, blockedScopes: [...new Set(blockedScopes)].sort(),
    reasonCodes: [...new Set(reasonCodes)].sort(), completeness: "BLOCKED" as const,
    diagnosticReferences: diagnosticReferences.sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)),
  };
  const policy = await tx.currencyPolicyVersion.findUnique({ where: { id: request.currencyPolicyVersionId }, select: { version: true, checksum: true } });
  return { ...body, fingerprint: canonicalEconomicFingerprint({ status: body.status, contractVersion: body.contractVersion,
    requestedScope: await semanticRequestedScope(tx, request), economicWindow: request.economicWindow,
    reasonCodes: body.reasonCodes, blockedScopeCount: body.blockedScopes.length,
    diagnosticKinds: body.diagnosticReferences.map((x) => x.kind), currencyPolicy: policy }) };
}

/** Caller owns the transaction. This function performs no network I/O and persists no dataset. */
export async function getCanonicalEconomicDatasetTx(
  tx: Prisma.TransactionClient,
  request: CanonicalEconomicDatasetRequest,
): Promise<CanonicalEconomicDatasetReady | CanonicalEconomicDatasetBlocked> {
  const { tenant } = request;
  const start = request.economicWindow.startInclusive, end = request.economicWindow.endExclusive;
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end)
    return blocked(tx, request, [tenant.channelConnectionId], ["INVALID_ECONOMIC_WINDOW"], []);
  const channel = await tx.channelConnection.findUnique({ where: { id: tenant.channelConnectionId }, include: { account: true } });
  if (!channel || channel.accountId !== tenant.accountId || channel.status !== "ACTIVE" || channel.account.status !== "ACTIVE")
    return blocked(tx, request, [tenant.channelConnectionId], ["TENANT_OR_CHANNEL_INVALID"], []);
  let marketplaceId: string | undefined;
  let orderId: string | undefined;
  let itemId: string | undefined;
  if (request.scope.kind === "MARKETPLACE") marketplaceId = request.scope.marketplaceId;
  if (request.scope.kind === "ORDER" || request.scope.kind === "ORDER_ITEM") orderId = request.scope.orderId;
  if (request.scope.kind === "ORDER_ITEM") itemId = request.scope.itemId;
  if (marketplaceId) {
    const market = await tx.marketplace.findUnique({ where: { id: marketplaceId } });
    if (!market || market.accountId !== tenant.accountId || market.channelConnectionId !== tenant.channelConnectionId)
      return blocked(tx, request, [marketplaceId], ["SCOPE_OWNERSHIP_MISMATCH"], []);
  }
  const scopedOrder = orderId ? await tx.normalizedOrder.findUnique({ where: { id: orderId } }) : null;
  if (orderId && (!scopedOrder || scopedOrder.accountId !== tenant.accountId || scopedOrder.channelConnectionId !== tenant.channelConnectionId))
    return blocked(tx, request, [orderId], ["SCOPE_OWNERSHIP_MISMATCH"], []);
  if (itemId) {
    const item = await tx.normalizedOrderItem.findUnique({ where: { id: itemId } });
    if (!item || item.accountId !== tenant.accountId || item.channelConnectionId !== tenant.channelConnectionId || item.orderId !== orderId)
      return blocked(tx, request, [itemId], ["SCOPE_OWNERSHIP_MISMATCH"], []);
  }
  const policy = await tx.currencyPolicyVersion.findUnique({ where: { id: request.currencyPolicyVersionId } });
  const activePolicyCount = await tx.currencyPolicyVersion.count({ where: { activatedAt: { not: null }, deactivatedAt: null } });
  if (!policy || activePolicyCount !== 1 || policy.activatedAt === null || policy.deactivatedAt !== null ||
      !["REJECT", "HALF_UP", "HALF_EVEN"].includes(policy.roundingMode) || !["REJECT", "SEPARATE"].includes(policy.residualPolicy) ||
      policy.toleranceAtoms < 0n || policy.toleranceScale < 0 || policy.toleranceScale > 12)
    return blocked(tx, request, [request.currencyPolicyVersionId], ["INVALID_CURRENCY_POLICY"], policy ? refs("CURRENCY_POLICY", [policy]) : []);

  const financial = await getEffectiveFinancialComponentsTx(tx, tenant, {
    ...(marketplaceId ? { marketplaceId } : {}), ...(orderId ? { orderId } : {}), effectiveWindow: { start, end },
  });
  if (financial.status === "BLOCKED")
    return blocked(tx, request, financial.blockedScopes, financial.reasonCodes, refs("FINANCIAL_COMPONENT", financial.diagnosticComponents));

  // Ask D2C for the full channel first. Only diagnostics that prove irrelevance may be discarded.
  let d2c = await getEffectiveCostInventoryTaxTx(tx, tenant);
  if (d2c.status === "BLOCKED") {
    const applicable = d2c.diagnostics.filter((x) => diagnosticApplicable(x, request));
    if (applicable.length)
      return blocked(tx, request, [tenant.channelConnectionId], d2c.reasons, refs("D2C_EVIDENCE", applicable));
    d2c = await getEffectiveCostInventoryTaxTx(tx, tenant, { ...(marketplaceId ? { marketplaceId } : {}), periodStart: start, periodEnd: end });
    if (d2c.status === "BLOCKED")
      return blocked(tx, request, [tenant.channelConnectionId], d2c.reasons, refs("D2C_EVIDENCE", d2c.diagnostics));
  }
  const allLots = d2c.lots as InventoryEconomicLot[];
  const allEvents = d2c.events as InventoryEconomicEvent[];
  const scopeLots = allLots.filter((lot) => scopeMatches(lot.marketplaceId, lot.orderId, lot.itemId, request));
  const lots = scopeLots.filter((lot) => inWindow(lot.recognitionEconomicAt, request));
  const resolvedCostEvents = new Map<string, InventoryEconomicEvent>();
  for (const event of allEvents.filter((x) => x.eventType === "COST_BASIS_RESOLVED" || x.eventType === "COST_CORRECTION")
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime() || a.id.localeCompare(b.id)))
    resolvedCostEvents.set(event.lotId, event);
  const cogs = lots.flatMap((lot) => {
    const resolution = resolvedCostEvents.get(lot.id);
    const unitCostAtoms = lot.unitCostAtoms ?? resolution?.unitCostAtoms;
    const unitCostScale = lot.unitCostScale ?? resolution?.unitCostScale;
    const currencyCode = lot.currencyCode ?? resolution?.currencyCode;
    const costRecordRevisionId = lot.costRecordRevisionId ?? resolution?.costRecordRevisionId;
    if (unitCostAtoms == null || unitCostScale == null || currencyCode == null || costRecordRevisionId == null) return [];
    return [{ lotId: lot.id, orderId: lot.orderId, itemId: lot.itemId, skuId: lot.skuId, originKind: lot.originKind,
      quantityAtoms: lot.quantityAtoms, quantityScale: lot.quantityScale, unitCostAtoms, unitCostScale, currencyCode,
      recognitionEconomicAt: lot.recognitionEconomicAt, costRecordRevisionId,
      costEvidenceEventId: lot.costStatus === "KNOWN" ? null : resolution?.id ?? null, inputChecksum: lot.inputChecksum }];
  });
  if (cogs.length !== lots.length) {
    const canonicalIds = new Set(cogs.map((x) => x.lotId));
    const unresolvedLots = lots.filter((x) => !canonicalIds.has(x.id));
    return blocked(tx, request, unresolvedLots.map((x) => x.id), ["UNKNOWN_COST"], refs("INVENTORY_LOT", unresolvedLots));
  }
  const lotIds = new Set(scopeLots.map((lot) => lot.id));
  const events = allEvents.filter((event) => lotIds.has(event.lotId) && inWindow(event.economicAt, request));
  const components = financial.components.filter((entry) => !itemId || entry.itemId === itemId);
  const selectedEntryIds = new Set(components.map((entry) => entry.id));
  const reimbursementEvents = events.filter((x) => x.eventType === "REIMBURSEMENT_LINKED" || x.eventType === "COMPENSATION");
  const reimbursementEntryId = (event: InventoryEconomicEvent) => event.financialLedgerEntryId ??
    (event.compensatesEventId ? allEvents.find((candidate) => candidate.id === event.compensatesEventId)?.financialLedgerEntryId : null);
  const invalidReimbursements = reimbursementEvents.filter((event) => {
    const entryId = reimbursementEntryId(event);
    return entryId == null || !selectedEntryIds.has(entryId);
  });
  if (invalidReimbursements.length)
    return blocked(tx, request, invalidReimbursements.map((x) => x.lotId), ["CONTRADICTORY_CANONICAL_REFERENCE"], refs("INVENTORY_EVENT", invalidReimbursements));

  const taxEvidence = (d2c.taxEvidence as NormalizedTaxEvidence[]).filter((tax) => {
    if (!scopeMatches(tax.marketplaceId, tax.orderId, tax.itemId, request)) return false;
    if (tax.periodStart && tax.periodEnd) return tax.periodStart < end && tax.periodEnd > start;
    return tax.financialLedgerEntryId ? selectedEntryIds.has(tax.financialLedgerEntryId) : true;
  });
  const invalidTaxRefs = taxEvidence.filter((tax) => tax.financialLedgerEntryId && !selectedEntryIds.has(tax.financialLedgerEntryId));
  if (invalidTaxRefs.length)
    return blocked(tx, request, invalidTaxRefs.map((x) => x.id), ["CONTRADICTORY_CANONICAL_REFERENCE"], refs("TAX_EVIDENCE", invalidTaxRefs));

  const replacementCandidates = await tx.replacementLink.findMany({ where: tenant, orderBy: [{ linkKey: "asc" }, { revision: "desc" }] });
  const latest = new Map<string, ReplacementLink>();
  for (const link of replacementCandidates) if (!latest.has(link.linkKey)) latest.set(link.linkKey, link);
  const replacementItemIds = [...latest.values()].flatMap((link) => [link.predecessorItemId, link.replacementItemId]);
  const replacementScopeItems = await tx.normalizedOrderItem.findMany({
    where: { ...tenant, id: { in: replacementItemIds } },
    select: { id: true, orderId: true, order: { select: { marketplaceId: true } } },
  });
  const replacementScopeItemById = new Map(replacementScopeItems.map((item) => [item.id, item]));
  const replacementInScope = (link: ReplacementLink) => {
    if (request.scope.kind === "CHANNEL") return true;
    const predecessor = replacementScopeItemById.get(link.predecessorItemId);
    const replacement = replacementScopeItemById.get(link.replacementItemId);
    if (request.scope.kind === "MARKETPLACE")
      return predecessor?.order.marketplaceId === request.scope.marketplaceId || replacement?.order.marketplaceId === request.scope.marketplaceId;
    if (request.scope.kind === "ORDER")
      return predecessor?.orderId === request.scope.orderId || replacement?.orderId === request.scope.orderId;
    return link.predecessorItemId === request.scope.itemId || link.replacementItemId === request.scope.itemId;
  };
  const replacements = [...latest.values()].filter((link) => link.status === "PRESENT" && replacementInScope(link));
  // Validation follows the linked replacement item across an order boundary, while
  // `components` remains the consumable result for the caller's requested scope.
  const validationComponents = new Map(financial.components.map((entry) => [entry.id, entry]));
  if (request.scope.kind !== "CHANNEL") {
    const validationOrderIds = [...new Set(replacements.flatMap((link) => {
      const replacement = replacementScopeItemById.get(link.replacementItemId);
      return replacement ? [replacement.orderId] : [];
    }))];
    for (const validationOrderId of validationOrderIds) {
      const validationFinancial = await getEffectiveFinancialComponentsTx(tx, tenant, {
        orderId: validationOrderId, effectiveWindow: { start, end },
      });
      if (validationFinancial.status === "BLOCKED")
        return blocked(tx, request, validationFinancial.blockedScopes, validationFinancial.reasonCodes,
          refs("FINANCIAL_COMPONENT", validationFinancial.diagnosticComponents));
      for (const entry of validationFinancial.components) validationComponents.set(entry.id, entry);
    }
  }
  const replacementRevenue = new Set([...validationComponents.values()]
    .filter((entry) => entry.projectionKind === "PRODUCT_REVENUE" && entry.itemId !== null)
    .map((entry) => entry.itemId));
  const contradictoryReplacements = replacements.filter((link) => {
    const hasRevenue = replacementRevenue.has(link.replacementItemId);
    if (link.replacementKind === "FREE" || link.financialTreatment === "NO_REVENUE") return hasRevenue;
    if (link.replacementKind === "CHARGED" && link.financialTreatment === "D2B_COMPONENT") return !hasRevenue;
    return false;
  });
  if (contradictoryReplacements.length)
    return blocked(tx, request, contradictoryReplacements.map((link) => link.linkKey),
      ["REPLACEMENT_REVENUE_CONTRADICTION"], refs("REPLACEMENT_LINK", contradictoryReplacements));

  const ordersRaw = await tx.normalizedOrder.findMany({
    where: { ...tenant, ...(marketplaceId ? { marketplaceId } : {}), ...(orderId ? { id: orderId } : {}) },
    include: { revisions: { orderBy: { revision: "desc" }, take: 1 }, items: { ...(itemId ? { where: { id: itemId } } : {}), include: { revisions: { orderBy: { revision: "desc" }, take: 1 } } } },
  });
  const referencedOrderIds = new Set([...components.flatMap((x) => x.orderId ? [x.orderId] : []), ...scopeLots.flatMap((x) => x.orderId ? [x.orderId] : [])]);
  const orders = ordersRaw.flatMap((order) => order.revisions.flatMap((revision) => {
    const economicAt = revision.occurredAt ?? revision.postedAt;
    if ((!economicAt || !inWindow(economicAt, request)) && !referencedOrderIds.has(order.id) && order.id !== orderId) return [];
    return [{ id: order.id, marketplaceId: order.marketplaceId, revisionId: revision.id, revision: revision.revision, inputChecksum: revision.inputChecksum, mappingVersionId: revision.mappingVersionId, occurredAt: revision.occurredAt, postedAt: revision.postedAt }];
  }));
  const orderIds = new Set(orders.map((x) => x.id));
  const items = ordersRaw.flatMap((order) => orderIds.has(order.id) ? order.items.flatMap((item) => item.revisions.map((revision) => ({
    id: item.id, orderId: order.id, revisionId: revision.id, revision: revision.revision, inputChecksum: revision.inputChecksum,
    mappingVersionId: revision.mappingVersionId, skuId: revision.skuId, quantityAtoms: revision.quantityAtoms, quantityScale: revision.quantityScale,
  }))) : []);
  const badRefs = [
    ...components.filter((entry) => entry.orderId && !orders.some((order) => order.id === entry.orderId)),
    ...lots.filter((lot) => lot.orderId && !orders.some((order) => order.id === lot.orderId)),
  ];
  if (badRefs.length) return blocked(tx, request, [tenant.channelConnectionId], ["CONTRADICTORY_CANONICAL_REFERENCE"], refs("CROSS_LAYER_REFERENCE", badRefs));

  const currencies = new Set<string>();
  for (const row of components) if (row.currencyCode) currencies.add(row.currencyCode);
  for (const row of cogs) currencies.add(row.currencyCode);
  for (const row of events) if (row.currencyCode) currencies.add(row.currencyCode);
  for (const row of taxEvidence) if (row.currencyCode) currencies.add(row.currencyCode);
  if (currencies.size > 1) return blocked(tx, request, [tenant.channelConnectionId], ["MIXED_CURRENCY_WITHOUT_FX"], []);
  const mappingIds = [...new Set([...orders.map((x) => x.mappingVersionId), ...items.map((x) => x.mappingVersionId), ...components.map((x) => x.mappingVersionId), ...lots.flatMap((x) => x.mappingVersionId ? [x.mappingVersionId] : [])])];
  const mappings = await tx.mappingVersion.findMany({ where: { id: { in: mappingIds } }, select: { id: true, platform: true, sourceContract: true, sourceVersion: true, mapperSemanticVersion: true, formulaCompatibilityVersion: true, checksum: true } });
  const taxPolicies = await tx.taxInterpretationPolicyVersion.findMany({ where: { accountId: tenant.accountId, status: "PRESENT", effectiveFrom: { lt: end }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: start } }] }, select: { policyKey: true, revision: true, status: true, rulesJson: true, effectiveFrom: true, effectiveTo: true } });
  const evidenceManifest = { mappings, financialScopeDecisions: financial.scopeDecisions,
    lots: cogs.map((x) => ({ id: x.lotId, inputChecksum: x.inputChecksum, costRecordRevisionId: x.costRecordRevisionId, costEvidenceEventId: x.costEvidenceEventId })),
    events: [...events, ...lots.flatMap((x) => { const resolution = resolvedCostEvents.get(x.id); return resolution && !events.some((event) => event.id === resolution.id) ? [resolution] : []; })]
      .map((x) => ({ id: x.id, inputChecksum: x.inputChecksum })), taxPolicies };
  const monetaryInventoryEventTypes = new Set(["RESTOCKED_SELLABLE", "LOST", "DAMAGED", "DISPOSED", "LIQUIDATED"]);
  const canonicalInventoryEvents = events.filter((x) => !reimbursementEvents.includes(x)).map((x) => ({
    id: x.id, lotId: x.lotId, eventType: x.eventType, effectClass: x.effectClass, quantityAtoms: x.quantityAtoms,
    quantityScale: x.quantityScale, economicAt: x.economicAt, inputChecksum: x.inputChecksum,
    monetaryEffect: monetaryInventoryEventTypes.has(x.eventType) && x.unitCostAtoms != null && x.unitCostScale != null && x.currencyCode != null
      ? { unitCostAtoms: x.unitCostAtoms, unitCostScale: x.unitCostScale, currencyCode: x.currencyCode } : null,
  }));
  const body = {
    status: "READY" as const, contractVersion: DATA_CORE_D2D_CONTRACT_VERSION, requestedScope: request.scope,
    economicWindow: request.economicWindow, currency: { mode: currencies.size ? "SINGLE_CURRENCY" as const : "NO_MONETARY_OBSERVATIONS" as const, currencyCode: [...currencies][0] ?? null },
    currencyPolicy: { id: policy.id, version: policy.version, checksum: policy.checksum }, commerce: { orders, items },
    financialComponents: components, cogs, inventoryEvents: canonicalInventoryEvents,
    reimbursementLinks: reimbursementEvents.map((x) => ({ eventId: x.id, lotId: x.lotId,
      financialLedgerEntryId: reimbursementEntryId(x)!, eventType: x.eventType, quantityAtoms: x.quantityAtoms,
      quantityScale: x.quantityScale, economicAt: x.economicAt, inputChecksum: x.inputChecksum })),
    replacements, taxEvidence: taxEvidence.map((x) => ({ id: x.id, category: x.category, economicRole: x.economicRole,
      priceRelation: x.priceRelation, authorityClass: x.authorityClass, availability: x.availability,
      coverageState: x.coverageState, confidence: x.confidence, jurisdictionCode: x.jurisdictionCode,
      periodStart: x.periodStart, periodEnd: x.periodEnd, monetaryAuthorityEntryId: x.financialLedgerEntryId, inputChecksum: x.inputChecksum })),
    completeness: financial.completeness === "PROVISIONAL" ? "PROVISIONAL" as const :
      (!orders.length && !components.length && !lots.length ? "NO_OBSERVATIONS" as const : "COMPLETE" as const), evidenceManifest,
  };
  const scopeSemantics = await tx.financialAuthorityScope.findMany({
    where: { id: { in: financial.scopeDecisions.map((x) => x.scopeId) } },
    include: { decision: { select: { revision: true, inputVersion: true, authorityState: true, selectedClass: true, reasonCode: true } } },
  });
  const costRevisionSemantics = await tx.costRecordRevision.findMany({
    where: { id: { in: cogs.map((x) => x.costRecordRevisionId) } },
    select: { id: true, revision: true, inputChecksum: true, authorityTier: true, effectiveFrom: true, effectiveTo: true },
  });
  const costRevisionById = new Map(costRevisionSemantics.map((x) => [x.id, x]));
  const lotById = new Map(scopeLots.map((x) => [x.id, x]));
  const scopedReplacementItemIds = replacements.flatMap((x) => [x.predecessorItemId, x.replacementItemId]);
  const replacementItems = await tx.normalizedOrderItem.findMany({ where: { id: { in: scopedReplacementItemIds } }, select: { id: true, sourceItemKey: true, order: { select: { sourceSystem: true, sourceOrderKey: true } } } });
  const replacementItemById = new Map(replacementItems.map((x) => [x.id, x]));
  const skuRows = await tx.sku.findMany({ where: { id: { in: items.flatMap((x) => x.skuId ? [x.skuId] : []) } }, select: { id: true, sellerSku: true, barcode: true } });
  const skuById = new Map(skuRows.map((x) => [x.id, x]));
  const marketplaceRows = await tx.marketplace.findMany({ where: { accountId: tenant.accountId, channelConnectionId: tenant.channelConnectionId }, select: { id: true, externalMarketplaceId: true } });
  const marketplaceById = new Map(marketplaceRows.map((x) => [x.id, x.externalMarketplaceId]));
  const semanticFingerprintPayload = {
    contractVersion: DATA_CORE_D2D_CONTRACT_VERSION,
    requestedScope: await semanticRequestedScope(tx, request), economicWindow: request.economicWindow,
    currency: body.currency, currencyPolicy: { version: policy.version, checksum: policy.checksum,
      exponentSourceVersion: policy.exponentSourceVersion, roundingMode: policy.roundingMode,
      toleranceAtoms: policy.toleranceAtoms, toleranceScale: policy.toleranceScale, residualPolicy: policy.residualPolicy },
    commerce: ordersRaw.flatMap((order) => order.revisions.map((revision) => ({ sourceSystem: order.sourceSystem,
      sourceOrderKey: order.sourceOrderKey, marketplace: order.marketplaceId ? marketplaceById.get(order.marketplaceId) : null, revision: revision.revision,
      normalizedStatus: revision.normalizedStatus, sourceStatus: revision.sourceStatus,
      occurredAt: revision.occurredAt, postedAt: revision.postedAt,
      items: order.items.flatMap((item) => item.revisions.map((itemRevision) => ({ sourceItemKey: item.sourceItemKey,
        revision: itemRevision.revision, quantityAtoms: itemRevision.quantityAtoms, quantityScale: itemRevision.quantityScale,
        sourceState: itemRevision.sourceState, occurredAt: itemRevision.occurredAt, postedAt: itemRevision.postedAt,
        sku: itemRevision.skuId ? (() => { const sku = skuById.get(itemRevision.skuId); return sku ? { sellerSku: sku.sellerSku, barcode: sku.barcode } : null; })() : null }))) }))),
    financialAuthority: scopeSemantics.map((scope) => ({ marketplace: scope.marketplaceId ? marketplaceById.get(scope.marketplaceId) : null,
      economicEventKey: scope.economicEventKey, coverageFamily: scope.coverageFamily, inputVersion: scope.inputVersion,
      periodStart: scope.periodStart, periodEnd: scope.periodEnd, decision: scope.decision })),
    financialComponents: components.map((x) => ({ economicEventKey: x.economicEventKey, revision: x.revision,
      operationKey: x.operationKey, state: x.state, projectionKind: x.projectionKind, sourceSubtype: x.sourceSubtype,
      authorityClass: x.authorityClass, amountAtoms: x.amountAtoms, amountScale: x.amountScale, currencyCode: x.currencyCode,
      sourceAmountText: x.sourceAmountText, sourceSignConvention: x.sourceSignConvention, signRuleKey: x.signRuleKey,
      economicRole: x.economicRole, sourceLeafPath: x.sourceLeafPath, occurredAt: x.occurredAt, postedAt: x.postedAt,
      effectiveAt: x.effectiveAt, periodStart: x.periodStart, periodEnd: x.periodEnd })),
    cogs: cogs.map((x) => { const lot = lotById.get(x.lotId); const revision = costRevisionById.get(x.costRecordRevisionId); return {
      lotKey: lot?.lotKey, originKind: x.originKind, quantityAtoms: x.quantityAtoms, quantityScale: x.quantityScale,
      unitCostAtoms: x.unitCostAtoms, unitCostScale: x.unitCostScale, currencyCode: x.currencyCode,
      recognitionEconomicAt: x.recognitionEconomicAt,
      costRevision: revision && { revision: revision.revision,
        authorityTier: revision.authorityTier, effectiveFrom: revision.effectiveFrom, effectiveTo: revision.effectiveTo },
      resolvedByLateEvidence: x.costEvidenceEventId !== null } }),
    inventoryEvents: canonicalInventoryEvents.map((x) => ({ lotKey: lotById.get(x.lotId)?.lotKey,
      eventType: x.eventType, effectClass: x.effectClass, quantityAtoms: x.quantityAtoms, quantityScale: x.quantityScale,
      economicAt: x.economicAt, monetaryEffect: x.monetaryEffect })),
    reimbursements: body.reimbursementLinks.map((x) => ({ lotKey: lotById.get(x.lotId)?.lotKey,
      eventType: x.eventType, quantityAtoms: x.quantityAtoms, quantityScale: x.quantityScale,
      economicAt: x.economicAt })),
    replacements: replacements.map((x) => ({ linkKey: x.linkKey, revision: x.revision, status: x.status,
      replacementKind: x.replacementKind, financialTreatment: x.financialTreatment,
      predecessor: replacementItemById.get(x.predecessorItemId)?.sourceItemKey,
      replacement: replacementItemById.get(x.replacementItemId)?.sourceItemKey,
      operationKey: x.operationKey })),
    taxEvidence: taxEvidence.map((x) => ({ evidenceKey: x.evidenceKey, revision: x.revision, status: x.status,
      category: x.category, economicRole: x.economicRole, priceRelation: x.priceRelation, authorityClass: x.authorityClass,
      availability: x.availability, coverageState: x.coverageState, confidence: x.confidence,
      amountAtoms: x.amountAtoms, amountScale: x.amountScale, currencyCode: x.currencyCode,
      jurisdictionCode: x.jurisdictionCode, periodStart: x.periodStart, periodEnd: x.periodEnd })),
    mappings: mappings.map((x) => ({ platform: x.platform, sourceContract: x.sourceContract, sourceVersion: x.sourceVersion,
      mapperSemanticVersion: x.mapperSemanticVersion, formulaCompatibilityVersion: x.formulaCompatibilityVersion,
      checksum: x.checksum })), taxPolicies,
  };
  return { ...body, fingerprint: canonicalEconomicFingerprint(semanticFingerprintPayload) };
}
