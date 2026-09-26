import type { Prisma } from "@prisma/client";
import type { VerifiedCoreTenant } from "./data-core-d2a.server";
import { canonicalChecksum } from "./data-core-d2b.server";
export async function recordReplacementLinkTx(
  tx: Prisma.TransactionClient,
  tenant: VerifiedCoreTenant,
  input: {
    linkKey: string;
    operationKey: string;
    status?: "PRESENT" | "WITHDRAWN";
    replacementKind:
      | "FREE"
      | "CHARGED"
      | "LOSS_REPLACEMENT"
      | "DAMAGE_REPLACEMENT"
      | "RETURN_REPLACEMENT";
    financialTreatment: "NO_REVENUE" | "D2B_COMPONENT" | "UNKNOWN";
    predecessorItemId: string;
    predecessorItemRevisionId: string;
    replacementItemId: string;
    replacementItemRevisionId: string;
    actorRef?: string;
    manualReasonCode?: string;
  },
) {
  if (
    input.replacementKind === "FREE" &&
    input.financialTreatment !== "NO_REVENUE"
  )
    throw new Error("Free replacement cannot have revenue treatment");
  if (
    input.predecessorItemId === input.replacementItemId ||
    input.predecessorItemRevisionId === input.replacementItemRevisionId
  )
    throw new Error("Replacement self-link");
  const items = await tx.normalizedOrderItem.findMany({
    where: {
      id: { in: [input.predecessorItemId, input.replacementItemId] },
      accountId: tenant.accountId,
      channelConnectionId: tenant.channelConnectionId,
    },
  });
  if (items.length !== 2) throw new Error("Replacement tenant/item mismatch");
  const data = {
    accountId: tenant.accountId,
    channelConnectionId: tenant.channelConnectionId,
    linkKey: input.linkKey,
    status: input.status ?? "PRESENT",
    replacementKind: input.replacementKind,
    financialTreatment: input.financialTreatment,
    predecessorItemId: input.predecessorItemId,
    predecessorItemRevisionId: input.predecessorItemRevisionId,
    replacementItemId: input.replacementItemId,
    replacementItemRevisionId: input.replacementItemRevisionId,
    actorRef: input.actorRef ?? null,
    manualReasonCode: input.manualReasonCode ?? null,
  };
  const inputChecksum = canonicalChecksum(data);
  const old = await tx.replacementLink.findUnique({
    where: {
      accountId_channelConnectionId_linkKey_operationKey: {
        accountId: tenant.accountId,
        channelConnectionId: tenant.channelConnectionId,
        linkKey: input.linkKey,
        operationKey: input.operationKey,
      },
    },
  });
  if (old) {
    if (old.inputChecksum !== inputChecksum)
      throw new Error("Conflicting replacement replay");
    return { ...old, replayed: true };
  }
  const latest = await tx.replacementLink.findFirst({
    where: {
      accountId: tenant.accountId,
      channelConnectionId: tenant.channelConnectionId,
      linkKey: input.linkKey,
    },
    orderBy: { revision: "desc" },
  });
  if (
    data.status === "PRESENT" &&
    (await tx.replacementLink.findFirst({
      where: {
        accountId: tenant.accountId,
        channelConnectionId: tenant.channelConnectionId,
        status: "PRESENT",
        replacementItemId: input.replacementItemId,
        NOT: { linkKey: input.linkKey },
      },
    }))
  )
    throw new Error("Contradictory active replacement predecessor");
  if (data.status === "PRESENT") {
    let cursor = input.replacementItemId;
    const seen = new Set([input.predecessorItemId]);
    while (cursor.length > 0) {
      if (seen.has(cursor)) throw new Error("Replacement cycle");
      seen.add(cursor);
      const edge = await tx.replacementLink.findFirst({
        where: {
          accountId: tenant.accountId,
          channelConnectionId: tenant.channelConnectionId,
          status: "PRESENT",
          predecessorItemId: cursor,
        },
        orderBy: { revision: "desc" },
      });
      cursor = edge?.replacementItemId ?? "";
    }
  }
  return {
    ...(await tx.replacementLink.create({
      data: {
        ...data,
        revision: (latest?.revision ?? 0) + 1,
        previousLinkId: latest?.id ?? null,
        operationKey: input.operationKey,
        inputChecksum,
      },
    })),
    replayed: false,
  };
}
