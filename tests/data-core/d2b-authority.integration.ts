import assert from "node:assert/strict";
import { fixture } from "./d2b.fixtures";
import { sumFinancialMoney } from "../../app/core/data-core-d2b-contracts";
import { getEffectiveFinancialComponentsTx } from "../../app/core/effective-financial-components.server";
import { publishFinancialAuthorityDecisionTx } from "../../app/core/financial-authority.server";
export async function authorityCases() {
  const f = await fixture();
  try {
    const s = await f.scope("SALE:case-A"),
      p = await f.source("orders"),
      a = await f.source("finances");
    const bp = await f.bind(s.id, "PROVISIONAL", p),
      ba = await f.bind(s.id, "ACTUAL", a);
    const pRevenue = await f.ledger(
      f.input(
        s.id,
        "PROVISIONAL",
        bp.id,
        p,
        10000n,
        "PRODUCT_REVENUE",
        "sale:revenue",
      ),
    );
    await f.evidence(s.id, "PROVISIONAL", "COMPLETE", [p], [pRevenue.entry.id]);
    const firstDecision = await f.publish(s.id);
    let result = await f.effective();
    assert.equal(result.status, "READY");
    if (result.status !== "READY") throw Error("expected ready");
    assert.equal(result.completeness, "PROVISIONAL");
    assert.equal(sumFinancialMoney(result.components)?.amountAtoms, 10000n);
    const ar = await f.ledger(
      f.input(
        s.id,
        "ACTUAL",
        ba.id,
        a,
        10000n,
        "PRODUCT_REVENUE",
        "transaction:revenue",
      ),
    );
    assert.equal((await f.effective()).status, "BLOCKED"); // new head makes previous decision stale.
    await f.evidence(s.id, "ACTUAL", "COMPLETE", [a], [ar.entry.id]);
    await f.publish(s.id);
    result = await f.effective();
    assert.equal(result.status, "READY");
    if (result.status !== "READY") throw Error("expected actual");
    assert.equal(result.components.length, 1);
    assert.equal(result.components[0].authorityClass, "ACTUAL");
    assert.equal(sumFinancialMoney(result.components)?.amountAtoms, 10000n);
    assert.equal(
      (
        await f.db.financialComponentSelection.findFirstOrThrow({
          where: { decisionId: firstDecision.id },
        })
      ).entryId,
      pRevenue.entry.id,
    );
    console.log("D2B CASE A PASS: actual 100, never 200");
  } finally {
    await f.cleanup();
  }
  const f2 = await fixture();
  try {
    const s = await f2.scope("SALE:case-BCD"),
      p = await f2.source("orders"),
      a = await f2.source("finances");
    const bp = await f2.bind(s.id, "PROVISIONAL", p),
      ba = await f2.bind(s.id, "ACTUAL", a);
    const pr = await f2.ledger(
      f2.input(
        s.id,
        "PROVISIONAL",
        bp.id,
        p,
        10000n,
        "PRODUCT_REVENUE",
        "sale:revenue",
      ),
    );
    const pf = await f2.ledger(
      f2.input(
        s.id,
        "PROVISIONAL",
        bp.id,
        p,
        -1500n,
        "MARKETPLACE_COMMISSION",
        "sale:fee",
      ),
    );
    const af = await f2.ledger(
      f2.input(
        s.id,
        "ACTUAL",
        ba.id,
        a,
        -1450n,
        "MARKETPLACE_COMMISSION",
        "actual:fee",
      ),
    );
    await f2.evidence(
      s.id,
      "PROVISIONAL",
      "COMPLETE",
      [p],
      [pr.entry.id, pf.entry.id],
    );
    await f2.evidence(s.id, "ACTUAL", "INCOMPLETE", [a], [af.entry.id]);
    const b = await f2.publish(s.id);
    assert.equal(b.authorityState, "ACTUAL_INCOMPLETE");
    let result = await f2.effective();
    if (result.status !== "READY") throw Error("B blocked");
    assert.deepEqual(
      result.components.map((x) => x.authorityClass),
      ["PROVISIONAL", "PROVISIONAL"],
    );
    assert.equal(sumFinancialMoney(result.components)?.amountAtoms, 8500n);
    console.log("D2B CASE B PASS: whole provisional 85, actual fee suppressed");
    const ar = await f2.ledger(
      f2.input(
        s.id,
        "ACTUAL",
        ba.id,
        a,
        10000n,
        "PRODUCT_REVENUE",
        "actual:revenue",
      ),
    );
    await f2.evidence(
      s.id,
      "ACTUAL",
      "COMPLETE",
      [a],
      [af.entry.id, ar.entry.id],
    );
    const c = await f2.publish(s.id);
    assert.equal(c.authorityState, "ACTUAL_COMPLETE");
    result = await f2.effective();
    if (result.status !== "READY") throw Error("C blocked");
    assert.ok(result.components.every((x) => x.authorityClass === "ACTUAL"));
    assert.equal(sumFinancialMoney(result.components)?.amountAtoms, 8550n);
    console.log("D2B CASE C PASS: whole actual 85.50");
    const unknown = await f2.ledger(
      f2.input(
        s.id,
        "ACTUAL",
        ba.id,
        a,
        700n,
        "UNKNOWN_UNCLASSIFIED",
        "actual:unknown",
      ),
    );
    await assert.rejects(
      f2.evidence(
        s.id,
        "ACTUAL",
        "COMPLETE",
        [a],
        [af.entry.id, ar.entry.id, unknown.entry.id],
      ),
    );
    await f2.evidence(
      s.id,
      "ACTUAL",
      "UNKNOWN",
      [a],
      [af.entry.id, ar.entry.id, unknown.entry.id],
    );
    const d = await f2.publish(s.id);
    assert.equal(d.authorityState, "ACTUAL_UNKNOWN");
    assert.equal(d.selectedClass, "BLOCKED");
    const blocked = await f2.effective();
    assert.equal(blocked.status, "BLOCKED");
    assert.ok(!("components" in blocked));
    if (blocked.status !== "BLOCKED") throw Error("D not blocked");
    assert.equal(
      blocked.diagnosticComponents.find((x) => x.id === unknown.entry.id)
        ?.amountAtoms,
      700n,
    );
    assert.equal(
      await f2.db.financialComponentSelection.count({
        where: { decisionId: d.id, role: "SELECTED" },
      }),
      0,
    );
    // Window filtering cannot bless an incomplete authority scope.
    assert.equal(
      (
        await f2.effective({
          effectiveWindow: {
            start: new Date("2026-01-01"),
            end: new Date("2026-02-01"),
          },
        })
      ).status,
      "BLOCKED",
    );
    console.log(
      "D2B CASE D PASS: unknown 7 preserved, no consumable components",
    );
    await assert.rejects(
      f2.db.$transaction((tx) =>
        publishFinancialAuthorityDecisionTx(tx, f2.tenant, {
          authorityScopeId: s.id,
          operationKey: "stale",
          expectedPreviousDecisionId: c.id,
          expectedInputVersion: c.inputVersion,
        }),
      ),
    );
  } finally {
    await f2.cleanup();
  }
  const f3 = await fixture();
  try {
    const sale = await f3.scope("SALE:original"),
      refund = await f3.scope("REFUND:refund-1", "REFUND_BUNDLE");
    assert.notEqual(sale.id, refund.id);
    const ss = await f3.source("finances"),
      sb = await f3.bind(sale.id, "ACTUAL", ss);
    const originalSale = await f3.ledger(
      f3.input(
        sale.id,
        "ACTUAL",
        sb.id,
        ss,
        10000n,
        "PRODUCT_REVENUE",
        "original-sale",
      ),
    );
    await f3.evidence(
      sale.id,
      "ACTUAL",
      "COMPLETE",
      [ss],
      [originalSale.entry.id],
    );
    await f3.publish(sale.id);
    const rs = await f3.source("finances"),
      rb = await f3.bind(refund.id, "ACTUAL", rs);
    const r = await f3.ledger(
      f3.input(refund.id, "ACTUAL", rb.id, rs, -2000n, "REFUND", "refund:1"),
    );
    await f3.evidence(refund.id, "ACTUAL", "COMPLETE", [rs], [r.entry.id]);
    await f3.publish(refund.id);
    assert.equal(r.entry.authorityScopeId, refund.id);
    assert.equal(
      await f3.db.financialLedgerEntry.count({
        where: { authorityScopeId: sale.id },
      }),
      1,
    );
    assert.equal(
      (
        await f3.db.financialLedgerEntry.findUniqueOrThrow({
          where: { id: originalSale.entry.id },
        })
      ).amountAtoms,
      10000n,
    );
    console.log(
      "D2B CASE E PASS: new refund event, original sale untouched; no COGS subsystem",
    );
    const periodic = await f3.scope(
      "INVOICE:storage-1",
      "PERIODIC_CHARGE_BUNDLE",
      null,
      { start: new Date("2026-01-01"), end: new Date("2026-02-01") },
    );
    const ps = await f3.source("finances"),
      pb = await f3.bind(periodic.id, "ACTUAL", ps);
    const storage = await f3.ledger(
      f3.input(
        periodic.id,
        "ACTUAL",
        pb.id,
        ps,
        -800n,
        "STORAGE_FEE",
        "charge:storage",
      ),
    );
    assert.equal(storage.entry.orderId, null);
    assert.equal(storage.entry.itemId, null);
    await f3.evidence(
      periodic.id,
      "ACTUAL",
      "COMPLETE",
      [ps],
      [storage.entry.id],
    );
    await f3.publish(periodic.id);
    const result = await f3.db.$transaction((tx) =>
      getEffectiveFinancialComponentsTx(tx, f3.tenant),
    );
    assert.equal(result.status, "READY");
    if (result.status !== "READY") throw Error("periodic fee blocked");
    assert.ok(
      result.components.some(
        (x) => x.id === storage.entry.id && x.orderId === null,
      ),
    );
    console.log(
      "D2B CASE F PASS: periodic fee without artificial order linkage",
    );
  } finally {
    await f3.cleanup();
  }
}
