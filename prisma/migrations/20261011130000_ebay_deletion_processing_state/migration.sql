ALTER TABLE "EbayDeletionNotificationInbox" ADD COLUMN "leaseOwner" TEXT;
ALTER TABLE "EbayDeletionNotificationInbox" ADD COLUMN "leaseExpiresAt" DATETIME;
ALTER TABLE "EbayDeletionNotificationInbox" ADD COLUMN "nextAttemptAt" DATETIME;
ALTER TABLE "EbayDeletionNotificationInbox" ADD COLUMN "lastAttemptAt" DATETIME;

CREATE INDEX "EbayDeletionNotificationInbox_processingStatus_nextAttemptAt_leaseExpiresAt_idx"
  ON "EbayDeletionNotificationInbox"("processingStatus", "nextAttemptAt", "leaseExpiresAt");

CREATE TRIGGER "EbayDeletionNotificationInbox_processing_state_insert"
BEFORE INSERT ON "EbayDeletionNotificationInbox"
WHEN
  (NEW."processingStatus" = 'PROCESSING' AND
    (NEW."leaseOwner" IS NULL OR NEW."leaseExpiresAt" IS NULL OR NEW."lastAttemptAt" IS NULL OR NEW."nextAttemptAt" IS NOT NULL)) OR
  (NEW."processingStatus" = 'RETRY_PENDING' AND
    (NEW."leaseOwner" IS NOT NULL OR NEW."leaseExpiresAt" IS NOT NULL OR NEW."nextAttemptAt" IS NULL OR NEW."lastAttemptAt" IS NULL)) OR
  (NEW."processingStatus" NOT IN ('PROCESSING','RETRY_PENDING') AND
    (NEW."leaseOwner" IS NOT NULL OR NEW."leaseExpiresAt" IS NOT NULL OR NEW."nextAttemptAt" IS NOT NULL)) OR
  (NEW."leaseOwner" IS NOT NULL AND (length(NEW."leaseOwner") < 1 OR length(NEW."leaseOwner") > 128))
BEGIN
  SELECT RAISE(ABORT, 'eBay deletion notification invalid processing state');
END;

CREATE TRIGGER "EbayDeletionNotificationInbox_processing_state_update"
BEFORE UPDATE ON "EbayDeletionNotificationInbox"
WHEN
  (NEW."processingStatus" = 'PROCESSING' AND
    (NEW."leaseOwner" IS NULL OR NEW."leaseExpiresAt" IS NULL OR NEW."lastAttemptAt" IS NULL OR NEW."nextAttemptAt" IS NOT NULL)) OR
  (NEW."processingStatus" = 'RETRY_PENDING' AND
    (NEW."leaseOwner" IS NOT NULL OR NEW."leaseExpiresAt" IS NOT NULL OR NEW."nextAttemptAt" IS NULL OR NEW."lastAttemptAt" IS NULL)) OR
  (NEW."processingStatus" NOT IN ('PROCESSING','RETRY_PENDING') AND
    (NEW."leaseOwner" IS NOT NULL OR NEW."leaseExpiresAt" IS NOT NULL OR NEW."nextAttemptAt" IS NOT NULL)) OR
  (NEW."leaseOwner" IS NOT NULL AND (length(NEW."leaseOwner") < 1 OR length(NEW."leaseOwner") > 128))
BEGIN
  SELECT RAISE(ABORT, 'eBay deletion notification invalid processing state');
END;
