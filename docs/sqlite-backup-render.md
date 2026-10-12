# SQLite backup and restore proof on Render

MarginLab creates backups through SQLite's Online Backup API. Never copy the live database file, its WAL, or its journal with a filesystem copy.

## Create and verify

Run these commands in the web-service runtime, where the persistent disk is mounted. Choose a new destination name for every run; an existing file is rejected.

```sh
SQLITE_BACKUP_DESTINATION=/tmp/marginlab-YYYYMMDDTHHMMSS.sqlite npm run sqlite:backup
SQLITE_BACKUP_DESTINATION=/tmp/marginlab-YYYYMMDDTHHMMSS.sqlite npm run sqlite:verify-restore
```

The create command opens `DATABASE_URL` read-only, performs an online backup, and verifies integrity, foreign keys, and the complete Prisma migration history. Restore verification creates a second database under the operating-system temporary directory, restores through the Online Backup API, compares schema and table counts, and deletes the temporary database. It never writes to `DATABASE_URL`.

## External retention

The completed, closed backup artifact may be uploaded to separately authenticated object storage. Uploading must happen only after both commands succeed. Do not retain the only backup on `/var/data`; loss of the Render disk would otherwise destroy the database and its backups together. Use unique immutable object names, encryption in transit and at rest, access controls, retention rules, and checksum verification after download.

Render cron jobs and one-off jobs cannot access a web service's persistent disk. Invoke a tightly authenticated web-service operation or run the backup inside the web-service process. Do not expose the generic CLI as a public unauthenticated route. A short-lived local artifact under `/tmp` is ephemeral and must be uploaded before the process ends.

## Recovery

1. Keep eBay production activation disabled.
2. Stop every process that can write SQLite.
3. Download a selected backup and verify its external checksum.
4. Run `sqlite:verify-restore` against the downloaded artifact.
5. Confirm the matching AES keyring retains every key version referenced by encrypted records.
6. Preserve the damaged database for investigation.
7. Restore into a new path, never over the active `DATABASE_URL` file.
8. Validate `PRAGMA integrity_check`, `PRAGMA foreign_key_check`, migration history, and application smoke tests.
9. Change `DATABASE_URL` to the verified new path and restart a single instance.

Render disk snapshots are additional disaster-recovery evidence, not a substitute for an application-consistent SQLite backup. Test recovery periodically. Database backups do not contain environment secrets; the versioned encryption keyring needs a separate secure backup and recovery procedure.
