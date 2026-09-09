-- Normalize the administrator profile code used by the application.
UPDATE "catalog_value" AS value
SET "code" = 'ADMIN', "name" = 'Admin', "updated_at" = CURRENT_TIMESTAMP
FROM "catalog" AS catalog
WHERE value."catalog_id" = catalog."id"
  AND catalog."code" = 'PERFIL_USUARIO'
  AND value."code" = 'ADMINISTRADOR';

-- Add the technical SYSTEM profile without replacing existing assignments.
INSERT INTO "catalog_value" (
  "id", "catalog_id", "code", "name", "sort_order", "active", "created_at", "updated_at"
)
SELECT gen_random_uuid(), catalog."id", 'SYSTEM', 'System', 30, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "catalog" AS catalog
WHERE catalog."code" = 'PERFIL_USUARIO'
ON CONFLICT ("catalog_id", "code") DO UPDATE
SET "name" = EXCLUDED."name", "active" = true, "updated_at" = CURRENT_TIMESTAMP;

-- Ensure the three profiles have a configurable permission row for every module.
INSERT INTO "profile_module" (
  "profile_id", "module_id", "can_view", "can_create", "can_edit", "can_delete", "created_at", "updated_at"
)
SELECT profile."id", module."id",
  CASE WHEN profile."code" IN ('ADMIN', 'SYSTEM') THEN true ELSE module."code" NOT IN ('CATALOGOS','USUARIOS','MIGRACIONES','AUDITORIA') END,
  CASE WHEN profile."code" IN ('ADMIN', 'SYSTEM') THEN module."code" <> 'INICIO' ELSE module."code" IN ('MADUREZ','OBJETIVOS','PORTAFOLIO') END,
  CASE WHEN profile."code" IN ('ADMIN', 'SYSTEM') THEN module."code" <> 'INICIO' ELSE module."code" IN ('MADUREZ','OBJETIVOS','PORTAFOLIO') END,
  CASE WHEN profile."code" IN ('ADMIN', 'SYSTEM') THEN module."code" NOT IN ('INICIO','AUDITORIA') ELSE false END,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "catalog_value" AS profile
JOIN "catalog" AS catalog ON catalog."id" = profile."catalog_id" AND catalog."code" = 'PERFIL_USUARIO'
CROSS JOIN "system_module" AS module
WHERE profile."code" IN ('USUARIO','ADMIN','SYSTEM')
ON CONFLICT ("profile_id", "module_id") DO NOTHING;
