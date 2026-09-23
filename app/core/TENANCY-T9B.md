# T9B — deterministic legacy AI usage profiling

T9B is a read-only profiler, not a migration. Production quota authority remains `AiUsage(shop, month)`; `AccountAiUsage` remains unused and receives no backfill or shadow write. `month`/future `periodKey` currently mean UTC calendar month `YYYY-MM`, not a billing cycle.

The profiler validates each legacy row, normalizes its Shopify domain with the established verified-domain function, and looks up persisted `LegacyShopMapping`, `ChannelConnection` and `Account` without tenant bootstrap. It reports invalid shops, periods and request counts; absent/inconsistent mappings; wrong channel or external identity; and non-ACTIVE connections. Only safely mapped ACTIVE Shopify rows enter Account+month grouping. Different normalized shops in one Account+month are `ACCOUNT_PERIOD_COLLISION`; repeated normalized identity in one group is separately unsafe. Neither category is migration-ready.

The CLI prints only aggregate reason counts and anonymous collision statistics. Its diagnostic request sums are **not** an approved SUM migration rule. Internal row identifiers are available to tests/review but are not logged. It rejects all flags, including `--apply`.

There is no historical aggregation policy, production backfill, AccountAiUsage write, quota read switch or lifecycle/GDPR switch. Collisions require an explicit reviewed policy before T9C. A T9B PASS does **not** authorize T9C or any automatic production migration.
