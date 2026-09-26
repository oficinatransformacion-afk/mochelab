WITH desired(code, name, sort_order) AS (
  VALUES
    ('0_POR_HACER', '0. Por Hacer', 10),
    ('1_DESCUBRIMIENTO', '1. Descubrimiento', 20),
    ('2_LISTO_PARA_IMPLEMENTAR', '2. Listo para Implementar', 30),
    ('3_EN_IMPLEMENTACION', '3. En Implementación', 40),
    ('4_MIDIENDO_RESULTADOS', '4. Midiendo Resultados', 50),
    ('5_TERMINADO', '5. Terminado', 60),
    ('DESPRIORIZADO', 'Despriorizado', 70)
)
INSERT INTO "catalog_value" ("id", "catalog_id", "code", "name", "sort_order", "active", "created_at", "updated_at")
SELECT gen_random_uuid(), c.id, d.code, d.name, d.sort_order, TRUE, NOW(), NOW()
FROM desired d
CROSS JOIN "catalog" c
WHERE c.code = 'ESTADO_INICIATIVA'
ON CONFLICT ("catalog_id", "code") DO UPDATE
SET "name" = EXCLUDED."name", "sort_order" = EXCLUDED."sort_order", "active" = TRUE, "updated_at" = NOW();

UPDATE "catalog_value" cv
SET "active" = FALSE, "updated_at" = NOW()
FROM "catalog" c
WHERE cv."catalog_id" = c."id"
  AND c."code" = 'ESTADO_INICIATIVA'
  AND cv."code" NOT IN (
    '0_POR_HACER',
    '1_DESCUBRIMIENTO',
    '2_LISTO_PARA_IMPLEMENTAR',
    '3_EN_IMPLEMENTACION',
    '4_MIDIENDO_RESULTADOS',
    '5_TERMINADO',
    'DESPRIORIZADO'
  );
