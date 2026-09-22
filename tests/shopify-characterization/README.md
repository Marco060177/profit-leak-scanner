# Shopify economic characterization shield

This suite freezes the observable behavior of the current Shopify pipeline before the multichannel extraction. It calls `loadMarginDashboardData()` and replaces only its external Shopify GraphQL and persisted tax-profile boundaries with deterministic fixtures.

Run with:

```sh
npm run test:shopify-characterization
```

## Characterized legacy behavior

- The current `inventoryItem.unitCost` returned by Shopify is applied to every sale in the requested historical window. This is intentionally not historical COGS.
- Refunds are attributed to the original order's `processedAt` day and period. Refunded quantity, revenue, tax and current COGS are reversed together.
- Customer-paid shipping increases contribution profit and contribution revenue. No carrier/fulfillment cost is subtracted.
- Shopify nested connections are not paginated. `lineItems`, `refundLineItems` and `shippingLines` with `hasNextPage` mark data incomplete while only the returned edges are calculated.
- `Summary.revenue`, `netRevenue`, `profit`, `marginPct`, and related fields retain their current compatibility meanings based on net product revenue and current product COGS.
- Allocated discounts take precedence. When allocations total zero, the pipeline falls back to `originalTotal - discountedTotal`.
- Product-less variants are grouped by line-item identity and exposed as `Unknown product` with an empty product ID.
- Actual Shopify tax lines are preferred. Tax included in product prices is removed from economic revenue; excluded product tax and shipping tax stay outside the product-revenue base. A configured advanced profile is used only when transaction tax evidence does not choose an earlier path.

These outputs are regression expectations for the legacy Shopify compatibility path. They are not the canonical multichannel economic semantics and must not be copied into the future normalized ledger by assumption.
