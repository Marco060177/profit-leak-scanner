import assert from "node:assert/strict";
import { canonicalEconomicFingerprint, canonicalEconomicJson } from "../../app/core/canonical-economic-fingerprint";
import { fixture } from "./d2d.fixtures";
import { recordCostRecordRevisionTx } from "../../app/core/cost-record.server";
import { recognizeSaleCogsTx, resolveMissingCostTx } from "../../app/core/inventory-economics.server";
import { recordNormalizedOrderItemRevisionTx, recordNormalizedOrderRevisionTx } from "../../app/core/data-core-d2a.server";
import { recordReplacementLinkTx } from "../../app/core/replacement-link.server";

const f = await fixture();
try {
  const first = await f.read();
  const replay = await f.read();
  assert.equal(first.status, "READY");
  assert.equal(first.fingerprint, replay.fingerprint, "same logical read must replay exactly");
  assert.equal(canonicalEconomicJson([{ b: 2, a: 1 }, { a: 0 }]), canonicalEconomicJson([{ a: 0 }, { a: 1, b: 2 }]));
  assert.equal(canonicalEconomicFingerprint({ atoms: 7n }), canonicalEconomicFingerprint({ atoms: 7n }));

  const product = await f.db.product.create({ data: { accountId: f.account.id, title: "D2D" } });
  const sku = await f.db.sku.create({ data: { accountId: f.account.id, productId: product.id, sellerSku: "D2D-EUR" } });
  await f.db.$transaction((tx) => recordCostRecordRevisionTx(tx, f.tenant, {
    skuId: sku.id, channelConnectionId: f.channel.id, sourceKind: "MANUAL", costKey: "base", operationKey: "d2d-cost",
    authorityTier: "MANUAL_OVERRIDE", effectiveFrom: new Date("2026-01-01Z"),
    unitCost: { amountAtoms: 400n, amountScale: 2, currencyCode: "EUR" }, evidenceKind: "MANUAL",
    manual: { actorRef: "d2d-test", manualReasonCode: "KNOWN_COST" },
  }));
  const sale = await f.db.$transaction((tx) => recognizeSaleCogsTx(tx, f.tenant, {
    lotKey: "d2d-sale", skuId: sku.id, quantity: { quantityAtoms: 1n, quantityScale: 0 },
    economicAt: new Date("2026-01-15Z"), operationKey: "d2d-sale", currencyCode: "EUR",
  }));
  const replacementSource = await f.source("orders", null, { entityId: "d2d-replacement-order", entityType: "ORDER" });
  const replacementOrder = await f.db.$transaction((tx) => recordNormalizedOrderRevisionTx(tx, f.tenant, {
    ...replacementSource, marketplaceId: null, sourceSystem: "SHOPIFY", sourceOrderKey: "d2d-replacement-order",
    operationKey: "d2d-replacement-order", normalizedStatus: "FULFILLED", occurredAt: new Date("2026-01-16Z"),
  }));
  const replacementItems: Array<{ item: { id: string }; revision: { id: string } }> = [];
  for (const key of ["id:free-original", "id:free-replacement", "id:charged-original", "id:charged-replacement"])
    replacementItems.push(await f.db.$transaction((tx) => recordNormalizedOrderItemRevisionTx(tx, f.tenant, {
      ...replacementSource, orderId: replacementOrder.order.id, sourceItemKey: key, operationKey: key,
      quantityAtoms: 1n, quantityScale: 0, occurredAt: new Date("2026-01-16Z"),
    })));
  const scope = await f.scope("d2d-sale-finance", "SALE_BUNDLE");
  const source = await f.source("finances");
  const binding = await f.bind(scope.id, "ACTUAL", source);
  const revenue = await f.ledger(f.input(scope.id, "ACTUAL", binding.id, source, 1000n, "PRODUCT_REVENUE"));
  await f.evidence(scope.id, "ACTUAL", "COMPLETE", [source], [revenue.entry.id]);
  await f.publish(scope.id);
  const composed = await f.read();
  assert.equal(composed.status, "READY");
  if (composed.status === "READY") {
    assert.deepEqual(composed.financialComponents.map((x) => x.id), [revenue.entry.id]);
    assert.deepEqual(composed.cogs.map((x) => x.lotId), [sale.lot.id]);
    assert.equal(composed.currency.currencyCode, "EUR");
    assert.equal(composed.reimbursementLinks.length, 0);
    const recognition = composed.inventoryEvents.find((x) => x.lotId === sale.lot.id && x.eventType === "SALE_RECOGNITION");
    assert.equal(recognition?.monetaryEffect, null, "sale recognition bookkeeping cannot duplicate canonical COGS");
    assert.equal(composed.cogs.filter((x) => x.lotId === sale.lot.id).length, 1);
  }
  const freeReplacement = await f.db.$transaction((tx) => recognizeSaleCogsTx(tx, f.tenant, {
    lotKey: "d2d-free-replacement", skuId: sku.id, originKind: "REPLACEMENT_ITEM",
    quantity: { quantityAtoms: 1n, quantityScale: 0 }, economicAt: new Date("2026-01-17Z"),
    operationKey: "d2d-free-replacement", currencyCode: "EUR",
  }));
  await f.db.$transaction((tx) => recordReplacementLinkTx(tx, f.tenant, { linkKey: "d2d-free-link", operationKey: "d2d-free-link-1",
    replacementKind: "FREE", financialTreatment: "NO_REVENUE", predecessorItemId: replacementItems[0].item.id,
    predecessorItemRevisionId: replacementItems[0].revision.id, replacementItemId: replacementItems[1].item.id,
    replacementItemRevisionId: replacementItems[1].revision.id }));
  const freeDataset = await f.read();
  assert.equal(freeDataset.status, "READY");
  if (freeDataset.status === "READY") {
    assert.equal(freeDataset.cogs.filter((x) => x.lotId === freeReplacement.lot.id).length, 1);
    assert.equal(freeDataset.inventoryEvents.find((x) => x.lotId === freeReplacement.lot.id)?.monetaryEffect, null);
    assert.equal(freeDataset.financialComponents.some((x) => x.economicEventKey === "d2d-free-replacement"), false);
    assert.equal(freeDataset.replacements.some((x) => x.linkKey === "d2d-free-link" && x.replacementKind === "FREE" && x.financialTreatment === "NO_REVENUE"), true);
  }
  const freeFingerprint = freeDataset.fingerprint;
  await f.db.$transaction((tx) => recordReplacementLinkTx(tx, f.tenant, { linkKey: "d2d-free-link", operationKey: "d2d-free-link-2",
    replacementKind: "RETURN_REPLACEMENT", financialTreatment: "NO_REVENUE", predecessorItemId: replacementItems[0].item.id,
    predecessorItemRevisionId: replacementItems[0].revision.id, replacementItemId: replacementItems[1].item.id,
    replacementItemRevisionId: replacementItems[1].revision.id }));
  assert.notEqual((await f.read()).fingerprint, freeFingerprint, "replacement semantic revision must change fingerprint");
  const chargedScope = await f.scope("d2d-charged-replacement", "SALE_BUNDLE");
  const chargedSource = await f.source("finances");
  const chargedBinding = await f.bind(chargedScope.id, "ACTUAL", chargedSource);
  const chargedRevenue = await f.ledger({
    ...f.input(chargedScope.id, "ACTUAL", chargedBinding.id, chargedSource, 900n, "PRODUCT_REVENUE"),
    orderId: replacementOrder.order.id,
    itemId: replacementItems[3].item.id,
  });
  await f.evidence(chargedScope.id, "ACTUAL", "COMPLETE", [chargedSource], [chargedRevenue.entry.id]);
  await f.publish(chargedScope.id);
  const chargedReplacement = await f.db.$transaction((tx) => recognizeSaleCogsTx(tx, f.tenant, {
    lotKey: "d2d-charged-replacement", skuId: sku.id, originKind: "REPLACEMENT_ITEM",
    quantity: { quantityAtoms: 1n, quantityScale: 0 }, economicAt: new Date("2026-01-18Z"),
    operationKey: "d2d-charged-replacement", currencyCode: "EUR",
  }));
  await f.db.$transaction((tx) => recordReplacementLinkTx(tx, f.tenant, { linkKey: "d2d-charged-link", operationKey: "d2d-charged-link-1",
    replacementKind: "CHARGED", financialTreatment: "D2B_COMPONENT", predecessorItemId: replacementItems[2].item.id,
    predecessorItemRevisionId: replacementItems[2].revision.id, replacementItemId: replacementItems[3].item.id,
    replacementItemRevisionId: replacementItems[3].revision.id }));
  const chargedDataset = await f.read();
  assert.equal(chargedDataset.status, "READY");
  if (chargedDataset.status === "READY") {
    assert.deepEqual(chargedDataset.financialComponents.filter((x) => x.id === chargedRevenue.entry.id).map((x) => x.amountAtoms), [900n]);
    assert.equal(chargedDataset.cogs.filter((x) => x.lotId === chargedReplacement.lot.id).length, 1);
    assert.equal(chargedDataset.inventoryEvents.find((x) => x.lotId === chargedReplacement.lot.id)?.monetaryEffect, null);
    assert.equal(chargedDataset.replacements.some((x) => x.linkKey === "d2d-charged-link" && x.replacementKind === "CHARGED" && x.financialTreatment === "D2B_COMPONENT"), true);
  }
  const lateSku = await f.db.sku.create({ data: { accountId: f.account.id, productId: product.id, sellerSku: "D2D-LATE" } });
  const unknown = await f.db.$transaction((tx) => recognizeSaleCogsTx(tx, f.tenant, {
    lotKey: "d2d-late-sale", skuId: lateSku.id, quantity: { quantityAtoms: 1n, quantityScale: 0 },
    economicAt: new Date("2026-01-20Z"), operationKey: "d2d-late-sale", currencyCode: "EUR",
  }));
  const beforeResolution = await f.read();
  assert.equal(beforeResolution.status, "BLOCKED");
  if (beforeResolution.status === "BLOCKED") assert.ok(beforeResolution.reasonCodes.some((x) => x.startsWith("UNKNOWN_COST:")));
  await f.db.$transaction((tx) => recordCostRecordRevisionTx(tx, f.tenant, {
    skuId: lateSku.id, channelConnectionId: f.channel.id, sourceKind: "MANUAL", costKey: "late", operationKey: "d2d-late-cost",
    authorityTier: "MANUAL_OVERRIDE", effectiveFrom: new Date("2026-01-01Z"),
    unitCost: { amountAtoms: 275n, amountScale: 2, currencyCode: "EUR" }, evidenceKind: "MANUAL",
    manual: { actorRef: "d2d-test", manualReasonCode: "LATE_COST" },
  }));
  const resolution = await f.db.$transaction((tx) => resolveMissingCostTx(tx, f.tenant, {
    lotId: unknown.lot.id, operationKey: "d2d-resolve-late", economicAt: new Date("2026-02-10Z"), currencyCode: "EUR",
  }));
  assert.equal(resolution.status, "RESOLVED");
  const afterResolution = await f.read();
  assert.equal(afterResolution.status, "READY");
  if (afterResolution.status === "READY") {
    const lateCogs = afterResolution.cogs.find((x) => x.lotId === unknown.lot.id);
    assert.equal(lateCogs?.recognitionEconomicAt.toISOString(), "2026-01-20T00:00:00.000Z");
    assert.equal(lateCogs?.unitCostAtoms, 275n);
    assert.ok(lateCogs?.costEvidenceEventId);
    assert.notEqual(afterResolution.fingerprint, beforeResolution.fingerprint);
  }

  const badPolicy = await f.read({ currencyPolicyVersionId: "missing" });
  assert.equal(badPolicy.status, "BLOCKED");
  if (badPolicy.status === "BLOCKED") {
    assert.deepEqual(badPolicy.reasonCodes, ["INVALID_CURRENCY_POLICY"]);
    assert.equal("financialComponents" in badPolicy, false);
    assert.equal("cogs" in badPolicy, false);
  }
  await assert.rejects(f.db.$executeRawUnsafe(`UPDATE CurrencyPolicyVersion SET activatedAt=NULL WHERE id='${f.policy.id}'`));
  await assert.rejects(f.db.currencyPolicyVersion.update({ where: { id: f.policy.id }, data: { roundingMode: "HALF_UP" } }));
  f.sqlite.exec("PRAGMA recursive_triggers=OFF");
  const policyRowId = (f.sqlite.prepare("SELECT rowid FROM CurrencyPolicyVersion WHERE id=?").get(f.policy.id) as { rowid: number }).rowid;
  await assert.rejects(f.db.$executeRawUnsafe(`INSERT OR REPLACE INTO CurrencyPolicyVersion
    (id,version,checksum,exponentSourceVersion,roundingMode,toleranceAtoms,toleranceScale,residualPolicy,createdAt)
    VALUES ('replacement-id','${f.policy.version}','replace','x','REJECT',0,2,'SEPARATE',0)`));
  await assert.rejects(f.db.$executeRawUnsafe(`INSERT OR REPLACE INTO CurrencyPolicyVersion
    (rowid,id,version,checksum,exponentSourceVersion,roundingMode,toleranceAtoms,toleranceScale,residualPolicy,createdAt)
    VALUES (${policyRowId},'replacement-rowid','replacement-rowid','replace','x','REJECT',0,2,'SEPARATE',0)`));
  assert.equal((await f.db.currencyPolicyVersion.findUnique({ where: { id: f.policy.id } }))?.checksum, f.policy.checksum);
  await assert.rejects(f.db.currencyPolicyVersion.create({ data: {
    version: "d2d-invalid-active", checksum: "x", exponentSourceVersion: "x", roundingMode: "REJECT",
    toleranceAtoms: 0n, toleranceScale: 2, residualPolicy: "SEPARATE", activatedAt: new Date(),
  } }));

  const usdSku = await f.db.sku.create({ data: { accountId: f.account.id, productId: product.id, sellerSku: "D2D-USD" } });
  await f.db.$transaction((tx) => recordCostRecordRevisionTx(tx, f.tenant, {
    skuId: usdSku.id, channelConnectionId: f.channel.id, sourceKind: "MANUAL", costKey: "base", operationKey: "d2d-usd-cost",
    authorityTier: "MANUAL_OVERRIDE", effectiveFrom: new Date("2026-01-01Z"),
    unitCost: { amountAtoms: 300n, amountScale: 2, currencyCode: "USD" }, evidenceKind: "MANUAL",
    manual: { actorRef: "d2d-test", manualReasonCode: "KNOWN_COST" },
  }));
  await f.db.$transaction((tx) => recognizeSaleCogsTx(tx, f.tenant, {
    lotKey: "d2d-usd-sale", skuId: usdSku.id, quantity: { quantityAtoms: 1n, quantityScale: 0 },
    economicAt: new Date("2026-01-16Z"), operationKey: "d2d-usd-sale", currencyCode: "USD",
  }));
  const mixed = await f.read();
  assert.equal(mixed.status, "BLOCKED");
  if (mixed.status === "BLOCKED") assert.ok(mixed.reasonCodes.includes("MIXED_CURRENCY_WITHOUT_FX"));
  const unresolved = await f.scope("d2d-unresolved", "UNRESOLVED_EVENT", null, { start: new Date("2026-01-01Z"), end: new Date("2026-02-01Z") });
  const blocked = await f.read({ scope: { kind: "CHANNEL" } });
  assert.equal(blocked.status, "BLOCKED");
  if (blocked.status === "BLOCKED") {
    assert.ok(blocked.blockedScopes.includes(unresolved.id));
    assert.ok(blocked.reasonCodes.includes("UNRESOLVED_ECONOMIC_EVENT"));
    assert.equal("commerce" in blocked, false);
  }
  console.log("D2D integration: deterministic composition, fail-closed boundary, and currency policy remediation passed");
} finally {
  await f.cleanup();
}

async function semanticReplicaFingerprint() {
  const replica = await fixture();
  try {
    const product = await replica.db.product.create({ data: { accountId: replica.account.id, title: "semantic replica" } });
    const sku = await replica.db.sku.create({ data: { accountId: replica.account.id, productId: product.id, sellerSku: "SEMANTIC-SKU" } });
    await replica.db.$transaction((tx) => recordCostRecordRevisionTx(tx, replica.tenant, {
      skuId: sku.id, channelConnectionId: replica.channel.id, sourceKind: "MANUAL", costKey: "semantic", operationKey: "semantic-cost",
      authorityTier: "MANUAL_OVERRIDE", effectiveFrom: new Date("2026-01-01Z"),
      unitCost: { amountAtoms: 123n, amountScale: 2, currencyCode: "EUR" }, evidenceKind: "MANUAL",
      manual: { actorRef: "semantic", manualReasonCode: "SEMANTIC" },
    }));
    await replica.db.$transaction((tx) => recognizeSaleCogsTx(tx, replica.tenant, {
      lotKey: "semantic-lot", skuId: sku.id, quantity: { quantityAtoms: 1n, quantityScale: 0 },
      economicAt: new Date("2026-01-15Z"), operationKey: "semantic-lot", currencyCode: "EUR",
    }));
    const dataset = await replica.read();
    assert.equal(dataset.status, "READY");
    return dataset.fingerprint;
  } finally {
    await replica.cleanup();
  }
}
assert.equal(await semanticReplicaFingerprint(), await semanticReplicaFingerprint(),
  "generated database IDs and storage timestamps must not affect a semantic fingerprint");

async function semanticD2bFingerprint(amount: bigint) {
  const replica = await fixture();
  try {
    const scope = await replica.scope("semantic-financial-event", "SALE_BUNDLE");
    const source = await replica.source("finances");
    const binding = await replica.bind(scope.id, "ACTUAL", source, "semantic-source-event");
    const entry = await replica.ledger(replica.input(scope.id, "ACTUAL", binding.id, source, amount, "PRODUCT_REVENUE", "semantic-component"));
    await replica.evidence(scope.id, "ACTUAL", "COMPLETE", [source], [entry.entry.id]);
    await replica.publish(scope.id);
    const dataset = await replica.read();
    assert.equal(dataset.status, "READY");
    return dataset.fingerprint;
  } finally {
    await replica.cleanup();
  }
}
const semanticD2bA = await semanticD2bFingerprint(100n);
assert.equal(semanticD2bA, await semanticD2bFingerprint(100n),
  "D2B persistence IDs and storage timestamps must not affect semantic fingerprints");
assert.notEqual(semanticD2bA, await semanticD2bFingerprint(101n),
  "selected D2B economic amount must affect semantic fingerprints");
