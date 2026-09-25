ALTER TABLE "person" DROP CONSTRAINT IF EXISTS "person_management_id_fkey";
ALTER TABLE "person" DROP CONSTRAINT IF EXISTS "person_division_id_fkey";

INSERT INTO "catalog" ("id","code","name","created_at","updated_at")
SELECT gen_random_uuid(), x.code, x.name, now(), now()
FROM (VALUES ('GERENCIA','Gerencia'),('DIVISION','División')) x(code,name)
WHERE NOT EXISTS (SELECT 1 FROM "catalog" c WHERE c."code"=x.code);

INSERT INTO "catalog_value" ("id","catalog_id","code","name","sort_order","active","created_at","updated_at")
SELECT gen_random_uuid(), c."id", src."code", src."name", src."sort_order", src."active", now(), now()
FROM (SELECT DISTINCT ON ("unit_type", "code") "unit_type", "code", CASE WHEN "name"='DPTO. DE OPERACIONES Y DESARROLLO DE NEG' THEN 'DPTO. DE OPERACIONES Y DESARROLLO DE NEGOCIOS' WHEN "name"='DTPO. DE COMUNICACIONES Y SOSTENIBILIDAD' THEN 'DPTO. DE COMUNICACIONES Y SOSTENIBILIDAD' ELSE "name" END AS "name", "sort_order", "active" FROM "organizational_unit" WHERE "unit_type" IN ('GERENCIA','DIVISION') ORDER BY "unit_type", "code", "name") src
JOIN "catalog" c ON c."code"=src."unit_type"
WHERE NOT EXISTS (SELECT 1 FROM "catalog_value" cv WHERE cv."catalog_id"=c."id" AND cv."code"=src."code");

UPDATE "person" p SET "management_id"=cv."id"
FROM "organizational_unit" ou JOIN "catalog" c ON c."code"='GERENCIA' JOIN "catalog_value" cv ON cv."catalog_id"=c."id" AND cv."code"=ou."code"
WHERE p."management_id"=ou."id";

UPDATE "person" p SET "division_id"=cv."id"
FROM "organizational_unit" ou JOIN "catalog" c ON c."code"='DIVISION' JOIN "catalog_value" cv ON cv."catalog_id"=c."id" AND cv."code"=ou."code"
WHERE p."division_id"=ou."id";

ALTER TABLE "person" ADD CONSTRAINT "person_management_id_fkey" FOREIGN KEY ("management_id") REFERENCES "catalog_value"("id") ON DELETE SET NULL;
ALTER TABLE "person" ADD CONSTRAINT "person_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "catalog_value"("id") ON DELETE SET NULL;
