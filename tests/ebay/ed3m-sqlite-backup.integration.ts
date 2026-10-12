import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sqlite3 from "sqlite3";
import {
  createConsistentSqliteBackup,
  sqlitePathFromDatabaseUrl,
  verifySqliteBackupRestore,
  verifySqliteDatabase,
} from "../../app/services/sqlite-backup.server";

const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-ed3m-"));
const sourcePath = path.join(directory, "source.sqlite");
const backupPath = path.join(directory, "external", "backup.sqlite");
const restoreTempRoot = path.join(directory, "restore-temp");
const migration = "20261011140000_ed3m_test_fixture";

const open = (filename: string) => new Promise<sqlite3.Database>((resolve, reject) => {
  const database = new sqlite3.Database(filename, (error) => error ? reject(error) : resolve(database));
});
const exec = (database: sqlite3.Database, sql: string) => new Promise<void>((resolve, reject) =>
  database.exec(sql, (error) => error ? reject(error) : resolve()));
const run = (database: sqlite3.Database, sql: string, parameters: readonly unknown[] = []) =>
  new Promise<void>((resolve, reject) => database.run(sql, parameters, (error) => error ? reject(error) : resolve()));
const close = (database: sqlite3.Database) => new Promise<void>((resolve, reject) =>
  database.close((error) => error ? reject(error) : resolve()));

let writer: sqlite3.Database | undefined;
try {
  writer = await open(sourcePath);
  await exec(writer, `
    PRAGMA foreign_keys=ON;
    PRAGMA journal_mode=WAL;
    CREATE TABLE _prisma_migrations (
      id TEXT PRIMARY KEY,
      migration_name TEXT NOT NULL,
      finished_at DATETIME,
      rolled_back_at DATETIME
    );
    CREATE TABLE Parent (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE Child (id INTEGER PRIMARY KEY, parentId INTEGER NOT NULL,
      FOREIGN KEY(parentId) REFERENCES Parent(id));
    INSERT INTO _prisma_migrations(id, migration_name, finished_at, rolled_back_at)
      VALUES ('migration-1', '${migration}', CURRENT_TIMESTAMP, NULL);
    INSERT INTO Parent(id, value) VALUES (1, 'economic-record');
    INSERT INTO Child(id, parentId) VALUES (1, 1);
  `);
  const largeValue = "x".repeat(8_192);
  await exec(writer, "BEGIN");
  for (let id = 2; id <= 2_000; id += 1)
    await run(writer, "INSERT INTO Parent(id, value) VALUES (?, ?)", [id, largeValue]);
  await exec(writer, "COMMIT");

  let nextId = 2_001;
  let keepWriting = true;
  const writes = (async () => {
    while (keepWriting && nextId < 2_100) {
      await run(writer!, "INSERT INTO Parent(id, value) VALUES (?, ?)", [nextId, `concurrent-${nextId}`]);
      nextId += 1;
      await new Promise((resolve) => setImmediate(resolve));
    }
  })();

  const backup = await createConsistentSqliteBackup({ sourceDatabasePath: sourcePath,
    destinationPath: backupPath, expectedMigrations: [migration] });
  keepWriting = false;
  await writes;
  assert.equal(backup.proof.integrity, "ok");
  assert.equal(backup.proof.foreignKeyViolations, 0);
  assert(backup.proof.tableCounts.Parent >= 2_000);

  const sourceProof = await verifySqliteDatabase({ databasePath: sourcePath, expectedMigrations: [migration] });
  assert(sourceProof.tableCounts.Parent >= backup.proof.tableCounts.Parent);
  assert.equal(sourceProof.tableCounts.Child, 1);
  assert.equal(sourceProof.integrity, "ok");

  assert.throws(() => sqlitePathFromDatabaseUrl("https://not-sqlite.example/database"));
  assert.equal(sqlitePathFromDatabaseUrl(`file:${sourcePath}`), path.resolve(sourcePath));
  await assert.rejects(createConsistentSqliteBackup({ sourceDatabasePath: sourcePath,
    destinationPath: backupPath, expectedMigrations: [migration] }));
  assert(existsSync(backupPath));

  await close(writer); writer = undefined;
  const beforeRestore = existsSync(restoreTempRoot) ? readdirSync(restoreTempRoot) : [];
  const restore = await verifySqliteBackupRestore({ backupPath,
    expectedMigrations: [migration], temporaryRoot: restoreTempRoot });
  assert.equal(restore.verified, true);
  assert.deepEqual(restore.backupProof, restore.restoredProof);
  assert.deepEqual(readdirSync(restoreTempRoot), beforeRestore);

  const rejectedPath = path.join(directory, "rejected.sqlite");
  await assert.rejects(createConsistentSqliteBackup({ sourceDatabasePath: sourcePath,
    destinationPath: rejectedPath, expectedMigrations: ["missing_migration"] }));
  assert.equal(existsSync(rejectedPath), false);
  writeFileSync(path.join(directory, "not-a-database.sqlite"), "not sqlite");
  await assert.rejects(verifySqliteBackupRestore({ backupPath: path.join(directory, "not-a-database.sqlite"),
    expectedMigrations: [migration], temporaryRoot: restoreTempRoot }));

  console.log("ED3-M SQLite online backup and isolated restore proof tests passed");
} finally {
  if (writer) await close(writer).catch(() => undefined);
  try { rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  catch { /* Windows native SQLite handles may release just after process exit. */ }
}
