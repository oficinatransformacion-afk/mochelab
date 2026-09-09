INSERT INTO "communication_template" (
  "id", "code", "name", "subject_template", "body_template",
  "sender_name", "sender_email", "active", "created_at", "updated_at"
)
VALUES (
  gen_random_uuid(), 'MATURITY_RESULT_AVAILABLE', 'Resultado de madurez calibrado',
  'Resultado de madurez disponible: {{periodName}}',
  'Hola {{personName}},\n\nTu resultado de madurez para el rol {{roleName}} en el equipo {{teamCode}} ha sido revisado y calibrado.\n\nPuntaje final: {{score}}\nNivel: {{levelName}}.',
  'Oficina Transformación', 'oficinatransformacion@danper.com', true,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;
