import {
  createConsistentSqliteBackup,
  sqlitePathFromDatabaseUrl,
  verifySqliteBackupRestore,
} from "../app/services/sqlite-backup.server";

async function main() {
  const command = process.argv[2];
  const destination = process.env.SQLITE_BACKUP_DESTINATION;
  if (!destination) throw new Error("SQLITE_BACKUP_DESTINATION is required");
  if (command === "create") {
    const sourceDatabasePath = sqlitePathFromDatabaseUrl(process.env.DATABASE_URL);
    const result = await createConsistentSqliteBackup({ sourceDatabasePath, destinationPath: destination });
    console.log(JSON.stringify({ ok: true, operation: "backup", destinationPath: result.destinationPath,
      integrity: result.proof.integrity, foreignKeyViolations: result.proof.foreignKeyViolations,
      migrationCount: result.proof.appliedMigrations.length }));
    return;
  }
  if (command === "verify-restore") {
    const result = await verifySqliteBackupRestore({ backupPath: destination });
    console.log(JSON.stringify({ ok: result.verified, operation: "verify-restore",
      integrity: result.restoredProof.integrity,
      foreignKeyViolations: result.restoredProof.foreignKeyViolations,
      migrationCount: result.restoredProof.appliedMigrations.length }));
    return;
  }
  throw new Error("Usage: sqlite-backup <create|verify-restore>");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "SQLite backup operation failed");
  process.exitCode = 1;
});
