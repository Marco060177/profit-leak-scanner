# T8B — Profit Impact shadow ownership

Only `ProfitImpactAction`, the channel-scoped root, receives nullable `channelConnectionId` referencing `ChannelConnection` with `ON DELETE RESTRICT`. Account ownership is derived from that connection. `ProfitImpactMeasurement` and `ProfitImpactEvent` inherit ownership from their action; they retain their parent FKs and cascading delete behavior without tenant fields.

The required legacy `shop` remains authoritative for action creation, listing, lookup, idempotency, source-alert lookup, measuring-product uniqueness, lifecycle transitions, claims, measurements, cancellation, redaction and the existing Shopify worker. The worker still discovers due actions globally and obtains the Shopify offline session from persisted `action.shop`; channel-awareness is deferred to T8D/lifecycle hardening before any authoritative read switch. T8B introduces no shadow writes, so new action rows may have null shadow. Legacy `(shop,idempotencyKey)` and `(shop,measuringProductKey)` unique keys remain unchanged.

`productId`, `sourceAlertKey` and `measuringProductKey` remain Shopify-specific references. The same SKU or product-like identifier across channels is **not** a canonical product merge.

Run `npm run tenancy:t8b:profit-impact-backfill` for a read-only dry-run. `npm run tenancy:t8b:profit-impact-backfill -- --apply` requires explicit operational approval, target-database profiling and a backup. The tool uses canonical Shopify domain normalization and persisted `LegacyShopMapping → ChannelConnection`; it never creates tenants or prints shop, product, keys, notes, metadata or economic data. Any unsafe action blocks the entire atomic apply batch, with zero ownership updates. Writes are conditional and a successful second apply is a no-op.

Before a future read switch, rollback behavior is to stop using the tool: production continues to use `shop`. Reversing a production migration or removing its nullable column requires separate review and backup. Production profiling/backfill, shadow write, T8C/T8D, lifecycle/relink and read switch are deferred. This is not full TENANCY PASS.
