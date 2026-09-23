# T9A — Account AI usage schema foundation

`AccountAiUsage` is future Account-owned AI quota state. In T9A it is unused and empty: production reads, writes and quota enforcement remain exclusively on legacy `AiUsage(shop, month)`.

`periodKey` currently denotes a UTC calendar month in `YYYY-MM` form, matching the legacy month key. It is **not** a billing cycle. The database stores the key as a string; validation and any future billing-period policy belong to a later phase.

The quota belongs to the Account, so the table has no `shop` or `channelConnectionId`. The unique `(accountId, periodKey)` key describes one future Account counter per period. It does not approve historical aggregation: multiple legacy shops colliding on the same Account and period must not be silently summed, selected or overwritten.

The FK uses `ON DELETE RESTRICT`. Account is the durable workspace; deleting it must not silently cascade away account-wide usage. An explicit Account deletion/GDPR lifecycle will need to remove or retain this data under an approved policy first. Existing Shopify uninstall and SHOP_REDACT behavior is unchanged by T9A.

There is no production backfill, shadow write, read switch, lifecycle/GDPR switch or historical quota transformation. The additive table can be left unused as an application rollback. A schema rollback, if ever required, is a separately reviewed migration; no destructive rollback is included here. T9B is deterministic profiling, not an automatic production migration.
