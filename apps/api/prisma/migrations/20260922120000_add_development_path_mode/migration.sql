CREATE TYPE "DevelopmentPathMode" AS ENUM ('STANDARD', 'EXEMPT');

ALTER TABLE "person_role"
  ADD COLUMN "development_path_mode" "DevelopmentPathMode" NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "development_exclusion_reason" VARCHAR(500),
  ADD COLUMN "development_path_changed_at" TIMESTAMPTZ(3),
  ADD COLUMN "development_path_changed_by" UUID;

ALTER TABLE "person_course"
  ADD COLUMN "recognized_from_id" UUID;

CREATE INDEX "person_course_recognized_from_id_idx" ON "person_course"("recognized_from_id");
ALTER TABLE "person_course" ADD CONSTRAINT "person_course_recognized_from_id_fkey"
  FOREIGN KEY ("recognized_from_id") REFERENCES "person_course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "catalog_value" ("id", "catalog_id", "code", "name", "description", "sort_order", "active", "created_at", "updated_at")
SELECT gen_random_uuid(), c."id", 'NO_APLICA', 'No aplica', 'Asignación sin ruta de desarrollo', 90, TRUE, NOW(), NOW()
FROM "catalog" c
WHERE c."code" = 'ESTADO_ONBOARDING'
  AND NOT EXISTS (
    SELECT 1 FROM "catalog_value" v WHERE v."catalog_id" = c."id" AND v."code" = 'NO_APLICA'
  );
