# Data Core D2C: cost, inventory and tax evidence

D2C is an additive, dormant persistence boundary. No production route or Shopify connector calls it.

`CostRecord` is a stable scoped identity; immutable `CostRecordRevision` rows carry exact nonnegative unit cost. Selection orders authority (`MANUAL_OVERRIDE`, `SOURCE_ACTUAL`, `SOURCE_PROVISIONAL`), scope specificity, effective time, then revisions within one record. A tie between distinct records is ambiguous.

`InventoryEconomicLot` freezes sale quantity and the selected unit cost. Missing cost is stored as `UNKNOWN` with null monetary fields. Later resolution appends `COST_BASIS_RESOLVED`; it does not rewrite the lot or create another sale. `InventoryEconomicEvent` is an append-only physical/economic journal. The service derives state balances before transitions, rejects overdraw and over-compensation, and treats financial refunds independently from physical recovery. Only `RESTOCKED_SELLABLE` represents sellable inventory-cost recovery. Reimbursements reference an effective published D2B reimbursement entry and retain `LOST` or `DAMAGED` physical state.

`ReplacementLink` is revisioned. Free replacements declare `NO_REVENUE`; charged revenue remains owned by D2B. Current self-links, cycles and contradictory predecessor relationships are rejected.

`NormalizedTaxEvidence` preserves source facts and distinguishes missing/unknown from confirmed zero. `TaxInterpretationPolicyVersion` stores future interpretation rules separately and is never activated by D2C. D2C does not use `CurrencyPolicyVersion`.

All writers require a caller-owned Prisma transaction and verified tenant. Operation keys plus canonical checksums make replay idempotent and reject conflicting replay. SQLite checks and triggers protect ownership, continuity, immutable history, fixed-point ranges and alternate insert collision modes.
