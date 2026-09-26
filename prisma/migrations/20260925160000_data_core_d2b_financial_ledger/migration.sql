-- D2B: additive financial history and explicit authority; no production writer.
CREATE TABLE "FinancialCurrencyDefinition" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL,
  "sourceVersion" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (length(code)=3 AND code NOT GLOB '*[^A-Z]*')
);
CREATE UNIQUE INDEX "FinancialCurrencyDefinition_code_key" ON "FinancialCurrencyDefinition"("code");
CREATE TABLE "FinancialAuthorityScope" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "channelConnectionId" TEXT NOT NULL,
  "marketplaceId" TEXT,
  "marketplaceScopeKey" TEXT NOT NULL,
  "economicEventKey" TEXT NOT NULL,
  "coverageFamily" TEXT NOT NULL,
  "provisionalSourceAuthority" TEXT NOT NULL,
  "actualSourceAuthority" TEXT NOT NULL,
  "policyMappingVersionId" TEXT NOT NULL,
  "inputVersion" INTEGER NOT NULL DEFAULT 0,
  "currentDecisionId" TEXT,
  "periodStart" DATETIME,
  "periodEnd" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialAuthorityScope_channelConnectionId_accountId_fkey" FOREIGN KEY ("channelConnectionId","accountId") REFERENCES "ChannelConnection" ("id","accountId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialAuthorityScope_marketplaceId_accountId_channelConnectionId_fkey" FOREIGN KEY ("marketplaceId","accountId","channelConnectionId") REFERENCES "Marketplace" ("id","accountId","channelConnectionId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialAuthorityScope_policyMappingVersionId_fkey" FOREIGN KEY ("policyMappingVersionId") REFERENCES "MappingVersion" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialAuthorityScope_currentDecisionId_fkey" FOREIGN KEY ("currentDecisionId") REFERENCES "FinancialAuthorityDecision" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (coverageFamily IN ('SALE_BUNDLE','REFUND_BUNDLE','PERIODIC_CHARGE_BUNDLE','REIMBURSEMENT_BUNDLE','ADJUSTMENT_BUNDLE','UNRESOLVED_EVENT')),
  CHECK (((marketplaceId IS NULL AND marketplaceScopeKey='@none') OR (marketplaceId IS NOT NULL AND marketplaceScopeKey=marketplaceId))),
  CHECK (provisionalSourceAuthority<>actualSourceAuthority),
  CHECK (length(economicEventKey)>0),
  CHECK (typeof(inputVersion)='integer' AND inputVersion>=0),
  CHECK (((periodStart IS NULL AND periodEnd IS NULL) OR (periodStart IS NOT NULL AND periodEnd IS NOT NULL AND periodStart<periodEnd)))
);
CREATE UNIQUE INDEX "FinancialAuthorityScope_id_accountId_channelConnectionId_key" ON "FinancialAuthorityScope"("id","accountId","channelConnectionId");
CREATE UNIQUE INDEX "FinancialAuthorityScope_accountId_channelConnectionId_marketplaceScopeKey_economicEventKey_coverageFamily_key" ON "FinancialAuthorityScope"("accountId","channelConnectionId","marketplaceScopeKey","economicEventKey","coverageFamily");
CREATE TABLE "FinancialAuthorityBinding" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "channelConnectionId" TEXT NOT NULL,
  "authorityScopeId" TEXT NOT NULL,
  "authorityClass" TEXT NOT NULL,
  "sourceAuthority" TEXT NOT NULL,
  "sourceSystem" TEXT NOT NULL,
  "sourceEventNamespace" TEXT NOT NULL,
  "sourceEventIdentity" TEXT NOT NULL,
  "sourceLeafPath" TEXT NOT NULL,
  "correlationRuleKey" TEXT NOT NULL,
  "rawSourceRecordId" TEXT NOT NULL,
  "normalizationRunId" TEXT NOT NULL,
  "mappingVersionId" TEXT NOT NULL,
  "normalizationRevision" INTEGER NOT NULL,
  "syncSliceEvidenceId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "previousBindingId" TEXT,
  "operationKey" TEXT NOT NULL,
  "inputChecksum" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialAuthorityBinding_channelConnectionId_accountId_fkey" FOREIGN KEY ("channelConnectionId","accountId") REFERENCES "ChannelConnection" ("id","accountId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialAuthorityBinding_authorityScopeId_accountId_channelConnectionId_fkey" FOREIGN KEY ("authorityScopeId","accountId","channelConnectionId") REFERENCES "FinancialAuthorityScope" ("id","accountId","channelConnectionId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialAuthorityBinding_mappingVersionId_fkey" FOREIGN KEY ("mappingVersionId") REFERENCES "MappingVersion" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialAuthorityBinding_rawSourceRecordId_accountId_channelConnectionId_fkey" FOREIGN KEY ("rawSourceRecordId","accountId","channelConnectionId") REFERENCES "RawSourceRecord" ("id","accountId","channelConnectionId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialAuthorityBinding_normalizationRunId_accountId_channelConnectionId_rawSourceRecordId_mappingVersionId_normalizationRevision_fkey" FOREIGN KEY ("normalizationRunId","accountId","channelConnectionId","rawSourceRecordId","mappingVersionId","normalizationRevision") REFERENCES "NormalizationRun" ("id","accountId","channelConnectionId","rawSourceRecordId","mappingVersionId","normalizationRevision") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialAuthorityBinding_syncSliceEvidenceId_accountId_channelConnectionId_rawSourceRecordId_normalizationRunId_fkey" FOREIGN KEY ("syncSliceEvidenceId","accountId","channelConnectionId","rawSourceRecordId","normalizationRunId") REFERENCES "SyncSliceEvidence" ("id","accountId","channelConnectionId","rawSourceRecordId","normalizationRunId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialAuthorityBinding_previousBindingId_fkey" FOREIGN KEY ("previousBindingId") REFERENCES "FinancialAuthorityBinding" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (authorityClass IN ('PROVISIONAL','ACTUAL')),
  CHECK (revision>=1),
  CHECK (length(sourceEventIdentity)>0 AND length(sourceEventNamespace)>0 AND length(sourceLeafPath)>0 AND length(correlationRuleKey)>0)
);
CREATE UNIQUE INDEX "FinancialAuthorityBinding_id_accountId_channelConnectionId_key" ON "FinancialAuthorityBinding"("id","accountId","channelConnectionId");
CREATE UNIQUE INDEX "FinancialAuthorityBinding_channelConnectionId_sourceAuthority_sourceEventNamespace_sourceEventIdentity_revision_key" ON "FinancialAuthorityBinding"("channelConnectionId","sourceAuthority","sourceEventNamespace","sourceEventIdentity","revision");
CREATE UNIQUE INDEX "FinancialAuthorityBinding_channelConnectionId_sourceAuthority_sourceEventNamespace_sourceEventIdentity_operationKey_key" ON "FinancialAuthorityBinding"("channelConnectionId","sourceAuthority","sourceEventNamespace","sourceEventIdentity","operationKey");
CREATE UNIQUE INDEX "FinancialAuthorityBinding_previousBindingId_key" ON "FinancialAuthorityBinding"("previousBindingId");
CREATE TABLE "FinancialComponentHead" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "channelConnectionId" TEXT NOT NULL,
  "authorityScopeId" TEXT NOT NULL,
  "authorityClass" TEXT NOT NULL,
  "sourceAuthority" TEXT NOT NULL,
  "sourceComponentKey" TEXT NOT NULL,
  "currentEntryId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialComponentHead_channelConnectionId_accountId_fkey" FOREIGN KEY ("channelConnectionId","accountId") REFERENCES "ChannelConnection" ("id","accountId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialComponentHead_authorityScopeId_accountId_channelConnectionId_fkey" FOREIGN KEY ("authorityScopeId","accountId","channelConnectionId") REFERENCES "FinancialAuthorityScope" ("id","accountId","channelConnectionId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialComponentHead_currentEntryId_fkey" FOREIGN KEY ("currentEntryId") REFERENCES "FinancialLedgerEntry" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (authorityClass IN ('PROVISIONAL','ACTUAL')),
  CHECK (typeof(revision)='integer' AND revision>=0),
  CHECK (length(sourceComponentKey)>0)
);
CREATE UNIQUE INDEX "FinancialComponentHead_id_accountId_channelConnectionId_key" ON "FinancialComponentHead"("id","accountId","channelConnectionId");
CREATE UNIQUE INDEX "FinancialComponentHead_authorityScopeId_authorityClass_sourceAuthority_sourceComponentKey_key" ON "FinancialComponentHead"("authorityScopeId","authorityClass","sourceAuthority","sourceComponentKey");
CREATE TABLE "FinancialLedgerEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "channelConnectionId" TEXT NOT NULL,
  "marketplaceScopeKey" TEXT NOT NULL,
  "componentId" TEXT NOT NULL,
  "authorityScopeId" TEXT NOT NULL,
  "bindingId" TEXT NOT NULL,
  "economicEventKey" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "previousEntryId" TEXT,
  "operationKey" TEXT NOT NULL,
  "inputChecksum" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "projectionKind" TEXT NOT NULL,
  "sourceSubtype" TEXT NOT NULL,
  "authorityClass" TEXT NOT NULL,
  "amountAtoms" BIGINT NOT NULL,
  "amountScale" INTEGER NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "sourceAmountText" TEXT NOT NULL,
  "sourceSignConvention" TEXT NOT NULL,
  "signRuleKey" TEXT NOT NULL,
  "economicRole" TEXT NOT NULL,
  "informationalRuleKey" TEXT,
  "rawSourceRecordId" TEXT NOT NULL,
  "normalizationRunId" TEXT NOT NULL,
  "mappingVersionId" TEXT NOT NULL,
  "normalizationRevision" INTEGER NOT NULL,
  "syncSliceEvidenceId" TEXT NOT NULL,
  "sourceLeafPath" TEXT NOT NULL,
  "occurredAt" DATETIME,
  "postedAt" DATETIME,
  "effectiveAt" DATETIME NOT NULL,
  "periodStart" DATETIME,
  "periodEnd" DATETIME,
  "orderId" TEXT,
  "orderRevisionId" TEXT,
  "itemId" TEXT,
  "itemRevisionId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialLedgerEntry_channelConnectionId_accountId_fkey" FOREIGN KEY ("channelConnectionId","accountId") REFERENCES "ChannelConnection" ("id","accountId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialLedgerEntry_authorityScopeId_accountId_channelConnectionId_fkey" FOREIGN KEY ("authorityScopeId","accountId","channelConnectionId") REFERENCES "FinancialAuthorityScope" ("id","accountId","channelConnectionId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialLedgerEntry_mappingVersionId_fkey" FOREIGN KEY ("mappingVersionId") REFERENCES "MappingVersion" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialLedgerEntry_rawSourceRecordId_accountId_channelConnectionId_fkey" FOREIGN KEY ("rawSourceRecordId","accountId","channelConnectionId") REFERENCES "RawSourceRecord" ("id","accountId","channelConnectionId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialLedgerEntry_normalizationRunId_accountId_channelConnectionId_rawSourceRecordId_mappingVersionId_normalizationRevision_fkey" FOREIGN KEY ("normalizationRunId","accountId","channelConnectionId","rawSourceRecordId","mappingVersionId","normalizationRevision") REFERENCES "NormalizationRun" ("id","accountId","channelConnectionId","rawSourceRecordId","mappingVersionId","normalizationRevision") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialLedgerEntry_syncSliceEvidenceId_accountId_channelConnectionId_rawSourceRecordId_normalizationRunId_fkey" FOREIGN KEY ("syncSliceEvidenceId","accountId","channelConnectionId","rawSourceRecordId","normalizationRunId") REFERENCES "SyncSliceEvidence" ("id","accountId","channelConnectionId","rawSourceRecordId","normalizationRunId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialLedgerEntry_componentId_accountId_channelConnectionId_fkey" FOREIGN KEY ("componentId","accountId","channelConnectionId") REFERENCES "FinancialComponentHead" ("id","accountId","channelConnectionId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialLedgerEntry_bindingId_accountId_channelConnectionId_fkey" FOREIGN KEY ("bindingId","accountId","channelConnectionId") REFERENCES "FinancialAuthorityBinding" ("id","accountId","channelConnectionId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialLedgerEntry_previousEntryId_fkey" FOREIGN KEY ("previousEntryId") REFERENCES "FinancialLedgerEntry" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialLedgerEntry_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "FinancialCurrencyDefinition" ("code") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialLedgerEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "NormalizedOrder" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialLedgerEntry_orderRevisionId_fkey" FOREIGN KEY ("orderRevisionId") REFERENCES "NormalizedOrderRevision" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialLedgerEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "NormalizedOrderItem" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialLedgerEntry_itemRevisionId_fkey" FOREIGN KEY ("itemRevisionId") REFERENCES "NormalizedOrderItemRevision" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (authorityClass IN ('PROVISIONAL','ACTUAL')),
  CHECK (state IN ('PRESENT','WITHDRAWN')),
  CHECK (projectionKind IN ('PRODUCT_REVENUE','DISCOUNT_PROMOTION','REFUND','MARKETPLACE_COMMISSION','FULFILLMENT_FEE','SHIPPING_REVENUE','SHIPPING_EXPENSE','STORAGE_FEE','REIMBURSEMENT','ADJUSTMENT','TAX_COMPONENT','UNKNOWN_UNCLASSIFIED')),
  CHECK (typeof(amountAtoms)='integer'),
  CHECK (typeof(amountScale)='integer' AND amountScale BETWEEN 0 AND 12),
  CHECK (economicRole IN ('ECONOMIC','INFORMATIONAL')),
  CHECK ((economicRole='ECONOMIC' AND informationalRuleKey IS NULL) OR (economicRole='INFORMATIONAL' AND length(informationalRuleKey)>0 AND informationalRuleKey IS NOT NULL)),
  CHECK (length(sourceAmountText)>0 AND length(sourceSignConvention)>0 AND length(signRuleKey)>0 AND length(sourceLeafPath)>0),
  CHECK (typeof(revision)='integer' AND revision>=1),
  CHECK (((periodStart IS NULL AND periodEnd IS NULL) OR (periodStart IS NOT NULL AND periodEnd IS NOT NULL AND periodStart<periodEnd))),
  CHECK (itemId IS NULL OR orderId IS NOT NULL),
  CHECK (orderRevisionId IS NULL OR orderId IS NOT NULL),
  CHECK (itemRevisionId IS NULL OR itemId IS NOT NULL)
);
CREATE UNIQUE INDEX "FinancialLedgerEntry_id_accountId_channelConnectionId_key" ON "FinancialLedgerEntry"("id","accountId","channelConnectionId");
CREATE UNIQUE INDEX "FinancialLedgerEntry_componentId_revision_key" ON "FinancialLedgerEntry"("componentId","revision");
CREATE UNIQUE INDEX "FinancialLedgerEntry_componentId_operationKey_key" ON "FinancialLedgerEntry"("componentId","operationKey");
CREATE UNIQUE INDEX "FinancialLedgerEntry_previousEntryId_key" ON "FinancialLedgerEntry"("previousEntryId");
CREATE TABLE "FinancialAuthorityEvidence" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "channelConnectionId" TEXT NOT NULL,
  "authorityScopeId" TEXT NOT NULL,
  "authorityClass" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "previousEvidenceId" TEXT,
  "operationKey" TEXT NOT NULL,
  "inputChecksum" TEXT NOT NULL,
  "mappingVersionId" TEXT NOT NULL,
  "coverageState" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "boundariesJson" TEXT NOT NULL,
  "sourceWatermark" DATETIME,
  "closureSyncSliceEvidenceId" TEXT,
  "closureLeafPath" TEXT,
  "closureRuleKey" TEXT,
  "expectedSourceCount" INTEGER NOT NULL,
  "expectedMemberCount" INTEGER NOT NULL,
  "reasonCode" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialAuthorityEvidence_channelConnectionId_accountId_fkey" FOREIGN KEY ("channelConnectionId","accountId") REFERENCES "ChannelConnection" ("id","accountId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialAuthorityEvidence_authorityScopeId_accountId_channelConnectionId_fkey" FOREIGN KEY ("authorityScopeId","accountId","channelConnectionId") REFERENCES "FinancialAuthorityScope" ("id","accountId","channelConnectionId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialAuthorityEvidence_mappingVersionId_fkey" FOREIGN KEY ("mappingVersionId") REFERENCES "MappingVersion" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialAuthorityEvidence_previousEvidenceId_fkey" FOREIGN KEY ("previousEvidenceId") REFERENCES "FinancialAuthorityEvidence" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialAuthorityEvidence_closureSyncSliceEvidenceId_fkey" FOREIGN KEY ("closureSyncSliceEvidenceId") REFERENCES "SyncSliceEvidence" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (authorityClass IN ('PROVISIONAL','ACTUAL')),
  CHECK (typeof(revision)='integer' AND revision>=1),
  CHECK (coverageState IN ('COMPLETE','INCOMPLETE','UNKNOWN')),
  CHECK (status IN ('DRAFT','SEALED')),
  CHECK (json_valid(boundariesJson)),
  CHECK (typeof(expectedSourceCount)='integer' AND expectedSourceCount>0),
  CHECK (typeof(expectedMemberCount)='integer' AND expectedMemberCount>=0),
  CHECK (coverageState<>'COMPLETE' OR (closureSyncSliceEvidenceId IS NOT NULL AND closureLeafPath IS NOT NULL AND length(closureLeafPath)>0 AND closureRuleKey IS NOT NULL AND length(closureRuleKey)>0)),
  CHECK (coverageState='COMPLETE' OR (reasonCode IS NOT NULL AND length(reasonCode)>0))
);
CREATE UNIQUE INDEX "FinancialAuthorityEvidence_id_accountId_channelConnectionId_key" ON "FinancialAuthorityEvidence"("id","accountId","channelConnectionId");
CREATE UNIQUE INDEX "FinancialAuthorityEvidence_authorityScopeId_authorityClass_revision_key" ON "FinancialAuthorityEvidence"("authorityScopeId","authorityClass","revision");
CREATE UNIQUE INDEX "FinancialAuthorityEvidence_authorityScopeId_authorityClass_operationKey_key" ON "FinancialAuthorityEvidence"("authorityScopeId","authorityClass","operationKey");
CREATE UNIQUE INDEX "FinancialAuthorityEvidence_previousEvidenceId_key" ON "FinancialAuthorityEvidence"("previousEvidenceId");
CREATE TABLE "FinancialAuthorityEvidenceSource" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "channelConnectionId" TEXT NOT NULL,
  "evidenceId" TEXT NOT NULL,
  "rawSourceRecordId" TEXT NOT NULL,
  "normalizationRunId" TEXT NOT NULL,
  "mappingVersionId" TEXT NOT NULL,
  "normalizationRevision" INTEGER NOT NULL,
  "syncSliceEvidenceId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialAuthorityEvidenceSource_channelConnectionId_accountId_fkey" FOREIGN KEY ("channelConnectionId","accountId") REFERENCES "ChannelConnection" ("id","accountId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialAuthorityEvidenceSource_mappingVersionId_fkey" FOREIGN KEY ("mappingVersionId") REFERENCES "MappingVersion" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialAuthorityEvidenceSource_rawSourceRecordId_accountId_channelConnectionId_fkey" FOREIGN KEY ("rawSourceRecordId","accountId","channelConnectionId") REFERENCES "RawSourceRecord" ("id","accountId","channelConnectionId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialAuthorityEvidenceSource_normalizationRunId_accountId_channelConnectionId_rawSourceRecordId_mappingVersionId_normalizationRevision_fkey" FOREIGN KEY ("normalizationRunId","accountId","channelConnectionId","rawSourceRecordId","mappingVersionId","normalizationRevision") REFERENCES "NormalizationRun" ("id","accountId","channelConnectionId","rawSourceRecordId","mappingVersionId","normalizationRevision") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialAuthorityEvidenceSource_syncSliceEvidenceId_accountId_channelConnectionId_rawSourceRecordId_normalizationRunId_fkey" FOREIGN KEY ("syncSliceEvidenceId","accountId","channelConnectionId","rawSourceRecordId","normalizationRunId") REFERENCES "SyncSliceEvidence" ("id","accountId","channelConnectionId","rawSourceRecordId","normalizationRunId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialAuthorityEvidenceSource_evidenceId_accountId_channelConnectionId_fkey" FOREIGN KEY ("evidenceId","accountId","channelConnectionId") REFERENCES "FinancialAuthorityEvidence" ("id","accountId","channelConnectionId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "FinancialAuthorityEvidenceSource_id_accountId_channelConnectionId_key" ON "FinancialAuthorityEvidenceSource"("id","accountId","channelConnectionId");
CREATE UNIQUE INDEX "FinancialAuthorityEvidenceSource_evidenceId_syncSliceEvidenceId_key" ON "FinancialAuthorityEvidenceSource"("evidenceId","syncSliceEvidenceId");
CREATE TABLE "FinancialAuthorityEvidenceMember" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "channelConnectionId" TEXT NOT NULL,
  "evidenceId" TEXT NOT NULL,
  "componentId" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialAuthorityEvidenceMember_channelConnectionId_accountId_fkey" FOREIGN KEY ("channelConnectionId","accountId") REFERENCES "ChannelConnection" ("id","accountId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialAuthorityEvidenceMember_evidenceId_accountId_channelConnectionId_fkey" FOREIGN KEY ("evidenceId","accountId","channelConnectionId") REFERENCES "FinancialAuthorityEvidence" ("id","accountId","channelConnectionId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialAuthorityEvidenceMember_componentId_accountId_channelConnectionId_fkey" FOREIGN KEY ("componentId","accountId","channelConnectionId") REFERENCES "FinancialComponentHead" ("id","accountId","channelConnectionId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialAuthorityEvidenceMember_entryId_accountId_channelConnectionId_fkey" FOREIGN KEY ("entryId","accountId","channelConnectionId") REFERENCES "FinancialLedgerEntry" ("id","accountId","channelConnectionId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "FinancialAuthorityEvidenceMember_id_accountId_channelConnectionId_key" ON "FinancialAuthorityEvidenceMember"("id","accountId","channelConnectionId");
CREATE UNIQUE INDEX "FinancialAuthorityEvidenceMember_evidenceId_componentId_key" ON "FinancialAuthorityEvidenceMember"("evidenceId","componentId");
CREATE TABLE "FinancialAuthorityDecision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "channelConnectionId" TEXT NOT NULL,
  "authorityScopeId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "previousDecisionId" TEXT,
  "inputVersion" INTEGER NOT NULL,
  "provisionalEvidenceId" TEXT,
  "actualEvidenceId" TEXT,
  "authorityState" TEXT NOT NULL,
  "selectedClass" TEXT NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL,
  "inputChecksum" TEXT NOT NULL,
  "mappingVersionId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialAuthorityDecision_channelConnectionId_accountId_fkey" FOREIGN KEY ("channelConnectionId","accountId") REFERENCES "ChannelConnection" ("id","accountId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialAuthorityDecision_authorityScopeId_accountId_channelConnectionId_fkey" FOREIGN KEY ("authorityScopeId","accountId","channelConnectionId") REFERENCES "FinancialAuthorityScope" ("id","accountId","channelConnectionId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialAuthorityDecision_mappingVersionId_fkey" FOREIGN KEY ("mappingVersionId") REFERENCES "MappingVersion" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialAuthorityDecision_previousDecisionId_fkey" FOREIGN KEY ("previousDecisionId") REFERENCES "FinancialAuthorityDecision" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialAuthorityDecision_provisionalEvidenceId_fkey" FOREIGN KEY ("provisionalEvidenceId") REFERENCES "FinancialAuthorityEvidence" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialAuthorityDecision_actualEvidenceId_fkey" FOREIGN KEY ("actualEvidenceId") REFERENCES "FinancialAuthorityEvidence" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (authorityState IN ('NO_ACTUAL','ACTUAL_INCOMPLETE','ACTUAL_COMPLETE','ACTUAL_UNKNOWN')),
  CHECK (selectedClass IN ('PROVISIONAL','ACTUAL','BLOCKED')),
  CHECK (status IN ('DRAFT','PUBLISHED')),
  CHECK (typeof(revision)='integer' AND revision>=1),
  CHECK (typeof(inputVersion)='integer' AND inputVersion>=0)
);
CREATE UNIQUE INDEX "FinancialAuthorityDecision_id_accountId_channelConnectionId_key" ON "FinancialAuthorityDecision"("id","accountId","channelConnectionId");
CREATE UNIQUE INDEX "FinancialAuthorityDecision_authorityScopeId_revision_key" ON "FinancialAuthorityDecision"("authorityScopeId","revision");
CREATE UNIQUE INDEX "FinancialAuthorityDecision_authorityScopeId_operationKey_key" ON "FinancialAuthorityDecision"("authorityScopeId","operationKey");
CREATE UNIQUE INDEX "FinancialAuthorityDecision_previousDecisionId_key" ON "FinancialAuthorityDecision"("previousDecisionId");
CREATE TABLE "FinancialComponentSelection" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "channelConnectionId" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "componentId" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialComponentSelection_channelConnectionId_accountId_fkey" FOREIGN KEY ("channelConnectionId","accountId") REFERENCES "ChannelConnection" ("id","accountId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialComponentSelection_decisionId_accountId_channelConnectionId_fkey" FOREIGN KEY ("decisionId","accountId","channelConnectionId") REFERENCES "FinancialAuthorityDecision" ("id","accountId","channelConnectionId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialComponentSelection_componentId_accountId_channelConnectionId_fkey" FOREIGN KEY ("componentId","accountId","channelConnectionId") REFERENCES "FinancialComponentHead" ("id","accountId","channelConnectionId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "FinancialComponentSelection_entryId_accountId_channelConnectionId_fkey" FOREIGN KEY ("entryId","accountId","channelConnectionId") REFERENCES "FinancialLedgerEntry" ("id","accountId","channelConnectionId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (role IN ('SELECTED','SUPPRESSED','INFORMATIONAL','WITHDRAWN'))
);
CREATE UNIQUE INDEX "FinancialComponentSelection_id_accountId_channelConnectionId_key" ON "FinancialComponentSelection"("id","accountId","channelConnectionId");
CREATE UNIQUE INDEX "FinancialComponentSelection_decisionId_componentId_key" ON "FinancialComponentSelection"("decisionId","componentId");

-- Supported ISO 4217 subset v1; additions require an additive reviewed migration.
INSERT INTO FinancialCurrencyDefinition(id,code,sourceVersion) VALUES ('iso4217-EUR','EUR','ISO4217-supported-subset-v1');
INSERT INTO FinancialCurrencyDefinition(id,code,sourceVersion) VALUES ('iso4217-USD','USD','ISO4217-supported-subset-v1');
INSERT INTO FinancialCurrencyDefinition(id,code,sourceVersion) VALUES ('iso4217-GBP','GBP','ISO4217-supported-subset-v1');
INSERT INTO FinancialCurrencyDefinition(id,code,sourceVersion) VALUES ('iso4217-CAD','CAD','ISO4217-supported-subset-v1');
INSERT INTO FinancialCurrencyDefinition(id,code,sourceVersion) VALUES ('iso4217-AUD','AUD','ISO4217-supported-subset-v1');
INSERT INTO FinancialCurrencyDefinition(id,code,sourceVersion) VALUES ('iso4217-NZD','NZD','ISO4217-supported-subset-v1');
INSERT INTO FinancialCurrencyDefinition(id,code,sourceVersion) VALUES ('iso4217-JPY','JPY','ISO4217-supported-subset-v1');
INSERT INTO FinancialCurrencyDefinition(id,code,sourceVersion) VALUES ('iso4217-CHF','CHF','ISO4217-supported-subset-v1');
INSERT INTO FinancialCurrencyDefinition(id,code,sourceVersion) VALUES ('iso4217-SEK','SEK','ISO4217-supported-subset-v1');
INSERT INTO FinancialCurrencyDefinition(id,code,sourceVersion) VALUES ('iso4217-NOK','NOK','ISO4217-supported-subset-v1');
INSERT INTO FinancialCurrencyDefinition(id,code,sourceVersion) VALUES ('iso4217-DKK','DKK','ISO4217-supported-subset-v1');
INSERT INTO FinancialCurrencyDefinition(id,code,sourceVersion) VALUES ('iso4217-PLN','PLN','ISO4217-supported-subset-v1');
INSERT INTO FinancialCurrencyDefinition(id,code,sourceVersion) VALUES ('iso4217-CZK','CZK','ISO4217-supported-subset-v1');
INSERT INTO FinancialCurrencyDefinition(id,code,sourceVersion) VALUES ('iso4217-HUF','HUF','ISO4217-supported-subset-v1');
CREATE TRIGGER "FinancialCurrencyDefinition_no_delete" BEFORE DELETE ON "FinancialCurrencyDefinition" BEGIN SELECT RAISE(ABORT, 'D2B immutable history'); END;
CREATE TRIGGER "FinancialCurrencyDefinition_no_update" BEFORE UPDATE ON "FinancialCurrencyDefinition" BEGIN SELECT RAISE(ABORT, 'D2B immutable history'); END;
CREATE TRIGGER "FinancialAuthorityScope_no_delete" BEFORE DELETE ON "FinancialAuthorityScope" BEGIN SELECT RAISE(ABORT, 'D2B immutable history'); END;
CREATE TRIGGER "FinancialAuthorityBinding_no_delete" BEFORE DELETE ON "FinancialAuthorityBinding" BEGIN SELECT RAISE(ABORT, 'D2B immutable history'); END;
CREATE TRIGGER "FinancialAuthorityBinding_no_update" BEFORE UPDATE ON "FinancialAuthorityBinding" BEGIN SELECT RAISE(ABORT, 'D2B immutable history'); END;
CREATE TRIGGER "FinancialComponentHead_no_delete" BEFORE DELETE ON "FinancialComponentHead" BEGIN SELECT RAISE(ABORT, 'D2B immutable history'); END;
CREATE TRIGGER "FinancialLedgerEntry_no_delete" BEFORE DELETE ON "FinancialLedgerEntry" BEGIN SELECT RAISE(ABORT, 'D2B immutable history'); END;
CREATE TRIGGER "FinancialLedgerEntry_no_update" BEFORE UPDATE ON "FinancialLedgerEntry" BEGIN SELECT RAISE(ABORT, 'D2B immutable history'); END;
CREATE TRIGGER "FinancialAuthorityEvidence_no_delete" BEFORE DELETE ON "FinancialAuthorityEvidence" WHEN OLD.status='SEALED' BEGIN SELECT RAISE(ABORT, 'D2B immutable history'); END;
CREATE TRIGGER "FinancialAuthorityEvidenceSource_no_delete" BEFORE DELETE ON "FinancialAuthorityEvidenceSource" WHEN EXISTS(SELECT 1 FROM FinancialAuthorityEvidence e WHERE e.id=OLD.evidenceId AND e.status='SEALED') BEGIN SELECT RAISE(ABORT, 'D2B immutable history'); END;
CREATE TRIGGER "FinancialAuthorityEvidenceSource_no_update" BEFORE UPDATE ON "FinancialAuthorityEvidenceSource" BEGIN SELECT RAISE(ABORT, 'D2B immutable history'); END;
CREATE TRIGGER "FinancialAuthorityEvidenceMember_no_delete" BEFORE DELETE ON "FinancialAuthorityEvidenceMember" WHEN EXISTS(SELECT 1 FROM FinancialAuthorityEvidence e WHERE e.id=OLD.evidenceId AND e.status='SEALED') BEGIN SELECT RAISE(ABORT, 'D2B immutable history'); END;
CREATE TRIGGER "FinancialAuthorityEvidenceMember_no_update" BEFORE UPDATE ON "FinancialAuthorityEvidenceMember" BEGIN SELECT RAISE(ABORT, 'D2B immutable history'); END;
CREATE TRIGGER "FinancialAuthorityDecision_no_delete" BEFORE DELETE ON "FinancialAuthorityDecision" WHEN OLD.status='PUBLISHED' BEGIN SELECT RAISE(ABORT, 'D2B immutable history'); END;
CREATE TRIGGER "FinancialComponentSelection_no_delete" BEFORE DELETE ON "FinancialComponentSelection" WHEN EXISTS(SELECT 1 FROM FinancialAuthorityDecision d WHERE d.id=OLD.decisionId AND d.status='PUBLISHED') BEGIN SELECT RAISE(ABORT, 'D2B immutable history'); END;
CREATE TRIGGER "FinancialComponentSelection_no_update" BEFORE UPDATE ON "FinancialComponentSelection" BEGIN SELECT RAISE(ABORT, 'D2B immutable history'); END;
CREATE TRIGGER "FinancialCurrencyDefinition_no_insert" BEFORE INSERT ON "FinancialCurrencyDefinition" BEGIN SELECT RAISE(ABORT, 'D2B unsupported currency registry insertion'); END;
CREATE TRIGGER "FinancialAuthorityScope_insert" BEFORE INSERT ON "FinancialAuthorityScope" WHEN NOT (EXISTS (SELECT 1 FROM ChannelConnection c JOIN Account a ON a.id=c.accountId WHERE c.id=NEW.channelConnectionId AND c.accountId=NEW.accountId AND c.status='ACTIVE' AND a.status='ACTIVE')) OR NOT (EXISTS (SELECT 1 FROM MappingVersion m JOIN ChannelConnection c ON c.id=NEW.channelConnectionId WHERE m.id=NEW.policyMappingVersionId AND m.activatedAt IS NOT NULL AND m.platform=c.channel)) OR NEW.inputVersion<>0 OR NEW.currentDecisionId IS NOT NULL BEGIN SELECT RAISE(ABORT, 'D2B invalid scope'); END;
CREATE TRIGGER "FinancialAuthorityScope_update" BEFORE UPDATE ON "FinancialAuthorityScope" WHEN (NEW."id" IS NOT OLD."id" OR NEW."accountId" IS NOT OLD."accountId" OR NEW."channelConnectionId" IS NOT OLD."channelConnectionId" OR NEW."marketplaceId" IS NOT OLD."marketplaceId" OR NEW."marketplaceScopeKey" IS NOT OLD."marketplaceScopeKey" OR NEW."economicEventKey" IS NOT OLD."economicEventKey" OR NEW."coverageFamily" IS NOT OLD."coverageFamily" OR NEW."provisionalSourceAuthority" IS NOT OLD."provisionalSourceAuthority" OR NEW."actualSourceAuthority" IS NOT OLD."actualSourceAuthority" OR NEW."policyMappingVersionId" IS NOT OLD."policyMappingVersionId" OR NEW."periodStart" IS NOT OLD."periodStart" OR NEW."periodEnd" IS NOT OLD."periodEnd" OR NEW."createdAt" IS NOT OLD."createdAt") OR NOT ((NEW.currentDecisionId IS OLD.currentDecisionId AND NEW.inputVersion=OLD.inputVersion+1) OR (NEW.inputVersion=OLD.inputVersion AND NEW.currentDecisionId IS NOT OLD.currentDecisionId AND EXISTS (SELECT 1 FROM FinancialAuthorityDecision d WHERE d.id=NEW.currentDecisionId AND d.authorityScopeId=OLD.id AND d.status='PUBLISHED' AND d.previousDecisionId IS OLD.currentDecisionId AND d.inputVersion=OLD.inputVersion))) BEGIN SELECT RAISE(ABORT, 'D2B invalid scope CAS'); END;
CREATE TRIGGER "FinancialAuthorityBinding_provenance" BEFORE INSERT ON "FinancialAuthorityBinding" WHEN NOT (EXISTS (SELECT 1 FROM ChannelConnection c JOIN Account a ON a.id=c.accountId WHERE c.id=NEW.channelConnectionId AND c.accountId=NEW.accountId AND c.status='ACTIVE' AND a.status='ACTIVE')) OR NOT (EXISTS (
 SELECT 1 FROM FinancialAuthorityScope s
 JOIN SyncSliceEvidence e ON e.id=NEW.syncSliceEvidenceId
 JOIN SyncSlice sl ON sl.id=e.sliceId
 JOIN SyncRun sr ON sr.id=sl.runId
 JOIN RawSourceRecord r ON r.id=NEW.rawSourceRecordId
 JOIN NormalizationRun n ON n.id=NEW.normalizationRunId
 JOIN MappingVersion m ON m.id=NEW.mappingVersionId
 JOIN ChannelConnection c ON c.id=s.channelConnectionId
 WHERE s.id=NEW.authorityScopeId AND s.accountId=NEW.accountId AND s.channelConnectionId=NEW.channelConnectionId
 AND e.accountId=s.accountId AND e.channelConnectionId=s.channelConnectionId AND e.rawSourceRecordId=r.id AND e.normalizationRunId=n.id
 AND sl.accountId=s.accountId AND sl.channelConnectionId=s.channelConnectionId AND sl.marketplaceScopeKey=s.marketplaceScopeKey
 AND sl.stream=CASE NEW.authorityClass WHEN 'PROVISIONAL' THEN s.provisionalSourceAuthority ELSE s.actualSourceAuthority END
 AND sr.stream=sl.stream AND sr.accountId=s.accountId AND sr.channelConnectionId=s.channelConnectionId AND sr.id=e.runId
 AND r.ingestionRunId=sr.id AND r.accountId=s.accountId AND r.channelConnectionId=s.channelConnectionId AND r.sourceSystem=c.channel
 AND n.rawSourceRecordId=r.id AND n.accountId=s.accountId AND n.channelConnectionId=s.channelConnectionId
 AND n.mappingVersionId=m.id AND n.normalizationRevision=NEW.normalizationRevision AND n.status='SUCCEEDED'
 AND m.activatedAt IS NOT NULL AND m.platform=c.channel
)) OR NOT EXISTS (SELECT 1 FROM FinancialAuthorityScope s JOIN RawSourceRecord r ON r.id=NEW.rawSourceRecordId WHERE s.id=NEW.authorityScopeId AND NEW.sourceSystem=r.sourceSystem AND NEW.sourceAuthority=CASE NEW.authorityClass WHEN 'PROVISIONAL' THEN s.provisionalSourceAuthority ELSE s.actualSourceAuthority END) BEGIN SELECT RAISE(ABORT, 'D2B binding provenance'); END;
CREATE TRIGGER "FinancialAuthorityBinding_sequence" BEFORE INSERT ON "FinancialAuthorityBinding" WHEN NOT ((NEW.revision=1 AND NEW.previousBindingId IS NULL AND NOT EXISTS(SELECT 1 FROM FinancialAuthorityBinding b WHERE b.channelConnectionId=NEW.channelConnectionId AND b.sourceAuthority=NEW.sourceAuthority AND b.sourceEventNamespace=NEW.sourceEventNamespace AND b.sourceEventIdentity=NEW.sourceEventIdentity)) OR EXISTS (SELECT 1 FROM FinancialAuthorityBinding b WHERE b.channelConnectionId=NEW.channelConnectionId AND b.sourceAuthority=NEW.sourceAuthority AND b.sourceEventNamespace=NEW.sourceEventNamespace AND b.sourceEventIdentity=NEW.sourceEventIdentity AND b.id=NEW.previousBindingId AND NEW.revision=b.revision+1 AND NOT EXISTS(SELECT 1 FROM FinancialAuthorityBinding next WHERE next.previousBindingId=b.id) AND NOT EXISTS(SELECT 1 FROM FinancialComponentHead h JOIN FinancialLedgerEntry l ON l.id=h.currentEntryId WHERE l.bindingId=b.id AND l.state='PRESENT'))) BEGIN SELECT RAISE(ABORT, 'D2B contradictory binding or stale predecessor'); END;
CREATE TRIGGER "FinancialComponentHead_insert" BEFORE INSERT ON "FinancialComponentHead" WHEN NEW.revision<>0 OR NEW.currentEntryId IS NOT NULL OR NOT EXISTS (SELECT 1 FROM FinancialAuthorityScope s WHERE s.id=NEW.authorityScopeId AND NEW.sourceAuthority=CASE NEW.authorityClass WHEN 'PROVISIONAL' THEN s.provisionalSourceAuthority ELSE s.actualSourceAuthority END) BEGIN SELECT RAISE(ABORT, 'D2B invalid component identity'); END;
CREATE TRIGGER "FinancialComponentHead_update" BEFORE UPDATE ON "FinancialComponentHead" WHEN (NEW."id" IS NOT OLD."id" OR NEW."accountId" IS NOT OLD."accountId" OR NEW."channelConnectionId" IS NOT OLD."channelConnectionId" OR NEW."authorityScopeId" IS NOT OLD."authorityScopeId" OR NEW."authorityClass" IS NOT OLD."authorityClass" OR NEW."sourceAuthority" IS NOT OLD."sourceAuthority" OR NEW."sourceComponentKey" IS NOT OLD."sourceComponentKey" OR NEW."createdAt" IS NOT OLD."createdAt") OR NOT EXISTS(SELECT 1 FROM FinancialLedgerEntry l WHERE l.id=NEW.currentEntryId AND l.componentId=OLD.id AND l.previousEntryId IS OLD.currentEntryId AND l.revision=OLD.revision+1 AND NEW.revision=l.revision) BEGIN SELECT RAISE(ABORT, 'D2B stale component head'); END;
CREATE TRIGGER "FinancialLedgerEntry_provenance" BEFORE INSERT ON "FinancialLedgerEntry" WHEN NOT (EXISTS (SELECT 1 FROM ChannelConnection c JOIN Account a ON a.id=c.accountId WHERE c.id=NEW.channelConnectionId AND c.accountId=NEW.accountId AND c.status='ACTIVE' AND a.status='ACTIVE')) OR NOT (EXISTS (
 SELECT 1 FROM FinancialAuthorityScope s
 JOIN SyncSliceEvidence e ON e.id=NEW.syncSliceEvidenceId
 JOIN SyncSlice sl ON sl.id=e.sliceId
 JOIN SyncRun sr ON sr.id=sl.runId
 JOIN RawSourceRecord r ON r.id=NEW.rawSourceRecordId
 JOIN NormalizationRun n ON n.id=NEW.normalizationRunId
 JOIN MappingVersion m ON m.id=NEW.mappingVersionId
 JOIN ChannelConnection c ON c.id=s.channelConnectionId
 WHERE s.id=NEW.authorityScopeId AND s.accountId=NEW.accountId AND s.channelConnectionId=NEW.channelConnectionId
 AND e.accountId=s.accountId AND e.channelConnectionId=s.channelConnectionId AND e.rawSourceRecordId=r.id AND e.normalizationRunId=n.id
 AND sl.accountId=s.accountId AND sl.channelConnectionId=s.channelConnectionId AND sl.marketplaceScopeKey=s.marketplaceScopeKey
 AND sl.stream=CASE NEW.authorityClass WHEN 'PROVISIONAL' THEN s.provisionalSourceAuthority ELSE s.actualSourceAuthority END
 AND sr.stream=sl.stream AND sr.accountId=s.accountId AND sr.channelConnectionId=s.channelConnectionId AND sr.id=e.runId
 AND r.ingestionRunId=sr.id AND r.accountId=s.accountId AND r.channelConnectionId=s.channelConnectionId AND r.sourceSystem=c.channel
 AND n.rawSourceRecordId=r.id AND n.accountId=s.accountId AND n.channelConnectionId=s.channelConnectionId
 AND n.mappingVersionId=m.id AND n.normalizationRevision=NEW.normalizationRevision AND n.status='SUCCEEDED'
 AND m.activatedAt IS NOT NULL AND m.platform=c.channel
)) BEGIN SELECT RAISE(ABORT, 'D2B ledger provenance'); END;
CREATE TRIGGER "FinancialLedgerEntry_identity" BEFORE INSERT ON "FinancialLedgerEntry" WHEN NOT EXISTS (
 SELECT 1 FROM FinancialComponentHead h JOIN FinancialAuthorityScope s ON s.id=h.authorityScopeId
 JOIN FinancialAuthorityBinding b ON b.id=NEW.bindingId
 WHERE h.id=NEW.componentId AND h.accountId=NEW.accountId AND h.channelConnectionId=NEW.channelConnectionId
 AND h.authorityScopeId=NEW.authorityScopeId AND h.authorityClass=NEW.authorityClass
 AND s.marketplaceScopeKey=NEW.marketplaceScopeKey AND s.economicEventKey=NEW.economicEventKey
 AND b.authorityScopeId=s.id AND b.authorityClass=h.authorityClass AND b.sourceAuthority=h.sourceAuthority
 AND NOT EXISTS(SELECT 1 FROM FinancialAuthorityBinding next WHERE next.previousBindingId=b.id)
 AND NEW.revision=h.revision+1 AND NEW.previousEntryId IS h.currentEntryId
) BEGIN SELECT RAISE(ABORT, 'D2B entry identity or stale predecessor'); END;
CREATE TRIGGER "FinancialLedgerEntry_withdrawal" BEFORE INSERT ON "FinancialLedgerEntry" WHEN NEW.state='WITHDRAWN' AND NOT EXISTS (
 SELECT 1 FROM FinancialLedgerEntry p WHERE p.id=NEW.previousEntryId AND p.bindingId=NEW.bindingId
 AND p.amountAtoms=NEW.amountAtoms AND p.amountScale=NEW.amountScale AND p.currencyCode=NEW.currencyCode
 AND p.projectionKind=NEW.projectionKind AND p.economicRole=NEW.economicRole AND p.effectiveAt=NEW.effectiveAt
) BEGIN SELECT RAISE(ABORT, 'D2B withdrawal must retain prior economics'); END;
CREATE TRIGGER "FinancialLedgerEntry_commerce" BEFORE INSERT ON "FinancialLedgerEntry" WHEN 
 (NEW.orderId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM NormalizedOrder o WHERE o.id=NEW.orderId AND o.accountId=NEW.accountId AND o.channelConnectionId=NEW.channelConnectionId AND o.marketplaceScopeKey=NEW.marketplaceScopeKey))
 OR (NEW.itemId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM NormalizedOrderItem i WHERE i.id=NEW.itemId AND i.orderId=NEW.orderId AND i.accountId=NEW.accountId AND i.channelConnectionId=NEW.channelConnectionId))
 OR (NEW.orderRevisionId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM NormalizedOrderRevision r WHERE r.id=NEW.orderRevisionId AND r.orderId=NEW.orderId AND r.accountId=NEW.accountId AND r.channelConnectionId=NEW.channelConnectionId))
 OR (NEW.itemRevisionId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM NormalizedOrderItemRevision r WHERE r.id=NEW.itemRevisionId AND r.itemId=NEW.itemId AND r.accountId=NEW.accountId AND r.channelConnectionId=NEW.channelConnectionId))
 BEGIN SELECT RAISE(ABORT, 'D2B commerce linkage'); END;
CREATE TRIGGER "FinancialLedgerEntry_advance" AFTER INSERT ON "FinancialLedgerEntry" BEGIN UPDATE FinancialComponentHead SET currentEntryId=NEW.id,revision=NEW.revision WHERE id=NEW.componentId; END;
CREATE TRIGGER "FinancialAuthorityBinding_invalidate_INSERT" AFTER INSERT ON "FinancialAuthorityBinding" BEGIN UPDATE FinancialAuthorityScope SET inputVersion=inputVersion+1 WHERE id=NEW.authorityScopeId; END;
CREATE TRIGGER "FinancialComponentHead_invalidate_INSERT" AFTER INSERT ON "FinancialComponentHead" BEGIN UPDATE FinancialAuthorityScope SET inputVersion=inputVersion+1 WHERE id=NEW.authorityScopeId; END;
CREATE TRIGGER "FinancialComponentHead_invalidate_UPDATE" AFTER UPDATE ON "FinancialComponentHead" BEGIN UPDATE FinancialAuthorityScope SET inputVersion=inputVersion+1 WHERE id=NEW.authorityScopeId; END;
CREATE TRIGGER "FinancialAuthorityEvidence_invalidate_INSERT" AFTER INSERT ON "FinancialAuthorityEvidence" BEGIN UPDATE FinancialAuthorityScope SET inputVersion=inputVersion+1 WHERE id=NEW.authorityScopeId; END;
CREATE TRIGGER "FinancialAuthorityEvidence_invalidate_UPDATE" AFTER UPDATE ON "FinancialAuthorityEvidence" BEGIN UPDATE FinancialAuthorityScope SET inputVersion=inputVersion+1 WHERE id=NEW.authorityScopeId; END;
CREATE TRIGGER "FinancialAuthorityEvidenceSource_invalidate_INSERT" AFTER INSERT ON "FinancialAuthorityEvidenceSource" BEGIN UPDATE FinancialAuthorityScope SET inputVersion=inputVersion+1 WHERE id=(SELECT authorityScopeId FROM FinancialAuthorityEvidence WHERE id=NEW.evidenceId); END;
CREATE TRIGGER "FinancialAuthorityEvidenceMember_invalidate_INSERT" AFTER INSERT ON "FinancialAuthorityEvidenceMember" BEGIN UPDATE FinancialAuthorityScope SET inputVersion=inputVersion+1 WHERE id=(SELECT authorityScopeId FROM FinancialAuthorityEvidence WHERE id=NEW.evidenceId); END;
CREATE TRIGGER "FinancialAuthorityEvidence_insert" BEFORE INSERT ON "FinancialAuthorityEvidence" WHEN NEW.status<>'DRAFT' OR NOT (EXISTS (SELECT 1 FROM ChannelConnection c JOIN Account a ON a.id=c.accountId WHERE c.id=NEW.channelConnectionId AND c.accountId=NEW.accountId AND c.status='ACTIVE' AND a.status='ACTIVE')) OR NOT (EXISTS (SELECT 1 FROM MappingVersion m JOIN ChannelConnection c ON c.id=NEW.channelConnectionId WHERE m.id=NEW.mappingVersionId AND m.activatedAt IS NOT NULL AND m.platform=c.channel)) OR NOT ((NEW.previousEvidenceId IS NULL AND NEW.revision=1 AND NOT EXISTS(SELECT id FROM FinancialAuthorityEvidence WHERE authorityScopeId=NEW.authorityScopeId AND authorityClass=NEW.authorityClass ORDER BY revision DESC LIMIT 1)) OR EXISTS(SELECT 1 FROM FinancialAuthorityEvidence p WHERE p.id=NEW.previousEvidenceId AND p.id=(SELECT id FROM FinancialAuthorityEvidence WHERE authorityScopeId=NEW.authorityScopeId AND authorityClass=NEW.authorityClass ORDER BY revision DESC LIMIT 1) AND NEW.revision=p.revision+1)) BEGIN SELECT RAISE(ABORT, 'D2B manifest predecessor or policy'); END;
CREATE TRIGGER "FinancialAuthorityEvidence_update" BEFORE UPDATE ON "FinancialAuthorityEvidence" WHEN (NEW."id" IS NOT OLD."id" OR NEW."accountId" IS NOT OLD."accountId" OR NEW."channelConnectionId" IS NOT OLD."channelConnectionId" OR NEW."authorityScopeId" IS NOT OLD."authorityScopeId" OR NEW."authorityClass" IS NOT OLD."authorityClass" OR NEW."revision" IS NOT OLD."revision" OR NEW."previousEvidenceId" IS NOT OLD."previousEvidenceId" OR NEW."operationKey" IS NOT OLD."operationKey" OR NEW."inputChecksum" IS NOT OLD."inputChecksum" OR NEW."mappingVersionId" IS NOT OLD."mappingVersionId" OR NEW."coverageState" IS NOT OLD."coverageState" OR NEW."boundariesJson" IS NOT OLD."boundariesJson" OR NEW."sourceWatermark" IS NOT OLD."sourceWatermark" OR NEW."closureSyncSliceEvidenceId" IS NOT OLD."closureSyncSliceEvidenceId" OR NEW."closureLeafPath" IS NOT OLD."closureLeafPath" OR NEW."closureRuleKey" IS NOT OLD."closureRuleKey" OR NEW."expectedSourceCount" IS NOT OLD."expectedSourceCount" OR NEW."expectedMemberCount" IS NOT OLD."expectedMemberCount" OR NEW."reasonCode" IS NOT OLD."reasonCode" OR NEW."createdAt" IS NOT OLD."createdAt") OR OLD.status<>'DRAFT' OR NEW.status<>'SEALED' BEGIN SELECT RAISE(ABORT, 'D2B immutable evidence'); END;
CREATE TRIGGER "FinancialAuthorityEvidenceSource_insert" BEFORE INSERT ON "FinancialAuthorityEvidenceSource" WHEN NOT EXISTS(SELECT 1 FROM FinancialAuthorityEvidence e WHERE e.id=NEW.evidenceId AND e.status='DRAFT') OR NOT (EXISTS (
 SELECT 1 FROM FinancialAuthorityScope s
 JOIN SyncSliceEvidence e ON e.id=NEW.syncSliceEvidenceId
 JOIN SyncSlice sl ON sl.id=e.sliceId
 JOIN SyncRun sr ON sr.id=sl.runId
 JOIN RawSourceRecord r ON r.id=NEW.rawSourceRecordId
 JOIN NormalizationRun n ON n.id=NEW.normalizationRunId
 JOIN MappingVersion m ON m.id=NEW.mappingVersionId
 JOIN ChannelConnection c ON c.id=s.channelConnectionId
 WHERE s.id=(SELECT authorityScopeId FROM FinancialAuthorityEvidence WHERE id=NEW.evidenceId) AND s.accountId=NEW.accountId AND s.channelConnectionId=NEW.channelConnectionId
 AND e.accountId=s.accountId AND e.channelConnectionId=s.channelConnectionId AND e.rawSourceRecordId=r.id AND e.normalizationRunId=n.id
 AND sl.accountId=s.accountId AND sl.channelConnectionId=s.channelConnectionId AND sl.marketplaceScopeKey=s.marketplaceScopeKey
 AND sl.stream=CASE (SELECT authorityClass FROM FinancialAuthorityEvidence WHERE id=NEW.evidenceId) WHEN 'PROVISIONAL' THEN s.provisionalSourceAuthority ELSE s.actualSourceAuthority END
 AND sr.stream=sl.stream AND sr.accountId=s.accountId AND sr.channelConnectionId=s.channelConnectionId AND sr.id=e.runId
 AND r.ingestionRunId=sr.id AND r.accountId=s.accountId AND r.channelConnectionId=s.channelConnectionId AND r.sourceSystem=c.channel
 AND n.rawSourceRecordId=r.id AND n.accountId=s.accountId AND n.channelConnectionId=s.channelConnectionId
 AND n.mappingVersionId=m.id AND n.normalizationRevision=NEW.normalizationRevision AND n.status='SUCCEEDED'
 AND m.activatedAt IS NOT NULL AND m.platform=c.channel
)) BEGIN SELECT RAISE(ABORT, 'D2B manifest source provenance or sealed evidence'); END;
CREATE TRIGGER "FinancialAuthorityEvidenceMember_insert" BEFORE INSERT ON "FinancialAuthorityEvidenceMember" WHEN NOT EXISTS(
 SELECT 1 FROM FinancialAuthorityEvidence e JOIN FinancialComponentHead h ON h.id=NEW.componentId
 JOIN FinancialLedgerEntry l ON l.id=NEW.entryId WHERE e.id=NEW.evidenceId AND e.status='DRAFT'
 AND h.authorityScopeId=e.authorityScopeId AND h.authorityClass=e.authorityClass
 AND l.componentId=h.id AND h.currentEntryId=l.id
) BEGIN SELECT RAISE(ABORT, 'D2B manifest member or sealed evidence'); END;

-- A sealed manifest is valid only for the entire CURRENT representation inventory.
CREATE VIEW FinancialEvidenceValidity AS
SELECT e.id,
 CASE WHEN e.status='SEALED'
 AND (SELECT COUNT(*) FROM FinancialAuthorityEvidenceSource x WHERE x.evidenceId=e.id)=e.expectedSourceCount
 AND (SELECT COUNT(*) FROM FinancialAuthorityEvidenceMember x WHERE x.evidenceId=e.id)=e.expectedMemberCount
 AND NOT EXISTS(SELECT 1 FROM FinancialComponentHead h WHERE h.authorityScopeId=e.authorityScopeId AND h.authorityClass=e.authorityClass
   AND NOT EXISTS(SELECT 1 FROM FinancialAuthorityEvidenceMember x WHERE x.evidenceId=e.id AND x.componentId=h.id AND x.entryId=h.currentEntryId))
 AND NOT EXISTS(SELECT 1 FROM FinancialAuthorityEvidenceMember x JOIN FinancialComponentHead h ON h.id=x.componentId
   JOIN FinancialLedgerEntry l ON l.id=x.entryId WHERE x.evidenceId=e.id AND
   (h.authorityScopeId<>e.authorityScopeId OR h.authorityClass<>e.authorityClass OR h.currentEntryId IS NOT x.entryId
    OR NOT EXISTS(SELECT 1 FROM FinancialAuthorityEvidenceSource src WHERE src.evidenceId=e.id AND src.syncSliceEvidenceId=l.syncSliceEvidenceId)))
 AND (e.coverageState<>'COMPLETE' OR (
   EXISTS(SELECT 1 FROM FinancialAuthorityEvidenceSource src WHERE src.evidenceId=e.id AND src.syncSliceEvidenceId=e.closureSyncSliceEvidenceId)
   AND NOT EXISTS(SELECT 1 FROM FinancialAuthorityEvidenceMember x JOIN FinancialLedgerEntry l ON l.id=x.entryId
     WHERE x.evidenceId=e.id AND l.state='PRESENT' AND l.projectionKind='UNKNOWN_UNCLASSIFIED' AND l.economicRole='ECONOMIC')
 )) THEN 1 ELSE 0 END AS valid
FROM FinancialAuthorityEvidence e;
CREATE TRIGGER "FinancialAuthorityEvidence_seal" AFTER UPDATE ON "FinancialAuthorityEvidence" WHEN OLD.status='DRAFT' AND NEW.status='SEALED' AND NOT EXISTS(SELECT 1 FROM FinancialEvidenceValidity WHERE id=NEW.id AND valid=1) BEGIN SELECT RAISE(ABORT, 'D2B incomplete manifest or missing closure'); END;

CREATE VIEW FinancialScopeResolution AS
WITH RECURSIVE lineage(rootId,id) AS (
 SELECT id,id FROM FinancialAuthorityBinding
 UNION ALL SELECT lineage.rootId,b.id FROM lineage JOIN FinancialAuthorityBinding b ON b.previousBindingId=lineage.id
)
SELECT s.id, CASE WHEN s.coverageFamily='UNRESOLVED_EVENT'
 AND EXISTS(SELECT 1 FROM FinancialComponentHead h WHERE h.authorityScopeId=s.id)
 AND NOT EXISTS(SELECT 1 FROM FinancialComponentHead h LEFT JOIN FinancialLedgerEntry l ON l.id=h.currentEntryId
 WHERE h.authorityScopeId=s.id AND (l.id IS NULL OR l.state<>'WITHDRAWN' OR NOT EXISTS(
  SELECT 1 FROM lineage chain JOIN FinancialAuthorityBinding b ON b.id=chain.id
  JOIN FinancialAuthorityScope target ON target.id=b.authorityScopeId
  JOIN FinancialComponentHead nh ON nh.authorityScopeId=target.id AND nh.sourceComponentKey=h.sourceComponentKey
    AND nh.authorityClass=h.authorityClass AND nh.sourceAuthority=h.sourceAuthority
  JOIN FinancialLedgerEntry nl ON nl.id=nh.currentEntryId AND nl.bindingId=b.id
  WHERE chain.rootId=l.bindingId AND b.id<>l.bindingId AND target.coverageFamily<>'UNRESOLVED_EVENT'
  AND nl.state='PRESENT' AND NOT EXISTS(SELECT 1 FROM FinancialAuthorityBinding successor WHERE successor.previousBindingId=b.id)
 ))) THEN 1 ELSE 0 END AS resolved FROM FinancialAuthorityScope s;
CREATE VIEW FinancialScopeAuthority AS
WITH latest AS (
 SELECT s.*,
 (SELECT e.id FROM FinancialAuthorityEvidence e WHERE e.authorityScopeId=s.id AND e.authorityClass='PROVISIONAL' ORDER BY revision DESC LIMIT 1) AS pId,
 (SELECT e.id FROM FinancialAuthorityEvidence e WHERE e.authorityScopeId=s.id AND e.authorityClass='ACTUAL' ORDER BY revision DESC LIMIT 1) AS aId
 FROM FinancialAuthorityScope s
), states AS (
 SELECT s.*, CASE
 WHEN (s.coverageFamily='UNRESOLVED_EVENT' AND NOT EXISTS(SELECT 1 FROM FinancialScopeResolution resolution WHERE resolution.id=s.id AND resolution.resolved=1)) OR a.coverageState='UNKNOWN'
 OR (SELECT COUNT(DISTINCT l.currencyCode) FROM FinancialComponentHead h JOIN FinancialLedgerEntry l ON l.id=h.currentEntryId WHERE h.authorityScopeId=s.id AND l.state='PRESENT' AND l.economicRole='ECONOMIC')>1
 OR EXISTS(SELECT 1 FROM FinancialComponentHead h JOIN FinancialLedgerEntry l ON l.id=h.currentEntryId
 WHERE h.authorityScopeId=s.id AND l.state='PRESENT' AND l.economicRole='ECONOMIC' AND l.projectionKind='UNKNOWN_UNCLASSIFIED')
 THEN 'ACTUAL_UNKNOWN'
 WHEN a.coverageState='COMPLETE' AND av.valid=1 THEN 'ACTUAL_COMPLETE'
 WHEN s.aId IS NOT NULL OR EXISTS(SELECT 1 FROM FinancialComponentHead h WHERE h.authorityScopeId=s.id AND h.authorityClass='ACTUAL')
 THEN 'ACTUAL_INCOMPLETE' ELSE 'NO_ACTUAL' END AS authorityState,
 CASE WHEN p.coverageState='COMPLETE' AND pv.valid=1 THEN 1 ELSE 0 END AS provisionalComplete
 FROM latest s LEFT JOIN FinancialAuthorityEvidence a ON a.id=s.aId LEFT JOIN FinancialEvidenceValidity av ON av.id=s.aId
 LEFT JOIN FinancialAuthorityEvidence p ON p.id=s.pId LEFT JOIN FinancialEvidenceValidity pv ON pv.id=s.pId
)
SELECT s.*, CASE WHEN authorityState='ACTUAL_UNKNOWN' THEN 'BLOCKED'
 WHEN authorityState='ACTUAL_COMPLETE' THEN 'ACTUAL'
 WHEN provisionalComplete=1 THEN 'PROVISIONAL' ELSE 'BLOCKED' END AS selectedClass
FROM states s;
CREATE TRIGGER "FinancialAuthorityDecision_insert" BEFORE INSERT ON "FinancialAuthorityDecision" WHEN NEW.status<>'DRAFT' OR NOT (EXISTS (SELECT 1 FROM ChannelConnection c JOIN Account a ON a.id=c.accountId WHERE c.id=NEW.channelConnectionId AND c.accountId=NEW.accountId AND c.status='ACTIVE' AND a.status='ACTIVE')) OR NOT EXISTS(
 SELECT 1 FROM FinancialScopeAuthority s WHERE s.id=NEW.authorityScopeId AND s.policyMappingVersionId=NEW.mappingVersionId
 AND NEW.inputVersion=s.inputVersion AND NEW.previousDecisionId IS s.currentDecisionId
 AND NEW.revision=COALESCE((SELECT revision FROM FinancialAuthorityDecision WHERE id=s.currentDecisionId),0)+1
 AND NEW.provisionalEvidenceId IS s.pId AND NEW.actualEvidenceId IS s.aId
 AND NEW.authorityState=s.authorityState AND NEW.selectedClass=s.selectedClass
 AND (s.pId IS NULL OR EXISTS(SELECT 1 FROM FinancialEvidenceValidity v WHERE v.id=s.pId AND v.valid=1))
 AND (s.aId IS NULL OR EXISTS(SELECT 1 FROM FinancialEvidenceValidity v WHERE v.id=s.aId AND v.valid=1))
 AND NOT EXISTS(SELECT 1 FROM FinancialComponentHead h WHERE h.authorityScopeId=s.id AND ((h.authorityClass='PROVISIONAL' AND s.pId IS NULL) OR (h.authorityClass='ACTUAL' AND s.aId IS NULL)))
) BEGIN SELECT RAISE(ABORT, 'D2B decision basis or stale CAS'); END;
CREATE TRIGGER "FinancialAuthorityDecision_update" BEFORE UPDATE ON "FinancialAuthorityDecision" WHEN (NEW."id" IS NOT OLD."id" OR NEW."accountId" IS NOT OLD."accountId" OR NEW."channelConnectionId" IS NOT OLD."channelConnectionId" OR NEW."authorityScopeId" IS NOT OLD."authorityScopeId" OR NEW."revision" IS NOT OLD."revision" OR NEW."previousDecisionId" IS NOT OLD."previousDecisionId" OR NEW."inputVersion" IS NOT OLD."inputVersion" OR NEW."provisionalEvidenceId" IS NOT OLD."provisionalEvidenceId" OR NEW."actualEvidenceId" IS NOT OLD."actualEvidenceId" OR NEW."authorityState" IS NOT OLD."authorityState" OR NEW."selectedClass" IS NOT OLD."selectedClass" OR NEW."reasonCode" IS NOT OLD."reasonCode" OR NEW."operationKey" IS NOT OLD."operationKey" OR NEW."inputChecksum" IS NOT OLD."inputChecksum" OR NEW."mappingVersionId" IS NOT OLD."mappingVersionId" OR NEW."createdAt" IS NOT OLD."createdAt") OR OLD.status<>'DRAFT' OR NEW.status<>'PUBLISHED' BEGIN SELECT RAISE(ABORT, 'D2B immutable decision'); END;
CREATE TRIGGER "FinancialComponentSelection_insert" BEFORE INSERT ON "FinancialComponentSelection" WHEN NOT EXISTS(
 SELECT 1 FROM FinancialAuthorityDecision d JOIN FinancialComponentHead h ON h.id=NEW.componentId
 JOIN FinancialLedgerEntry l ON l.id=NEW.entryId
 WHERE d.id=NEW.decisionId AND d.status='DRAFT' AND h.authorityScopeId=d.authorityScopeId AND h.currentEntryId=l.id AND l.componentId=h.id
 AND NEW.role=CASE WHEN l.state='WITHDRAWN' THEN 'WITHDRAWN'
 WHEN l.economicRole='INFORMATIONAL' THEN 'INFORMATIONAL'
 WHEN h.authorityClass=d.selectedClass THEN 'SELECTED' ELSE 'SUPPRESSED' END
) BEGIN SELECT RAISE(ABORT, 'D2B invalid selection or published decision'); END;

CREATE VIEW FinancialDecisionValidity AS
SELECT d.id, CASE WHEN
 d.inputVersion=s.inputVersion AND d.provisionalEvidenceId IS s.pId AND d.actualEvidenceId IS s.aId
 AND d.authorityState=s.authorityState AND d.selectedClass=s.selectedClass AND d.mappingVersionId=s.policyMappingVersionId
 AND (d.provisionalEvidenceId IS NULL OR EXISTS(SELECT 1 FROM FinancialEvidenceValidity ev WHERE ev.id=d.provisionalEvidenceId AND ev.valid=1))
 AND (d.actualEvidenceId IS NULL OR EXISTS(SELECT 1 FROM FinancialEvidenceValidity ev WHERE ev.id=d.actualEvidenceId AND ev.valid=1))
 AND NOT EXISTS(SELECT 1 FROM FinancialComponentHead h WHERE h.authorityScopeId=d.authorityScopeId
   AND NOT EXISTS(SELECT 1 FROM FinancialComponentSelection x WHERE x.decisionId=d.id AND x.componentId=h.id AND x.entryId=h.currentEntryId))
 AND NOT EXISTS(SELECT 1 FROM FinancialComponentSelection x JOIN FinancialComponentHead h ON h.id=x.componentId JOIN FinancialLedgerEntry l ON l.id=x.entryId
 WHERE x.decisionId=d.id AND (h.authorityScopeId<>d.authorityScopeId OR h.currentEntryId IS NOT l.id OR l.componentId<>h.id OR
 x.role IS NOT CASE WHEN l.state='WITHDRAWN' THEN 'WITHDRAWN' WHEN l.economicRole='INFORMATIONAL' THEN 'INFORMATIONAL'
 WHEN h.authorityClass=d.selectedClass THEN 'SELECTED' ELSE 'SUPPRESSED' END))
 THEN 1 ELSE 0 END AS valid
FROM FinancialAuthorityDecision d JOIN FinancialScopeAuthority s ON s.id=d.authorityScopeId;
CREATE VIEW EffectiveFinancialComponent AS
SELECT l.*, d.id AS decisionId FROM FinancialAuthorityScope s
JOIN FinancialAuthorityDecision d ON d.id=s.currentDecisionId AND d.status='PUBLISHED' AND d.selectedClass<>'BLOCKED'
JOIN FinancialDecisionValidity v ON v.id=d.id AND v.valid=1
JOIN FinancialComponentSelection x ON x.decisionId=d.id AND x.role='SELECTED'
JOIN FinancialLedgerEntry l ON l.id=x.entryId;
CREATE TRIGGER "FinancialAuthorityDecision_publish" BEFORE UPDATE ON "FinancialAuthorityDecision" WHEN OLD.status='DRAFT' AND NEW.status='PUBLISHED' AND (
 NOT EXISTS(SELECT 1 FROM FinancialDecisionValidity v WHERE v.id=NEW.id AND v.valid=1)
 OR NOT EXISTS(SELECT 1 FROM FinancialAuthorityScope s WHERE s.id=NEW.authorityScopeId AND s.currentDecisionId IS NEW.previousDecisionId)
) BEGIN SELECT RAISE(ABORT, 'D2B stale decision or incomplete selection'); END;
CREATE TRIGGER "FinancialAuthorityDecision_advance" AFTER UPDATE ON "FinancialAuthorityDecision" WHEN OLD.status='DRAFT' AND NEW.status='PUBLISHED' BEGIN UPDATE FinancialAuthorityScope SET currentDecisionId=NEW.id WHERE id=NEW.authorityScopeId; END;
CREATE TRIGGER "SyncSlice_d2b_identity" BEFORE UPDATE ON "SyncSlice" WHEN (NEW.accountId IS NOT OLD.accountId OR NEW.channelConnectionId IS NOT OLD.channelConnectionId OR NEW.runId IS NOT OLD.runId OR NEW.marketplaceId IS NOT OLD.marketplaceId OR NEW.marketplaceScopeKey IS NOT OLD.marketplaceScopeKey OR NEW.stream IS NOT OLD.stream) AND EXISTS(SELECT 1 FROM SyncSliceEvidence e WHERE e.sliceId=OLD.id AND (EXISTS(SELECT 1 FROM FinancialLedgerEntry l WHERE l.syncSliceEvidenceId=e.id) OR EXISTS(SELECT 1 FROM FinancialAuthorityBinding b WHERE b.syncSliceEvidenceId=e.id) OR EXISTS(SELECT 1 FROM FinancialAuthorityEvidenceSource x WHERE x.syncSliceEvidenceId=e.id))) BEGIN SELECT RAISE(ABORT, 'D2B cited slice identity'); END;

-- Unpublished staging may be abandoned; publication/evidence history remains immutable.
CREATE TRIGGER FinancialAuthorityEvidence_draft_delete AFTER DELETE ON FinancialAuthorityEvidence
BEGIN UPDATE FinancialAuthorityScope SET inputVersion=inputVersion+1 WHERE id=OLD.authorityScopeId; END;
-- Extend provenance stability only for D2B-cited source identities. Lifecycle status is still mutable.
CREATE TRIGGER SyncRun_d2b_identity BEFORE UPDATE ON SyncRun
WHEN (NEW.accountId IS NOT OLD.accountId OR NEW.channelConnectionId IS NOT OLD.channelConnectionId OR NEW.stream IS NOT OLD.stream
 OR NEW.mappingVersionId IS NOT OLD.mappingVersionId OR NEW.authorizationVersion IS NOT OLD.authorizationVersion)
AND EXISTS(SELECT 1 FROM SyncSliceEvidence e WHERE e.runId=OLD.id AND
 (EXISTS(SELECT 1 FROM FinancialLedgerEntry l WHERE l.syncSliceEvidenceId=e.id)
 OR EXISTS(SELECT 1 FROM FinancialAuthorityBinding b WHERE b.syncSliceEvidenceId=e.id)
 OR EXISTS(SELECT 1 FROM FinancialAuthorityEvidenceSource x WHERE x.syncSliceEvidenceId=e.id)))
BEGIN SELECT RAISE(ABORT, 'D2B cited run identity'); END;
CREATE TRIGGER ChannelConnection_d2b_identity BEFORE UPDATE ON ChannelConnection
WHEN (NEW.accountId IS NOT OLD.accountId OR NEW.channel IS NOT OLD.channel OR NEW.externalAccountId IS NOT OLD.externalAccountId)
AND EXISTS(SELECT 1 FROM FinancialAuthorityScope s WHERE s.channelConnectionId=OLD.id)
BEGIN SELECT RAISE(ABORT, 'D2B cited channel identity'); END;
CREATE TRIGGER Marketplace_d2b_identity BEFORE UPDATE ON Marketplace
WHEN (NEW.accountId IS NOT OLD.accountId OR NEW.channelConnectionId IS NOT OLD.channelConnectionId OR NEW.externalMarketplaceId IS NOT OLD.externalMarketplaceId)
AND EXISTS(SELECT 1 FROM FinancialAuthorityScope s WHERE s.marketplaceId=OLD.id)
BEGIN SELECT RAISE(ABORT, 'D2B cited marketplace identity'); END;

-- REPLACE performs implicit deletes without DELETE triggers when recursive_triggers=OFF.
-- Reject collisions before SQLite can displace any D2B identity, including draft staging.
-- Include the implicit SQLite rowid identity, which is also a REPLACE conflict target.
-- Service replay reads existing rows; it never needs replacement semantics.
CREATE TRIGGER "FinancialCurrencyDefinition_no_replace" BEFORE INSERT ON "FinancialCurrencyDefinition"
WHEN EXISTS (SELECT 1 FROM "FinancialCurrencyDefinition" existing WHERE
 (existing.rowid = NEW.rowid)
 OR (existing."id" = NEW."id")
 OR (existing."code" = NEW."code"))
BEGIN SELECT RAISE(ABORT, 'D2B UNIQUE collision: immutable identity cannot be replaced'); END;
CREATE TRIGGER "FinancialAuthorityScope_no_replace" BEFORE INSERT ON "FinancialAuthorityScope"
WHEN EXISTS (SELECT 1 FROM "FinancialAuthorityScope" existing WHERE
 (existing.rowid = NEW.rowid)
 OR (existing."id" = NEW."id")
 OR (existing."id" = NEW."id" AND existing."accountId" = NEW."accountId" AND existing."channelConnectionId" = NEW."channelConnectionId")
 OR (existing."accountId" = NEW."accountId" AND existing."channelConnectionId" = NEW."channelConnectionId" AND existing."marketplaceScopeKey" = NEW."marketplaceScopeKey" AND existing."economicEventKey" = NEW."economicEventKey" AND existing."coverageFamily" = NEW."coverageFamily"))
BEGIN SELECT RAISE(ABORT, 'D2B UNIQUE collision: immutable identity cannot be replaced'); END;
CREATE TRIGGER "FinancialAuthorityBinding_no_replace" BEFORE INSERT ON "FinancialAuthorityBinding"
WHEN EXISTS (SELECT 1 FROM "FinancialAuthorityBinding" existing WHERE
 (existing.rowid = NEW.rowid)
 OR (existing."id" = NEW."id")
 OR (existing."id" = NEW."id" AND existing."accountId" = NEW."accountId" AND existing."channelConnectionId" = NEW."channelConnectionId")
 OR (existing."channelConnectionId" = NEW."channelConnectionId" AND existing."sourceAuthority" = NEW."sourceAuthority" AND existing."sourceEventNamespace" = NEW."sourceEventNamespace" AND existing."sourceEventIdentity" = NEW."sourceEventIdentity" AND existing."revision" = NEW."revision")
 OR (existing."channelConnectionId" = NEW."channelConnectionId" AND existing."sourceAuthority" = NEW."sourceAuthority" AND existing."sourceEventNamespace" = NEW."sourceEventNamespace" AND existing."sourceEventIdentity" = NEW."sourceEventIdentity" AND existing."operationKey" = NEW."operationKey")
 OR (existing."previousBindingId" = NEW."previousBindingId"))
BEGIN SELECT RAISE(ABORT, 'D2B UNIQUE collision: immutable identity cannot be replaced'); END;
CREATE TRIGGER "FinancialComponentHead_no_replace" BEFORE INSERT ON "FinancialComponentHead"
WHEN EXISTS (SELECT 1 FROM "FinancialComponentHead" existing WHERE
 (existing.rowid = NEW.rowid)
 OR (existing."id" = NEW."id")
 OR (existing."id" = NEW."id" AND existing."accountId" = NEW."accountId" AND existing."channelConnectionId" = NEW."channelConnectionId")
 OR (existing."authorityScopeId" = NEW."authorityScopeId" AND existing."authorityClass" = NEW."authorityClass" AND existing."sourceAuthority" = NEW."sourceAuthority" AND existing."sourceComponentKey" = NEW."sourceComponentKey"))
BEGIN SELECT RAISE(ABORT, 'D2B UNIQUE collision: immutable identity cannot be replaced'); END;
CREATE TRIGGER "FinancialLedgerEntry_no_replace" BEFORE INSERT ON "FinancialLedgerEntry"
WHEN EXISTS (SELECT 1 FROM "FinancialLedgerEntry" existing WHERE
 (existing.rowid = NEW.rowid)
 OR (existing."id" = NEW."id")
 OR (existing."id" = NEW."id" AND existing."accountId" = NEW."accountId" AND existing."channelConnectionId" = NEW."channelConnectionId")
 OR (existing."componentId" = NEW."componentId" AND existing."revision" = NEW."revision")
 OR (existing."componentId" = NEW."componentId" AND existing."operationKey" = NEW."operationKey")
 OR (existing."previousEntryId" = NEW."previousEntryId"))
BEGIN SELECT RAISE(ABORT, 'D2B UNIQUE collision: immutable identity cannot be replaced'); END;
CREATE TRIGGER "FinancialAuthorityEvidence_no_replace" BEFORE INSERT ON "FinancialAuthorityEvidence"
WHEN EXISTS (SELECT 1 FROM "FinancialAuthorityEvidence" existing WHERE
 (existing.rowid = NEW.rowid)
 OR (existing."id" = NEW."id")
 OR (existing."id" = NEW."id" AND existing."accountId" = NEW."accountId" AND existing."channelConnectionId" = NEW."channelConnectionId")
 OR (existing."authorityScopeId" = NEW."authorityScopeId" AND existing."authorityClass" = NEW."authorityClass" AND existing."revision" = NEW."revision")
 OR (existing."authorityScopeId" = NEW."authorityScopeId" AND existing."authorityClass" = NEW."authorityClass" AND existing."operationKey" = NEW."operationKey")
 OR (existing."previousEvidenceId" = NEW."previousEvidenceId"))
BEGIN SELECT RAISE(ABORT, 'D2B UNIQUE collision: immutable identity cannot be replaced'); END;
CREATE TRIGGER "FinancialAuthorityEvidenceSource_no_replace" BEFORE INSERT ON "FinancialAuthorityEvidenceSource"
WHEN EXISTS (SELECT 1 FROM "FinancialAuthorityEvidenceSource" existing WHERE
 (existing.rowid = NEW.rowid)
 OR (existing."id" = NEW."id")
 OR (existing."id" = NEW."id" AND existing."accountId" = NEW."accountId" AND existing."channelConnectionId" = NEW."channelConnectionId")
 OR (existing."evidenceId" = NEW."evidenceId" AND existing."syncSliceEvidenceId" = NEW."syncSliceEvidenceId"))
BEGIN SELECT RAISE(ABORT, 'D2B UNIQUE collision: immutable identity cannot be replaced'); END;
CREATE TRIGGER "FinancialAuthorityEvidenceMember_no_replace" BEFORE INSERT ON "FinancialAuthorityEvidenceMember"
WHEN EXISTS (SELECT 1 FROM "FinancialAuthorityEvidenceMember" existing WHERE
 (existing.rowid = NEW.rowid)
 OR (existing."id" = NEW."id")
 OR (existing."id" = NEW."id" AND existing."accountId" = NEW."accountId" AND existing."channelConnectionId" = NEW."channelConnectionId")
 OR (existing."evidenceId" = NEW."evidenceId" AND existing."componentId" = NEW."componentId"))
BEGIN SELECT RAISE(ABORT, 'D2B UNIQUE collision: immutable identity cannot be replaced'); END;
CREATE TRIGGER "FinancialAuthorityDecision_no_replace" BEFORE INSERT ON "FinancialAuthorityDecision"
WHEN EXISTS (SELECT 1 FROM "FinancialAuthorityDecision" existing WHERE
 (existing.rowid = NEW.rowid)
 OR (existing."id" = NEW."id")
 OR (existing."id" = NEW."id" AND existing."accountId" = NEW."accountId" AND existing."channelConnectionId" = NEW."channelConnectionId")
 OR (existing."authorityScopeId" = NEW."authorityScopeId" AND existing."revision" = NEW."revision")
 OR (existing."authorityScopeId" = NEW."authorityScopeId" AND existing."operationKey" = NEW."operationKey")
 OR (existing."previousDecisionId" = NEW."previousDecisionId"))
BEGIN SELECT RAISE(ABORT, 'D2B UNIQUE collision: immutable identity cannot be replaced'); END;
CREATE TRIGGER "FinancialComponentSelection_no_replace" BEFORE INSERT ON "FinancialComponentSelection"
WHEN EXISTS (SELECT 1 FROM "FinancialComponentSelection" existing WHERE
 (existing.rowid = NEW.rowid)
 OR (existing."id" = NEW."id")
 OR (existing."id" = NEW."id" AND existing."accountId" = NEW."accountId" AND existing."channelConnectionId" = NEW."channelConnectionId")
 OR (existing."decisionId" = NEW."decisionId" AND existing."componentId" = NEW."componentId"))
BEGIN SELECT RAISE(ABORT, 'D2B UNIQUE collision: immutable identity cannot be replaced'); END;
