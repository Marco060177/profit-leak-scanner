# Canonical profit result v1

The current Shopify path now builds `CanonicalProfitResult` after the existing
economic and tax calculations, then uses `LegacyMarginProjection v1` to return
the unchanged `LoaderData`. The projection carries legacy product and display
fields as an explicit sidecar; its economic totals come from the canonical
result.

The signed components use positive numbers for inflows and negative numbers
for discounts, refunds and COGS. Reported transaction tax is evidence, not an
additional component deducted from the existing product-profit basis.
`legacyShippingContribution` includes customer-paid shipping without a carrier
cost. It must not be interpreted as marketplace or fulfillment contribution.

Version 1 uses the current JavaScript `number` calculations to preserve the
Shopify characterization outputs. `FixedPrecisionMoney` defines the future
atoms/scale/currency boundary, but no BigInt arithmetic or conversion is
performed in this batch. The result is tagged `shopify-legacy-v1` so it cannot
be mistaken for the final multichannel formula.

Unavailable marketplace, fulfillment, acquisition and fully loaded results
are `null`, not zero. Reconciliation is `NOT_ATTEMPTED`: the current Shopify
pipeline has no financial reconciliation. Missing cost coverage or truncated
source connections mark quality `DEGRADED`; otherwise it is `PROVISIONAL`.
These statuses do not alter existing LoaderData confidence or completeness.

Mapping versions, source watermarks, unknown amount classification and
rounding residuals remain unavailable until the normalized ledger, mapping
versions, source sync and reconciliation exist. No values are fabricated for
them in this compatibility phase.
