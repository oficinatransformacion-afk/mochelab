ALTER TABLE "initiative"
  ADD COLUMN "improvement_supervisor_id" UUID;

UPDATE "initiative" initiative
SET "improvement_supervisor_id" = catalog_value.id
FROM "initiative_responsible" responsible
JOIN "person_role" person_role ON person_role.id = responsible.person_role_id
JOIN "person" person ON person.id = person_role.person_id
JOIN "catalog_value" catalog_value
  ON UPPER(TRIM(catalog_value.name)) = UPPER(TRIM(person.names))
JOIN "catalog" catalog ON catalog.id = catalog_value.catalog_id
WHERE responsible.initiative_id = initiative.id
  AND responsible.responsibility_type = 'IMPROVEMENT_SUPERVISOR'
  AND catalog.code = 'SUPERVISOR_MEJORA_CONTINUA';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "initiative_responsible" responsible
    JOIN "person_role" person_role ON person_role.id = responsible.person_role_id
    JOIN "person" person ON person.id = person_role.person_id
    WHERE responsible.responsibility_type = 'IMPROVEMENT_SUPERVISOR'
      AND NOT EXISTS (
        SELECT 1
        FROM "catalog_value" catalog_value
        JOIN "catalog" catalog ON catalog.id = catalog_value.catalog_id
        WHERE catalog.code = 'SUPERVISOR_MEJORA_CONTINUA'
          AND UPPER(TRIM(catalog_value.name)) = UPPER(TRIM(person.names))
      )
  ) THEN
    RAISE EXCEPTION 'An existing improvement supervisor does not match the supervisor catalog';
  END IF;
END $$;

DELETE FROM "initiative_responsible"
WHERE responsibility_type = 'IMPROVEMENT_SUPERVISOR';

ALTER TABLE "initiative"
  ADD CONSTRAINT "initiative_improvement_supervisor_id_fkey"
  FOREIGN KEY ("improvement_supervisor_id") REFERENCES "catalog_value"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "initiative_improvement_supervisor_id_idx"
  ON "initiative"("improvement_supervisor_id");
