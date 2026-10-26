CREATE TYPE "InitiativeSubprocessType" AS ENUM ('PRIMARY', 'RELATED');

CREATE TABLE "macroprocess" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(240) NOT NULL,
    "description" TEXT,
    "responsible_person_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "source_row" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "macroprocess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "business_process" (
    "id" UUID NOT NULL,
    "macroprocess_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(240) NOT NULL,
    "description" TEXT,
    "responsible_person_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "source_row" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "business_process_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subprocess" (
    "id" UUID NOT NULL,
    "business_process_id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "responsible_person_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "source_row" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subprocess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "initiative_subprocess" (
    "id" UUID NOT NULL,
    "initiative_id" UUID NOT NULL,
    "subprocess_id" UUID NOT NULL,
    "relationship_type" "InitiativeSubprocessType" NOT NULL DEFAULT 'RELATED',
    "observations" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "initiative_subprocess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "macroprocess_company_id_code_key" ON "macroprocess"("company_id", "code");
CREATE INDEX "macroprocess_company_id_active_sort_order_idx" ON "macroprocess"("company_id", "active", "sort_order");
CREATE INDEX "macroprocess_responsible_person_id_idx" ON "macroprocess"("responsible_person_id");

CREATE UNIQUE INDEX "business_process_macroprocess_id_code_key" ON "business_process"("macroprocess_id", "code");
CREATE INDEX "business_process_macroprocess_id_active_sort_order_idx" ON "business_process"("macroprocess_id", "active", "sort_order");
CREATE INDEX "business_process_responsible_person_id_idx" ON "business_process"("responsible_person_id");

CREATE UNIQUE INDEX "subprocess_business_process_id_code_key" ON "subprocess"("business_process_id", "code");
CREATE INDEX "subprocess_business_process_id_active_sort_order_idx" ON "subprocess"("business_process_id", "active", "sort_order");
CREATE INDEX "subprocess_responsible_person_id_idx" ON "subprocess"("responsible_person_id");

CREATE UNIQUE INDEX "initiative_subprocess_initiative_id_subprocess_id_key" ON "initiative_subprocess"("initiative_id", "subprocess_id");
CREATE INDEX "initiative_subprocess_initiative_id_relationship_type_idx" ON "initiative_subprocess"("initiative_id", "relationship_type");
CREATE INDEX "initiative_subprocess_subprocess_id_idx" ON "initiative_subprocess"("subprocess_id");

ALTER TABLE "macroprocess"
ADD CONSTRAINT "macroprocess_company_id_fkey"
FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "macroprocess"
ADD CONSTRAINT "macroprocess_responsible_person_id_fkey"
FOREIGN KEY ("responsible_person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "business_process"
ADD CONSTRAINT "business_process_macroprocess_id_fkey"
FOREIGN KEY ("macroprocess_id") REFERENCES "macroprocess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "business_process"
ADD CONSTRAINT "business_process_responsible_person_id_fkey"
FOREIGN KEY ("responsible_person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "subprocess"
ADD CONSTRAINT "subprocess_business_process_id_fkey"
FOREIGN KEY ("business_process_id") REFERENCES "business_process"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "subprocess"
ADD CONSTRAINT "subprocess_responsible_person_id_fkey"
FOREIGN KEY ("responsible_person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "initiative_subprocess"
ADD CONSTRAINT "initiative_subprocess_initiative_id_fkey"
FOREIGN KEY ("initiative_id") REFERENCES "initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "initiative_subprocess"
ADD CONSTRAINT "initiative_subprocess_subprocess_id_fkey"
FOREIGN KEY ("subprocess_id") REFERENCES "subprocess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
