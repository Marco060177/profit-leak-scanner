CREATE TABLE "PartnerAccessToken" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "partnerId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" DATETIME NOT NULL,
  "consumedAt" DATETIME,
  "revokedAt" DATETIME,
  CONSTRAINT "PartnerAccessToken_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "PartnerAccessToken_tokenHash_key" ON "PartnerAccessToken"("tokenHash");
CREATE INDEX "PartnerAccessToken_partnerId_expiresAt_idx" ON "PartnerAccessToken"("partnerId", "expiresAt");

CREATE TABLE "PartnerSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "partnerId" TEXT NOT NULL,
  "sessionHash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" DATETIME NOT NULL,
  "revokedAt" DATETIME,
  CONSTRAINT "PartnerSession_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "PartnerSession_sessionHash_key" ON "PartnerSession"("sessionHash");
CREATE INDEX "PartnerSession_partnerId_expiresAt_idx" ON "PartnerSession"("partnerId", "expiresAt");

CREATE TRIGGER "PartnerAccessToken_identity_immutable" BEFORE UPDATE ON "PartnerAccessToken"
WHEN NEW."id" IS NOT OLD."id" OR NEW."partnerId" IS NOT OLD."partnerId" OR NEW."tokenHash" IS NOT OLD."tokenHash" OR NEW."createdAt" IS NOT OLD."createdAt" OR NEW."expiresAt" IS NOT OLD."expiresAt"
BEGIN SELECT RAISE(ABORT, 'Partner access token identity is immutable'); END;
CREATE TRIGGER "PartnerAccessToken_no_delete" BEFORE DELETE ON "PartnerAccessToken"
BEGIN SELECT RAISE(ABORT, 'Partner access tokens are audit records'); END;
CREATE TRIGGER "PartnerSession_identity_immutable" BEFORE UPDATE ON "PartnerSession"
WHEN NEW."id" IS NOT OLD."id" OR NEW."partnerId" IS NOT OLD."partnerId" OR NEW."sessionHash" IS NOT OLD."sessionHash" OR NEW."createdAt" IS NOT OLD."createdAt" OR NEW."expiresAt" IS NOT OLD."expiresAt"
BEGIN SELECT RAISE(ABORT, 'Partner session identity is immutable'); END;
CREATE TRIGGER "PartnerSession_no_delete" BEFORE DELETE ON "PartnerSession"
BEGIN SELECT RAISE(ABORT, 'Partner sessions are audit records'); END;
