INSERT INTO "system_module" ("id", "code", "name", "description", "route", "icon", "sort_order", "active", "created_at", "updated_at")
VALUES (gen_random_uuid(), 'PROCESOS', 'Procesos', 'Mapa y repositorio corporativo de procesos', '/configuracion/procesos', 'workflow', 75, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "route" = EXCLUDED."route",
  "icon" = EXCLUDED."icon",
  "sort_order" = EXCLUDED."sort_order",
  "active" = TRUE,
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "profile_module" ("profile_id", "module_id", "can_view", "can_create", "can_edit", "can_delete", "created_at", "updated_at")
SELECT p."id", m."id", TRUE, TRUE, TRUE, p."code" = 'SYSTEM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "catalog_value" p
JOIN "catalog" c ON c."id" = p."catalog_id" AND c."code" = 'PERFIL_USUARIO'
JOIN "system_module" m ON m."code" = 'PROCESOS'
WHERE p."code" IN ('ADMIN', 'SYSTEM')
ON CONFLICT ("profile_id", "module_id") DO UPDATE SET
  "can_view" = EXCLUDED."can_view",
  "can_create" = EXCLUDED."can_create",
  "can_edit" = EXCLUDED."can_edit",
  "can_delete" = EXCLUDED."can_delete",
  "updated_at" = CURRENT_TIMESTAMP;
