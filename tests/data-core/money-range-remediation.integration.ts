import assert from "node:assert/strict";
import {
  assessFixedMoneyRepresentability,
  createUnrepresentableMoneyBlocker,
  parseSourceExactMoney,
  type UnrepresentableMoneySource,
} from "../../app/core/source-exact-money";
import { MAX_ATOMS, MIN_ATOMS } from "../../app/core/fixed-money";
import { fixture } from "./d2d.fixtures";

function assess(text: string) {
  const source = parseSourceExactMoney(text, "EUR");
  return { source, result: assessFixedMoneyRepresentability(source) };
}

function source(text: string): UnrepresentableMoneySource {
  return {
    sourceSystem: "AMAZON",
    sourceEventNamespace: "finances-v2024-06-19",
    sourceEventIdentity: "event-1",
    sourcePayloadChecksum: "raw-sha256-1",
    sourceLeafPath: "/payload/ItemCharge/Amount",
    economicEventKey: "amazon-finance:event-1",
    money: parseSourceExactMoney(text, "EUR"),
  };
}

async function main() {
  for (const boundary of [MAX_ATOMS, MIN_ATOMS]) {
    const checked = assess(boundary.toString());
    assert.equal(checked.result.status, "REPRESENTABLE");
    if (checked.result.status === "REPRESENTABLE")
      assert.equal(checked.result.fixedMoney.amountAtoms, boundary);
  }
  for (const outside of [MAX_ATOMS + 1n, MIN_ATOMS - 1n]) {
    const checked = assess(outside.toString());
    assert.equal(checked.result.status, "UNREPRESENTABLE");
    if (checked.result.status === "UNREPRESENTABLE")
      assert.equal(checked.result.reasonCode, "MONEY_ATOMS_OUT_OF_RANGE");
  }

  const scale12 = assess("0.000000000001");
  assert.equal(scale12.result.status, "REPRESENTABLE");
  const reducible13 = assess("0.0000000000010");
  assert.equal(reducible13.source.amountAtoms, 10n);
  assert.equal(reducible13.source.amountScale, 13);
  assert.equal(reducible13.result.status, "REPRESENTABLE");
  if (reducible13.result.status === "REPRESENTABLE") {
    assert.equal(reducible13.result.fixedMoney.amountAtoms, 1n);
    assert.equal(reducible13.result.fixedMoney.amountScale, 12);
  }
  const irreducible13 = assess("0.0000000000001");
  assert.equal(irreducible13.result.status, "UNREPRESENTABLE");
  if (irreducible13.result.status === "UNREPRESENTABLE")
    assert.equal(irreducible13.result.reasonCode, "MONEY_SCALE_OUT_OF_RANGE");

  const huge = assess("12345678901234567890.123456789");
  assert.equal(huge.source.sourceAmountText, "12345678901234567890.123456789");
  assert.equal(huge.source.amountAtoms, 12345678901234567890123456789n);
  assert.equal(huge.source.amountScale, 9);
  assert.equal(huge.result.status, "UNREPRESENTABLE");
  if (huge.result.status === "UNREPRESENTABLE")
    assert.equal(huge.result.reasonCode, "MONEY_ATOMS_OUT_OF_RANGE");
  const negativeHuge = assess("-12345678901234567890.123456789");
  assert.equal(negativeHuge.source.amountAtoms, -12345678901234567890123456789n);
  assert.equal(negativeHuge.result.status, "UNREPRESENTABLE");

  const trailing = assess("12.3400");
  assert.equal(trailing.source.sourceAmountText, "12.3400");
  assert.equal(trailing.source.amountAtoms, 123400n);
  assert.equal(trailing.source.amountScale, 4);
  assert.equal(trailing.result.status, "REPRESENTABLE");
  if (trailing.result.status === "REPRESENTABLE") {
    assert.equal(trailing.result.fixedMoney.amountAtoms, 1234n);
    assert.equal(trailing.result.fixedMoney.amountScale, 2);
  }
  const noRounding = assess("1.2345678901234");
  assert.equal(noRounding.result.status, "UNREPRESENTABLE");
  const extremeZero = assess("0." + "0".repeat(1000));
  assert.equal(extremeZero.source.amountScale, 1000);
  assert.equal(extremeZero.result.status, "REPRESENTABLE");
  if (extremeZero.result.status === "REPRESENTABLE") {
    assert.equal(extremeZero.result.fixedMoney.amountAtoms, 0n);
    assert.equal(extremeZero.result.fixedMoney.amountScale, 0);
  }

  assert.equal(huge.source.currencyCode, "EUR");
  assert.throws(() => parseSourceExactMoney("1e3", "EUR"), /decimal/);
  assert.throws(() => parseSourceExactMoney("1.00", "eur"), /currency/);

  const blocker1 = createUnrepresentableMoneyBlocker(source("12345678901234567890.123456789"));
  const blocker2 = createUnrepresentableMoneyBlocker(source("12345678901234567890.123456789"));
  const changed = createUnrepresentableMoneyBlocker(source("12345678901234567890.123456788"));
  assert.equal(blocker1.reasonCode, "MONEY_ATOMS_OUT_OF_RANGE");
  assert.deepEqual(blocker2, blocker1);
  assert.equal(changed.blockerIdentity, blocker1.blockerIdentity);
  assert.notEqual(changed.evidenceFingerprint, blocker1.evidenceFingerprint);
  assert.equal(blocker1.source.money.sourceAmountText, "12345678901234567890.123456789");

  const normal = assess("19.99");
  assert.equal(normal.result.status, "REPRESENTABLE");
  if (normal.result.status === "REPRESENTABLE")
    assert.deepEqual(normal.result.fixedMoney, {
      amountAtoms: 1999n,
      amountScale: 2,
      currencyCode: "EUR",
    });
  assert.throws(
    () => createUnrepresentableMoneyBlocker(source("19.99")),
    /does not create/,
  );

  const f = await fixture();
  try {
    const before = {
      raw: await f.db.rawSourceRecord.count(),
      normalized: await f.db.normalizedOrder.count(),
      ledger: await f.db.financialLedgerEntry.count(),
      cost: await f.db.costRecord.count(),
    };
    const unresolved1 = await f.scope(
      blocker1.economicEventKey + ":" + blocker1.blockerIdentity,
      "UNRESOLVED_EVENT",
      null,
      {
        start: new Date("2026-01-01T00:00:00Z"),
        end: new Date("2026-02-01T00:00:00Z"),
      },
    );
    const unresolved2 = await f.scope(
      blocker1.economicEventKey + ":" + blocker1.blockerIdentity,
      "UNRESOLVED_EVENT",
      null,
      {
        start: new Date("2026-01-01T00:00:00Z"),
        end: new Date("2026-02-01T00:00:00Z"),
      },
    );
    assert.equal(unresolved2.id, unresolved1.id);
    assert.equal(await f.db.financialLedgerEntry.count(), before.ledger);

    const d2b = await f.effective({
      effectiveWindow: {
        start: new Date("2026-01-01T00:00:00Z"),
        end: new Date("2026-02-01T00:00:00Z"),
      },
    });
    assert.equal(d2b.status, "BLOCKED");
    assert(d2b.reasonCodes.includes("UNRESOLVED_ECONOMIC_EVENT"));
    assert(!("components" in d2b), "blocked D2B result must expose no consumable money");

    const d2d1 = await f.read();
    const d2d2 = await f.read();
    assert.equal(d2d1.status, "BLOCKED");
    assert.equal(d2d2.status, "BLOCKED");
    assert(d2d1.reasonCodes.includes("UNRESOLVED_ECONOMIC_EVENT"));
    assert.equal(d2d2.fingerprint, d2d1.fingerprint);
    assert(!("commerce" in d2d1), "blocked D2D result must expose no consumable dataset");

    assert.deepEqual(
      {
        raw: await f.db.rawSourceRecord.count(),
        normalized: await f.db.normalizedOrder.count(),
        ledger: await f.db.financialLedgerEntry.count(),
        cost: await f.db.costRecord.count(),
      },
      before,
      "money blocker creation must not fabricate D1/D2A/D2B/D2C economic rows",
    );
  } finally {
    await f.cleanup();
  }

  console.log("Amazon E2-C money range remediation integration tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
