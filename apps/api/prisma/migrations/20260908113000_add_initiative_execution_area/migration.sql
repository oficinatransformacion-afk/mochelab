ALTER TABLE "initiative"
ADD COLUMN "execution_area_id" UUID;

CREATE INDEX "initiative_execution_area_id_idx"
ON "initiative"("execution_area_id");

ALTER TABLE "initiative"
ADD CONSTRAINT "initiative_execution_area_id_fkey"
FOREIGN KEY ("execution_area_id") REFERENCES "catalog_value"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "catalog" ("id", "code", "name", "active", "created_at", "updated_at")
VALUES (
  '8a7b2c10-7b40-4d5e-9000-000000000001',
  'AREA_EJECUCION_INICIATIVA',
  'Área de ejecución de iniciativa',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "active" = true,
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "catalog_value" ("id", "catalog_id", "code", "name", "sort_order", "active", "created_at", "updated_at")
SELECT values_to_insert."id"::uuid, catalog."id", values_to_insert."code", values_to_insert."name", values_to_insert."sort_order", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  VALUES
    ('8a7b2c10-7b40-4d5e-9001-000000000001', 'AGRICOLA', 'Agrícola', 10),
    ('8a7b2c10-7b40-4d5e-9001-000000000002', 'OPC', 'OPC', 20),
    ('8a7b2c10-7b40-4d5e-9001-000000000003', 'ACOPIO_TRUJILLO', 'Acopio Trujillo', 30),
    ('8a7b2c10-7b40-4d5e-9001-000000000004', 'NAVE_01', 'Nave 01', 40),
    ('8a7b2c10-7b40-4d5e-9001-000000000005', 'NAVE_02', 'Nave 02', 50),
    ('8a7b2c10-7b40-4d5e-9001-000000000006', 'NAVE_03', 'Nave 03', 60),
    ('8a7b2c10-7b40-4d5e-9001-000000000007', 'NAVE_04', 'Nave 04', 70),
    ('8a7b2c10-7b40-4d5e-9001-000000000008', 'NAVE_05', 'Nave 05', 80),
    ('8a7b2c10-7b40-4d5e-9001-000000000009', 'NAVE_06', 'Nave 06', 90),
    ('8a7b2c10-7b40-4d5e-9001-000000000010', 'NAVE_09', 'NAVE 09', 100),
    ('8a7b2c10-7b40-4d5e-9001-000000000011', 'NAVE_10', 'Nave 10', 110),
    ('8a7b2c10-7b40-4d5e-9001-000000000012', 'NAVE_12', 'Nave 12', 120),
    ('8a7b2c10-7b40-4d5e-9001-000000000013', 'APT_TRUJILLO', 'APT Trujillo', 130),
    ('8a7b2c10-7b40-4d5e-9001-000000000014', 'APT_AREQUIPA', 'APT Arequipa', 140)
) AS values_to_insert("id", "code", "name", "sort_order")
CROSS JOIN "catalog"
WHERE "catalog"."code" = 'AREA_EJECUCION_INICIATIVA'
ON CONFLICT ("catalog_id", "code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "sort_order" = EXCLUDED."sort_order",
  "active" = true,
  "updated_at" = CURRENT_TIMESTAMP;
