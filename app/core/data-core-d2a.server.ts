import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { marketplaceScopeKey } from "./data-core-contracts";
import { quantity } from "./fixed-money";

/** Must be derived by the authenticated route or a trusted job, never by a browser payload. */
export type VerifiedCoreTenant = Readonly<{ accountId: string; channelConnectionId: string }>;
type Provenance = Readonly<{
  rawSourceRecordId: string; normalizationRunId: string; mappingVersionId: string; normalizationRevision: number;
  syncSliceEvidenceId: string;
}>;
type OrderInput = Provenance & Readonly<{
  marketplaceId: string | null; sourceSystem: string; sourceOrderKey: string;
  operationKey: string; normalizedStatus: string; sourceStatus?: string | null;
  occurredAt?: Date | null; postedAt?: Date | null;
}>;
type ItemInput = Provenance & Readonly<{
  orderId: string; sourceItemKey: string; operationKey: string;
  quantityAtoms: bigint; quantityScale: number; sourceState?: string | null;
  skuId?: string | null; channelListingId?: string | null;
  mappingDecisionId?: string | null;
  sourceListingEntityType?: string | null; sourceListingKey?: string | null;
  occurredAt?: Date | null; postedAt?: Date | null;
}>;

function required(value: string, name: string) {
  if (!value || !value.trim() || value !== value.trim()) throw new Error(`Invalid ${name}`);
  return value;
}
function timestamp(value: Date | null | undefined) {
  if (value == null) return null;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error("Invalid timestamp");
  return value.toISOString();
}
function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function validateProvenance(tx: Prisma.TransactionClient, tenant: VerifiedCoreTenant, evidence: Provenance, expectedSourceSystem: string, expectedOrderKey: string, expectedScope: string) {
  const [channel, raw, run, sliceEvidence] = await Promise.all([
    tx.channelConnection.findUnique({ where: { id: tenant.channelConnectionId }, include: { account: true } }),
    tx.rawSourceRecord.findUnique({ where: { id: evidence.rawSourceRecordId } }),
    tx.normalizationRun.findUnique({ where: { id: evidence.normalizationRunId } }),
    tx.syncSliceEvidence.findUnique({ where: { id: evidence.syncSliceEvidenceId }, include: { slice: true, sourceObservation: true } }),
  ]);
  if (!channel || channel.accountId !== tenant.accountId || channel.status !== "ACTIVE" || channel.account.status !== "ACTIVE") throw new Error("Inactive or cross-tenant channel");
  if (!raw || raw.accountId !== tenant.accountId || raw.channelConnectionId !== tenant.channelConnectionId ||
      raw.sourceSystem !== expectedSourceSystem || raw.sourceEntityType !== "ORDER" || raw.sourceEntityId !== expectedOrderKey) throw new Error("Raw source provenance mismatch");
  if (!run || run.accountId !== tenant.accountId || run.channelConnectionId !== tenant.channelConnectionId ||
      run.rawSourceRecordId !== raw.id || run.mappingVersionId !== evidence.mappingVersionId ||
      run.normalizationRevision !== evidence.normalizationRevision || run.status !== "SUCCEEDED") throw new Error("Successful normalization provenance required");
  if (!sliceEvidence || sliceEvidence.accountId !== tenant.accountId || sliceEvidence.channelConnectionId !== tenant.channelConnectionId ||
      sliceEvidence.rawSourceRecordId !== raw.id || sliceEvidence.normalizationRunId !== run.id ||
      (sliceEvidence.sourceObservation ?
        sliceEvidence.sourceObservation.rawSourceRecordId !== raw.id ||
        sliceEvidence.sourceObservation.runId !== sliceEvidence.runId ||
        sliceEvidence.sourceObservation.sliceId !== sliceEvidence.sliceId : sliceEvidence.runId !== raw.ingestionRunId) ||
      sliceEvidence.slice.accountId !== tenant.accountId ||
      sliceEvidence.slice.channelConnectionId !== tenant.channelConnectionId || sliceEvidence.slice.runId !== sliceEvidence.runId ||
      sliceEvidence.slice.marketplaceScopeKey !== expectedScope || sliceEvidence.slice.stream !== "orders") throw new Error("Exact marketplace slice evidence required");
  const mapping = await tx.mappingVersion.findUnique({ where: { id: evidence.mappingVersionId } });
  if (!mapping || mapping.platform !== channel.channel || mapping.activatedAt === null) throw new Error("Activated mapping platform required");
}

async function validateMarketplace(tx: Prisma.TransactionClient, tenant: VerifiedCoreTenant, marketplaceId: string | null) {
  const scope = marketplaceScopeKey(marketplaceId);
  if (marketplaceId !== null) {
    const marketplace = await tx.marketplace.findUnique({ where: { id: marketplaceId } });
    if (!marketplace || marketplace.accountId !== tenant.accountId || marketplace.channelConnectionId !== tenant.channelConnectionId || marketplace.status !== "ACTIVE") throw new Error("Marketplace ownership mismatch");
  }
  return scope;
}

/** Caller owns the short transaction. No API to update historical revisions exists. */
export async function recordNormalizedOrderRevisionTx(tx: Prisma.TransactionClient, tenant: VerifiedCoreTenant, input: OrderInput) {
  required(input.sourceSystem, "sourceSystem"); required(input.sourceOrderKey, "sourceOrderKey");
  required(input.operationKey, "operationKey"); required(input.normalizedStatus, "normalizedStatus");
  if (!Number.isSafeInteger(input.normalizationRevision) || input.normalizationRevision < 1) throw new Error("Invalid normalization revision");
  const scope = await validateMarketplace(tx, tenant, input.marketplaceId);
  await validateProvenance(tx, tenant, input, input.sourceSystem, input.sourceOrderKey, scope);
  const occurredAt = timestamp(input.occurredAt);
  const postedAt = timestamp(input.postedAt);
  const inputChecksum = hash([tenant.accountId, tenant.channelConnectionId, scope, input.sourceSystem, input.sourceOrderKey,
    input.normalizedStatus, input.sourceStatus ?? null, occurredAt, postedAt,
    input.rawSourceRecordId, input.normalizationRunId, input.mappingVersionId, input.normalizationRevision, input.syncSliceEvidenceId]);
  const order = await tx.normalizedOrder.upsert({
    where: { channelConnectionId_marketplaceScopeKey_sourceSystem_sourceOrderKey: {
      channelConnectionId: tenant.channelConnectionId, marketplaceScopeKey: scope, sourceSystem: input.sourceSystem, sourceOrderKey: input.sourceOrderKey,
    } },
    create: { accountId: tenant.accountId, channelConnectionId: tenant.channelConnectionId, marketplaceId: input.marketplaceId,
      marketplaceScopeKey: scope, sourceSystem: input.sourceSystem, sourceOrderKey: input.sourceOrderKey }, update: {},
  });
  if (order.accountId !== tenant.accountId || order.marketplaceId !== input.marketplaceId) throw new Error("Order identity collision");
  const existing = await tx.normalizedOrderRevision.findUnique({ where: { orderId_operationKey: { orderId: order.id, operationKey: input.operationKey } } });
  if (existing) {
    if (existing.inputChecksum !== inputChecksum) throw new Error("Conflicting order operation replay");
    return { order, revision: existing, replay: true };
  }
  const latest = await tx.normalizedOrderRevision.findFirst({ where: { orderId: order.id }, orderBy: { revision: "desc" } });
  const revision = await tx.normalizedOrderRevision.create({ data: {
    accountId: tenant.accountId, channelConnectionId: tenant.channelConnectionId, orderId: order.id,
    revision: (latest?.revision ?? 0) + 1, operationKey: input.operationKey, inputChecksum,
    normalizedStatus: input.normalizedStatus, sourceStatus: input.sourceStatus ?? null,
    occurredAt: input.occurredAt ?? null, postedAt: input.postedAt ?? null,
    rawSourceRecordId: input.rawSourceRecordId, normalizationRunId: input.normalizationRunId,
    mappingVersionId: input.mappingVersionId, normalizationRevision: input.normalizationRevision, syncSliceEvidenceId: input.syncSliceEvidenceId,
  } });
  return { order, revision, replay: false };
}

export async function recordNormalizedOrderItemRevisionTx(tx: Prisma.TransactionClient, tenant: VerifiedCoreTenant, input: ItemInput) {
  required(input.sourceItemKey, "sourceItemKey"); required(input.operationKey, "operationKey");
  if (!/^(id|composite):\S+$/.test(input.sourceItemKey)) throw new Error("Stable source item identity must be explicitly namespaced");
  if (!Number.isSafeInteger(input.normalizationRevision) || input.normalizationRevision < 1) throw new Error("Invalid normalization revision");
  const fixed = quantity(input.quantityAtoms, input.quantityScale);
  const order = await tx.normalizedOrder.findUnique({ where: { id: input.orderId } });
  if (!order || order.accountId !== tenant.accountId || order.channelConnectionId !== tenant.channelConnectionId) throw new Error("Order ownership mismatch");
  await validateMarketplace(tx, tenant, order.marketplaceId);
  await validateProvenance(tx, tenant, input, order.sourceSystem, order.sourceOrderKey, order.marketplaceScopeKey);
  const occurredAt = timestamp(input.occurredAt);
  const postedAt = timestamp(input.postedAt);
  const inputChecksum = hash([tenant.accountId, tenant.channelConnectionId, order.id, input.sourceItemKey,
    fixed.quantityAtoms.toString(), fixed.quantityScale, input.sourceState ?? null,
    input.skuId ?? null, input.channelListingId ?? null, input.mappingDecisionId ?? null,
    input.sourceListingEntityType ?? null, input.sourceListingKey ?? null, occurredAt, postedAt,
    input.rawSourceRecordId, input.normalizationRunId, input.mappingVersionId, input.normalizationRevision, input.syncSliceEvidenceId]);
  const item = await tx.normalizedOrderItem.upsert({ where: { orderId_sourceItemKey: { orderId: order.id, sourceItemKey: input.sourceItemKey } },
    create: { accountId: tenant.accountId, channelConnectionId: tenant.channelConnectionId, orderId: order.id, sourceItemKey: input.sourceItemKey }, update: {} });
  if (item.accountId !== tenant.accountId || item.channelConnectionId !== tenant.channelConnectionId) throw new Error("Item identity collision");
  const existing = await tx.normalizedOrderItemRevision.findUnique({ where: { itemId_operationKey: { itemId: item.id, operationKey: input.operationKey } } });
  if (existing) {
    if (existing.inputChecksum !== inputChecksum) throw new Error("Conflicting item operation replay");
    return { item, revision: existing, replay: true };
  }
  // Exact replay uses historical evidence even after current mapping changes.
  if (input.skuId) {
    const sku = await tx.sku.findUnique({ where: { id: input.skuId } });
    if (!sku || sku.accountId !== tenant.accountId) throw new Error("SKU ownership mismatch");
  }
  if (input.channelListingId) {
    required(input.sourceListingEntityType ?? "", "sourceListingEntityType");
    required(input.sourceListingKey ?? "", "sourceListingKey");
    const listing = await tx.channelListing.findUnique({ where: { id: input.channelListingId } });
    if (!listing || listing.accountId !== tenant.accountId || listing.channelConnectionId !== tenant.channelConnectionId ||
        listing.marketplaceScopeKey !== order.marketplaceScopeKey ||
        listing.sourceEntityType !== input.sourceListingEntityType || listing.externalVariantOrListingId !== input.sourceListingKey ||
        (input.skuId && listing.skuId !== null && listing.skuId !== input.skuId)) throw new Error("Listing ownership or explicit SKU mapping mismatch");
  } else if (input.sourceListingEntityType || input.sourceListingKey) throw new Error("Source listing identity without listing");
  if (input.skuId) {
    if (!input.channelListingId || !input.mappingDecisionId) throw new Error("Explicit SKU mapping decision required");
    const decision = await tx.productMappingDecision.findUnique({ where: { id: input.mappingDecisionId }, include: { candidate: true } });
    if (!decision || decision.accountId !== tenant.accountId || decision.decision !== "ACCEPT" ||
        decision.candidate.accountId !== tenant.accountId || decision.candidate.state !== "ACCEPTED" ||
        decision.candidate.listingId !== input.channelListingId || decision.candidate.candidateSkuId !== input.skuId) {
      throw new Error("Approved explicit SKU mapping mismatch");
    }
    const latest = await tx.productMappingDecision.findFirst({ where: { candidateId: decision.candidateId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    if (latest?.id !== decision.id) throw new Error("Superseded SKU mapping decision");
    const candidates = await tx.productMappingCandidate.findMany({ where: { listingId: input.channelListingId, state: "ACCEPTED" },
      include: { decisions: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 } } });
    const approved = candidates.filter(candidate => candidate.decisions[0]?.decision === "ACCEPT");
    if (approved.length !== 1 || approved[0].id !== decision.candidateId) throw new Error("Ambiguous explicit SKU mapping");
  } else if (input.mappingDecisionId) throw new Error("Mapping decision without SKU");
  const latest = await tx.normalizedOrderItemRevision.findFirst({ where: { itemId: item.id }, orderBy: { revision: "desc" } });
  const revision = await tx.normalizedOrderItemRevision.create({ data: {
    accountId: tenant.accountId, channelConnectionId: tenant.channelConnectionId, itemId: item.id,
    revision: (latest?.revision ?? 0) + 1, operationKey: input.operationKey, inputChecksum,
    quantityAtoms: fixed.quantityAtoms, quantityScale: fixed.quantityScale, sourceState: input.sourceState ?? null,
    skuId: input.skuId ?? null, channelListingId: input.channelListingId ?? null, mappingDecisionId: input.mappingDecisionId ?? null,
    sourceListingEntityType: input.sourceListingEntityType ?? null, sourceListingKey: input.sourceListingKey ?? null,
    marketplaceScopeKey: order.marketplaceScopeKey,
    occurredAt: input.occurredAt ?? null, postedAt: input.postedAt ?? null,
    rawSourceRecordId: input.rawSourceRecordId, normalizationRunId: input.normalizationRunId,
    mappingVersionId: input.mappingVersionId, normalizationRevision: input.normalizationRevision, syncSliceEvidenceId: input.syncSliceEvidenceId,
  } });
  return { item, revision, replay: false };
}
