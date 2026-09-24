# Tenancy final remediation boundary

This batch does not introduce DATA CORE, Amazon runtime, a new Prisma migration,
or a new retention period. Shopify `shop` remains API addressing and compatibility,
not a multichannel business owner. New authenticated Shopify writes for tax profile,
profit assumptions, Profit Monitor and Profit Impact attach the verified
`ChannelConnection`. Existing legacy rows with a null shadow owner remain readable;
a contradictory populated owner fails closed on the guarded paths.

The T6, T7, T8A and T8B scripts are **manual migration/reconciliation tools**,
not runtime services or startup jobs. Run them only against the intended database,
first without `--apply` (dry-run). Resolve every missing, unsafe or conflicting
mapping before applying. After applying, repeat the dry-run and require `READY: 0`.
Do not run these commands against a local database as a proxy for production.

The T9B/T9C/T9D scripts and `ai-usage-shadow.server.ts` are historical migration
and reconciliation code. Runtime AI quota uses `AccountAiUsage` exclusively.
Do not import the shadow service into a new runtime path.

Notification delivery ownership is Account-based. The current Shopify email
adapter remains the only configured adapter. Account-wide and non-Shopify
deliveries are valid ownership shapes but explicitly fail as unsupported until
their content and entitlement adapters are approved; they are not silently sent
through Shopify. This does not implement Amazon notifications.

`requestAccountDeletion()` is a tombstone, not deletion. `assessAccountPurge()`
is a read-only, fail-closed internal gate. Physical purge must wait for approved
retention and authorization decisions covering Account, channels, mapping,
quota, reservations, preferences, delivery history and operational records.
`SHOP_REDACT` remains separate and channel-specific.
