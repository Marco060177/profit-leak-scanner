import type { Prisma } from "@prisma/client";
import type { VerifiedCoreTenant } from "./data-core-d2a.server";
import { canonicalChecksum } from "./data-core-d2b.server";
import {
  d2cQuantity,
  type InventoryEventType,
  type InventoryState,
} from "./data-core-d2c-contracts";
import type { FixedQuantity } from "./fixed-money";
import { selectApplicableCostTx } from "./cost-record.server";

const allowed: Record<string, readonly string[]> = {
  RETURN_INITIATED: ["SOLD>RETURN_IN_TRANSIT"],
  RETURN_RECEIVED: [
    "SOLD>RETURNED_PENDING_INSPECTION",
    "RETURN_IN_TRANSIT>RETURNED_PENDING_INSPECTION",
  ],
  RESTOCKED_SELLABLE: ["RETURNED_PENDING_INSPECTION>SELLABLE"],
  RESTOCKED_UNSELLABLE: ["RETURNED_PENDING_INSPECTION>UNSELLABLE"],
  LOST: [
    "SOLD>LOST",
    "RETURN_IN_TRANSIT>LOST",
    "RETURNED_PENDING_INSPECTION>LOST",
    "SELLABLE>LOST",
  ],
  DAMAGED: [
    "SOLD>DAMAGED",
    "RETURN_IN_TRANSIT>DAMAGED",
    "RETURNED_PENDING_INSPECTION>DAMAGED",
    "SELLABLE>DAMAGED",
  ],
  DISPOSED: ["UNSELLABLE>DISPOSED", "DAMAGED>DISPOSED"],
  LIQUIDATED: [
    "SELLABLE>LIQUIDATED",
    "UNSELLABLE>LIQUIDATED",
    "DAMAGED>LIQUIDATED",
  ],
};
async function balances(
  tx: Prisma.TransactionClient,
  lotId: string,
  scale: number,
) {
  const out = new Map<string, bigint>();
  for (const e of await tx.inventoryEconomicEvent.findMany({
    where: { lotId },
    orderBy: { recordedAt: "asc" },
  })) {
    if (e.quantityScale !== scale)
      throw new Error("D2C quantity scale mismatch");
    if (
      e.effectClass !== "PHYSICAL" &&
      !(e.effectClass === "COMPENSATION" && e.stateFrom && e.stateTo)
    )
      continue;
    if (e.stateFrom)
      out.set(e.stateFrom, (out.get(e.stateFrom) ?? 0n) - e.quantityAtoms);
    if (e.stateTo)
      out.set(e.stateTo, (out.get(e.stateTo) ?? 0n) + e.quantityAtoms);
  }
  return out;
}
export async function appendInventoryEconomicEventTx(
  tx: Prisma.TransactionClient,
  tenant: VerifiedCoreTenant,
  input: {
    lotId: string;
    eventType: InventoryEventType;
    stateFrom?: InventoryState | null;
    stateTo?: InventoryState | null;
    quantity: FixedQuantity;
    operationKey: string;
    economicAt: Date;
    financialLedgerEntryId?: string | null;
    compensatesEventId?: string | null;
    coverageKey?: string | null;
    closureKey?: string | null;
  },
) {
  const lot = await tx.inventoryEconomicLot.findFirstOrThrow({
    where: {
      id: input.lotId,
      accountId: tenant.accountId,
      channelConnectionId: tenant.channelConnectionId,
    },
  });
  const q = d2cQuantity(input.quantity);
  if (q.quantityScale !== lot.quantityScale)
    throw new Error("D2C quantity scale mismatch");
  const data = {
    accountId: tenant.accountId,
    channelConnectionId: tenant.channelConnectionId,
    lotId: lot.id,
    eventType: input.eventType,
    effectClass:
      input.eventType === "COMPENSATION"
        ? "COMPENSATION"
        : input.eventType === "COST_BASIS_RESOLVED" ||
            input.eventType === "COST_CORRECTION" ||
            input.eventType === "REIMBURSEMENT_LINKED"
          ? "COST_BASIS"
          : "PHYSICAL",
    stateFrom: input.stateFrom ?? null,
    stateTo: input.stateTo ?? null,
    quantityAtoms: q.quantityAtoms,
    quantityScale: q.quantityScale,
    costRecordRevisionId: lot.costRecordRevisionId,
    unitCostAtoms: lot.unitCostAtoms,
    unitCostScale: lot.unitCostScale,
    currencyCode: lot.currencyCode,
    financialLedgerEntryId: input.financialLedgerEntryId ?? null,
    compensatesEventId: input.compensatesEventId ?? null,
    coverageKey: input.coverageKey ?? null,
    closureKey: input.closureKey ?? null,
    economicAt: input.economicAt,
  };
  const inputChecksum = canonicalChecksum(data);
  const prior = await tx.inventoryEconomicEvent.findUnique({
    where: {
      lotId_operationKey: { lotId: lot.id, operationKey: input.operationKey },
    },
  });
  if (prior) {
    if (prior.inputChecksum !== inputChecksum)
      throw new Error("Conflicting inventory operation replay");
    return { ...prior, replayed: true };
  }
  if (data.effectClass === "PHYSICAL") {
    if (!input.stateTo) throw new Error("Physical event requires target state");
    if (
      input.eventType !== "SALE_RECOGNITION" &&
      input.eventType !== "REPLACEMENT_SENT" &&
      !allowed[input.eventType]?.includes(`${input.stateFrom}>${input.stateTo}`)
    )
      throw new Error("Invalid inventory transition");
    const b = await balances(tx, lot.id, lot.quantityScale);
    if (input.stateFrom && (b.get(input.stateFrom) ?? 0n) < q.quantityAtoms)
      throw new Error("Transition quantity exceeds available state");
    const total = [...b.values()].reduce((a, x) => a + x, 0n);
    if (!input.stateFrom && total + q.quantityAtoms > lot.quantityAtoms)
      throw new Error("Physical quantity exceeds lot quantity");
  }
  if (input.eventType === "COMPENSATION") {
    const target = await tx.inventoryEconomicEvent.findFirstOrThrow({
      where: { id: input.compensatesEventId!, lotId: lot.id },
    });
    const used = (
      await tx.inventoryEconomicEvent.findMany({
        where: { compensatesEventId: target.id },
      })
    ).reduce((a, x) => a + x.quantityAtoms, 0n);
    if (used + q.quantityAtoms > target.quantityAtoms)
      throw new Error("Compensation exceeds uncompensated quantity");
    if (input.stateFrom && input.stateTo) {
      const b = await balances(tx, lot.id, lot.quantityScale);
      if ((b.get(input.stateFrom) ?? 0n) < q.quantityAtoms)
        throw new Error("Compensation quantity exceeds available state");
    }
  }
  return {
    ...(await tx.inventoryEconomicEvent.create({
      data: { ...data, operationKey: input.operationKey, inputChecksum },
    })),
    replayed: false,
  };
}
export async function recognizeSaleCogsTx(
  tx: Prisma.TransactionClient,
  tenant: VerifiedCoreTenant,
  input: {
    lotKey: string;
    skuId: string;
    marketplaceId?: string | null;
    quantity: FixedQuantity;
    economicAt: Date;
    operationKey: string;
    orderId?: string;
    orderRevisionId?: string;
    itemId?: string;
    itemRevisionId?: string;
    originKind?: "SALE_ITEM" | "REPLACEMENT_ITEM";
    currencyCode?: string;
  },
) {
  const requestChecksum = canonicalChecksum({
    ...input,
    quantity: d2cQuantity(input.quantity),
  });
  const existing = await tx.inventoryEconomicLot.findUnique({
    where: {
      accountId_channelConnectionId_operationKey: {
        accountId: tenant.accountId,
        channelConnectionId: tenant.channelConnectionId,
        operationKey: input.operationKey,
      },
    },
  });
  if (existing) {
    if (existing.inputChecksum !== requestChecksum)
      throw new Error("Conflicting sale recognition replay");
    return { lot: existing, replayed: true };
  }
  const q = d2cQuantity(input.quantity);
  const selected = await selectApplicableCostTx(tx, tenant, {
    skuId: input.skuId,
    marketplaceId: input.marketplaceId,
    economicAt: input.economicAt,
    currencyCode: input.currencyCode,
  });
  const base = {
    accountId: tenant.accountId,
    channelConnectionId: tenant.channelConnectionId,
    marketplaceId: input.marketplaceId ?? null,
    marketplaceScopeKey: input.marketplaceId ?? "@none",
    skuId: input.skuId,
    lotKey: input.lotKey,
    originKind: input.originKind ?? "SALE_ITEM",
    orderId: input.orderId ?? null,
    orderRevisionId: input.orderRevisionId ?? null,
    itemId: input.itemId ?? null,
    itemRevisionId: input.itemRevisionId ?? null,
    quantityAtoms: q.quantityAtoms,
    quantityScale: q.quantityScale,
    costStatus: selected.status === "KNOWN" ? "KNOWN" : "UNKNOWN",
    costRecordRevisionId:
      selected.status === "KNOWN" ? selected.revisionId : null,
    unitCostAtoms:
      selected.status === "KNOWN" ? selected.unitCost.amountAtoms : null,
    unitCostScale:
      selected.status === "KNOWN" ? selected.unitCost.amountScale : null,
    currencyCode:
      selected.status === "KNOWN" ? selected.unitCost.currencyCode : null,
    recognitionEconomicAt: input.economicAt,
    operationKey: input.operationKey,
  };
  const lot = await tx.inventoryEconomicLot.create({
    data: { ...base, inputChecksum: requestChecksum },
  });
  await appendInventoryEconomicEventTx(tx, tenant, {
    lotId: lot.id,
    eventType:
      input.originKind === "REPLACEMENT_ITEM"
        ? "REPLACEMENT_SENT"
        : "SALE_RECOGNITION",
    stateTo: "SOLD",
    quantity: q,
    operationKey: `${input.operationKey}:recognition`,
    economicAt: input.economicAt,
  });
  return { lot, replayed: false, selection: selected };
}
export async function resolveMissingCostTx(
  tx: Prisma.TransactionClient,
  tenant: VerifiedCoreTenant,
  input: {
    lotId: string;
    operationKey: string;
    economicAt: Date;
    currencyCode?: string;
  },
) {
  const lot = await tx.inventoryEconomicLot.findFirstOrThrow({
    where: {
      id: input.lotId,
      accountId: tenant.accountId,
      channelConnectionId: tenant.channelConnectionId,
    },
  });
  if (lot.costStatus === "KNOWN")
    return { status: "ALREADY_KNOWN" as const, lot };
  const cost = await selectApplicableCostTx(tx, tenant, {
    skuId: lot.skuId,
    marketplaceId: lot.marketplaceId,
    economicAt: lot.recognitionEconomicAt,
    currencyCode: input.currencyCode,
  });
  if (cost.status !== "KNOWN") return cost;
  const inputChecksum = canonicalChecksum({ lotId: lot.id, cost });
  const prior = await tx.inventoryEconomicEvent.findUnique({
    where: {
      lotId_operationKey: {
        lotId: lot.id,
        operationKey: input.operationKey,
      },
    },
  });
  if (prior) {
    if (prior.inputChecksum !== inputChecksum)
      throw new Error("Conflicting cost resolution replay");
    return { status: "RESOLVED" as const, event: prior, cost };
  }
  const event = await tx.inventoryEconomicEvent.create({
    data: {
      accountId: tenant.accountId,
      channelConnectionId: tenant.channelConnectionId,
      lotId: lot.id,
      eventType: "COST_BASIS_RESOLVED",
      effectClass: "COST_BASIS",
      quantityAtoms: lot.quantityAtoms,
      quantityScale: lot.quantityScale,
      costRecordRevisionId: cost.revisionId,
      unitCostAtoms: cost.unitCost.amountAtoms,
      unitCostScale: cost.unitCost.amountScale,
      currencyCode: cost.unitCost.currencyCode,
      operationKey: input.operationKey,
      inputChecksum,
      economicAt: input.economicAt,
    },
  });
  return { status: "RESOLVED" as const, event, cost };
}
export const recordInventoryRecoveryTx = appendInventoryEconomicEventTx;
export async function linkReimbursementTx(
  tx: Prisma.TransactionClient,
  tenant: VerifiedCoreTenant,
  input: {
    lotId: string;
    state: "LOST" | "DAMAGED";
    quantity: FixedQuantity;
    financialLedgerEntryId: string;
    operationKey: string;
    economicAt: Date;
  },
) {
  const entry = await tx.financialLedgerEntry.findFirstOrThrow({
    where: {
      id: input.financialLedgerEntryId,
      accountId: tenant.accountId,
      channelConnectionId: tenant.channelConnectionId,
      projectionKind: "REIMBURSEMENT",
      state: "PRESENT",
    },
  });
  const selection = await tx.financialComponentSelection.findFirst({
    where: {
      entryId: entry.id,
      accountId: tenant.accountId,
      channelConnectionId: tenant.channelConnectionId,
    },
  });
  if (
    !selection ||
    !(await tx.financialAuthorityDecision.findFirst({
      where: {
        id: selection.decisionId,
        status: "PUBLISHED",
        accountId: tenant.accountId,
        channelConnectionId: tenant.channelConnectionId,
      },
    }))
  )
    throw new Error("Reimbursement is not an effective D2B component");
  return appendInventoryEconomicEventTx(tx, tenant, {
    lotId: input.lotId,
    eventType: "REIMBURSEMENT_LINKED",
    stateFrom: input.state,
    stateTo: input.state,
    quantity: input.quantity,
    financialLedgerEntryId: entry.id,
    operationKey: input.operationKey,
    economicAt: input.economicAt,
  });
}
