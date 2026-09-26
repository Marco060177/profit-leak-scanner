import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import {
  getAmazonAuthorizationMetadata, markAmazonAuthorizationReauthRequired,
  persistAmazonSellerAuthorization, resolveAmazonRefreshTokenForUse, revokeAmazonSellerAuthorization,
} from "../../app/connectors/amazon/amazon-authorization.server";
import {
  attachSourceObservationToSliceTx, claimSyncSlice, completeSyncSliceTx, prepareSyncSlice,
  recordSourceObservation, recordSourceObservationTx, storeRawSourceRecord,
} from "../../app/core/data-core-d1.server";
import { recordNormalizedOrderRevisionTx } from "../../app/core/data-core-d2a.server";
import { testCredentialEncryptionProvider } from "./test-credential-encryption";

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-amazon-e1a-"));
const databasePath = path.join(directory, "e1a.sqlite");
const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA foreign_keys=ON");
for (const name of readdirSync("prisma/migrations").filter((name) => /^\d{14}_/.test(name)).sort())
  sqlite.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
const db = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } } });
const secretOne = "refresh-token-one-for-e1a";
const secretTwo = "refresh-token-two-for-e1a";
const secretTenantB = "refresh-token-tenant-b-for-e1a";

try {
  const accountA = await db.account.create({ data: {} });
  const accountB = await db.account.create({ data: {} });
  const amazonA = await db.channelConnection.create({ data: { accountId: accountA.id, channel: "AMAZON", externalAccountId: "seller-a" } });
  const amazonB = await db.channelConnection.create({ data: { accountId: accountB.id, channel: "AMAZON", externalAccountId: "seller-b" } });
  const shopifyA = await db.channelConnection.create({ data: { accountId: accountA.id, channel: "SHOPIFY", externalAccountId: "shop-a.myshopify.com" } });
  const tenantA = { accountId: accountA.id, channelConnectionId: amazonA.id };
  const tenantB = { accountId: accountB.id, channelConnectionId: amazonB.id };
  const grantedAt = new Date("2026-09-28T12:00:00Z");

  await assert.rejects(persistAmazonSellerAuthorization(db, tenantA, { refreshToken: secretOne, grantedAt }),
    /encryption provider unavailable/i);
  const first = await persistAmazonSellerAuthorization(db, tenantA, { refreshToken: secretOne, grantedAt }, testCredentialEncryptionProvider);
  await persistAmazonSellerAuthorization(db, tenantB, { refreshToken: secretTenantB, grantedAt }, testCredentialEncryptionProvider);
  const row = await db.amazonSellerAuthorization.findUniqueOrThrow({ where: { channelConnectionId: amazonA.id } });
  assert.equal(Buffer.from(row.encryptedRefreshToken).includes(Buffer.from(secretOne)), false);
  assert.equal(JSON.stringify(first).includes(secretOne), false);
  assert.equal(await resolveAmazonRefreshTokenForUse(db, tenantA, testCredentialEncryptionProvider), secretOne);
  await assert.rejects(getAmazonAuthorizationMetadata(db, { accountId: accountA.id, channelConnectionId: amazonB.id }));
  await assert.rejects(resolveAmazonRefreshTokenForUse(db,
    { accountId: accountA.id, channelConnectionId: amazonB.id }, testCredentialEncryptionProvider));
  const replay = await persistAmazonSellerAuthorization(db, tenantA, { refreshToken: secretOne, grantedAt }, testCredentialEncryptionProvider);
  assert.equal(replay.replayed, true);
  assert.equal(replay.authorizationVersion, first.authorizationVersion);

  const rotated = await persistAmazonSellerAuthorization(db, tenantA, { refreshToken: secretTwo, grantedAt }, testCredentialEncryptionProvider);
  assert.notEqual(rotated.authorizationVersion, first.authorizationVersion);
  assert.equal((await db.coreChannelAuthorization.findUniqueOrThrow({ where: { channelConnectionId: amazonA.id } })).authorizationVersion,
    rotated.authorizationVersion);
  await assert.rejects(getAmazonAuthorizationMetadata(db, { accountId: accountB.id, channelConnectionId: amazonA.id }));
  await assert.rejects(resolveAmazonRefreshTokenForUse(db, { accountId: accountB.id, channelConnectionId: amazonA.id }, testCredentialEncryptionProvider));
  await assert.rejects(persistAmazonSellerAuthorization(db, { accountId: accountA.id, channelConnectionId: shopifyA.id },
    { refreshToken: secretOne, grantedAt }, testCredentialEncryptionProvider));

  const reauth = await markAmazonAuthorizationReauthRequired(db, tenantA, new Date("2026-10-01Z"));
  assert.notEqual(reauth.authorizationVersion, rotated.authorizationVersion);
  await assert.rejects(resolveAmazonRefreshTokenForUse(db, tenantA, testCredentialEncryptionProvider));
  const reauthReplay = await markAmazonAuthorizationReauthRequired(db, tenantA, new Date("2026-10-02Z"));
  assert.equal(reauthReplay.authorizationVersion, reauth.authorizationVersion);
  const active = await persistAmazonSellerAuthorization(db, tenantA, { refreshToken: secretTwo, grantedAt }, testCredentialEncryptionProvider);
  assert.notEqual(active.authorizationVersion, reauth.authorizationVersion);
  const revoked = await revokeAmazonSellerAuthorization(db, tenantA, new Date("2026-10-03Z"));
  assert.equal(revoked.status, "REVOKED");
  await assert.rejects(resolveAmazonRefreshTokenForUse(db, tenantA, testCredentialEncryptionProvider));
  const columns = sqlite.prepare("PRAGMA table_info('AmazonSellerAuthorization')").all() as Array<{ name: string }>;
  assert.equal(columns.some((column) => /accessToken|authorizationCode/i.test(column.name)), false);

  const restored = await persistAmazonSellerAuthorization(db, tenantA, { refreshToken: secretTwo, grantedAt }, testCredentialEncryptionProvider);
  const mapping = await db.mappingVersion.create({ data: { platform: "AMAZON", sourceContract: "orders-v2026-01-01",
    sourceVersion: "2026-01-01", mapperSemanticVersion: "e1a-test", formulaCompatibilityVersion: "d2a-v1",
    checksum: "amazon-e1a-mapping", activatedAt: new Date() } });

  const makeRun = async (key: string) => {
    const run = await db.syncRun.create({ data: { ...tenantA, stream: "orders", authorizationVersion: restored.authorizationVersion,
      mappingVersionId: mapping.id, status: "RUNNING" } });
    const slice = await db.syncSlice.create({ data: { ...tenantA, runId: run.id, marketplaceScopeKey: "@none", stream: "orders",
      sliceKey: key, authorizationVersion: restored.authorizationVersion } });
    assert.equal(await claimSyncSlice(db, { ...tenantA, sliceId: slice.id, authorizationVersion: restored.authorizationVersion,
      leaseOwner: "e1a-test", now: new Date("2026-10-04Z"), leaseMs: 60000 }), true);
    return { run, slice };
  };
  const payloadA = Buffer.from('{"orderId":"ORDER-A","status":"UNSHIPPED"}');
  const payloadB = Buffer.from('{"orderId":"ORDER-A","status":"SHIPPED"}');
  const encryptChunk = (plain: Uint8Array) => Buffer.concat([Buffer.from("test:"), plain]);
  const run1 = await makeRun("run-1");
  const rawA = await storeRawSourceRecord(db, { ...tenantA, sourceSystem: "AMAZON", sourceVersion: "2026-01-01",
    sourceEntityType: "ORDER", sourceEntityId: "ORDER-A", schemaVersion: "1", retentionClass: "TEST",
    capturedAt: new Date("2026-10-04Z"), ingestionRunId: run1.run.id, payload: payloadA, encryptChunk });
  const norm1 = await db.normalizationRun.create({ data: { ...tenantA, rawSourceRecordId: rawA.id, mappingVersionId: mapping.id,
    parserVersion: "e1a", normalizationRevision: 1, status: "SUCCEEDED", finishedAt: new Date("2026-10-04Z") } });
  const observation1 = await recordSourceObservation(db, { ...tenantA, runId: run1.run.id, sliceId: run1.slice.id,
    rawSourceRecordId: rawA.id, sourceSystem: "AMAZON", sourceEntityType: "ORDER", sourceEntityId: "ORDER-A",
    observedAt: new Date("2026-10-04Z"), authorizationVersion: restored.authorizationVersion });
  const observationReplay = await recordSourceObservation(db, { ...tenantA, runId: run1.run.id, sliceId: run1.slice.id,
    rawSourceRecordId: rawA.id, sourceSystem: "AMAZON", sourceEntityType: "ORDER", sourceEntityId: "ORDER-A",
    observedAt: new Date("2026-10-04Z"), authorizationVersion: restored.authorizationVersion });
  assert.equal(observationReplay.id, observation1.id);
  assert.equal(observationReplay.replayed, true);
  const evidence1 = await db.$transaction((tx) => attachSourceObservationToSliceTx(tx, { ...tenantA, sliceId: run1.slice.id,
    sourceObservationId: observation1.id, normalizationRunId: norm1.id, leaseOwner: "e1a-test", now: new Date("2026-10-04T00:00:01Z") }));
  const evidenceReplay = await db.$transaction((tx) => attachSourceObservationToSliceTx(tx, { ...tenantA, sliceId: run1.slice.id,
    sourceObservationId: observation1.id, normalizationRunId: norm1.id, leaseOwner: "e1a-test", now: new Date("2026-10-04T00:00:01Z") }));
  assert.equal(evidenceReplay.id, evidence1.id);
  assert.equal(evidence1.sourceObservationId, observation1.id);
  assert.equal(evidence1.rawSourceRecordId, rawA.id);

  const run2 = await makeRun("run-2");
  const reusedRawA = await storeRawSourceRecord(db, { ...tenantA, sourceSystem: "AMAZON", sourceVersion: "2026-01-01",
    sourceEntityType: "ORDER", sourceEntityId: "ORDER-A", schemaVersion: "1", retentionClass: "TEST",
    capturedAt: new Date("2026-10-05Z"), ingestionRunId: run2.run.id, payload: payloadA, encryptChunk });
  assert.equal(reusedRawA.id, rawA.id);
  const norm2 = await db.normalizationRun.create({ data: { ...tenantA, rawSourceRecordId: rawA.id, mappingVersionId: mapping.id,
    parserVersion: "e1a", normalizationRevision: 2, status: "SUCCEEDED", finishedAt: new Date("2026-10-05Z") } });
  const observation2 = await recordSourceObservation(db, { ...tenantA, runId: run2.run.id, sliceId: run2.slice.id,
    rawSourceRecordId: rawA.id, sourceSystem: "AMAZON", sourceEntityType: "ORDER", sourceEntityId: "ORDER-A",
    observedAt: new Date("2026-10-05Z"), authorizationVersion: restored.authorizationVersion });
  assert.notEqual(observation2.id, observation1.id);
  await db.$transaction((tx) => attachSourceObservationToSliceTx(tx, { ...tenantA, sliceId: run2.slice.id,
    sourceObservationId: observation2.id, normalizationRunId: norm2.id, leaseOwner: "e1a-test", now: new Date("2026-10-04T00:00:01Z") }));
  await prepareSyncSlice(db, { ...tenantA, sliceId: run2.slice.id, leaseOwner: "e1a-test",
    authorizationVersion: restored.authorizationVersion, now: new Date("2026-10-04T00:00:02Z") });

  const run3 = await makeRun("run-3");
  const rawB = await storeRawSourceRecord(db, { ...tenantA, sourceSystem: "AMAZON", sourceVersion: "2026-01-01",
    sourceEntityType: "ORDER", sourceEntityId: "ORDER-A", schemaVersion: "1", retentionClass: "TEST",
    capturedAt: new Date("2026-10-06Z"), ingestionRunId: run3.run.id, payload: payloadB, encryptChunk });
  assert.notEqual(rawB.id, rawA.id);
  const observation3 = await recordSourceObservation(db, { ...tenantA, runId: run3.run.id, sliceId: run3.slice.id,
    rawSourceRecordId: rawB.id, sourceSystem: "AMAZON", sourceEntityType: "ORDER", sourceEntityId: "ORDER-A",
    observedAt: new Date("2026-10-06Z"), authorizationVersion: restored.authorizationVersion });
  assert.notEqual(observation3.id, observation2.id);
  await assert.rejects(db.$transaction((tx) => recordSourceObservationTx(tx, { ...tenantB, runId: run2.run.id,
    sliceId: run2.slice.id, rawSourceRecordId: rawA.id, sourceSystem: "AMAZON", sourceEntityType: "ORDER",
    sourceEntityId: "ORDER-A", observedAt: new Date(), authorizationVersion: restored.authorizationVersion })));
  await assert.rejects(db.$transaction((tx) => recordSourceObservationTx(tx, { accountId: accountA.id,
    channelConnectionId: shopifyA.id, runId: run2.run.id, sliceId: run2.slice.id, rawSourceRecordId: rawA.id,
    sourceSystem: "AMAZON", sourceEntityType: "ORDER", sourceEntityId: "ORDER-A", observedAt: new Date(),
    authorizationVersion: restored.authorizationVersion })));
  await assert.rejects(db.$transaction((tx) => attachSourceObservationToSliceTx(tx, { ...tenantB,
    sliceId: run2.slice.id, sourceObservationId: observation2.id, normalizationRunId: norm2.id,
    leaseOwner: "e1a-test", now: new Date("2026-10-04T00:00:01Z") })));

  await db.$executeRawUnsafe("CREATE TRIGGER E1A_checkpoint_abort BEFORE INSERT ON SyncCheckpoint BEGIN SELECT RAISE(ABORT,'e1a rollback'); END");
  const provenance = { rawSourceRecordId: rawA.id, normalizationRunId: norm2.id, mappingVersionId: mapping.id,
    normalizationRevision: 2, syncSliceEvidenceId: (await db.syncSliceEvidence.findFirstOrThrow({ where: { sliceId: run2.slice.id } })).id };
  await assert.rejects(db.$transaction(async (tx) => {
    await recordNormalizedOrderRevisionTx(tx, tenantA, { ...provenance, marketplaceId: null, sourceSystem: "AMAZON",
      sourceOrderKey: "ORDER-A", operationKey: "order-a-v1", normalizedStatus: "UNSHIPPED", occurredAt: new Date("2026-10-01Z") });
    await completeSyncSliceTx(tx, { ...tenantA, sliceId: run2.slice.id, leaseOwner: "e1a-test",
      authorizationVersion: restored.authorizationVersion, mappingVersionId: mapping.id, now: new Date("2026-10-04T00:00:03Z"),
      expectedProcessedSliceId: null });
  }));
  assert.equal(await db.normalizedOrder.count({ where: { sourceOrderKey: "ORDER-A" } }), 0);
  assert.equal((await db.syncSlice.findUniqueOrThrow({ where: { id: run2.slice.id } })).status, "PREPARED");
  assert.equal(await db.syncCheckpoint.count(), 0);
  await db.$executeRawUnsafe("DROP TRIGGER E1A_checkpoint_abort");
  await db.$transaction(async (tx) => {
    await recordNormalizedOrderRevisionTx(tx, tenantA, { ...provenance, marketplaceId: null, sourceSystem: "AMAZON",
      sourceOrderKey: "ORDER-A", operationKey: "order-a-v1", normalizedStatus: "UNSHIPPED", occurredAt: new Date("2026-10-01Z") });
    await completeSyncSliceTx(tx, { ...tenantA, sliceId: run2.slice.id, leaseOwner: "e1a-test",
      authorizationVersion: restored.authorizationVersion, mappingVersionId: mapping.id, now: new Date("2026-10-04T00:00:03Z"),
      expectedProcessedSliceId: null });
  });
  assert.equal(await db.normalizedOrder.count({ where: { sourceOrderKey: "ORDER-A" } }), 1);
  assert.equal((await db.syncSlice.findUniqueOrThrow({ where: { id: run2.slice.id } })).status, "SUCCEEDED");
  await assert.rejects(db.$transaction((tx) => completeSyncSliceTx(tx, { ...tenantB, sliceId: run2.slice.id,
    leaseOwner: "e1a-test", authorizationVersion: restored.authorizationVersion, mappingVersionId: mapping.id,
    now: new Date("2026-10-04T00:00:04Z"), expectedProcessedSliceId: null })));
  await assert.rejects(db.$transaction((tx) => completeSyncSliceTx(tx, { ...tenantA, sliceId: run2.slice.id,
    leaseOwner: "e1a-test", authorizationVersion: restored.authorizationVersion, mappingVersionId: mapping.id,
    now: new Date("2026-10-04T00:00:04Z"), expectedProcessedSliceId: null })));

  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((sqlite.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  assert.equal(JSON.stringify(await getAmazonAuthorizationMetadata(db, tenantA)).includes(secretTwo), false);
  console.log("Amazon E1-A authorization, secret safety, cross-run observations, tenancy and atomic completion: PASS");
} finally {
  await db.$disconnect();
  sqlite.close();
  rmSync(directory, { recursive: true, force: true });
}
