-- Add the runtime coordination columns that were introduced after the
-- Profit Impact foundation migration had already been deployed.
ALTER TABLE "ProfitImpactAction" ADD COLUMN "measuringProductKey" TEXT;
ALTER TABLE "ProfitImpactAction" ADD COLUMN "measurementClaimType" TEXT;
ALTER TABLE "ProfitImpactAction" ADD COLUMN "measurementClaimedAt" DATETIME;

-- SQLite permits multiple NULL values in a unique index. This enforces one
-- active measuring action per shop/product while leaving historical rows null.
CREATE UNIQUE INDEX "ProfitImpactAction_shop_measuringProductKey_key"
ON "ProfitImpactAction"("shop", "measuringProductKey");
