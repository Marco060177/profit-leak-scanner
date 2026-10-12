import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import {
  RAW_CHUNK_BYTES,
  rawSourceEncryptionContext,
  storeRawSourceRecord,
} from "../../app/core/data-core-d1.server";
import { createEbayD1EncryptionProvider } from "../../app/connectors/ebay/ebay-d1-encryption.server";

const keyV1 = randomBytes(32).toString("base64");
const keyV2 = randomBytes(32).toString("base64");
const environment = (current: string, entries: Array<{ version: string; key: string }>) => ({
  MARGINLAB_ENCRYPTION_KEYRING: JSON.stringify(entries),
  MARGINLAB_ENCRYPTION_CURRENT_KEY_VERSION: current,
});
const providerV1 = createEbayD1EncryptionProvider(environment("prod-v1", [
  { version: "prod-v1", key: keyV1 },
]));
const providerV2 = createEbayD1EncryptionProvider(environment("prod-v2", [
  { version: "prod-v1", key: keyV1 }, { version: "prod-v2", key: keyV2 },
]));
const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-ebay-ed3i-"));
const databasePath = path.join(directory, "ed3i.sqlite");
const sqlite = new DatabaseSync(databasePath);
sqlite.exec("PRAGMA foreign_keys=ON");
for (const name of readdirSync("prisma/migrations").filter((name) => /^\d{14}_/.test(name)).sort())
  sqlite.exec(readFileSync(path.join("prisma/migrations", name, "migration.sql"), "utf8"));
const db = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } } });

try {
  const account = await db.account.create({ data: {} });
  const channel = await db.channelConnection.create({ data: { accountId: account.id, channel: "EBAY",
    externalAccountId: "ed3i-seller" } });
  const payload = Buffer.alloc(RAW_CHUNK_BYTES + 137, 0x41);
  const source = { accountId: account.id, channelConnectionId: channel.id, sourceSystem: "EBAY",
    sourceVersion: "ebay-ed3i-test-v1", sourceEntityType: "ORDER", sourceEntityId: "ORDER-ED3I",
    schemaVersion: "ebay-ed3i-test-v1", retentionClass: "COMMERCE_SOURCE",
    capturedAt: new Date("2026-10-11T14:00:00Z"), payload };
  const raw = await storeRawSourceRecord(db, { ...source,
    encryptChunk: (plain, index, context) => providerV1.encryptChunk(plain, index, context) });
  const stored = await db.rawSourceRecord.findUniqueOrThrow({ where: { id: raw.id },
    include: { chunks: { orderBy: { chunkIndex: "asc" } } } });
  assert.equal(stored.chunks.length, 2);
  assert(stored.chunks.every((chunk) => !Buffer.from(chunk.encryptedBytes).includes(Buffer.from("AAAA"))));
  const context = rawSourceEncryptionContext(stored);
  const reconstructed = Buffer.concat(stored.chunks.map((chunk) => Buffer.from(providerV2.decryptChunk(
    new Uint8Array(chunk.encryptedBytes), chunk.chunkIndex, context))));
  assert.deepEqual(reconstructed, payload);
  assert.deepEqual(context, rawSourceEncryptionContext(stored));

  const firstChunk = new Uint8Array(stored.chunks[0].encryptedBytes);
  assert.throws(() => providerV2.decryptChunk(firstChunk, 0, { ...context, accountId: "wrong-account" }));
  assert.throws(() => providerV2.decryptChunk(firstChunk, 0,
    { ...context, channelConnectionId: "wrong-channel" }));
  assert.throws(() => providerV2.decryptChunk(firstChunk, 1, context));
  assert.throws(() => providerV2.decryptChunk(firstChunk, 0, { ...context, recordIdentity: "wrong-record" }));
  const tampered = Buffer.from(firstChunk); tampered[tampered.length - 1] ^= 1;
  assert.throws(() => providerV2.decryptChunk(tampered, 0, context));
  const unknownFormat = Buffer.from(firstChunk); unknownFormat[0] ^= 1;
  assert.throws(() => providerV2.decryptChunk(unknownFormat, 0, context));
  const withoutHistoricalKey = createEbayD1EncryptionProvider(environment("prod-v2", [
    { version: "prod-v2", key: keyV2 },
  ]));
  assert.throws(() => withoutHistoricalKey.decryptChunk(firstChunk, 0, context));

  const beforeFailure = await db.rawSourceRecord.count();
  await assert.rejects(storeRawSourceRecord(db, { ...source, sourceEntityId: "ATOMIC-FAILURE",
    encryptChunk: (plain, index, encryptionContext) => {
      if (index === 1) throw new Error("controlled encryption failure");
      return providerV2.encryptChunk(plain, index, encryptionContext);
    } }));
  assert.equal(await db.rawSourceRecord.count(), beforeFailure);
  assert.equal(await db.rawSourceBlobChunk.count({ where: { rawSourceRecordId: { not: raw.id } } }), 0);

  await assert.rejects(db.rawSourceBlobChunk.update({ where: { id: stored.chunks[0].id },
    data: { encryptedBytes: Buffer.from("replacement") } }));
  assert.deepEqual(Buffer.from((await db.rawSourceBlobChunk.findUniqueOrThrow({
    where: { id: stored.chunks[0].id },
  })).encryptedBytes), Buffer.from(stored.chunks[0].encryptedBytes));
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((sqlite.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  console.log("ED3-I eBay D1 production encryption tests passed");
} finally {
  await db.$disconnect();
  sqlite.close();
  rmSync(directory, { recursive: true, force: true });
}
