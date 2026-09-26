import assert from "node:assert/strict";
import { fixture } from "./d2b.fixtures";
import { getEffectiveFinancialComponentsTx } from "../../app/core/effective-financial-components.server";
import {
  recordFinancialAuthorityBindingTx,
  recordFinancialLedgerEntryTx,
} from "../../app/core/data-core-d2b.server";
import { publishFinancialAuthorityDecisionTx } from "../../app/core/financial-authority.server";
export async function effectiveCases() {
  const f = await fixture();
  try {
    const s = await f.scope("SALE:empty"),
      p = await f.source("orders"),
      a = await f.source("finances");
    const b = await f.bind(s.id, "PROVISIONAL", p);
    const r = await f.ledger(
      f.input(s.id, "PROVISIONAL", b.id, p, 10000n, "PRODUCT_REVENUE", "p"),
    );
    await f.evidence(s.id, "PROVISIONAL", "COMPLETE", [p], [r.entry.id]);
    await f.evidence(s.id, "ACTUAL", "COMPLETE", [a], []);
    const d = await f.publish(s.id);
    assert.equal(d.authorityState, "ACTUAL_COMPLETE");
    const empty = await f.effective();
    assert.equal(empty.status, "READY");
    if (empty.status !== "READY") throw Error("empty actual blocked");
    assert.equal(empty.components.length, 0);
    assert.equal(empty.completeness, "COMPLETE_FOR_SCOPE");
    assert.equal(await f.db.financialLedgerEntry.count(), 1); // no fabricated zero entry
    const before = await f.db.financialAuthorityDecision.count();
    const scope = await f.db.financialAuthorityScope.findUniqueOrThrow({
      where: { id: s.id },
    });
    await assert.rejects(
      f.db.$transaction(async (tx) => {
        await publishFinancialAuthorityDecisionTx(tx, f.tenant, {
          authorityScopeId: s.id,
          expectedPreviousDecisionId: d.id,
          expectedInputVersion: scope.inputVersion,
          operationKey: "rollback-publish",
        });
        throw Error("rollback publication");
      }),
      /rollback publication/,
    );
    assert.equal(await f.db.financialAuthorityDecision.count(), before);
    assert.equal(
      (
        await f.db.financialAuthorityScope.findUniqueOrThrow({
          where: { id: s.id },
        })
      ).currentDecisionId,
      d.id,
    );
    const other = await f.db.account.create({ data: {} });
    await assert.rejects(
      f.db.$transaction((tx) =>
        getEffectiveFinancialComponentsTx(tx, {
          accountId: other.id,
          channelConnectionId: f.channel.id,
        }),
      ),
    );
    const m = await f.db.marketplace.create({
      data: { ...f.tenant, externalMarketplaceId: "US" },
    });
    const unknown = await f.scope("UNRESOLVED:1", "UNRESOLVED_EVENT", m.id, {
      start: new Date("2026-01-01"),
      end: new Date("2026-02-01"),
    });
    const us = await f.source("finances", m.id),
      ub = await f.bind(unknown.id, "ACTUAL", us);
    const ur = await f.ledger(
      f.input(
        unknown.id,
        "ACTUAL",
        ub.id,
        us,
        700n,
        "UNKNOWN_UNCLASSIFIED",
        "unknown",
      ),
    );
    await f.evidence(unknown.id, "ACTUAL", "UNKNOWN", [us], [ur.entry.id]);
    await f.publish(unknown.id);
    const blocked = await f.effective({
      marketplaceId: m.id,
      effectiveWindow: {
        start: new Date("2026-01-01"),
        end: new Date("2026-02-01"),
      },
    });
    assert.equal(blocked.status, "BLOCKED");
    assert.ok(!("components" in blocked));
    assert.equal((await f.effective({ marketplaceId: null })).status, "READY");
    assert.equal(
      (
        await f.effective({
          marketplaceId: m.id,
          effectiveWindow: {
            start: new Date("2026-03-01"),
            end: new Date("2026-04-01"),
          },
        })
      ).status,
      "READY",
    );
    await f.scope("UNRESOLVED:channel", "UNRESOLVED_EVENT");
    assert.equal(
      (
        await f.effective({
          marketplaceId: m.id,
          effectiveWindow: {
            start: new Date("2030-01-01"),
            end: new Date("2030-02-01"),
          },
        })
      ).status,
      "BLOCKED",
    );
    console.log(
      "D2B empty actual, tenant checks, unresolved perimeter and publication rollback PASS",
    );
  } finally {
    await f.cleanup();
  }
  const g = await fixture();
  try {
    const s = await g.scope("SALE:currency"),
      p = await g.source("orders"),
      a = await g.source("finances");
    const bp = await g.bind(s.id, "PROVISIONAL", p),
      ba = await g.bind(s.id, "ACTUAL", a);
    const pr = await g.ledger(
      g.input(s.id, "PROVISIONAL", bp.id, p, 100n, "PRODUCT_REVENUE", "p"),
    );
    const ar = await g.ledger({
      ...g.input(s.id, "ACTUAL", ba.id, a, 100n, "PRODUCT_REVENUE", "a"),
      currencyCode: "USD",
    });
    await g.evidence(s.id, "PROVISIONAL", "COMPLETE", [p], [pr.entry.id]);
    await g.evidence(s.id, "ACTUAL", "COMPLETE", [a], [ar.entry.id]);
    assert.equal((await g.publish(s.id)).selectedClass, "BLOCKED");
    assert.equal((await g.effective()).status, "BLOCKED");
    console.log("D2B different-currency authority substitution blocked PASS");
  } finally {
    await g.cleanup();
  }
  const h = await fixture();
  try {
    const s = await h.scope("SALE:incomplete"),
      p = await h.source("orders"),
      a = await h.source("finances");
    const bp = await h.bind(s.id, "PROVISIONAL", p),
      ba = await h.bind(s.id, "ACTUAL", a);
    const pi = h.input(
      s.id,
      "PROVISIONAL",
      bp.id,
      p,
      100n,
      "PRODUCT_REVENUE",
      "p",
    );
    const pr = await h.ledger(pi);
    await h.evidence(s.id, "PROVISIONAL", "INCOMPLETE", [p], [pr.entry.id]);
    assert.equal((await h.publish(s.id)).selectedClass, "BLOCKED");
    const ar = await h.ledger(
      h.input(s.id, "ACTUAL", ba.id, a, -10n, "MARKETPLACE_COMMISSION", "a"),
    );
    await h.evidence(s.id, "ACTUAL", "INCOMPLETE", [a], [ar.entry.id]);
    assert.equal((await h.publish(s.id)).selectedClass, "BLOCKED");
    // Versioned mapper proof can retain a genuinely informational unknown without zeroing it.
    const info = await h.ledger({
      ...h.input(
        s.id,
        "ACTUAL",
        ba.id,
        a,
        700n,
        "UNKNOWN_UNCLASSIFIED",
        "info",
      ),
      economicRole: "INFORMATIONAL",
      informationalRuleKey: "duplicate-description-v1",
    });
    await h.evidence(
      s.id,
      "ACTUAL",
      "COMPLETE",
      [a],
      [ar.entry.id, info.entry.id],
    );
    await h.publish(s.id);
    const ready = await h.effective();
    assert.equal(ready.status, "READY");
    if (ready.status !== "READY") throw Error("informational blocked");
    assert.equal(ready.components.length, 1);
    assert.equal(ready.components[0].id, ar.entry.id);
    assert.equal(
      (
        await h.db.financialLedgerEntry.findUniqueOrThrow({
          where: { id: info.entry.id },
        })
      ).amountAtoms,
      700n,
    );
    // Scope correction is an atomic withdrawal + versioned binding transfer, never simultaneous binding.
    const corrected = await h.scope("SALE:corrected");
    const moved = await h.db.$transaction(async (tx) => {
      const withdrawal = await recordFinancialLedgerEntryTx(tx, h.tenant, {
        ...pi,
        operationKey: "withdraw",
        expectedPreviousEntryId: pr.entry.id,
        state: "WITHDRAWN",
      });
      const binding = await recordFinancialAuthorityBindingTx(tx, h.tenant, {
        ...p,
        authorityScopeId: corrected.id,
        authorityClass: "PROVISIONAL",
        sourceAuthority: "orders",
        sourceSystem: "SHOPIFY",
        sourceEventNamespace: bp.sourceEventNamespace,
        sourceEventIdentity: bp.sourceEventIdentity,
        sourceLeafPath: "/event/id",
        correlationRuleKey: "corrected-source-id-v1",
        expectedPreviousBindingId: bp.id,
        operationKey: "rebind",
      });
      const entry = await recordFinancialLedgerEntryTx(tx, h.tenant, {
        ...pi,
        authorityScopeId: corrected.id,
        bindingId: binding.id,
        expectedPreviousEntryId: null,
        operationKey: "corrected",
      });
      return { withdrawal, entry };
    });
    assert.equal(moved.withdrawal.entry.state, "WITHDRAWN");
    assert.equal(moved.entry.entry.authorityScopeId, corrected.id);
    await assert.rejects(
      h.ledger({
        ...pi,
        operationKey: "reactivate-old-binding",
        expectedPreviousEntryId: moved.withdrawal.entry.id,
      }),
    );
    console.log(
      "D2B incomplete fallback blocked, informational proof and atomic scope correction PASS",
    );
  } finally {
    await h.cleanup();
  }
  const u = await fixture();
  try {
    const unresolved = await u.scope(
        "UNRESOLVED:correction",
        "UNRESOLVED_EVENT",
      ),
      source = await u.source("finances");
    const binding = await u.bind(
      unresolved.id,
      "ACTUAL",
      source,
      "unknown-event",
    );
    const oldInput = u.input(
      unresolved.id,
      "ACTUAL",
      binding.id,
      source,
      700n,
      "UNKNOWN_UNCLASSIFIED",
      "stable:unknown",
    );
    const old = await u.ledger(oldInput);
    await u.evidence(
      unresolved.id,
      "ACTUAL",
      "UNKNOWN",
      [source],
      [old.entry.id],
    );
    await u.publish(unresolved.id);
    assert.equal((await u.effective()).status, "BLOCKED");
    const target = await u.scope("ADJUSTMENT:resolved", "ADJUSTMENT_BUNDLE");
    const correction = await u.db.$transaction(async (tx) => {
      const withdrawal = await recordFinancialLedgerEntryTx(tx, u.tenant, {
        ...oldInput,
        state: "WITHDRAWN",
        operationKey: "withdraw-unresolved",
        expectedPreviousEntryId: old.entry.id,
      });
      const successor = await recordFinancialAuthorityBindingTx(tx, u.tenant, {
        ...source,
        authorityScopeId: target.id,
        authorityClass: "ACTUAL",
        sourceAuthority: "finances",
        sourceSystem: "SHOPIFY",
        sourceEventNamespace: binding.sourceEventNamespace,
        sourceEventIdentity: binding.sourceEventIdentity,
        sourceLeafPath: "/resolved/event/id",
        correlationRuleKey: "resolved-event-v2",
        expectedPreviousBindingId: binding.id,
        operationKey: "resolve-binding",
      });
      const entry = await recordFinancialLedgerEntryTx(tx, u.tenant, {
        ...oldInput,
        authorityScopeId: target.id,
        bindingId: successor.id,
        projectionKind: "ADJUSTMENT",
        operationKey: "resolved-entry",
        expectedPreviousEntryId: null,
      });
      return { withdrawal, entry };
    });
    assert.equal((await u.effective()).status, "BLOCKED"); // transfer alone never clears completeness.
    await u.evidence(
      unresolved.id,
      "ACTUAL",
      "COMPLETE",
      [source],
      [correction.withdrawal.entry.id],
    );
    await u.evidence(
      target.id,
      "ACTUAL",
      "COMPLETE",
      [source],
      [correction.entry.entry.id],
    );
    await u.publish(unresolved.id);
    await u.publish(target.id);
    const result = await u.effective();
    assert.equal(result.status, "READY");
    if (result.status !== "READY") throw Error("resolution blocked");
    assert.deepEqual(
      result.components.map((x) => x.id),
      [correction.entry.entry.id],
    );
    assert.equal(
      (
        await u.db.financialLedgerEntry.findUniqueOrThrow({
          where: { id: old.entry.id },
        })
      ).amountAtoms,
      700n,
    );
    console.log(
      "D2B unresolved correction requires withdrawal, binding lineage and fresh publications PASS",
    );
  } finally {
    await u.cleanup();
  }
}
