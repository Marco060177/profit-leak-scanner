# Data Core D2B: financial history and authority

## Status and scope

D2B is additive scaffolding. Shopify GraphQL -> existing mapper -> Profit Engine -> compatibility projection remains the only production economic authority. No production route, worker, connector or UI imports D2B. There is no Amazon/SP-API implementation. The ten Financial\* tables and the D2B-specific triggers/views live in one new migration, `20260925160000_data_core_d2b_financial_ledger`. Applied D1/D2A migrations are unchanged.

## Identity and provenance

An immutable scope is Account + ChannelConnection + marketplaceScopeKey + economicEventKey + coverageFamily. Marketplace NULL is the real `@none` scope. SALE_BUNDLE groups the entire sale (revenue, promotions, fees and shipping); partial actual fees never replace only the estimated fees of a provisional sale.

A FinancialAuthorityBinding stores explicit source namespace/event identity, authority stream, source leaf, correlation rule and exact D1 provenance. Correlation is supplied by a trusted versioned mapper using explicit source references, never amount/date/text similarity. SQLite validates the persisted relational proof; it cannot interpret encrypted source payload semantics or prove a supplied identifier actually came from the cited leaf. This is the same mapper trust boundary as D1/D2A, not browser authorization.

Binding revisions permit a correction only after every current representation citing the prior binding is WITHDRAWN. A later binding with the same source identity cannot coexist with a PRESENT representation on its predecessor. The new binding cites its predecessor; immutable old evidence is retained. The caller performs withdrawal, transfer and new representation in one transaction.

A component head is unique by scope + authority class + sourceAuthority + stable sourceComponentKey. The mapper must supply a genuine source financial component identity, independent of amount/date/position/display text/MappingVersion/revision. sourceLeafPath is the location inside a particular immutable raw snapshot, not necessarily its stable identity.

Every ledger revision has concrete D1 raw, successful normalization, activated MappingVersion and slice evidence FKs. SQL verifies exact tenant/channel/raw/normalization, stream/run and marketplace equality. Financial documents need not be ORDER raw records. Scope policy and source mapper versions may differ; both are activated and immutable. Source references and evidence carry their exact mapping version. D2B adds cited-identity guards for SyncSlice, SyncRun, ChannelConnection and Marketplace; operational statuses remain mutable. SourceReference is not used as a fictitious polymorphic target FK.

Optional order/item IDs must agree with the scope, and an item implies its actual order. Optional exact D2A revision IDs must agree with those identities. Periodic charges have no fabricated order allocation.

## Revisions, replay and transactions

Public writers and reads accept Prisma.TransactionClient plus VerifiedCoreTenant. No nested transaction, external network call or transaction ownership occurs inside these functions. Authentication must establish the tenant on the server; active ownership is checked on access. All errors must abort the caller transaction.

First entry: revision 1, predecessor NULL. Subsequent entry: exact current predecessor, revision + 1. The ledger INSERT trigger advances the head atomically. Head identity is frozen; direct rewind, skip or foreign-component pointers fail. Every relevant insert/change increments scope.inputVersion.

Callers supply expectedPreviousEntryId explicitly. They must not retry a conflicting operation by silently choosing a new predecessor/revision. SQLite serializes writers; a competing writer either receives a stale-predecessor failure or a lock/transaction error. Retry the entire transaction with the original operation key and expected predecessor. Exact successful replay returns the historical entry even if the head has advanced. Same operation key with different canonical input fails.

WITHDRAWN is a historical retraction, not an inverse economic movement. It retains the prior amount/currency/classification/effective date. A refund is a new REFUND_BUNDLE. No COGS behavior exists here.

## Evidence manifests

FinancialAuthorityEvidence declares a representation's COMPLETE/INCOMPLETE/UNKNOWN coverage, boundaries/watermark, policy version, closure evidence/path/rule, expected sources and members. Source and member tables hold exact D1 evidence and ledger revisions. Evidence sealing requires:

- expected counts match actual rows;
- all current heads of that authority class appear exactly once;
- every member is that head's current revision;
- each member's slice evidence appears among the manifest sources;
- COMPLETE has an explicit closure source/path/rule and no PRESENT economic unknown.

Source pagination/closure semantics belong to the versioned mapper contract; neither a successful slice nor a nonempty list implies completeness. A COMPLETE empty actual set is valid with real source closure evidence and zero current actual heads, without inventing a zero entry. Withdrawn heads, when present, remain in the inventory but contribute no economics.

Headers and members are immutable once sealed. New evidence creates a revision; it never edits a prior manifest. Unsealed staging can be abandoned by deleting its members/sources and then its header. This invalidates scope freshness and cannot delete published history. Normal writers seal within their caller transaction, so errors roll back staging automatically.

Every D2B table has a BEFORE INSERT collision guard for its primary ID, all unique identities and SQLite's implicit rowid. It rejects replacement of existing rows, including draft staging, even with SQLite recursive_triggers=OFF. DELETE/UPDATE guards alone cannot protect against INSERT OR REPLACE implicit deletion. Normal service replay looks up the existing operation and requires no replacement.

## Decisions and selection

Authority states follow the approved D2B contract:

- NO_ACTUAL: choose complete provisional; otherwise BLOCKED.
- ACTUAL_INCOMPLETE: choose the whole complete provisional set; otherwise BLOCKED. Actual entries remain suppressed.
- ACTUAL_COMPLETE: choose the whole complete actual set; suppress provisional.
- ACTUAL_UNKNOWN: BLOCKED, no selected economic rows.

A PRESENT economic UNKNOWN_UNCLASSIFIED in either representation blocks. Different economic currencies within competing representations also block; no implicit equivalence or FX occurs. Informational entries retain their actual amount. An informational exemption must cite a versioned mapper rule proving non-economic/duplicate descriptive semantics; it is not an amount threshold. Tax components preserve source evidence only. A mapper must mark gross summary vs decomposition correctly so only the disjoint economic representation is economic.

A decision snapshots the latest valid sealed manifests, scope inputVersion, preceding published decision, authority state, selected class and policy. FinancialComponentSelection includes every head: SELECTED / SUPPRESSED / INFORMATIONAL / WITHDRAWN. INSERT guards reject wrong roles, tenant/scope mismatches and stale entries. Publication rejects incomplete inventory or a stale decision/predecessor. Scope.currentDecisionId advances only through a valid publication CAS. Published headers and selections never change; unconsumed DRAFT staging may be discarded before retry.

New relevant input makes existing decisions stale, even if currentDecisionId still points to them. FinancialDecisionValidity independently compares inputVersion, latest evidence IDs, derived authority and the complete current head inventory. It also dynamically requires every referenced provisional and actual manifest to pass FinancialEvidenceValidity, including the suppressed representation. Both publication and the effective API use this validity check; epoch equality alone never authorizes consumption.

## Unresolved perimeter and correction

UNRESOLVED_EVENT scopes block their known marketplace/period. A NULL marketplace means unknown marketplace for this family: the blocker applies to every marketplace in the channel during its known period. Half-open periods overlap when start < requestedEnd and end > requestedStart; a known period does not block a non-overlapping window. Without a reliable period, unresolved scopes block channel-wide completeness, including requests filtered to another marketplace/date. Order filters cannot hide an applicable unresolved blocker. Ordinary @none scopes retain normal marketplace isolation. An empty unresolved sentinel remains a blocker.

Resolution is not a mutable resolved flag: FinancialScopeResolution proves all old heads are withdrawn and that each binding's immutable successor lineage reaches a non-unresolved scope with a PRESENT replacement for the same stable component identity. New COMPLETE evidence and fresh publications are still required for the retired scope and replacement scope. A transfer alone remains blocked. Unknown source amounts remain in historical ledger rows after resolution.

## Supported downstream API

`getEffectiveFinancialComponentsTx(tx, verifiedTenant, filter)` is the only supported future Profit Engine boundary. It is not wired into Shopify. All scopes are evaluated in the caller's read transaction before component date filtering.

READY returns components, scope decisions, provisional scopes, scope-level completeness and reconciliation=NOT_EVALUATED. No observed scopes returns NO_OBSERVATIONS, never a claim of completeness. BLOCKED has blockedScopes/reasonCodes/diagnosticComponents and deliberately has no normal components property. An unresolved perimeter overrides narrower order filters. A single included blocker blocks the returned economic result.

FinancialScopeAuthority / FinancialEvidenceValidity / FinancialDecisionValidity / FinancialScopeResolution / EffectiveFinancialComponent are migration-managed SQL views. EffectiveFinancialComponent is a per-scope diagnostic selection view; it is not a replacement for the API's aggregate/perimeter blocker checks. Never SUM raw ledger rows, or infer global completeness from the view's row count. Prisma schema diff does not audit view/trigger semantics; the direct-SQL tests do.

## Money and currency

Signed Int64 atoms, integer scale 0-12, JS bigint exclusively for monetary values. SQL rejects REAL storage in amountAtoms and noninteger scale. Exact-only rescaling rejects overflow and precision loss. Explicit sum helper rejects mixed currencies and overflow. Metadata scale/version counters are ordinary integers; they are never converted monetary values.

Canonical sign is merchant economic effect. Fee reversals may be positive; amounts are never blindly abs()'d. sourceAmountText, sourceSignConvention and signRuleKey retain the transform's audit trail.

The immutable registry is deliberately a supported subset of ISO 4217: EUR USD GBP CAD AUD NZD JPY CHF SEK NOK DKK PLN CZK HUF. Arbitrary three-letter strings, registry mutation and runtime insertion are rejected. Supporting another valid currency requires a reviewed additive registry migration. It is not a rounding, reporting currency or FX policy, and does not reference CurrencyPolicyVersion.

## Validation and acceptance

`npm run test:data-core-d2b` runs the ledger/direct-SQL suite and invokes the authority and effective suites. All databases are temporary SQLite with complete migration history. Tests include cases A-F, exact/conflicting replay, changed snapshot/remap, immutable history, spoofed provenance/tenant/scope, normalization states, currency/scale/Int64, selection omissions/mixed classes, stale decisions/head CAS, two-client concurrency, rollback, published-member append and unresolved correction.

Expected examples: A actual 100 (not 200); B provisional 100-15=85; C actual 100-14.50=85.50; D unknown 7 retained and blocked; E new refund event without COGS reversal; F periodic fee without order.

## Deferred gates

No COGS/CostRecord/inventory/replacement or physical-return semantics (D2C). No tax policy, FX/FxRate/reporting currency, source reconciliation or ReconciliationRun/Issue. No completeSyncSlice transactional composition, no cross-run identical-raw observation contract. The known CurrencyPolicyVersion NULL-safe repair remains a D2D prerequisite before relying on it. No production backfill, production writer, economic authority switch, Amazon ingestion, UI or billing.

Before a future ingestion activation, review mapper source-ID/closure/informational-rule semantics and the encrypted raw adapter. The database enforces durable relationships and publication, not source financial truth.
