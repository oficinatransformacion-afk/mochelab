ALTER TABLE "person"
  ADD COLUMN IF NOT EXISTS "management_id" UUID,
  ADD COLUMN IF NOT EXISTS "sub_management_id" UUID,
  ADD COLUMN IF NOT EXISTS "division_id" UUID,
  ADD COLUMN IF NOT EXISTS "business_partner_value_id" UUID;

INSERT INTO "catalog" ("id", "code", "name", "created_at", "updated_at")
SELECT gen_random_uuid(), 'BUSINESS_PARTNER', 'Business Partner', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "catalog" WHERE "code" = 'BUSINESS_PARTNER');

INSERT INTO "catalog_value" ("id", "catalog_id", "code", "name", "sort_order", "active", "created_at", "updated_at")
SELECT gen_random_uuid(), c."id", bp."code", bp."name", 0, bp."active", now(), now()
FROM "business_partner" bp
JOIN "catalog" c ON c."code" = 'BUSINESS_PARTNER'
WHERE NOT EXISTS (SELECT 1 FROM "catalog_value" cv WHERE cv."catalog_id" = c."id" AND cv."code" = bp."code");

UPDATE "person" p
SET "business_partner_value_id" = cv."id"
FROM "business_partner" bp
JOIN "catalog" c ON c."code" = 'BUSINESS_PARTNER'
JOIN "catalog_value" cv ON cv."catalog_id" = c."id" AND cv."code" = bp."code"
WHERE p."business_partner_id" = bp."id";

ALTER TABLE "person"
  ADD CONSTRAINT "person_management_id_fkey" FOREIGN KEY ("management_id") REFERENCES "organizational_unit"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "person_sub_management_id_fkey" FOREIGN KEY ("sub_management_id") REFERENCES "organizational_unit"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "person_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "organizational_unit"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "person_business_partner_value_id_fkey" FOREIGN KEY ("business_partner_value_id") REFERENCES "catalog_value"("id") ON DELETE SET NULL;
