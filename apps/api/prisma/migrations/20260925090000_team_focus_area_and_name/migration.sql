ALTER TABLE "team"
  ADD COLUMN "name" VARCHAR(200),
  ADD COLUMN "focus_area_id" UUID;

UPDATE "team" SET "name" = "source_id" WHERE "name" IS NULL;

ALTER TABLE "team"
  ALTER COLUMN "name" SET NOT NULL,
  ALTER COLUMN "program_id" DROP NOT NULL,
  ADD CONSTRAINT "team_focus_area_id_fkey"
    FOREIGN KEY ("focus_area_id") REFERENCES "catalog_value"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "team_focus_area_id_idx" ON "team"("focus_area_id");
