CREATE TABLE "Partner" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "displayName" TEXT NOT NULL,
  "referralCode" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "Partner_referralCode_key" ON "Partner"("referralCode");
CREATE INDEX "Partner_status_idx" ON "Partner"("status");

CREATE TABLE "PartnerReferral" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "partnerId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ATTRIBUTED',
  "attributionSource" TEXT NOT NULL,
  "sourceMetadataJson" TEXT,
  "attributedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "qualifiedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PartnerReferral_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PartnerReferral_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PartnerReferral_accountId_key" ON "PartnerReferral"("accountId");
CREATE UNIQUE INDEX "PartnerReferral_id_accountId_key" ON "PartnerReferral"("id", "accountId");
CREATE INDEX "PartnerReferral_partnerId_status_idx" ON "PartnerReferral"("partnerId", "status");

CREATE TABLE "PartnerMilestoneEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "referralId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadataJson" TEXT,
  "occurredAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerMilestoneEvent_referralId_accountId_fkey" FOREIGN KEY ("referralId", "accountId") REFERENCES "PartnerReferral"("id", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PartnerMilestoneEvent_referralId_idempotencyKey_key" ON "PartnerMilestoneEvent"("referralId", "idempotencyKey");
CREATE INDEX "PartnerMilestoneEvent_accountId_occurredAt_idx" ON "PartnerMilestoneEvent"("accountId", "occurredAt");
CREATE INDEX "PartnerMilestoneEvent_referralId_occurredAt_idx" ON "PartnerMilestoneEvent"("referralId", "occurredAt");

CREATE TRIGGER "PartnerReferral_ownership_immutable" BEFORE UPDATE ON "PartnerReferral"
WHEN NEW."id" IS NOT OLD."id"
  OR NEW."partnerId" IS NOT OLD."partnerId"
  OR NEW."accountId" IS NOT OLD."accountId"
  OR NEW."attributedAt" IS NOT OLD."attributedAt"
  OR NEW."attributionSource" IS NOT OLD."attributionSource"
  OR NEW."sourceMetadataJson" IS NOT OLD."sourceMetadataJson"
  OR NEW."createdAt" IS NOT OLD."createdAt"
BEGIN SELECT RAISE(ABORT, 'Partner referral ownership is immutable'); END;

CREATE TRIGGER "PartnerReferral_no_delete" BEFORE DELETE ON "PartnerReferral"
BEGIN SELECT RAISE(ABORT, 'Partner referral attribution cannot be deleted'); END;

CREATE TRIGGER "PartnerMilestoneEvent_no_update" BEFORE UPDATE ON "PartnerMilestoneEvent"
BEGIN SELECT RAISE(ABORT, 'Partner milestone events are append-only'); END;

CREATE TRIGGER "PartnerMilestoneEvent_no_delete" BEFORE DELETE ON "PartnerMilestoneEvent"
BEGIN SELECT RAISE(ABORT, 'Partner milestone events are append-only'); END;
