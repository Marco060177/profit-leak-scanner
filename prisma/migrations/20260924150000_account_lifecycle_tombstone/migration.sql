-- Explicit Account deletion boundary; no historical or channel data is deleted implicitly.
ALTER TABLE "Account" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Account" ADD COLUMN "deletionRequestedAt" DATETIME;
CREATE INDEX "Account_status_idx" ON "Account"("status");
