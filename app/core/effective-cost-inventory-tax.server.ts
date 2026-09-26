import type { Prisma } from "@prisma/client";
import type { VerifiedCoreTenant } from "./data-core-d2a.server";
import type { EffectiveD2c } from "./data-core-d2c-contracts";
export async function getEffectiveCostInventoryTaxTx(
  tx: Prisma.TransactionClient,
  tenant: VerifiedCoreTenant,
  filter: {
    marketplaceId?: string | null;
    periodStart?: Date;
    periodEnd?: Date;
  } = {},
): Promise<EffectiveD2c> {
  const lots = await tx.inventoryEconomicLot.findMany({
    where: {
      accountId: tenant.accountId,
      channelConnectionId: tenant.channelConnectionId,
      ...(filter.marketplaceId ? { marketplaceId: filter.marketplaceId } : {}),
      ...(filter.periodStart || filter.periodEnd
        ? {
            recognitionEconomicAt: {
              ...(filter.periodStart ? { gte: filter.periodStart } : {}),
              ...(filter.periodEnd ? { lt: filter.periodEnd } : {}),
            },
          }
        : {}),
    },
  });
  const events = await tx.inventoryEconomicEvent.findMany({
    where: {
      accountId: tenant.accountId,
      channelConnectionId: tenant.channelConnectionId,
      lotId: { in: lots.map((x) => x.id) },
    },
  });
  const taxEvidence = await tx.normalizedTaxEvidence.findMany({
    where: {
      accountId: tenant.accountId,
      channelConnectionId: tenant.channelConnectionId,
      status: "PRESENT",
      ...(filter.marketplaceId
        ? {
            OR: [
              { marketplaceId: filter.marketplaceId },
              { marketplaceId: null },
            ],
          }
        : {}),
    },
  });
  const reasons: string[] = [];
  const resolutions = events.filter(
    (event) => event.eventType === "COST_BASIS_RESOLVED",
  );
  const resolutionRevisions = await tx.costRecordRevision.findMany({
    where: {
      id: {
        in: resolutions.flatMap((event) =>
          event.costRecordRevisionId ? [event.costRecordRevisionId] : [],
        ),
      },
    },
  });
  const resolutionRecords = await tx.costRecord.findMany({
    where: {
      id: { in: resolutionRevisions.map((revision) => revision.costRecordId) },
    },
  });
  const validResolution = (lot: (typeof lots)[number]) =>
    resolutions.some((event) => {
      if (
        event.lotId !== lot.id ||
        event.costRecordRevisionId == null ||
        event.unitCostAtoms == null ||
        event.unitCostScale == null ||
        event.currencyCode == null
      )
        return false;
      const revision = resolutionRevisions.find(
        (row) => row.id === event.costRecordRevisionId,
      );
      const record =
        revision &&
        resolutionRecords.find((row) => row.id === revision.costRecordId);
      return Boolean(
        revision &&
        record &&
        revision.status === "PRESENT" &&
        revision.accountId === lot.accountId &&
        record.skuId === lot.skuId &&
        revision.unitCostAtoms === event.unitCostAtoms &&
        revision.unitCostScale === event.unitCostScale &&
        revision.currencyCode === event.currencyCode,
      );
    });
  for (const lot of lots)
    if (lot.costStatus === "UNKNOWN" && !validResolution(lot))
      reasons.push(`UNKNOWN_COST:${lot.id}`);
  for (const tax of taxEvidence)
    if (tax.availability === "UNKNOWN" || tax.coverageState !== "COMPLETE")
      reasons.push(`TAX_EVIDENCE_${tax.availability}:${tax.id}`);
  if (reasons.length)
    return {
      status: "BLOCKED",
      reasons,
      diagnostics: [
        ...lots.filter((x) => x.costStatus === "UNKNOWN"),
        ...taxEvidence.filter(
          (x) => x.availability === "UNKNOWN" || x.coverageState !== "COMPLETE",
        ),
      ],
    };
  return { status: "READY", lots, events, taxEvidence };
}
