-- CreateTable
CREATE TABLE "NormalizedOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "channelConnectionId" TEXT NOT NULL,
    "marketplaceId" TEXT,
    "marketplaceScopeKey" TEXT NOT NULL CHECK (("marketplaceId" IS NULL AND "marketplaceScopeKey" = '@none') OR ("marketplaceId" IS NOT NULL AND "marketplaceScopeKey" = "marketplaceId")),
    "sourceSystem" TEXT NOT NULL,
    "sourceOrderKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NormalizedOrder_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NormalizedOrder_channelConnectionId_accountId_fkey" FOREIGN KEY ("channelConnectionId", "accountId") REFERENCES "ChannelConnection" ("id", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NormalizedOrder_marketplaceId_accountId_channelConnectionId_fkey" FOREIGN KEY ("marketplaceId", "accountId", "channelConnectionId") REFERENCES "Marketplace" ("id", "accountId", "channelConnectionId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NormalizedOrderRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "channelConnectionId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "operationKey" TEXT NOT NULL,
    "inputChecksum" TEXT NOT NULL,
    "normalizedStatus" TEXT NOT NULL,
    "sourceStatus" TEXT,
    "occurredAt" DATETIME,
    "postedAt" DATETIME,
    "rawSourceRecordId" TEXT NOT NULL,
    "normalizationRunId" TEXT NOT NULL,
    "mappingVersionId" TEXT NOT NULL,
    "normalizationRevision" INTEGER NOT NULL,
    "syncSliceEvidenceId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NormalizedOrderRevision_orderId_accountId_channelConnectionId_fkey" FOREIGN KEY ("orderId", "accountId", "channelConnectionId") REFERENCES "NormalizedOrder" ("id", "accountId", "channelConnectionId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NormalizedOrderRevision_rawSourceRecordId_accountId_channelConnectionId_fkey" FOREIGN KEY ("rawSourceRecordId", "accountId", "channelConnectionId") REFERENCES "RawSourceRecord" ("id", "accountId", "channelConnectionId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NormalizedOrderRevision_normalizationRunId_accountId_channelConnectionId_rawSourceRecordId_mappingVersionId_normalizationRevision_fkey" FOREIGN KEY ("normalizationRunId", "accountId", "channelConnectionId", "rawSourceRecordId", "mappingVersionId", "normalizationRevision") REFERENCES "NormalizationRun" ("id", "accountId", "channelConnectionId", "rawSourceRecordId", "mappingVersionId", "normalizationRevision") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NormalizedOrderRevision_mappingVersionId_fkey" FOREIGN KEY ("mappingVersionId") REFERENCES "MappingVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NormalizedOrderRevision_syncSliceEvidenceId_accountId_channelConnectionId_rawSourceRecordId_normalizationRunId_fkey" FOREIGN KEY ("syncSliceEvidenceId", "accountId", "channelConnectionId", "rawSourceRecordId", "normalizationRunId") REFERENCES "SyncSliceEvidence" ("id", "accountId", "channelConnectionId", "rawSourceRecordId", "normalizationRunId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NormalizedOrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "channelConnectionId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sourceItemKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NormalizedOrderItem_orderId_accountId_channelConnectionId_fkey" FOREIGN KEY ("orderId", "accountId", "channelConnectionId") REFERENCES "NormalizedOrder" ("id", "accountId", "channelConnectionId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NormalizedOrderItemRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "channelConnectionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "operationKey" TEXT NOT NULL,
    "inputChecksum" TEXT NOT NULL,
    "quantityAtoms" BIGINT NOT NULL CHECK ("quantityAtoms" >= 0),
    "quantityScale" INTEGER NOT NULL CHECK ("quantityScale" BETWEEN 0 AND 12),
    "sourceState" TEXT,
    "skuId" TEXT,
    "channelListingId" TEXT,
    "sourceListingEntityType" TEXT,
    "sourceListingKey" TEXT,
    "marketplaceScopeKey" TEXT NOT NULL,
    "occurredAt" DATETIME,
    "postedAt" DATETIME,
    "rawSourceRecordId" TEXT NOT NULL,
    "normalizationRunId" TEXT NOT NULL,
    "mappingVersionId" TEXT NOT NULL,
    "normalizationRevision" INTEGER NOT NULL,
    "syncSliceEvidenceId" TEXT NOT NULL,
    "mappingDecisionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NormalizedOrderItemRevision_itemId_accountId_channelConnectionId_fkey" FOREIGN KEY ("itemId", "accountId", "channelConnectionId") REFERENCES "NormalizedOrderItem" ("id", "accountId", "channelConnectionId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NormalizedOrderItemRevision_skuId_accountId_fkey" FOREIGN KEY ("skuId", "accountId") REFERENCES "Sku" ("id", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NormalizedOrderItemRevision_channelListingId_accountId_channelConnectionId_marketplaceScopeKey_fkey" FOREIGN KEY ("channelListingId", "accountId", "channelConnectionId", "marketplaceScopeKey") REFERENCES "ChannelListing" ("id", "accountId", "channelConnectionId", "marketplaceScopeKey") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NormalizedOrderItemRevision_rawSourceRecordId_accountId_channelConnectionId_fkey" FOREIGN KEY ("rawSourceRecordId", "accountId", "channelConnectionId") REFERENCES "RawSourceRecord" ("id", "accountId", "channelConnectionId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NormalizedOrderItemRevision_normalizationRunId_accountId_channelConnectionId_rawSourceRecordId_mappingVersionId_normalizationRevision_fkey" FOREIGN KEY ("normalizationRunId", "accountId", "channelConnectionId", "rawSourceRecordId", "mappingVersionId", "normalizationRevision") REFERENCES "NormalizationRun" ("id", "accountId", "channelConnectionId", "rawSourceRecordId", "mappingVersionId", "normalizationRevision") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NormalizedOrderItemRevision_mappingVersionId_fkey" FOREIGN KEY ("mappingVersionId") REFERENCES "MappingVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NormalizedOrderItemRevision_syncSliceEvidenceId_accountId_channelConnectionId_rawSourceRecordId_normalizationRunId_fkey" FOREIGN KEY ("syncSliceEvidenceId", "accountId", "channelConnectionId", "rawSourceRecordId", "normalizationRunId") REFERENCES "SyncSliceEvidence" ("id", "accountId", "channelConnectionId", "rawSourceRecordId", "normalizationRunId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NormalizedOrderItemRevision_mappingDecisionId_accountId_fkey" FOREIGN KEY ("mappingDecisionId", "accountId") REFERENCES "ProductMappingDecision" ("id", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "NormalizedOrder_accountId_idx" ON "NormalizedOrder"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "NormalizedOrder_channelConnectionId_marketplaceScopeKey_sourceSystem_sourceOrderKey_key" ON "NormalizedOrder"("channelConnectionId", "marketplaceScopeKey", "sourceSystem", "sourceOrderKey");

-- CreateIndex
CREATE UNIQUE INDEX "NormalizedOrder_id_accountId_channelConnectionId_key" ON "NormalizedOrder"("id", "accountId", "channelConnectionId");

-- CreateIndex
CREATE UNIQUE INDEX "NormalizedOrder_id_accountId_channelConnectionId_marketplaceScopeKey_key" ON "NormalizedOrder"("id", "accountId", "channelConnectionId", "marketplaceScopeKey");

-- CreateIndex
CREATE INDEX "NormalizedOrderRevision_accountId_channelConnectionId_idx" ON "NormalizedOrderRevision"("accountId", "channelConnectionId");

-- CreateIndex
CREATE UNIQUE INDEX "NormalizedOrderRevision_orderId_revision_key" ON "NormalizedOrderRevision"("orderId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "NormalizedOrderRevision_orderId_operationKey_key" ON "NormalizedOrderRevision"("orderId", "operationKey");

-- CreateIndex
CREATE INDEX "NormalizedOrderItem_accountId_channelConnectionId_idx" ON "NormalizedOrderItem"("accountId", "channelConnectionId");

-- CreateIndex
CREATE UNIQUE INDEX "NormalizedOrderItem_orderId_sourceItemKey_key" ON "NormalizedOrderItem"("orderId", "sourceItemKey");

-- CreateIndex
CREATE UNIQUE INDEX "NormalizedOrderItem_id_accountId_channelConnectionId_key" ON "NormalizedOrderItem"("id", "accountId", "channelConnectionId");

-- CreateIndex
CREATE INDEX "NormalizedOrderItemRevision_accountId_channelConnectionId_idx" ON "NormalizedOrderItemRevision"("accountId", "channelConnectionId");

-- CreateIndex
CREATE UNIQUE INDEX "NormalizedOrderItemRevision_itemId_revision_key" ON "NormalizedOrderItemRevision"("itemId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "NormalizedOrderItemRevision_itemId_operationKey_key" ON "NormalizedOrderItemRevision"("itemId", "operationKey");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelListing_id_accountId_channelConnectionId_marketplaceScopeKey_key" ON "ChannelListing"("id", "accountId", "channelConnectionId", "marketplaceScopeKey");

-- CreateIndex
CREATE UNIQUE INDEX "NormalizationRun_id_accountId_channelConnectionId_rawSourceRecordId_mappingVersionId_normalizationRevision_key" ON "NormalizationRun"("id", "accountId", "channelConnectionId", "rawSourceRecordId", "mappingVersionId", "normalizationRevision");
CREATE UNIQUE INDEX "ProductMappingDecision_id_accountId_key" ON "ProductMappingDecision"("id", "accountId");
CREATE UNIQUE INDEX "SyncSliceEvidence_id_accountId_channelConnectionId_rawSourceRecordId_normalizationRunId_key" ON "SyncSliceEvidence"("id", "accountId", "channelConnectionId", "rawSourceRecordId", "normalizationRunId");

-- Stable identities cannot silently change their logical owner or source key.
CREATE TRIGGER "NormalizedOrder_identity_no_update" BEFORE UPDATE ON "NormalizedOrder" BEGIN SELECT RAISE(ABORT, 'NormalizedOrder identity is immutable'); END;
CREATE TRIGGER "NormalizedOrder_identity_no_delete" BEFORE DELETE ON "NormalizedOrder" BEGIN SELECT RAISE(ABORT, 'NormalizedOrder identity is immutable'); END;
CREATE TRIGGER "NormalizedOrderItem_identity_no_update" BEFORE UPDATE ON "NormalizedOrderItem" BEGIN SELECT RAISE(ABORT, 'NormalizedOrderItem identity is immutable'); END;
CREATE TRIGGER "NormalizedOrderItem_identity_no_delete" BEFORE DELETE ON "NormalizedOrderItem" BEGIN SELECT RAISE(ABORT, 'NormalizedOrderItem identity is immutable'); END;
CREATE TRIGGER "NormalizedOrderRevision_no_update" BEFORE UPDATE ON "NormalizedOrderRevision" BEGIN SELECT RAISE(ABORT, 'NormalizedOrderRevision is immutable'); END;
CREATE TRIGGER "NormalizedOrderRevision_no_delete" BEFORE DELETE ON "NormalizedOrderRevision" BEGIN SELECT RAISE(ABORT, 'NormalizedOrderRevision is immutable'); END;
CREATE TRIGGER "NormalizedOrderItemRevision_no_update" BEFORE UPDATE ON "NormalizedOrderItemRevision" BEGIN SELECT RAISE(ABORT, 'NormalizedOrderItemRevision is immutable'); END;
CREATE TRIGGER "NormalizedOrderItemRevision_no_delete" BEFORE DELETE ON "NormalizedOrderItemRevision" BEGIN SELECT RAISE(ABORT, 'NormalizedOrderItemRevision is immutable'); END;
CREATE TRIGGER "NormalizedOrderItemRevision_scope_insert" BEFORE INSERT ON "NormalizedOrderItemRevision"
WHEN NEW."marketplaceScopeKey" IS NOT (SELECT o."marketplaceScopeKey" FROM "NormalizedOrderItem" i JOIN "NormalizedOrder" o ON o."id" = i."orderId" WHERE i."id" = NEW."itemId")
BEGIN SELECT RAISE(ABORT, 'Item revision scope or explicit SKU mapping mismatch'); END;
-- A decision is immutable in D1; freeze its candidate's semantic identity once cited by D2A history.
CREATE TRIGGER "ProductMappingCandidate_cited_semantics" BEFORE UPDATE ON "ProductMappingCandidate"
WHEN EXISTS (SELECT 1 FROM "NormalizedOrderItemRevision" r JOIN "ProductMappingDecision" d ON d."id" = r."mappingDecisionId" WHERE d."candidateId" = OLD."id")
AND (NEW."accountId" IS NOT OLD."accountId" OR NEW."listingId" IS NOT OLD."listingId" OR NEW."candidateSkuId" IS NOT OLD."candidateSkuId" OR NEW."ruleVersion" IS NOT OLD."ruleVersion")
BEGIN SELECT RAISE(ABORT, 'Cited mapping candidate semantics are immutable'); END;
CREATE TRIGGER "ProductMappingCandidate_cited_no_delete" BEFORE DELETE ON "ProductMappingCandidate"
WHEN EXISTS (SELECT 1 FROM "NormalizedOrderItemRevision" r JOIN "ProductMappingDecision" d ON d."id" = r."mappingDecisionId" WHERE d."candidateId" = OLD."id")
BEGIN SELECT RAISE(ABORT, 'Cited mapping candidate cannot be deleted'); END;
CREATE TRIGGER "ChannelListing_d2a_cited_identity" BEFORE UPDATE ON "ChannelListing"
WHEN EXISTS (SELECT 1 FROM "NormalizedOrderItemRevision" r WHERE r."channelListingId" = OLD."id")
AND (NEW."accountId" IS NOT OLD."accountId" OR NEW."channelConnectionId" IS NOT OLD."channelConnectionId" OR
  NEW."marketplaceId" IS NOT OLD."marketplaceId" OR NEW."marketplaceScopeKey" IS NOT OLD."marketplaceScopeKey" OR
  NEW."sourceEntityType" IS NOT OLD."sourceEntityType" OR NEW."externalVariantOrListingId" IS NOT OLD."externalVariantOrListingId")
BEGIN SELECT RAISE(ABORT, 'Cited listing mapping identity is immutable'); END;
CREATE TRIGGER "SyncSlice_d2a_cited_scope" BEFORE UPDATE ON "SyncSlice"
WHEN (EXISTS (SELECT 1 FROM "SyncSliceEvidence" e JOIN "NormalizedOrderRevision" r ON r."syncSliceEvidenceId" = e."id" WHERE e."sliceId" = OLD."id")
  OR EXISTS (SELECT 1 FROM "SyncSliceEvidence" e JOIN "NormalizedOrderItemRevision" r ON r."syncSliceEvidenceId" = e."id" WHERE e."sliceId" = OLD."id"))
AND (NEW."accountId" IS NOT OLD."accountId" OR NEW."channelConnectionId" IS NOT OLD."channelConnectionId" OR
  NEW."runId" IS NOT OLD."runId" OR NEW."marketplaceId" IS NOT OLD."marketplaceId" OR
  NEW."marketplaceScopeKey" IS NOT OLD."marketplaceScopeKey" OR NEW."stream" IS NOT OLD."stream")
BEGIN SELECT RAISE(ABORT, 'Cited sync slice provenance scope is immutable'); END;
-- Repair the applied D1 trigger here: NULL must never undo activation.
DROP TRIGGER "MappingVersion_activated_semantics";
CREATE TRIGGER "MappingVersion_activated_semantics" BEFORE UPDATE ON "MappingVersion"
WHEN OLD."activatedAt" IS NOT NULL AND (
  NEW."platform" IS NOT OLD."platform" OR NEW."sourceContract" IS NOT OLD."sourceContract" OR
  NEW."sourceVersion" IS NOT OLD."sourceVersion" OR NEW."mapperSemanticVersion" IS NOT OLD."mapperSemanticVersion" OR
  NEW."formulaCompatibilityVersion" IS NOT OLD."formulaCompatibilityVersion" OR NEW."checksum" IS NOT OLD."checksum" OR
  NEW."activatedAt" IS NOT OLD."activatedAt")
BEGIN SELECT RAISE(ABORT, 'Activated MappingVersion semantics are immutable'); END;

-- Relational proof at INSERT; scope comes from the stable order, never the input.
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
    AND e."runId" = r."id" AND raw."ingestionRunId" = r."id"
    AND r."accountId" = NEW."accountId" AND r."channelConnectionId" = NEW."channelConnectionId"
    AND raw."accountId" = NEW."accountId" AND raw."channelConnectionId" = NEW."channelConnectionId"
    AND raw."sourceSystem" = o."sourceSystem" AND raw."sourceEntityType" = 'ORDER' AND raw."sourceEntityId" = o."sourceOrderKey"
    AND n."accountId" = NEW."accountId" AND n."channelConnectionId" = NEW."channelConnectionId"
    AND n."rawSourceRecordId" = raw."id" AND n."mappingVersionId" = m."id"
    AND n."normalizationRevision" = NEW."normalizationRevision" AND n."status" = 'SUCCEEDED'
    AND m."activatedAt" IS NOT NULL
)
BEGIN SELECT RAISE(ABORT, 'D2A requires successful exact-scope normalization provenance and activated mapping'); END;

-- Relational proof at INSERT; scope comes from the stable order, never the input.
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
    AND e."runId" = r."id" AND raw."ingestionRunId" = r."id"
    AND r."accountId" = NEW."accountId" AND r."channelConnectionId" = NEW."channelConnectionId"
    AND raw."accountId" = NEW."accountId" AND raw."channelConnectionId" = NEW."channelConnectionId"
    AND raw."sourceSystem" = o."sourceSystem" AND raw."sourceEntityType" = 'ORDER' AND raw."sourceEntityId" = o."sourceOrderKey"
    AND n."accountId" = NEW."accountId" AND n."channelConnectionId" = NEW."channelConnectionId"
    AND n."rawSourceRecordId" = raw."id" AND n."mappingVersionId" = m."id"
    AND n."normalizationRevision" = NEW."normalizationRevision" AND n."status" = 'SUCCEEDED'
    AND m."activatedAt" IS NOT NULL
)
BEGIN SELECT RAISE(ABORT, 'D2A requires successful exact-scope normalization provenance and activated mapping'); END;

-- Current approval is checked once at insertion. Historical revisions retain the
-- immutable decision and frozen candidate semantics; listing.skuId remains mutable.
CREATE TRIGGER "NormalizedOrderItemRevision_mapping_insert" BEFORE INSERT ON "NormalizedOrderItemRevision"
WHEN
  (NEW."skuId" IS NULL AND NEW."mappingDecisionId" IS NOT NULL)
  OR (NEW."channelListingId" IS NULL AND (NEW."sourceListingEntityType" IS NOT NULL OR NEW."sourceListingKey" IS NOT NULL))
  OR (NEW."channelListingId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "ChannelListing" l
    JOIN "NormalizedOrderItem" i ON i."id" = NEW."itemId"
    JOIN "NormalizedOrder" o ON o."id" = i."orderId"
    WHERE l."id" = NEW."channelListingId" AND l."accountId" = NEW."accountId"
      AND l."channelConnectionId" = NEW."channelConnectionId" AND l."marketplaceScopeKey" = o."marketplaceScopeKey"
      AND l."sourceEntityType" = NEW."sourceListingEntityType" AND l."externalVariantOrListingId" = NEW."sourceListingKey"
      AND (NEW."skuId" IS NULL OR l."skuId" IS NULL OR l."skuId" = NEW."skuId")
  ))
  OR (NEW."skuId" IS NOT NULL AND (
    NEW."channelListingId" IS NULL OR NEW."mappingDecisionId" IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM "ProductMappingDecision" d
      JOIN "ProductMappingCandidate" c ON c."id" = d."candidateId"
      JOIN "Sku" sku ON sku."id" = c."candidateSkuId"
      WHERE d."id" = NEW."mappingDecisionId" AND d."accountId" = NEW."accountId"
        AND d."decision" = 'ACCEPT' AND c."accountId" = NEW."accountId" AND c."state" = 'ACCEPTED'
        AND c."listingId" = NEW."channelListingId" AND c."candidateSkuId" = NEW."skuId"
        AND sku."accountId" = NEW."accountId"
        AND d."id" = (SELECT latest."id" FROM "ProductMappingDecision" latest
          WHERE latest."candidateId" = c."id" ORDER BY latest."createdAt" DESC, latest."id" DESC LIMIT 1)
    )
    OR 1 <> (
      SELECT COUNT(*) FROM "ProductMappingCandidate" c
      WHERE c."listingId" = NEW."channelListingId" AND c."state" = 'ACCEPTED'
        AND (SELECT d."decision" FROM "ProductMappingDecision" d WHERE d."candidateId" = c."id"
          ORDER BY d."createdAt" DESC, d."id" DESC LIMIT 1) = 'ACCEPT'
    )
  ))
BEGIN SELECT RAISE(ABORT, 'D2A requires exact current approved SKU mapping evidence'); END;
