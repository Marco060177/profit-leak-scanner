# T2 authenticated entry-point inventory

Inventory completed before T2 code changes. Direct Shopify authentication in
`app/routes` is classified below; `app.glossary.tsx` inherits the authenticated
`app.tsx` parent and has no direct server authentication call.
No `authenticate.public`, `authenticate.flow`, or `authenticate.appProxy`
entry point exists in the current application.

| Class | Entry points | T2 decision |
| --- | --- | --- |
| Interactive Admin | `app.tsx` loader; `app._index.tsx`, `app.products.tsx`, `app.forecasting.tsx`, `app.recovery-simulator.tsx`, `app.recommendations.tsx`, `app.profit-intelligence.tsx` loaders; `app.alert-center.tsx`, `app.ai-advisor.tsx`, `app.tax-profile.tsx`, `app.support.tsx`, `app.reports-notifications.tsx`, `app.profit-impact.tsx`, `app.profit-assumptions.tsx` loaders/actions | Use tenant-aware authentication boundary. |
| Shopify webhook | `webhooks.orders.create.tsx`, `webhooks.app.scopes_update.tsx`, `webhooks.app.uninstalled.tsx`, `webhooks.shop.redact.ts`, `webhooks.customers.redact.ts`, `webhooks.customers.data_request.ts` actions | Keep `authenticate.webhook`; no creating tenant resolver. |
| Internal/scheduled | `notification-cron.ts` action and its notification scheduler/report/delivery services; Profit Impact measurement invoked by server services | Keep existing trusted cron secret and persisted `shop` roots. No interactive browser tenant IDs. |
| Public/non-tenant | `_index/route.tsx`, `auth.login/route.tsx`, `webhooks.tsx` health-style responses, `notification-cron.ts` GET rejection | Do not bootstrap tenant. Public login `shop` parameter initiates Shopify auth; it is not an account selector. |
| Special auth/billing | `auth.$.tsx` loader; `app.billing.tsx` action | Keep direct Shopify authentication. OAuth callback bootstrap and billing redirect are intentionally outside the ordinary route sweep; neither may create a tenant before verified authentication. |

The approved trust chain is request → Shopify `authenticate.admin` → verified
`session.shop` → `LegacyShopMapping` → Account / Shopify ChannelConnection.
The reusable boundary returns `admin`, `session`, and server-only `tenant`;
existing business services still use `session.shop`. Browser-provided `shop`,
`accountId`, `channelConnectionId`, and `tenantId` never select a tenant.

Webhook `shop` comes from `authenticate.webhook`, but teardown/privacy handlers
must not invoke the creating resolver: a mapping may already be absent, and
creating an Account during deletion would be wrong. A later non-creating lookup
can be added when webhook tenancy is migrated. The scheduler uses persisted
`NotificationPreferences.shop`/delivery data after a secret-protected cron
request, not a browser-selected tenant. No job ownership is migrated in T2.

The T1 Dashboard bootstrap is superseded by the reusable boundary. Existing
Shopify business tables remain keyed by `shop`. Future stages, not implemented
here: nullable tenant keys → backfill → shadow-read verification → controlled
dual-write → switch reads → non-null enforcement → legacy rollback window.

`tests/tenancy/tenancy.integration.ts` enforces the two direct-Admin exceptions
above and requires every other `app.*` loader/action to call the boundary. A
new ordinary Admin handler cannot silently reintroduce direct authentication.
