-- CreateTable
CREATE TABLE "Marketplace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "channelConnectionId" TEXT NOT NULL,
    "externalMarketplaceId" TEXT NOT NULL,
    "countryCode" TEXT,
    "currencyCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Marketplace_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Marketplace_channelConnectionId_accountId_fkey" FOREIGN KEY ("channelConnectionId", "accountId") REFERENCES "ChannelConnection" ("id", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- D1 authorization epoch used only by future core sync workers.
CREATE TABLE "CoreChannelAuthorization" (
    "channelConnectionId" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "authorizationVersion" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CoreChannelAuthorization_channelConnectionId_accountId_fkey" FOREIGN KEY ("channelConnectionId", "accountId") REFERENCES "ChannelConnection" ("id", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "CoreChannelAuthorization_accountId_idx" ON "CoreChannelAuthorization"("accountId");
CREATE UNIQUE INDEX "CoreChannelAuthorization_channelConnectionId_accountId_key" ON "CoreChannelAuthorization"("channelConnectionId", "accountId");

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Sku" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "productId" TEXT,
    "sellerSku" TEXT,
    "barcode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Sku_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Sku_productId_accountId_fkey" FOREIGN KEY ("productId", "accountId") REFERENCES "Product" ("id", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChannelListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "channelConnectionId" TEXT NOT NULL,
    "marketplaceId" TEXT,
    "marketplaceScopeKey" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "externalProductId" TEXT,
    "externalVariantOrListingId" TEXT NOT NULL,
    "skuId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChannelListing_scope_check" CHECK (("marketplaceId" IS NULL AND "marketplaceScopeKey" = '@none') OR ("marketplaceId" IS NOT NULL AND "marketplaceScopeKey" = "marketplaceId")),
    CONSTRAINT "ChannelListing_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ChannelListing_channelConnectionId_accountId_fkey" FOREIGN KEY ("channelConnectionId", "accountId") REFERENCES "ChannelConnection" ("id", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ChannelListing_marketplaceId_accountId_channelConnectionId_fkey" FOREIGN KEY ("marketplaceId", "accountId", "channelConnectionId") REFERENCES "Marketplace" ("id", "accountId", "channelConnectionId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ChannelListing_skuId_accountId_fkey" FOREIGN KEY ("skuId", "accountId") REFERENCES "Sku" ("id", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductMappingCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "candidateSkuId" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductMappingCandidate_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductMappingCandidate_listingId_accountId_fkey" FOREIGN KEY ("listingId", "accountId") REFERENCES "ChannelListing" ("id", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductMappingCandidate_candidateSkuId_accountId_fkey" FOREIGN KEY ("candidateSkuId", "accountId") REFERENCES "Sku" ("id", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductMappingDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "actorRef" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductMappingDecision_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductMappingDecision_candidateId_accountId_fkey" FOREIGN KEY ("candidateId", "accountId") REFERENCES "ProductMappingCandidate" ("id", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CurrencyPolicyVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "exponentSourceVersion" TEXT NOT NULL,
    "roundingMode" TEXT NOT NULL,
    "toleranceAtoms" BIGINT NOT NULL,
    "toleranceScale" INTEGER NOT NULL,
    "residualPolicy" TEXT NOT NULL,
    "activatedAt" DATETIME,
    "deactivatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CurrencyPolicyVersion_scale_check" CHECK ("toleranceScale" >= 0 AND "toleranceScale" <= 12 AND "toleranceAtoms" >= 0)
);

-- CreateTable
CREATE TABLE "MappingVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "sourceContract" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "mapperSemanticVersion" TEXT NOT NULL,
    "formulaCompatibilityVersion" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "activatedAt" DATETIME,
    "deactivatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "channelConnectionId" TEXT NOT NULL,
    "stream" TEXT NOT NULL,
    "authorizationVersion" TEXT NOT NULL,
    "mappingVersionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    CONSTRAINT "SyncRun_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SyncRun_channelConnectionId_accountId_fkey" FOREIGN KEY ("channelConnectionId", "accountId") REFERENCES "ChannelConnection" ("id", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SyncRun_mappingVersionId_fkey" FOREIGN KEY ("mappingVersionId") REFERENCES "MappingVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RawSourceRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "channelConnectionId" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceEntityId" TEXT NOT NULL,
    "sourceSnapshotVersion" TEXT,
    "capturedAt" DATETIME NOT NULL,
    "sourceUpdatedAt" DATETIME,
    "schemaVersion" TEXT NOT NULL,
    "payloadChecksum" TEXT NOT NULL,
    "payloadByteLength" INTEGER NOT NULL,
    "retentionClass" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "ingestionRunId" TEXT,
    "payloadStorageMode" TEXT NOT NULL DEFAULT 'DB_CHUNKS',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RawSourceRecord_size_check" CHECK ("payloadByteLength" >= 0 AND "payloadByteLength" <= 2097152),
    CONSTRAINT "RawSourceRecord_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RawSourceRecord_channelConnectionId_accountId_fkey" FOREIGN KEY ("channelConnectionId", "accountId") REFERENCES "ChannelConnection" ("id", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RawSourceRecord_ingestionRunId_accountId_channelConnectionId_fkey" FOREIGN KEY ("ingestionRunId", "accountId", "channelConnectionId") REFERENCES "SyncRun" ("id", "accountId", "channelConnectionId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RawSourceBlobChunk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "channelConnectionId" TEXT NOT NULL,
    "rawSourceRecordId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "encryptedBytes" BLOB NOT NULL,
    CONSTRAINT "RawSourceBlobChunk_size_check" CHECK ("chunkIndex" >= 0 AND length("encryptedBytes") > 0 AND length("encryptedBytes") <= 66560),
    CONSTRAINT "RawSourceBlobChunk_rawSourceRecordId_accountId_channelConnectionId_fkey" FOREIGN KEY ("rawSourceRecordId", "accountId", "channelConnectionId") REFERENCES "RawSourceRecord" ("id", "accountId", "channelConnectionId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SourceReference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "channelConnectionId" TEXT NOT NULL,
    "rawSourceRecordId" TEXT NOT NULL,
    "sourceLeafPath" TEXT NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SourceReference_rawSourceRecordId_accountId_channelConnectionId_fkey" FOREIGN KEY ("rawSourceRecordId", "accountId", "channelConnectionId") REFERENCES "RawSourceRecord" ("id", "accountId", "channelConnectionId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NormalizationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "channelConnectionId" TEXT NOT NULL,
    "rawSourceRecordId" TEXT NOT NULL,
    "mappingVersionId" TEXT NOT NULL,
    "parserVersion" TEXT NOT NULL,
    "normalizationRevision" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "safeErrorCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "NormalizationRun_rawSourceRecordId_accountId_channelConnectionId_fkey" FOREIGN KEY ("rawSourceRecordId", "accountId", "channelConnectionId") REFERENCES "RawSourceRecord" ("id", "accountId", "channelConnectionId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NormalizationRun_mappingVersionId_fkey" FOREIGN KEY ("mappingVersionId") REFERENCES "MappingVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncSlice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "channelConnectionId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "marketplaceId" TEXT,
    "marketplaceScopeKey" TEXT NOT NULL,
    "stream" TEXT NOT NULL,
    "sliceKey" TEXT NOT NULL,
    "authorizationVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "leaseOwner" TEXT,
    "leaseExpiresAt" DATETIME,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME,
    "safeErrorCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SyncSlice_scope_check" CHECK (("marketplaceId" IS NULL AND "marketplaceScopeKey" = '@none') OR ("marketplaceId" IS NOT NULL AND "marketplaceScopeKey" = "marketplaceId")),
    CONSTRAINT "SyncSlice_runId_accountId_channelConnectionId_fkey" FOREIGN KEY ("runId", "accountId", "channelConnectionId") REFERENCES "SyncRun" ("id", "accountId", "channelConnectionId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SyncSlice_marketplaceId_accountId_channelConnectionId_fkey" FOREIGN KEY ("marketplaceId", "accountId", "channelConnectionId") REFERENCES "Marketplace" ("id", "accountId", "channelConnectionId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncCheckpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "channelConnectionId" TEXT NOT NULL,
    "marketplaceId" TEXT,
    "marketplaceScopeKey" TEXT NOT NULL,
    "stream" TEXT NOT NULL,
    "cursorValue" TEXT,
    "windowWatermark" DATETIME,
    "authorizationVersion" TEXT NOT NULL,
    "mappingVersionId" TEXT NOT NULL,
    "processedSliceId" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SyncCheckpoint_scope_check" CHECK (("marketplaceId" IS NULL AND "marketplaceScopeKey" = '@none') OR ("marketplaceId" IS NOT NULL AND "marketplaceScopeKey" = "marketplaceId")),
    CONSTRAINT "SyncCheckpoint_channelConnectionId_accountId_fkey" FOREIGN KEY ("channelConnectionId", "accountId") REFERENCES "ChannelConnection" ("id", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SyncCheckpoint_marketplaceId_accountId_channelConnectionId_fkey" FOREIGN KEY ("marketplaceId", "accountId", "channelConnectionId") REFERENCES "Marketplace" ("id", "accountId", "channelConnectionId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SyncCheckpoint_mappingVersionId_fkey" FOREIGN KEY ("mappingVersionId") REFERENCES "MappingVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SyncCheckpoint_processedSliceId_accountId_channelConnectionId_fkey" FOREIGN KEY ("processedSliceId", "accountId", "channelConnectionId") REFERENCES "SyncSlice" ("id", "accountId", "channelConnectionId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "SyncSliceEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "channelConnectionId" TEXT NOT NULL,
    "sliceId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "rawSourceRecordId" TEXT NOT NULL,
    "normalizationRunId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SyncSliceEvidence_sliceId_accountId_channelConnectionId_runId_fkey" FOREIGN KEY ("sliceId", "accountId", "channelConnectionId", "runId") REFERENCES "SyncSlice" ("id", "accountId", "channelConnectionId", "runId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SyncSliceEvidence_rawSourceRecordId_accountId_channelConnectionId_runId_fkey" FOREIGN KEY ("rawSourceRecordId", "accountId", "channelConnectionId", "runId") REFERENCES "RawSourceRecord" ("id", "accountId", "channelConnectionId", "ingestionRunId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SyncSliceEvidence_normalizationRunId_accountId_channelConnectionId_rawSourceRecordId_fkey" FOREIGN KEY ("normalizationRunId", "accountId", "channelConnectionId", "rawSourceRecordId") REFERENCES "NormalizationRun" ("id", "accountId", "channelConnectionId", "rawSourceRecordId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SyncSliceEvidence_sliceId_rawSourceRecordId_key" ON "SyncSliceEvidence"("sliceId", "rawSourceRecordId");
CREATE INDEX "SyncSliceEvidence_accountId_channelConnectionId_idx" ON "SyncSliceEvidence"("accountId", "channelConnectionId");

-- CreateTable
CREATE TABLE "DataCoverage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "channelConnectionId" TEXT NOT NULL,
    "marketplaceId" TEXT,
    "marketplaceScopeKey" TEXT NOT NULL,
    "datasetKey" TEXT NOT NULL,
    "windowStart" DATETIME NOT NULL,
    "windowEnd" DATETIME NOT NULL,
    "revision" INTEGER NOT NULL,
    "capabilityStatus" TEXT NOT NULL,
    "datasetQualityStatus" TEXT NOT NULL,
    "completenessBps" INTEGER,
    "reasonCode" TEXT,
    "sourceWatermark" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DataCoverage_scope_check" CHECK (("marketplaceId" IS NULL AND "marketplaceScopeKey" = '@none') OR ("marketplaceId" IS NOT NULL AND "marketplaceScopeKey" = "marketplaceId")),
    CONSTRAINT "DataCoverage_capability_check" CHECK ("capabilityStatus" IN ('AVAILABLE','NOT_APPLICABLE','NOT_AUTHORIZED','NOT_SUPPORTED','TEMPORARILY_UNAVAILABLE')),
    CONSTRAINT "DataCoverage_quality_check" CHECK ("datasetQualityStatus" IN ('SYNCING','PROVISIONAL','COMPLETE','DEGRADED','ERROR')),
    CONSTRAINT "DataCoverage_completeness_check" CHECK (("completenessBps" IS NULL OR ("completenessBps" BETWEEN 0 AND 10000)) AND ("capabilityStatus" = 'AVAILABLE' OR "completenessBps" IS NULL)),
    CONSTRAINT "DataCoverage_channelConnectionId_accountId_fkey" FOREIGN KEY ("channelConnectionId", "accountId") REFERENCES "ChannelConnection" ("id", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DataCoverage_marketplaceId_accountId_channelConnectionId_fkey" FOREIGN KEY ("marketplaceId", "accountId", "channelConnectionId") REFERENCES "Marketplace" ("id", "accountId", "channelConnectionId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Marketplace_accountId_idx" ON "Marketplace"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Marketplace_channelConnectionId_externalMarketplaceId_key" ON "Marketplace"("channelConnectionId", "externalMarketplaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Marketplace_id_accountId_channelConnectionId_key" ON "Marketplace"("id", "accountId", "channelConnectionId");

-- CreateIndex
CREATE INDEX "Product_accountId_idx" ON "Product"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_id_accountId_key" ON "Product"("id", "accountId");

-- CreateIndex
CREATE INDEX "Sku_accountId_sellerSku_idx" ON "Sku"("accountId", "sellerSku");

-- CreateIndex
CREATE INDEX "Sku_productId_idx" ON "Sku"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Sku_id_accountId_key" ON "Sku"("id", "accountId");

-- CreateIndex
CREATE INDEX "ChannelListing_accountId_skuId_idx" ON "ChannelListing"("accountId", "skuId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelListing_channelConnectionId_marketplaceScopeKey_sourceEntityType_externalVariantOrListingId_key" ON "ChannelListing"("channelConnectionId", "marketplaceScopeKey", "sourceEntityType", "externalVariantOrListingId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelListing_id_accountId_key" ON "ChannelListing"("id", "accountId");

-- CreateIndex
CREATE INDEX "ProductMappingCandidate_accountId_state_idx" ON "ProductMappingCandidate"("accountId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMappingCandidate_listingId_candidateSkuId_ruleVersion_key" ON "ProductMappingCandidate"("listingId", "candidateSkuId", "ruleVersion");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMappingCandidate_id_accountId_key" ON "ProductMappingCandidate"("id", "accountId");

-- CreateIndex
CREATE INDEX "ProductMappingDecision_candidateId_createdAt_idx" ON "ProductMappingDecision"("candidateId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CurrencyPolicyVersion_version_key" ON "CurrencyPolicyVersion"("version");

-- CreateIndex
CREATE UNIQUE INDEX "MappingVersion_platform_sourceContract_sourceVersion_mapperSemanticVersion_key" ON "MappingVersion"("platform", "sourceContract", "sourceVersion", "mapperSemanticVersion");

-- CreateIndex
CREATE INDEX "SyncRun_channelConnectionId_stream_status_idx" ON "SyncRun"("channelConnectionId", "stream", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SyncRun_id_accountId_channelConnectionId_key" ON "SyncRun"("id", "accountId", "channelConnectionId");

-- CreateIndex
CREATE INDEX "RawSourceRecord_accountId_capturedAt_idx" ON "RawSourceRecord"("accountId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RawSourceRecord_channelConnectionId_sourceSystem_sourceVersion_sourceEntityType_sourceEntityId_payloadChecksum_key" ON "RawSourceRecord"("channelConnectionId", "sourceSystem", "sourceVersion", "sourceEntityType", "sourceEntityId", "payloadChecksum");

-- CreateIndex
CREATE UNIQUE INDEX "RawSourceRecord_id_accountId_channelConnectionId_key" ON "RawSourceRecord"("id", "accountId", "channelConnectionId");
CREATE UNIQUE INDEX "RawSourceRecord_id_accountId_channelConnectionId_ingestionRunId_key" ON "RawSourceRecord"("id", "accountId", "channelConnectionId", "ingestionRunId");

-- CreateIndex
CREATE UNIQUE INDEX "RawSourceBlobChunk_rawSourceRecordId_chunkIndex_key" ON "RawSourceBlobChunk"("rawSourceRecordId", "chunkIndex");

-- CreateIndex
CREATE INDEX "SourceReference_accountId_targetKind_targetKey_idx" ON "SourceReference"("accountId", "targetKind", "targetKey");

-- CreateIndex
CREATE UNIQUE INDEX "SourceReference_rawSourceRecordId_sourceLeafPath_targetKind_targetKey_key" ON "SourceReference"("rawSourceRecordId", "sourceLeafPath", "targetKind", "targetKey");

-- CreateIndex
CREATE INDEX "NormalizationRun_accountId_status_idx" ON "NormalizationRun"("accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "NormalizationRun_rawSourceRecordId_mappingVersionId_normalizationRevision_key" ON "NormalizationRun"("rawSourceRecordId", "mappingVersionId", "normalizationRevision");
CREATE UNIQUE INDEX "NormalizationRun_id_accountId_channelConnectionId_rawSourceRecordId_key" ON "NormalizationRun"("id", "accountId", "channelConnectionId", "rawSourceRecordId");

-- CreateIndex
CREATE INDEX "SyncSlice_status_nextAttemptAt_leaseExpiresAt_idx" ON "SyncSlice"("status", "nextAttemptAt", "leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SyncSlice_channelConnectionId_marketplaceScopeKey_stream_sliceKey_key" ON "SyncSlice"("channelConnectionId", "marketplaceScopeKey", "stream", "sliceKey");

-- CreateIndex
CREATE UNIQUE INDEX "SyncSlice_id_accountId_channelConnectionId_key" ON "SyncSlice"("id", "accountId", "channelConnectionId");
CREATE UNIQUE INDEX "SyncSlice_id_accountId_channelConnectionId_runId_key" ON "SyncSlice"("id", "accountId", "channelConnectionId", "runId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncCheckpoint_channelConnectionId_marketplaceScopeKey_stream_key" ON "SyncCheckpoint"("channelConnectionId", "marketplaceScopeKey", "stream");

-- CreateIndex
CREATE INDEX "DataCoverage_accountId_datasetKey_windowStart_idx" ON "DataCoverage"("accountId", "datasetKey", "windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "DataCoverage_channelConnectionId_marketplaceScopeKey_datasetKey_windowStart_windowEnd_revision_key" ON "DataCoverage"("channelConnectionId", "marketplaceScopeKey", "datasetKey", "windowStart", "windowEnd", "revision");

-- SQLite immutability guards. Lifecycle purge needs a separately reviewed migration.
CREATE TRIGGER "RawSourceRecord_no_update" BEFORE UPDATE ON "RawSourceRecord" BEGIN SELECT RAISE(ABORT, 'RawSourceRecord is immutable'); END;
CREATE TRIGGER "RawSourceRecord_no_delete" BEFORE DELETE ON "RawSourceRecord" BEGIN SELECT RAISE(ABORT, 'RawSourceRecord is immutable'); END;
CREATE TRIGGER "RawSourceBlobChunk_no_update" BEFORE UPDATE ON "RawSourceBlobChunk" BEGIN SELECT RAISE(ABORT, 'RawSourceBlobChunk is immutable'); END;
CREATE TRIGGER "RawSourceBlobChunk_no_delete" BEFORE DELETE ON "RawSourceBlobChunk" BEGIN SELECT RAISE(ABORT, 'RawSourceBlobChunk is immutable'); END;
CREATE TRIGGER "SyncSliceEvidence_no_update" BEFORE UPDATE ON "SyncSliceEvidence" BEGIN SELECT RAISE(ABORT, 'SyncSliceEvidence is immutable'); END;
CREATE TRIGGER "SyncSliceEvidence_no_delete" BEFORE DELETE ON "SyncSliceEvidence" BEGIN SELECT RAISE(ABORT, 'SyncSliceEvidence is immutable'); END;
CREATE TRIGGER "SyncSliceEvidence_only_leased_insert" BEFORE INSERT ON "SyncSliceEvidence"
WHEN (SELECT "status" FROM "SyncSlice" WHERE "id" = NEW."sliceId") <> 'LEASED'
BEGIN SELECT RAISE(ABORT, 'SyncSliceEvidence requires leased slice'); END;
CREATE TRIGGER "NormalizationRun_succeeded_no_change" BEFORE UPDATE ON "NormalizationRun"
WHEN OLD."status" = 'SUCCEEDED' AND (NEW."status" <> OLD."status" OR NEW."rawSourceRecordId" <> OLD."rawSourceRecordId" OR
  NEW."accountId" <> OLD."accountId" OR NEW."channelConnectionId" <> OLD."channelConnectionId" OR
  NEW."mappingVersionId" <> OLD."mappingVersionId" OR NEW."parserVersion" <> OLD."parserVersion" OR
  NEW."normalizationRevision" <> OLD."normalizationRevision")
BEGIN SELECT RAISE(ABORT, 'Successful NormalizationRun is immutable'); END;
CREATE TRIGGER "ProductMappingDecision_no_update" BEFORE UPDATE ON "ProductMappingDecision" BEGIN SELECT RAISE(ABORT, 'ProductMappingDecision is immutable'); END;
CREATE TRIGGER "ProductMappingDecision_no_delete" BEFORE DELETE ON "ProductMappingDecision" BEGIN SELECT RAISE(ABORT, 'ProductMappingDecision is immutable'); END;
CREATE TRIGGER "MappingVersion_activated_semantics" BEFORE UPDATE ON "MappingVersion"
WHEN OLD."activatedAt" IS NOT NULL AND (
  NEW."platform" <> OLD."platform" OR NEW."sourceContract" <> OLD."sourceContract" OR
  NEW."sourceVersion" <> OLD."sourceVersion" OR NEW."mapperSemanticVersion" <> OLD."mapperSemanticVersion" OR
  NEW."formulaCompatibilityVersion" <> OLD."formulaCompatibilityVersion" OR NEW."checksum" <> OLD."checksum" OR
  NEW."activatedAt" <> OLD."activatedAt")
BEGIN SELECT RAISE(ABORT, 'Activated MappingVersion semantics are immutable'); END;
CREATE TRIGGER "MappingVersion_activated_no_delete" BEFORE DELETE ON "MappingVersion"
WHEN OLD."activatedAt" IS NOT NULL BEGIN SELECT RAISE(ABORT, 'Activated MappingVersion cannot be deleted'); END;
CREATE TRIGGER "CurrencyPolicyVersion_activated_semantics" BEFORE UPDATE ON "CurrencyPolicyVersion"
WHEN OLD."activatedAt" IS NOT NULL AND (
  NEW."version" <> OLD."version" OR NEW."checksum" <> OLD."checksum" OR
  NEW."exponentSourceVersion" <> OLD."exponentSourceVersion" OR NEW."roundingMode" <> OLD."roundingMode" OR
  NEW."toleranceAtoms" <> OLD."toleranceAtoms" OR NEW."toleranceScale" <> OLD."toleranceScale" OR
  NEW."residualPolicy" <> OLD."residualPolicy" OR NEW."activatedAt" <> OLD."activatedAt")
BEGIN SELECT RAISE(ABORT, 'Activated CurrencyPolicyVersion semantics are immutable'); END;
CREATE TRIGGER "CurrencyPolicyVersion_activated_no_delete" BEFORE DELETE ON "CurrencyPolicyVersion"
WHEN OLD."activatedAt" IS NOT NULL BEGIN SELECT RAISE(ABORT, 'Activated CurrencyPolicyVersion cannot be deleted'); END;
