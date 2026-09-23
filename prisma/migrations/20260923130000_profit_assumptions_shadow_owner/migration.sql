-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProfitAssumptions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "channelConnectionId" TEXT,
    "monthlyAds" REAL NOT NULL DEFAULT 0,
    "monthlyShipping" REAL NOT NULL DEFAULT 0,
    "monthlyOperating" REAL NOT NULL DEFAULT 0,
    "paymentFeePct" REAL NOT NULL DEFAULT 0,
    "transactionFeePct" REAL NOT NULL DEFAULT 0,
    "taxReservePct" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProfitAssumptions_channelConnectionId_fkey" FOREIGN KEY ("channelConnectionId") REFERENCES "ChannelConnection" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ProfitAssumptions" ("createdAt", "id", "monthlyAds", "monthlyOperating", "monthlyShipping", "paymentFeePct", "shop", "taxReservePct", "transactionFeePct", "updatedAt") SELECT "createdAt", "id", "monthlyAds", "monthlyOperating", "monthlyShipping", "paymentFeePct", "shop", "taxReservePct", "transactionFeePct", "updatedAt" FROM "ProfitAssumptions";
DROP TABLE "ProfitAssumptions";
ALTER TABLE "new_ProfitAssumptions" RENAME TO "ProfitAssumptions";
CREATE UNIQUE INDEX "ProfitAssumptions_shop_key" ON "ProfitAssumptions"("shop");
CREATE INDEX "ProfitAssumptions_channelConnectionId_idx" ON "ProfitAssumptions"("channelConnectionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
