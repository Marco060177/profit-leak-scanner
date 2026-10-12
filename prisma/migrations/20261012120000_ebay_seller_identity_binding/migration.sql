CREATE TABLE "EbaySellerIdentityBinding" (
  "channelConnectionId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "hmacKeyVersion" TEXT NOT NULL,
  "userLookupToken" TEXT NOT NULL,
  "verifiedSource" TEXT NOT NULL,
  "verifiedAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  PRIMARY KEY ("channelConnectionId", "hmacKeyVersion"),
  CONSTRAINT "EbaySellerIdentityBinding_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EbaySellerIdentityBinding_channelConnectionId_accountId_fkey"
    FOREIGN KEY ("channelConnectionId", "accountId") REFERENCES "ChannelConnection" ("id", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EbaySellerIdentityBinding_authorization_fkey"
    FOREIGN KEY ("channelConnectionId", "accountId") REFERENCES "EbaySellerAuthorization" ("channelConnectionId", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "EbaySellerIdentityBinding_hmacKeyVersion_userLookupToken_key"
  ON "EbaySellerIdentityBinding"("hmacKeyVersion", "userLookupToken");
CREATE INDEX "EbaySellerIdentityBinding_accountId_channelConnectionId_idx"
  ON "EbaySellerIdentityBinding"("accountId", "channelConnectionId");

CREATE TRIGGER "EbaySellerIdentityBinding_insert_guard"
BEFORE INSERT ON "EbaySellerIdentityBinding"
WHEN
  length(NEW."hmacKeyVersion") < 1 OR length(NEW."hmacKeyVersion") > 64 OR
  NEW."hmacKeyVersion" GLOB '*[^A-Za-z0-9._-]*' OR
  length(NEW."userLookupToken") <> 64 OR lower(NEW."userLookupToken") GLOB '*[^0-9a-f]*' OR
  NEW."verifiedSource" <> 'EBAY_COMMERCE_IDENTITY_GET_USER_V1' OR
  NOT EXISTS (
    SELECT 1 FROM "ChannelConnection" c
    JOIN "Account" a ON a."id" = c."accountId"
    JOIN "EbaySellerAuthorization" e ON e."channelConnectionId" = c."id" AND e."accountId" = c."accountId"
    WHERE c."id" = NEW."channelConnectionId" AND c."accountId" = NEW."accountId"
      AND c."channel" = 'EBAY' AND c."status" = 'ACTIVE' AND a."status" = 'ACTIVE' AND e."status" = 'ACTIVE'
  )
BEGIN
  SELECT RAISE(ABORT, 'invalid eBay seller identity binding');
END;

CREATE TRIGGER "EbaySellerIdentityBinding_identity_immutable"
BEFORE UPDATE ON "EbaySellerIdentityBinding"
WHEN
  NEW."channelConnectionId" IS NOT OLD."channelConnectionId" OR
  NEW."accountId" IS NOT OLD."accountId" OR
  NEW."hmacKeyVersion" IS NOT OLD."hmacKeyVersion" OR
  NEW."userLookupToken" IS NOT OLD."userLookupToken" OR
  NEW."verifiedSource" IS NOT OLD."verifiedSource" OR
  NEW."createdAt" IS NOT OLD."createdAt"
BEGIN
  SELECT RAISE(ABORT, 'eBay seller identity binding is immutable');
END;

CREATE TRIGGER "EbaySellerIdentityBinding_no_delete"
BEFORE DELETE ON "EbaySellerIdentityBinding"
BEGIN
  SELECT RAISE(ABORT, 'eBay seller identity binding cannot be deleted');
END;
