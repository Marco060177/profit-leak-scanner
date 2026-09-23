# Pre-T9E Shopify lifecycle

Verified `APP_UNINSTALLED` removes Shopify sessions and transitions only the mapped, verified Shopify `ChannelConnection` from `ACTIVE` to `DISCONNECTED`. Repeated delivery is idempotent. Account, `LegacyShopMapping`, `AiUsage`, `AccountAiUsage` and other channels are preserved. Missing or unsafe mappings never bootstrap tenancy; sessions are still cleared. Diagnostics contain reason codes, not shop or account identifiers.

Before `SHOP_REDACT`, a subsequent Shopify-authenticated reinstall resolves the existing mapping and Account, reactivates only `DISCONNECTED` to `ACTIVE`, and preserves both counters. Other non-active states fail closed. Normal active resolution remains unchanged.

`SHOP_REDACT` is a separate compliance boundary, not redefined here. Its larger mapping/redaction lifecycle requires separate policy and implementation; after actual redaction, exact legacy/account parity can cease. Reconstructing an Account after erased Shopify identity cannot depend on retaining that identity indefinitely. Explicit MarginLab Account deletion is a future controlled workflow. T9E, T9F and T11 are not implemented by this batch; legacy `AiUsage` remains quota authority.
