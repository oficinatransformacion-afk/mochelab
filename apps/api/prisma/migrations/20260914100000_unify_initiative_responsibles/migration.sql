DO $$ BEGIN
  CREATE TYPE "InitiativeResponsibilityType" AS ENUM ('PRODUCT_OWNER', 'ATF', 'MANAGER', 'TECHNICAL_LEAD', 'DEVELOPER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO "role" ("id", "source_id", "name", "type_id", "status_id", "created_at", "updated_at")
SELECT gen_random_uuid(), v.source_id, v.name, rt.id, rs.id, NOW(), NOW()
FROM (VALUES
  ('WEB_GESTOR_MEJORA_CONTINUA', 'GESTOR DE MEJORA CONTINUA'),
  ('WEB_DESARROLLADOR', 'DESARROLLADOR')
) v(source_id, name)
CROSS JOIN LATERAL (SELECT cv.id FROM catalog_value cv JOIN catalog c ON c.id=cv.catalog_id WHERE c.code='TIPO_ROL' AND cv.code='3_OPERATIVO' LIMIT 1) rt
CROSS JOIN LATERAL (SELECT cv.id FROM catalog_value cv JOIN catalog c ON c.id=cv.catalog_id WHERE c.code='ESTADO_ROL' AND cv.code='ACTIVO' LIMIT 1) rs
WHERE NOT EXISTS (SELECT 1 FROM role r WHERE UPPER(TRIM(r.name))=v.name);

CREATE TABLE "initiative_responsible" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "initiative_id" UUID NOT NULL,
  "person_role_id" UUID NOT NULL,
  "responsibility_type" "InitiativeResponsibilityType" NOT NULL,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "initiative_responsible_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "initiative_responsible_initiative_id_fkey" FOREIGN KEY ("initiative_id") REFERENCES "initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "initiative_responsible_person_role_id_fkey" FOREIGN KEY ("person_role_id") REFERENCES "person_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "initiative_responsible_initiative_id_person_role_id_responsibility_type_key" UNIQUE ("initiative_id", "person_role_id", "responsibility_type")
);
CREATE INDEX "initiative_responsible_initiative_id_responsibility_type_idx" ON "initiative_responsible"("initiative_id", "responsibility_type");
CREATE INDEX "initiative_responsible_person_role_id_idx" ON "initiative_responsible"("person_role_id");
CREATE UNIQUE INDEX "initiative_responsible_singleton_idx" ON "initiative_responsible"("initiative_id", "responsibility_type") WHERE "responsibility_type" <> 'DEVELOPER';

INSERT INTO "initiative_responsible" ("initiative_id", "person_role_id", "responsibility_type")
SELECT id, product_owner_person_role_id, 'PRODUCT_OWNER'::"InitiativeResponsibilityType" FROM initiative WHERE product_owner_person_role_id IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO "initiative_responsible" ("initiative_id", "person_role_id", "responsibility_type")
SELECT i.id, i.manager_person_role_id,
  CASE WHEN UPPER(TRIM(r.name))='ATF' THEN 'ATF'::"InitiativeResponsibilityType" ELSE 'MANAGER'::"InitiativeResponsibilityType" END
FROM initiative i JOIN person_role pr ON pr.id=i.manager_person_role_id JOIN role r ON r.id=pr.role_id
WHERE i.manager_person_role_id IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO "initiative_responsible" ("initiative_id", "person_role_id", "responsibility_type")
SELECT id, technical_lead_person_role_id, 'TECHNICAL_LEAD'::"InitiativeResponsibilityType" FROM initiative WHERE technical_lead_person_role_id IS NOT NULL
ON CONFLICT DO NOTHING;
