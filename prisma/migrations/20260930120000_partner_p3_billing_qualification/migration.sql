CREATE TABLE "NormalizedBillingEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "externalEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "occurredAt" DATETIME NOT NULL,
  "amountAtoms" BIGINT,
  "amountScale" INTEGER,
  "currencyCode" TEXT,
  "subscriptionReference" TEXT,
  "provenanceJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NormalizedBillingEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "NormalizedBillingEvent_platform_externalEventId_key" ON "NormalizedBillingEvent"("platform", "externalEventId");
CREATE UNIQUE INDEX "NormalizedBillingEvent_id_accountId_key" ON "NormalizedBillingEvent"("id", "accountId");
CREATE INDEX "NormalizedBillingEvent_accountId_eventType_occurredAt_idx" ON "NormalizedBillingEvent"("accountId", "eventType", "occurredAt");

CREATE TABLE "PartnerQualificationEvidence" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "referralId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "billingEventId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerQualificationEvidence_referralId_accountId_fkey" FOREIGN KEY ("referralId", "accountId") REFERENCES "PartnerReferral"("id", "accountId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "PartnerQualificationEvidence_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "PartnerQualificationEvidence_billingEventId_accountId_fkey" FOREIGN KEY ("billingEventId", "accountId") REFERENCES "NormalizedBillingEvent"("id", "accountId") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "PartnerQualificationEvidence_billingEventId_key" ON "PartnerQualificationEvidence"("billingEventId");
CREATE UNIQUE INDEX "PartnerQualificationEvidence_referralId_ordinal_key" ON "PartnerQualificationEvidence"("referralId", "ordinal");
CREATE INDEX "PartnerQualificationEvidence_accountId_idx" ON "PartnerQualificationEvidence"("accountId");

CREATE TRIGGER "NormalizedBillingEvent_no_update" BEFORE UPDATE ON "NormalizedBillingEvent"
BEGIN SELECT RAISE(ABORT, 'Normalized billing events are append-only'); END;
CREATE TRIGGER "NormalizedBillingEvent_no_delete" BEFORE DELETE ON "NormalizedBillingEvent"
BEGIN SELECT RAISE(ABORT, 'Normalized billing events are append-only'); END;
CREATE TRIGGER "PartnerQualificationEvidence_no_update" BEFORE UPDATE ON "PartnerQualificationEvidence"
BEGIN SELECT RAISE(ABORT, 'Partner qualification evidence is immutable'); END;
CREATE TRIGGER "PartnerQualificationEvidence_no_delete" BEFORE DELETE ON "PartnerQualificationEvidence"
BEGIN SELECT RAISE(ABORT, 'Partner qualification evidence is immutable'); END;
