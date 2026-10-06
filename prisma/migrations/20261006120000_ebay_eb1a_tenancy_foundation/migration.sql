CREATE TABLE "EbaySellerAuthorization" (
  "channelConnectionId" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "encryptedRefreshToken" BLOB NOT NULL,
  "encryptionProvider" TEXT NOT NULL,
  "encryptionKeyVersion" TEXT NOT NULL,
  "credentialFingerprint" TEXT NOT NULL,
  "grantedScopesJson" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "authorizationVersion" TEXT NOT NULL,
  "grantedAt" DATETIME NOT NULL,
  "validatedAt" DATETIME,
  "refreshTokenExpiresAt" DATETIME,
  "reauthRequiredAt" DATETIME,
  "revokedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "EbaySellerAuthorization_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EbaySellerAuthorization_channelConnectionId_accountId_fkey" FOREIGN KEY ("channelConnectionId", "accountId") REFERENCES "ChannelConnection" ("id", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EbaySellerAuthorization_status_check" CHECK ("status" IN ('ACTIVE','REAUTH_REQUIRED','REVOKED')),
  CONSTRAINT "EbaySellerAuthorization_secret_check" CHECK (
    length("encryptedRefreshToken") > 0 AND
    length(trim("encryptionProvider")) > 0 AND
    length(trim("encryptionKeyVersion")) > 0 AND
    length(trim("credentialFingerprint")) > 0 AND
    length(trim("authorizationVersion")) > 0
  ),
  CONSTRAINT "EbaySellerAuthorization_scopes_check" CHECK (
    json_valid("grantedScopesJson") AND json_type("grantedScopesJson") = 'array' AND json_array_length("grantedScopesJson") > 0
  ),
  CONSTRAINT "EbaySellerAuthorization_lifecycle_check" CHECK (
    ("status" = 'ACTIVE' AND "reauthRequiredAt" IS NULL AND "revokedAt" IS NULL) OR
    ("status" = 'REAUTH_REQUIRED' AND "reauthRequiredAt" IS NOT NULL AND "revokedAt" IS NULL) OR
    ("status" = 'REVOKED' AND "revokedAt" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "EbaySellerAuthorization_channelConnectionId_accountId_key"
  ON "EbaySellerAuthorization"("channelConnectionId", "accountId");
CREATE UNIQUE INDEX "EbaySellerAuthorization_channelConnectionId_authorizationVersion_key"
  ON "EbaySellerAuthorization"("channelConnectionId", "authorizationVersion");
CREATE INDEX "EbaySellerAuthorization_accountId_status_idx"
  ON "EbaySellerAuthorization"("accountId", "status");

CREATE TRIGGER "EbaySellerAuthorization_validate_insert" BEFORE INSERT ON "EbaySellerAuthorization" BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM "ChannelConnection" c JOIN "Account" a ON a.id=c.accountId
    WHERE c.id=NEW.channelConnectionId AND c.accountId=NEW.accountId AND
      c.channel='EBAY' AND c.status='ACTIVE' AND a.status='ACTIVE'
  ) THEN RAISE(ABORT,'eBay authorization owner invalid') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM "EbaySellerAuthorization" x WHERE x.channelConnectionId=NEW.channelConnectionId
  ) THEN RAISE(ABORT,'eBay authorization immutable identity collision') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.grantedScopesJson) scope
    WHERE scope.type <> 'text' OR length(trim(scope.value)) = 0 OR scope.value <> trim(scope.value)
  ) OR EXISTS (
    SELECT 1 FROM json_each(NEW.grantedScopesJson) left_scope
    JOIN json_each(NEW.grantedScopesJson) right_scope
      ON CAST(left_scope.key AS INTEGER) < CAST(right_scope.key AS INTEGER)
    WHERE left_scope.value >= right_scope.value
  ) THEN RAISE(ABORT,'eBay authorization scopes must be canonical') END;
END;

CREATE TRIGGER "EbaySellerAuthorization_validate_update" BEFORE UPDATE ON "EbaySellerAuthorization" BEGIN
  SELECT CASE WHEN NEW.channelConnectionId<>OLD.channelConnectionId OR NEW.accountId<>OLD.accountId OR
    NEW.createdAt<>OLD.createdAt THEN RAISE(ABORT,'eBay authorization ownership immutable') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM "ChannelConnection" c JOIN "Account" a ON a.id=c.accountId
    WHERE c.id=NEW.channelConnectionId AND c.accountId=NEW.accountId AND c.channel='EBAY' AND a.status='ACTIVE'
  ) THEN RAISE(ABORT,'eBay authorization owner invalid') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.grantedScopesJson) scope
    WHERE scope.type <> 'text' OR length(trim(scope.value)) = 0 OR scope.value <> trim(scope.value)
  ) OR EXISTS (
    SELECT 1 FROM json_each(NEW.grantedScopesJson) left_scope
    JOIN json_each(NEW.grantedScopesJson) right_scope
      ON CAST(left_scope.key AS INTEGER) < CAST(right_scope.key AS INTEGER)
    WHERE left_scope.value >= right_scope.value
  ) THEN RAISE(ABORT,'eBay authorization scopes must be canonical') END;
END;

CREATE TRIGGER "EbaySellerAuthorization_no_delete" BEFORE DELETE ON "EbaySellerAuthorization" BEGIN
  SELECT RAISE(ABORT,'eBay authorization history cannot be deleted');
END;

CREATE TRIGGER "ChannelConnection_preserve_ebay_authorization_owner"
BEFORE UPDATE OF "channel", "accountId" ON "ChannelConnection"
WHEN EXISTS (
  SELECT 1 FROM "EbaySellerAuthorization" authorization
  WHERE authorization.channelConnectionId=OLD.id AND authorization.accountId=OLD.accountId
) AND (NEW.channel <> 'EBAY' OR NEW.accountId <> OLD.accountId)
BEGIN
  SELECT RAISE(ABORT,'eBay authorization channel ownership cannot change');
END;
