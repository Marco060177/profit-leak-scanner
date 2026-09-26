import assert from "node:assert/strict";
import type { SQLInputValue } from "node:sqlite";
import { fixture } from "./d2b.fixtures";

export async function remediationCases() {
  const f = await fixture();
  try {
    f.sqlite.exec("PRAGMA foreign_keys=ON; PRAGMA recursive_triggers=OFF");
    assert.equal(
      f.sqlite.prepare("PRAGMA foreign_keys").get()?.foreign_keys,
      1,
    );
    assert.equal(
      f.sqlite.prepare("PRAGMA recursive_triggers").get()?.recursive_triggers,
      0,
    );
    const s = await f.scope("H1:victim"),
      p = await f.source("orders"),
      a = await f.source("finances");
    const bp = await f.bind(s.id, "PROVISIONAL", p),
      ba = await f.bind(s.id, "ACTUAL", a);
    // Populate every nullable UNIQUE predecessor key as well as first revisions.
    const spare = await f.bind(s.id, "PROVISIONAL", p);
    await f.db.financialAuthorityBinding.create({
      data: {
        ...spare,
        id: f.next(),
        revision: 2,
        previousBindingId: spare.id,
        operationKey: f.next(),
      },
    });
    const pi = f.input(
      s.id,
      "PROVISIONAL",
      bp.id,
      p,
      10000n,
      "PRODUCT_REVENUE",
    );
    const first = (await f.ledger(pi)).entry;
    const pe = (
      await f.ledger({
        ...pi,
        operationKey: f.next(),
        expectedPreviousEntryId: first.id,
      })
    ).entry;
    const ae = (
      await f.ledger(
        f.input(s.id, "ACTUAL", ba.id, a, -1450n, "MARKETPLACE_COMMISSION"),
      )
    ).entry;
    await f.evidence(s.id, "PROVISIONAL", "COMPLETE", [p], [pe.id]);
    const ep = await f.evidence(s.id, "PROVISIONAL", "COMPLETE", [p], [pe.id]);
    const ea = await f.evidence(s.id, "ACTUAL", "INCOMPLETE", [a], [ae.id]);
    await f.publish(s.id);
    const decision = await f.publish(s.id);
    const query = (sql: string, ...args: SQLInputValue[]) => {
      const stmt = f.sqlite.prepare(sql);
      stmt.setReadBigInts(true);
      return stmt.all(...args);
    };
    const tables = query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'Financial%' ORDER BY name",
    ).map((x) => String(x.name));
    assert.equal(tables.length, 10);
    const snapshot = () =>
      tables.map((table) => query(`SELECT * FROM "${table}" ORDER BY id`));
    const effective = await f.effective();
    const original = snapshot();
    const unchanged = async () => {
      assert.deepEqual(snapshot(), original);
      for (const id of [ep.id, ea.id])
        assert.equal(
          query("SELECT valid FROM FinancialEvidenceValidity WHERE id=?", id)[0]
            .valid,
          1n,
        );
      assert.equal(
        query(
          "SELECT valid FROM FinancialDecisionValidity WHERE id=?",
          decision.id,
        )[0].valid,
        1n,
      );
      assert.deepEqual(await f.effective(), effective);
    };
    const replace = (table: string, row: Record<string, SQLInputValue>) => {
      const keys = Object.keys(row);
      f.sqlite
        .prepare(
          `INSERT OR REPLACE INTO "${table}" (${keys.map((k) => `"${k}"`).join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
        )
        .run(...Object.values(row));
    };
    // All ten tables, primary IDs and every SQLite unique index (including alternate keys).
    // Require the new BEFORE INSERT collision guard, not a coincidental FK failure.
    let collisions = 0;
    for (const table of tables) {
      const row = query(`SELECT * FROM "${table}" LIMIT 1`)[0];
      assert.ok(row, table);
      assert.throws(() => replace(table, row), /D2B UNIQUE collision/);
      collisions++;
      await unchanged();
      const uniqueIndexes = query(`PRAGMA index_list("${table}")`).filter(
        (x) => x.unique === 1n,
      );
      const uniqueColumns = new Set(
        uniqueIndexes.flatMap((index) =>
          query(`PRAGMA index_info("${String(index.name)}")`).map((x) =>
            String(x.name),
          ),
        ),
      );
      // SQLite's implicit rowid is also a replacement identity, absent from index_list.
      const rowidCandidate: Record<string, SQLInputValue> = {
        ...row,
        rowid: query(`SELECT rowid FROM "${table}" WHERE id=?`, row.id)[0]
          .rowid,
      };
      for (const col of uniqueColumns)
        rowidCandidate[col] =
          typeof row[col] === "bigint" ? row[col] + 1000n : f.next();
      assert.throws(
        () => replace(table, rowidCandidate),
        /D2B UNIQUE collision/,
      );
      collisions++;
      await unchanged();
      for (const index of uniqueIndexes) {
        const cols = query(`PRAGMA index_info("${String(index.name)}")`).map(
          (x) => String(x.name),
        );
        const indexedRow = query(
          `SELECT * FROM "${table}" WHERE ${cols.map((col) => `"${col}" IS NOT NULL`).join(" AND ")} LIMIT 1`,
        )[0];
        assert.ok(
          indexedRow,
          `Unexercised unique index: ${String(index.name)}`,
        );
        const candidate: Record<string, SQLInputValue> = {
          ...indexedRow,
          id: f.next(),
        };
        // Avoid accidental collisions on other identities masking a missing guard.
        // A composite index containing the primary ID is necessarily redundant.
        for (const col of uniqueColumns) {
          if (!cols.includes(col))
            candidate[col] =
              typeof indexedRow[col] === "bigint"
                ? indexedRow[col] + 1000n
                : f.next();
        }
        for (const col of cols) candidate[col] = indexedRow[col];
        assert.throws(() => replace(table, candidate), /D2B UNIQUE collision/);
        collisions++;
        await unchanged();
      }
    }
    // Reproduce the original re-home attacks with valid DRAFT destinations.
    const target = await f.scope("H1:target"),
      tb = await f.bind(target.id, "ACTUAL", a);
    const te = (
      await f.ledger(f.input(target.id, "ACTUAL", tb.id, a, 1n, "ADJUSTMENT"))
    ).entry;
    const draft = await f.db.financialAuthorityEvidence.create({
      data: {
        ...f.tenant,
        authorityScopeId: target.id,
        authorityClass: "ACTUAL",
        revision: 1,
        operationKey: f.next(),
        inputChecksum: "draft",
        mappingVersionId: f.mapping.id,
        coverageState: "INCOMPLETE",
        boundariesJson: "{}",
        reasonCode: "test",
        expectedSourceCount: 1,
        expectedMemberCount: 1,
      },
    });
    const draftDecision = {
      ...query(
        "SELECT * FROM FinancialAuthorityDecision WHERE id=?",
        decision.id,
      )[0],
      id: f.next(),
      revision: BigInt(decision.revision + 1),
      previousDecisionId: decision.id,
      operationKey: f.next(),
      status: "DRAFT",
    };
    const insert = (table: string, row: Record<string, SQLInputValue>) => {
      const keys = Object.keys(row);
      f.sqlite
        .prepare(
          `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
        )
        .run(...Object.values(row));
    };
    insert("FinancialAuthorityDecision", draftDecision);
    const source = query(
      "SELECT * FROM FinancialAuthorityEvidenceSource WHERE evidenceId=?",
      ea.id,
    )[0];
    const member = query(
      "SELECT * FROM FinancialAuthorityEvidenceMember WHERE evidenceId=?",
      ea.id,
    )[0];
    const selection = query(
      "SELECT * FROM FinancialComponentSelection WHERE decisionId=? LIMIT 1",
      decision.id,
    )[0];
    const baseline = snapshot(),
      beforeAPI = await f.effective();
    for (const [table, row] of [
      ["FinancialAuthorityEvidenceSource", { ...source, evidenceId: draft.id }],
      [
        "FinancialAuthorityEvidenceMember",
        {
          ...member,
          evidenceId: draft.id,
          componentId: te.componentId,
          entryId: te.id,
        },
      ],
      [
        "FinancialComponentSelection",
        { ...selection, decisionId: draftDecision.id },
      ],
    ] as const) {
      assert.throws(() => replace(table, row), /D2B UNIQUE collision/);
      assert.deepEqual(snapshot(), baseline);
      assert.equal(
        query(
          "SELECT valid FROM FinancialEvidenceValidity WHERE id=?",
          ea.id,
        )[0].valid,
        1n,
      );
      assert.equal(
        query(
          "SELECT valid FROM FinancialDecisionValidity WHERE id=?",
          decision.id,
        )[0].valid,
        1n,
      );
      assert.deepEqual(await f.effective(), beforeAPI);
    }
    // Remove disposable staging so the normal API is READY before fault injection.
    f.sqlite
      .prepare("DELETE FROM FinancialAuthorityDecision WHERE id=?")
      .run(draftDecision.id);
    // The deliberately abandoned draft is removable; its deletion invalidates only target.
    f.sqlite
      .prepare("DELETE FROM FinancialAuthorityEvidence WHERE id=?")
      .run(draft.id);
    await f.evidence(target.id, "ACTUAL", "COMPLETE", [a], [te.id]);
    await f.publish(target.id);
    assert.equal((await f.effective()).status, "READY");
    insert("FinancialAuthorityDecision", draftDecision);
    for (const row of query(
      "SELECT * FROM FinancialComponentSelection WHERE decisionId=?",
      decision.id,
    ))
      insert("FinancialComponentSelection", {
        ...row,
        id: f.next(),
        decisionId: draftDecision.id,
      });
    // Test-only damage on the disposable database. Commit so the Prisma connection
    // sees the fault; restore rows and trigger definitions after each independent case.
    // Epoch and head inventory remain unchanged: only dynamic manifest validity can catch it.
    for (const evidenceId of [ep.id, ea.id]) {
      const savedMembers = query(
        "SELECT * FROM FinancialAuthorityEvidenceMember WHERE evidenceId=?",
        evidenceId,
      );
      const triggerNames = [
        "FinancialAuthorityEvidenceMember_no_delete",
        "FinancialAuthorityEvidenceMember_insert",
        "FinancialAuthorityEvidenceMember_invalidate_INSERT",
      ];
      const triggers = triggerNames.map((name) =>
        String(
          query(
            "SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?",
            name,
          )[0].sql,
        ),
      );
      try {
        f.sqlite.exec(
          'DROP TRIGGER "FinancialAuthorityEvidenceMember_no_delete"',
        );
        f.sqlite
          .prepare(
            "DELETE FROM FinancialAuthorityEvidenceMember WHERE evidenceId=?",
          )
          .run(evidenceId);
        assert.equal(
          query(
            "SELECT valid FROM FinancialEvidenceValidity WHERE id=?",
            evidenceId,
          )[0].valid,
          0n,
        );
        assert.equal(
          query(
            "SELECT valid FROM FinancialDecisionValidity WHERE id=?",
            decision.id,
          )[0].valid,
          0n,
        );
        const blocked = await f.effective();
        assert.equal(blocked.status, "BLOCKED");
        assert.ok(!("components" in blocked));
        assert.equal(
          query(
            "SELECT * FROM EffectiveFinancialComponent WHERE authorityScopeId=?",
            s.id,
          ).length,
          0,
        );
        assert.throws(
          () =>
            f.sqlite
              .prepare(
                "UPDATE FinancialAuthorityDecision SET status='PUBLISHED' WHERE id=?",
              )
              .run(draftDecision.id),
          /D2B stale decision or incomplete selection/,
        );
      } finally {
        f.sqlite.exec(
          'DROP TRIGGER "FinancialAuthorityEvidenceMember_insert"; DROP TRIGGER "FinancialAuthorityEvidenceMember_invalidate_INSERT"',
        );
        for (const row of savedMembers)
          insert("FinancialAuthorityEvidenceMember", row);
        for (const sql of triggers) f.sqlite.exec(sql);
      }
      assert.equal(
        query(
          "SELECT valid FROM FinancialDecisionValidity WHERE id=?",
          decision.id,
        )[0].valid,
        1n,
      );
      assert.equal((await f.effective()).status, "READY");
    }
    console.log(
      `D2B H1 PASS: ${collisions} identity/index collisions, three DRAFT re-home exploits, both invalid manifests fail closed`,
    );
  } finally {
    await f.cleanup();
  }

  const g = await fixture();
  try {
    const a = await g.db.marketplace.create({
      data: { ...g.tenant, externalMarketplaceId: "A" },
    });
    const b = await g.db.marketplace.create({
      data: { ...g.tenant, externalMarketplaceId: "B" },
    });
    const january = {
      start: new Date("2026-01-01"),
      end: new Date("2026-02-01"),
    };
    const february = {
      start: new Date("2026-02-01"),
      end: new Date("2026-03-01"),
    };
    const order = await g.db.normalizedOrder.create({
      data: {
        ...g.tenant,
        marketplaceId: a.id,
        marketplaceScopeKey: a.id,
        sourceSystem: "SHOPIFY",
        sourceOrderKey: "H2:order",
      },
    });
    const sale = await g.scope("H2:sale", "SALE_BUNDLE", a.id),
      src = await g.source("finances", a.id);
    const binding = await g.bind(sale.id, "ACTUAL", src);
    const revenue = (
      await g.ledger({
        ...g.input(
          sale.id,
          "ACTUAL",
          binding.id,
          src,
          10000n,
          "PRODUCT_REVENUE",
        ),
        orderId: order.id,
      })
    ).entry;
    await g.evidence(sale.id, "ACTUAL", "COMPLETE", [src], [revenue.id]);
    await g.publish(sale.id);
    // Ordinary @none scopes must stay isolated.
    await g.scope("H2:ordinary-none");
    assert.equal(
      (await g.effective({ marketplaceId: a.id, effectiveWindow: january }))
        .status,
      "READY",
    );
    const unknown = async (
      key: string,
      market: string | null,
      period?: typeof january,
    ) => {
      const scope = await g.scope(key, "UNRESOLVED_EVENT", market, period),
        source = await g.source("finances", market);
      const bind = await g.bind(scope.id, "ACTUAL", source);
      const entry = (
        await g.ledger(
          g.input(
            scope.id,
            "ACTUAL",
            bind.id,
            source,
            700n,
            "UNKNOWN_UNCLASSIFIED",
          ),
        )
      ).entry;
      await g.evidence(scope.id, "ACTUAL", "UNKNOWN", [source], [entry.id]);
      await g.publish(scope.id);
      return entry;
    };
    const u = await unknown("H2:unknown-market", null, january);
    for (const filter of [
      { marketplaceId: a.id, effectiveWindow: january },
      { marketplaceId: b.id, effectiveWindow: january },
      { effectiveWindow: january },
      { marketplaceId: a.id, effectiveWindow: january, orderId: order.id },
    ]) {
      const result = await g.effective(filter);
      assert.equal(result.status, "BLOCKED");
      if (result.status !== "BLOCKED") throw Error("H2 escaped");
      assert.equal(
        result.diagnosticComponents.find((x) => x.id === u.id)?.amountAtoms,
        700n,
      );
      assert.ok(!("components" in result));
    }
    assert.equal(
      (await g.effective({ marketplaceId: a.id, effectiveWindow: february }))
        .status,
      "READY",
    );
    // Known-market blocker in February isolates it from the January unknown-market blocker.
    await unknown("H2:known-market", a.id, february);
    assert.equal(
      (await g.effective({ marketplaceId: a.id, effectiveWindow: february }))
        .status,
      "BLOCKED",
    );
    assert.equal(
      (await g.effective({ marketplaceId: b.id, effectiveWindow: february }))
        .status,
      "READY",
    );
    await unknown("H2:unbounded", null);
    assert.equal(
      (await g.effective({ marketplaceId: a.id, effectiveWindow: january }))
        .status,
      "BLOCKED",
    );
    assert.equal(
      (await g.effective({ marketplaceId: b.id, effectiveWindow: february }))
        .status,
      "BLOCKED",
    );
    assert.equal(
      (
        await g.db.financialLedgerEntry.findUniqueOrThrow({
          where: { id: u.id },
        })
      ).amountAtoms,
      700n,
    );
    console.log(
      "D2B H2 PASS: all ten marketplace/period/order/diagnostic cases; ordinary @none remains isolated",
    );
  } finally {
    await g.cleanup();
  }
}
