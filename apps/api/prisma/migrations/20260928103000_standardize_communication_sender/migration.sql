ALTER TABLE "communication_template"
ALTER COLUMN "sender_name" SET DEFAULT 'Oficina de Transformación';

UPDATE "communication_template"
SET "sender_name" = 'Oficina de Transformación',
    "sender_email" = 'oficinatransformacion@danper.com',
    "updated_at" = CURRENT_TIMESTAMP;
