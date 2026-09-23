CREATE TABLE "AccountAiUsageReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "legacyShadowApplied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccountAiUsageReservation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AccountAiUsageReservation_accountId_periodKey_idx" ON "AccountAiUsageReservation"("accountId", "periodKey");
