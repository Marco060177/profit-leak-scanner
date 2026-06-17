-- CreateTable
CREATE TABLE "ProfitAssumptions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "monthlyAds" REAL NOT NULL DEFAULT 0,
    "monthlyShipping" REAL NOT NULL DEFAULT 0,
    "monthlyOperating" REAL NOT NULL DEFAULT 0,
    "paymentFeePct" REAL NOT NULL DEFAULT 0,
    "transactionFeePct" REAL NOT NULL DEFAULT 0,
    "taxReservePct" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ProfitAssumptions_shop_key" ON "ProfitAssumptions"("shop");
