import assert from "node:assert/strict";
import { recordNormalizedOrderItemRevisionTx, recordNormalizedOrderRevisionTx } from "../../app/core/data-core-d2a.server";
import { recordReplacementLinkTx } from "../../app/core/replacement-link.server";
import { fixture } from "./d2d.fixtures";

const f = await fixture();
try {
  let sequence = 0;
  const createOrder = async (marketplaceId: string | null = null, itemCount = 3) => {
    const key = `replacement-order-${++sequence}`;
    const provenance = await f.source("orders", marketplaceId, { entityId: key, entityType: "ORDER" });
    const order = await f.db.$transaction((tx) => recordNormalizedOrderRevisionTx(tx, f.tenant, {
      ...provenance, marketplaceId, sourceSystem: "SHOPIFY", sourceOrderKey: key, operationKey: `${key}-revision-1`,
      normalizedStatus: "FULFILLED", occurredAt: new Date("2026-01-15T00:00:00Z"),
    }));
    const items = [];
    for (let index = 0; index < itemCount; index++)
      items.push(await f.db.$transaction((tx) => recordNormalizedOrderItemRevisionTx(tx, f.tenant, {
        ...provenance, orderId: order.order.id, sourceItemKey: `id:${key}-item-${index}`,
        operationKey: `${key}-item-${index}-revision-1`, quantityAtoms: 1n, quantityScale: 0,
        occurredAt: new Date("2026-01-15T00:00:00Z"),
      })));
    return { order: order.order, items };
  };
  const link = (key: string, order: Awaited<ReturnType<typeof createOrder>>, predecessor = 0, replacement = 1,
    replacementKind: "FREE" | "CHARGED" = "FREE", financialTreatment: "NO_REVENUE" | "D2B_COMPONENT" = "NO_REVENUE") =>
    f.db.$transaction((tx) => recordReplacementLinkTx(tx, f.tenant, {
      linkKey: key, operationKey: `${key}-${++sequence}`, replacementKind, financialTreatment,
      predecessorItemId: order.items[predecessor].item.id, predecessorItemRevisionId: order.items[predecessor].revision.id,
      replacementItemId: order.items[replacement].item.id, replacementItemRevisionId: order.items[replacement].revision.id,
    }));
  const revenue = async (key: string, orderId: string, itemId: string, marketplaceId: string | null = null) => {
    const scope = await f.scope(`${key}-event`, "SALE_BUNDLE", marketplaceId);
    const provenance = await f.source("finances", marketplaceId);
    const binding = await f.bind(scope.id, "ACTUAL", provenance, `${key}-binding`);
    const entry = await f.ledger({
      ...f.input(scope.id, "ACTUAL", binding.id, provenance, 999n, "PRODUCT_REVENUE", `${key}-component`),
      orderId, itemId,
    });
    await f.evidence(scope.id, "ACTUAL", "COMPLETE", [provenance], [entry.entry.id]);
    await f.publish(scope.id);
    return entry.entry;
  };
  const readOrder = (orderId: string) => f.read({ scope: { kind: "ORDER", orderId } });
  const assertReplacementBlocked = (result: Awaited<ReturnType<typeof readOrder>>) => {
    assert.equal(result.status, "BLOCKED");
    if (result.status !== "BLOCKED") throw new Error("replacement contradiction escaped");
    assert.deepEqual(result.reasonCodes, ["REPLACEMENT_REVENUE_CONTRADICTION"]);
    assert.equal(result.completeness, "BLOCKED");
    assert.ok(result.diagnosticReferences.some((ref) => ref.kind === "REPLACEMENT_LINK"));
    assert.equal("financialComponents" in result, false);
    assert.equal("cogs" in result, false);
    assert.equal("inventoryEvents" in result, false);
  };

  const freeValid = await createOrder();
  await link("free-valid", freeValid);
  assert.equal((await readOrder(freeValid.order.id)).status, "READY", "FREE / NO_REVENUE without replacement revenue stays READY");

  const freeContradictory = await createOrder();
  await link("free-contradictory", freeContradictory);
  await revenue("free-contradictory", freeContradictory.order.id, freeContradictory.items[1].item.id);
  const freeBlocked = await readOrder(freeContradictory.order.id);
  assertReplacementBlocked(freeBlocked);
  assert.equal((await f.read({ scope: { kind: "ORDER_ITEM", orderId: freeContradictory.order.id,
    itemId: freeContradictory.items[1].item.id } })).status, "BLOCKED", "item scope must retain the contradiction");
  assert.equal((await f.read({ scope: { kind: "ORDER_ITEM", orderId: freeContradictory.order.id,
    itemId: freeContradictory.items[0].item.id } })).status, "BLOCKED", "predecessor item scope must retain the contradiction");

  const chargedValid = await createOrder();
  await link("charged-valid", chargedValid, 0, 1, "CHARGED", "D2B_COMPONENT");
  const chargedEntry = await revenue("charged-valid", chargedValid.order.id, chargedValid.items[1].item.id);
  const chargedReady = await readOrder(chargedValid.order.id);
  assert.equal(chargedReady.status, "READY", "CHARGED / D2B_COMPONENT with replacement-item revenue stays READY");
  if (chargedReady.status === "READY")
    assert.deepEqual(chargedReady.financialComponents.map((entry) => entry.id), [chargedEntry.id]);
  assert.equal((await f.read({ scope: { kind: "ORDER_ITEM", orderId: chargedValid.order.id,
    itemId: chargedValid.items[0].item.id } })).status, "READY", "predecessor item scope must see selected counterpart revenue");

  const chargedMissing = await createOrder();
  await link("charged-missing", chargedMissing, 0, 1, "CHARGED", "D2B_COMPONENT");
  assertReplacementBlocked(await readOrder(chargedMissing.order.id));

  const predecessorRevenue = await createOrder();
  await link("free-predecessor-revenue", predecessorRevenue);
  await revenue("free-predecessor-revenue", predecessorRevenue.order.id, predecessorRevenue.items[0].item.id);
  assert.equal((await readOrder(predecessorRevenue.order.id)).status, "READY", "predecessor revenue is unrelated");

  const siblingRevenue = await createOrder();
  await link("free-sibling-revenue", siblingRevenue);
  await revenue("free-sibling-revenue", siblingRevenue.order.id, siblingRevenue.items[2].item.id);
  assert.equal((await readOrder(siblingRevenue.order.id)).status, "READY", "same-order sibling revenue is unrelated");

  const latestRevision = await createOrder();
  await link("latest-revision", latestRevision);
  await link("latest-revision", latestRevision, 0, 1, "CHARGED", "D2B_COMPONENT");
  await revenue("latest-revision", latestRevision.order.id, latestRevision.items[1].item.id);
  const latestReady = await readOrder(latestRevision.order.id);
  assert.equal(latestReady.status, "READY");
  if (latestReady.status === "READY") {
    const effective = latestReady.replacements.find((replacement) => replacement.linkKey === "latest-revision");
    assert.equal(effective?.revision, 2);
    assert.equal(effective?.replacementKind, "CHARGED");
  }

  const multiple = await createOrder(null, 4);
  await link("multiple-valid", multiple, 0, 1);
  await link("multiple-invalid", multiple, 2, 3, "CHARGED", "D2B_COMPONENT");
  assertReplacementBlocked(await readOrder(multiple.order.id));

  const marketplaceA = await f.db.marketplace.create({ data: { ...f.tenant, externalMarketplaceId: "replacement-market-A" } });
  const marketplaceB = await f.db.marketplace.create({ data: { ...f.tenant, externalMarketplaceId: "replacement-market-B" } });
  const marketplaceFree = await createOrder(marketplaceA.id);
  await link("marketplace-free", marketplaceFree);
  const foreignOrder = await createOrder(marketplaceB.id);
  await revenue("marketplace-foreign", foreignOrder.order.id, foreignOrder.items[1].item.id, marketplaceB.id);
  assert.equal((await f.read({ scope: { kind: "MARKETPLACE", marketplaceId: marketplaceA.id } })).status, "READY",
    "foreign marketplace revenue must not contradict a free replacement");

  const channel = await f.read();
  assertReplacementBlocked(channel);
  assert.equal(freeBlocked.fingerprint, await readOrder(freeContradictory.order.id).then((result) => result.fingerprint),
    "blocked replacement fingerprint must be deterministic");
  console.log("D2D replacement revenue consistency truth table, isolation, scopes, revisions, and blocked contract: PASS");
} finally {
  await f.cleanup();
}

async function crossOrderCase(
  label: string,
  replacementKind: "FREE" | "CHARGED",
  financialTreatment: "NO_REVENUE" | "D2B_COMPONENT",
  revenueState: "NONE" | "SELECTED" | "BLOCKED",
) {
  const x = await fixture();
  try {
    const marketplace = await x.db.marketplace.create({ data: { ...x.tenant, externalMarketplaceId: `${label}-market` } });
    const makeOrder = async (suffix: string) => {
      const key = `${label}-${suffix}`;
      const provenance = await x.source("orders", marketplace.id, { entityId: key, entityType: "ORDER" });
      const order = await x.db.$transaction((tx) => recordNormalizedOrderRevisionTx(tx, x.tenant, {
        ...provenance, marketplaceId: marketplace.id, sourceSystem: "SHOPIFY", sourceOrderKey: key,
        operationKey: `${key}-order`, normalizedStatus: "FULFILLED", occurredAt: new Date("2026-01-15T00:00:00Z"),
      }));
      const item = await x.db.$transaction((tx) => recordNormalizedOrderItemRevisionTx(tx, x.tenant, {
        ...provenance, orderId: order.order.id, sourceItemKey: `id:${key}`, operationKey: `${key}-item`,
        quantityAtoms: 1n, quantityScale: 0, occurredAt: new Date("2026-01-15T00:00:00Z"),
      }));
      return { order: order.order, item, provenance };
    };
    const predecessor = await makeOrder("predecessor");
    const replacement = await makeOrder("replacement");
    await x.db.$transaction((tx) => recordReplacementLinkTx(tx, x.tenant, {
      linkKey: `${label}-link`, operationKey: `${label}-link-1`, replacementKind, financialTreatment,
      predecessorItemId: predecessor.item.item.id, predecessorItemRevisionId: predecessor.item.revision.id,
      replacementItemId: replacement.item.item.id, replacementItemRevisionId: replacement.item.revision.id,
    }));
    if (revenueState !== "NONE") {
      const scope = await x.scope(`${label}-revenue`, "SALE_BUNDLE", marketplace.id);
      const provenance = await x.source("finances", marketplace.id);
      const binding = await x.bind(scope.id, "ACTUAL", provenance, `${label}-binding`);
      const entry = await x.ledger({
        ...x.input(scope.id, "ACTUAL", binding.id, provenance, 999n, "PRODUCT_REVENUE", `${label}-component`),
        orderId: replacement.order.id, itemId: replacement.item.item.id,
      });
      await x.evidence(scope.id, "ACTUAL", revenueState === "SELECTED" ? "COMPLETE" : "INCOMPLETE", [provenance], [entry.entry.id]);
      await x.publish(scope.id);
    }
    const reads = {
      channel: await x.read(),
      marketplace: await x.read({ scope: { kind: "MARKETPLACE", marketplaceId: marketplace.id } }),
      predecessorOrder: await x.read({ scope: { kind: "ORDER", orderId: predecessor.order.id } }),
      predecessorItem: await x.read({ scope: { kind: "ORDER_ITEM", orderId: predecessor.order.id, itemId: predecessor.item.item.id } }),
      replacementOrder: await x.read({ scope: { kind: "ORDER", orderId: replacement.order.id } }),
      replacementItem: await x.read({ scope: { kind: "ORDER_ITEM", orderId: replacement.order.id, itemId: replacement.item.item.id } }),
    };
    return { x, reads, predecessor, replacement, makeOrder };
  } catch (error) {
    await x.cleanup();
    throw error;
  }
}

const crossFreeRevenue = await crossOrderCase("cross-free-revenue", "FREE", "NO_REVENUE", "SELECTED");
try {
  for (const result of Object.values(crossFreeRevenue.reads)) assert.equal(result.status, "BLOCKED");
  const predecessorBlocked = crossFreeRevenue.reads.predecessorOrder;
  if (predecessorBlocked.status !== "BLOCKED") throw new Error("cross-order FREE contradiction escaped");
  assert.ok(predecessorBlocked.reasonCodes.includes("REPLACEMENT_REVENUE_CONTRADICTION"));
  assert.equal(predecessorBlocked.fingerprint,
    (await crossFreeRevenue.x.read({ scope: { kind: "ORDER", orderId: crossFreeRevenue.predecessor.order.id } })).fingerprint);
  await crossFreeRevenue.x.db.$transaction((tx) => recordReplacementLinkTx(tx, crossFreeRevenue.x.tenant, {
    linkKey: "cross-free-revenue-link", operationKey: "cross-free-revenue-link-2",
    replacementKind: "CHARGED", financialTreatment: "D2B_COMPONENT",
    predecessorItemId: crossFreeRevenue.predecessor.item.item.id,
    predecessorItemRevisionId: crossFreeRevenue.predecessor.item.revision.id,
    replacementItemId: crossFreeRevenue.replacement.item.item.id,
    replacementItemRevisionId: crossFreeRevenue.replacement.item.revision.id,
  }));
  const revised = await crossFreeRevenue.x.read({ scope: { kind: "ORDER", orderId: crossFreeRevenue.predecessor.order.id } });
  assert.equal(revised.status, "READY", "latest FREE to CHARGED revision must control validation");
  if (revised.status === "READY") assert.equal(revised.financialComponents.length, 0, "validation-only revenue must not leak");

  const sameOrder = await crossFreeRevenue.makeOrder("same-order-valid");
  const sameOrderReplacement = await crossFreeRevenue.x.db.$transaction((tx) => recordNormalizedOrderItemRevisionTx(tx, crossFreeRevenue.x.tenant, {
    ...sameOrder.provenance, orderId: sameOrder.order.id, sourceItemKey: "id:cross-free-revenue-same-order-valid-replacement",
    operationKey: "cross-free-revenue-same-order-valid-replacement", quantityAtoms: 1n, quantityScale: 0,
    occurredAt: new Date("2026-01-15T00:00:00Z"),
  }));
  await crossFreeRevenue.x.db.$transaction((tx) => recordReplacementLinkTx(tx, crossFreeRevenue.x.tenant, {
    linkKey: "cross-free-revenue-same-order-valid-link", operationKey: "cross-free-revenue-same-order-valid-link-1",
    replacementKind: "FREE", financialTreatment: "NO_REVENUE",
    predecessorItemId: sameOrder.item.item.id, predecessorItemRevisionId: sameOrder.item.revision.id,
    replacementItemId: sameOrderReplacement.item.id, replacementItemRevisionId: sameOrderReplacement.revision.id,
  }));
  const secondPredecessor = await crossFreeRevenue.makeOrder("second-predecessor");
  const secondReplacement = await crossFreeRevenue.makeOrder("second-replacement");
  await crossFreeRevenue.x.db.$transaction((tx) => recordReplacementLinkTx(tx, crossFreeRevenue.x.tenant, {
    linkKey: "cross-free-revenue-second-cross-link", operationKey: "cross-free-revenue-second-cross-link-1",
    replacementKind: "CHARGED", financialTreatment: "D2B_COMPONENT",
    predecessorItemId: secondPredecessor.item.item.id, predecessorItemRevisionId: secondPredecessor.item.revision.id,
    replacementItemId: secondReplacement.item.item.id, replacementItemRevisionId: secondReplacement.item.revision.id,
  }));
  const multipleResult = await crossFreeRevenue.x.read();
  assert.equal(multipleResult.status, "BLOCKED", "one cross-order contradiction must block valid same- and cross-order relationships");
} finally { await crossFreeRevenue.x.cleanup(); }

const crossFreeNoRevenue = await crossOrderCase("cross-free-none", "FREE", "NO_REVENUE", "NONE");
try {
  for (const result of Object.values(crossFreeNoRevenue.reads)) assert.equal(result.status, "READY");
} finally { await crossFreeNoRevenue.x.cleanup(); }

const crossChargedRevenue = await crossOrderCase("cross-charged-revenue", "CHARGED", "D2B_COMPONENT", "SELECTED");
try {
  for (const result of Object.values(crossChargedRevenue.reads)) assert.equal(result.status, "READY");
  for (const result of [crossChargedRevenue.reads.predecessorOrder, crossChargedRevenue.reads.predecessorItem]) {
    if (result.status !== "READY") throw new Error("valid cross-order charged replacement blocked");
    assert.equal(result.financialComponents.length, 0, "validation-only replacement revenue leaked into predecessor output");
  }
  const replacementResult = crossChargedRevenue.reads.replacementOrder;
  if (replacementResult.status !== "READY") throw new Error("replacement order unexpectedly blocked");
  assert.equal(replacementResult.financialComponents.filter((entry) => entry.projectionKind === "PRODUCT_REVENUE").length, 1);
  await crossChargedRevenue.x.db.$transaction((tx) => recordReplacementLinkTx(tx, crossChargedRevenue.x.tenant, {
    linkKey: "cross-charged-revenue-link", operationKey: "cross-charged-revenue-link-2",
    replacementKind: "FREE", financialTreatment: "NO_REVENUE",
    predecessorItemId: crossChargedRevenue.predecessor.item.item.id,
    predecessorItemRevisionId: crossChargedRevenue.predecessor.item.revision.id,
    replacementItemId: crossChargedRevenue.replacement.item.item.id,
    replacementItemRevisionId: crossChargedRevenue.replacement.item.revision.id,
  }));
  assert.equal((await crossChargedRevenue.x.read({ scope: { kind: "ORDER", orderId: crossChargedRevenue.predecessor.order.id } })).status,
    "BLOCKED", "latest CHARGED to FREE revision must control validation");
} finally { await crossChargedRevenue.x.cleanup(); }

const crossChargedMissing = await crossOrderCase("cross-charged-none", "CHARGED", "D2B_COMPONENT", "NONE");
try {
  for (const result of Object.values(crossChargedMissing.reads)) assert.equal(result.status, "BLOCKED");
} finally { await crossChargedMissing.x.cleanup(); }

const crossAuthorityBlocked = await crossOrderCase("cross-authority-blocked", "FREE", "NO_REVENUE", "BLOCKED");
try {
  for (const result of [crossAuthorityBlocked.reads.predecessorOrder, crossAuthorityBlocked.reads.predecessorItem])
    assert.equal(result.status, "BLOCKED", "unavailable linked D2B authority must fail closed");
} finally { await crossAuthorityBlocked.x.cleanup(); }

console.log("D2D cross-order replacement validation scope, authority failure, and non-leakage: PASS");
