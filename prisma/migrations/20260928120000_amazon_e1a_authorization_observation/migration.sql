PRAGMA foreign_keys=OFF;
PRAGMA legacy_alter_table=ON;

CREATE TABLE "AmazonSellerAuthorization" (
  "channelConnectionId" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "encryptedRefreshToken" BLOB NOT NULL,
  "encryptionProvider" TEXT NOT NULL,
  "encryptionKeyVersion" TEXT NOT NULL,
  "credentialFingerprint" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "authorizationVersion" TEXT NOT NULL,
  "grantedAt" DATETIME NOT NULL,
  "validatedAt" DATETIME,
  "renewalDueAt" DATETIME,
  "revokedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AmazonSellerAuthorization_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AmazonSellerAuthorization_channelConnectionId_accountId_fkey" FOREIGN KEY ("channelConnectionId", "accountId") REFERENCES "ChannelConnection" ("id", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AmazonSellerAuthorization_status_check" CHECK ("status" IN ('ACTIVE','REAUTH_REQUIRED','REVOKED')),
  CONSTRAINT "AmazonSellerAuthorization_secret_check" CHECK (length("encryptedRefreshToken") > 0 AND length(trim("encryptionProvider")) > 0 AND length(trim("encryptionKeyVersion")) > 0 AND length(trim("credentialFingerprint")) > 0 AND length(trim("authorizationVersion")) > 0),
  CONSTRAINT "AmazonSellerAuthorization_revocation_check" CHECK (("status" = 'REVOKED' AND "revokedAt" IS NOT NULL) OR ("status" <> 'REVOKED' AND "revokedAt" IS NULL))
);

CREATE UNIQUE INDEX "AmazonSellerAuthorization_channelConnectionId_accountId_key" ON "AmazonSellerAuthorization"("channelConnectionId", "accountId");
CREATE UNIQUE INDEX "AmazonSellerAuthorization_channelConnectionId_authorizationVersion_key" ON "AmazonSellerAuthorization"("channelConnectionId", "authorizationVersion");
CREATE INDEX "AmazonSellerAuthorization_accountId_status_idx" ON "AmazonSellerAuthorization"("accountId", "status");

CREATE TRIGGER "AmazonSellerAuthorization_validate_insert" BEFORE INSERT ON "AmazonSellerAuthorization" BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM "ChannelConnection" c JOIN "Account" a ON a.id=c.accountId
    WHERE c.id=NEW.channelConnectionId AND c.accountId=NEW.accountId AND c.channel='AMAZON' AND c.status='ACTIVE' AND a.status='ACTIVE'
  ) THEN RAISE(ABORT,'Amazon authorization owner invalid') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM "AmazonSellerAuthorization" x WHERE x.channelConnectionId=NEW.channelConnectionId)
    THEN RAISE(ABORT,'Amazon authorization immutable identity collision') END;
END;

CREATE TRIGGER "AmazonSellerAuthorization_validate_update" BEFORE UPDATE ON "AmazonSellerAuthorization" BEGIN
  SELECT CASE WHEN NEW.channelConnectionId<>OLD.channelConnectionId OR NEW.accountId<>OLD.accountId OR
    NEW.createdAt<>OLD.createdAt THEN RAISE(ABORT,'Amazon authorization ownership immutable') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM "ChannelConnection" c JOIN "Account" a ON a.id=c.accountId
    WHERE c.id=NEW.channelConnectionId AND c.accountId=NEW.accountId AND c.channel='AMAZON' AND a.status='ACTIVE'
  ) THEN RAISE(ABORT,'Amazon authorization owner invalid') END;
END;

CREATE TRIGGER "AmazonSellerAuthorization_no_delete" BEFORE DELETE ON "AmazonSellerAuthorization" BEGIN
  SELECT RAISE(ABORT,'Amazon authorization history cannot be deleted');
END;

CREATE TABLE "SourceObservation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "channelConnectionId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "sliceId" TEXT NOT NULL,
  "rawSourceRecordId" TEXT NOT NULL,
  "sourceSystem" TEXT NOT NULL,
  "sourceEntityType" TEXT NOT NULL,
  "sourceEntityId" TEXT NOT NULL,
  "observedAt" DATETIME NOT NULL,
  "authorizationVersion" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SourceObservation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SourceObservation_channel_fkey" FOREIGN KEY ("channelConnectionId", "accountId") REFERENCES "ChannelConnection" ("id", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SourceObservation_run_fkey" FOREIGN KEY ("runId", "accountId", "channelConnectionId") REFERENCES "SyncRun" ("id", "accountId", "channelConnectionId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SourceObservation_slice_fkey" FOREIGN KEY ("sliceId", "accountId", "channelConnectionId", "runId") REFERENCES "SyncSlice" ("id", "accountId", "channelConnectionId", "runId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SourceObservation_raw_fkey" FOREIGN KEY ("rawSourceRecordId", "accountId", "channelConnectionId") REFERENCES "RawSourceRecord" ("id", "accountId", "channelConnectionId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SourceObservation_identity_check" CHECK (length(trim("sourceSystem")) > 0 AND length(trim("sourceEntityType")) > 0 AND length(trim("sourceEntityId")) > 0 AND length(trim("authorizationVersion")) > 0)
);

CREATE UNIQUE INDEX "SourceObservation_sliceId_sourceSystem_sourceEntityType_sourceEntityId_rawSourceRecordId_key"
  ON "SourceObservation"("sliceId", "sourceSystem", "sourceEntityType", "sourceEntityId", "rawSourceRecordId");
CREATE UNIQUE INDEX "SourceObservation_id_accountId_channelConnectionId_runId_rawSourceRecordId_key"
  ON "SourceObservation"("id", "accountId", "channelConnectionId", "runId", "rawSourceRecordId");
CREATE INDEX "SourceObservation_account_channel_entity_idx"
  ON "SourceObservation"("accountId", "channelConnectionId", "sourceSystem", "sourceEntityType", "sourceEntityId");
CREATE INDEX "SourceObservation_run_slice_idx" ON "SourceObservation"("runId", "sliceId");

CREATE TRIGGER "SourceObservation_validate_insert" BEFORE INSERT ON "SourceObservation" BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM "RawSourceRecord" r WHERE r.id=NEW.rawSourceRecordId AND r.accountId=NEW.accountId AND
      r.channelConnectionId=NEW.channelConnectionId AND r.sourceSystem=NEW.sourceSystem AND
      r.sourceEntityType=NEW.sourceEntityType AND r.sourceEntityId=NEW.sourceEntityId
  ) THEN RAISE(ABORT,'Source observation raw identity mismatch') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM "SyncSlice" s JOIN "SyncRun" r ON r.id=s.runId
    WHERE s.id=NEW.sliceId AND s.runId=NEW.runId AND s.accountId=NEW.accountId AND
      s.channelConnectionId=NEW.channelConnectionId AND s.authorizationVersion=NEW.authorizationVersion AND
      r.authorizationVersion=NEW.authorizationVersion AND s.stream=r.stream
  ) THEN RAISE(ABORT,'Source observation run/slice mismatch') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM "CoreChannelAuthorization" a WHERE a.channelConnectionId=NEW.channelConnectionId AND
      a.accountId=NEW.accountId AND a.authorizationVersion=NEW.authorizationVersion
  ) THEN RAISE(ABORT,'Source observation authorization stale') END;
END;

CREATE TRIGGER "SourceObservation_no_update" BEFORE UPDATE ON "SourceObservation" BEGIN
  SELECT RAISE(ABORT,'Source observation immutable');
END;
CREATE TRIGGER "SourceObservation_no_delete" BEFORE DELETE ON "SourceObservation" BEGIN
  SELECT RAISE(ABORT,'Source observation immutable');
END;

DROP TRIGGER "SyncSliceEvidence_no_update";
DROP TRIGGER "SyncSliceEvidence_no_delete";
DROP TRIGGER "SyncSliceEvidence_only_leased_insert";
ALTER TABLE "SyncSliceEvidence" RENAME TO "SyncSliceEvidence_e1a_legacy";
CREATE TABLE "SyncSliceEvidence" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "channelConnectionId" TEXT NOT NULL,
  "sliceId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "rawSourceRecordId" TEXT NOT NULL,
  "normalizationRunId" TEXT NOT NULL,
  "sourceObservationId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SyncSliceEvidence_slice_fkey" FOREIGN KEY ("sliceId", "accountId", "channelConnectionId", "runId") REFERENCES "SyncSlice" ("id", "accountId", "channelConnectionId", "runId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SyncSliceEvidence_raw_fkey" FOREIGN KEY ("rawSourceRecordId", "accountId", "channelConnectionId") REFERENCES "RawSourceRecord" ("id", "accountId", "channelConnectionId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SyncSliceEvidence_normalization_fkey" FOREIGN KEY ("normalizationRunId", "accountId", "channelConnectionId", "rawSourceRecordId") REFERENCES "NormalizationRun" ("id", "accountId", "channelConnectionId", "rawSourceRecordId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SyncSliceEvidence_observation_fkey" FOREIGN KEY ("sourceObservationId") REFERENCES "SourceObservation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "SyncSliceEvidence" ("id","accountId","channelConnectionId","sliceId","runId","rawSourceRecordId","normalizationRunId","createdAt")
  SELECT "id","accountId","channelConnectionId","sliceId","runId","rawSourceRecordId","normalizationRunId","createdAt" FROM "SyncSliceEvidence_e1a_legacy";
DROP TABLE "SyncSliceEvidence_e1a_legacy";
CREATE UNIQUE INDEX "SyncSliceEvidence_sliceId_rawSourceRecordId_key" ON "SyncSliceEvidence"("sliceId", "rawSourceRecordId");
CREATE UNIQUE INDEX "SyncSliceEvidence_id_accountId_channelConnectionId_rawSourceRecordId_normalizationRunId_key"
  ON "SyncSliceEvidence"("id", "accountId", "channelConnectionId", "rawSourceRecordId", "normalizationRunId");
CREATE INDEX "SyncSliceEvidence_accountId_channelConnectionId_idx" ON "SyncSliceEvidence"("accountId", "channelConnectionId");
CREATE INDEX "SyncSliceEvidence_sourceObservationId_idx" ON "SyncSliceEvidence"("sourceObservationId");

CREATE TRIGGER "SyncSliceEvidence_no_update" BEFORE UPDATE ON "SyncSliceEvidence" BEGIN SELECT RAISE(ABORT, 'SyncSliceEvidence is immutable'); END;
CREATE TRIGGER "SyncSliceEvidence_no_delete" BEFORE DELETE ON "SyncSliceEvidence" BEGIN SELECT RAISE(ABORT, 'SyncSliceEvidence is immutable'); END;
CREATE TRIGGER "SyncSliceEvidence_only_leased_insert" BEFORE INSERT ON "SyncSliceEvidence"
WHEN (SELECT "status" FROM "SyncSlice" WHERE "id" = NEW."sliceId") <> 'LEASED'
BEGIN SELECT RAISE(ABORT, 'SyncSliceEvidence requires leased slice'); END;

CREATE TRIGGER "SyncSliceEvidence_observation_validate_insert" BEFORE INSERT ON "SyncSliceEvidence" WHEN NEW.sourceObservationId IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM "SourceObservation" o WHERE o.id=NEW.sourceObservationId AND o.accountId=NEW.accountId AND
      o.channelConnectionId=NEW.channelConnectionId AND o.runId=NEW.runId AND o.sliceId=NEW.sliceId AND
      o.rawSourceRecordId=NEW.rawSourceRecordId
  ) THEN RAISE(ABORT,'Slice evidence observation mismatch') END;
END;
CREATE TRIGGER "SyncSliceEvidence_legacy_run_validate_insert" BEFORE INSERT ON "SyncSliceEvidence" WHEN NEW.sourceObservationId IS NULL BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM "RawSourceRecord" raw WHERE raw.id=NEW.rawSourceRecordId AND
      raw.accountId=NEW.accountId AND raw.channelConnectionId=NEW.channelConnectionId AND
      raw.ingestionRunId=NEW.runId
  ) THEN RAISE(ABORT,'Slice evidence requires same-run raw or source observation') END;
END;

-- D2A keeps its full relational provenance gate; an immutable observation is
-- the only alternative to the legacy same-ingestion-run proof.
DROP TRIGGER "NormalizedOrderRevision_provenance_insert";
CREATE TRIGGER "NormalizedOrderRevision_provenance_insert" BEFORE INSERT ON "NormalizedOrderRevision"
WHEN NOT EXISTS (
  SELECT 1 FROM "NormalizedOrder" o
  JOIN "SyncSliceEvidence" e ON e."id" = NEW."syncSliceEvidenceId"
  JOIN "SyncSlice" s ON s."id" = e."sliceId"
  JOIN "SyncRun" r ON r."id" = s."runId"
  JOIN "RawSourceRecord" raw ON raw."id" = NEW."rawSourceRecordId"
  JOIN "NormalizationRun" n ON n."id" = NEW."normalizationRunId"
  JOIN "MappingVersion" m ON m."id" = NEW."mappingVersionId"
  WHERE o."id" = NEW."orderId"
    AND o."accountId" = NEW."accountId" AND o."channelConnectionId" = NEW."channelConnectionId"
    AND e."accountId" = NEW."accountId" AND e."channelConnectionId" = NEW."channelConnectionId"
    AND e."rawSourceRecordId" = raw."id" AND e."normalizationRunId" = n."id"
    AND s."accountId" = NEW."accountId" AND s."channelConnectionId" = NEW."channelConnectionId"
    AND s."marketplaceScopeKey" = o."marketplaceScopeKey" AND s."stream" = 'orders'
    AND e."runId" = r."id"
    AND (raw."ingestionRunId" = r."id" OR EXISTS (
      SELECT 1 FROM "SourceObservation" obs WHERE obs."id" = e."sourceObservationId"
        AND obs."accountId" = NEW."accountId" AND obs."channelConnectionId" = NEW."channelConnectionId"
        AND obs."runId" = r."id" AND obs."sliceId" = s."id" AND obs."rawSourceRecordId" = raw."id"
        AND obs."authorizationVersion" = s."authorizationVersion"
    ))
    AND r."accountId" = NEW."accountId" AND r."channelConnectionId" = NEW."channelConnectionId"
    AND raw."accountId" = NEW."accountId" AND raw."channelConnectionId" = NEW."channelConnectionId"
    AND raw."sourceSystem" = o."sourceSystem" AND raw."sourceEntityType" = 'ORDER' AND raw."sourceEntityId" = o."sourceOrderKey"
    AND n."accountId" = NEW."accountId" AND n."channelConnectionId" = NEW."channelConnectionId"
    AND n."rawSourceRecordId" = raw."id" AND n."mappingVersionId" = m."id"
    AND n."normalizationRevision" = NEW."normalizationRevision" AND n."status" = 'SUCCEEDED'
    AND m."activatedAt" IS NOT NULL
)
BEGIN SELECT RAISE(ABORT, 'D2A requires successful exact-scope normalization provenance and activated mapping'); END;

DROP TRIGGER "NormalizedOrderItemRevision_provenance_insert";
CREATE TRIGGER "NormalizedOrderItemRevision_provenance_insert" BEFORE INSERT ON "NormalizedOrderItemRevision"
WHEN NOT EXISTS (
  SELECT 1 FROM "NormalizedOrderItem" i JOIN "NormalizedOrder" o ON o."id" = i."orderId"
  JOIN "SyncSliceEvidence" e ON e."id" = NEW."syncSliceEvidenceId"
  JOIN "SyncSlice" s ON s."id" = e."sliceId"
  JOIN "SyncRun" r ON r."id" = s."runId"
  JOIN "RawSourceRecord" raw ON raw."id" = NEW."rawSourceRecordId"
  JOIN "NormalizationRun" n ON n."id" = NEW."normalizationRunId"
  JOIN "MappingVersion" m ON m."id" = NEW."mappingVersionId"
  WHERE i."id" = NEW."itemId" AND i."accountId" = NEW."accountId" AND i."channelConnectionId" = NEW."channelConnectionId"
    AND o."accountId" = NEW."accountId" AND o."channelConnectionId" = NEW."channelConnectionId"
    AND e."accountId" = NEW."accountId" AND e."channelConnectionId" = NEW."channelConnectionId"
    AND e."rawSourceRecordId" = raw."id" AND e."normalizationRunId" = n."id"
    AND s."accountId" = NEW."accountId" AND s."channelConnectionId" = NEW."channelConnectionId"
    AND s."marketplaceScopeKey" = o."marketplaceScopeKey" AND s."stream" = 'orders'
    AND e."runId" = r."id"
    AND (raw."ingestionRunId" = r."id" OR EXISTS (
      SELECT 1 FROM "SourceObservation" obs WHERE obs."id" = e."sourceObservationId"
        AND obs."accountId" = NEW."accountId" AND obs."channelConnectionId" = NEW."channelConnectionId"
        AND obs."runId" = r."id" AND obs."sliceId" = s."id" AND obs."rawSourceRecordId" = raw."id"
        AND obs."authorizationVersion" = s."authorizationVersion"
    ))
    AND r."accountId" = NEW."accountId" AND r."channelConnectionId" = NEW."channelConnectionId"
    AND raw."accountId" = NEW."accountId" AND raw."channelConnectionId" = NEW."channelConnectionId"
    AND raw."sourceSystem" = o."sourceSystem" AND raw."sourceEntityType" = 'ORDER' AND raw."sourceEntityId" = o."sourceOrderKey"
    AND n."accountId" = NEW."accountId" AND n."channelConnectionId" = NEW."channelConnectionId"
    AND n."rawSourceRecordId" = raw."id" AND n."mappingVersionId" = m."id"
    AND n."normalizationRevision" = NEW."normalizationRevision" AND n."status" = 'SUCCEEDED'
    AND m."activatedAt" IS NOT NULL
)
BEGIN SELECT RAISE(ABORT, 'D2A requires successful exact-scope normalization provenance and activated mapping'); END;

PRAGMA foreign_keys=ON;
PRAGMA legacy_alter_table=OFF;
