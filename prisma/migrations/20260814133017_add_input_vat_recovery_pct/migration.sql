-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StoreTaxProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "regime" TEXT NOT NULL DEFAULT 'UNCONFIGURED',
    "defaultVatRatePct" REAL NOT NULL DEFAULT 22,
    "pricesIncludeVat" BOOLEAN NOT NULL DEFAULT true,
    "costsIncludeVat" BOOLEAN NOT NULL DEFAULT true,
    "recoverInputVat" BOOLEAN NOT NULL DEFAULT true,
    "inputVatRecoveryPct" REAL NOT NULL DEFAULT 100,
    "shippingIncludeVat" BOOLEAN NOT NULL DEFAULT true,
    "shippingVatRatePct" REAL NOT NULL DEFAULT 22,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_StoreTaxProfile" ("costsIncludeVat", "countryCode", "createdAt", "defaultVatRatePct", "id", "pricesIncludeVat", "recoverInputVat", "regime", "shippingIncludeVat", "shippingVatRatePct", "shop", "updatedAt") SELECT "costsIncludeVat", "countryCode", "createdAt", "defaultVatRatePct", "id", "pricesIncludeVat", "recoverInputVat", "regime", "shippingIncludeVat", "shippingVatRatePct", "shop", "updatedAt" FROM "StoreTaxProfile";
DROP TABLE "StoreTaxProfile";
ALTER TABLE "new_StoreTaxProfile" RENAME TO "StoreTaxProfile";
CREATE UNIQUE INDEX "StoreTaxProfile_shop_key" ON "StoreTaxProfile"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
