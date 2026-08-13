-- CreateTable
CREATE TABLE "StoreTaxProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "regime" TEXT NOT NULL DEFAULT 'UNCONFIGURED',
    "defaultVatRatePct" REAL NOT NULL DEFAULT 22,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreTaxProfile_shop_key" ON "StoreTaxProfile"("shop");
