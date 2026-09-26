CREATE TYPE "SelfAssessmentSubmissionMode" AS ENUM ('SELF', 'ADMIN_ASSISTED', 'FACILITATOR_ASSISTED');

ALTER TABLE "role_self_assessment"
  ADD COLUMN "submission_mode" "SelfAssessmentSubmissionMode" NOT NULL DEFAULT 'SELF',
  ADD COLUMN "submitted_by_id" UUID,
  ADD COLUMN "assistance_reason" TEXT,
  ADD COLUMN "assistance_method" VARCHAR(80),
  ADD COLUMN "assisted_at" TIMESTAMPTZ(3),
  ADD COLUMN "assistance_notes" TEXT,
  ADD COLUMN "respondent_confirmed" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "role_self_assessment"
  ADD CONSTRAINT "role_self_assessment_submitted_by_id_fkey"
  FOREIGN KEY ("submitted_by_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "role_self_assessment_submitted_by_id_idx" ON "role_self_assessment"("submitted_by_id");

UPDATE "catalog_value" cv
SET "code"='COLABORADOR', "name"='Colaborador', "updated_at"=CURRENT_TIMESTAMP
FROM "catalog" c
WHERE cv."catalog_id"=c."id" AND c."code"='PERFIL_USUARIO' AND cv."code"='USUARIO';

INSERT INTO "catalog_value" ("id","catalog_id","code","name","sort_order","active","created_at","updated_at")
SELECT gen_random_uuid(),c."id",'FACILITADOR','Facilitador',30,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM "catalog" c
WHERE c."code"='PERFIL_USUARIO'
  AND NOT EXISTS (SELECT 1 FROM "catalog_value" v WHERE v."catalog_id"=c."id" AND v."code"='FACILITADOR');

UPDATE "catalog_value" cv SET "sort_order"=10
FROM "catalog" c WHERE cv."catalog_id"=c."id" AND c."code"='PERFIL_USUARIO' AND cv."code"='SYSTEM';
UPDATE "catalog_value" cv SET "sort_order"=20
FROM "catalog" c WHERE cv."catalog_id"=c."id" AND c."code"='PERFIL_USUARIO' AND cv."code"='ADMIN';
UPDATE "catalog_value" cv SET "sort_order"=40
FROM "catalog" c WHERE cv."catalog_id"=c."id" AND c."code"='PERFIL_USUARIO' AND cv."code"='COLABORADOR';

INSERT INTO "profile_module" ("profile_id","module_id","can_view","can_create","can_edit","can_delete","created_at","updated_at")
SELECT p."id",m."id",
  (m."code" IN ('INICIO','PERSONAS','ASIGNACIONES','EQUIPOS','CURSOS','MADUREZ','OBJETIVOS','PORTAFOLIO')),
  (m."code" IN ('ASIGNACIONES','MADUREZ','OBJETIVOS','PORTAFOLIO')),
  (m."code" IN ('ASIGNACIONES','MADUREZ','OBJETIVOS','PORTAFOLIO')),
  false,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM "catalog_value" p
JOIN "catalog" c ON c."id"=p."catalog_id" AND c."code"='PERFIL_USUARIO'
CROSS JOIN "system_module" m
WHERE p."code"='FACILITADOR'
ON CONFLICT ("profile_id","module_id") DO UPDATE SET
  "can_view"=EXCLUDED."can_view", "can_create"=EXCLUDED."can_create",
  "can_edit"=EXCLUDED."can_edit", "can_delete"=EXCLUDED."can_delete", "updated_at"=CURRENT_TIMESTAMP;

UPDATE "profile_module" pm SET
  "can_view"=(m."code" IN ('PERSONAS','MADUREZ')),
  "can_create"=(m."code"='MADUREZ'), "can_edit"=false, "can_delete"=false, "updated_at"=CURRENT_TIMESTAMP
FROM "catalog_value" p, "system_module" m, "catalog" c
WHERE pm."profile_id"=p."id" AND pm."module_id"=m."id" AND p."catalog_id"=c."id"
  AND c."code"='PERFIL_USUARIO' AND p."code"='COLABORADOR';
