-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProfitMonitorAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "channelConnectionId" TEXT,
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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProfitMonitorAlert_channelConnectionId_fkey" FOREIGN KEY ("channelConnectionId") REFERENCES "ChannelConnection" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ProfitMonitorAlert" ("acknowledgedAt", "actionLabel", "alertKey", "alertType", "businessAction", "category", "createdAt", "description", "economicKind", "effort", "estimatedMinutes", "firstSeenAt", "id", "isRead", "lastSeenAt", "metadataJson", "monthlyImpact", "periodDays", "priority", "productId", "productTitle", "recommendedModule", "resolvedAt", "route", "severity", "shop", "status", "title", "updatedAt") SELECT "acknowledgedAt", "actionLabel", "alertKey", "alertType", "businessAction", "category", "createdAt", "description", "economicKind", "effort", "estimatedMinutes", "firstSeenAt", "id", "isRead", "lastSeenAt", "metadataJson", "monthlyImpact", "periodDays", "priority", "productId", "productTitle", "recommendedModule", "resolvedAt", "route", "severity", "shop", "status", "title", "updatedAt" FROM "ProfitMonitorAlert";
DROP TABLE "ProfitMonitorAlert";
ALTER TABLE "new_ProfitMonitorAlert" RENAME TO "ProfitMonitorAlert";
CREATE INDEX "ProfitMonitorAlert_shop_periodDays_status_idx" ON "ProfitMonitorAlert"("shop", "periodDays", "status");
CREATE INDEX "ProfitMonitorAlert_channelConnectionId_idx" ON "ProfitMonitorAlert"("channelConnectionId");
CREATE UNIQUE INDEX "ProfitMonitorAlert_shop_periodDays_alertKey_key" ON "ProfitMonitorAlert"("shop", "periodDays", "alertKey");
CREATE TABLE "new_ProfitMonitorSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "channelConnectionId" TEXT,
    "periodDays" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProfitMonitorSnapshot_channelConnectionId_fkey" FOREIGN KEY ("channelConnectionId") REFERENCES "ChannelConnection" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ProfitMonitorSnapshot" ("capturedAt", "fingerprint", "id", "payloadJson", "periodDays", "shop") SELECT "capturedAt", "fingerprint", "id", "payloadJson", "periodDays", "shop" FROM "ProfitMonitorSnapshot";
DROP TABLE "ProfitMonitorSnapshot";
ALTER TABLE "new_ProfitMonitorSnapshot" RENAME TO "ProfitMonitorSnapshot";
CREATE INDEX "ProfitMonitorSnapshot_shop_periodDays_capturedAt_idx" ON "ProfitMonitorSnapshot"("shop", "periodDays", "capturedAt");
CREATE INDEX "ProfitMonitorSnapshot_channelConnectionId_idx" ON "ProfitMonitorSnapshot"("channelConnectionId");
CREATE UNIQUE INDEX "ProfitMonitorSnapshot_shop_periodDays_fingerprint_key" ON "ProfitMonitorSnapshot"("shop", "periodDays", "fingerprint");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
