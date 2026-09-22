# Tenancy T1 transition

After Shopify authentication, the Dashboard loader resolves the verified
`session.shop` through `LegacyShopMapping` to an `Account` and its
`ChannelConnection(SHOPIFY)`. A missing mapping is created transactionally on
the first authenticated request, so existing installations do not reinstall.
The unique shop-domain and `(channel, externalAccountId)` keys make bootstrap
idempotent; conflicts are retried and the persisted mapping is re-read.
The mapping's composite foreign key ensures its connection belongs to the same
account. The resolver also verifies that the connection is Shopify and names
the same shop domain. Browser account or connection IDs are never inputs.

This is a migration bridge, not multichannel persistence. Existing Shopify
business tables and session ownership still use `shop`; no business query has
switched to `accountId`. The resolver is intentionally integrated only in the
authenticated Dashboard path for T1; other authenticated paths need a later,
reviewed integration step.

Later migration sequence (not implemented here): nullable tenant keys →
backfill → shadow-read verification → controlled dual-write → switch reads →
non-null enforcement → legacy rollback window.
