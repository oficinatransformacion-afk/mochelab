CREATE TABLE "communication_template" (
  "id" UUID NOT NULL,
  "code" VARCHAR(100) NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "subject_template" VARCHAR(240) NOT NULL,
  "body_template" TEXT NOT NULL,
  "sender_name" VARCHAR(160) NOT NULL DEFAULT 'Oficina Transformación',
  "sender_email" VARCHAR(254) NOT NULL DEFAULT 'oficinatransformacion@danper.com',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "communication_template_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "communication_template_code_key" ON "communication_template"("code");
INSERT INTO "communication_template" ("id","code","name","subject_template","body_template") VALUES
  (gen_random_uuid(),'ROLE_ASSIGNED','Asignación de rol','Nuevo rol asignado: {{roleName}}','Hola {{personName}},\n\nSe te ha asignado el rol {{roleName}} en el equipo {{teamCode}}.'),
  (gen_random_uuid(),'ROLE_REACTIVATED','Reactivación de rol','Rol reactivado: {{roleName}}','Hola {{personName}},\n\nTu asignación al rol {{roleName}} en {{teamCode}} ha sido reactivada.'),
  (gen_random_uuid(),'ROLE_CLOSED','Cierre de rol','Rol cerrado: {{roleName}}','Hola {{personName}},\n\nTu asignación al rol {{roleName}} en {{teamCode}} ha sido cerrada.'),
  (gen_random_uuid(),'SELF_ASSESSMENT_OPENED','Apertura de autoevaluación','Autoevaluación disponible: {{periodName}}','Hola {{personName}},\n\nYa puedes completar la autoevaluación de {{roleName}} para el periodo {{periodName}}.'),
  (gen_random_uuid(),'SELF_ASSESSMENT_REMINDER','Recordatorio de autoevaluación','Recordatorio de autoevaluación: {{periodName}}','Hola {{personName}},\n\nTienes pendiente la autoevaluación de {{roleName}}. El cierre está programado para {{closesAt}}.');
