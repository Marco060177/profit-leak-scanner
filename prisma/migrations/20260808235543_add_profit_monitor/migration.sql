-- CreateTable
CREATE TABLE "ProfitMonitorSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "periodDays" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProfitMonitorAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "periodDays" INTEGER NOT NULL,
    "alertKey" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "productId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "severity" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "monthlyImpact" REAL NOT NULL DEFAULT 0,
    "economicKind" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "actionLabel" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "businessAction" TEXT NOT NULL,
    "effort" TEXT NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 0,
    "recommendedModule" TEXT NOT NULL,
    "productTitle" TEXT,
    "metadataJson" TEXT,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" DATETIME,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProfitMonitorAlertEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "alertId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProfitMonitorAlertEvent_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "ProfitMonitorAlert" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProfitMonitorSnapshot_shop_periodDays_capturedAt_idx" ON "ProfitMonitorSnapshot"("shop", "periodDays", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProfitMonitorSnapshot_shop_periodDays_fingerprint_key" ON "ProfitMonitorSnapshot"("shop", "periodDays", "fingerprint");

-- CreateIndex
CREATE INDEX "ProfitMonitorAlert_shop_periodDays_status_idx" ON "ProfitMonitorAlert"("shop", "periodDays", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProfitMonitorAlert_shop_periodDays_alertKey_key" ON "ProfitMonitorAlert"("shop", "periodDays", "alertKey");

-- CreateIndex
CREATE INDEX "ProfitMonitorAlertEvent_alertId_createdAt_idx" ON "ProfitMonitorAlertEvent"("alertId", "createdAt");
