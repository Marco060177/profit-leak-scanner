-- Preserve every legacy preference while allowing Account-owned preferences to survive shop redaction.
CREATE TABLE "new_NotificationPreferences" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shop" TEXT,
  "accountId" TEXT,
  "recipientEmail" TEXT,
  "emailAlertsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "weeklyReportEnabled" BOOLEAN NOT NULL DEFAULT false,
  "notifyCritical" BOOLEAN NOT NULL DEFAULT true,
  "notifyWarnings" BOOLEAN NOT NULL DEFAULT false,
  "notifyOpportunities" BOOLEAN NOT NULL DEFAULT false,
  "weeklyReportDay" INTEGER NOT NULL DEFAULT 1,
  "weeklyReportHour" INTEGER NOT NULL DEFAULT 8,
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "language" TEXT NOT NULL DEFAULT 'en',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "NotificationPreferences_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_NotificationPreferences" ("id","shop","recipientEmail","emailAlertsEnabled","weeklyReportEnabled","notifyCritical","notifyWarnings","notifyOpportunities","weeklyReportDay","weeklyReportHour","timezone","language","createdAt","updatedAt")
SELECT "id","shop","recipientEmail","emailAlertsEnabled","weeklyReportEnabled","notifyCritical","notifyWarnings","notifyOpportunities","weeklyReportDay","weeklyReportHour","timezone","language","createdAt","updatedAt" FROM "NotificationPreferences";
DROP TABLE "NotificationPreferences";
ALTER TABLE "new_NotificationPreferences" RENAME TO "NotificationPreferences";
CREATE UNIQUE INDEX "NotificationPreferences_shop_key" ON "NotificationPreferences"("shop");
CREATE UNIQUE INDEX "NotificationPreferences_accountId_key" ON "NotificationPreferences"("accountId");

CREATE TABLE "new_NotificationDelivery" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shop" TEXT,
  "accountId" TEXT,
  "channelConnectionId" TEXT,
  "channel" TEXT NOT NULL DEFAULT 'email',
  "notificationType" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "alertKey" TEXT,
  "periodDays" INTEGER,
  "deduplicationKey" TEXT NOT NULL,
  "subject" TEXT,
  "payloadJson" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "providerMessageId" TEXT,
  "errorMessage" TEXT,
  "scheduledFor" DATETIME,
  "sentAt" DATETIME,
  "failedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "NotificationDelivery_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "NotificationDelivery_channelConnectionId_accountId_fkey" FOREIGN KEY ("channelConnectionId", "accountId") REFERENCES "ChannelConnection" ("id", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_NotificationDelivery" ("id","shop","channel","notificationType","recipient","alertKey","periodDays","deduplicationKey","subject","payloadJson","status","providerMessageId","errorMessage","scheduledFor","sentAt","failedAt","createdAt","updatedAt")
SELECT "id","shop","channel","notificationType","recipient","alertKey","periodDays","deduplicationKey","subject","payloadJson","status","providerMessageId","errorMessage","scheduledFor","sentAt","failedAt","createdAt","updatedAt" FROM "NotificationDelivery";
DROP TABLE "NotificationDelivery";
ALTER TABLE "new_NotificationDelivery" RENAME TO "NotificationDelivery";
CREATE UNIQUE INDEX "NotificationDelivery_deduplicationKey_key" ON "NotificationDelivery"("deduplicationKey");
CREATE INDEX "NotificationDelivery_shop_notificationType_createdAt_idx" ON "NotificationDelivery"("shop", "notificationType", "createdAt");
CREATE INDEX "NotificationDelivery_shop_status_idx" ON "NotificationDelivery"("shop", "status");
CREATE INDEX "NotificationDelivery_scheduledFor_status_idx" ON "NotificationDelivery"("scheduledFor", "status");
CREATE INDEX "NotificationDelivery_accountId_notificationType_createdAt_idx" ON "NotificationDelivery"("accountId", "notificationType", "createdAt");
CREATE INDEX "NotificationDelivery_channelConnectionId_idx" ON "NotificationDelivery"("channelConnectionId");
