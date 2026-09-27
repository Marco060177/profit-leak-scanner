CREATE TABLE "PartnerPayout" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "partnerId" TEXT NOT NULL,
  "amountAtoms" BIGINT NOT NULL,
  "amountScale" INTEGER NOT NULL DEFAULT 2,
  "currencyCode" TEXT NOT NULL DEFAULT 'USD',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "entitlementFromAtoms" BIGINT NOT NULL,
  "entitlementToAtoms" BIGINT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" DATETIME,
  "paidAt" DATETIME,
  "cancelledAt" DATETIME,
  "adminNote" TEXT,
  "externalReference" TEXT,
  CONSTRAINT "PartnerPayout_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "PartnerPayout_amount_check" CHECK ("amountAtoms" > 0 AND "entitlementFromAtoms" >= 0 AND "entitlementToAtoms" > "entitlementFromAtoms" AND "amountAtoms" = "entitlementToAtoms" - "entitlementFromAtoms"),
  CONSTRAINT "PartnerPayout_money_check" CHECK ("amountScale" = 2 AND "currencyCode" = 'USD'),
  CONSTRAINT "PartnerPayout_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'PAID', 'CANCELLED'))
);

CREATE INDEX "PartnerPayout_partnerId_status_createdAt_idx" ON "PartnerPayout"("partnerId", "status", "createdAt");
CREATE UNIQUE INDEX "PartnerPayout_one_live_range" ON "PartnerPayout"("partnerId", "entitlementFromAtoms", "entitlementToAtoms") WHERE "status" <> 'CANCELLED';

CREATE TRIGGER "PartnerPayout_insert_guard" BEFORE INSERT ON "PartnerPayout"
BEGIN
  SELECT CASE WHEN NEW."status" <> 'PENDING' OR NEW."approvedAt" IS NOT NULL OR NEW."paidAt" IS NOT NULL OR NEW."cancelledAt" IS NOT NULL OR NEW."externalReference" IS NOT NULL
    THEN RAISE(ABORT, 'PartnerPayout must begin PENDING') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM "PartnerPayout" p WHERE p."partnerId" = NEW."partnerId" AND p."status" <> 'CANCELLED'
      AND NEW."entitlementFromAtoms" < p."entitlementToAtoms" AND NEW."entitlementToAtoms" > p."entitlementFromAtoms"
  ) THEN RAISE(ABORT, 'PartnerPayout entitlement overlap') END;
END;

CREATE TRIGGER "PartnerPayout_update_guard" BEFORE UPDATE ON "PartnerPayout"
BEGIN
  SELECT CASE WHEN OLD."status" IN ('PAID', 'CANCELLED') THEN RAISE(ABORT, 'PartnerPayout final state is immutable') END;
  SELECT CASE WHEN NEW."id" IS NOT OLD."id" OR NEW."partnerId" IS NOT OLD."partnerId" OR NEW."amountAtoms" IS NOT OLD."amountAtoms"
    OR NEW."amountScale" IS NOT OLD."amountScale" OR NEW."currencyCode" IS NOT OLD."currencyCode"
    OR NEW."entitlementFromAtoms" IS NOT OLD."entitlementFromAtoms" OR NEW."entitlementToAtoms" IS NOT OLD."entitlementToAtoms"
    OR NEW."createdAt" IS NOT OLD."createdAt" THEN RAISE(ABORT, 'PartnerPayout accounting identity is immutable') END;
  SELECT CASE WHEN NOT (
    (OLD."status" = 'PENDING' AND NEW."status" = 'APPROVED' AND NEW."approvedAt" IS NOT NULL AND NEW."paidAt" IS NULL AND NEW."cancelledAt" IS NULL AND NEW."externalReference" IS NULL) OR
    (OLD."status" IN ('PENDING', 'APPROVED') AND NEW."status" = 'CANCELLED' AND NEW."cancelledAt" IS NOT NULL AND NEW."paidAt" IS NULL) OR
    (OLD."status" = 'APPROVED' AND NEW."status" = 'PAID' AND NEW."approvedAt" IS NOT NULL AND NEW."paidAt" IS NOT NULL AND NEW."cancelledAt" IS NULL AND NEW."externalReference" IS NOT NULL)
  ) THEN RAISE(ABORT, 'Invalid PartnerPayout transition') END;
END;

CREATE TRIGGER "PartnerPayout_no_delete" BEFORE DELETE ON "PartnerPayout"
BEGIN SELECT RAISE(ABORT, 'PartnerPayout history is immutable'); END;
