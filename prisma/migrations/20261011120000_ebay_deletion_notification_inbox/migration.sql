CREATE TABLE "EbayDeletionNotificationInbox" (
  "notificationId" TEXT NOT NULL PRIMARY KEY,
  "topic" TEXT NOT NULL,
  "schemaVersion" TEXT NOT NULL,
  "eventAt" DATETIME NOT NULL,
  "receivedAt" DATETIME NOT NULL,
  "processingStatus" TEXT NOT NULL DEFAULT 'PENDING_UNRESOLVED',
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "diagnosticCode" TEXT,
  "payloadChecksum" TEXT NOT NULL,
  "userLookupToken" TEXT NOT NULL,
  "hmacKeyVersion" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "EbayDeletionNotificationInbox_topic_check"
    CHECK ("topic" = 'MARKETPLACE_ACCOUNT_DELETION' AND "schemaVersion" = '1.0'),
  CONSTRAINT "EbayDeletionNotificationInbox_status_check"
    CHECK ("processingStatus" IN ('PENDING_UNRESOLVED','PROCESSING','COMPLETED','RETRY_PENDING','REVIEW_REQUIRED','FAILED')),
  CONSTRAINT "EbayDeletionNotificationInbox_retry_check" CHECK ("retryCount" >= 0),
  CONSTRAINT "EbayDeletionNotificationInbox_hmac_check" CHECK (
    length("payloadChecksum") = 64 AND "payloadChecksum" NOT GLOB '*[^0-9a-f]*' AND
    length("userLookupToken") = 64 AND "userLookupToken" NOT GLOB '*[^0-9a-f]*' AND
    length(trim("hmacKeyVersion")) BETWEEN 1 AND 64
  )
);

CREATE INDEX "EbayDeletionNotificationInbox_processingStatus_receivedAt_idx"
  ON "EbayDeletionNotificationInbox"("processingStatus", "receivedAt");
CREATE INDEX "EbayDeletionNotificationInbox_hmacKeyVersion_userLookupToken_idx"
  ON "EbayDeletionNotificationInbox"("hmacKeyVersion", "userLookupToken");

CREATE TRIGGER "EbayDeletionNotificationInbox_immutable_identity"
BEFORE UPDATE ON "EbayDeletionNotificationInbox"
WHEN NEW."notificationId" <> OLD."notificationId" OR NEW."topic" <> OLD."topic" OR
  NEW."schemaVersion" <> OLD."schemaVersion" OR NEW."eventAt" <> OLD."eventAt" OR
  NEW."receivedAt" <> OLD."receivedAt" OR NEW."payloadChecksum" <> OLD."payloadChecksum" OR
  NEW."userLookupToken" <> OLD."userLookupToken" OR NEW."hmacKeyVersion" <> OLD."hmacKeyVersion" OR
  NEW."createdAt" <> OLD."createdAt"
BEGIN
  SELECT RAISE(ABORT, 'eBay deletion notification immutable evidence');
END;

CREATE TRIGGER "EbayDeletionNotificationInbox_no_delete"
BEFORE DELETE ON "EbayDeletionNotificationInbox"
BEGIN
  SELECT RAISE(ABORT, 'eBay deletion notification inbox cannot be deleted');
END;
