-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "catalog" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_value" (
    "id" UUID NOT NULL,
    "catalog_id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "valid_from" DATE,
    "valid_until" DATE,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "catalog_value_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company" (
    "id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "source_name" VARCHAR(180),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizational_unit" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "unit_type" VARCHAR(40) NOT NULL,
    "parent_id" UUID,
    "company_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organizational_unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_partner" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "email" VARCHAR(254),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "business_partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person" (
    "id" UUID NOT NULL,
    "dni" VARCHAR(20) NOT NULL,
    "company_id" UUID NOT NULL,
    "names" VARCHAR(240) NOT NULL,
    "email" VARCHAR(254),
    "phone" VARCHAR(40),
    "position" VARCHAR(240),
    "occupation_level_id" UUID,
    "organizational_unit_id" UUID,
    "business_partner_id" UUID,
    "status_id" UUID NOT NULL,
    "source_row" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" UUID NOT NULL,
    "source_id" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "type_id" UUID NOT NULL,
    "status_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team" (
    "id" UUID NOT NULL,
    "source_id" VARCHAR(40) NOT NULL,
    "unit_id" UUID,
    "program_id" UUID NOT NULL,
    "status_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_role" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "status_id" UUID NOT NULL,
    "onboarding_status_id" UUID NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "source_row" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "person_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course" (
    "id" UUID NOT NULL,
    "source_id" VARCHAR(40) NOT NULL,
    "name" VARCHAR(240) NOT NULL,
    "module_id" UUID NOT NULL,
    "status_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_course" (
    "role_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "role_course_pkey" PRIMARY KEY ("role_id","course_id")
);

-- CreateTable
CREATE TABLE "person_course" (
    "id" UUID NOT NULL,
    "person_role_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "status_id" UUID NOT NULL,
    "score" DECIMAL(12,4),
    "start_date" DATE,
    "end_date" DATE,
    "source_catalog_id" UUID,
    "group_catalog_id" UUID,
    "loaded_at" TIMESTAMPTZ(3),
    "loaded_by_legacy" VARCHAR(254),
    "source_row" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "person_course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "period" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "self_assessment_opens_at" TIMESTAMPTZ(3),
    "self_assessment_closes_at" TIMESTAMPTZ(3),
    "calibration_closes_at" TIMESTAMPTZ(3),
    "configuration_version" VARCHAR(80),
    "status_id" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_maturity" (
    "id" UUID NOT NULL,
    "person_role_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "self_assessment_id" UUID,
    "evaluated_at" DATE NOT NULL,
    "score" DECIMAL(8,4) NOT NULL,
    "self_assessment_score" DECIMAL(8,4),
    "calibrated_score" DECIMAL(8,4),
    "level_id" UUID NOT NULL,
    "comments" TEXT,
    "calibration_comments" TEXT,
    "calibrated_by_id" UUID,
    "calibrated_at" TIMESTAMPTZ(3),
    "legacy_record" BOOLEAN NOT NULL DEFAULT false,
    "source_row" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "role_maturity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maturity_dimension" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "weight" DECIMAL(8,4) NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "maturity_dimension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observable_behavior" (
    "id" UUID NOT NULL,
    "dimension_id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "statement" TEXT NOT NULL,
    "help_text" TEXT,
    "weight" DECIMAL(8,4) NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "observable_behavior_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observable_behavior_role" (
    "behavior_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "observable_behavior_role_pkey" PRIMARY KEY ("behavior_id","role_id")
);

-- CreateTable
CREATE TABLE "role_self_assessment" (
    "id" UUID NOT NULL,
    "person_role_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "status_id" UUID NOT NULL,
    "calculated_score" DECIMAL(8,4),
    "configuration_version" VARCHAR(80) NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "role_self_assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "self_assessment_response" (
    "self_assessment_id" UUID NOT NULL,
    "behavior_id" UUID NOT NULL,
    "score" DECIMAL(8,4) NOT NULL,
    "comments" TEXT,
    "behavior_statement" TEXT NOT NULL,
    "behavior_weight" DECIMAL(8,4) NOT NULL,
    "dimension_code" VARCHAR(80) NOT NULL,
    "dimension_name" VARCHAR(180) NOT NULL,
    "dimension_weight" DECIMAL(8,4) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "self_assessment_response_pkey" PRIMARY KEY ("self_assessment_id","behavior_id")
);

-- CreateTable
CREATE TABLE "team_maturity" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "evaluated_at" DATE NOT NULL,
    "score" DECIMAL(8,4) NOT NULL,
    "level_id" UUID NOT NULL,
    "comments" TEXT,
    "source_row" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "team_maturity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_mastery_qualification" (
    "id" UUID NOT NULL,
    "role_maturity_id" UUID NOT NULL,
    "trained_person_id" UUID,
    "training_evidence" TEXT,
    "training_verified" BOOLEAN NOT NULL DEFAULT false,
    "camp_name" VARCHAR(240),
    "camp_date" DATE,
    "camp_evidence" TEXT,
    "camp_verified" BOOLEAN NOT NULL DEFAULT false,
    "team_maturity_id" UUID,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "comments" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "role_mastery_qualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "objective" (
    "id" UUID NOT NULL,
    "source_id" BIGINT NOT NULL,
    "level_id" UUID NOT NULL,
    "parent_id" UUID,
    "parent_reference_legacy" VARCHAR(100),
    "team_id" UUID,
    "focus_area_id" UUID NOT NULL,
    "year" SMALLINT NOT NULL,
    "cycle_id" UUID NOT NULL,
    "objective" TEXT NOT NULL,
    "key_result" TEXT NOT NULL,
    "direction_id" UUID NOT NULL,
    "type_id" UUID NOT NULL,
    "unit_id" UUID,
    "baseline" DECIMAL(20,6),
    "baseline_date" DATE,
    "target" DECIMAL(20,6),
    "actual" DECIMAL(20,6),
    "cutoff_date" DATE,
    "result_status_id" UUID,
    "record_status_id" UUID NOT NULL,
    "achievement" DECIMAL(8,4),
    "legacy_record" BOOLEAN NOT NULL DEFAULT false,
    "source_row" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "objective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "initiative" (
    "id" UUID NOT NULL,
    "source_id" BIGINT NOT NULL,
    "team_id" UUID,
    "company_id" UUID NOT NULL,
    "year" SMALLINT NOT NULL,
    "cycle_id" UUID NOT NULL,
    "focus_area_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "objective_legacy" TEXT,
    "key_result_legacy" TEXT,
    "type_id" UUID NOT NULL,
    "size_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "release" VARCHAR(200),
    "execution_start" DATE,
    "execution_end" DATE,
    "priority_id" UUID,
    "product_owner" VARCHAR(240),
    "manager" VARCHAR(240),
    "technical_lead" VARCHAR(240),
    "management_type_id" UUID NOT NULL,
    "status_id" UUID NOT NULL,
    "accompaniment_milestone" TEXT,
    "escalation_id" UUID,
    "return_horizon_id" UUID,
    "ti_capacity_id" UUID,
    "category_id" UUID,
    "impact_id" UUID NOT NULL,
    "impact_description" TEXT,
    "projected_economic_benefit" DECIMAL(20,4),
    "actual_economic_benefit" DECIMAL(20,4),
    "projected_mitigation_benefit" DECIMAL(20,4),
    "actual_mitigation_benefit" DECIMAL(20,4),
    "annual_potential_benefit" DECIMAL(20,4),
    "observations" TEXT,
    "documentation_url" TEXT,
    "source_created_at" TIMESTAMPTZ(3),
    "objective_id" UUID,
    "source_row" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "initiative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indicator_target" (
    "id" UUID NOT NULL,
    "source_id" VARCHAR(60) NOT NULL,
    "indicator_id" UUID NOT NULL,
    "scope_id" UUID NOT NULL,
    "team_id" UUID,
    "role_id" UUID,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE,
    "target" DECIMAL(20,6) NOT NULL,
    "unit_id" UUID NOT NULL,
    "status_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "indicator_target_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(240),
    "profile_id" UUID NOT NULL,
    "status_id" UUID NOT NULL,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_team" (
    "user_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,

    CONSTRAINT "user_team_pkey" PRIMARY KEY ("user_id","team_id")
);

-- CreateTable
CREATE TABLE "system_module" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "route" VARCHAR(200),
    "icon" VARCHAR(80),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "system_module_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_module" (
    "profile_id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "can_view" BOOLEAN NOT NULL DEFAULT false,
    "can_create" BOOLEAN NOT NULL DEFAULT false,
    "can_edit" BOOLEAN NOT NULL DEFAULT false,
    "can_delete" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "profile_module_pkey" PRIMARY KEY ("profile_id","module_id")
);

-- CreateTable
CREATE TABLE "audit" (
    "id" UUID NOT NULL,
    "source_id" VARCHAR(80),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "user_id" UUID,
    "actor_legacy" VARCHAR(254),
    "action" VARCHAR(100) NOT NULL,
    "entity" VARCHAR(100) NOT NULL,
    "record_id" VARCHAR(100),
    "old_value" JSONB,
    "new_value" JSONB,
    "result" VARCHAR(40),
    "error_type" VARCHAR(100),
    "origin" VARCHAR(80),
    "correlation_id" UUID,
    "legacy_detail" TEXT,

    CONSTRAINT "audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batch" (
    "id" UUID NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_hash" VARCHAR(128) NOT NULL,
    "importer_version" VARCHAR(40) NOT NULL,
    "status" VARCHAR(40) NOT NULL,
    "totals" JSONB,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,

    CONSTRAINT "import_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_issue" (
    "id" UUID NOT NULL,
    "import_batch_id" UUID NOT NULL,
    "sheet" VARCHAR(100) NOT NULL,
    "source_row" INTEGER,
    "entity" VARCHAR(100) NOT NULL,
    "field" VARCHAR(100),
    "severity" VARCHAR(30) NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "description" TEXT NOT NULL,
    "original_value" TEXT,
    "resolution" TEXT,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "import_issue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "catalog_code_key" ON "catalog"("code");

-- CreateIndex
CREATE INDEX "catalog_value_catalog_id_active_sort_order_idx" ON "catalog_value"("catalog_id", "active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_value_catalog_id_code_key" ON "catalog_value"("catalog_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "company_code_key" ON "company"("code");

-- CreateIndex
CREATE INDEX "organizational_unit_parent_id_idx" ON "organizational_unit"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizational_unit_unit_type_code_company_id_key" ON "organizational_unit"("unit_type", "code", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_partner_code_key" ON "business_partner"("code");

-- CreateIndex
CREATE INDEX "person_email_idx" ON "person"("email");

-- CreateIndex
CREATE INDEX "person_company_id_status_id_idx" ON "person"("company_id", "status_id");

-- CreateIndex
CREATE UNIQUE INDEX "person_dni_company_id_key" ON "person"("dni", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_source_id_key" ON "role"("source_id");

-- CreateIndex
CREATE UNIQUE INDEX "program_code_key" ON "program"("code");

-- CreateIndex
CREATE UNIQUE INDEX "team_source_id_key" ON "team"("source_id");

-- CreateIndex
CREATE INDEX "person_role_team_id_status_id_idx" ON "person_role"("team_id", "status_id");

-- CreateIndex
CREATE UNIQUE INDEX "person_role_person_id_role_id_team_id_key" ON "person_role"("person_id", "role_id", "team_id");

-- CreateIndex
CREATE UNIQUE INDEX "course_source_id_key" ON "course"("source_id");

-- CreateIndex
CREATE INDEX "person_course_status_id_idx" ON "person_course"("status_id");

-- CreateIndex
CREATE UNIQUE INDEX "person_course_person_role_id_course_id_key" ON "person_course"("person_role_id", "course_id");

-- CreateIndex
CREATE UNIQUE INDEX "period_code_key" ON "period"("code");

-- CreateIndex
CREATE UNIQUE INDEX "role_maturity_self_assessment_id_key" ON "role_maturity"("self_assessment_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_maturity_person_role_id_period_id_key" ON "role_maturity"("person_role_id", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "maturity_dimension_code_key" ON "maturity_dimension"("code");

-- CreateIndex
CREATE INDEX "maturity_dimension_active_sort_order_idx" ON "maturity_dimension"("active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "observable_behavior_code_key" ON "observable_behavior"("code");

-- CreateIndex
CREATE INDEX "observable_behavior_dimension_id_active_sort_order_idx" ON "observable_behavior"("dimension_id", "active", "sort_order");

-- CreateIndex
CREATE INDEX "role_self_assessment_period_id_status_id_idx" ON "role_self_assessment"("period_id", "status_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_self_assessment_person_role_id_period_id_key" ON "role_self_assessment"("person_role_id", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_maturity_team_id_period_id_key" ON "team_maturity"("team_id", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_mastery_qualification_role_maturity_id_key" ON "role_mastery_qualification"("role_maturity_id");

-- CreateIndex
CREATE INDEX "role_mastery_qualification_trained_person_id_idx" ON "role_mastery_qualification"("trained_person_id");

-- CreateIndex
CREATE INDEX "role_mastery_qualification_team_maturity_id_idx" ON "role_mastery_qualification"("team_maturity_id");

-- CreateIndex
CREATE UNIQUE INDEX "objective_source_id_key" ON "objective"("source_id");

-- CreateIndex
CREATE INDEX "objective_team_id_year_cycle_id_idx" ON "objective"("team_id", "year", "cycle_id");

-- CreateIndex
CREATE INDEX "objective_parent_id_idx" ON "objective"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "initiative_source_id_key" ON "initiative"("source_id");

-- CreateIndex
CREATE INDEX "initiative_team_id_year_cycle_id_idx" ON "initiative"("team_id", "year", "cycle_id");

-- CreateIndex
CREATE INDEX "initiative_objective_id_idx" ON "initiative"("objective_id");

-- CreateIndex
CREATE UNIQUE INDEX "indicator_target_source_id_key" ON "indicator_target"("source_id");

-- CreateIndex
CREATE INDEX "indicator_target_indicator_id_scope_id_valid_from_valid_unt_idx" ON "indicator_target"("indicator_id", "scope_id", "valid_from", "valid_until");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "system_module_code_key" ON "system_module"("code");

-- CreateIndex
CREATE INDEX "system_module_active_sort_order_idx" ON "system_module"("active", "sort_order");

-- CreateIndex
CREATE INDEX "profile_module_module_id_idx" ON "profile_module"("module_id");

-- CreateIndex
CREATE UNIQUE INDEX "audit_source_id_key" ON "audit"("source_id");

-- CreateIndex
CREATE INDEX "audit_entity_record_id_occurred_at_idx" ON "audit"("entity", "record_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_user_id_occurred_at_idx" ON "audit"("user_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "import_batch_file_hash_importer_version_key" ON "import_batch"("file_hash", "importer_version");

-- CreateIndex
CREATE INDEX "import_issue_import_batch_id_severity_idx" ON "import_issue"("import_batch_id", "severity");

-- AddForeignKey
ALTER TABLE "catalog_value" ADD CONSTRAINT "catalog_value_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizational_unit" ADD CONSTRAINT "organizational_unit_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "organizational_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizational_unit" ADD CONSTRAINT "organizational_unit_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person" ADD CONSTRAINT "person_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person" ADD CONSTRAINT "person_occupation_level_id_fkey" FOREIGN KEY ("occupation_level_id") REFERENCES "catalog_value"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person" ADD CONSTRAINT "person_organizational_unit_id_fkey" FOREIGN KEY ("organizational_unit_id") REFERENCES "organizational_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person" ADD CONSTRAINT "person_business_partner_id_fkey" FOREIGN KEY ("business_partner_id") REFERENCES "business_partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person" ADD CONSTRAINT "person_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role" ADD CONSTRAINT "role_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role" ADD CONSTRAINT "role_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team" ADD CONSTRAINT "team_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "organizational_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team" ADD CONSTRAINT "team_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team" ADD CONSTRAINT "team_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_role" ADD CONSTRAINT "person_role_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_role" ADD CONSTRAINT "person_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_role" ADD CONSTRAINT "person_role_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_role" ADD CONSTRAINT "person_role_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_role" ADD CONSTRAINT "person_role_onboarding_status_id_fkey" FOREIGN KEY ("onboarding_status_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course" ADD CONSTRAINT "course_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course" ADD CONSTRAINT "course_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_course" ADD CONSTRAINT "role_course_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_course" ADD CONSTRAINT "role_course_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_course" ADD CONSTRAINT "person_course_person_role_id_fkey" FOREIGN KEY ("person_role_id") REFERENCES "person_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_course" ADD CONSTRAINT "person_course_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_course" ADD CONSTRAINT "person_course_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_course" ADD CONSTRAINT "person_course_source_catalog_id_fkey" FOREIGN KEY ("source_catalog_id") REFERENCES "catalog_value"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_course" ADD CONSTRAINT "person_course_group_catalog_id_fkey" FOREIGN KEY ("group_catalog_id") REFERENCES "catalog_value"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period" ADD CONSTRAINT "period_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_maturity" ADD CONSTRAINT "role_maturity_person_role_id_fkey" FOREIGN KEY ("person_role_id") REFERENCES "person_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_maturity" ADD CONSTRAINT "role_maturity_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "period"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_maturity" ADD CONSTRAINT "role_maturity_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_maturity" ADD CONSTRAINT "role_maturity_self_assessment_id_fkey" FOREIGN KEY ("self_assessment_id") REFERENCES "role_self_assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_maturity" ADD CONSTRAINT "role_maturity_calibrated_by_id_fkey" FOREIGN KEY ("calibrated_by_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observable_behavior" ADD CONSTRAINT "observable_behavior_dimension_id_fkey" FOREIGN KEY ("dimension_id") REFERENCES "maturity_dimension"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observable_behavior_role" ADD CONSTRAINT "observable_behavior_role_behavior_id_fkey" FOREIGN KEY ("behavior_id") REFERENCES "observable_behavior"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observable_behavior_role" ADD CONSTRAINT "observable_behavior_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_self_assessment" ADD CONSTRAINT "role_self_assessment_person_role_id_fkey" FOREIGN KEY ("person_role_id") REFERENCES "person_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_self_assessment" ADD CONSTRAINT "role_self_assessment_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "period"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_self_assessment" ADD CONSTRAINT "role_self_assessment_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "self_assessment_response" ADD CONSTRAINT "self_assessment_response_self_assessment_id_fkey" FOREIGN KEY ("self_assessment_id") REFERENCES "role_self_assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "self_assessment_response" ADD CONSTRAINT "self_assessment_response_behavior_id_fkey" FOREIGN KEY ("behavior_id") REFERENCES "observable_behavior"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_maturity" ADD CONSTRAINT "team_maturity_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_maturity" ADD CONSTRAINT "team_maturity_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "period"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_maturity" ADD CONSTRAINT "team_maturity_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_mastery_qualification" ADD CONSTRAINT "role_mastery_qualification_role_maturity_id_fkey" FOREIGN KEY ("role_maturity_id") REFERENCES "role_maturity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_mastery_qualification" ADD CONSTRAINT "role_mastery_qualification_trained_person_id_fkey" FOREIGN KEY ("trained_person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_mastery_qualification" ADD CONSTRAINT "role_mastery_qualification_team_maturity_id_fkey" FOREIGN KEY ("team_maturity_id") REFERENCES "team_maturity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_mastery_qualification" ADD CONSTRAINT "role_mastery_qualification_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objective" ADD CONSTRAINT "objective_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objective" ADD CONSTRAINT "objective_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "objective"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objective" ADD CONSTRAINT "objective_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objective" ADD CONSTRAINT "objective_focus_area_id_fkey" FOREIGN KEY ("focus_area_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objective" ADD CONSTRAINT "objective_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objective" ADD CONSTRAINT "objective_direction_id_fkey" FOREIGN KEY ("direction_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objective" ADD CONSTRAINT "objective_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objective" ADD CONSTRAINT "objective_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "catalog_value"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objective" ADD CONSTRAINT "objective_result_status_id_fkey" FOREIGN KEY ("result_status_id") REFERENCES "catalog_value"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objective" ADD CONSTRAINT "objective_record_status_id_fkey" FOREIGN KEY ("record_status_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_focus_area_id_fkey" FOREIGN KEY ("focus_area_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_size_id_fkey" FOREIGN KEY ("size_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_priority_id_fkey" FOREIGN KEY ("priority_id") REFERENCES "catalog_value"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_management_type_id_fkey" FOREIGN KEY ("management_type_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_escalation_id_fkey" FOREIGN KEY ("escalation_id") REFERENCES "catalog_value"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_return_horizon_id_fkey" FOREIGN KEY ("return_horizon_id") REFERENCES "catalog_value"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_ti_capacity_id_fkey" FOREIGN KEY ("ti_capacity_id") REFERENCES "catalog_value"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "catalog_value"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_impact_id_fkey" FOREIGN KEY ("impact_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "objective"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indicator_target" ADD CONSTRAINT "indicator_target_indicator_id_fkey" FOREIGN KEY ("indicator_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indicator_target" ADD CONSTRAINT "indicator_target_scope_id_fkey" FOREIGN KEY ("scope_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indicator_target" ADD CONSTRAINT "indicator_target_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indicator_target" ADD CONSTRAINT "indicator_target_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indicator_target" ADD CONSTRAINT "indicator_target_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indicator_target" ADD CONSTRAINT "indicator_target_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_team" ADD CONSTRAINT "user_team_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_team" ADD CONSTRAINT "user_team_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_module" ADD CONSTRAINT "profile_module_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "catalog_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_module" ADD CONSTRAINT "profile_module_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "system_module"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit" ADD CONSTRAINT "audit_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_issue" ADD CONSTRAINT "import_issue_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
