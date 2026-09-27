import { Prisma, type PrismaClient } from "@prisma/client";

type PartnerDb = PrismaClient | Prisma.TransactionClient;

export class PartnerAttributionConflictError extends Error {
  readonly accountId: string;
  readonly existingPartnerId: string;
  readonly requestedPartnerId: string;

  constructor(accountId: string, existingPartnerId: string, requestedPartnerId: string) {
    super(`Account ${accountId} is already attributed to a different partner`);
    this.name = "PartnerAttributionConflictError";
    this.accountId = accountId;
    this.existingPartnerId = existingPartnerId;
    this.requestedPartnerId = requestedPartnerId;
  }
}

export class PartnerMilestoneReplayConflictError extends Error {
  readonly referralId: string;
  readonly idempotencyKey: string;

  constructor(referralId: string, idempotencyKey: string) {
    super(`Milestone key ${idempotencyKey} was already used with different event data for referral ${referralId}`);
    this.name = "PartnerMilestoneReplayConflictError";
    this.referralId = referralId;
    this.idempotencyKey = idempotencyKey;
  }
}

const required = (value: string, field: string) => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
};

export const normalizeReferralCode = (code: string) => {
  const normalized = required(code, "referralCode").toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{2,63}$/.test(normalized)) {
    throw new Error("referralCode must be 3-64 URL-safe characters");
  }
  return normalized;
};

const stableJson = (value: unknown) => value === undefined ? null : JSON.stringify(value);
const uniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

export async function registerPartner(db: PartnerDb, input: { displayName: string; referralCode: string; status?: string }) {
  return db.partner.create({ data: {
    displayName: required(input.displayName, "displayName"),
    referralCode: normalizeReferralCode(input.referralCode),
    status: input.status ? required(input.status, "status") : "ACTIVE",
  } });
}

export function resolvePartnerByReferralCode(db: PartnerDb, referralCode: string) {
  return db.partner.findUnique({ where: { referralCode: normalizeReferralCode(referralCode) } });
}

export function getAttributionByAccount(db: PartnerDb, accountId: string) {
  return db.partnerReferral.findUnique({ where: { accountId: required(accountId, "accountId") } });
}

export async function attributeAccountToPartner(db: PartnerDb, input: {
  accountId: string; partnerId: string; attributionSource: string; sourceMetadata?: unknown; attributedAt?: Date;
}) {
  const accountId = required(input.accountId, "accountId");
  const partnerId = required(input.partnerId, "partnerId");
  const existing = await db.partnerReferral.findUnique({ where: { accountId } });
  if (existing) {
    if (existing.partnerId === partnerId) return existing;
    throw new PartnerAttributionConflictError(accountId, existing.partnerId, partnerId);
  }
  try {
    return await db.partnerReferral.create({ data: {
      accountId, partnerId,
      attributionSource: required(input.attributionSource, "attributionSource"),
      sourceMetadataJson: stableJson(input.sourceMetadata),
      attributedAt: input.attributedAt,
    } });
  } catch (error) {
    if (!uniqueViolation(error)) throw error;
    const raced = await db.partnerReferral.findUnique({ where: { accountId } });
    if (raced?.partnerId === partnerId) return raced;
    if (raced) throw new PartnerAttributionConflictError(accountId, raced.partnerId, partnerId);
    throw error;
  }
}

export async function appendMilestoneEvent(db: PartnerDb, input: {
  accountId: string; referralId: string; eventType: string; idempotencyKey: string; occurredAt: Date; metadata?: unknown;
}) {
  const data = {
    accountId: required(input.accountId, "accountId"),
    referralId: required(input.referralId, "referralId"),
    eventType: required(input.eventType, "eventType"),
    idempotencyKey: required(input.idempotencyKey, "idempotencyKey"),
    occurredAt: input.occurredAt,
    metadataJson: stableJson(input.metadata),
  };
  const existing = await db.partnerMilestoneEvent.findUnique({
    where: { referralId_idempotencyKey: { referralId: data.referralId, idempotencyKey: data.idempotencyKey } },
  });
  if (existing) {
    if (existing.accountId === data.accountId && existing.eventType === data.eventType &&
      existing.occurredAt.getTime() === data.occurredAt.getTime() && existing.metadataJson === data.metadataJson) return existing;
    throw new PartnerMilestoneReplayConflictError(data.referralId, data.idempotencyKey);
  }
  try {
    return await db.partnerMilestoneEvent.create({ data });
  } catch (error) {
    if (!uniqueViolation(error)) throw error;
    const raced = await db.partnerMilestoneEvent.findUnique({
      where: { referralId_idempotencyKey: { referralId: data.referralId, idempotencyKey: data.idempotencyKey } },
    });
    if (raced && raced.accountId === data.accountId && raced.eventType === data.eventType &&
      raced.occurredAt.getTime() === data.occurredAt.getTime() && raced.metadataJson === data.metadataJson) return raced;
    throw new PartnerMilestoneReplayConflictError(data.referralId, data.idempotencyKey);
  }
}

export function readMilestoneEvents(db: PartnerDb, accountId: string, referralId: string) {
  return db.partnerMilestoneEvent.findMany({
    where: { accountId: required(accountId, "accountId"), referralId: required(referralId, "referralId") },
    orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
  });
}
