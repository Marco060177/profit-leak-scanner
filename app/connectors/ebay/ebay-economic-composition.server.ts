import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { getCanonicalEconomicDatasetTx } from "~/core/canonical-economic-dataset.server";
import { recordNormalizedOrderItemRevisionTx, type VerifiedCoreTenant } from "~/core/data-core-d2a.server";
import { recognizeSaleCogsTx } from "~/core/inventory-economics.server";

const hash = (parts: readonly string[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");
export const EBAY_MANUAL_MAPPING_RULE_VERSION = "ebay-manual-listing-sku-v1";

async function requireEbayTenantTx(tx: Prisma.TransactionClient, tenant: VerifiedCoreTenant) {
  const channel = await tx.channelConnection.findUnique({ where: { id: tenant.channelConnectionId },
    include: { account: true } });
  if (!channel || channel.accountId !== tenant.accountId || channel.channel !== "EBAY" ||
      channel.status !== "ACTIVE" || channel.account.status !== "ACTIVE")
    throw new Error("EB4 active owned eBay channel required");
  return channel;
}

export async function approveEbayListingSkuMappingTx(tx: Prisma.TransactionClient,
tenant: VerifiedCoreTenant, input: { itemId: string; skuId: string; actorRef: string }) {
  await requireEbayTenantTx(tx, tenant);
  if (!input.actorRef.trim()) throw new Error("EB4 mapping actor required");
  const item = await tx.normalizedOrderItem.findFirst({ where: { id: input.itemId, ...tenant },
    include: { order: true, revisions: { orderBy: { revision: "desc" }, take: 1 } } });
  const prior = item?.revisions[0];
  if (!item || item.order.sourceSystem !== "EBAY" || !prior || !prior.channelListingId ||
      prior.sourceListingEntityType !== "EBAY_LISTING" || !prior.sourceListingKey)
    throw new Error("EB4 item lacks eBay listing evidence");
  const [listing, sku] = await Promise.all([
    tx.channelListing.findUnique({ where: { id: prior.channelListingId } }),
    tx.sku.findUnique({ where: { id: input.skuId } }),
  ]);
  if (!listing || listing.accountId !== tenant.accountId ||
      listing.channelConnectionId !== tenant.channelConnectionId ||
      listing.marketplaceId !== item.order.marketplaceId || !sku || sku.accountId !== tenant.accountId)
    throw new Error("EB4 mapping ownership mismatch");
  let candidate = await tx.productMappingCandidate.findUnique({ where: {
    listingId_candidateSkuId_ruleVersion: { listingId: listing.id, candidateSkuId: sku.id,
      ruleVersion: EBAY_MANUAL_MAPPING_RULE_VERSION } } });
  if (!candidate) candidate = await tx.productMappingCandidate.create({ data: { accountId: tenant.accountId,
    listingId: listing.id, candidateSkuId: sku.id, ruleVersion: EBAY_MANUAL_MAPPING_RULE_VERSION,
    confidence: 100, state: "ACCEPTED" } });
  if (candidate.accountId !== tenant.accountId || candidate.state !== "ACCEPTED")
    throw new Error("EB4 mapping candidate unavailable");
  let decision = await tx.productMappingDecision.findFirst({ where: { candidateId: candidate.id,
    decision: "ACCEPT", actorRef: input.actorRef }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  if (!decision) decision = await tx.productMappingDecision.create({ data: { accountId: tenant.accountId,
    candidateId: candidate.id, decision: "ACCEPT", actorRef: input.actorRef } });
  const revision = await recordNormalizedOrderItemRevisionTx(tx, tenant, {
    orderId: item.orderId, sourceItemKey: item.sourceItemKey,
    operationKey: hash(["EBAY_EB4_MAP", item.id, decision.id]), quantityAtoms: prior.quantityAtoms,
    quantityScale: prior.quantityScale, sourceState: prior.sourceState, skuId: sku.id,
    channelListingId: listing.id, mappingDecisionId: decision.id,
    sourceListingEntityType: listing.sourceEntityType, sourceListingKey: listing.externalVariantOrListingId,
    occurredAt: prior.occurredAt, postedAt: prior.postedAt, rawSourceRecordId: prior.rawSourceRecordId,
    normalizationRunId: prior.normalizationRunId, mappingVersionId: prior.mappingVersionId,
    normalizationRevision: prior.normalizationRevision, syncSliceEvidenceId: prior.syncSliceEvidenceId,
  });
  return { listing, sku, candidate, decision, ...revision };
}

export async function recognizeEbayOrderItemCogsTx(tx: Prisma.TransactionClient,
tenant: VerifiedCoreTenant, input: { itemId: string; currencyCode: string }) {
  await requireEbayTenantTx(tx, tenant);
  const item = await tx.normalizedOrderItem.findFirst({ where: { id: input.itemId, ...tenant },
    include: { order: { include: { revisions: { orderBy: { revision: "desc" }, take: 1 } } },
      revisions: { orderBy: { revision: "desc" }, take: 1 } } });
  const revision = item?.revisions[0], orderRevision = item?.order.revisions[0];
  if (!item || item.order.sourceSystem !== "EBAY" || !revision || !orderRevision)
    throw new Error("EB4 current normalized eBay item required");
  if (!revision.skuId || !revision.mappingDecisionId || !revision.channelListingId)
    return { status: "UNAVAILABLE" as const, reasonCodes: ["MISSING_APPROVED_SKU_MAPPING"] };
  if (revision.quantityScale !== 0) throw new Error("EB4 sale quantity must be integral");
  const economicAt = orderRevision.occurredAt ?? revision.occurredAt;
  if (!economicAt) throw new Error("EB4 recognition time required");
  const result = await recognizeSaleCogsTx(tx, tenant, {
    lotKey: `ebay:${item.order.sourceOrderKey}:${item.sourceItemKey}`, skuId: revision.skuId,
    marketplaceId: item.order.marketplaceId,
    quantity: { quantityAtoms: revision.quantityAtoms, quantityScale: revision.quantityScale }, economicAt,
    operationKey: hash(["EBAY_EB4_SALE", item.id, revision.id]), orderId: item.orderId,
    orderRevisionId: orderRevision.id, itemId: item.id, itemRevisionId: revision.id,
    originKind: "SALE_ITEM", currencyCode: input.currencyCode,
  });
  return result.lot.costStatus === "KNOWN" ? { status: "READY" as const, ...result } :
    { status: "UNAVAILABLE" as const, reasonCodes: ["UNKNOWN_COST"], ...result };
}

export async function getEbayCanonicalEconomicDatasetTx(tx: Prisma.TransactionClient, input: {
  tenant: VerifiedCoreTenant; scope: { kind: "CHANNEL" } | { kind: "MARKETPLACE"; marketplaceId: string } |
    { kind: "ORDER"; orderId: string } | { kind: "ORDER_ITEM"; orderId: string; itemId: string };
  startInclusive: Date; endExclusive: Date; currencyPolicyVersionId: string;
}) {
  await requireEbayTenantTx(tx, input.tenant);
  if (input.scope.kind === "ORDER" || input.scope.kind === "ORDER_ITEM") {
    const order = await tx.normalizedOrder.findFirst({ where: { id: input.scope.orderId, ...input.tenant } });
    if (!order || order.sourceSystem !== "EBAY") throw new Error("EB4 owned normalized eBay order required");
  }
  return getCanonicalEconomicDatasetTx(tx, { tenant: input.tenant, scope: input.scope,
    economicWindow: { startInclusive: input.startInclusive, endExclusive: input.endExclusive },
    currencyPolicyVersionId: input.currencyPolicyVersionId });
}
