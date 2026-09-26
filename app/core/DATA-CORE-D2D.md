# DATA CORE D2D — canonical economic composition

D2D is a read-only composition boundary. `getCanonicalEconomicDatasetTx` runs inside the caller's Prisma transaction and combines the current D2A commerce revisions, the supported D2B effective financial authority result, and the supported D2C effective cost/inventory/tax result. It performs no network I/O and stores no canonical dataset.

The request fixes tenant, channel, scope, a half-open economic window, and one exact active `CurrencyPolicyVersion`. D2B monetary rows remain the sole financial authority. D2C lots retain frozen historical cost; events contribute physical semantics and never become an additional financial amount. Refunds do not imply recovery, reimbursement links do not add money, free replacements do not fabricate revenue, and tax evidence supplies coverage semantics while a referenced D2B tax component remains the monetary authority.

D2C is evaluated channel-wide before narrowing. A blocker is excluded only when its own marketplace or explicit economic period proves non-overlap. Unknown evidence is never converted to zero. Multiple observed currencies return `MIXED_CURRENCY_WITHOUT_FX`; D2D performs no FX conversion.

`READY` exposes validated evidence rows and a manifest, without an aggregate total. COGS is the sole monetary owner of sale and replacement recognition. Recognition and cost-bookkeeping inventory events remain visible with `monetaryEffect: null`; only independently canonical recovery or loss events carry a structured inventory monetary effect. `BLOCKED` exposes only scope, reasons, diagnostic identifiers, completeness, and a fingerprint. The fingerprint is SHA-256 over explicit semantic projections rather than full database rows: generated IDs and storage timestamps are excluded, keys and semantic arrays are sorted, bigint values are decimal strings, and dates are UTC ISO strings.

Migration 24 replaces the nullable currency-policy trigger with NULL-safe lifecycle checks. It validates supported rounding/residual modes, tolerance bounds, activation/deactivation order, semantic immutability after activation, one active policy, and deletion protection. Migrations 1–23 and Prisma economic models are unchanged.

D2D is dormant. There is no route, scheduled job, Shopify authority switch, Amazon connector, persisted cache, reconciliation engine, or production caller.
