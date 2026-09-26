import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-amazon-e1a-upgrade-"));
const databasePath = path.join(directory, "upgrade.sqlite");
const migrationNames = readdirSync("prisma/migrations").filter((name) => /^\d{14}_/.test(name)).sort();
const e1aMigration = migrationNames.at(-1)!;
assert.match(e1aMigration, /amazon_e1a_authorization_observation$/);
const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA foreign_keys=ON");
for (const name of migrationNames.slice(0, -1))
  sqlite.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
const db = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } } });

try {
  const account = await db.account.create({ data: {} });
  const channel = await db.channelConnection.create({ data: { accountId: account.id, channel: "AMAZON", externalAccountId: "upgrade-seller" } });
  const authorization = await db.coreChannelAuthorization.create({ data: { accountId: account.id,
    channelConnectionId: channel.id, authorizationVersion: "upgrade-auth", updatedAt: new Date() } });
  const mapping = await db.mappingVersion.create({ data: { platform: "AMAZON", sourceContract: "upgrade", sourceVersion: "1",
    mapperSemanticVersion: "1", formulaCompatibilityVersion: "1", checksum: "upgrade", activatedAt: new Date() } });
  const run = await db.syncRun.create({ data: { accountId: account.id, channelConnectionId: channel.id, stream: "orders",
    authorizationVersion: authorization.authorizationVersion, mappingVersionId: mapping.id, status: "RUNNING" } });
  const slice = await db.syncSlice.create({ data: { accountId: account.id, channelConnectionId: channel.id, runId: run.id,
    marketplaceScopeKey: "@none", stream: "orders", sliceKey: "upgrade", authorizationVersion: authorization.authorizationVersion,
    status: "LEASED", leaseOwner: "upgrade", leaseExpiresAt: new Date("2099-01-01Z") } });
  const raw = await db.rawSourceRecord.create({ data: { accountId: account.id, channelConnectionId: channel.id,
    sourceSystem: "AMAZON", sourceVersion: "1", sourceEntityType: "ORDER", sourceEntityId: "UPGRADE-1",
    capturedAt: new Date(), schemaVersion: "1", payloadChecksum: "upgrade-payload", payloadByteLength: 1,
    retentionClass: "TEST", ingestionRunId: run.id } });
  const normalization = await db.normalizationRun.create({ data: { accountId: account.id, channelConnectionId: channel.id,
    rawSourceRecordId: raw.id, mappingVersionId: mapping.id, parserVersion: "1", normalizationRevision: 1,
    status: "SUCCEEDED", finishedAt: new Date() } });
  const evidence = { id: "upgrade-evidence" };
  await db.$executeRawUnsafe(`INSERT INTO SyncSliceEvidence
    (id,accountId,channelConnectionId,sliceId,runId,rawSourceRecordId,normalizationRunId)
    VALUES (?,?,?,?,?,?,?)`, evidence.id, account.id, channel.id, slice.id, run.id, raw.id, normalization.id);
  await db.$disconnect();

  sqlite.exec(readFileSync(path.join("prisma/migrations", e1aMigration, "migration.sql"), "utf8"));
  assert.equal((sqlite.prepare("SELECT id FROM SyncSliceEvidence WHERE id=?").get(evidence.id) as { id: string }).id, evidence.id);
  const columns = sqlite.prepare("PRAGMA table_info('SyncSliceEvidence')").all() as Array<{ name: string }>;
  assert.equal(columns.some((column) => column.name === "sourceObservationId"), true);
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((sqlite.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  console.log("Amazon E1-A migration 1-24 upgrade with existing D1 evidence: PASS");
} finally {
  await db.$disconnect().catch(() => undefined);
  sqlite.close();
  rmSync(directory, { recursive: true, force: true });
}
