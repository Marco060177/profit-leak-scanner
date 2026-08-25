-- CreateTable
CREATE TABLE "ProfitImpactAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
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
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProfitImpactMeasurement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actionId" TEXT NOT NULL,
    "measurementType" TEXT NOT NULL,
    "windowStart" DATETIME NOT NULL,
    "windowEnd" DATETIME NOT NULL,
    "observedDays" INTEGER NOT NULL,
    "revenue" REAL NOT NULL,
    "economicProfit" REAL NOT NULL,
    "economicMarginPct" REAL NOT NULL,
    "units" REAL NOT NULL,
    "cogs" REAL NOT NULL,
    "discounts" REAL NOT NULL,
    "refunds" REAL NOT NULL,
    "averageUnitRevenue" REAL,
    "averageUnitCost" REAL,
    "discountRatePct" REAL,
    "measuredProfitChange" REAL,
    "measuredMarginChange" REAL,
    "measuredRevenueChange" REAL,
    "measuredUnitsChange" REAL,
    "measuredCogsChange" REAL,
    "estimatedAttributableImpact" REAL,
    "attributionMethod" TEXT,
    "dataConfidenceScore" INTEGER NOT NULL DEFAULT 0,
    "attributionConfidenceScore" INTEGER,
    "confidenceLevel" TEXT NOT NULL DEFAULT 'LOW',
    "confidenceReasonsJson" TEXT,
    "sourceCompletenessJson" TEXT,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProfitImpactMeasurement_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "ProfitImpactAction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProfitImpactEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actionId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProfitImpactEvent_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "ProfitImpactAction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProfitImpactAction_shop_status_createdAt_idx" ON "ProfitImpactAction"("shop", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ProfitImpactAction_shop_productId_status_idx" ON "ProfitImpactAction"("shop", "productId", "status");

-- CreateIndex
CREATE INDEX "ProfitImpactAction_shop_sourceAlertKey_idx" ON "ProfitImpactAction"("shop", "sourceAlertKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProfitImpactAction_shop_idempotencyKey_key" ON "ProfitImpactAction"("shop", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ProfitImpactMeasurement_actionId_capturedAt_idx" ON "ProfitImpactMeasurement"("actionId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProfitImpactMeasurement_actionId_measurementType_key" ON "ProfitImpactMeasurement"("actionId", "measurementType");

-- CreateIndex
CREATE INDEX "ProfitImpactEvent_actionId_createdAt_idx" ON "ProfitImpactEvent"("actionId", "createdAt");
