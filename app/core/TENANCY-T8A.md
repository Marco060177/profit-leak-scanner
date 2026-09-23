# T8A — Profit Monitor shadow ownership

Only `ProfitMonitorSnapshot` and `ProfitMonitorAlert` receive nullable `channelConnectionId` fields referencing `ChannelConnection` with `ON DELETE RESTRICT`. Account ownership is derived from the connection rather than duplicated. `ProfitMonitorAlertEvent` inherits ownership through its alert and retains its existing cascading parent FK; it has no tenant field.

The required legacy `shop` stays authoritative for all production upserts, reads, state transitions and redaction. The existing `(shop, periodDays, fingerprint)` and `(shop, periodDays, alertKey)` unique keys remain in force. T8A introduces no shadow writes or read switch: new Monitor rows can still have null shadow. Channel-based unique keys are explicitly deferred.

The SQLite migration rebuilds only the two root tables to add nullable foreign keys, copies their existing columns unchanged, preserves defaults and legacy indexes, and does not backfill. It does not rebuild `ProfitMonitorAlertEvent`.

Run `npm run tenancy:t8a:profit-monitor-backfill` for a read-only dry-run. `npm run tenancy:t8a:profit-monitor-backfill -- --apply` requires explicit operational approval, target-database profiling and a backup. The tool uses canonical Shopify domain normalization and persisted `LegacyShopMapping → ChannelConnection`, never creates tenants, and prints aggregate reason counts by model without shop names or payload. Both root tables form one atomic apply batch: any unsafe row causes zero updates to either table. Updates are conditional, and a successful second apply is a no-op.

Before a later read switch, rollback behavior is simply to stop using the operational tool: production continues to use `shop`. Do not remove the column or reverse a production migration without a separate reviewed backup plan. Production profiling/backfill, shadow write, shadow read, lifecycle/redaction changes and T8B Profit Impact are deferred. This is not full TENANCY PASS.
