# T9E — Account-authoritative AI usage (code batch, not production cutover)

`AccountAiUsage(accountId, UTC YYYY-MM)` is the only authority for AI Advisor quota admission and display. The cap remains 100 and the existing Shopify Growth entitlement gate remains unchanged. A conditional database update enforces `requests < 100`; first-row creation and a durable Account-owned reservation are in the same transaction. Bounded retries handle first-row uniqueness/contention; exhaustion fails closed. Legacy usage cannot grant quota. A legacy row with no Account row is an unsafe migration state. An Account-only row is valid after Shopify redaction and never recreates deleted legacy usage.

Each accepted action has a server-generated reservation. Success, including a successful OpenAI fallback response, transitions `RESERVED → COMPLETED` without refund. A thrown error transitions that specific reservation `RESERVED → COMPENSATED` and decrements the Account count once in one transaction. Repeated compensation is a no-op. Crash after reservation leaves `RESERVED` charged; there are no speculative refunds. HTTP duplicate submissions have no stable request ID and may consume two reservations, as before. Reservation rows contain no prompt, response, token, shop or customer data.

Existing `AiUsage` rows are updated only as a temporary best-effort legacy shadow; missing rows are never inserted. A successful legacy shadow increment is recorded on the reservation so compensation can attempt a single matching legacy decrement. Legacy failure never grants quota, but may cause divergence and make rollback unsafe. T9D remains the **pre-cutover** exact-parity gate; it is not weakened for post-cutover Account-only states. T9F will retire legacy state and replace migration-only reconciliation.

## Production cutover — not performed by this batch

1. Apply the additive reservation migration in a controlled deployment; verify the intended production database.
2. Prevent new AI Advisor actions and drain all in-flight T9C2 actions. A rolling deployment alone does **not** prove this. If the platform cannot guarantee exclusive drain, use a separate pause-only deployment before activating T9E.
3. Run a fresh production T9D after the drain and require `READY_FOR_T9E`; the historical snapshot is insufficient.
4. Ensure no old T9C2 writer remains. Activate the T9E runtime and verify Account display, cap, reservation, completion and compensation before reopening AI actions.
5. Rollback to legacy authority is allowed only after a fresh exact reconciliation. Divergence from best-effort shadow updates, redaction or a new month makes direct rollback unsafe; keep Account authority and use a separately reviewed recovery plan.

`SHOP_REDACT`, Account deletion, billing redesign, Amazon-only UI, T9F and full T11 lifecycle are unchanged and out of scope.
