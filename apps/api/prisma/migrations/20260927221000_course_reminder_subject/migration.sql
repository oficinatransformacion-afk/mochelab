UPDATE "communication_template"
SET "subject_template" = '[Mochelab] Tienes cursos pendientes en la Academia Mochelab',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'COURSE_PENDING_REMINDER';
