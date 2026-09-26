INSERT INTO "catalog" ("id", "code", "name", "active", "created_at", "updated_at")
SELECT gen_random_uuid(), 'ESTADO_PERIODO_MADUREZ', 'Estado del período de madurez', TRUE, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "catalog" WHERE "code" = 'ESTADO_PERIODO_MADUREZ');

INSERT INTO "catalog_value" ("id", "catalog_id", "code", "name", "sort_order", "active", "created_at", "updated_at")
SELECT gen_random_uuid(), c."id", source."code", source."name", source."sort_order", TRUE, NOW(), NOW()
FROM "catalog" c
CROSS JOIN (VALUES
  ('PLANIFICADO', 'Planificado', 10),
  ('AUTOEVALUACION', 'Autoevaluación abierta', 20),
  ('CALIBRACION', 'En calibración', 30),
  ('CERRADO', 'Cerrado', 40),
  ('CANCELADO', 'Cancelado', 50)
) AS source("code", "name", "sort_order")
WHERE c."code" = 'ESTADO_PERIODO_MADUREZ'
ON CONFLICT ("catalog_id", "code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "sort_order" = EXCLUDED."sort_order",
  "active" = TRUE,
  "updated_at" = NOW();
