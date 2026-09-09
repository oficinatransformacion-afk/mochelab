CREATE TABLE "communication" (
  "id" UUID NOT NULL,
  "event_type" VARCHAR(80) NOT NULL,
  "channel" VARCHAR(30) NOT NULL DEFAULT 'EMAIL',
  "recipient" VARCHAR(254),
  "subject" VARCHAR(240) NOT NULL,
  "template_code" VARCHAR(100) NOT NULL,
  "variables" JSONB NOT NULL,
  "status" VARCHAR(40) NOT NULL DEFAULT 'PENDIENTE',
  "source" VARCHAR(30) NOT NULL,
  "dedupe_key" VARCHAR(220) NOT NULL,
  "person_role_id" UUID,
  "period_id" UUID,
  "requested_by_id" UUID,
  "sent_at" TIMESTAMPTZ(3),
  "error_summary" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "communication_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "communication_dedupe_key_key" ON "communication"("dedupe_key");
CREATE INDEX "communication_status_created_at_idx" ON "communication"("status", "created_at");
CREATE INDEX "communication_event_type_period_id_idx" ON "communication"("event_type", "period_id");
CREATE INDEX "communication_person_role_id_created_at_idx" ON "communication"("person_role_id", "created_at");
ALTER TABLE "communication" ADD CONSTRAINT "communication_person_role_id_fkey" FOREIGN KEY ("person_role_id") REFERENCES "person_role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "communication" ADD CONSTRAINT "communication_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "period"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "communication" ADD CONSTRAINT "communication_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
