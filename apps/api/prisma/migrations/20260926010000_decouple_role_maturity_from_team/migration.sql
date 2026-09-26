ALTER TABLE "role_maturity" ADD COLUMN "person_id" UUID;
ALTER TABLE "role_maturity" ADD COLUMN "role_id" UUID;
UPDATE "role_maturity" maturity
SET "person_id" = assignment."person_id", "role_id" = assignment."role_id"
FROM "person_role" assignment
WHERE assignment."id" = maturity."person_role_id";
ALTER TABLE "role_maturity" ALTER COLUMN "person_id" SET NOT NULL;
ALTER TABLE "role_maturity" ALTER COLUMN "role_id" SET NOT NULL;
ALTER TABLE "role_maturity" DROP CONSTRAINT IF EXISTS "role_maturity_person_role_id_period_id_model_version_id_key";
ALTER TABLE "role_maturity" ADD CONSTRAINT "role_maturity_person_id_role_id_period_id_model_version_id_key" UNIQUE ("person_id", "role_id", "period_id", "model_version_id");
CREATE INDEX "role_maturity_person_id_role_id_period_id_idx" ON "role_maturity"("person_id", "role_id", "period_id");
ALTER TABLE "role_maturity" ADD CONSTRAINT "role_maturity_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "role_maturity" ADD CONSTRAINT "role_maturity_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "role_self_assessment" ADD COLUMN "person_id" UUID;
ALTER TABLE "role_self_assessment" ADD COLUMN "role_id" UUID;
UPDATE "role_self_assessment" assessment
SET "person_id" = assignment."person_id", "role_id" = assignment."role_id"
FROM "person_role" assignment
WHERE assignment."id" = assessment."person_role_id";
ALTER TABLE "role_self_assessment" ALTER COLUMN "person_id" SET NOT NULL;
ALTER TABLE "role_self_assessment" ALTER COLUMN "role_id" SET NOT NULL;
ALTER TABLE "role_self_assessment" DROP CONSTRAINT IF EXISTS "role_self_assessment_person_role_id_period_id_model_version_id_key";
ALTER TABLE "role_self_assessment" ADD CONSTRAINT "role_self_assessment_person_id_role_id_period_id_model_version_id_key" UNIQUE ("person_id", "role_id", "period_id", "model_version_id");
CREATE INDEX "role_self_assessment_person_id_role_id_period_id_idx" ON "role_self_assessment"("person_id", "role_id", "period_id");
ALTER TABLE "role_self_assessment" ADD CONSTRAINT "role_self_assessment_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "role_self_assessment" ADD CONSTRAINT "role_self_assessment_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
