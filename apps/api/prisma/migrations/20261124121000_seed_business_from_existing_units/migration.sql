-- Reuse the existing organizational master as the initial Business source.
-- IDs are preserved so every option is traceable to its originating UNIDAD.
INSERT INTO "business" ("id","code","name","company_id","active","created_at","updated_at")
SELECT ou."id",ou."code",ou."name",ou."company_id",ou."active",ou."created_at",ou."updated_at"
FROM "organizational_unit" ou
WHERE ou."unit_type"='UNIDAD'
ON CONFLICT ("id") DO UPDATE SET
  "code"=EXCLUDED."code",
  "name"=EXCLUDED."name",
  "company_id"=EXCLUDED."company_id",
  "active"=EXCLUDED."active",
  "updated_at"=EXCLUDED."updated_at";
