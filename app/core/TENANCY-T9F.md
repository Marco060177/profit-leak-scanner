# T9F — legacy AI usage runtime retirement

`AccountAiUsage` is the sole runtime quota and UI counter. Reservations, completion and compensation use `AccountAiUsageReservation` and affect only Account-owned usage. A missing, stale or divergent shop-scoped `AiUsage` row does not affect admission. The legacy table and `legacyShadowApplied` column remain only to preserve migration history and existing production data; there is no destructive migration in T9F.

`app/services/ai-usage-shadow.server.ts` and the T9C2 test describe the historical pre-T9E shadow mechanism. They are not imported by the AI Advisor runtime. The T9B profiler, T9C1 backfill and T9D reconciler are historical/manual migration tools, not runtime jobs. **Do not run T9C1 `--apply` on a live T9F database:** copying old shop counts over Account authority would be unsafe. T9D compares against retired legacy state, so its `READY_FOR_T9E` verdict is no longer a production health gate. Existing T9B–T9D tests characterize the old tools only.

`SHOP_REDACT` may continue deleting legacy `AiUsage` rows as shop-scoped data cleanup. It must not reset Account-owned usage or reservations. The single-Shopify-owner safety check remains active. Shopify Growth entitlement, limit 100, UTC month and duplicate-submit policy are unchanged.

After deployment, verify an AI Advisor request and its Account reservation completion, verify the displayed count comes from `AccountAiUsage`, and verify no new `AiUsage` row or shadow update. No Prisma migration or manual Render command is required.
