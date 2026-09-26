ALTER TABLE "assessment_model" DROP CONSTRAINT IF EXISTS "assessment_model_role_id_key";

CREATE TABLE "person_role_assessment_model" (
  "person_role_id" UUID NOT NULL,
  "assessment_model_id" UUID NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assigned_by_id" UUID,
  CONSTRAINT "person_role_assessment_model_pkey" PRIMARY KEY ("person_role_id", "assessment_model_id"),
  CONSTRAINT "person_role_assessment_model_person_role_id_fkey" FOREIGN KEY ("person_role_id") REFERENCES "person_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "person_role_assessment_model_assessment_model_id_fkey" FOREIGN KEY ("assessment_model_id") REFERENCES "assessment_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "person_role_assessment_model_assessment_model_id_active_idx" ON "person_role_assessment_model"("assessment_model_id", "active");

INSERT INTO "person_role_assessment_model" ("person_role_id", "assessment_model_id")
SELECT pr."id", am."id"
FROM "person_role" pr
JOIN "assessment_model" am ON am."role_id" = pr."role_id"
WHERE am."active" = true
ON CONFLICT DO NOTHING;

ALTER TABLE "period_assessment_model" DROP CONSTRAINT IF EXISTS "period_assessment_model_pkey";
ALTER TABLE "period_assessment_model" ADD CONSTRAINT "period_assessment_model_pkey" PRIMARY KEY ("period_id", "model_version_id");

ALTER TABLE "role_self_assessment" DROP CONSTRAINT IF EXISTS "role_self_assessment_person_role_id_period_id_key";
ALTER TABLE "role_self_assessment" ADD CONSTRAINT "role_self_assessment_person_role_id_period_id_model_version_id_key" UNIQUE ("person_role_id", "period_id", "model_version_id");

ALTER TABLE "role_maturity" ADD COLUMN "model_version_id" UUID;
UPDATE "role_maturity" maturity
SET "model_version_id" = assessment."model_version_id"
FROM "role_self_assessment" assessment
WHERE assessment."id" = maturity."self_assessment_id";
ALTER TABLE "role_maturity" DROP CONSTRAINT IF EXISTS "role_maturity_person_role_id_period_id_key";
ALTER TABLE "role_maturity" ADD CONSTRAINT "role_maturity_person_role_id_period_id_model_version_id_key" UNIQUE ("person_role_id", "period_id", "model_version_id");
ALTER TABLE "role_maturity" ADD CONSTRAINT "role_maturity_model_version_id_fkey" FOREIGN KEY ("model_version_id") REFERENCES "assessment_model_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;
