ALTER TABLE "initiative"
  ADD COLUMN "product_owner_person_role_id" UUID,
  ADD COLUMN "manager_person_role_id" UUID,
  ADD COLUMN "technical_lead_person_role_id" UUID;

-- Vincula únicamente coincidencias históricas inequívocas dentro del mismo equipo y rol.
WITH candidates AS (
  SELECT i.id AS initiative_id, MIN(pr.id::text)::uuid AS person_role_id
  FROM "initiative" i
  JOIN "person_role" pr ON pr.team_id = i.team_id
  JOIN "person" p ON p.id = pr.person_id
  JOIN "role" r ON r.id = pr.role_id
  WHERE UPPER(TRIM(r.name)) = 'DUEÑO DE PRODUCTO'
    AND UPPER(TRIM(p.names)) = UPPER(TRIM(i.product_owner))
  GROUP BY i.id
  HAVING COUNT(*) = 1
)
UPDATE "initiative" i SET "product_owner_person_role_id" = c.person_role_id
FROM candidates c WHERE c.initiative_id = i.id;

WITH candidates AS (
  SELECT i.id AS initiative_id, MIN(pr.id::text)::uuid AS person_role_id
  FROM "initiative" i
  JOIN "person_role" pr ON pr.team_id = i.team_id
  JOIN "person" p ON p.id = pr.person_id
  JOIN "role" r ON r.id = pr.role_id
  WHERE UPPER(TRIM(r.name)) IN ('ATF', 'GESTOR')
    AND UPPER(TRIM(p.names)) = UPPER(TRIM(i.manager))
  GROUP BY i.id
  HAVING COUNT(*) = 1
)
UPDATE "initiative" i SET "manager_person_role_id" = c.person_role_id
FROM candidates c WHERE c.initiative_id = i.id;

WITH candidates AS (
  SELECT i.id AS initiative_id, MIN(pr.id::text)::uuid AS person_role_id
  FROM "initiative" i
  JOIN "person_role" pr ON pr.team_id = i.team_id
  JOIN "person" p ON p.id = pr.person_id
  JOIN "role" r ON r.id = pr.role_id
  WHERE UPPER(TRIM(r.name)) = 'LIDER TECNICO'
    AND UPPER(TRIM(p.names)) = UPPER(TRIM(i.technical_lead))
  GROUP BY i.id
  HAVING COUNT(*) = 1
)
UPDATE "initiative" i SET "technical_lead_person_role_id" = c.person_role_id
FROM candidates c WHERE c.initiative_id = i.id;

CREATE INDEX "initiative_product_owner_person_role_id_idx" ON "initiative"("product_owner_person_role_id");
CREATE INDEX "initiative_manager_person_role_id_idx" ON "initiative"("manager_person_role_id");
CREATE INDEX "initiative_technical_lead_person_role_id_idx" ON "initiative"("technical_lead_person_role_id");

ALTER TABLE "initiative" ADD CONSTRAINT "initiative_product_owner_person_role_id_fkey" FOREIGN KEY ("product_owner_person_role_id") REFERENCES "person_role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_manager_person_role_id_fkey" FOREIGN KEY ("manager_person_role_id") REFERENCES "person_role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_technical_lead_person_role_id_fkey" FOREIGN KEY ("technical_lead_person_role_id") REFERENCES "person_role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
