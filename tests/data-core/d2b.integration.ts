import assert from "node:assert/strict";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { fixture } from "./d2b.fixtures";
import { authorityCases } from "./d2b-authority.integration";
import { effectiveCases } from "./d2b-effective.integration";
import { remediationCases } from "./d2b-remediation.integration";
import { MIN_ATOMS, MAX_ATOMS } from "../../app/core/fixed-money";
import {
  rescaleFinancialMoney,
  sumFinancialMoney,
} from "../../app/core/data-core-d2b-contracts";
import {
  recordFinancialAuthorityBindingTx,
  recordFinancialLedgerEntryTx,
} from "../../app/core/data-core-d2b.server";
import {
  recordFinancialAuthorityEvidenceTx,
  publishFinancialAuthorityDecisionTx,
} from "../../app/core/financial-authority.server";

const f = await fixture();
try {
  const s = await f.scope("SALE:adversarial"),
    p = await f.source("orders"),
    a = await f.source("finances");
  const b = await f.bind(s.id, "PROVISIONAL", p, "sale-adversarial");
  await f.bind(s.id, "ACTUAL", a);
  const input = f.input(
    s.id,
    "PROVISIONAL",
    b.id,
    p,
    10000n,
    "PRODUCT_REVENUE",
    "stable:revenue",
  );
  const r1 = await f.ledger(input);
  assert.equal((await f.ledger(input)).entry.id, r1.entry.id);
  await assert.rejects(f.ledger({ ...input, amountAtoms: 10001n }));
  const changed = await f.source("orders");
  const r2 = await f.ledger({
    ...input,
    ...changed,
    operationKey: "snapshot-2",
    expectedPreviousEntryId: r1.entry.id,
    amountAtoms: 10100n,
  });
  assert.equal(r2.entry.revision, 2);
  assert.equal(r2.entry.previousEntryId, r1.entry.id);
  const mapping2 = await f.db.mappingVersion.create({
    data: {
      platform: "SHOPIFY",
      sourceContract: "d2b-fixture",
      sourceVersion: "1",
      mapperSemanticVersion: "2",
      formulaCompatibilityVersion: "d2b-v1",
      checksum: "remap",
      activatedAt: new Date(),
    },
  });
  const remapSource = await f.source("orders", null, {
    mappingId: mapping2.id,
  });
  const r3 = await f.ledger({
    ...input,
    ...remapSource,
    operationKey: "remap-3",
    expectedPreviousEntryId: r2.entry.id,
    amountAtoms: 10200n,
  });
  assert.equal(r3.entry.componentId, r1.entry.componentId);
  assert.equal(r3.entry.mappingVersionId, mapping2.id);
  await assert.rejects(
    f.ledger({
      ...input,
      operationKey: "stale",
      expectedPreviousEntryId: r1.entry.id,
    }),
  );
  assert.equal(
    (
      await f.db.financialLedgerEntry.findUniqueOrThrow({
        where: { id: r1.entry.id },
      })
    ).amountAtoms,
    10000n,
  );
  assert.throws(
    () =>
      f.sqlite
        .prepare("UPDATE FinancialLedgerEntry SET amountAtoms=1 WHERE id=?")
        .run(r1.entry.id),
    /D2B immutable/,
  );
  assert.throws(
    () =>
      f.sqlite
        .prepare("DELETE FROM FinancialLedgerEntry WHERE id=?")
        .run(r1.entry.id),
    /D2B immutable/,
  );
  assert.throws(
    () =>
      f.sqlite
        .prepare(
          "UPDATE FinancialComponentHead SET currentEntryId=?,revision=1 WHERE id=?",
        )
        .run(r1.entry.id, r1.entry.componentId),
    /D2B stale/,
  );
  let serial = 10000;
  const clone = (
    table: string,
    id: string,
    overrides: Record<string, SQLInputValue | undefined> = {},
  ) => {
    const statement = f.sqlite.prepare(
      'SELECT * FROM "' + table + '" WHERE id=?',
    );
    statement.setReadBigInts(true);
    const old = statement.get(id)!;
    const values = { ...old, id: "sql-" + ++serial, ...overrides };
    const keys = Object.keys(values);
    f.sqlite
      .prepare(
        'INSERT INTO "' +
          table +
          '" (' +
          keys.map((k) => '"' + k + '"').join(",") +
          ") VALUES (" +
          keys.map(() => "?").join(",") +
          ")",
      )
      .run(...Object.values(values).map((value) => value ?? null));
    return values.id as string;
  };
  const rawNext = (overrides: Record<string, SQLInputValue | undefined> = {}) =>
    clone("FinancialLedgerEntry", r3.entry.id, {
      operationKey: "sql-op-" + ++serial,
      revision: 4,
      previousEntryId: r3.entry.id,
      ...overrides,
    });
  const otherAccount = await f.db.account.create({ data: {} });
  const otherChannel = await f.db.channelConnection.create({
    data: {
      accountId: otherAccount.id,
      channel: "SHOPIFY",
      externalAccountId: "other",
    },
  });
  const sameAccountChannel = await f.db.channelConnection.create({
    data: {
      accountId: f.account.id,
      channel: "SHOPIFY",
      externalAccountId: "other-same-account",
    },
  });
  const market = await f.db.marketplace.create({
    data: { ...f.tenant, externalMarketplaceId: "US" },
  });
  for (const override of [
    { accountId: otherAccount.id },
    { channelConnectionId: otherChannel.id },
    { channelConnectionId: sameAccountChannel.id },
    { marketplaceScopeKey: market.id },
    { normalizationRunId: a.normalizationRunId },
    { rawSourceRecordId: a.rawSourceRecordId },
    { syncSliceEvidenceId: a.syncSliceEvidenceId },
    { mappingVersionId: f.mapping.id },
  ]) {
    assert.throws(() => rawNext(override), /D2B|FOREIGN KEY/);
  }
  for (const status of ["PENDING", "FAILED"]) {
    const invalid = await f.source("orders", null, { status });
    assert.throws(() => rawNext(invalid), /D2B ledger provenance/);
    await assert.rejects(
      f.ledger({
        ...input,
        ...invalid,
        operationKey: f.next(),
        expectedPreviousEntryId: r3.entry.id,
      }),
    );
  }
  const dormant = await f.db.mappingVersion.create({
    data: {
      platform: "SHOPIFY",
      sourceContract: "unactivated",
      sourceVersion: "1",
      mapperSemanticVersion: "1",
      formulaCompatibilityVersion: "v1",
      checksum: "dormant",
    },
  });
  const unactivated = await f.source("orders", null, { mappingId: dormant.id });
  assert.throws(() => rawNext(unactivated), /D2B ledger provenance/);
  const wrongMarketSource = await f.source("orders", market.id);
  assert.throws(() => rawNext(wrongMarketSource), /D2B ledger provenance/);
  for (const values of [
    { amountAtoms: 1.5 },
    { amountAtoms: 1e30 },
    { amountScale: -1 },
    { amountScale: 13 },
    { amountScale: 1.5 },
    { currencyCode: "ZZZ" },
    { itemId: "missing", orderId: null },
  ])
    assert.throws(() => rawNext(values), /CHECK|FOREIGN KEY|D2B/);
  await assert.rejects(
    f.ledger({
      ...input,
      operationKey: f.next(),
      amountAtoms: MAX_ATOMS + 1n,
      expectedPreviousEntryId: r3.entry.id,
    }),
  );
  assert.throws(
    () =>
      rescaleFinancialMoney(
        { amountAtoms: 125n, amountScale: 2, currencyCode: "EUR" },
        1,
      ),
    /rounding/,
  );
  assert.deepEqual(
    rescaleFinancialMoney(
      { amountAtoms: 120n, amountScale: 2, currencyCode: "EUR" },
      1,
    ),
    { amountAtoms: 12n, amountScale: 1, currencyCode: "EUR" },
  );
  assert.throws(
    () =>
      rescaleFinancialMoney(
        { amountAtoms: MAX_ATOMS, amountScale: 0, currencyCode: "EUR" },
        1,
      ),
    /overflow/,
  );
  assert.throws(
    () =>
      sumFinancialMoney([
        { amountAtoms: 1n, amountScale: 0, currencyCode: "EUR" },
        { amountAtoms: 1n, amountScale: 0, currencyCode: "USD" },
      ]),
    /currency mismatch/,
  );
  assert.throws(
    () =>
      f.sqlite.exec(
        "INSERT INTO FinancialCurrencyDefinition(id,code,sourceVersion) VALUES ('fake','ZZZ','fake')",
      ),
    /unsupported currency/,
  );
  for (const amount of [MIN_ATOMS, MAX_ATOMS]) {
    const entry = await f.ledger(
      f.input(s.id, "PROVISIONAL", b.id, p, amount, "ADJUSTMENT", f.next()),
    );
    assert.equal(entry.entry.amountAtoms, amount);
  }

  const otherOrder = await f.db.normalizedOrder.create({
    data: {
      ...f.tenant,
      marketplaceId: market.id,
      marketplaceScopeKey: market.id,
      sourceSystem: "SHOPIFY",
      sourceOrderKey: "other",
    },
  });
  const order = await f.db.normalizedOrder.create({
    data: {
      ...f.tenant,
      marketplaceScopeKey: "@none",
      sourceSystem: "SHOPIFY",
      sourceOrderKey: "own",
    },
  });
  const item = await f.db.normalizedOrderItem.create({
    data: { ...f.tenant, orderId: otherOrder.id, sourceItemKey: "id:other" },
  });
  assert.throws(() => rawNext({ orderId: otherOrder.id }), /D2B commerce/);
  assert.throws(
    () => rawNext({ orderId: order.id, itemId: item.id }),
    /D2B commerce/,
  );
  assert.throws(() => rawNext({ orderId: null, itemId: item.id }), /D2B|CHECK/);
  const sqlAccepted = rawNext();
  assert.equal(
    (
      await f.db.financialComponentHead.findUniqueOrThrow({
        where: { id: r3.entry.componentId },
      })
    ).currentEntryId,
    sqlAccepted,
  );
  // The stale insert now fails before its duplicate revision can invoke REPLACE.
  assert.throws(() => rawNext(), /D2B UNIQUE collision/);
  const citedRun = (
    await f.db.rawSourceRecord.findUniqueOrThrow({
      where: { id: p.rawSourceRecordId },
    })
  ).ingestionRunId!;
  assert.throws(
    () =>
      f.sqlite
        .prepare("UPDATE SyncRun SET stream='other' WHERE id=?")
        .run(citedRun),
    /D2B cited run identity/,
  );
  f.sqlite
    .prepare("UPDATE SyncRun SET status='RUNNING' WHERE id=?")
    .run(citedRun);
  assert.throws(
    () =>
      f.sqlite
        .prepare(
          "UPDATE ChannelConnection SET externalAccountId='changed' WHERE id=?",
        )
        .run(f.channel.id),
    /D2B cited channel identity/,
  );
  await f.scope("SALE:market-identity", "SALE_BUNDLE", market.id);
  assert.throws(
    () =>
      f.sqlite
        .prepare(
          "UPDATE Marketplace SET externalMarketplaceId='changed' WHERE id=?",
        )
        .run(market.id),
    /D2B cited marketplace identity/,
  );

  // Contradictory source binding is impossible until the old representation is withdrawn.
  const correctionScope = await f.scope("SALE:correction");
  await assert.rejects(
    f.db.$transaction((tx) =>
      recordFinancialAuthorityBindingTx(tx, f.tenant, {
        ...p,
        authorityScopeId: correctionScope.id,
        authorityClass: "PROVISIONAL",
        sourceAuthority: "orders",
        sourceSystem: "SHOPIFY",
        sourceEventNamespace: b.sourceEventNamespace,
        sourceEventIdentity: b.sourceEventIdentity,
        sourceLeafPath: "/id",
        correlationRuleKey: "correction",
        expectedPreviousBindingId: b.id,
        operationKey: "contradictory",
      }),
    ),
  );

  // Use a separate scope for publication attacks so its entire inventory is small.
  const pub = await f.scope("SALE:publication"),
    pp = await f.source("orders"),
    ap = await f.source("finances");
  const pb = await f.bind(pub.id, "PROVISIONAL", pp),
    ab = await f.bind(pub.id, "ACTUAL", ap);
  const pi = f.input(
    pub.id,
    "PROVISIONAL",
    pb.id,
    pp,
    10000n,
    "PRODUCT_REVENUE",
    "p",
  );
  const ai = f.input(
    pub.id,
    "ACTUAL",
    ab.id,
    ap,
    -1450n,
    "MARKETPLACE_COMMISSION",
    "a",
  );
  const pr = await f.ledger(pi),
    ar = await f.ledger(ai);
  const pe = await f.evidence(
    pub.id,
    "PROVISIONAL",
    "COMPLETE",
    [pp],
    [pr.entry.id],
  );
  const ae = await f.evidence(
    pub.id,
    "ACTUAL",
    "INCOMPLETE",
    [ap],
    [ar.entry.id],
  );
  const decision = await f.publish(pub.id);
  const replayDecisionInput = {
    authorityScopeId: pub.id,
    operationKey: decision.operationKey,
    expectedPreviousDecisionId: decision.previousDecisionId,
    expectedInputVersion: decision.inputVersion,
  };
  assert.equal(
    (
      await f.db.$transaction((tx) =>
        publishFinancialAuthorityDecisionTx(tx, f.tenant, replayDecisionInput),
      )
    ).id,
    decision.id,
  );
  await assert.rejects(
    f.db.$transaction((tx) =>
      publishFinancialAuthorityDecisionTx(tx, f.tenant, {
        ...replayDecisionInput,
        expectedInputVersion: decision.inputVersion + 1,
      }),
    ),
  );
  const replayEvidenceInput = {
    authorityScopeId: pub.id,
    authorityClass: "PROVISIONAL" as const,
    coverageState: "COMPLETE" as const,
    mappingVersionId: f.mapping.id,
    operationKey: pe.operationKey,
    expectedPreviousEvidenceId: null,
    sources: [pp],
    entryIds: [pr.entry.id],
    boundariesJson: pe.boundariesJson,
    closureSyncSliceEvidenceId: pp.syncSliceEvidenceId,
    closureLeafPath: "/terminal",
    closureRuleKey: "closed-event-v1",
  };
  assert.equal(
    (
      await f.db.$transaction((tx) =>
        recordFinancialAuthorityEvidenceTx(tx, f.tenant, replayEvidenceInput),
      )
    ).id,
    pe.id,
  );
  await assert.rejects(
    f.db.$transaction((tx) =>
      recordFinancialAuthorityEvidenceTx(tx, f.tenant, {
        ...replayEvidenceInput,
        entryIds: [],
      }),
    ),
  );
  const snapshot = await f.db.financialComponentSelection.findMany({
    where: { decisionId: decision.id },
  });
  assert.equal(snapshot.filter((x) => x.role === "SELECTED").length, 1);
  const selected = snapshot.find((x) => x.role === "SELECTED")!;
  assert.throws(
    () =>
      clone("FinancialComponentSelection", selected.id, {
        componentId: ar.entry.componentId,
        entryId: ar.entry.id,
      }),
    /D2B/,
  );
  assert.throws(
    () =>
      f.sqlite
        .prepare(
          "UPDATE FinancialComponentSelection SET role='SELECTED' WHERE decisionId=?",
        )
        .run(decision.id),
    /D2B immutable/,
  );
  assert.throws(
    () =>
      f.sqlite
        .prepare(
          "UPDATE FinancialAuthorityDecision SET reasonCode='fake' WHERE id=?",
        )
        .run(decision.id),
    /D2B immutable/,
  );
  assert.throws(
    () =>
      f.sqlite
        .prepare(
          "UPDATE FinancialAuthorityEvidence SET reasonCode='fake' WHERE id=?",
        )
        .run(pe.id),
    /D2B immutable/,
  );
  const member = await f.db.financialAuthorityEvidenceMember.findFirstOrThrow({
    where: { evidenceId: pe.id },
  });
  const src = await f.db.financialAuthorityEvidenceSource.findFirstOrThrow({
    where: { evidenceId: pe.id },
  });
  assert.throws(
    () => clone("FinancialAuthorityEvidenceMember", member.id),
    /D2B/,
  );
  assert.throws(() => clone("FinancialAuthorityEvidenceSource", src.id), /D2B/);
  assert.throws(
    () =>
      f.sqlite
        .prepare(
          "UPDATE FinancialAuthorityEvidenceMember SET entryId=? WHERE id=?",
        )
        .run(ar.entry.id, member.id),
    /D2B immutable/,
  );
  assert.throws(
    () =>
      f.sqlite
        .prepare("DELETE FROM FinancialComponentSelection WHERE id=?")
        .run(selected.id),
    /D2B immutable/,
  );

  const currentPub = await f.db.financialAuthorityScope.findUniqueOrThrow({
    where: { id: pub.id },
  });
  // A direct SQL decision with correct basis can be staged; publication cannot omit inventory.
  const draft = clone("FinancialAuthorityDecision", decision.id, {
    revision: 2,
    previousDecisionId: decision.id,
    operationKey: "draft",
    status: "DRAFT",
    inputVersion: currentPub.inputVersion,
  });
  assert.throws(
    () =>
      f.sqlite
        .prepare(
          "UPDATE FinancialAuthorityDecision SET status='PUBLISHED' WHERE id=?",
        )
        .run(draft),
    /D2B stale decision or incomplete/,
  );
  assert.throws(
    () =>
      clone("FinancialComponentSelection", selected.id, {
        decisionId: draft,
        role: "SUPPRESSED",
      }),
    /D2B invalid selection/,
  );
  clone("FinancialComponentSelection", selected.id, { decisionId: draft });
  assert.throws(
    () =>
      clone("FinancialComponentSelection", selected.id, { decisionId: draft }),
    /UNIQUE/,
  );
  assert.throws(
    () =>
      clone("FinancialComponentSelection", selected.id, {
        decisionId: draft,
        componentId: ar.entry.componentId,
        entryId: ar.entry.id,
        role: "SELECTED",
      }),
    /D2B invalid selection/,
  );
  assert.throws(
    () =>
      clone("FinancialComponentSelection", selected.id, {
        decisionId: draft,
        componentId: r3.entry.componentId,
        entryId: r3.entry.id,
      }),
    /D2B/,
  );
  assert.throws(
    () =>
      clone("FinancialAuthorityDecision", decision.id, {
        revision: 2,
        previousDecisionId: decision.id,
        operationKey: "competitor",
        status: "DRAFT",
      }),
    /UNIQUE|D2B/,
  );
  // Complete staged inventory and publish; exact old selection remains intact.
  const suppressed = snapshot.find((x) => x.role === "SUPPRESSED")!;
  clone("FinancialComponentSelection", suppressed.id, { decisionId: draft });
  f.sqlite
    .prepare(
      "UPDATE FinancialAuthorityDecision SET status='PUBLISHED' WHERE id=?",
    )
    .run(draft);
  assert.equal(
    (
      await f.db.financialAuthorityScope.findUniqueOrThrow({
        where: { id: pub.id },
      })
    ).currentDecisionId,
    draft,
  );
  assert.throws(
    () =>
      f.sqlite
        .prepare(
          "UPDATE FinancialAuthorityScope SET currentDecisionId=? WHERE id=?",
        )
        .run(decision.id, pub.id),
    /D2B invalid scope CAS/,
  );
  assert.throws(
    () =>
      f.sqlite
        .prepare("UPDATE FinancialAuthorityScope SET inputVersion=0 WHERE id=?")
        .run(pub.id),
    /D2B invalid scope CAS/,
  );
  // Unpublished staging is disposable; it must not permanently reserve the next decision revision.
  const abandoned = clone("FinancialAuthorityDecision", draft, {
    revision: 3,
    previousDecisionId: draft,
    operationKey: "abandoned",
    status: "DRAFT",
  });
  f.sqlite
    .prepare("DELETE FROM FinancialAuthorityDecision WHERE id=?")
    .run(abandoned);
  assert.throws(
    () =>
      f.sqlite
        .prepare("DELETE FROM FinancialAuthorityDecision WHERE id=?")
        .run(draft),
    /D2B immutable/,
  );

  // Evidence closure and membership attacks against otherwise valid rows.
  await assert.rejects(
    f.db.$transaction((tx) =>
      recordFinancialAuthorityEvidenceTx(tx, f.tenant, {
        authorityScopeId: pub.id,
        authorityClass: "ACTUAL",
        coverageState: "COMPLETE",
        mappingVersionId: f.mapping.id,
        expectedPreviousEvidenceId: ae.id,
        operationKey: "fake-complete",
        boundariesJson: "{}",
        sources: [ap],
        entryIds: [ar.entry.id],
      }),
    ),
  );
  await assert.rejects(f.evidence(pub.id, "ACTUAL", "COMPLETE", [ap], [])); // missing actual member
  await assert.rejects(
    f.evidence(pub.id, "ACTUAL", "INCOMPLETE", [ap], [r3.entry.id]),
  ); // foreign scope
  f.sqlite.exec("SAVEPOINT bad_manifest");
  const fakeEvidence = clone("FinancialAuthorityEvidence", ae.id, {
    revision: 2,
    previousEvidenceId: ae.id,
    operationKey: "bad-manifest",
    status: "DRAFT",
    expectedMemberCount: 0,
  });
  assert.throws(
    () =>
      f.sqlite
        .prepare(
          "UPDATE FinancialAuthorityEvidence SET status='SEALED' WHERE id=?",
        )
        .run(fakeEvidence),
    /D2B incomplete manifest/,
  );
  f.sqlite.exec("ROLLBACK TO bad_manifest; RELEASE bad_manifest");
  assert.throws(
    () =>
      clone("FinancialAuthorityEvidence", ae.id, {
        revision: 2,
        previousEvidenceId: ae.id,
        operationKey: "fake-complete-sql",
        status: "DRAFT",
        coverageState: "COMPLETE",
        reasonCode: null,
      }),
    /CHECK/,
  );

  const newer = await f.ledger({
    ...pi,
    operationKey: "new-p",
    expectedPreviousEntryId: pr.entry.id,
    amountAtoms: 11000n,
  });
  const validity = await f.db.$queryRaw<
    { valid: bigint }[]
  >`SELECT valid FROM FinancialDecisionValidity WHERE id=${draft}`;
  assert.equal(BigInt(validity[0].valid), 0n);
  assert.equal(
    (
      await f.db.$queryRaw<
        unknown[]
      >`SELECT * FROM EffectiveFinancialComponent WHERE authorityScopeId=${pub.id}`
    ).length,
    0,
  );
  await assert.rejects(
    f.db.$transaction((tx) =>
      publishFinancialAuthorityDecisionTx(tx, f.tenant, {
        authorityScopeId: pub.id,
        operationKey: "stale-publish",
        expectedPreviousDecisionId: draft,
        expectedInputVersion: currentPub.inputVersion,
      }),
    ),
  );
  await f.evidence(pub.id, "PROVISIONAL", "COMPLETE", [pp], [newer.entry.id]);
  await f.publish(pub.id);
  const published = await f.db.financialAuthorityScope.findUniqueOrThrow({
    where: { id: pub.id },
  });
  await f.evidence(pub.id, "ACTUAL", "INCOMPLETE", [ap], [ar.entry.id]);
  const stale = await f.db.$queryRaw<
    { valid: bigint }[]
  >`SELECT valid FROM FinancialDecisionValidity WHERE id=${published.currentDecisionId}`;
  assert.equal(BigInt(stale[0].valid), 0n);

  // Two independent Prisma clients race with the same explicit predecessor. Never renumber.
  const concurrency = await f.scope("SALE:race"),
    cs = await f.source("orders"),
    cb = await f.bind(concurrency.id, "PROVISIONAL", cs);
  const ci = f.input(
    concurrency.id,
    "PROVISIONAL",
    cb.id,
    cs,
    100n,
    "PRODUCT_REVENUE",
    "race",
  );
  const cr = await f.ledger(ci);
  const peer = new PrismaClient({
    datasources: { db: { url: "file:" + f.databasePath.replace(/\\/g, "/") } },
  });
  try {
    const next1 = {
      ...ci,
      operationKey: "race-next-1",
      expectedPreviousEntryId: cr.entry.id,
      amountAtoms: 200n,
    };
    const next2 = { ...next1, operationKey: "race-next-2", amountAtoms: 300n };
    const attempts = await Promise.allSettled([
      f.db.$transaction((tx) =>
        recordFinancialLedgerEntryTx(tx, f.tenant, next1),
      ),
      peer.$transaction((tx) =>
        recordFinancialLedgerEntryTx(tx, f.tenant, next2),
      ),
    ]);
    assert.equal(attempts.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(attempts.filter((x) => x.status === "rejected").length, 1);
    const winning = attempts[0].status === "fulfilled" ? next1 : next2;
    assert.equal((await f.ledger(winning)).replay, true);
    assert.equal(
      await f.db.financialLedgerEntry.count({
        where: { componentId: cr.entry.componentId },
      }),
      2,
    );
  } finally {
    await peer.$disconnect();
  }
  const connection = new DatabaseSync(f.databasePath);
  try {
    f.sqlite.exec("BEGIN IMMEDIATE");
    assert.throws(() => connection.exec("BEGIN IMMEDIATE"), /locked/);
  } finally {
    f.sqlite.exec("ROLLBACK");
    connection.close();
  }

  const before = await f.db.financialAuthorityScope.findUniqueOrThrow({
    where: { id: concurrency.id },
  });
  const currentHead = await f.db.financialComponentHead.findUniqueOrThrow({
    where: { id: cr.entry.componentId },
  });
  await assert.rejects(
    f.db.$transaction(async (tx) => {
      await recordFinancialLedgerEntryTx(tx, f.tenant, {
        ...ci,
        operationKey: "rolled-back",
        expectedPreviousEntryId: currentHead.currentEntryId,
      });
      throw Error("rollback after head advancement");
    }),
    /rollback after head/,
  );
  assert.deepEqual(
    await f.db.financialAuthorityScope.findUniqueOrThrow({
      where: { id: concurrency.id },
    }),
    before,
  );
  assert.equal(
    await f.db.financialLedgerEntry.count({
      where: { operationKey: "rolled-back" },
    }),
    0,
  );
  assert.deepEqual(f.sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(
    f.sqlite.prepare("PRAGMA integrity_check").get()?.integrity_check,
    "ok",
  );
  console.log(
    "D2B direct SQL, ledger/replay, manifests, publication/CAS, fixed money, concurrency and rollback PASS",
  );
} finally {
  await f.cleanup();
}
await authorityCases();
await effectiveCases();
await remediationCases();
console.log("D2B integration PASS");
