import assert from "node:assert/strict";
import { fixture } from "./d2b.fixtures";
import {
  recordCostRecordRevisionTx,
  selectApplicableCostTx,
} from "../../app/core/cost-record.server";
import {
  appendInventoryEconomicEventTx,
  linkReimbursementTx,
  recognizeSaleCogsTx,
  resolveMissingCostTx,
} from "../../app/core/inventory-economics.server";
import {
  recordNormalizedTaxEvidenceTx,
  recordTaxInterpretationPolicyVersionTx,
} from "../../app/core/tax-evidence.server";
import { recordReplacementLinkTx } from "../../app/core/replacement-link.server";
import { getEffectiveCostInventoryTaxTx } from "../../app/core/effective-cost-inventory-tax.server";
import {
  recordNormalizedOrderItemRevisionTx,
  recordNormalizedOrderRevisionTx,
} from "../../app/core/data-core-d2a.server";

const f = await fixture();
try {
  const product = await f.db.product.create({
    data: { accountId: f.account.id, title: "D2C" },
  });
  const sku = await f.db.sku.create({
    data: {
      accountId: f.account.id,
      productId: product.id,
      sellerSku: "D2C-SKU",
    },
  });
  const at = new Date("2026-01-10T00:00:00Z");
  const writeCost = (input: Parameters<typeof recordCostRecordRevisionTx>[2]) =>
    f.db.$transaction((tx) => recordCostRecordRevisionTx(tx, f.tenant, input));
  const publishActual = async (
    family: "REFUND_BUNDLE" | "REIMBURSEMENT_BUNDLE",
    kind: "REFUND" | "REIMBURSEMENT",
    key: string,
    amount: bigint,
  ) => {
    const scope = await f.scope(key, family);
    const identity = f.next();
    const source = await f.source("finances", null, { entityId: identity });
    const binding = await f.bind(scope.id, "ACTUAL", source, identity);
    const ledger = await f.ledger(
      f.input(scope.id, "ACTUAL", binding.id, source, amount, kind),
    );
    await f.evidence(
      scope.id,
      "ACTUAL",
      "COMPLETE",
      [source],
      [ledger.entry.id],
    );
    await f.publish(scope.id);
    return ledger.entry;
  };
  const c = await writeCost({
    skuId: sku.id,
    sourceKind: "MANUAL",
    costKey: "base",
    operationKey: "cost-1",
    authorityTier: "MANUAL_OVERRIDE",
    effectiveFrom: new Date("2026-01-01Z"),
    unitCost: { amountAtoms: 250n, amountScale: 2, currencyCode: "EUR" },
    evidenceKind: "MANUAL",
    manual: { actorRef: "tester", manualReasonCode: "KNOWN_COST" },
  });
  assert.equal(
    (
      await writeCost({
        skuId: sku.id,
        sourceKind: "MANUAL",
        costKey: "base",
        operationKey: "cost-1",
        authorityTier: "MANUAL_OVERRIDE",
        effectiveFrom: new Date("2026-01-01Z"),
        unitCost: { amountAtoms: 250n, amountScale: 2, currencyCode: "EUR" },
        evidenceKind: "MANUAL",
        manual: { actorRef: "tester", manualReasonCode: "KNOWN_COST" },
      })
    ).revision.id,
    c.revision.id,
  );
  await assert.rejects(
    writeCost({
      skuId: sku.id,
      sourceKind: "MANUAL",
      costKey: "base",
      operationKey: "cost-1",
      authorityTier: "MANUAL_OVERRIDE",
      effectiveFrom: new Date("2026-01-01Z"),
      unitCost: { amountAtoms: 251n, amountScale: 2, currencyCode: "EUR" },
      evidenceKind: "MANUAL",
      manual: { actorRef: "tester", manualReasonCode: "KNOWN_COST" },
    }),
  );
  const replacementOrderKey = "replacement-order";
  const replacementSource = await f.source("orders", null, {
    entityId: replacementOrderKey,
    entityType: "ORDER",
  });
  const replacementOrder = await f.db.$transaction((tx) =>
    recordNormalizedOrderRevisionTx(tx, f.tenant, {
      ...replacementSource,
      marketplaceId: null,
      sourceSystem: "SHOPIFY",
      sourceOrderKey: replacementOrderKey,
      operationKey: "replacement-order",
      normalizedStatus: "FULFILLED",
    }),
  );
  const replacementItems: Array<{
    item: { id: string };
    revision: { id: string };
  }> = [];
  for (const key of ["id:original", "id:replacement", "id:third"]) {
    replacementItems.push(
      await f.db.$transaction((tx) =>
        recordNormalizedOrderItemRevisionTx(tx, f.tenant, {
          ...replacementSource,
          orderId: replacementOrder.order.id,
          sourceItemKey: key,
          operationKey: `replacement-${key}`,
          quantityAtoms: 1n,
          quantityScale: 0,
        }),
      ),
    );
  }
  const freeLink = await f.db.$transaction((tx) =>
    recordReplacementLinkTx(tx, f.tenant, {
      linkKey: "free-valid",
      operationKey: "free-valid",
      replacementKind: "FREE",
      financialTreatment: "NO_REVENUE",
      predecessorItemId: replacementItems[0].item.id,
      predecessorItemRevisionId: replacementItems[0].revision.id,
      replacementItemId: replacementItems[1].item.id,
      replacementItemRevisionId: replacementItems[1].revision.id,
    }),
  );
  assert.equal(freeLink.financialTreatment, "NO_REVENUE");
  await assert.rejects(
    f.db.$transaction((tx) =>
      recordReplacementLinkTx(tx, f.tenant, {
        linkKey: "self-link",
        operationKey: "self-link",
        replacementKind: "CHARGED",
        financialTreatment: "D2B_COMPONENT",
        predecessorItemId: replacementItems[0].item.id,
        predecessorItemRevisionId: replacementItems[0].revision.id,
        replacementItemId: replacementItems[0].item.id,
        replacementItemRevisionId: replacementItems[0].revision.id,
      }),
    ),
  );
  await f.db.$transaction((tx) =>
    recordReplacementLinkTx(tx, f.tenant, {
      linkKey: "chain-2",
      operationKey: "chain-2",
      replacementKind: "CHARGED",
      financialTreatment: "D2B_COMPONENT",
      predecessorItemId: replacementItems[1].item.id,
      predecessorItemRevisionId: replacementItems[1].revision.id,
      replacementItemId: replacementItems[2].item.id,
      replacementItemRevisionId: replacementItems[2].revision.id,
    }),
  );
  await assert.rejects(
    f.db.$transaction((tx) =>
      recordReplacementLinkTx(tx, f.tenant, {
        linkKey: "cycle-3",
        operationKey: "cycle-3",
        replacementKind: "CHARGED",
        financialTreatment: "D2B_COMPONENT",
        predecessorItemId: replacementItems[2].item.id,
        predecessorItemRevisionId: replacementItems[2].revision.id,
        replacementItemId: replacementItems[0].item.id,
        replacementItemRevisionId: replacementItems[0].revision.id,
      }),
    ),
  );
  assert.equal(
    (
      await f.db.$transaction((tx) =>
        selectApplicableCostTx(tx, f.tenant, {
          skuId: sku.id,
          economicAt: at,
          currencyCode: "EUR",
        }),
      )
    ).status,
    "KNOWN",
  );
  const sale = await f.db.$transaction((tx) =>
    recognizeSaleCogsTx(tx, f.tenant, {
      lotKey: "sale-1",
      skuId: sku.id,
      quantity: { quantityAtoms: 2n, quantityScale: 0 },
      economicAt: at,
      operationKey: "sale-op",
      currencyCode: "EUR",
    }),
  );
  assert.equal(sale.lot.unitCostAtoms, 250n);
  const saleReplay = await f.db.$transaction((tx) =>
    recognizeSaleCogsTx(tx, f.tenant, {
      lotKey: "sale-1",
      skuId: sku.id,
      quantity: { quantityAtoms: 2n, quantityScale: 0 },
      economicAt: at,
      operationKey: "sale-op",
      currencyCode: "EUR",
    }),
  );
  assert.equal(saleReplay.lot.id, sale.lot.id);
  assert.equal(
    await f.db.inventoryEconomicEvent.count({
      where: { lotId: sale.lot.id, eventType: "SALE_RECOGNITION" },
    }),
    1,
  );
  const refundFirst = await f.db.$transaction((tx) =>
    recognizeSaleCogsTx(tx, f.tenant, {
      lotKey: "refund-first",
      skuId: sku.id,
      quantity: { quantityAtoms: 1n, quantityScale: 0 },
      economicAt: at,
      operationKey: "refund-first-sale",
      currencyCode: "EUR",
    }),
  );
  const refundFirstEvents = await f.db.inventoryEconomicEvent.count({
    where: { lotId: refundFirst.lot.id },
  });
  await publishActual("REFUND_BUNDLE", "REFUND", "REFUND:first", -10000n);
  assert.equal(
    await f.db.inventoryEconomicEvent.count({
      where: { lotId: refundFirst.lot.id },
    }),
    refundFirstEvents,
  );
  await f.db.$transaction((tx) =>
    appendInventoryEconomicEventTx(tx, f.tenant, {
      lotId: refundFirst.lot.id,
      eventType: "RETURN_INITIATED",
      stateFrom: "SOLD",
      stateTo: "RETURN_IN_TRANSIT",
      quantity: { quantityAtoms: 1n, quantityScale: 0 },
      operationKey: "refund-first-return",
      economicAt: at,
    }),
  );
  const returnFirst = await f.db.$transaction((tx) =>
    recognizeSaleCogsTx(tx, f.tenant, {
      lotKey: "return-first",
      skuId: sku.id,
      quantity: { quantityAtoms: 1n, quantityScale: 0 },
      economicAt: at,
      operationKey: "return-first-sale",
      currencyCode: "EUR",
    }),
  );
  await f.db.$transaction((tx) =>
    appendInventoryEconomicEventTx(tx, f.tenant, {
      lotId: returnFirst.lot.id,
      eventType: "RETURN_INITIATED",
      stateFrom: "SOLD",
      stateTo: "RETURN_IN_TRANSIT",
      quantity: { quantityAtoms: 1n, quantityScale: 0 },
      operationKey: "return-first-return",
      economicAt: at,
    }),
  );
  const returnFirstEvents = await f.db.inventoryEconomicEvent.count({
    where: { lotId: returnFirst.lot.id },
  });
  await publishActual("REFUND_BUNDLE", "REFUND", "REFUND:second", -10000n);
  assert.equal(
    await f.db.inventoryEconomicEvent.count({
      where: { lotId: returnFirst.lot.id },
    }),
    returnFirstEvents,
  );
  const replacementLot = await f.db.$transaction((tx) =>
    recognizeSaleCogsTx(tx, f.tenant, {
      lotKey: "replacement-lot",
      skuId: sku.id,
      quantity: { quantityAtoms: 1n, quantityScale: 0 },
      economicAt: at,
      operationKey: "replacement-lot",
      originKind: "REPLACEMENT_ITEM",
      currencyCode: "EUR",
    }),
  );
  assert.equal(replacementLot.lot.costStatus, "KNOWN");
  assert.equal(
    await f.db.inventoryEconomicEvent.count({
      where: { lotId: replacementLot.lot.id, eventType: "REPLACEMENT_SENT" },
    }),
    1,
  );
  await writeCost({
    skuId: sku.id,
    sourceKind: "MANUAL",
    costKey: "base",
    operationKey: "cost-2",
    authorityTier: "MANUAL_OVERRIDE",
    effectiveFrom: new Date("2026-02-01Z"),
    unitCost: { amountAtoms: 999n, amountScale: 2, currencyCode: "EUR" },
    evidenceKind: "MANUAL",
    manual: { actorRef: "tester", manualReasonCode: "PRICE_CHANGE" },
  });
  assert.equal(
    (
      await f.db.inventoryEconomicLot.findUniqueOrThrow({
        where: { id: sale.lot.id },
      })
    ).unitCostAtoms,
    250n,
  );
  await assert.rejects(
    f.db.$transaction((tx) =>
      appendInventoryEconomicEventTx(tx, f.tenant, {
        lotId: sale.lot.id,
        eventType: "RETURN_INITIATED",
        stateFrom: "SOLD",
        stateTo: "RETURN_IN_TRANSIT",
        quantity: { quantityAtoms: 3n, quantityScale: 0 },
        operationKey: "too-many",
        economicAt: at,
      }),
    ),
  );
  const unsellable = await f.db.$transaction((tx) =>
    recognizeSaleCogsTx(tx, f.tenant, {
      lotKey: "unsellable",
      skuId: sku.id,
      quantity: { quantityAtoms: 1n, quantityScale: 0 },
      economicAt: at,
      operationKey: "unsellable-sale",
      currencyCode: "EUR",
    }),
  );
  await f.db.$transaction(async (tx) => {
    await appendInventoryEconomicEventTx(tx, f.tenant, {
      lotId: unsellable.lot.id,
      eventType: "RETURN_RECEIVED",
      stateFrom: "SOLD",
      stateTo: "RETURNED_PENDING_INSPECTION",
      quantity: { quantityAtoms: 1n, quantityScale: 0 },
      operationKey: "unsellable-received",
      economicAt: at,
    });
    await appendInventoryEconomicEventTx(tx, f.tenant, {
      lotId: unsellable.lot.id,
      eventType: "RESTOCKED_UNSELLABLE",
      stateFrom: "RETURNED_PENDING_INSPECTION",
      stateTo: "UNSELLABLE",
      quantity: { quantityAtoms: 1n, quantityScale: 0 },
      operationKey: "unsellable-restocked",
      economicAt: at,
    });
  });
  assert.equal(
    await f.db.inventoryEconomicEvent.count({
      where: { lotId: unsellable.lot.id, eventType: "RESTOCKED_SELLABLE" },
    }),
    0,
  );
  await f.db.$transaction((tx) =>
    appendInventoryEconomicEventTx(tx, f.tenant, {
      lotId: sale.lot.id,
      eventType: "RETURN_INITIATED",
      stateFrom: "SOLD",
      stateTo: "RETURN_IN_TRANSIT",
      quantity: { quantityAtoms: 1n, quantityScale: 0 },
      operationKey: "return",
      economicAt: at,
    }),
  );
  await f.db.$transaction((tx) =>
    appendInventoryEconomicEventTx(tx, f.tenant, {
      lotId: sale.lot.id,
      eventType: "RETURN_RECEIVED",
      stateFrom: "RETURN_IN_TRANSIT",
      stateTo: "RETURNED_PENDING_INSPECTION",
      quantity: { quantityAtoms: 1n, quantityScale: 0 },
      operationKey: "received",
      economicAt: at,
    }),
  );
  await f.db.$transaction((tx) =>
    appendInventoryEconomicEventTx(tx, f.tenant, {
      lotId: sale.lot.id,
      eventType: "RESTOCKED_SELLABLE",
      stateFrom: "RETURNED_PENDING_INSPECTION",
      stateTo: "SELLABLE",
      quantity: { quantityAtoms: 1n, quantityScale: 0 },
      operationKey: "restock",
      economicAt: at,
    }),
  );
  await assert.rejects(
    f.db.$transaction((tx) =>
      appendInventoryEconomicEventTx(tx, f.tenant, {
        lotId: sale.lot.id,
        eventType: "RESTOCKED_SELLABLE",
        stateFrom: "RETURNED_PENDING_INSPECTION",
        stateTo: "SELLABLE",
        quantity: { quantityAtoms: 1n, quantityScale: 0 },
        operationKey: "restock-again",
        economicAt: at,
      }),
    ),
  );
  const unknownSku = await f.db.sku.create({
    data: {
      accountId: f.account.id,
      productId: product.id,
      sellerSku: "D2C-UNKNOWN",
    },
  });
  const unknown = await f.db.$transaction((tx) =>
    recognizeSaleCogsTx(tx, f.tenant, {
      lotKey: "unknown",
      skuId: unknownSku.id,
      quantity: { quantityAtoms: 1n, quantityScale: 0 },
      economicAt: at,
      operationKey: "unknown-sale",
      currencyCode: "EUR",
    }),
  );
  assert.equal(unknown.lot.costStatus, "UNKNOWN");
  assert.equal(
    (
      await f.db.$transaction((tx) =>
        getEffectiveCostInventoryTaxTx(tx, f.tenant),
      )
    ).status,
    "BLOCKED",
  );
  await assert.rejects(
    f.db.$executeRawUnsafe(
      `INSERT INTO InventoryEconomicEvent(id,accountId,channelConnectionId,lotId,eventType,effectClass,quantityAtoms,quantityScale,operationKey,inputChecksum,economicAt) VALUES('null-resolution','${f.account.id}','${f.channel.id}','${unknown.lot.id}','COST_BASIS_RESOLVED','COST_BASIS',1,0,'null-resolution','x',${at.getTime()})`,
    ),
  );
  await writeCost({
    skuId: unknownSku.id,
    sourceKind: "MANUAL",
    costKey: "late",
    operationKey: "late-cost",
    authorityTier: "MANUAL_OVERRIDE",
    effectiveFrom: new Date("2026-01-01Z"),
    unitCost: { amountAtoms: 100n, amountScale: 2, currencyCode: "EUR" },
    evidenceKind: "MANUAL",
    manual: { actorRef: "tester", manualReasonCode: "LATE" },
  });
  assert.equal(
    (
      await f.db.$transaction((tx) =>
        resolveMissingCostTx(tx, f.tenant, {
          lotId: unknown.lot.id,
          operationKey: "resolve",
          economicAt: at,
          currencyCode: "EUR",
        }),
      )
    ).status,
    "RESOLVED",
  );
  assert.equal(
    await f.db.inventoryEconomicLot.count({ where: { lotKey: "unknown" } }),
    1,
  );
  assert.equal(
    (
      await f.db.$transaction((tx) =>
        getEffectiveCostInventoryTaxTx(tx, f.tenant),
      )
    ).status,
    "READY",
  );
  await assert.rejects(
    f.db.$executeRawUnsafe(
      `INSERT INTO InventoryEconomicEvent(id,accountId,channelConnectionId,lotId,eventType,effectClass,stateFrom,stateTo,quantityAtoms,quantityScale,operationKey,inputChecksum,economicAt) VALUES('raw-over','${f.account.id}','${f.channel.id}','${unknown.lot.id}','RETURN_INITIATED','PHYSICAL','SOLD','RETURN_IN_TRANSIT',2,0,'raw-over','x',${at.getTime()})`,
    ),
  );
  await assert.rejects(
    f.db.$executeRawUnsafe(
      `INSERT INTO InventoryEconomicEvent(id,accountId,channelConnectionId,lotId,eventType,effectClass,stateFrom,stateTo,quantityAtoms,quantityScale,operationKey,inputChecksum,economicAt) VALUES('raw-zero','${f.account.id}','${f.channel.id}','${unknown.lot.id}','RESTOCKED_SELLABLE','PHYSICAL','RETURNED_PENDING_INSPECTION','SELLABLE',1,0,'raw-zero','x',${at.getTime()})`,
    ),
  );
  const otherAccount = await f.db.account.create({ data: {} });
  const otherChannel = await f.db.channelConnection.create({
    data: {
      accountId: otherAccount.id,
      channel: "SHOPIFY",
      externalAccountId: "d2c-other",
    },
  });
  const otherMarketplace = await f.db.marketplace.create({
    data: {
      accountId: otherAccount.id,
      channelConnectionId: otherChannel.id,
      externalMarketplaceId: "other-market",
    },
  });
  await assert.rejects(
    f.db.$executeRawUnsafe(
      `INSERT INTO InventoryEconomicLot(id,accountId,channelConnectionId,marketplaceId,marketplaceScopeKey,skuId,lotKey,originKind,quantityAtoms,quantityScale,costStatus,recognitionEconomicAt,operationKey,inputChecksum) VALUES('cross-market','${f.account.id}','${f.channel.id}','${otherMarketplace.id}','${otherMarketplace.id}','${sku.id}','cross-market','SALE_ITEM',1,0,'UNKNOWN',${at.getTime()},'cross-market','x')`,
    ),
  );
  await assert.rejects(
    f.db.$executeRawUnsafe(
      `INSERT INTO InventoryEconomicEvent(id,accountId,channelConnectionId,lotId,eventType,effectClass,quantityAtoms,quantityScale,costRecordRevisionId,unitCostAtoms,unitCostScale,currencyCode,operationKey,inputChecksum,economicAt) VALUES('wrong-sku-cost','${f.account.id}','${f.channel.id}','${unknown.lot.id}','COST_BASIS_RESOLVED','COST_BASIS',1,0,'${c.revision.id}',250,2,'EUR','wrong-sku-cost','x',${at.getTime()})`,
    ),
  );
  await assert.rejects(
    f.db.$executeRawUnsafe(
      `INSERT INTO NormalizedTaxEvidence(id,accountId,channelConnectionId,evidenceKey,revision,operationKey,inputChecksum,status,marketplaceId,category,economicRole,priceRelation,authorityClass,availability,coverageState,confidence) VALUES('cross-tax','${f.account.id}','${f.channel.id}','cross-tax',1,'cross-tax','x','PRESENT','${otherMarketplace.id}','VAT','UNKNOWN','UNKNOWN','UNKNOWN','UNAVAILABLE','UNKNOWN','LOW')`,
    ),
  );
  await assert.rejects(
    f.db.$transaction((tx) =>
      recordNormalizedTaxEvidenceTx(tx, f.tenant, {
        evidenceKey: "tax-bad",
        operationKey: "tax-bad",
        category: "VAT",
        economicRole: "COLLECTED",
        priceRelation: "INCLUDED",
        authorityClass: "UNKNOWN",
        availability: "UNKNOWN",
        coverageState: "UNKNOWN",
        confidence: "LOW",
        amount: { amountAtoms: 0n, amountScale: 2, currencyCode: "EUR" },
      }),
    ),
  );
  const taxPolicy = await f.db.$transaction((tx) =>
    recordTaxInterpretationPolicyVersionTx(tx, f.tenant, {
      policyKey: "future",
      operationKey: "policy-1",
      rules: { included: true },
      effectiveFrom: at,
      actorRef: "tester",
      reasonCode: "TEST",
    }),
  );
  const taxSource = await f.source("tax");
  const taxPresent = await f.db.$transaction((tx) =>
    recordNormalizedTaxEvidenceTx(tx, f.tenant, {
      ...taxSource,
      sourceLeafPath: "/tax/collected",
      evidenceKey: "tax-present",
      operationKey: "tax-present",
      category: "VAT",
      economicRole: "COLLECTED",
      priceRelation: "EXCLUDED",
      authorityClass: "ACTUAL",
      availability: "PRESENT",
      coverageState: "COMPLETE",
      confidence: "HIGH",
      amount: { amountAtoms: 2000n, amountScale: 2, currencyCode: "EUR" },
    }),
  );
  assert.equal(taxPresent.amountAtoms, 2000n);
  const taxUnavailable = await f.db.$transaction((tx) =>
    recordNormalizedTaxEvidenceTx(tx, f.tenant, {
      evidenceKey: "tax-unavailable",
      operationKey: "tax-unavailable",
      category: "VAT",
      economicRole: "UNKNOWN",
      priceRelation: "UNKNOWN",
      authorityClass: "UNKNOWN",
      availability: "UNAVAILABLE",
      coverageState: "UNKNOWN",
      confidence: "LOW",
    }),
  );
  assert.equal(taxUnavailable.amountAtoms, null);
  const taxZero = await f.db.$transaction((tx) =>
    recordNormalizedTaxEvidenceTx(tx, f.tenant, {
      ...taxSource,
      sourceLeafPath: "/tax/zero",
      evidenceKey: "tax-zero",
      operationKey: "tax-zero",
      category: "VAT",
      economicRole: "COLLECTED",
      priceRelation: "EXCLUDED",
      authorityClass: "ACTUAL",
      availability: "CONFIRMED_ZERO",
      coverageState: "COMPLETE",
      confidence: "HIGH",
      amount: { amountAtoms: 0n, amountScale: 2, currencyCode: "EUR" },
    }),
  );
  assert.equal(taxZero.amountAtoms, 0n);
  await assert.rejects(
    f.db.$transaction((tx) =>
      recordReplacementLinkTx(tx, f.tenant, {
        linkKey: "free-invalid",
        operationKey: "free-invalid",
        replacementKind: "FREE",
        financialTreatment: "D2B_COMPONENT",
        predecessorItemId: "unused-a",
        predecessorItemRevisionId: "unused-ar",
        replacementItemId: "unused-b",
        replacementItemRevisionId: "unused-br",
      }),
    ),
  );
  const reimbursement = await publishActual(
    "REIMBURSEMENT_BUNDLE",
    "REIMBURSEMENT",
    "REIMBURSEMENT:d2c",
    3500n,
  );
  const lostLot = await f.db.$transaction((tx) =>
    recognizeSaleCogsTx(tx, f.tenant, {
      lotKey: "lost-lot",
      skuId: sku.id,
      quantity: { quantityAtoms: 1n, quantityScale: 0 },
      economicAt: at,
      operationKey: "lost-sale",
      currencyCode: "EUR",
    }),
  );
  await f.db.$transaction((tx) =>
    appendInventoryEconomicEventTx(tx, f.tenant, {
      lotId: lostLot.lot.id,
      eventType: "LOST",
      stateFrom: "SOLD",
      stateTo: "LOST",
      quantity: { quantityAtoms: 1n, quantityScale: 0 },
      operationKey: "lost",
      economicAt: at,
    }),
  );
  await assert.rejects(
    f.db.$transaction((tx) =>
      linkReimbursementTx(tx, f.tenant, {
        lotId: lostLot.lot.id,
        state: "LOST",
        quantity: { quantityAtoms: 2n, quantityScale: 0 },
        financialLedgerEntryId: reimbursement.id,
        operationKey: "reimburse-too-many",
        economicAt: at,
      }),
    ),
  );
  await assert.rejects(
    f.db.$executeRawUnsafe(
      `INSERT INTO InventoryEconomicEvent(id,accountId,channelConnectionId,lotId,eventType,effectClass,stateFrom,stateTo,quantityAtoms,quantityScale,financialLedgerEntryId,operationKey,inputChecksum,economicAt) VALUES('raw-reimburse-over','${f.account.id}','${f.channel.id}','${lostLot.lot.id}','REIMBURSEMENT_LINKED','COST_BASIS','LOST','LOST',2,0,'${reimbursement.id}','raw-reimburse-over','x',${at.getTime()})`,
    ),
  );
  const linked = await f.db.$transaction((tx) =>
    linkReimbursementTx(tx, f.tenant, {
      lotId: lostLot.lot.id,
      state: "LOST",
      quantity: { quantityAtoms: 1n, quantityScale: 0 },
      financialLedgerEntryId: reimbursement.id,
      operationKey: "reimburse-one",
      economicAt: at,
    }),
  );
  assert.equal(linked.eventType, "REIMBURSEMENT_LINKED");
  await assert.rejects(
    f.db.$executeRawUnsafe(
      `INSERT INTO ReplacementLink(id,accountId,channelConnectionId,linkKey,revision,operationKey,inputChecksum,status,replacementKind,financialTreatment,predecessorItemId,predecessorItemRevisionId,replacementItemId,replacementItemRevisionId) VALUES('free-db-bad','${f.account.id}','${f.channel.id}','free-db-bad',1,'free-db-bad','x','PRESENT','FREE','D2B_COMPONENT','a','ar','b','br')`,
    ),
    /free replacement cannot have revenue/,
  );
  await f.db.$transaction(async (tx) => {
    await appendInventoryEconomicEventTx(tx, f.tenant, {
      lotId: lostLot.lot.id,
      eventType: "COMPENSATION",
      stateFrom: "LOST",
      stateTo: "RETURNED_PENDING_INSPECTION",
      quantity: { quantityAtoms: 1n, quantityScale: 0 },
      compensatesEventId: linked.id,
      operationKey: "reimbursement-compensation",
      economicAt: at,
    });
    await appendInventoryEconomicEventTx(tx, f.tenant, {
      lotId: lostLot.lot.id,
      eventType: "RESTOCKED_SELLABLE",
      stateFrom: "RETURNED_PENDING_INSPECTION",
      stateTo: "SELLABLE",
      quantity: { quantityAtoms: 1n, quantityScale: 0 },
      operationKey: "reimbursed-restock",
      economicAt: at,
    });
  });
  await assert.rejects(
    f.db.$transaction((tx) =>
      appendInventoryEconomicEventTx(tx, f.tenant, {
        lotId: lostLot.lot.id,
        eventType: "COMPENSATION",
        stateFrom: "LOST",
        stateTo: "RETURNED_PENDING_INSPECTION",
        quantity: { quantityAtoms: 2n, quantityScale: 0 },
        compensatesEventId: linked.id,
        operationKey: "excess-compensation",
        economicAt: at,
      }),
    ),
  );
  await assert.rejects(
    f.db.$executeRawUnsafe(
      `UPDATE InventoryEconomicLot SET lotKey='tampered' WHERE id='${sale.lot.id}'`,
    ),
  );
  for (const [table, id] of [
    ["CostRecord", c.record.id],
    ["CostRecordRevision", c.revision.id],
    ["InventoryEconomicLot", sale.lot.id],
    ["InventoryEconomicEvent", linked.id],
    ["ReplacementLink", freeLink.id],
    ["NormalizedTaxEvidence", taxPresent.id],
    ["TaxInterpretationPolicyVersion", taxPolicy.id],
  ] as const)
    await assert.rejects(
      f.db.$executeRawUnsafe(
        `INSERT OR REPLACE INTO ${table} SELECT * FROM ${table} WHERE id='${id}'`,
      ),
    );
  await assert.rejects(
    f.db.$executeRawUnsafe(
      `INSERT OR REPLACE INTO InventoryEconomicLot SELECT * FROM InventoryEconomicLot WHERE id='${sale.lot.id}'`,
    ),
  );
  console.log("D2C integration: PASS");
} finally {
  await f.cleanup();
}
