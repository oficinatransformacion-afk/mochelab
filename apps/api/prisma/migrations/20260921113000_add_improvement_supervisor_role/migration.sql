INSERT INTO "role" ("id", "source_id", "name", "type_id", "status_id", "created_at", "updated_at")
SELECT gen_random_uuid(), 'WEB_SUPERVISOR_MEJORA_CONTINUA', 'SUPERVISOR DE MEJORA CONTINUA', rt.id, rs.id, NOW(), NOW()
FROM LATERAL (
  SELECT cv.id FROM catalog_value cv JOIN catalog c ON c.id = cv.catalog_id
  WHERE c.code = 'TIPO_ROL' AND cv.code = '3_OPERATIVO' LIMIT 1
) rt
CROSS JOIN LATERAL (
  SELECT cv.id FROM catalog_value cv JOIN catalog c ON c.id = cv.catalog_id
  WHERE c.code = 'ESTADO_ROL' AND cv.code = 'ACTIVO' LIMIT 1
) rs
WHERE NOT EXISTS (
  SELECT 1 FROM "role" r WHERE UPPER(TRIM(r.name)) = 'SUPERVISOR DE MEJORA CONTINUA'
);
