INSERT INTO "catalog" ("id","code","name","description","active","created_at","updated_at")
VALUES (gen_random_uuid(),'MOTIVO_SIN_RUTA_DESARROLLO','Motivo sin ruta de desarrollo','Motivos controlados para excluir una asignación de onboarding, malla y madurez',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "name"=EXCLUDED."name","description"=EXCLUDED."description","active"=true,"updated_at"=CURRENT_TIMESTAMP;

INSERT INTO "catalog_value" ("id","catalog_id","code","name","sort_order","active","created_at","updated_at")
SELECT gen_random_uuid(),c."id",v."code",v."name",v."sort_order",true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM "catalog" c
CROSS JOIN (VALUES
  ('ROL_SIN_MODELO_PUBLICADO','Rol sin modelo publicado',0),
  ('ASIGNACION_TEMPORAL','Asignación temporal',1),
  ('PARTICIPACION_APOYO','Participación de apoyo',2),
  ('ROL_SIN_RUTA_FORMATIVA','Rol sin ruta formativa requerida',3),
  ('OTRO','Otro',4)
) AS v("code","name","sort_order")
WHERE c."code"='MOTIVO_SIN_RUTA_DESARROLLO'
ON CONFLICT ("catalog_id","code") DO UPDATE SET "name"=EXCLUDED."name","sort_order"=EXCLUDED."sort_order","active"=true,"updated_at"=CURRENT_TIMESTAMP;
