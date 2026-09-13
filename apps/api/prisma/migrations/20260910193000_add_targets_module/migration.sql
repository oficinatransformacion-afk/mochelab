INSERT INTO "system_module" (
  "id", "code", "name", "route", "icon", "sort_order", "active", "created_at", "updated_at"
)
VALUES (
  gen_random_uuid(), 'METAS', 'Metas', '/objetivos/metas', 'bar-chart-3', 65, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name",
    "route" = EXCLUDED."route",
    "icon" = EXCLUDED."icon",
    "sort_order" = EXCLUDED."sort_order",
    "active" = true,
    "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "profile_module" (
  "profile_id", "module_id", "can_view", "can_create", "can_edit", "can_delete", "created_at", "updated_at"
)
SELECT profile."id", module."id",
  profile."code" IN ('ADMIN', 'SYSTEM'),
  profile."code" IN ('ADMIN', 'SYSTEM'),
  profile."code" IN ('ADMIN', 'SYSTEM'),
  profile."code" IN ('ADMIN', 'SYSTEM'),
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "catalog_value" AS profile
JOIN "catalog" AS catalog
  ON catalog."id" = profile."catalog_id" AND catalog."code" = 'PERFIL_USUARIO'
CROSS JOIN "system_module" AS module
WHERE profile."code" IN ('USUARIO', 'ADMIN', 'SYSTEM')
  AND module."code" = 'METAS'
ON CONFLICT ("profile_id", "module_id") DO UPDATE
SET "can_view" = EXCLUDED."can_view",
    "can_create" = EXCLUDED."can_create",
    "can_edit" = EXCLUDED."can_edit",
    "can_delete" = EXCLUDED."can_delete",
    "updated_at" = CURRENT_TIMESTAMP;
