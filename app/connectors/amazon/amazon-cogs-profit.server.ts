import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { getCanonicalEconomicDatasetTx } from "~/core/canonical-economic-dataset.server";
import type { CanonicalEconomicDatasetReady } from "~/core/data-core-d2d-contracts";
import { recordNormalizedOrderItemRevisionTx, type VerifiedCoreTenant } from "~/core/data-core-d2a.server";
import { recognizeSaleCogsTx } from "~/core/inventory-economics.server";

const hash = (parts: readonly string[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");
export const AMAZON_MANUAL_MAPPING_RULE_VERSION = "amazon-manual-listing-sku-v1";

export async function approveAmazonListingSkuMappingTx(tx: Prisma.TransactionClient,
  tenant: VerifiedCoreTenant, input: { itemId: string; skuId: string; actorRef: string }) {
  if (!input.actorRef.trim()) throw new Error("Amazon F2 mapping actor required");
  const item = await tx.normalizedOrderItem.findFirst({ where: { id: input.itemId, ...tenant },
    include: { order: true, revisions: { orderBy: { revision: "desc" }, take: 1 } } });
  const prior = item?.revisions[0];
  if (!item || !prior || !prior.channelListingId || prior.sourceListingEntityType !== "AMAZON_LISTING" ||
      !prior.sourceListingKey) throw new Error("Amazon F2 item lacks Amazon listing evidence");
  const [listing, sku] = await Promise.all([
    tx.channelListing.findUnique({ where: { id: prior.channelListingId } }),
    tx.sku.findUnique({ where: { id: input.skuId } }),
  ]);
  if (!listing || listing.accountId !== tenant.accountId || listing.channelConnectionId !== tenant.channelConnectionId ||
      listing.marketplaceId !== item.order.marketplaceId || !sku || sku.accountId !== tenant.accountId)
    throw new Error("Amazon F2 mapping ownership mismatch");
  let candidate = await tx.productMappingCandidate.findUnique({ where: {
    listingId_candidateSkuId_ruleVersion: { listingId: listing.id, candidateSkuId: sku.id,
      ruleVersion: AMAZON_MANUAL_MAPPING_RULE_VERSION } } });
  if (!candidate) candidate = await tx.productMappingCandidate.create({ data: { accountId: tenant.accountId,
    listingId: listing.id, candidateSkuId: sku.id, ruleVersion: AMAZON_MANUAL_MAPPING_RULE_VERSION,
    confidence: 100, state: "ACCEPTED" } });
  if (candidate.accountId !== tenant.accountId || candidate.state !== "ACCEPTED")
    throw new Error("Amazon F2 mapping candidate unavailable");
  let decision = await tx.productMappingDecision.findFirst({ where: { candidateId: candidate.id,
    decision: "ACCEPT", actorRef: input.actorRef }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  if (!decision) decision = await tx.productMappingDecision.create({ data: { accountId: tenant.accountId,
    candidateId: candidate.id, decision: "ACCEPT", actorRef: input.actorRef } });
  const revision = await recordNormalizedOrderItemRevisionTx(tx, tenant, {
    orderId: item.orderId, sourceItemKey: item.sourceItemKey,
    operationKey: hash(["AMAZON_F2_MAP", item.id, decision.id]), quantityAtoms: prior.quantityAtoms,
    quantityScale: prior.quantityScale, sourceState: prior.sourceState, skuId: sku.id,
    channelListingId: listing.id, mappingDecisionId: decision.id,
    sourceListingEntityType: listing.sourceEntityType, sourceListingKey: listing.externalVariantOrListingId,
    occurredAt: prior.occurredAt, postedAt: prior.postedAt, rawSourceRecordId: prior.rawSourceRecordId,
    normalizationRunId: prior.normalizationRunId, mappingVersionId: prior.mappingVersionId,
    normalizationRevision: prior.normalizationRevision, syncSliceEvidenceId: prior.syncSliceEvidenceId,
  });
  return { listing, sku, candidate, decision, ...revision };
}

export async function recognizeAmazonOrderItemCogsTx(tx: Prisma.TransactionClient,
  tenant: VerifiedCoreTenant, input: { itemId: string; currencyCode: string }) {
  const item = await tx.normalizedOrderItem.findFirst({ where: { id: input.itemId, ...tenant },
    include: { order: { include: { revisions: { orderBy: { revision: "desc" }, take: 1 } } },
      revisions: { orderBy: { revision: "desc" }, take: 1 } } });
  const revision = item?.revisions[0], orderRevision = item?.order.revisions[0];
  if (!item || !revision || !orderRevision) throw new Error("Amazon F2 normalized item required");
  if (!revision.skuId || !revision.mappingDecisionId || !revision.channelListingId)
    return { status: "BLOCKED" as const, reasonCodes: ["MISSING_APPROVED_SKU_MAPPING"] };
  if (revision.quantityScale !== 0) throw new Error("Amazon F2 sale quantity must be integral");
  const economicAt = orderRevision.occurredAt ?? revision.occurredAt;
  if (!economicAt) throw new Error("Amazon F2 recognition time required");
  const result = await recognizeSaleCogsTx(tx, tenant, { lotKey: `amazon:${item.order.sourceOrderKey}:${item.sourceItemKey}`,
    skuId: revision.skuId, marketplaceId: item.order.marketplaceId,
    quantity: { quantityAtoms: revision.quantityAtoms, quantityScale: revision.quantityScale }, economicAt,
    operationKey: hash(["AMAZON_F2_SALE", item.id, revision.id]), orderId: item.orderId,
    orderRevisionId: orderRevision.id, itemId: item.id, itemRevisionId: revision.id,
    originKind: "SALE_ITEM", currencyCode: input.currencyCode });
  if (result.lot.costStatus === "KNOWN") return { status: "READY" as const, ...result };
  const resolution = await tx.inventoryEconomicEvent.findFirst({ where: { ...tenant, lotId: result.lot.id,
    eventType: "COST_BASIS_RESOLVED", costRecordRevisionId: { not: null }, unitCostAtoms: { not: null },
    unitCostScale: { not: null }, currencyCode: { not: null } }, orderBy: [{ recordedAt: "desc" }, { id: "desc" }] });
  const costRevision = resolution?.costRecordRevisionId ? await tx.costRecordRevision.findUnique({
    where: { id: resolution.costRecordRevisionId } }) : null;
  const costRecord = costRevision ? await tx.costRecord.findUnique({ where: { id: costRevision.costRecordId } }) : null;
  const validResolution = Boolean(resolution && costRevision && costRecord && costRevision.status === "PRESENT" &&
    costRevision.accountId === tenant.accountId && costRecord.accountId === tenant.accountId &&
    costRecord.skuId === result.lot.skuId && costRevision.unitCostAtoms === resolution.unitCostAtoms &&
    costRevision.unitCostScale === resolution.unitCostScale && costRevision.currencyCode === resolution.currencyCode);
  return validResolution ? { status: "READY" as const, resolution, ...result } :
    { status: "BLOCKED" as const, reasonCodes: ["UNKNOWN_COST"], ...result };
}

type ExactMoney = Readonly<{ amountAtoms: bigint; amountScale: number; currencyCode: string }>;
function normalize(value: ExactMoney, scale: number) {
  if (scale < value.amountScale) throw new Error("Amazon F2 inexact downscale forbidden");
  return value.amountAtoms * 10n ** BigInt(scale - value.amountScale);
}
export function sumExactMoney(values: readonly ExactMoney[], currencyCode: string): ExactMoney {
  if (values.some((value) => value.currencyCode !== currencyCode)) throw new Error("MIXED_CURRENCY_WITHOUT_FX");
  const amountScale = values.reduce((scale, value) => Math.max(scale, value.amountScale), 0);
  return { amountAtoms: values.reduce((sum, value) => sum + normalize(value, amountScale), 0n), amountScale, currencyCode };
}
export function multiplyExactCost(cogs: Pick<CanonicalEconomicDatasetReady["cogs"][number],
  "unitCostAtoms" | "unitCostScale" | "quantityAtoms" | "quantityScale" | "currencyCode">): ExactMoney {
  if (cogs.quantityAtoms < 0n || cogs.quantityScale < 0 || cogs.quantityScale > 12 ||
      cogs.unitCostScale < 0 || cogs.unitCostScale > 12 || cogs.unitCostScale + cogs.quantityScale > 12)
    throw new Error("INVALID_EXACT_COGS_QUANTITY");
  return { amountAtoms: cogs.unitCostAtoms * cogs.quantityAtoms,
    amountScale: cogs.unitCostScale + cogs.quantityScale, currencyCode: cogs.currencyCode };
}
const feeKinds = new Set(["MARKETPLACE_COMMISSION", "FULFILLMENT_FEE", "SHIPPING_EXPENSE", "STORAGE_FEE"]);
const otherKinds = new Set(["DISCOUNT_PROMOTION", "SHIPPING_REVENUE", "REIMBURSEMENT", "ADJUSTMENT"]);

export function projectAmazonOrderProfit(dataset: Awaited<ReturnType<typeof getCanonicalEconomicDatasetTx>>) {
  const order = dataset.status === "READY" ? dataset.commerce.orders[0] : null;
  const base = { orderId: order?.id ?? (dataset.requestedScope.kind === "ORDER" ? dataset.requestedScope.orderId : null),
    sourceOrderId: null as string | null, marketplaceId: order?.marketplaceId ?? null };
  if (dataset.status === "BLOCKED") return { status: "BLOCKED" as const, ...base, reasonCodes: dataset.reasonCodes };
  if (dataset.requestedScope.kind !== "ORDER" || dataset.commerce.orders.length !== 1)
    return { status: "BLOCKED" as const, ...base, reasonCodes: ["ORDER_SCOPE_REQUIRED"] };
  if (dataset.financialComponents.some((entry) => entry.projectionKind === "REFUND"))
    return { status: "BLOCKED" as const, ...base, reasonCodes: ["REFUND_COGS_SEMANTICS_UNPROVEN"] };
  const currencyCode = dataset.currency.currencyCode;
  if (!currencyCode) return { status: "BLOCKED" as const, ...base, reasonCodes: ["NO_MONETARY_OBSERVATIONS"] };
  const money = (entry: CanonicalEconomicDatasetReady["financialComponents"][number]): ExactMoney => ({
    amountAtoms: entry.amountAtoms, amountScale: entry.amountScale, currencyCode: entry.currencyCode });
  try {
    const revenue = sumExactMoney(dataset.financialComponents.filter((x) => x.projectionKind === "PRODUCT_REVENUE").map(money), currencyCode);
    const amazonFees = sumExactMoney(dataset.financialComponents.filter((x) => feeKinds.has(x.projectionKind)).map(money), currencyCode);
    const tax = sumExactMoney(dataset.financialComponents.filter((x) => x.projectionKind === "TAX_COMPONENT").map(money), currencyCode);
    const otherContribution = sumExactMoney(dataset.financialComponents.filter((x) => otherKinds.has(x.projectionKind)).map(money), currencyCode);
    const cogs = sumExactMoney(dataset.cogs.map(multiplyExactCost), currencyCode);
    const contribution = sumExactMoney([revenue, amazonFees, otherContribution,
      { ...cogs, amountAtoms: -cogs.amountAtoms }], currencyCode);
    return { status: "READY" as const, ...base, sourceOrderId: dataset.commerce.orders[0].id,
      revenue, amazonFees, cogs, tax, otherContribution, profit: contribution,
      currencyCode, reasonCodes: [] as string[] };
  } catch (error) {
    return { status: "BLOCKED" as const, ...base,
      reasonCodes: [error instanceof Error ? error.message : "EXACT_MONEY_FAILURE"] };
  }
}

export async function getAmazonOrderProfitTx(tx: Prisma.TransactionClient, input: {
  tenant: VerifiedCoreTenant; orderId: string; startInclusive: Date; endExclusive: Date;
  currencyPolicyVersionId: string;
}) {
  const dataset = await getCanonicalEconomicDatasetTx(tx, { tenant: input.tenant,
    scope: { kind: "ORDER", orderId: input.orderId }, economicWindow: {
      startInclusive: input.startInclusive, endExclusive: input.endExclusive },
    currencyPolicyVersionId: input.currencyPolicyVersionId });
  const projected = projectAmazonOrderProfit(dataset);
  const order = await tx.normalizedOrder.findUnique({ where: { id: input.orderId },
    select: { sourceOrderKey: true } });
  return { ...projected, sourceOrderId: order?.sourceOrderKey ?? null };
}
