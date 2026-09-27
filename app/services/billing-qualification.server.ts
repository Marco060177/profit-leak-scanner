import { Prisma, type PrismaClient } from "@prisma/client";
import { appendMilestoneEvent } from "~/services/partner-program.server";

export const REQUIRED_SUCCESSFUL_PAYMENTS = 2;
export const SUCCESSFUL_PAID_EVENT = "PAYMENT_SUCCEEDED";

export type NormalizedBillingInput = {
  accountId: string;
  platform: string;
  externalEventId: string;
  eventType: string;
  occurredAt: Date;
  amountAtoms?: bigint | null;
  amountScale?: number | null;
  currencyCode?: string | null;
  subscriptionReference?: string | null;
  provenance?: unknown;
};

const required = (value: string, name: string) => {
  const result = value.trim();
  if (!result) throw new Error(`${name} is required`);
  return result;
};

export async function ingestNormalizedBillingEvent(db: PrismaClient, input: NormalizedBillingInput) {
  const data = {
    accountId: required(input.accountId, "accountId"),
    platform: required(input.platform, "platform"),
    externalEventId: required(input.externalEventId, "externalEventId"),
    eventType: required(input.eventType, "eventType"),
    occurredAt: input.occurredAt,
    amountAtoms: input.amountAtoms ?? null,
    amountScale: input.amountScale ?? null,
    currencyCode: input.currencyCode?.trim().toUpperCase() || null,
    subscriptionReference: input.subscriptionReference?.trim() || null,
    provenanceJson: input.provenance === undefined ? null : JSON.stringify(input.provenance),
  };
  const existing = await db.normalizedBillingEvent.findUnique({
    where: { platform_externalEventId: { platform: data.platform, externalEventId: data.externalEventId } },
  });
  if (existing) {
    const same = existing.accountId === data.accountId && existing.eventType === data.eventType &&
      existing.occurredAt.getTime() === data.occurredAt.getTime() && existing.amountAtoms === data.amountAtoms &&
      existing.amountScale === data.amountScale && existing.currencyCode === data.currencyCode &&
      existing.subscriptionReference === data.subscriptionReference && existing.provenanceJson === data.provenanceJson;
    if (!same) throw new Error("Billing event replay conflicts with immutable canonical data");
    return existing;
  }
  try {
    return await db.normalizedBillingEvent.create({ data });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    return ingestNormalizedBillingEvent(db, input);
  }
}

export async function evaluatePartnerQualification(db: PrismaClient, accountId: string) {
  return db.$transaction(async (tx) => {
    const referral = await tx.partnerReferral.findUnique({ where: { accountId } });
    if (!referral) return null;
    if (referral.status !== "ATTRIBUTED") return referral;
    const payments = await tx.normalizedBillingEvent.findMany({
      where: { accountId, eventType: SUCCESSFUL_PAID_EVENT, occurredAt: { gte: referral.attributedAt } },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }], take: REQUIRED_SUCCESSFUL_PAYMENTS,
    });
    if (payments.length < REQUIRED_SUCCESSFUL_PAYMENTS) return referral;
    const qualifiedAt = payments[REQUIRED_SUCCESSFUL_PAYMENTS - 1].occurredAt;
    for (const [index, payment] of payments.entries()) {
      await tx.partnerQualificationEvidence.upsert({
        where: { billingEventId: payment.id },
        create: { referralId: referral.id, accountId, billingEventId: payment.id, ordinal: index + 1 },
        update: {},
      });
    }
    await appendMilestoneEvent(tx, {
      accountId, referralId: referral.id, eventType: "QUALIFIED",
      idempotencyKey: "successful-payments:v1", occurredAt: qualifiedAt,
    });
    return tx.partnerReferral.update({
      where: { id: referral.id }, data: { status: "QUALIFIED", qualifiedAt },
    });
  });
}
