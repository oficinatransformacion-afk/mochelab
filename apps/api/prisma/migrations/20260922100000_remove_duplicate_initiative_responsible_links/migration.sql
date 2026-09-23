-- Preserve any assignments still present only in the legacy foreign-key columns.
INSERT INTO "initiative_responsible" ("initiative_id", "person_role_id", "responsibility_type")
SELECT "id", "product_owner_person_role_id", 'PRODUCT_OWNER'::"InitiativeResponsibilityType"
FROM "initiative"
WHERE "product_owner_person_role_id" IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "initiative_responsible" ("initiative_id", "person_role_id", "responsibility_type")
SELECT i."id", i."manager_person_role_id",
  CASE
    WHEN UPPER(TRIM(r."name")) = 'ATF' THEN 'ATF'::"InitiativeResponsibilityType"
    ELSE 'MANAGER'::"InitiativeResponsibilityType"
  END
FROM "initiative" i
JOIN "person_role" pr ON pr."id" = i."manager_person_role_id"
JOIN "role" r ON r."id" = pr."role_id"
WHERE i."manager_person_role_id" IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "initiative_responsible" ("initiative_id", "person_role_id", "responsibility_type")
SELECT "id", "technical_lead_person_role_id", 'TECHNICAL_LEAD'::"InitiativeResponsibilityType"
FROM "initiative"
WHERE "technical_lead_person_role_id" IS NOT NULL
ON CONFLICT DO NOTHING;

DROP INDEX IF EXISTS "initiative_product_owner_person_role_id_idx";
DROP INDEX IF EXISTS "initiative_manager_person_role_id_idx";
DROP INDEX IF EXISTS "initiative_technical_lead_person_role_id_idx";

ALTER TABLE "initiative"
  DROP CONSTRAINT IF EXISTS "initiative_product_owner_person_role_id_fkey",
  DROP CONSTRAINT IF EXISTS "initiative_manager_person_role_id_fkey",
  DROP CONSTRAINT IF EXISTS "initiative_technical_lead_person_role_id_fkey",
  DROP COLUMN "product_owner_person_role_id",
  DROP COLUMN "manager_person_role_id",
  DROP COLUMN "technical_lead_person_role_id";
