import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { marketplaceScopeKey } from "./data-core-contracts";

export const RAW_CHUNK_BYTES = 64 * 1024;
export const RAW_TOTAL_BYTES = 2 * 1024 * 1024;
const checksum = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export async function storeRawSourceRecord(db: PrismaClient, input: {
  accountId: string; channelConnectionId: string; sourceSystem: string; sourceVersion: string;
  sourceEntityType: string; sourceEntityId: string; sourceSnapshotVersion?: string;
  schemaVersion: string; retentionClass: string; capturedAt: Date; sourceUpdatedAt?: Date;
  ingestionRunId?: string; payload: Uint8Array;
  encryptChunk: (plain: Uint8Array, index: number) => Uint8Array;
}) {
  if (input.payload.byteLength > RAW_TOTAL_BYTES) throw new RangeError("Raw payload exceeds D1 bound");
  if (!input.encryptChunk) throw new Error("Raw payload encryption required");
  const payloadChecksum = checksum(input.payload);
  return db.$transaction(async (tx) => {
    const owner = await tx.channelConnection.findUnique({ where: { id: input.channelConnectionId }, include: { account: true } });
    if (!owner || owner.accountId !== input.accountId || owner.status !== "ACTIVE" || owner.account.status !== "ACTIVE") throw new Error("Inactive raw source owner");
    const identity = { channelConnectionId: input.channelConnectionId, sourceSystem: input.sourceSystem,
      sourceVersion: input.sourceVersion, sourceEntityType: input.sourceEntityType,
      sourceEntityId: input.sourceEntityId, payloadChecksum };
    const existing = await tx.rawSourceRecord.findUnique({ where: {
      channelConnectionId_sourceSystem_sourceVersion_sourceEntityType_sourceEntityId_payloadChecksum: identity,
    } });
    if (existing) {
      if (existing.accountId !== input.accountId || existing.payloadByteLength !== input.payload.byteLength) throw new Error("Raw identity collision");
      return existing;
    }
    const chunks: { chunkIndex: number; encryptedBytes: Uint8Array<ArrayBuffer>; accountId: string; channelConnectionId: string }[] = [];
    for (let offset = 0, index = 0; offset < input.payload.byteLength; offset += RAW_CHUNK_BYTES, index += 1) {
      const encryptedBytes = input.encryptChunk(input.payload.slice(offset, offset + RAW_CHUNK_BYTES), index);
      if (!encryptedBytes.byteLength || encryptedBytes.byteLength > RAW_CHUNK_BYTES + 1024) throw new RangeError("Encrypted raw chunk exceeds bound");
      chunks.push({ chunkIndex: index, encryptedBytes: new Uint8Array(encryptedBytes), accountId: input.accountId, channelConnectionId: input.channelConnectionId });
    }
    const record = await tx.rawSourceRecord.create({ data: {
      ...identity, accountId: input.accountId, sourceSnapshotVersion: input.sourceSnapshotVersion,
      capturedAt: input.capturedAt, sourceUpdatedAt: input.sourceUpdatedAt,
      schemaVersion: input.schemaVersion, retentionClass: input.retentionClass,
      ingestionRunId: input.ingestionRunId, payloadByteLength: input.payload.byteLength,
    } });
    for (const chunk of chunks) {
      await tx.rawSourceBlobChunk.create({ data: { ...chunk, rawSourceRecordId: record.id } });
    }
    return record;
  });
}

export async function activateMappingVersion(db: PrismaClient, id: string, checksumValue: string) {
  const changed = await db.mappingVersion.updateMany({ where: { id, checksum: checksumValue, activatedAt: null }, data: { activatedAt: new Date() } });
  if (changed.count !== 1) throw new Error("Mapping version is already active or changed");
}

/** Semantic updates intentionally have no API. Activation/deactivation only. */
export async function deactivateMappingVersion(db: PrismaClient, id: string) {
  const changed = await db.mappingVersion.updateMany({ where: { id, activatedAt: { not: null }, deactivatedAt: null }, data: { deactivatedAt: new Date() } });
  if (changed.count !== 1) throw new Error("Mapping version is not active");
}

export function deterministicSliceKey(parts: readonly string[]) {
  if (!parts.length || parts.some((part) => !part.trim())) throw new Error("Invalid sync slice identity");
  return checksum(Buffer.from(JSON.stringify(parts), "utf8"));
}

export async function claimSyncSlice(db: PrismaClient, input: {
  sliceId: string; accountId: string; channelConnectionId: string;
  authorizationVersion: string; leaseOwner: string; now: Date; leaseMs: number;
}) {
  if (!input.leaseOwner || !Number.isInteger(input.leaseMs) || input.leaseMs < 1000 || input.leaseMs > 300000) throw new Error("Invalid lease");
  return db.$transaction(async (tx) => {
    const slice = await tx.syncSlice.findUnique({ where: { id: input.sliceId }, include: { run: true } });
    const channel = await tx.channelConnection.findUnique({ where: { id: input.channelConnectionId }, include: { account: true } });
    const authorization = await tx.coreChannelAuthorization.findUnique({ where: { channelConnectionId: input.channelConnectionId } });
    if (!slice || !channel || slice.accountId !== input.accountId || slice.channelConnectionId !== input.channelConnectionId ||
      channel.accountId !== input.accountId || channel.status !== "ACTIVE" || channel.account.status !== "ACTIVE" ||
      authorization?.accountId !== input.accountId || authorization.authorizationVersion !== input.authorizationVersion ||
      slice.authorizationVersion !== input.authorizationVersion || slice.run.authorizationVersion !== input.authorizationVersion ||
      slice.stream !== slice.run.stream ||
      !["PENDING", "RUNNING"].includes(slice.run.status)) throw new Error("Sync ownership or authorization changed");
    const result = await tx.syncSlice.updateMany({ where: { id: slice.id, accountId: input.accountId,
      channelConnectionId: input.channelConnectionId, authorizationVersion: input.authorizationVersion,
      OR: [{ status: { in: ["PENDING", "FAILED"] }, leaseOwner: null },
        { status: { in: ["LEASED", "PREPARED"] }, leaseExpiresAt: { lt: input.now } }],
    }, data: { status: "LEASED", leaseOwner: input.leaseOwner,
      leaseExpiresAt: new Date(input.now.getTime() + input.leaseMs), attempt: { increment: 1 } } });
    return result.count === 1;
  });
}

export async function attachRawEvidenceToSlice(db: PrismaClient, input: {
  accountId: string; channelConnectionId: string; sliceId: string;
  rawSourceRecordId: string; normalizationRunId: string; leaseOwner: string; now: Date;
}) {
  return db.$transaction(async (tx) => {
    const slice = await tx.syncSlice.findUnique({ where: { id: input.sliceId }, include: { run: true } });
    if (!slice || slice.accountId !== input.accountId || slice.channelConnectionId !== input.channelConnectionId ||
      slice.stream !== slice.run.stream ||
      slice.status !== "LEASED" || slice.leaseOwner !== input.leaseOwner ||
      !slice.leaseExpiresAt || slice.leaseExpiresAt <= input.now) throw new Error("Raw evidence slice lease unavailable");
    const raw = await tx.rawSourceRecord.findUnique({ where: { id: input.rawSourceRecordId } });
    const normalization = await tx.normalizationRun.findUnique({ where: { id: input.normalizationRunId } });
    if (!raw || !normalization || raw.accountId !== input.accountId || raw.channelConnectionId !== input.channelConnectionId ||
      raw.ingestionRunId !== slice.runId || normalization.accountId !== input.accountId ||
      normalization.channelConnectionId !== input.channelConnectionId ||
      normalization.rawSourceRecordId !== raw.id || normalization.mappingVersionId !== slice.run.mappingVersionId) {
      throw new Error("Raw evidence does not belong to this sync run and normalization");
    }
    const existing = await tx.syncSliceEvidence.findUnique({ where: { sliceId_rawSourceRecordId: {
      sliceId: input.sliceId, rawSourceRecordId: input.rawSourceRecordId,
    } } });
    if (existing) {
      if (existing.normalizationRunId !== input.normalizationRunId) throw new Error("Immutable normalization evidence differs");
      return existing;
    }
    return tx.syncSliceEvidence.create({ data: { accountId: input.accountId,
      channelConnectionId: input.channelConnectionId, sliceId: input.sliceId, runId: slice.runId,
      rawSourceRecordId: input.rawSourceRecordId, normalizationRunId: input.normalizationRunId } });
  });
}

/** D1 evidence gate. D3 must commit normalized outputs and checkpoint together. */
export async function prepareSyncSlice(db: PrismaClient, input: {
  accountId: string; channelConnectionId: string; sliceId: string;
  leaseOwner: string; authorizationVersion: string; now: Date;
}) {
  return db.$transaction(async (tx) => {
    const slice = await tx.syncSlice.findUnique({ where: { id: input.sliceId }, include: { run: true } });
    const channel = await tx.channelConnection.findUnique({ where: { id: input.channelConnectionId }, include: { account: true } });
    const authorization = await tx.coreChannelAuthorization.findUnique({ where: { channelConnectionId: input.channelConnectionId } });
    if (!slice || !channel || slice.accountId !== input.accountId || slice.channelConnectionId !== input.channelConnectionId ||
      channel.accountId !== input.accountId || channel.status !== "ACTIVE" || channel.account.status !== "ACTIVE" ||
      authorization?.accountId !== input.accountId || authorization.authorizationVersion !== input.authorizationVersion ||
      slice.authorizationVersion !== input.authorizationVersion || slice.run.authorizationVersion !== input.authorizationVersion ||
      slice.stream !== slice.run.stream ||
      slice.status !== "LEASED" || slice.leaseOwner !== input.leaseOwner ||
      !slice.leaseExpiresAt || slice.leaseExpiresAt <= input.now) throw new Error("Sync preparation ownership unavailable");
    const evidence = await tx.syncSliceEvidence.findMany({ where: { sliceId: slice.id },
      include: { rawSourceRecord: true, normalizationRun: true } });
    if (!evidence.length || evidence.some((row) => row.accountId !== input.accountId ||
      row.channelConnectionId !== input.channelConnectionId || row.runId !== slice.runId ||
      row.rawSourceRecord.ingestionRunId !== slice.runId || row.normalizationRun.rawSourceRecordId !== row.rawSourceRecordId ||
      row.normalizationRun.mappingVersionId !== slice.run.mappingVersionId || row.normalizationRun.status !== "SUCCEEDED")) {
      throw new Error("Sync slice has incomplete raw normalization evidence");
    }
    const changed = await tx.syncSlice.updateMany({ where: { id: slice.id, status: "LEASED",
      leaseOwner: input.leaseOwner, leaseExpiresAt: { gt: input.now } }, data: { status: "PREPARED" } });
    if (changed.count !== 1) throw new Error("Sync slice changed during preparation");
  });
}

export async function releaseSyncSlice(db: PrismaClient, input: { sliceId: string; leaseOwner: string }) {
  const result = await db.syncSlice.updateMany({ where: { id: input.sliceId, status: { in: ["LEASED", "PREPARED"] }, leaseOwner: input.leaseOwner },
    data: { status: "FAILED", leaseOwner: null, leaseExpiresAt: null } });
  if (result.count !== 1) throw new Error("Sync lease owner mismatch");
}

/** Call only after all slice persistence succeeds; this API changes slice and checkpoint atomically. */
export async function completeSyncSlice(db: PrismaClient, input: {
  sliceId: string; accountId: string; channelConnectionId: string; leaseOwner: string;
  authorizationVersion: string; mappingVersionId: string; cursorValue?: string;
  windowWatermark?: Date; now: Date; expectedProcessedSliceId: string | null;
}) {
  return db.$transaction(async (tx) => {
    const slice = await tx.syncSlice.findUnique({ where: { id: input.sliceId }, include: { run: true } });
    const channel = await tx.channelConnection.findUnique({ where: { id: input.channelConnectionId }, include: { account: true } });
    const authorization = await tx.coreChannelAuthorization.findUnique({ where: { channelConnectionId: input.channelConnectionId } });
    if (!slice || !channel || slice.accountId !== input.accountId || slice.channelConnectionId !== input.channelConnectionId ||
      channel.accountId !== input.accountId || channel.status !== "ACTIVE" || channel.account.status !== "ACTIVE" ||
      authorization?.accountId !== input.accountId || authorization.authorizationVersion !== input.authorizationVersion ||
      slice.run.authorizationVersion !== input.authorizationVersion || slice.authorizationVersion !== input.authorizationVersion ||
      slice.run.mappingVersionId !== input.mappingVersionId || !["PENDING", "RUNNING"].includes(slice.run.status) || slice.status !== "PREPARED" ||
      slice.stream !== slice.run.stream ||
      slice.leaseOwner !== input.leaseOwner || !slice.leaseExpiresAt || slice.leaseExpiresAt <= input.now) throw new Error("Sync commit ownership, lease or version mismatch");
    const evidence = await tx.syncSliceEvidence.findMany({ where: { sliceId: slice.id },
      include: { rawSourceRecord: true, normalizationRun: true } });
    if (!evidence.length || evidence.some((row) => row.accountId !== input.accountId ||
      row.channelConnectionId !== input.channelConnectionId || row.runId !== slice.runId ||
      row.rawSourceRecord.accountId !== input.accountId || row.rawSourceRecord.channelConnectionId !== input.channelConnectionId ||
      row.rawSourceRecord.ingestionRunId !== slice.runId ||
      row.normalizationRun.accountId !== input.accountId || row.normalizationRun.channelConnectionId !== input.channelConnectionId ||
      row.normalizationRun.rawSourceRecordId !== row.rawSourceRecordId ||
      row.normalizationRun.mappingVersionId !== slice.run.mappingVersionId || row.normalizationRun.status !== "SUCCEEDED")) {
      throw new Error("Sync checkpoint requires durable exact-slice normalization evidence");
    }
    const scope = marketplaceScopeKey(slice.marketplaceId);
    if (scope !== slice.marketplaceScopeKey) throw new Error("Invalid marketplace scope");
    const checkpoint = await tx.syncCheckpoint.findUnique({ where: { channelConnectionId_marketplaceScopeKey_stream: {
      channelConnectionId: slice.channelConnectionId, marketplaceScopeKey: scope, stream: slice.stream,
    } } });
    if ((checkpoint?.processedSliceId ?? null) !== input.expectedProcessedSliceId ||
      (checkpoint && (checkpoint.accountId !== input.accountId || checkpoint.marketplaceId !== slice.marketplaceId))) {
      throw new Error("Sync checkpoint changed concurrently");
    }
    const updated = await tx.syncSlice.updateMany({ where: { id: slice.id, status: "PREPARED", leaseOwner: input.leaseOwner,
      authorizationVersion: input.authorizationVersion, leaseExpiresAt: { gt: input.now } },
      data: { status: "SUCCEEDED", leaseOwner: null, leaseExpiresAt: null } });
    if (updated.count !== 1) throw new Error("Sync slice changed concurrently");
    return tx.syncCheckpoint.upsert({ where: { channelConnectionId_marketplaceScopeKey_stream: {
      channelConnectionId: slice.channelConnectionId, marketplaceScopeKey: scope, stream: slice.stream,
    } }, create: { accountId: input.accountId, channelConnectionId: input.channelConnectionId,
      marketplaceId: slice.marketplaceId, marketplaceScopeKey: scope, stream: slice.stream,
      authorizationVersion: input.authorizationVersion, mappingVersionId: input.mappingVersionId,
      processedSliceId: slice.id, cursorValue: input.cursorValue, windowWatermark: input.windowWatermark },
    update: { authorizationVersion: input.authorizationVersion, mappingVersionId: input.mappingVersionId,
      processedSliceId: slice.id, cursorValue: input.cursorValue, windowWatermark: input.windowWatermark } });
  });
}
