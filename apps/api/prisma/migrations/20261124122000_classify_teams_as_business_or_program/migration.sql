-- Existing teams already have Program associations. Keep every field populated
-- by using PROGRAMA as the non-destructive initial classification.
CREATE TYPE "TeamStrategicType" AS ENUM ('NEGOCIO', 'PROGRAMA');
ALTER TABLE "team" ADD COLUMN "strategic_type" "TeamStrategicType" NOT NULL DEFAULT 'PROGRAMA';
