ALTER TABLE "objective"
ADD COLUMN "is_system_placeholder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "system_key" VARCHAR(100);

CREATE UNIQUE INDEX "objective_system_key_key"
ON "objective"("system_key");

ALTER TABLE "initiative"
ALTER COLUMN "objective_id" SET NOT NULL;
