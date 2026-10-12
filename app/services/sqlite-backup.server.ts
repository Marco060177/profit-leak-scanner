import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sqlite3 from "sqlite3";

type SqliteRow = Record<string, unknown>;
type SqliteBackupHandle = Readonly<{
  step(pages: number, callback: (error: Error | null, completed: boolean) => void): void;
  finish(callback: (error: Error | null) => void): void;
}>;
type BackupCapableDatabase = sqlite3.Database & {
  backup(filename: string, callback: (error: Error | null) => void): SqliteBackupHandle;
};

export type SqliteDatabaseProof = Readonly<{
  integrity: "ok";
  foreignKeyViolations: 0;
  schemaChecksum: string;
  tableCounts: Readonly<Record<string, number>>;
  appliedMigrations: readonly string[];
}>;

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function openDatabase(filename: string, mode: number): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    const database = new sqlite3.Database(filename, mode, (error) => error ? reject(error) : resolve(database));
  });
}

function closeDatabase(database: sqlite3.Database): Promise<void> {
  return new Promise((resolve, reject) => database.close((error) => error ? reject(error) : resolve()));
}

function get<T extends SqliteRow>(database: sqlite3.Database, sql: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => database.get<T>(sql,
    (error, row) => error ? reject(error) : resolve(row)));
}

function all<T extends SqliteRow>(database: sqlite3.Database, sql: string): Promise<T[]> {
  return new Promise((resolve, reject) => database.all<T>(sql,
    (error, rows) => error ? reject(error) : resolve(rows)));
}

function onlineBackup(database: sqlite3.Database, destination: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const state: { handle?: SqliteBackupHandle } = {};
    const finish = (failure?: Error | null) => state.handle?.finish((finishError) => {
      if (failure || finishError) reject(failure ?? finishError);
      else resolve();
    });
    const createdHandle = (database as BackupCapableDatabase).backup(destination, (initializationError) => {
      if (initializationError) { finish(initializationError); return; }
      state.handle!.step(-1, (stepError, completed) => {
        if (stepError || !completed) finish(stepError ?? new Error("SQLite online backup incomplete"));
        else finish();
      });
    });
    state.handle = createdHandle;
  });
}

function reserveNewFile(filename: string) {
  mkdirSync(path.dirname(filename), { recursive: true });
  closeSync(openSync(filename, "wx", 0o600));
}

function canonicalPath(filename: string) {
  if (!filename || filename.includes("\0")) throw new Error("SQLite path rejected");
  return path.resolve(filename);
}

export function sqlitePathFromDatabaseUrl(databaseUrl: string | undefined) {
  if (!databaseUrl?.startsWith("file:") || databaseUrl.includes("\0"))
    throw new Error("SQLite DATABASE_URL rejected");
  const withoutQuery = databaseUrl.slice("file:".length).split("?")[0];
  if (!withoutQuery) throw new Error("SQLite DATABASE_URL rejected");
  return canonicalPath(decodeURIComponent(withoutQuery));
}

export function expectedPrismaMigrations(migrationsDirectory = "prisma/migrations") {
  return readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{14}_[A-Za-z0-9_-]+$/.test(entry.name))
    .map((entry) => entry.name).sort();
}

async function databaseProof(database: sqlite3.Database,
  expectedMigrations: readonly string[]): Promise<SqliteDatabaseProof> {
  const integrityRows = await all<{ integrity_check: string }>(database, "PRAGMA integrity_check");
  if (integrityRows.length !== 1 || integrityRows[0].integrity_check !== "ok")
    throw new Error("SQLite integrity verification failed");
  const foreignKeys = await all<SqliteRow>(database, "PRAGMA foreign_key_check");
  if (foreignKeys.length !== 0) throw new Error("SQLite foreign-key verification failed");

  const schema = await all<{ type: string; name: string; tbl_name: string; sql: string | null }>(database,
    "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name");
  const tables = schema.filter((entry) => entry.type === "table" && entry.name !== "_prisma_migrations")
    .map((entry) => entry.name);
  const tableCounts: Record<string, number> = {};
  for (const table of tables) {
    if (!IDENTIFIER.test(table)) throw new Error("SQLite identifier verification failed");
    const row = await get<{ count: number }>(database, `SELECT COUNT(*) AS count FROM "${table}"`);
    if (!row || !Number.isSafeInteger(row.count) || row.count < 0) throw new Error("SQLite row-count verification failed");
    tableCounts[table] = row.count;
  }

  const migrationTable = schema.some((entry) => entry.type === "table" && entry.name === "_prisma_migrations");
  if (!migrationTable) throw new Error("Prisma migration history missing");
  const migrations = await all<{ migration_name: string }>(database,
    "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name");
  const appliedMigrations = migrations.map((entry) => entry.migration_name);
  if (new Set(appliedMigrations).size !== appliedMigrations.length ||
      appliedMigrations.length !== expectedMigrations.length ||
      appliedMigrations.some((name, index) => name !== expectedMigrations[index]))
    throw new Error("Prisma migration history mismatch");

  return Object.freeze({ integrity: "ok", foreignKeyViolations: 0,
    schemaChecksum: createHash("sha256").update(JSON.stringify(schema)).digest("hex"),
    tableCounts: Object.freeze(tableCounts), appliedMigrations: Object.freeze(appliedMigrations) });
}

export async function verifySqliteDatabase(input: {
  databasePath: string;
  expectedMigrations?: readonly string[];
}): Promise<SqliteDatabaseProof> {
  const databasePath = canonicalPath(input.databasePath);
  const database = await openDatabase(databasePath, sqlite3.OPEN_READONLY | sqlite3.OPEN_FULLMUTEX);
  try { return await databaseProof(database, input.expectedMigrations ?? expectedPrismaMigrations()); }
  finally { await closeDatabase(database); }
}

export async function createConsistentSqliteBackup(input: {
  sourceDatabasePath: string;
  destinationPath: string;
  expectedMigrations?: readonly string[];
}) {
  const sourceDatabasePath = canonicalPath(input.sourceDatabasePath);
  const destinationPath = canonicalPath(input.destinationPath);
  if (sourceDatabasePath === destinationPath || !existsSync(sourceDatabasePath))
    throw new Error("SQLite backup paths rejected");
  reserveNewFile(destinationPath);
  let source: sqlite3.Database | undefined;
  try {
    source = await openDatabase(sourceDatabasePath, sqlite3.OPEN_READONLY | sqlite3.OPEN_FULLMUTEX);
    await onlineBackup(source, destinationPath);
    const proof = await verifySqliteDatabase({ databasePath: destinationPath,
      expectedMigrations: input.expectedMigrations });
    return Object.freeze({ destinationPath, proof });
  } catch (error) {
    rmSync(destinationPath, { force: true });
    throw error;
  } finally {
    if (source) await closeDatabase(source);
  }
}

export async function verifySqliteBackupRestore(input: {
  backupPath: string;
  expectedMigrations?: readonly string[];
  temporaryRoot?: string;
}) {
  const backupPath = canonicalPath(input.backupPath);
  if (!existsSync(backupPath)) throw new Error("SQLite backup unavailable");
  const temporaryRoot = input.temporaryRoot ?? os.tmpdir();
  mkdirSync(temporaryRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(path.join(temporaryRoot, "marginlab-restore-proof-"));
  const restoredPath = path.join(temporaryDirectory, "restored.sqlite");
  let source: sqlite3.Database | undefined;
  try {
    const backupProof = await verifySqliteDatabase({ databasePath: backupPath,
      expectedMigrations: input.expectedMigrations });
    reserveNewFile(restoredPath);
    source = await openDatabase(backupPath, sqlite3.OPEN_READONLY | sqlite3.OPEN_FULLMUTEX);
    await onlineBackup(source, restoredPath);
    await closeDatabase(source); source = undefined;
    const restoredProof = await verifySqliteDatabase({ databasePath: restoredPath,
      expectedMigrations: input.expectedMigrations });
    if (backupProof.schemaChecksum !== restoredProof.schemaChecksum ||
        JSON.stringify(backupProof.tableCounts) !== JSON.stringify(restoredProof.tableCounts) ||
        JSON.stringify(backupProof.appliedMigrations) !== JSON.stringify(restoredProof.appliedMigrations))
      throw new Error("SQLite restore verification mismatch");
    return Object.freeze({ verified: true as const, backupProof, restoredProof });
  } finally {
    if (source) await closeDatabase(source);
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}
