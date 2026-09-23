-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProfitImpactAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "channelConnectionId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "measuringProductKey" TEXT,
    "measurementClaimType" TEXT,
    "measurementClaimedAt" DATETIME,
    "actionType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACCEPTED',
    "sourceModule" TEXT NOT NULL,
    "sourceAlertKey" TEXT,
    "productId" TEXT,
    "productTitle" TEXT,
    "title" TEXT NOT NULL,
    "changeDescription" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "measurementWindowDays" INTEGER NOT NULL DEFAULT 14,
    "appliedAt" DATETIME,
    "measurementStart" DATETIME,
    "measurementEnd" DATETIME,
    "completedAt" DATETIME,
    "cancelledAt" DATETIME,
    "previousValue" REAL,
    "appliedValue" REAL,
    "targetMetric" TEXT,
    "targetValue" REAL,
    "notes" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProfitImpactAction_channelConnectionId_fkey" FOREIGN KEY ("channelConnectionId") REFERENCES "ChannelConnection" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ProfitImpactAction" ("actionType", "appliedAt", "appliedValue", "cancelledAt", "changeDescription", "completedAt", "createdAt", "currencyCode", "id", "idempotencyKey", "measurementClaimType", "measurementClaimedAt", "measurementEnd", "measurementStart", "measurementWindowDays", "measuringProductKey", "metadataJson", "notes", "previousValue", "productId", "productTitle", "shop", "sourceAlertKey", "sourceModule", "status", "targetMetric", "targetValue", "title", "updatedAt") SELECT "actionType", "appliedAt", "appliedValue", "cancelledAt", "changeDescription", "completedAt", "createdAt", "currencyCode", "id", "idempotencyKey", "measurementClaimType", "measurementClaimedAt", "measurementEnd", "measurementStart", "measurementWindowDays", "measuringProductKey", "metadataJson", "notes", "previousValue", "productId", "productTitle", "shop", "sourceAlertKey", "sourceModule", "status", "targetMetric", "targetValue", "title", "updatedAt" FROM "ProfitImpactAction";
DROP TABLE "ProfitImpactAction";
ALTER TABLE "new_ProfitImpactAction" RENAME TO "ProfitImpactAction";
CREATE INDEX "ProfitImpactAction_shop_status_createdAt_idx" ON "ProfitImpactAction"("shop", "status", "createdAt");
CREATE INDEX "ProfitImpactAction_shop_productId_status_idx" ON "ProfitImpactAction"("shop", "productId", "status");
CREATE INDEX "ProfitImpactAction_shop_sourceAlertKey_idx" ON "ProfitImpactAction"("shop", "sourceAlertKey");
CREATE INDEX "ProfitImpactAction_channelConnectionId_idx" ON "ProfitImpactAction"("channelConnectionId");
CREATE UNIQUE INDEX "ProfitImpactAction_shop_idempotencyKey_key" ON "ProfitImpactAction"("shop", "idempotencyKey");
CREATE UNIQUE INDEX "ProfitImpactAction_shop_measuringProductKey_key" ON "ProfitImpactAction"("shop", "measuringProductKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
