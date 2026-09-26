import assert from "node:assert/strict";
import { fixture } from "./d2d.fixtures";
import { recordCostRecordRevisionTx } from "../../app/core/cost-record.server";
import { appendInventoryEconomicEventTx, linkReimbursementTx, recognizeSaleCogsTx } from "../../app/core/inventory-economics.server";
import { recordNormalizedTaxEvidenceTx } from "../../app/core/tax-evidence.server";

const f = await fixture();
const q = { quantityAtoms: 1n, quantityScale: 0 };
const jan = { startInclusive: new Date("2026-01-01Z"), endExclusive: new Date("2026-02-01Z") };
const feb = { startInclusive: new Date("2026-02-01Z"), endExclusive: new Date("2026-03-01Z") };
try {
  const product = await f.db.product.create({ data: { accountId: f.account.id, title: "composition" } });
  const sku = await f.db.sku.create({ data: { accountId: f.account.id, productId: product.id, sellerSku: "COMPOSE" } });
  await f.db.$transaction((tx) => recordCostRecordRevisionTx(tx, f.tenant, {
    skuId: sku.id, channelConnectionId: f.channel.id, sourceKind: "MANUAL", costKey: "composition", operationKey: "composition-cost",
    authorityTier: "MANUAL_OVERRIDE", effectiveFrom: jan.startInclusive,
    unitCost: { amountAtoms: 500n, amountScale: 2, currencyCode: "EUR" }, evidenceKind: "MANUAL",
    manual: { actorRef: "test", manualReasonCode: "COMPOSITION" },
  }));
  const publish = async (key: string, family: "REFUND_BUNDLE" | "REIMBURSEMENT_BUNDLE" | "SALE_BUNDLE", kind: "REFUND" | "REIMBURSEMENT" | "PRODUCT_REVENUE" | "TAX_COMPONENT", amount: bigint, effectiveAt = new Date("2026-01-15Z")) => {
    const scope = await f.scope(key, family);
    const source = await f.source("finances");
    const binding = await f.bind(scope.id, "ACTUAL", source);
    const entry = await f.ledger({ ...f.input(scope.id, "ACTUAL", binding.id, source, amount, kind), effectiveAt });
    await f.evidence(scope.id, "ACTUAL", "COMPLETE", [source], [entry.entry.id]);
    await f.publish(scope.id);
    return entry.entry;
  };
  const lot = async (key: string, at = new Date("2026-01-15Z")) => (await f.db.$transaction((tx) => recognizeSaleCogsTx(tx, f.tenant, {
    lotKey: key, skuId: sku.id, quantity: q, economicAt: at, operationKey: key, currencyCode: "EUR",
  }))).lot;
  const transition = (lotId: string, eventType: "RETURN_INITIATED" | "RETURN_RECEIVED" | "RESTOCKED_SELLABLE" | "RESTOCKED_UNSELLABLE" | "LOST", stateFrom: "SOLD" | "RETURN_IN_TRANSIT" | "RETURNED_PENDING_INSPECTION", stateTo: "RETURN_IN_TRANSIT" | "RETURNED_PENDING_INSPECTION" | "SELLABLE" | "UNSELLABLE" | "LOST", key: string, economicAt = new Date("2026-01-20Z")) =>
    f.db.$transaction((tx) => appendInventoryEconomicEventTx(tx, f.tenant, { lotId, eventType, stateFrom, stateTo, quantity: q, operationKey: key, economicAt }));

  const refundOnly = await publish("refund-only", "REFUND_BUNDLE", "REFUND", -1000n);
  let dataset = await f.read();
  assert.equal(dataset.status, "READY");
  if (dataset.status === "READY") {
    assert.equal(dataset.financialComponents.filter((x) => x.id === refundOnly.id).length, 1);
    assert.equal(dataset.inventoryEvents.some((x) => x.eventType === "RESTOCKED_SELLABLE"), false);
  }

  const sellable = await lot("sellable-return");
  await transition(sellable.id, "RETURN_INITIATED", "SOLD", "RETURN_IN_TRANSIT", "sellable-1");
  await transition(sellable.id, "RETURN_RECEIVED", "RETURN_IN_TRANSIT", "RETURNED_PENDING_INSPECTION", "sellable-2");
  await transition(sellable.id, "RESTOCKED_SELLABLE", "RETURNED_PENDING_INSPECTION", "SELLABLE", "sellable-3");
  const sellableRefund = await publish("sellable-refund", "REFUND_BUNDLE", "REFUND", -1100n);
  dataset = await f.read();
  assert.equal(dataset.status, "READY");
  if (dataset.status === "READY") {
    assert.equal(dataset.financialComponents.filter((x) => x.id === sellableRefund.id).length, 1);
    assert.equal(dataset.inventoryEvents.filter((x) => x.lotId === sellable.id && x.monetaryEffect !== null).length, 1);
    assert.equal(dataset.cogs.filter((x) => x.lotId === sellable.id).length, 1);
  }

  const unsellable = await lot("unsellable-return");
  await transition(unsellable.id, "RETURN_RECEIVED", "SOLD", "RETURNED_PENDING_INSPECTION", "unsellable-1");
  await transition(unsellable.id, "RESTOCKED_UNSELLABLE", "RETURNED_PENDING_INSPECTION", "UNSELLABLE", "unsellable-2");
  const unsellableRefund = await publish("unsellable-refund", "REFUND_BUNDLE", "REFUND", -1200n);
  dataset = await f.read();
  assert.equal(dataset.status, "READY");
  if (dataset.status === "READY") {
    assert.equal(dataset.financialComponents.filter((x) => x.id === unsellableRefund.id).length, 1);
    assert.equal(dataset.inventoryEvents.filter((x) => x.lotId === unsellable.id && x.monetaryEffect !== null).length, 0);
  }

  const lost = await lot("lost-reimbursed");
  await transition(lost.id, "LOST", "SOLD", "LOST", "lost-event");
  const reimbursement = await publish("lost-reimbursement", "REIMBURSEMENT_BUNDLE", "REIMBURSEMENT", 700n);
  const reimbursementLink = await f.db.$transaction((tx) => linkReimbursementTx(tx, f.tenant, { lotId: lost.id, state: "LOST", quantity: q,
    financialLedgerEntryId: reimbursement.id, operationKey: "lost-link", economicAt: new Date("2026-01-21Z") }));
  await f.db.$transaction((tx) => appendInventoryEconomicEventTx(tx, f.tenant, { lotId: lost.id, eventType: "COMPENSATION",
    quantity: q, compensatesEventId: reimbursementLink.id, operationKey: "lost-compensation", economicAt: new Date("2026-01-22Z") }));
  dataset = await f.read();
  assert.equal(dataset.status, "READY");
  if (dataset.status === "READY") {
    assert.equal(dataset.financialComponents.filter((x) => x.id === reimbursement.id).length, 1);
    assert.equal(dataset.reimbursementLinks.filter((x) => x.financialLedgerEntryId === reimbursement.id).length, 2);
    assert.equal("monetaryEffect" in dataset.reimbursementLinks[0], false);
  }

  const taxEntry = await publish("tax-actual", "SALE_BUNDLE", "TAX_COMPONENT", 220n);
  await f.db.$transaction((tx) => recordNormalizedTaxEvidenceTx(tx, f.tenant, { evidenceKey: "tax-present", operationKey: "tax-present",
    category: "VAT", economicRole: "COLLECTED", priceRelation: "INCLUDED", authorityClass: "ACTUAL", availability: "PRESENT",
    coverageState: "COMPLETE", confidence: "HIGH", amount: { amountAtoms: 220n, amountScale: 2, currencyCode: "EUR" },
    financialLedgerEntryId: taxEntry.id, periodStart: jan.startInclusive, periodEnd: jan.endExclusive,
    actorRef: "test", manualReasonCode: "TAX" }));
  const zeroSource = await f.source("tax");
  await f.db.$transaction((tx) => recordNormalizedTaxEvidenceTx(tx, f.tenant, { evidenceKey: "tax-zero", operationKey: "tax-zero",
    category: "VAT", economicRole: "COLLECTED", priceRelation: "INCLUDED", authorityClass: "ACTUAL", availability: "CONFIRMED_ZERO",
    coverageState: "COMPLETE", confidence: "HIGH", amount: { amountAtoms: 0n, amountScale: 2, currencyCode: "EUR" },
    rawSourceRecordId: zeroSource.rawSourceRecordId, syncSliceEvidenceId: zeroSource.syncSliceEvidenceId,
    normalizationRunId: zeroSource.normalizationRunId, mappingVersionId: zeroSource.mappingVersionId,
    normalizationRevision: zeroSource.normalizationRevision, sourceLeafPath: "/tax/zero",
    periodStart: jan.startInclusive, periodEnd: jan.endExclusive }));
  dataset = await f.read();
  assert.equal(dataset.status, "READY");
  if (dataset.status === "READY") {
    assert.equal(dataset.financialComponents.filter((x) => x.id === taxEntry.id).length, 1);
    assert.equal(dataset.taxEvidence.find((x) => x.id && x.monetaryAuthorityEntryId === taxEntry.id)?.availability, "PRESENT");
    assert.equal(dataset.taxEvidence.some((x) => x.availability === "CONFIRMED_ZERO"), true);
    assert.equal("amountAtoms" in dataset.taxEvidence[0], false);
  }

  const atStart = await publish("financial-at-start", "SALE_BUNDLE", "PRODUCT_REVENUE", 10n, jan.startInclusive);
  const atEnd = await publish("financial-at-end", "SALE_BUNDLE", "PRODUCT_REVENUE", 20n, jan.endExclusive);
  const financialJanuary = await f.read({ economicWindow: jan });
  assert.equal(financialJanuary.status, "READY");
  if (financialJanuary.status === "READY") {
    assert.equal(financialJanuary.financialComponents.some((x) => x.id === atStart.id), true);
    assert.equal(financialJanuary.financialComponents.some((x) => x.id === atEnd.id), false);
  }
  const financialFebruary = await f.read({ economicWindow: feb });
  assert.equal(financialFebruary.status, "READY");
  if (financialFebruary.status === "READY") assert.equal(financialFebruary.financialComponents.some((x) => x.id === atEnd.id), true);

  const provisionalOnlyScope = await f.scope("provisional-only", "SALE_BUNDLE");
  const provisionalOnlySource = await f.source("orders");
  const provisionalOnlyBinding = await f.bind(provisionalOnlyScope.id, "PROVISIONAL", provisionalOnlySource);
  const provisionalOnlyEntry = await f.ledger(f.input(provisionalOnlyScope.id, "PROVISIONAL", provisionalOnlyBinding.id, provisionalOnlySource, 444n, "PRODUCT_REVENUE"));
  await f.evidence(provisionalOnlyScope.id, "PROVISIONAL", "COMPLETE", [provisionalOnlySource], [provisionalOnlyEntry.entry.id]);
  await f.publish(provisionalOnlyScope.id);
  const provisionalOnlyDataset = await f.read();
  assert.equal(provisionalOnlyDataset.status, "READY");
  assert.equal(provisionalOnlyDataset.completeness, "PROVISIONAL");
  if (provisionalOnlyDataset.status === "READY") {
    assert.equal(provisionalOnlyDataset.financialComponents.filter((x) => x.id === provisionalOnlyEntry.entry.id).length, 1);
    assert.equal(provisionalOnlyDataset.financialComponents.some((x) => x.economicEventKey === "provisional-only" && x.authorityClass === "ACTUAL"), false);
  }
  const provisionalFingerprint = provisionalOnlyDataset.fingerprint;
  const promotedSource = await f.source("finances");
  const promotedBinding = await f.bind(provisionalOnlyScope.id, "ACTUAL", promotedSource);
  const promotedEntry = await f.ledger(f.input(provisionalOnlyScope.id, "ACTUAL", promotedBinding.id, promotedSource, 445n, "PRODUCT_REVENUE"));
  await f.evidence(provisionalOnlyScope.id, "ACTUAL", "COMPLETE", [promotedSource], [promotedEntry.entry.id]);
  await f.publish(provisionalOnlyScope.id);
  const promotedDataset = await f.read();
  assert.equal(promotedDataset.status, "READY");
  if (promotedDataset.status === "READY") {
    assert.equal(promotedDataset.financialComponents.some((x) => x.id === promotedEntry.entry.id), true);
    assert.equal(promotedDataset.financialComponents.some((x) => x.id === provisionalOnlyEntry.entry.id), false);
    assert.notEqual(promotedDataset.fingerprint, provisionalFingerprint);
  }

  const provisionalScope = await f.scope("provisional-fallback", "SALE_BUNDLE");
  const provisionalSource = await f.source("orders");
  const provisionalBinding = await f.bind(provisionalScope.id, "PROVISIONAL", provisionalSource);
  const provisionalEntry = await f.ledger(f.input(provisionalScope.id, "PROVISIONAL", provisionalBinding.id, provisionalSource, 333n, "PRODUCT_REVENUE"));
  await f.evidence(provisionalScope.id, "PROVISIONAL", "COMPLETE", [provisionalSource], [provisionalEntry.entry.id]);
  const actualSource = await f.source("finances");
  const actualBinding = await f.bind(provisionalScope.id, "ACTUAL", actualSource);
  const partialActual = await f.ledger(f.input(provisionalScope.id, "ACTUAL", actualBinding.id, actualSource, 111n, "PRODUCT_REVENUE"));
  await f.evidence(provisionalScope.id, "ACTUAL", "INCOMPLETE", [actualSource], [partialActual.entry.id]);
  await f.publish(provisionalScope.id);
  dataset = await f.read();
  assert.equal(dataset.status, "READY");
  if (dataset.status === "READY") {
    assert.equal(dataset.completeness, "PROVISIONAL");
    assert.equal(dataset.financialComponents.some((x) => x.id === provisionalEntry.entry.id), true);
    assert.equal(dataset.financialComponents.some((x) => x.id === partialActual.entry.id), false);
  }

  const boundaryStart = await lot("boundary-start", jan.startInclusive);
  const boundaryEnd = await lot("boundary-end", jan.endExclusive);
  const boundary = await f.read({ economicWindow: jan });
  assert.equal(boundary.status, "READY");
  if (boundary.status === "READY") {
    assert.equal(boundary.cogs.some((x) => x.lotId === boundaryStart.id), true);
    assert.equal(boundary.cogs.some((x) => x.lotId === boundaryEnd.id), false);
  }

  const contradictoryLot = await lot("contradictory-reference");
  await transition(contradictoryLot.id, "LOST", "SOLD", "LOST", "contradictory-lost");
  const futureReimbursement = await publish("future-reimbursement", "REIMBURSEMENT_BUNDLE", "REIMBURSEMENT", 800n, jan.endExclusive);
  await f.db.$transaction((tx) => linkReimbursementTx(tx, f.tenant, { lotId: contradictoryLot.id, state: "LOST", quantity: q,
    financialLedgerEntryId: futureReimbursement.id, operationKey: "contradictory-link", economicAt: new Date("2026-01-25Z") }));
  const contradictory = await f.read({ economicWindow: jan });
  assert.equal(contradictory.status, "BLOCKED");
  if (contradictory.status === "BLOCKED") assert.deepEqual(contradictory.reasonCodes, ["CONTRADICTORY_CANONICAL_REFERENCE"]);

  const market = await f.db.marketplace.create({ data: { ...f.tenant, externalMarketplaceId: "D2D-MARKET" } });
  await f.scope("unknown-market", "UNRESOLVED_EVENT", null, { start: jan.startInclusive, end: jan.endExclusive });
  const overlap = await f.read({ scope: { kind: "MARKETPLACE", marketplaceId: market.id }, economicWindow: jan });
  assert.equal(overlap.status, "BLOCKED");
  if (overlap.status === "BLOCKED") assert.ok(overlap.reasonCodes.includes("UNRESOLVED_ECONOMIC_EVENT"));
  const nonOverlap = await f.read({ scope: { kind: "MARKETPLACE", marketplaceId: market.id }, economicWindow: feb });
  assert.equal(nonOverlap.status, "READY");

  const febLot = await lot("late-inventory", new Date("2026-01-25Z"));
  await transition(febLot.id, "LOST", "SOLD", "LOST", "late-inventory-event", new Date("2026-02-01Z"));
  const febDataset = await f.read({ economicWindow: feb });
  assert.equal(febDataset.status, "READY");
  if (febDataset.status === "READY") {
    assert.equal(febDataset.cogs.some((x) => x.lotId === febLot.id), false);
    assert.equal(febDataset.inventoryEvents.some((x) => x.lotId === febLot.id && x.eventType === "LOST"), true);
  }

  const foreignAccount = await f.db.account.create({ data: {} });
  const foreignChannel = await f.db.channelConnection.create({ data: { accountId: foreignAccount.id, channel: "SHOPIFY", externalAccountId: "foreign" } });
  const foreignMarket = await f.db.marketplace.create({ data: { accountId: foreignAccount.id, channelConnectionId: foreignChannel.id, externalMarketplaceId: "FOREIGN" } });
  const isolated = await f.read({ scope: { kind: "MARKETPLACE", marketplaceId: foreignMarket.id } });
  assert.equal(isolated.status, "BLOCKED");
  if (isolated.status === "BLOCKED") assert.deepEqual(isolated.reasonCodes, ["SCOPE_OWNERSHIP_MISMATCH"]);

  console.log("D2D composition remediation matrix: PASS");
} finally {
  await f.cleanup();
}
