DROP TRIGGER IF EXISTS "CurrencyPolicyVersion_activated_semantics";
DROP TRIGGER IF EXISTS "CurrencyPolicyVersion_activated_no_delete";

CREATE TRIGGER "CurrencyPolicyVersion_validate_insert" BEFORE INSERT ON "CurrencyPolicyVersion"
WHEN EXISTS (SELECT 1 FROM "CurrencyPolicyVersion" AS existing
    WHERE existing."activatedAt" IS NOT NULL AND
      (existing."id" = NEW."id" OR existing."version" = NEW."version" OR (NEW.rowid > 0 AND existing.rowid = NEW.rowid)))
  OR NEW."roundingMode" NOT IN ('REJECT','HALF_UP','HALF_EVEN')
  OR NEW."residualPolicy" NOT IN ('REJECT','SEPARATE')
  OR typeof(NEW."toleranceAtoms") <> 'integer' OR NEW."toleranceAtoms" < 0
  OR typeof(NEW."toleranceScale") <> 'integer' OR NEW."toleranceScale" < 0 OR NEW."toleranceScale" > 12
  OR (NEW."deactivatedAt" IS NOT NULL AND NEW."activatedAt" IS NULL)
  OR (NEW."deactivatedAt" IS NOT NULL AND NEW."deactivatedAt" < NEW."activatedAt")
  OR (NEW."activatedAt" IS NOT NULL AND NEW."deactivatedAt" IS NULL AND EXISTS (
    SELECT 1 FROM "CurrencyPolicyVersion" WHERE "activatedAt" IS NOT NULL AND "deactivatedAt" IS NULL))
BEGIN SELECT RAISE(ABORT, 'Invalid CurrencyPolicyVersion'); END;

CREATE TRIGGER "CurrencyPolicyVersion_validate_update" BEFORE UPDATE ON "CurrencyPolicyVersion"
WHEN NEW."roundingMode" NOT IN ('REJECT','HALF_UP','HALF_EVEN')
  OR NEW."residualPolicy" NOT IN ('REJECT','SEPARATE')
  OR typeof(NEW."toleranceAtoms") <> 'integer' OR NEW."toleranceAtoms" < 0
  OR typeof(NEW."toleranceScale") <> 'integer' OR NEW."toleranceScale" < 0 OR NEW."toleranceScale" > 12
  OR (NEW."deactivatedAt" IS NOT NULL AND NEW."activatedAt" IS NULL)
  OR (NEW."deactivatedAt" IS NOT NULL AND NEW."deactivatedAt" < NEW."activatedAt")
  OR (OLD."activatedAt" IS NOT NULL AND NEW."activatedAt" IS NOT OLD."activatedAt")
  OR (OLD."deactivatedAt" IS NOT NULL AND NEW."deactivatedAt" IS NOT OLD."deactivatedAt")
  OR (OLD."activatedAt" IS NOT NULL AND (
    NEW."version" IS NOT OLD."version" OR NEW."checksum" IS NOT OLD."checksum" OR
    NEW."exponentSourceVersion" IS NOT OLD."exponentSourceVersion" OR NEW."roundingMode" IS NOT OLD."roundingMode" OR
    NEW."toleranceAtoms" IS NOT OLD."toleranceAtoms" OR NEW."toleranceScale" IS NOT OLD."toleranceScale" OR
    NEW."residualPolicy" IS NOT OLD."residualPolicy"))
  OR (NEW."activatedAt" IS NOT NULL AND NEW."deactivatedAt" IS NULL AND EXISTS (
    SELECT 1 FROM "CurrencyPolicyVersion" WHERE "id" <> OLD."id" AND "activatedAt" IS NOT NULL AND "deactivatedAt" IS NULL))
BEGIN SELECT RAISE(ABORT, 'Invalid CurrencyPolicyVersion lifecycle'); END;

CREATE TRIGGER "CurrencyPolicyVersion_activated_no_delete" BEFORE DELETE ON "CurrencyPolicyVersion"
WHEN OLD."activatedAt" IS NOT NULL BEGIN SELECT RAISE(ABORT, 'Activated CurrencyPolicyVersion cannot be deleted'); END;
