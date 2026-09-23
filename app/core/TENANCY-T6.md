# T6 — StoreTaxProfile shadow owner

Only `StoreTaxProfile` receives a nullable `channelConnectionId` referencing `ChannelConnection` with `ON DELETE RESTRICT`. Account ownership is derived through that connection. `shop` remains required, unique and authoritative for tax reads, writes and redaction; there is no read switch or second write authority. This batch does not change tax results.

The migration is additive in meaning, although SQLite reconstructs the tax-profile table to add its FK. It copies every existing column and value, preserves defaults and `shop` uniqueness, and does **not** backfill.

Run `npm run tenancy:t6:tax-profile-backfill` for a read-only dry-run. Run `npm run tenancy:t6:tax-profile-backfill -- --apply` only with explicit operational approval, a verified target database and a backup. The tool derives the owner exclusively from canonical shop identity and persisted `LegacyShopMapping → ChannelConnection`; it never creates tenants. It reports counts by reason without printing shop names or payloads. Any invalid mapping or conflicting shadow makes apply a zero-write operation. Updates are conditional and transactional. Repeat dry-run after apply; new legacy writes can still create rows with null shadow until a later write gate.

Before any production use, profile the actual target database, resolve quarantined rows, and confirm lifecycle/redaction policy. A disconnected or otherwise non-`ACTIVE` connection is not backfilled. Current uninstall, redaction and resolver/relink behavior are unchanged.

Rollback before a future read switch: stop running the tool; application behavior continues to use `shop`. Do not drop the shadow column or roll back a production migration without separate review and backup. T6 does not migrate any other business model, implement Amazon/Data Core, or complete the Tenancy Gate.
