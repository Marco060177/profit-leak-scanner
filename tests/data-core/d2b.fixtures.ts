import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import {
  createFinancialAuthorityScopeTx,
  recordFinancialAuthorityBindingTx,
  recordFinancialLedgerEntryTx,
  type LedgerInput,
} from "../../app/core/data-core-d2b.server";
import {
  recordFinancialAuthorityEvidenceTx,
  publishFinancialAuthorityDecisionTx,
} from "../../app/core/financial-authority.server";
import {
  getEffectiveFinancialComponentsTx,
  type EffectiveFilter,
} from "../../app/core/effective-financial-components.server";
import type {
  AuthorityClass,
  CoverageFamily,
  CoverageState,
  ProjectionKind,
  Provenance,
} from "../../app/core/data-core-d2b-contracts";

export async function fixture() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "marginlab-d2b-"));
  const databasePath = path.join(directory, "d2b.sqlite");
  const sqlite = new DatabaseSync(databasePath);
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const name of readdirSync("prisma/migrations")
    .filter((n) => /^\d{14}_/.test(n))
    .sort())
    sqlite.exec(
      readFileSync(
        path.join("prisma/migrations", name, "migration.sql"),
        "utf8",
      ),
    );
  const db = new PrismaClient({
    datasources: { db: { url: "file:" + databasePath.replace(/\\/g, "/") } },
  });
  const account = await db.account.create({ data: {} });
  const channel = await db.channelConnection.create({
    data: {
      accountId: account.id,
      channel: "SHOPIFY",
      externalAccountId: "d2b-fixture",
    },
  });
  const tenant = { accountId: account.id, channelConnectionId: channel.id };
  const mapping = await db.mappingVersion.create({
    data: {
      platform: "SHOPIFY",
      sourceContract: "d2b-fixture",
      sourceVersion: "1",
      mapperSemanticVersion: "1",
      formulaCompatibilityVersion: "d2b-v1",
      checksum: "fixture-rules",
      activatedAt: new Date(),
    },
  });
  let sequence = 0;
  const next = () => "fixture-" + ++sequence;
  const source = async (
    stream: string,
    marketplaceId: string | null = null,
    options: { status?: string; mappingId?: string; entityId?: string } = {},
  ) => {
    const run = await db.syncRun.create({
      data: {
        ...tenant,
        stream,
        authorizationVersion: "fixture-auth",
        mappingVersionId: options.mappingId ?? mapping.id,
      },
    });
    const slice = await db.syncSlice.create({
      data: {
        ...tenant,
        runId: run.id,
        stream,
        marketplaceId,
        marketplaceScopeKey: marketplaceId ?? "@none",
        sliceKey: next(),
        authorizationVersion: "fixture-auth",
        status: "LEASED",
      },
    });
    const raw = await db.rawSourceRecord.create({
      data: {
        ...tenant,
        ingestionRunId: run.id,
        sourceSystem: "SHOPIFY",
        sourceVersion: "1",
        sourceEntityType: "FINANCIAL_DOCUMENT",
        sourceEntityId: options.entityId ?? next(),
        capturedAt: new Date(),
        schemaVersion: "1",
        payloadChecksum: next(),
        payloadByteLength: 0,
        retentionClass: "TEST",
      },
    });
    const norm = await db.normalizationRun.create({
      data: {
        ...tenant,
        rawSourceRecordId: raw.id,
        mappingVersionId: options.mappingId ?? mapping.id,
        normalizationRevision: 1,
        parserVersion: "1",
        status: options.status ?? "SUCCEEDED",
      },
    });
    const evidence = await db.syncSliceEvidence.create({
      data: {
        ...tenant,
        runId: run.id,
        sliceId: slice.id,
        rawSourceRecordId: raw.id,
        normalizationRunId: norm.id,
      },
    });
    return {
      rawSourceRecordId: raw.id,
      normalizationRunId: norm.id,
      mappingVersionId: norm.mappingVersionId,
      normalizationRevision: 1,
      syncSliceEvidenceId: evidence.id,
    };
  };
  const scope = (
    economicEventKey = next(),
    coverageFamily: CoverageFamily = "SALE_BUNDLE",
    marketplaceId: string | null = null,
    period?: { start: Date; end: Date },
  ) =>
    db.$transaction((tx) =>
      createFinancialAuthorityScopeTx(tx, tenant, {
        economicEventKey,
        coverageFamily,
        marketplaceId,
        provisionalSourceAuthority: "orders",
        actualSourceAuthority: "finances",
        policyMappingVersionId: mapping.id,
        periodStart: period?.start,
        periodEnd: period?.end,
      }),
    );
  const bind = async (
    scopeId: string,
    authorityClass: AuthorityClass,
    provenance: Provenance,
    identity = next(),
  ) =>
    db.$transaction((tx) =>
      recordFinancialAuthorityBindingTx(tx, tenant, {
        ...provenance,
        authorityScopeId: scopeId,
        authorityClass,
        sourceAuthority:
          authorityClass === "PROVISIONAL" ? "orders" : "finances",
        sourceSystem: "SHOPIFY",
        sourceEventNamespace: "explicit-event-id",
        sourceEventIdentity: identity,
        sourceLeafPath: "/event/id",
        correlationRuleKey: "event-reference-v1",
        expectedPreviousBindingId: null,
        operationKey: next(),
      }),
    );
  const input = (
    scopeId: string,
    authorityClass: AuthorityClass,
    bindingId: string,
    provenance: Provenance,
    amount: bigint,
    kind: ProjectionKind,
    componentKey = next(),
  ): LedgerInput => ({
    ...provenance,
    authorityScopeId: scopeId,
    authorityClass,
    bindingId,
    sourceAuthority: authorityClass === "PROVISIONAL" ? "orders" : "finances",
    sourceComponentKey: componentKey,
    expectedPreviousEntryId: null,
    operationKey: next(),
    state: "PRESENT",
    projectionKind: kind,
    sourceSubtype: "fixture",
    amountAtoms: amount,
    amountScale: 2,
    currencyCode: "EUR",
    sourceAmountText: amount.toString(),
    sourceSignConvention: "MERCHANT_SIGNED",
    signRuleKey: "preserve-v1",
    economicRole: "ECONOMIC",
    sourceLeafPath: "/charges/" + componentKey,
    effectiveAt: new Date("2026-01-15T00:00:00Z"),
  });
  const ledger = (data: LedgerInput) =>
    db.$transaction((tx) => recordFinancialLedgerEntryTx(tx, tenant, data));
  const evidence = async (
    scopeId: string,
    authorityClass: AuthorityClass,
    coverageState: CoverageState,
    sources: Provenance[],
    entryIds: string[],
  ) => {
    const previous = await db.financialAuthorityEvidence.findFirst({
      where: { authorityScopeId: scopeId, authorityClass },
      orderBy: { revision: "desc" },
    });
    return db.$transaction((tx) =>
      recordFinancialAuthorityEvidenceTx(tx, tenant, {
        authorityScopeId: scopeId,
        authorityClass,
        coverageState,
        sources,
        entryIds,
        mappingVersionId: mapping.id,
        expectedPreviousEvidenceId: previous?.id ?? null,
        operationKey: next(),
        boundariesJson: '{"terminal":true,"partition":"entire-event"}',
        closureSyncSliceEvidenceId:
          coverageState === "COMPLETE" ? sources[0]?.syncSliceEvidenceId : null,
        closureLeafPath: coverageState === "COMPLETE" ? "/terminal" : null,
        closureRuleKey: coverageState === "COMPLETE" ? "closed-event-v1" : null,
        reasonCode: coverageState === "COMPLETE" ? null : "FIXTURE_INCOMPLETE",
      }),
    );
  };
  const publish = async (scopeId: string) => {
    const s = await db.financialAuthorityScope.findUniqueOrThrow({
      where: { id: scopeId },
    });
    return db.$transaction((tx) =>
      publishFinancialAuthorityDecisionTx(tx, tenant, {
        authorityScopeId: scopeId,
        operationKey: next(),
        expectedPreviousDecisionId: s.currentDecisionId,
        expectedInputVersion: s.inputVersion,
      }),
    );
  };
  const effective = (filter: EffectiveFilter = {}) =>
    db.$transaction((tx) =>
      getEffectiveFinancialComponentsTx(tx, tenant, filter),
    );
  const cleanup = async () => {
    await db.$disconnect();
    sqlite.close();
    if (
      !path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep)
    )
      throw new Error("Unsafe fixture cleanup");
    rmSync(directory, { recursive: true, force: true });
  };
  return {
    db,
    sqlite,
    databasePath,
    tenant,
    account,
    channel,
    mapping,
    next,
    source,
    scope,
    bind,
    input,
    ledger,
    evidence,
    publish,
    effective,
    cleanup,
  };
}
