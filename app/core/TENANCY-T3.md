# T3 non-interactive tenancy inventory and policy

Inventory completed before T3 implementation. A trusted shop is not, by
itself, permission to create a new tenant. Interactive Admin requests retain
the T1/T2 create-if-missing path only after `authenticate.admin` succeeds.

| Entry point | Trusted shop root | Create? | Lookup? | Missing mapping / context today |
| --- | --- | --- | --- | --- |
| `webhooks.app.uninstalled.tsx` | `authenticate.webhook` result | Never | Optional, not needed | Delete legacy sessions by authenticated `shop`; succeed. Do not recreate tenant. |
| `webhooks.shop.redact.ts` | `authenticate.webhook` result | Never | Optional, not needed | Delete legacy shop data by authenticated `shop`; succeed. Do not recreate tenant. |
| `webhooks.customers.redact.ts`, `webhooks.customers.data_request.ts` | `authenticate.webhook` result | Never | Not needed | Acknowledge; no customer-scoped data or tenant lookup. |
| `webhooks.app.scopes_update.tsx` | `authenticate.webhook` result/session | Never | Not needed | Update existing Shopify session scopes if present; no bootstrap. |
| `webhooks.orders.create.tsx` | `authenticate.webhook` result | Never | Not needed for legacy alert queue | Continue existing legacy `shop` processing when mapping is absent; no bootstrap. |
| `notification-cron.ts` → notification scheduler, weekly report, delivery | Secret-authenticated cron; persisted `NotificationPreferences.shop` / `NotificationDelivery.shop`; Shopify offline session when needed | Never | Deferred; no tenant-context consumer today | Continue existing shop-keyed processing. |
| Profit Impact due-measurement worker | Persisted `ProfitImpactAction.shop`, then Shopify offline session | Never | Deferred; no tenant-context consumer today | Continue existing shop-keyed processing. |
| `auth.$.tsx` | Shopify `authenticate.admin` callback | Not before successful auth | Not needed | Bootstrap remains at ordinary authenticated Admin boundary. OAuth behavior unchanged. |
| `app.billing.tsx` action | Shopify `authenticate.admin` session | Not needed for pricing redirect | Not needed | Preserve billing redirect and plan behavior. |

T3 provides two explicit operations:

- **Create-if-missing:** verified interactive `session.shop` →
  `resolveShopifyTenantContext(session)` → transactional bootstrap if absent.
- **Lookup-only:** verified webhook `shop` or trusted persisted server-side
  `shop` → `findShopifyTenantContext(shop)` → existing context or `null`; no
  writes, repairs or bootstrap. Both paths share normalization and mapping
  consistency checks. `authenticateShopifyWebhookTenant(request)` is available
  for a future webhook that actually needs tenant context; it authenticates
  first and then calls lookup-only. No current webhook is changed to depend on
  a new DB lookup, preserving uninstall/privacy and order-alert behavior.

Legacy business tables remain owned by `shop`. Later stages may introduce
tenant keys and migrate ownership only after explicit backfill, shadow-read,
dual-write and rollback design; T3 does none of that.
