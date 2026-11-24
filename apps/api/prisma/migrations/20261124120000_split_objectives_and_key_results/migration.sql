-- Non-destructive OKR model evolution.
-- Existing objective columns and rows remain available during the transition.

CREATE TABLE "business" (
  "id" UUID NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "company_id" UUID,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "business_code_company_id_key" ON "business"("code", "company_id");
ALTER TABLE "business" ADD CONSTRAINT "business_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "objective" ADD COLUMN "business_id" UUID;
ALTER TABLE "objective" ADD COLUMN "program_id" UUID;
ALTER TABLE "objective" ADD COLUMN "corporate_objective_id" UUID;
ALTER TABLE "objective" ADD CONSTRAINT "objective_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "objective" ADD CONSTRAINT "objective_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "program"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "objective" ADD CONSTRAINT "objective_corporate_objective_id_fkey" FOREIGN KEY ("corporate_objective_id") REFERENCES "objective"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "objective_corporate_objective_id_idx" ON "objective"("corporate_objective_id");
CREATE INDEX "objective_business_id_year_idx" ON "objective"("business_id", "year");
CREATE INDEX "objective_program_id_year_idx" ON "objective"("program_id", "year");

CREATE TABLE "key_result" (
  "id" UUID NOT NULL,
  "source_id" BIGINT NOT NULL,
  "objective_id" UUID NOT NULL,
  "cycle_id" UUID NOT NULL,
  "key_result" TEXT NOT NULL,
  "direction_id" UUID NOT NULL,
  "unit_id" UUID,
  "baseline" DECIMAL(20,6),
  "baseline_date" DATE,
  "target" DECIMAL(20,6),
  "actual" DECIMAL(20,6),
  "cutoff_date" DATE,
  "result_status_id" UUID,
  "record_status_id" UUID NOT NULL,
  "achievement" DECIMAL(8,4),
  "legacy_objective_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "key_result_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "key_result_source_id_key" ON "key_result"("source_id");
CREATE UNIQUE INDEX "key_result_legacy_objective_id_key" ON "key_result"("legacy_objective_id");
CREATE INDEX "key_result_objective_id_cycle_id_idx" ON "key_result"("objective_id", "cycle_id");
ALTER TABLE "key_result" ADD CONSTRAINT "key_result_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "objective"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "key_result" ADD CONSTRAINT "key_result_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "key_result" ADD CONSTRAINT "key_result_direction_id_fkey" FOREIGN KEY ("direction_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "key_result" ADD CONSTRAINT "key_result_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "catalog_value"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "key_result" ADD CONSTRAINT "key_result_result_status_id_fkey" FOREIGN KEY ("result_status_id") REFERENCES "catalog_value"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "key_result" ADD CONSTRAINT "key_result_record_status_id_fkey" FOREIGN KEY ("record_status_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "key_result_progress" (
  "id" UUID NOT NULL,
  "key_result_id" UUID NOT NULL,
  "cycle_id" UUID NOT NULL,
  "actual" DECIMAL(20,6) NOT NULL,
  "cutoff_date" DATE NOT NULL,
  "achievement" DECIMAL(8,4),
  "comments" TEXT,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "key_result_progress_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "key_result_progress_key_result_id_cycle_id_cutoff_date_key" ON "key_result_progress"("key_result_id", "cycle_id", "cutoff_date");
CREATE INDEX "key_result_progress_key_result_id_cycle_id_idx" ON "key_result_progress"("key_result_id", "cycle_id");
ALTER TABLE "key_result_progress" ADD CONSTRAINT "key_result_progress_key_result_id_fkey" FOREIGN KEY ("key_result_id") REFERENCES "key_result"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "key_result_progress" ADD CONSTRAINT "key_result_progress_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "initiative" ADD COLUMN "key_result_id" UUID;
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_key_result_id_fkey" FOREIGN KEY ("key_result_id") REFERENCES "key_result"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "initiative_key_result_id_idx" ON "initiative"("key_result_id");

-- Preserve the existing hierarchy under its explicit corporate relationship.
UPDATE "objective" SET "corporate_objective_id" = "parent_id" WHERE "parent_id" IS NOT NULL;
-- Preserve the selected program for historical team-level objectives.
UPDATE "objective" o SET "program_id" = t."program_id" FROM "team" t WHERE o."team_id" = t."id" AND o."program_id" IS NULL;

-- Copy every legacy KR without changing or deleting its source objective row.
INSERT INTO "key_result" (
  "id","source_id","objective_id","cycle_id","key_result","direction_id","unit_id","baseline","baseline_date","target","actual","cutoff_date","result_status_id","record_status_id","achievement","legacy_objective_id","created_at","updated_at"
)
SELECT
  o."id",o."source_id",o."id",o."cycle_id",o."key_result",o."direction_id",o."unit_id",o."baseline",o."baseline_date",o."target",o."actual",o."cutoff_date",o."result_status_id",o."record_status_id",o."achievement",o."id",o."created_at",o."updated_at"
FROM "objective" o
ON CONFLICT ("legacy_objective_id") DO NOTHING;

UPDATE "initiative" i SET "key_result_id" = kr."id" FROM "key_result" kr WHERE kr."legacy_objective_id" = i."objective_id" AND i."key_result_id" IS NULL;

-- Add the new selectable levels while retaining EQUIPO for historical records.
INSERT INTO "catalog_value" ("id","catalog_id","code","name","sort_order","active","created_at","updated_at")
SELECT md5('NIVEL_OBJETIVO:NEGOCIO')::uuid,c."id",'NEGOCIO','Negocio',20,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM "catalog" c WHERE c."code"='NIVEL_OBJETIVO'
ON CONFLICT ("catalog_id","code") DO UPDATE SET "name"=EXCLUDED."name","active"=true;

INSERT INTO "catalog_value" ("id","catalog_id","code","name","sort_order","active","created_at","updated_at")
SELECT md5('NIVEL_OBJETIVO:PROGRAMA')::uuid,c."id",'PROGRAMA','Programa',30,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM "catalog" c WHERE c."code"='NIVEL_OBJETIVO'
ON CONFLICT ("catalog_id","code") DO UPDATE SET "name"=EXCLUDED."name","active"=true;
