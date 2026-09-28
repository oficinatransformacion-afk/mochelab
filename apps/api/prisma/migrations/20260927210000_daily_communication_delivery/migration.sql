ALTER TABLE "communication"
ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "last_attempt_at" TIMESTAMPTZ(3),
ADD COLUMN "next_attempt_at" TIMESTAMPTZ(3),
ADD COLUMN "locked_at" TIMESTAMPTZ(3);

CREATE INDEX "communication_status_next_attempt_at_idx"
ON "communication"("status", "next_attempt_at");
