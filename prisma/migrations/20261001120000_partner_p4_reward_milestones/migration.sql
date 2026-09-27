CREATE TABLE "PartnerRewardMilestone" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "partnerId" TEXT NOT NULL,
  "tierKey" TEXT NOT NULL,
  "qualifiedCustomerThreshold" INTEGER NOT NULL,
  "cumulativeRewardAtoms" BIGINT NOT NULL,
  "amountScale" INTEGER NOT NULL DEFAULT 2,
  "currencyCode" TEXT NOT NULL DEFAULT 'USD',
  "unlockedAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerRewardMilestone_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "PartnerRewardMilestone_partnerId_tierKey_key" ON "PartnerRewardMilestone"("partnerId", "tierKey");
CREATE INDEX "PartnerRewardMilestone_partnerId_qualifiedCustomerThreshold_idx" ON "PartnerRewardMilestone"("partnerId", "qualifiedCustomerThreshold");

CREATE TRIGGER "PartnerRewardMilestone_no_update"
BEFORE UPDATE ON "PartnerRewardMilestone"
BEGIN
  SELECT RAISE(ABORT, 'PartnerRewardMilestone is immutable');
END;

CREATE TRIGGER "PartnerRewardMilestone_no_delete"
BEFORE DELETE ON "PartnerRewardMilestone"
BEGIN
  SELECT RAISE(ABORT, 'PartnerRewardMilestone is immutable');
END;
