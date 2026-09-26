-- D2C: additive, dormant cost/inventory/tax evidence core.
CREATE TABLE "CostRecord" (
 "id" TEXT NOT NULL PRIMARY KEY, "accountId" TEXT NOT NULL, "skuId" TEXT NOT NULL,
 "channelConnectionId" TEXT, "marketplaceId" TEXT, "channelScopeKey" TEXT NOT NULL,
 "marketplaceScopeKey" TEXT NOT NULL, "sourceKind" TEXT NOT NULL, "costKey" TEXT NOT NULL,
 "currentRevisionId" TEXT, "revision" INTEGER NOT NULL DEFAULT 0,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(sourceKind IN ('MANUAL','CHANNEL_SOURCE','IMPORTED_SOURCE')),
 CHECK((channelConnectionId IS NULL AND channelScopeKey='@account') OR channelScopeKey=channelConnectionId),
 CHECK((marketplaceId IS NULL AND marketplaceScopeKey='@none') OR marketplaceScopeKey=marketplaceId),
 CHECK(revision>=0 AND length(costKey)>0)
);
CREATE UNIQUE INDEX "CostRecord_id_accountId_key" ON "CostRecord"("id","accountId");
CREATE UNIQUE INDEX "CostRecord_accountId_skuId_channelScopeKey_marketplaceScopeKey_sourceKind_costKey_key" ON "CostRecord"("accountId","skuId","channelScopeKey","marketplaceScopeKey","sourceKind","costKey");

CREATE TABLE "CostRecordRevision" (
 "id" TEXT NOT NULL PRIMARY KEY, "accountId" TEXT NOT NULL, "costRecordId" TEXT NOT NULL,
 "revision" INTEGER NOT NULL, "previousRevisionId" TEXT, "operationKey" TEXT NOT NULL,
 "inputChecksum" TEXT NOT NULL, "status" TEXT NOT NULL, "authorityTier" TEXT NOT NULL,
 "effectiveFrom" DATETIME NOT NULL, "effectiveTo" DATETIME,
 "unitCostAtoms" BIGINT, "unitCostScale" INTEGER, "currencyCode" TEXT,
 "evidenceKind" TEXT NOT NULL, "actorRef" TEXT, "manualReasonCode" TEXT,
 "rawSourceRecordId" TEXT, "normalizationRunId" TEXT, "mappingVersionId" TEXT,
 "normalizationRevision" INTEGER, "syncSliceEvidenceId" TEXT, "sourceLeafPath" TEXT,
 "occurredAt" DATETIME, "postedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(revision>=1), CHECK(status IN ('PRESENT','WITHDRAWN')),
 CHECK(authorityTier IN ('MANUAL_OVERRIDE','SOURCE_ACTUAL','SOURCE_PROVISIONAL')),
 CHECK(evidenceKind IN ('MANUAL','SOURCE')),
 CHECK(effectiveTo IS NULL OR effectiveFrom<effectiveTo),
 CHECK((status='WITHDRAWN' AND unitCostAtoms IS NULL AND unitCostScale IS NULL AND currencyCode IS NULL) OR
       (status='PRESENT' AND unitCostAtoms IS NOT NULL AND unitCostAtoms>=0 AND unitCostScale BETWEEN 0 AND 12 AND currencyCode GLOB '[A-Z][A-Z][A-Z]')),
 CHECK((evidenceKind='MANUAL' AND actorRef IS NOT NULL AND manualReasonCode IS NOT NULL AND rawSourceRecordId IS NULL AND normalizationRunId IS NULL AND mappingVersionId IS NULL AND normalizationRevision IS NULL AND syncSliceEvidenceId IS NULL AND sourceLeafPath IS NULL) OR
       (evidenceKind='SOURCE' AND actorRef IS NULL AND manualReasonCode IS NULL AND rawSourceRecordId IS NOT NULL AND normalizationRunId IS NOT NULL AND mappingVersionId IS NOT NULL AND normalizationRevision IS NOT NULL AND syncSliceEvidenceId IS NOT NULL AND sourceLeafPath IS NOT NULL))
);
CREATE UNIQUE INDEX "CostRecordRevision_id_accountId_key" ON "CostRecordRevision"("id","accountId");
CREATE UNIQUE INDEX "CostRecordRevision_costRecordId_revision_key" ON "CostRecordRevision"("costRecordId","revision");
CREATE UNIQUE INDEX "CostRecordRevision_costRecordId_operationKey_key" ON "CostRecordRevision"("costRecordId","operationKey");
CREATE UNIQUE INDEX "CostRecordRevision_previousRevisionId_key" ON "CostRecordRevision"("previousRevisionId");

CREATE TABLE "InventoryEconomicLot" (
 "id" TEXT NOT NULL PRIMARY KEY, "accountId" TEXT NOT NULL, "channelConnectionId" TEXT NOT NULL,
 "marketplaceId" TEXT, "marketplaceScopeKey" TEXT NOT NULL, "skuId" TEXT NOT NULL,
 "lotKey" TEXT NOT NULL, "originKind" TEXT NOT NULL, "orderId" TEXT, "orderRevisionId" TEXT,
 "itemId" TEXT, "itemRevisionId" TEXT, "quantityAtoms" BIGINT NOT NULL, "quantityScale" INTEGER NOT NULL,
 "costStatus" TEXT NOT NULL, "costRecordRevisionId" TEXT, "unitCostAtoms" BIGINT,
 "unitCostScale" INTEGER, "currencyCode" TEXT, "recognitionEconomicAt" DATETIME NOT NULL,
 "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "operationKey" TEXT NOT NULL,
 "inputChecksum" TEXT NOT NULL, "rawSourceRecordId" TEXT, "normalizationRunId" TEXT,
 "mappingVersionId" TEXT, "normalizationRevision" INTEGER, "syncSliceEvidenceId" TEXT,
 "sourceLeafPath" TEXT, "actorRef" TEXT, "manualReasonCode" TEXT,
 CHECK((marketplaceId IS NULL AND marketplaceScopeKey='@none') OR marketplaceScopeKey=marketplaceId),
 CHECK(originKind IN ('SALE_ITEM','REPLACEMENT_ITEM','EXTERNAL_INVENTORY')),
 CHECK(quantityAtoms>0 AND quantityScale BETWEEN 0 AND 12),
 CHECK(costStatus IN ('KNOWN','UNKNOWN')),
 CHECK((costStatus='UNKNOWN' AND costRecordRevisionId IS NULL AND unitCostAtoms IS NULL AND unitCostScale IS NULL AND currencyCode IS NULL) OR
       (costStatus='KNOWN' AND costRecordRevisionId IS NOT NULL AND unitCostAtoms IS NOT NULL AND unitCostAtoms>=0 AND unitCostScale BETWEEN 0 AND 12 AND currencyCode GLOB '[A-Z][A-Z][A-Z]'))
);
CREATE UNIQUE INDEX "InventoryEconomicLot_id_accountId_channelConnectionId_key" ON "InventoryEconomicLot"("id","accountId","channelConnectionId");
CREATE UNIQUE INDEX "InventoryEconomicLot_accountId_channelConnectionId_lotKey_key" ON "InventoryEconomicLot"("accountId","channelConnectionId","lotKey");
CREATE UNIQUE INDEX "InventoryEconomicLot_accountId_channelConnectionId_operationKey_key" ON "InventoryEconomicLot"("accountId","channelConnectionId","operationKey");

CREATE TABLE "InventoryEconomicEvent" (
 "id" TEXT NOT NULL PRIMARY KEY, "accountId" TEXT NOT NULL, "channelConnectionId" TEXT NOT NULL,
 "lotId" TEXT NOT NULL, "eventType" TEXT NOT NULL, "effectClass" TEXT NOT NULL,
 "stateFrom" TEXT, "stateTo" TEXT, "quantityAtoms" BIGINT NOT NULL, "quantityScale" INTEGER NOT NULL,
 "costRecordRevisionId" TEXT, "unitCostAtoms" BIGINT, "unitCostScale" INTEGER, "currencyCode" TEXT,
 "financialLedgerEntryId" TEXT, "compensatesEventId" TEXT, "coverageKey" TEXT, "closureKey" TEXT,
 "operationKey" TEXT NOT NULL, "inputChecksum" TEXT NOT NULL, "economicAt" DATETIME NOT NULL,
 "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "rawSourceRecordId" TEXT,
 "normalizationRunId" TEXT, "mappingVersionId" TEXT, "normalizationRevision" INTEGER,
 "syncSliceEvidenceId" TEXT, "sourceLeafPath" TEXT, "actorRef" TEXT, "manualReasonCode" TEXT,
 CHECK(eventType IN ('SALE_RECOGNITION','COST_BASIS_RESOLVED','COST_CORRECTION','RETURN_INITIATED','RETURN_RECEIVED','RESTOCKED_SELLABLE','RESTOCKED_UNSELLABLE','LOST','DAMAGED','DISPOSED','LIQUIDATED','REIMBURSEMENT_LINKED','REPLACEMENT_SENT','COMPENSATION')),
 CHECK(effectClass IN ('PHYSICAL','COST_BASIS','COMPENSATION')),
 CHECK(stateFrom IS NULL OR stateFrom IN ('SOLD','RETURN_IN_TRANSIT','RETURNED_PENDING_INSPECTION','SELLABLE','UNSELLABLE','LOST','DAMAGED','DISPOSED','LIQUIDATED')),
 CHECK(stateTo IS NULL OR stateTo IN ('SOLD','RETURN_IN_TRANSIT','RETURNED_PENDING_INSPECTION','SELLABLE','UNSELLABLE','LOST','DAMAGED','DISPOSED','LIQUIDATED')),
 CHECK(quantityAtoms>0 AND quantityScale BETWEEN 0 AND 12),
 CHECK((unitCostAtoms IS NULL AND unitCostScale IS NULL AND currencyCode IS NULL) OR (unitCostAtoms>=0 AND unitCostScale BETWEEN 0 AND 12 AND currencyCode GLOB '[A-Z][A-Z][A-Z]')),
 CHECK((eventType='REIMBURSEMENT_LINKED' AND financialLedgerEntryId IS NOT NULL AND stateFrom IN ('LOST','DAMAGED') AND stateTo=stateFrom) OR eventType<>'REIMBURSEMENT_LINKED'),
 CHECK((eventType='COMPENSATION' AND compensatesEventId IS NOT NULL) OR eventType<>'COMPENSATION')
);
CREATE UNIQUE INDEX "InventoryEconomicEvent_id_accountId_channelConnectionId_key" ON "InventoryEconomicEvent"("id","accountId","channelConnectionId");
CREATE UNIQUE INDEX "InventoryEconomicEvent_lotId_operationKey_key" ON "InventoryEconomicEvent"("lotId","operationKey");
CREATE UNIQUE INDEX "InventoryEconomicEvent_financialLedgerEntryId_key" ON "InventoryEconomicEvent"("financialLedgerEntryId");

CREATE TABLE "ReplacementLink" (
 "id" TEXT NOT NULL PRIMARY KEY, "accountId" TEXT NOT NULL, "channelConnectionId" TEXT NOT NULL,
 "linkKey" TEXT NOT NULL, "revision" INTEGER NOT NULL, "previousLinkId" TEXT,
 "operationKey" TEXT NOT NULL, "inputChecksum" TEXT NOT NULL, "status" TEXT NOT NULL,
 "replacementKind" TEXT NOT NULL, "financialTreatment" TEXT NOT NULL,
 "predecessorItemId" TEXT NOT NULL, "predecessorItemRevisionId" TEXT NOT NULL,
 "replacementItemId" TEXT NOT NULL, "replacementItemRevisionId" TEXT NOT NULL,
 "rawSourceRecordId" TEXT, "normalizationRunId" TEXT, "mappingVersionId" TEXT,
 "normalizationRevision" INTEGER, "syncSliceEvidenceId" TEXT, "sourceLeafPath" TEXT,
 "actorRef" TEXT, "manualReasonCode" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(revision>=1), CHECK(status IN ('PRESENT','WITHDRAWN')),
 CHECK(replacementKind IN ('FREE','CHARGED','LOSS_REPLACEMENT','DAMAGE_REPLACEMENT','RETURN_REPLACEMENT')),
 CHECK(financialTreatment IN ('NO_REVENUE','D2B_COMPONENT','UNKNOWN')),
 CHECK(predecessorItemId<>replacementItemId), CHECK(predecessorItemRevisionId<>replacementItemRevisionId)
);
CREATE UNIQUE INDEX "ReplacementLink_id_accountId_channelConnectionId_key" ON "ReplacementLink"("id","accountId","channelConnectionId");
CREATE UNIQUE INDEX "ReplacementLink_accountId_channelConnectionId_linkKey_revision_key" ON "ReplacementLink"("accountId","channelConnectionId","linkKey","revision");
CREATE UNIQUE INDEX "ReplacementLink_accountId_channelConnectionId_linkKey_operationKey_key" ON "ReplacementLink"("accountId","channelConnectionId","linkKey","operationKey");
CREATE UNIQUE INDEX "ReplacementLink_previousLinkId_key" ON "ReplacementLink"("previousLinkId");

CREATE TABLE "NormalizedTaxEvidence" (
 "id" TEXT NOT NULL PRIMARY KEY, "accountId" TEXT NOT NULL, "channelConnectionId" TEXT NOT NULL,
 "evidenceKey" TEXT NOT NULL, "revision" INTEGER NOT NULL, "previousEvidenceId" TEXT,
 "operationKey" TEXT NOT NULL, "inputChecksum" TEXT NOT NULL, "status" TEXT NOT NULL,
 "marketplaceId" TEXT, "orderId" TEXT, "orderRevisionId" TEXT, "itemId" TEXT,
 "itemRevisionId" TEXT, "financialLedgerEntryId" TEXT, "category" TEXT NOT NULL,
 "economicRole" TEXT NOT NULL, "priceRelation" TEXT NOT NULL, "authorityClass" TEXT NOT NULL,
 "availability" TEXT NOT NULL, "coverageState" TEXT NOT NULL, "confidence" TEXT NOT NULL,
 "amountAtoms" BIGINT, "amountScale" INTEGER, "currencyCode" TEXT, "jurisdictionCode" TEXT,
 "periodStart" DATETIME, "periodEnd" DATETIME, "rawSourceRecordId" TEXT,
 "normalizationRunId" TEXT, "mappingVersionId" TEXT, "normalizationRevision" INTEGER,
 "syncSliceEvidenceId" TEXT, "sourceLeafPath" TEXT, "actorRef" TEXT, "manualReasonCode" TEXT,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(revision>=1), CHECK(status IN ('PRESENT','WITHDRAWN')),
 CHECK(economicRole IN ('COLLECTED','WITHHELD','REMITTED','REFUNDED','ASSESSED','INFORMATIONAL','UNKNOWN')),
 CHECK(priceRelation IN ('INCLUDED','EXCLUDED','NOT_APPLICABLE','UNKNOWN')),
 CHECK(authorityClass IN ('ACTUAL','PROVISIONAL','UNKNOWN')),
 CHECK(availability IN ('PRESENT','CONFIRMED_ZERO','UNAVAILABLE','UNKNOWN')),
 CHECK(coverageState IN ('COMPLETE','INCOMPLETE','UNKNOWN')),
 CHECK((availability IN ('UNAVAILABLE','UNKNOWN') AND amountAtoms IS NULL AND amountScale IS NULL AND currencyCode IS NULL) OR
       (availability='CONFIRMED_ZERO' AND amountAtoms=0 AND amountScale BETWEEN 0 AND 12 AND currencyCode GLOB '[A-Z][A-Z][A-Z]' AND rawSourceRecordId IS NOT NULL AND syncSliceEvidenceId IS NOT NULL) OR
       (availability='PRESENT' AND amountAtoms IS NOT NULL AND amountScale BETWEEN 0 AND 12 AND currencyCode GLOB '[A-Z][A-Z][A-Z]')),
 CHECK((periodStart IS NULL AND periodEnd IS NULL) OR (periodStart IS NOT NULL AND periodEnd IS NOT NULL AND periodStart<periodEnd))
);
CREATE UNIQUE INDEX "NormalizedTaxEvidence_id_accountId_channelConnectionId_key" ON "NormalizedTaxEvidence"("id","accountId","channelConnectionId");
CREATE UNIQUE INDEX "NormalizedTaxEvidence_accountId_channelConnectionId_evidenceKey_revision_key" ON "NormalizedTaxEvidence"("accountId","channelConnectionId","evidenceKey","revision");
CREATE UNIQUE INDEX "NormalizedTaxEvidence_accountId_channelConnectionId_evidenceKey_operationKey_key" ON "NormalizedTaxEvidence"("accountId","channelConnectionId","evidenceKey","operationKey");
CREATE UNIQUE INDEX "NormalizedTaxEvidence_previousEvidenceId_key" ON "NormalizedTaxEvidence"("previousEvidenceId");

CREATE TABLE "TaxInterpretationPolicyVersion" (
 "id" TEXT NOT NULL PRIMARY KEY, "accountId" TEXT NOT NULL, "policyKey" TEXT NOT NULL,
 "revision" INTEGER NOT NULL, "previousPolicyVersionId" TEXT, "operationKey" TEXT NOT NULL,
 "inputChecksum" TEXT NOT NULL, "status" TEXT NOT NULL, "rulesJson" TEXT NOT NULL,
 "effectiveFrom" DATETIME NOT NULL, "effectiveTo" DATETIME, "actorRef" TEXT NOT NULL,
 "reasonCode" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(revision>=1), CHECK(status IN ('PRESENT','WITHDRAWN')),
 CHECK(json_valid(rulesJson)), CHECK(effectiveTo IS NULL OR effectiveFrom<effectiveTo)
);
CREATE UNIQUE INDEX "TaxInterpretationPolicyVersion_id_accountId_key" ON "TaxInterpretationPolicyVersion"("id","accountId");
CREATE UNIQUE INDEX "TaxInterpretationPolicyVersion_accountId_policyKey_revision_key" ON "TaxInterpretationPolicyVersion"("accountId","policyKey","revision");
CREATE UNIQUE INDEX "TaxInterpretationPolicyVersion_accountId_policyKey_operationKey_key" ON "TaxInterpretationPolicyVersion"("accountId","policyKey","operationKey");
CREATE UNIQUE INDEX "TaxInterpretationPolicyVersion_previousPolicyVersionId_key" ON "TaxInterpretationPolicyVersion"("previousPolicyVersionId");

-- Ownership/reference validation is trigger-based so every path, including raw SQL, is checked.
CREATE TRIGGER "CostRecord_validate_insert" BEFORE INSERT ON "CostRecord" BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM CostRecord x WHERE x.id=NEW.id OR (x.accountId=NEW.accountId AND x.skuId=NEW.skuId AND x.channelScopeKey=NEW.channelScopeKey AND x.marketplaceScopeKey=NEW.marketplaceScopeKey AND x.sourceKind=NEW.sourceKind AND x.costKey=NEW.costKey)) THEN RAISE(ABORT,'D2C immutable collision') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM Account a WHERE a.id=NEW.accountId) THEN RAISE(ABORT,'D2C owner mismatch') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM Sku s WHERE s.id=NEW.skuId AND s.accountId=NEW.accountId) THEN RAISE(ABORT,'D2C sku mismatch') END;
 SELECT CASE WHEN NEW.channelConnectionId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM ChannelConnection c WHERE c.id=NEW.channelConnectionId AND c.accountId=NEW.accountId) THEN RAISE(ABORT,'D2C channel mismatch') END;
 SELECT CASE WHEN NEW.marketplaceId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM Marketplace m WHERE m.id=NEW.marketplaceId AND m.accountId=NEW.accountId AND (NEW.channelConnectionId IS NULL OR m.channelConnectionId=NEW.channelConnectionId)) THEN RAISE(ABORT,'D2C marketplace mismatch') END;
END;
CREATE TRIGGER "CostRecordRevision_validate_insert" BEFORE INSERT ON "CostRecordRevision" BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM CostRecordRevision x WHERE x.id=NEW.id OR (x.costRecordId=NEW.costRecordId AND (x.revision=NEW.revision OR x.operationKey=NEW.operationKey)) OR x.previousRevisionId=NEW.previousRevisionId AND NEW.previousRevisionId IS NOT NULL) THEN RAISE(ABORT,'D2C immutable collision') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM CostRecord h WHERE h.id=NEW.costRecordId AND h.accountId=NEW.accountId AND h.revision=NEW.revision-1 AND ((NEW.revision=1 AND NEW.previousRevisionId IS NULL) OR (NEW.revision>1 AND h.currentRevisionId=NEW.previousRevisionId))) THEN RAISE(ABORT,'D2C revision continuity') END;
 SELECT CASE WHEN NEW.evidenceKind='SOURCE' AND NOT EXISTS(SELECT 1 FROM CostRecord h JOIN SyncSliceEvidence e ON e.id=NEW.syncSliceEvidenceId JOIN NormalizationRun n ON n.id=NEW.normalizationRunId JOIN RawSourceRecord r ON r.id=NEW.rawSourceRecordId WHERE h.id=NEW.costRecordId AND e.accountId=NEW.accountId AND (h.channelConnectionId IS NULL OR e.channelConnectionId=h.channelConnectionId) AND e.rawSourceRecordId=r.id AND e.normalizationRunId=n.id AND n.rawSourceRecordId=r.id AND n.mappingVersionId=NEW.mappingVersionId AND n.normalizationRevision=NEW.normalizationRevision) THEN RAISE(ABORT,'D2C provenance mismatch') END;
END;
CREATE TRIGGER "InventoryEconomicLot_validate_insert" BEFORE INSERT ON "InventoryEconomicLot" BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM InventoryEconomicLot x WHERE x.id=NEW.id OR (x.accountId=NEW.accountId AND x.channelConnectionId=NEW.channelConnectionId AND (x.lotKey=NEW.lotKey OR x.operationKey=NEW.operationKey))) THEN RAISE(ABORT,'D2C immutable collision') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM ChannelConnection c WHERE c.id=NEW.channelConnectionId AND c.accountId=NEW.accountId) THEN RAISE(ABORT,'D2C channel mismatch') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM Sku s WHERE s.id=NEW.skuId AND s.accountId=NEW.accountId) THEN RAISE(ABORT,'D2C sku mismatch') END;
 SELECT CASE WHEN NEW.marketplaceId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM Marketplace m WHERE m.id=NEW.marketplaceId AND m.accountId=NEW.accountId AND m.channelConnectionId=NEW.channelConnectionId) THEN RAISE(ABORT,'D2C marketplace mismatch') END;
 SELECT CASE WHEN (NEW.orderId IS NULL)<>(NEW.orderRevisionId IS NULL) OR NEW.orderRevisionId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM NormalizedOrderRevision r JOIN NormalizedOrder o ON o.id=r.orderId WHERE r.id=NEW.orderRevisionId AND o.id=NEW.orderId AND o.accountId=NEW.accountId AND o.channelConnectionId=NEW.channelConnectionId) THEN RAISE(ABORT,'D2C order revision mismatch') END;
 SELECT CASE WHEN (NEW.itemId IS NULL)<>(NEW.itemRevisionId IS NULL) OR NEW.itemRevisionId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM NormalizedOrderItemRevision r JOIN NormalizedOrderItem i ON i.id=r.itemId WHERE r.id=NEW.itemRevisionId AND i.id=NEW.itemId AND i.accountId=NEW.accountId AND i.channelConnectionId=NEW.channelConnectionId AND r.skuId=NEW.skuId AND (NEW.orderId IS NULL OR i.orderId=NEW.orderId)) THEN RAISE(ABORT,'D2C item/SKU revision mismatch') END;
 SELECT CASE WHEN NEW.costRecordRevisionId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM CostRecordRevision r JOIN CostRecord h ON h.id=r.costRecordId WHERE r.id=NEW.costRecordRevisionId AND r.accountId=NEW.accountId AND r.status='PRESENT' AND h.skuId=NEW.skuId AND (h.channelConnectionId IS NULL OR h.channelConnectionId=NEW.channelConnectionId) AND (h.marketplaceId IS NULL OR h.marketplaceId=NEW.marketplaceId) AND r.unitCostAtoms=NEW.unitCostAtoms AND r.unitCostScale=NEW.unitCostScale AND r.currencyCode=NEW.currencyCode) THEN RAISE(ABORT,'D2C cost revision mismatch') END;
 SELECT CASE WHEN NEW.rawSourceRecordId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM SyncSliceEvidence e JOIN NormalizationRun n ON n.id=NEW.normalizationRunId WHERE e.id=NEW.syncSliceEvidenceId AND e.accountId=NEW.accountId AND e.channelConnectionId=NEW.channelConnectionId AND e.rawSourceRecordId=NEW.rawSourceRecordId AND e.normalizationRunId=NEW.normalizationRunId AND n.mappingVersionId=NEW.mappingVersionId AND n.normalizationRevision=NEW.normalizationRevision) THEN RAISE(ABORT,'D2C provenance mismatch') END;
 SELECT CASE WHEN (NEW.rawSourceRecordId IS NULL)<>(NEW.normalizationRunId IS NULL) OR (NEW.rawSourceRecordId IS NULL)<>(NEW.mappingVersionId IS NULL) OR (NEW.rawSourceRecordId IS NULL)<>(NEW.normalizationRevision IS NULL) OR (NEW.rawSourceRecordId IS NULL)<>(NEW.syncSliceEvidenceId IS NULL) OR (NEW.rawSourceRecordId IS NULL)<>(NEW.sourceLeafPath IS NULL) THEN RAISE(ABORT,'D2C incomplete provenance') END;
END;
CREATE TRIGGER "InventoryEconomicEvent_validate_insert" BEFORE INSERT ON "InventoryEconomicEvent" BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM InventoryEconomicEvent x WHERE x.id=NEW.id OR (x.lotId=NEW.lotId AND x.operationKey=NEW.operationKey) OR (NEW.financialLedgerEntryId IS NOT NULL AND x.financialLedgerEntryId=NEW.financialLedgerEntryId)) THEN RAISE(ABORT,'D2C immutable collision') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM InventoryEconomicLot l WHERE l.id=NEW.lotId AND l.accountId=NEW.accountId AND l.channelConnectionId=NEW.channelConnectionId AND l.quantityScale=NEW.quantityScale) THEN RAISE(ABORT,'D2C lot mismatch') END;
 SELECT CASE WHEN NEW.effectClass='PHYSICAL' AND NOT (
  (NEW.eventType IN ('SALE_RECOGNITION','REPLACEMENT_SENT') AND NEW.stateFrom IS NULL AND NEW.stateTo='SOLD') OR
  (NEW.eventType='RETURN_INITIATED' AND NEW.stateFrom='SOLD' AND NEW.stateTo='RETURN_IN_TRANSIT') OR
  (NEW.eventType='RETURN_RECEIVED' AND NEW.stateFrom IN ('SOLD','RETURN_IN_TRANSIT') AND NEW.stateTo='RETURNED_PENDING_INSPECTION') OR
  (NEW.eventType='RESTOCKED_SELLABLE' AND NEW.stateFrom='RETURNED_PENDING_INSPECTION' AND NEW.stateTo='SELLABLE') OR
  (NEW.eventType='RESTOCKED_UNSELLABLE' AND NEW.stateFrom='RETURNED_PENDING_INSPECTION' AND NEW.stateTo='UNSELLABLE') OR
  (NEW.eventType='LOST' AND NEW.stateFrom IN ('SOLD','RETURN_IN_TRANSIT','RETURNED_PENDING_INSPECTION','SELLABLE') AND NEW.stateTo='LOST') OR
  (NEW.eventType='DAMAGED' AND NEW.stateFrom IN ('SOLD','RETURN_IN_TRANSIT','RETURNED_PENDING_INSPECTION','SELLABLE') AND NEW.stateTo='DAMAGED') OR
  (NEW.eventType='DISPOSED' AND NEW.stateFrom IN ('UNSELLABLE','DAMAGED') AND NEW.stateTo='DISPOSED') OR
  (NEW.eventType='LIQUIDATED' AND NEW.stateFrom IN ('SELLABLE','UNSELLABLE','DAMAGED') AND NEW.stateTo='LIQUIDATED')) THEN RAISE(ABORT,'D2C invalid physical transition') END;
 SELECT CASE WHEN NEW.eventType='COST_BASIS_RESOLVED' AND (NEW.costRecordRevisionId IS NULL OR NEW.unitCostAtoms IS NULL OR NEW.unitCostScale IS NULL OR NEW.currencyCode IS NULL OR NOT EXISTS(SELECT 1 FROM InventoryEconomicLot l JOIN CostRecordRevision r ON r.id=NEW.costRecordRevisionId JOIN CostRecord h ON h.id=r.costRecordId WHERE l.id=NEW.lotId AND r.accountId=NEW.accountId AND r.status='PRESENT' AND h.skuId=l.skuId AND (h.channelConnectionId IS NULL OR h.channelConnectionId=l.channelConnectionId) AND (h.marketplaceId IS NULL OR h.marketplaceId=l.marketplaceId) AND r.unitCostAtoms=NEW.unitCostAtoms AND r.unitCostScale=NEW.unitCostScale AND r.currencyCode=NEW.currencyCode)) THEN RAISE(ABORT,'D2C invalid cost resolution') END;
 SELECT CASE WHEN NEW.costRecordRevisionId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM InventoryEconomicLot l JOIN CostRecordRevision r ON r.id=NEW.costRecordRevisionId JOIN CostRecord h ON h.id=r.costRecordId WHERE l.id=NEW.lotId AND r.accountId=NEW.accountId AND r.status='PRESENT' AND h.skuId=l.skuId AND r.unitCostAtoms=NEW.unitCostAtoms AND r.unitCostScale=NEW.unitCostScale AND r.currencyCode=NEW.currencyCode) THEN RAISE(ABORT,'D2C event cost mismatch') END;
 SELECT CASE WHEN NEW.effectClass='PHYSICAL' AND NEW.stateFrom IS NOT NULL AND COALESCE((SELECT SUM(CASE WHEN stateTo=NEW.stateFrom THEN quantityAtoms ELSE 0 END)-SUM(CASE WHEN stateFrom=NEW.stateFrom THEN quantityAtoms ELSE 0 END) FROM InventoryEconomicEvent WHERE lotId=NEW.lotId AND (effectClass='PHYSICAL' OR (effectClass='COMPENSATION' AND stateFrom IS NOT NULL AND stateTo IS NOT NULL))),0)<NEW.quantityAtoms THEN RAISE(ABORT,'D2C insufficient state balance') END;
 SELECT CASE WHEN NEW.effectClass='PHYSICAL' AND NEW.stateFrom IS NULL AND COALESCE((SELECT SUM(quantityAtoms) FROM InventoryEconomicEvent WHERE lotId=NEW.lotId AND effectClass='PHYSICAL' AND stateFrom IS NULL),0)+NEW.quantityAtoms>(SELECT quantityAtoms FROM InventoryEconomicLot WHERE id=NEW.lotId) THEN RAISE(ABORT,'D2C physical quantity exceeds lot') END;
 SELECT CASE WHEN NEW.eventType='COMPENSATION' AND (NOT EXISTS(SELECT 1 FROM InventoryEconomicEvent t WHERE t.id=NEW.compensatesEventId AND t.lotId=NEW.lotId) OR COALESCE((SELECT SUM(quantityAtoms) FROM InventoryEconomicEvent WHERE compensatesEventId=NEW.compensatesEventId),0)+NEW.quantityAtoms>(SELECT quantityAtoms FROM InventoryEconomicEvent WHERE id=NEW.compensatesEventId) OR (NEW.stateFrom IS NOT NULL AND COALESCE((SELECT SUM(CASE WHEN stateTo=NEW.stateFrom THEN quantityAtoms ELSE 0 END)-SUM(CASE WHEN stateFrom=NEW.stateFrom THEN quantityAtoms ELSE 0 END) FROM InventoryEconomicEvent WHERE lotId=NEW.lotId AND (effectClass='PHYSICAL' OR (effectClass='COMPENSATION' AND stateFrom IS NOT NULL AND stateTo IS NOT NULL))),0)<NEW.quantityAtoms)) THEN RAISE(ABORT,'D2C excessive compensation') END;
 SELECT CASE WHEN NEW.eventType='COMPENSATION' AND NEW.stateFrom IN ('LOST','DAMAGED') AND NEW.stateTo<>NEW.stateFrom AND NOT EXISTS(SELECT 1 FROM InventoryEconomicEvent t WHERE t.id=NEW.compensatesEventId AND t.lotId=NEW.lotId AND t.eventType='REIMBURSEMENT_LINKED' AND t.stateFrom=NEW.stateFrom) THEN RAISE(ABORT,'D2C reimbursed recovery requires reimbursement compensation') END;
 SELECT CASE WHEN NEW.eventType='REIMBURSEMENT_LINKED' AND (NOT EXISTS(SELECT 1 FROM FinancialLedgerEntry le JOIN FinancialComponentSelection s ON s.entryId=le.id JOIN FinancialAuthorityDecision d ON d.id=s.decisionId WHERE le.id=NEW.financialLedgerEntryId AND le.accountId=NEW.accountId AND le.channelConnectionId=NEW.channelConnectionId AND le.projectionKind='REIMBURSEMENT' AND le.state='PRESENT' AND d.status='PUBLISHED' AND d.accountId=NEW.accountId AND d.channelConnectionId=NEW.channelConnectionId) OR COALESCE((SELECT SUM(quantityAtoms) FROM InventoryEconomicEvent WHERE lotId=NEW.lotId AND eventType='REIMBURSEMENT_LINKED' AND stateFrom=NEW.stateFrom),0)+NEW.quantityAtoms>COALESCE((SELECT SUM(CASE WHEN stateTo=NEW.stateFrom THEN quantityAtoms ELSE 0 END)-SUM(CASE WHEN stateFrom=NEW.stateFrom THEN quantityAtoms ELSE 0 END) FROM InventoryEconomicEvent WHERE lotId=NEW.lotId AND effectClass='PHYSICAL'),0)) THEN RAISE(ABORT,'D2C excessive reimbursement allocation') END;
 SELECT CASE WHEN NEW.financialLedgerEntryId IS NOT NULL AND NEW.eventType<>'REIMBURSEMENT_LINKED' AND NOT EXISTS(SELECT 1 FROM FinancialLedgerEntry le WHERE le.id=NEW.financialLedgerEntryId AND le.accountId=NEW.accountId AND le.channelConnectionId=NEW.channelConnectionId) THEN RAISE(ABORT,'D2C ledger mismatch') END;
 SELECT CASE WHEN NEW.rawSourceRecordId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM SyncSliceEvidence e JOIN NormalizationRun n ON n.id=NEW.normalizationRunId WHERE e.id=NEW.syncSliceEvidenceId AND e.accountId=NEW.accountId AND e.channelConnectionId=NEW.channelConnectionId AND e.rawSourceRecordId=NEW.rawSourceRecordId AND e.normalizationRunId=NEW.normalizationRunId AND n.mappingVersionId=NEW.mappingVersionId AND n.normalizationRevision=NEW.normalizationRevision) THEN RAISE(ABORT,'D2C provenance mismatch') END;
 SELECT CASE WHEN (NEW.rawSourceRecordId IS NULL)<>(NEW.normalizationRunId IS NULL) OR (NEW.rawSourceRecordId IS NULL)<>(NEW.mappingVersionId IS NULL) OR (NEW.rawSourceRecordId IS NULL)<>(NEW.normalizationRevision IS NULL) OR (NEW.rawSourceRecordId IS NULL)<>(NEW.syncSliceEvidenceId IS NULL) OR (NEW.rawSourceRecordId IS NULL)<>(NEW.sourceLeafPath IS NULL) THEN RAISE(ABORT,'D2C incomplete provenance') END;
END;
CREATE TRIGGER "ReplacementLink_validate_insert" BEFORE INSERT ON "ReplacementLink" BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM ReplacementLink x WHERE x.id=NEW.id OR (x.accountId=NEW.accountId AND x.channelConnectionId=NEW.channelConnectionId AND x.linkKey=NEW.linkKey AND (x.revision=NEW.revision OR x.operationKey=NEW.operationKey)) OR x.previousLinkId=NEW.previousLinkId AND NEW.previousLinkId IS NOT NULL) THEN RAISE(ABORT,'D2C immutable collision') END;
 SELECT CASE WHEN NEW.replacementKind='FREE' AND NEW.financialTreatment<>'NO_REVENUE' THEN RAISE(ABORT,'D2C free replacement cannot have revenue') END;
 SELECT CASE WHEN NEW.revision<>COALESCE((SELECT MAX(revision)+1 FROM ReplacementLink WHERE accountId=NEW.accountId AND channelConnectionId=NEW.channelConnectionId AND linkKey=NEW.linkKey),1) THEN RAISE(ABORT,'D2C revision continuity') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM NormalizedOrderItemRevision r JOIN NormalizedOrderItem i ON i.id=r.itemId WHERE r.id=NEW.predecessorItemRevisionId AND i.id=NEW.predecessorItemId AND i.accountId=NEW.accountId AND i.channelConnectionId=NEW.channelConnectionId) OR NOT EXISTS(SELECT 1 FROM NormalizedOrderItemRevision r JOIN NormalizedOrderItem i ON i.id=r.itemId WHERE r.id=NEW.replacementItemRevisionId AND i.id=NEW.replacementItemId AND i.accountId=NEW.accountId AND i.channelConnectionId=NEW.channelConnectionId) THEN RAISE(ABORT,'D2C replacement item mismatch') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM ReplacementLink x WHERE x.accountId=NEW.accountId AND x.channelConnectionId=NEW.channelConnectionId AND x.status='PRESENT' AND x.replacementItemId=NEW.predecessorItemId AND x.predecessorItemId=NEW.replacementItemId) THEN RAISE(ABORT,'D2C replacement cycle') END;
 SELECT CASE WHEN NEW.status='PRESENT' AND EXISTS(SELECT 1 FROM ReplacementLink x WHERE x.accountId=NEW.accountId AND x.channelConnectionId=NEW.channelConnectionId AND x.status='PRESENT' AND x.replacementItemId=NEW.replacementItemId AND x.linkKey<>NEW.linkKey) THEN RAISE(ABORT,'D2C contradictory replacement predecessor') END;
 WITH RECURSIVE replacement_chain(item) AS (
   SELECT NEW.replacementItemId
   UNION
   SELECT x.replacementItemId FROM ReplacementLink x JOIN replacement_chain c ON x.predecessorItemId=c.item WHERE x.accountId=NEW.accountId AND x.channelConnectionId=NEW.channelConnectionId AND x.status='PRESENT'
 ) SELECT CASE WHEN NEW.status='PRESENT' AND EXISTS(SELECT 1 FROM replacement_chain WHERE item=NEW.predecessorItemId) THEN RAISE(ABORT,'D2C replacement cycle') END;
END;
CREATE TRIGGER "NormalizedTaxEvidence_validate_insert" BEFORE INSERT ON "NormalizedTaxEvidence" BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM NormalizedTaxEvidence x WHERE x.id=NEW.id OR (x.accountId=NEW.accountId AND x.channelConnectionId=NEW.channelConnectionId AND x.evidenceKey=NEW.evidenceKey AND (x.revision=NEW.revision OR x.operationKey=NEW.operationKey)) OR x.previousEvidenceId=NEW.previousEvidenceId AND NEW.previousEvidenceId IS NOT NULL) THEN RAISE(ABORT,'D2C immutable collision') END;
 SELECT CASE WHEN NEW.revision<>COALESCE((SELECT MAX(revision)+1 FROM NormalizedTaxEvidence WHERE accountId=NEW.accountId AND channelConnectionId=NEW.channelConnectionId AND evidenceKey=NEW.evidenceKey),1) THEN RAISE(ABORT,'D2C revision continuity') END;
 SELECT CASE WHEN NEW.rawSourceRecordId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM SyncSliceEvidence e JOIN NormalizationRun n ON n.id=NEW.normalizationRunId WHERE e.id=NEW.syncSliceEvidenceId AND e.accountId=NEW.accountId AND e.channelConnectionId=NEW.channelConnectionId AND e.rawSourceRecordId=NEW.rawSourceRecordId AND e.normalizationRunId=NEW.normalizationRunId AND n.mappingVersionId=NEW.mappingVersionId AND n.normalizationRevision=NEW.normalizationRevision) THEN RAISE(ABORT,'D2C provenance mismatch') END;
 SELECT CASE WHEN (NEW.rawSourceRecordId IS NULL)<>(NEW.normalizationRunId IS NULL) OR (NEW.rawSourceRecordId IS NULL)<>(NEW.mappingVersionId IS NULL) OR (NEW.rawSourceRecordId IS NULL)<>(NEW.normalizationRevision IS NULL) OR (NEW.rawSourceRecordId IS NULL)<>(NEW.syncSliceEvidenceId IS NULL) OR (NEW.rawSourceRecordId IS NULL)<>(NEW.sourceLeafPath IS NULL) THEN RAISE(ABORT,'D2C incomplete provenance') END;
 SELECT CASE WHEN NEW.marketplaceId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM Marketplace m WHERE m.id=NEW.marketplaceId AND m.accountId=NEW.accountId AND m.channelConnectionId=NEW.channelConnectionId) THEN RAISE(ABORT,'D2C marketplace mismatch') END;
 SELECT CASE WHEN (NEW.orderId IS NULL)<>(NEW.orderRevisionId IS NULL) OR NEW.orderRevisionId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM NormalizedOrderRevision r JOIN NormalizedOrder o ON o.id=r.orderId WHERE r.id=NEW.orderRevisionId AND o.id=NEW.orderId AND o.accountId=NEW.accountId AND o.channelConnectionId=NEW.channelConnectionId) THEN RAISE(ABORT,'D2C tax order mismatch') END;
 SELECT CASE WHEN (NEW.itemId IS NULL)<>(NEW.itemRevisionId IS NULL) OR NEW.itemRevisionId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM NormalizedOrderItemRevision r JOIN NormalizedOrderItem i ON i.id=r.itemId WHERE r.id=NEW.itemRevisionId AND i.id=NEW.itemId AND i.accountId=NEW.accountId AND i.channelConnectionId=NEW.channelConnectionId AND (NEW.orderId IS NULL OR i.orderId=NEW.orderId)) THEN RAISE(ABORT,'D2C tax item mismatch') END;
 SELECT CASE WHEN NEW.financialLedgerEntryId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM FinancialLedgerEntry le WHERE le.id=NEW.financialLedgerEntryId AND le.accountId=NEW.accountId AND le.channelConnectionId=NEW.channelConnectionId AND le.projectionKind='TAX_COMPONENT' AND le.state='PRESENT') THEN RAISE(ABORT,'D2C tax ledger mismatch') END;
END;
CREATE TRIGGER "TaxInterpretationPolicyVersion_validate_insert" BEFORE INSERT ON "TaxInterpretationPolicyVersion" BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM TaxInterpretationPolicyVersion x WHERE x.id=NEW.id OR (x.accountId=NEW.accountId AND x.policyKey=NEW.policyKey AND (x.revision=NEW.revision OR x.operationKey=NEW.operationKey)) OR x.previousPolicyVersionId=NEW.previousPolicyVersionId AND NEW.previousPolicyVersionId IS NOT NULL) THEN RAISE(ABORT,'D2C immutable collision') END;
 SELECT CASE WHEN NEW.revision<>COALESCE((SELECT MAX(revision)+1 FROM TaxInterpretationPolicyVersion WHERE accountId=NEW.accountId AND policyKey=NEW.policyKey),1) THEN RAISE(ABORT,'D2C revision continuity') END;
END;

-- Immutable history and REPLACE protection. CostRecord is the only mutable head.
CREATE TRIGGER "CostRecord_no_delete" BEFORE DELETE ON "CostRecord" BEGIN SELECT RAISE(ABORT,'D2C immutable head'); END;
CREATE TRIGGER "CostRecord_identity_update" BEFORE UPDATE ON "CostRecord" BEGIN
 SELECT CASE WHEN OLD.accountId<>NEW.accountId OR OLD.skuId<>NEW.skuId OR OLD.channelScopeKey<>NEW.channelScopeKey OR OLD.marketplaceScopeKey<>NEW.marketplaceScopeKey OR OLD.sourceKind<>NEW.sourceKind OR OLD.costKey<>NEW.costKey OR NEW.revision<>OLD.revision+1 THEN RAISE(ABORT,'D2C immutable head identity') END;
 SELECT CASE WHEN NEW.currentRevisionId IS NULL OR NOT EXISTS(SELECT 1 FROM CostRecordRevision r WHERE r.id=NEW.currentRevisionId AND r.accountId=NEW.accountId AND r.costRecordId=NEW.id AND r.revision=NEW.revision) THEN RAISE(ABORT,'D2C invalid current revision') END;
END;
CREATE TRIGGER "CostRecordRevision_no_update" BEFORE UPDATE ON "CostRecordRevision" BEGIN SELECT RAISE(ABORT,'D2C immutable history'); END;
CREATE TRIGGER "CostRecordRevision_no_delete" BEFORE DELETE ON "CostRecordRevision" BEGIN SELECT RAISE(ABORT,'D2C immutable history'); END;
CREATE TRIGGER "InventoryEconomicLot_no_update" BEFORE UPDATE ON "InventoryEconomicLot" BEGIN SELECT RAISE(ABORT,'D2C immutable history'); END;
CREATE TRIGGER "InventoryEconomicLot_no_delete" BEFORE DELETE ON "InventoryEconomicLot" BEGIN SELECT RAISE(ABORT,'D2C immutable history'); END;
CREATE TRIGGER "InventoryEconomicEvent_no_update" BEFORE UPDATE ON "InventoryEconomicEvent" BEGIN SELECT RAISE(ABORT,'D2C immutable history'); END;
CREATE TRIGGER "InventoryEconomicEvent_no_delete" BEFORE DELETE ON "InventoryEconomicEvent" BEGIN SELECT RAISE(ABORT,'D2C immutable history'); END;
CREATE TRIGGER "ReplacementLink_no_update" BEFORE UPDATE ON "ReplacementLink" BEGIN SELECT RAISE(ABORT,'D2C immutable history'); END;
CREATE TRIGGER "ReplacementLink_no_delete" BEFORE DELETE ON "ReplacementLink" BEGIN SELECT RAISE(ABORT,'D2C immutable history'); END;
CREATE TRIGGER "NormalizedTaxEvidence_no_update" BEFORE UPDATE ON "NormalizedTaxEvidence" BEGIN SELECT RAISE(ABORT,'D2C immutable history'); END;
CREATE TRIGGER "NormalizedTaxEvidence_no_delete" BEFORE DELETE ON "NormalizedTaxEvidence" BEGIN SELECT RAISE(ABORT,'D2C immutable history'); END;
CREATE TRIGGER "TaxInterpretationPolicyVersion_no_update" BEFORE UPDATE ON "TaxInterpretationPolicyVersion" BEGIN SELECT RAISE(ABORT,'D2C immutable history'); END;
CREATE TRIGGER "TaxInterpretationPolicyVersion_no_delete" BEFORE DELETE ON "TaxInterpretationPolicyVersion" BEGIN SELECT RAISE(ABORT,'D2C immutable history'); END;
