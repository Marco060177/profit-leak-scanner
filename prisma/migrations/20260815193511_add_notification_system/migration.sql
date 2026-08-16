-- CreateTable
CREATE TABLE "NotificationPreferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
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
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
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
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreferences_shop_key" ON "NotificationPreferences"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_deduplicationKey_key" ON "NotificationDelivery"("deduplicationKey");

-- CreateIndex
CREATE INDEX "NotificationDelivery_shop_notificationType_createdAt_idx" ON "NotificationDelivery"("shop", "notificationType", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_shop_status_idx" ON "NotificationDelivery"("shop", "status");

-- CreateIndex
CREATE INDEX "NotificationDelivery_scheduledFor_status_idx" ON "NotificationDelivery"("scheduledFor", "status");
