import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { completeSyncSliceTx, prepareSyncSlice, releaseSyncSlice } from "~/core/data-core-d1.server";
import { recordNormalizedOrderItemRevisionTx, recordNormalizedOrderRevisionTx,
  type VerifiedCoreTenant } from "~/core/data-core-d2a.server";
import type { CredentialEncryptionProvider } from "~/services/credential-encryption.server";
import { establishAmazonOrdersSlice, persistAmazonOrderAcquisitionToD1,
  type RawSourceEncryptionBoundary } from "./amazon-orders-d1.server";
import { assertAmazonOrdersBoundary, listAmazonOrders, type AmazonOrderQuery } from "./amazon-orders.server";
import type { AmazonRetryHooks } from "./amazon-sp-api-client.server";
import type { AmazonApplicationConfig, AmazonHttpTransport } from "./amazon-types";

const operation = (parts: readonly string[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");

/** Complete Amazon Orders vertical slice. Monetary and replacement facts remain in exact D1 evidence until their owning cores ingest them. */
export async function ingestAmazonOrdersToD2A(input: {
  db: PrismaClient; tenant: VerifiedCoreTenant; marketplaceId: string; operationKey: string;
  mappingVersionId: string; query: AmazonOrderQuery; config: AmazonApplicationConfig;
  transport: AmazonHttpTransport; credentialEncryptionProvider: CredentialEncryptionProvider;
  rawEncryption: RawSourceEncryptionBoundary; leaseOwner: string; now: Date; leaseMs?: number;
  retry?: AmazonRetryHooks;
}) {
  const externalMarketplaceId = await assertAmazonOrdersBoundary(input.db, input.tenant, input.marketplaceId);
  const context = await establishAmazonOrdersSlice(input.db, { tenant: input.tenant, marketplaceId: input.marketplaceId,
    operationKey: input.operationKey, mappingVersionId: input.mappingVersionId, leaseOwner: input.leaseOwner,
    now: input.now, leaseMs: input.leaseMs ?? 300_000 });
  if (context.alreadySucceeded) return { replayed: true, runId: context.runId, sliceId: context.sliceId,
    orderCount: await input.db.normalizedOrderRevision.count({ where: { syncSliceEvidence: { sliceId: context.sliceId } } }),
    itemCount: await input.db.normalizedOrderItemRevision.count({ where: { syncSliceEvidence: { sliceId: context.sliceId } } }) };
  try {
    const acquisition = await listAmazonOrders({ db: input.db, tenant: input.tenant, marketplaceId: input.marketplaceId,
      query: input.query, config: input.config, transport: input.transport,
      encryptionProvider: input.credentialEncryptionProvider, retry: input.retry });
    const persisted = await persistAmazonOrderAcquisitionToD1({ db: input.db, tenant: input.tenant,
      externalMarketplaceId, acquisition, context, leaseOwner: input.leaseOwner, now: input.now,
      rawEncryption: input.rawEncryption, includeOrderEvidence: true });
    await prepareSyncSlice(input.db, { ...input.tenant, sliceId: context.sliceId, leaseOwner: input.leaseOwner,
      authorizationVersion: context.authorizationVersion, now: input.now });
    let orderCount = 0; let itemCount = 0;
    await input.db.$transaction(async (tx) => {
      for (const order of acquisition.orders) {
        const link = persisted.find((entry) => entry.sourceEntityType === "ORDER" && entry.sourceEntityId === order.externalOrderId);
        if (!link) throw new Error("Amazon order has no exact D1 evidence");
        const evidence = await tx.syncSliceEvidence.findUniqueOrThrow({ where: { id: link.evidenceId },
          include: { normalizationRun: true } });
        const provenance = { rawSourceRecordId: link.rawSourceRecordId, normalizationRunId: evidence.normalizationRunId,
          mappingVersionId: context.mappingVersionId, normalizationRevision: evidence.normalizationRun.normalizationRevision,
          syncSliceEvidenceId: evidence.id };
        const orderResult = await recordNormalizedOrderRevisionTx(tx, input.tenant, { ...provenance,
          marketplaceId: input.marketplaceId, sourceSystem: "AMAZON", sourceOrderKey: order.externalOrderId,
          operationKey: operation([context.runId, "ORDER", order.externalOrderId]), normalizedStatus: order.normalizedStatus,
          sourceStatus: order.sourceStatus, occurredAt: order.purchaseDate, postedAt: order.lastUpdatedAt });
        orderCount += 1;
        for (const item of order.items) {
          await recordNormalizedOrderItemRevisionTx(tx, input.tenant, { ...provenance, orderId: orderResult.order.id,
            sourceItemKey: `id:${item.externalOrderItemId}`,
            operationKey: operation([context.runId, "ITEM", order.externalOrderId, item.externalOrderItemId]),
            quantityAtoms: BigInt(item.quantityOrdered), quantityScale: 0,
            occurredAt: order.purchaseDate, postedAt: order.lastUpdatedAt });
          itemCount += 1;
        }
      }
      await completeSyncSliceTx(tx, { ...input.tenant, sliceId: context.sliceId, leaseOwner: input.leaseOwner,
        authorizationVersion: context.authorizationVersion, mappingVersionId: context.mappingVersionId,
        windowWatermark: input.query.before, cursorValue: input.query.after.toISOString(), now: input.now,
        expectedProcessedSliceId: context.expectedProcessedSliceId });
      await tx.syncRun.update({ where: { id: context.runId }, data: { status: "SUCCEEDED", finishedAt: input.now } });
    });
    return { replayed: false, runId: context.runId, sliceId: context.sliceId, orderCount, itemCount };
  } catch (error) {
    await releaseSyncSlice(input.db, { sliceId: context.sliceId, leaseOwner: input.leaseOwner }).catch(() => undefined);
    await input.db.syncRun.updateMany({ where: { id: context.runId, status: "RUNNING" },
      data: { status: "FAILED", finishedAt: input.now } }).catch(() => undefined);
    throw error;
  }
}
