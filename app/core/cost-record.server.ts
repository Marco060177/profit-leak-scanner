import type { Prisma } from "@prisma/client";
import type { VerifiedCoreTenant } from "./data-core-d2a.server";
import { canonicalChecksum } from "./data-core-d2b.server";
import {
  d2cMoney,
  type CostSelection,
  type D2cManualEvidence,
  type D2cProvenance,
} from "./data-core-d2c-contracts";
import type { FixedMoney } from "./fixed-money";

type Scope = {
  skuId: string;
  channelConnectionId?: string | null;
  marketplaceId?: string | null;
  sourceKind: "MANUAL" | "CHANNEL_SOURCE" | "IMPORTED_SOURCE";
  costKey: string;
};
type RevisionInput = Scope & {
  operationKey: string;
  status?: "PRESENT" | "WITHDRAWN";
  authorityTier: "MANUAL_OVERRIDE" | "SOURCE_ACTUAL" | "SOURCE_PROVISIONAL";
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  unitCost?: FixedMoney | null;
  evidenceKind: "MANUAL" | "SOURCE";
  manual?: D2cManualEvidence;
  provenance?: D2cProvenance;
  occurredAt?: Date | null;
  postedAt?: Date | null;
};
const scopeKeys = (i: Scope) => ({
  channelScopeKey: i.channelConnectionId ?? "@account",
  marketplaceScopeKey: i.marketplaceId ?? "@none",
});
export async function recordCostRecordRevisionTx(
  tx: Prisma.TransactionClient,
  tenant: VerifiedCoreTenant,
  input: RevisionInput,
) {
  if (
    (input.authorityTier === "MANUAL_OVERRIDE") !==
    (input.evidenceKind === "MANUAL")
  )
    throw new Error("D2C authority/evidence mismatch");
  if (
    input.channelConnectionId &&
    input.channelConnectionId !== tenant.channelConnectionId
  )
    throw new Error("D2C tenant channel mismatch");
  const status = input.status ?? "PRESENT";
  if (status === "PRESENT" && !input.unitCost)
    throw new Error("Present cost requires value");
  const unitCost = input.unitCost ? d2cMoney(input.unitCost) : null;
  const keys = scopeKeys(input);
  let head = await tx.costRecord.findUnique({
    where: {
      accountId_skuId_channelScopeKey_marketplaceScopeKey_sourceKind_costKey: {
        accountId: tenant.accountId,
        skuId: input.skuId,
        ...keys,
        sourceKind: input.sourceKind,
        costKey: input.costKey,
      },
    },
  });
  if (!head)
    head = await tx.costRecord.create({
      data: {
        accountId: tenant.accountId,
        skuId: input.skuId,
        channelConnectionId: input.channelConnectionId ?? null,
        marketplaceId: input.marketplaceId ?? null,
        ...keys,
        sourceKind: input.sourceKind,
        costKey: input.costKey,
      },
    });
  const data = {
    accountId: tenant.accountId,
    costRecordId: head.id,
    status,
    authorityTier: input.authorityTier,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo ?? null,
    unitCostAtoms: unitCost?.amountAtoms ?? null,
    unitCostScale: unitCost?.amountScale ?? null,
    currencyCode: unitCost?.currencyCode ?? null,
    evidenceKind: input.evidenceKind,
    actorRef: input.manual?.actorRef ?? null,
    manualReasonCode: input.manual?.manualReasonCode ?? null,
    rawSourceRecordId: input.provenance?.rawSourceRecordId ?? null,
    normalizationRunId: input.provenance?.normalizationRunId ?? null,
    mappingVersionId: input.provenance?.mappingVersionId ?? null,
    normalizationRevision: input.provenance?.normalizationRevision ?? null,
    syncSliceEvidenceId: input.provenance?.syncSliceEvidenceId ?? null,
    sourceLeafPath: input.provenance?.sourceLeafPath ?? null,
    occurredAt: input.occurredAt ?? null,
    postedAt: input.postedAt ?? null,
  };
  const inputChecksum = canonicalChecksum(data);
  const existing = await tx.costRecordRevision.findUnique({
    where: {
      costRecordId_operationKey: {
        costRecordId: head.id,
        operationKey: input.operationKey,
      },
    },
  });
  if (existing) {
    if (existing.inputChecksum !== inputChecksum)
      throw new Error("Conflicting cost operation replay");
    return { record: head, revision: existing, replayed: true };
  }
  const revision = head.revision + 1;
  const row = await tx.costRecordRevision.create({
    data: {
      ...data,
      revision,
      previousRevisionId: head.currentRevisionId,
      operationKey: input.operationKey,
      inputChecksum,
    },
  });
  head = await tx.costRecord.update({
    where: { id: head.id },
    data: { currentRevisionId: row.id, revision },
  });
  return { record: head, revision: row, replayed: false };
}

export async function selectApplicableCostTx(
  tx: Prisma.TransactionClient,
  tenant: VerifiedCoreTenant,
  q: {
    skuId: string;
    marketplaceId?: string | null;
    economicAt: Date;
    currencyCode?: string;
  },
): Promise<CostSelection> {
  const heads = await tx.costRecord.findMany({
    where: {
      accountId: tenant.accountId,
      skuId: q.skuId,
      OR: [
        { channelConnectionId: null },
        { channelConnectionId: tenant.channelConnectionId },
      ],
      AND: [
        {
          OR: [
            { marketplaceId: null },
            { marketplaceId: q.marketplaceId ?? "__none__" },
          ],
        },
      ],
    },
  });
  const headMap = new Map(heads.map((h) => [h.id, h]));
  const rows = (
    await tx.costRecordRevision.findMany({
      where: {
        accountId: tenant.accountId,
        costRecordId: { in: heads.map((h) => h.id) },
        status: "PRESENT",
        effectiveFrom: { lte: q.economicAt },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: q.economicAt } }],
      },
    })
  ).map((r) => ({ ...r, costRecord: headMap.get(r.costRecordId)! }));
  const filtered = q.currencyCode
    ? rows.filter((r) => r.currencyCode === q.currencyCode)
    : rows;
  if (!filtered.length)
    return { status: "UNKNOWN", reason: "NO_APPLICABLE_COST" };
  const tier = (x: string) =>
    x === "MANUAL_OVERRIDE" ? 3 : x === "SOURCE_ACTUAL" ? 2 : 1;
  const score = (r: (typeof filtered)[number]) => [
    tier(r.authorityTier),
    r.costRecord.marketplaceId ? 2 : r.costRecord.channelConnectionId ? 1 : 0,
    r.effectiveFrom.getTime(),
  ];
  filtered.sort((a, b) => {
    const x = score(a),
      y = score(b);
    return (
      y[0] - x[0] ||
      y[1] - x[1] ||
      y[2] - x[2] ||
      (a.costRecordId === b.costRecordId ? b.revision - a.revision : 0)
    );
  });
  const best = filtered[0],
    s = score(best);
  const tied = filtered.filter((r) => {
    const z = score(r);
    return (
      z[0] === s[0] &&
      z[1] === s[1] &&
      z[2] === s[2] &&
      r.costRecordId !== best.costRecordId
    );
  });
  if (tied.length)
    return { status: "AMBIGUOUS", reason: "TIED_DISTINCT_COST_RECORDS" };
  return {
    status: "KNOWN",
    revisionId: best.id,
    unitCost: {
      amountAtoms: best.unitCostAtoms!,
      amountScale: best.unitCostScale!,
      currencyCode: best.currencyCode!,
    },
  };
}
