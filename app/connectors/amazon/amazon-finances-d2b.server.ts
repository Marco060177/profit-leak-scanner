import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
  canonicalChecksum,
  createFinancialAuthorityScopeTx,
  recordFinancialAuthorityBindingTx,
  recordFinancialLedgerEntryTx,
  scopeAuthorityTx,
  type Tx,
} from "~/core/data-core-d2b.server";
import type { CoverageFamily, Provenance, VerifiedCoreTenant } from "~/core/data-core-d2b-contracts";
import {
  publishFinancialAuthorityDecisionTx,
  recordFinancialAuthorityEvidenceTx,
} from "~/core/financial-authority.server";
import { parseAmazonFinancesEvidencePage, type AmazonFinancesAcquisition } from "./amazon-finances.server";
import {
  AMAZON_FINANCES_SOURCE_AUTHORITY,
  mapAmazonFinancialTransactions,
  type AmazonCanonicalFinancialMoneyNode,
  type AmazonCanonicalFinancialTransaction,
} from "./amazon-finances-mapper.server";
import { AMAZON_FINANCES_STREAM } from "./amazon-finances-d1.server";
import { AmazonConnectorError } from "./amazon-types";

export type RawSourceDecryptionBoundary = Readonly<{
  decryptChunk(encrypted: Uint8Array, chunkIndex: number): Uint8Array;
}>;

type ReplayedPage = Readonly<{
  pageIndex: number;
  rawSourceRecordId: string;
  rawChecksum: string;
  provenance: Provenance;
  transactionPathById: ReadonlyMap<string, string>;
  body: Uint8Array;
  transactions: ReturnType<typeof parseAmazonFinancesEvidencePage>["transactions"];
}>;

const operation = (parts: readonly unknown[]) =>
  createHash("sha256").update(canonicalChecksum(parts)).digest("hex");

function family(value: AmazonCanonicalFinancialTransaction): CoverageFamily {
  const projections = new Set(value.economicLeaves.map((leaf) => leaf.projectionKind));
  if (projections.has("REFUND")) return "REFUND_BUNDLE";
  if (projections.has("REIMBURSEMENT")) return "REIMBURSEMENT_BUNDLE";
  if (projections.has("ADJUSTMENT")) return "ADJUSTMENT_BUNDLE";
  if (projections.has("STORAGE_FEE") ||
      (projections.size > 0 && [...projections].every((kind) =>
        ["MARKETPLACE_COMMISSION", "FULFILLMENT_FEE", "STORAGE_FEE"].includes(kind))))
    return "PERIODIC_CHARGE_BUNDLE";
  return "SALE_BUNDLE";
}

function exactIdentifier(values: readonly { name: string; value: string }[], names: readonly string[]) {
  const matches = [...new Set(values.filter((value) => names.includes(value.name)).map((value) => value.value))];
  if (matches.length > 1) throw new AmazonConnectorError("SOURCE_CONFLICT");
  return matches[0] ?? null;
}

async function replayPages(input: {
  db: PrismaClient;
  tenant: VerifiedCoreTenant;
  sliceId: string;
  rawDecryption: RawSourceDecryptionBoundary;
}) {
  const slice = await input.db.syncSlice.findUnique({ where: { id: input.sliceId }, include: { run: true } });
  if (!slice || slice.accountId !== input.tenant.accountId ||
      slice.channelConnectionId !== input.tenant.channelConnectionId ||
      slice.stream !== AMAZON_FINANCES_STREAM || slice.run.stream !== AMAZON_FINANCES_STREAM ||
      slice.status !== "SUCCEEDED" || slice.run.status !== "SUCCEEDED")
    throw new Error("Amazon E2-E requires completed owned Finances D1 evidence");
  const evidence = await input.db.syncSliceEvidence.findMany({ where: { sliceId: slice.id },
    include: { rawSourceRecord: { include: { chunks: { orderBy: { chunkIndex: "asc" } }, references: true } },
      normalizationRun: true, sourceObservation: true } });
  if (!evidence.length) throw new Error("Amazon E2-E missing D1 page evidence");
  const pages: ReplayedPage[] = [];
  for (const row of evidence) {
    if (!row.sourceObservation || row.accountId !== input.tenant.accountId ||
        row.channelConnectionId !== input.tenant.channelConnectionId ||
        row.rawSourceRecord.accountId !== input.tenant.accountId ||
        row.rawSourceRecord.channelConnectionId !== input.tenant.channelConnectionId ||
        row.normalizationRun.status !== "SUCCEEDED" ||
        row.normalizationRun.mappingVersionId !== slice.run.mappingVersionId)
      throw new Error("Amazon E2-E invalid D1 provenance chain");
    const pageNumber = Number(row.rawSourceRecord.sourceSnapshotVersion?.replace(/^page-/, ""));
    if (!Number.isSafeInteger(pageNumber) || pageNumber < 1)
      throw new Error("Amazon E2-E invalid page identity");
    const plain = Buffer.concat(row.rawSourceRecord.chunks.map((chunk) =>
      Buffer.from(input.rawDecryption.decryptChunk(new Uint8Array(chunk.encryptedBytes), chunk.chunkIndex))));
    if (plain.byteLength !== row.rawSourceRecord.payloadByteLength ||
        createHash("sha256").update(plain).digest("hex") !== row.rawSourceRecord.payloadChecksum)
      throw new Error("Amazon E2-E raw evidence integrity failure");
    const parsed = parseAmazonFinancesEvidencePage(plain);
    const transactionPathById = new Map(row.rawSourceRecord.references
      .filter((reference) => reference.targetKind === "AMAZON_FINANCES_TRANSACTION")
      .map((reference) => [reference.targetKey, reference.sourceLeafPath]));
    for (const transaction of parsed.transactions)
      if (!transactionPathById.has(transaction.transactionId))
        throw new Error("Amazon E2-E transaction lacks D1 SourceReference");
    pages.push({ pageIndex: pageNumber, rawSourceRecordId: row.rawSourceRecordId,
      rawChecksum: row.rawSourceRecord.payloadChecksum,
      provenance: { rawSourceRecordId: row.rawSourceRecordId,
        normalizationRunId: row.normalizationRunId, mappingVersionId: row.normalizationRun.mappingVersionId,
        normalizationRevision: row.normalizationRun.normalizationRevision, syncSliceEvidenceId: row.id },
      transactionPathById, body: plain, transactions: parsed.transactions });
  }
  pages.sort((left, right) => left.pageIndex - right.pageIndex);
  if (pages.some((page, index) => page.pageIndex !== index + 1))
    throw new Error("Amazon E2-E incomplete page sequence");
  return { slice, pages };
}

async function resolveMarketplace(tx: Tx, tenant: VerifiedCoreTenant, externalMarketplaceId: string | null) {
  if (!externalMarketplaceId) return null;
  const marketplace = await tx.marketplace.findUnique({ where: {
    channelConnectionId_externalMarketplaceId: {
      channelConnectionId: tenant.channelConnectionId, externalMarketplaceId,
    },
  } });
  if (!marketplace || marketplace.accountId !== tenant.accountId)
    throw new Error("Amazon E2-E marketplace evidence is not owned");
  return marketplace.id;
}

async function resolveCommerceCorrelation(tx: Tx, tenant: VerifiedCoreTenant,
  marketplaceId: string | null, value: AmazonCanonicalFinancialMoneyNode) {
  const sourceOrderKey = value.correlation.orderId;
  if (!sourceOrderKey) return { orderId: null, orderRevisionId: null, itemId: null, itemRevisionId: null };
  const order = await tx.normalizedOrder.findFirst({ where: { ...tenant, marketplaceId,
    sourceSystem: "AMAZON", sourceOrderKey }, include: { revisions: { orderBy: { revision: "desc" }, take: 1 } } });
  if (!order) return { orderId: null, orderRevisionId: null, itemId: null, itemRevisionId: null };
  const sourceItemKey = exactIdentifier(value.correlation.itemIdentifiers,
    ["ORDER_ITEM_ID", "AMAZON_ORDER_ITEM_ID"]);
  if (!sourceItemKey) return { orderId: order.id, orderRevisionId: order.revisions[0]?.id ?? null,
    itemId: null, itemRevisionId: null };
  const item = await tx.normalizedOrderItem.findUnique({ where: { orderId_sourceItemKey: {
    orderId: order.id, sourceItemKey: `id:${sourceItemKey}` } },
  include: { revisions: { orderBy: { revision: "desc" }, take: 1 } } });
  return { orderId: order.id, orderRevisionId: order.revisions[0]?.id ?? null,
    itemId: item?.id ?? null, itemRevisionId: item?.revisions[0]?.id ?? null };
}

async function ingestTransaction(tx: Tx, tenant: VerifiedCoreTenant, input: {
  value: AmazonCanonicalFinancialTransaction;
  page: ReplayedPage;
  mappingVersionId: string;
  sliceMarketplaceId: string | null;
}) {
  const value = input.value;
  const marketplaceId = value.marketplaceId === null ? input.sliceMarketplaceId :
    await resolveMarketplace(tx, tenant, value.marketplaceId);
  const scope = await createFinancialAuthorityScopeTx(tx, tenant, {
    marketplaceId, economicEventKey: value.economicEventKey, coverageFamily: family(value),
    provisionalSourceAuthority: "amazon-orders", actualSourceAuthority: AMAZON_FINANCES_SOURCE_AUTHORITY,
    policyMappingVersionId: input.mappingVersionId,
  });
  const transactionPath = input.page.transactionPathById.get(value.transactionId);
  if (!transactionPath) throw new Error("Amazon E2-E transaction reference missing");
  const bindingIdentity = { channelConnectionId: tenant.channelConnectionId,
    sourceAuthority: AMAZON_FINANCES_SOURCE_AUTHORITY, sourceEventNamespace: "finances-v2024-06-19",
    sourceEventIdentity: value.transactionId };
  const previousBinding = await tx.financialAuthorityBinding.findFirst({ where: bindingIdentity,
    orderBy: { revision: "desc" } });
  if (previousBinding && previousBinding.authorityScopeId !== scope.id)
    throw new Error("Amazon E2-E binding scope changed for stable transaction identity");
  const observationKey = operation([input.page.rawChecksum, value.transactionId, value.transactionStatus]);
  const [raw, normalization, sliceEvidence] = await Promise.all([
    tx.rawSourceRecord.findUnique({ where: { id: input.page.provenance.rawSourceRecordId } }),
    tx.normalizationRun.findUnique({ where: { id: input.page.provenance.normalizationRunId } }),
    tx.syncSliceEvidence.findUnique({ where: { id: input.page.provenance.syncSliceEvidenceId } }),
  ]);
  if (!raw || !normalization || !sliceEvidence || raw.accountId !== tenant.accountId ||
      normalization.rawSourceRecordId !== raw.id || normalization.mappingVersionId !== input.mappingVersionId ||
      normalization.normalizationRevision !== input.page.provenance.normalizationRevision ||
      sliceEvidence.rawSourceRecordId !== raw.id || sliceEvidence.normalizationRunId !== normalization.id)
    throw new Error("Amazon E2-E invalid binding provenance");
  const binding = previousBinding ?? await recordFinancialAuthorityBindingTx(tx, tenant, {
    ...input.page.provenance, authorityScopeId: scope.id, authorityClass: "ACTUAL",
    sourceAuthority: AMAZON_FINANCES_SOURCE_AUTHORITY, sourceSystem: "AMAZON",
    sourceEventNamespace: "finances-v2024-06-19", sourceEventIdentity: value.transactionId,
    sourceLeafPath: transactionPath, correlationRuleKey: "amazon-finances-transaction-id-v1",
    operationKey: operation([value.transactionId, "BINDING"]), expectedPreviousBindingId: null,
  });

  const entries: string[] = [];
  const presentKeys = new Set<string>();
  let unknown = value.finality !== "RELEASED" || value.marketplaceId === null;
  const blockers: Array<Record<string, string>> = [];
  for (const leaf of value.economicLeaves) {
    presentKeys.add(leaf.sourceComponentKey);
    if (leaf.projectionKind === "UNKNOWN_UNCLASSIFIED") unknown = true;
    if (leaf.representability === "UNREPRESENTABLE") {
      unknown = true;
      blockers.push({ sourceComponentKey: leaf.sourceComponentKey,
        sourceLeafPath: leaf.sourceLeafPath, sourceAmountText: leaf.sourceMoney.sourceAmountText,
        reasonCode: leaf.reasonCode, blockerIdentity: leaf.blocker.blockerIdentity,
        evidenceFingerprint: leaf.blocker.evidenceFingerprint });
      continue;
    }
    const head = await tx.financialComponentHead.findUnique({ where: {
      authorityScopeId_authorityClass_sourceAuthority_sourceComponentKey: {
        authorityScopeId: scope.id, authorityClass: "ACTUAL",
        sourceAuthority: AMAZON_FINANCES_SOURCE_AUTHORITY,
        sourceComponentKey: leaf.sourceComponentKey,
      },
    } });
    const correlation = await resolveCommerceCorrelation(tx, tenant, marketplaceId, leaf);
    const recorded = await recordFinancialLedgerEntryTx(tx, tenant, {
      ...input.page.provenance, authorityScopeId: scope.id, authorityClass: "ACTUAL",
      bindingId: binding.id, sourceAuthority: AMAZON_FINANCES_SOURCE_AUTHORITY,
      sourceComponentKey: leaf.sourceComponentKey, expectedPreviousEntryId: head?.currentEntryId ?? null,
      operationKey: operation([observationKey, leaf.sourceComponentKey, "PRESENT"]), state: "PRESENT",
      projectionKind: leaf.projectionKind, sourceSubtype: leaf.sourceType,
      amountAtoms: leaf.fixedMoney.amountAtoms, amountScale: leaf.fixedMoney.amountScale,
      currencyCode: leaf.fixedMoney.currencyCode, sourceAmountText: leaf.sourceMoney.sourceAmountText,
      sourceSignConvention: "MERCHANT_SIGNED", signRuleKey: "amazon-source-sign-v1",
      economicRole: "ECONOMIC", sourceLeafPath: transactionPath + leaf.sourceLeafPath,
      postedAt: value.postedDate, effectiveAt: value.postedDate, ...correlation,
    });
    entries.push(recorded.entry.id);
  }

  const priorHeads = await tx.financialComponentHead.findMany({ where: {
    authorityScopeId: scope.id, authorityClass: "ACTUAL", sourceAuthority: AMAZON_FINANCES_SOURCE_AUTHORITY },
  include: { current: true } });
  for (const head of priorHeads) {
    if (presentKeys.has(head.sourceComponentKey) || !head.current || head.current.state === "WITHDRAWN") continue;
    const previous = head.current;
    const withdrawn = await recordFinancialLedgerEntryTx(tx, tenant, {
      ...input.page.provenance, authorityScopeId: scope.id, authorityClass: "ACTUAL",
      bindingId: binding.id, sourceAuthority: AMAZON_FINANCES_SOURCE_AUTHORITY,
      sourceComponentKey: head.sourceComponentKey, expectedPreviousEntryId: previous.id,
      operationKey: operation([observationKey, head.sourceComponentKey, "WITHDRAWN"]), state: "WITHDRAWN",
      projectionKind: previous.projectionKind as Parameters<typeof recordFinancialLedgerEntryTx>[2]["projectionKind"],
      sourceSubtype: previous.sourceSubtype, amountAtoms: previous.amountAtoms,
      amountScale: previous.amountScale, currencyCode: previous.currencyCode,
      sourceAmountText: previous.sourceAmountText, sourceSignConvention: previous.sourceSignConvention,
      signRuleKey: previous.signRuleKey, economicRole: "ECONOMIC",
      sourceLeafPath: transactionPath, postedAt: value.postedDate, effectiveAt: value.postedDate,
      orderId: previous.orderId, orderRevisionId: previous.orderRevisionId,
      itemId: previous.itemId, itemRevisionId: previous.itemRevisionId,
    });
    entries.push(withdrawn.entry.id);
  }

  const priorEvidence = await tx.financialAuthorityEvidence.findFirst({ where: {
    authorityScopeId: scope.id, authorityClass: "ACTUAL" }, orderBy: { revision: "desc" } });
  const coverageState = unknown ? "UNKNOWN" as const : "COMPLETE" as const;
  const evidence = await recordFinancialAuthorityEvidenceTx(tx, tenant, {
    authorityScopeId: scope.id, authorityClass: "ACTUAL",
    operationKey: observationKey, expectedPreviousEvidenceId: priorEvidence?.id ?? null,
    mappingVersionId: input.mappingVersionId, coverageState,
    boundariesJson: JSON.stringify({ mappingVersion: value.mappingVersion,
      transactionId: value.transactionId, transactionType: value.transactionType,
      transactionStatus: value.transactionStatus, finality: value.finality,
      rawChecksum: input.page.rawChecksum, blockers }),
    sourceWatermark: value.postedDate,
    closureSyncSliceEvidenceId: coverageState === "COMPLETE" ? input.page.provenance.syncSliceEvidenceId : null,
    closureLeafPath: coverageState === "COMPLETE" ? transactionPath : null,
    closureRuleKey: coverageState === "COMPLETE" ? "amazon-finances-complete-transaction-v1" : null,
    reasonCode: coverageState === "UNKNOWN" ? blockers[0]?.reasonCode ??
      (value.finality === "DEFERRED" ? "AMAZON_DEFERRED" :
        value.finality === "UNKNOWN" ? "AMAZON_STATUS_UNKNOWN" :
          value.marketplaceId === null ? "AMAZON_MARKETPLACE_UNKNOWN" : "UNKNOWN_UNCLASSIFIED") : null,
    sources: [input.page.provenance], entryIds: entries,
  });
  const decisionOperationKey = operation([observationKey, evidence.id, "DECISION"]);
  const existingDecision = await tx.financialAuthorityDecision.findUnique({ where: {
    authorityScopeId_operationKey: { authorityScopeId: scope.id, operationKey: decisionOperationKey },
  } });
  const decision = existingDecision ?? await (async () => {
    const state = await scopeAuthorityTx(tx, scope.id);
    return publishFinancialAuthorityDecisionTx(tx, tenant, {
      authorityScopeId: scope.id, operationKey: decisionOperationKey,
      expectedPreviousDecisionId: state.currentDecisionId, expectedInputVersion: state.inputVersion,
    });
  })();
  return { scopeId: scope.id, evidenceId: evidence.id, decisionId: decision.id,
    entryIds: entries, blocked: decision.selectedClass === "BLOCKED" };
}

/** Replays one completed E2-D slice and atomically publishes its D2B authority units. */
export async function ingestAmazonFinancesD1ToD2B(input: {
  db: PrismaClient;
  tenant: VerifiedCoreTenant;
  sliceId: string;
  rawDecryption: RawSourceDecryptionBoundary;
}) {
  if (!input.rawDecryption?.decryptChunk) throw new Error("Raw payload decryption required");
  const replayed = await replayPages(input);
  const acquisition: AmazonFinancesAcquisition = { pages: replayed.pages.map((page) => ({
    pageIndex: page.pageIndex, body: page.body, transactions: page.transactions,
    requestId: null, nextToken: null,
  })) };
  const canonical = mapAmazonFinancialTransactions(acquisition);
  const pageByTransaction = new Map<string, ReplayedPage>();
  for (const page of replayed.pages) for (const transaction of page.transactions) {
    const prior = pageByTransaction.get(transaction.transactionId);
    if (prior && canonicalChecksum(prior.transactions.find((item) => item.transactionId === transaction.transactionId)) !==
        canonicalChecksum(transaction)) throw new AmazonConnectorError("SOURCE_CONFLICT");
    if (!prior) pageByTransaction.set(transaction.transactionId, page);
  }
  const results = await input.db.$transaction(async (tx) => {
    const output = [];
    for (const value of canonical) {
      const page = pageByTransaction.get(value.transactionId);
      if (!page) throw new Error("Amazon E2-E transaction page missing");
      try {
        output.push(await ingestTransaction(tx, input.tenant, { value, page,
          mappingVersionId: replayed.slice.run.mappingVersionId,
          sliceMarketplaceId: replayed.slice.marketplaceId }));
      } catch (error) {
        throw new Error(`Amazon E2-E transaction failed: ${value.transactionId}`, { cause: error });
      }
    }
    return output;
  });
  return { sliceId: input.sliceId, transactionCount: canonical.length, results };
}
