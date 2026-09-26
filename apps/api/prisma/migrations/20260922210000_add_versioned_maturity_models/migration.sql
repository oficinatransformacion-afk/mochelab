CREATE TYPE "AssessmentModelVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');
CREATE TYPE "AssessmentSectionType" AS ENUM ('INTEGRAL', 'TECHNICAL', 'SOFT');
CREATE TYPE "AssessmentResultScope" AS ENUM ('SECTION', 'DIMENSION', 'LEVEL', 'TOTAL');

CREATE TABLE "assessment_model" (
  "id" UUID NOT NULL,
  "role_id" UUID NOT NULL,
  "code" VARCHAR(100) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "assessment_model_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assessment_model_version" (
  "id" UUID NOT NULL,
  "assessment_model_id" UUID NOT NULL,
  "version" VARCHAR(80) NOT NULL,
  "status" "AssessmentModelVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "calculation_method" VARCHAR(80) NOT NULL DEFAULT 'WEIGHTED_SECTIONS',
  "published_at" TIMESTAMPTZ(3),
  "valid_from" DATE,
  "valid_to" DATE,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "assessment_model_version_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "response_scale" (
  "id" UUID NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "response_scale_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "response_option" (
  "id" UUID NOT NULL,
  "scale_id" UUID NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "label" VARCHAR(160) NOT NULL,
  "numeric_value" DECIMAL(8,4) NOT NULL,
  "is_positive" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "response_option_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assessment_section" (
  "id" UUID NOT NULL,
  "model_version_id" UUID NOT NULL,
  "response_scale_id" UUID NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "type" "AssessmentSectionType" NOT NULL DEFAULT 'INTEGRAL',
  "weight" DECIMAL(8,4) NOT NULL DEFAULT 1,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "assessment_section_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assessment_dimension_version" (
  "id" UUID NOT NULL,
  "section_id" UUID NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "description" TEXT,
  "weight" DECIMAL(8,4) NOT NULL DEFAULT 1,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "assessment_dimension_version_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assessment_item_version" (
  "id" UUID NOT NULL,
  "dimension_id" UUID NOT NULL,
  "behavior_id" UUID NOT NULL,
  "response_scale_id" UUID,
  "maturity_level_id" UUID,
  "code" VARCHAR(100) NOT NULL,
  "statement" TEXT NOT NULL,
  "help_text" TEXT,
  "weight" DECIMAL(8,4) NOT NULL DEFAULT 1,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "assessment_item_version_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "period_assessment_model" (
  "period_id" UUID NOT NULL,
  "role_id" UUID NOT NULL,
  "model_version_id" UUID NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "period_assessment_model_pkey" PRIMARY KEY ("period_id", "role_id")
);

ALTER TABLE "role_self_assessment" ADD COLUMN "model_version_id" UUID;
ALTER TABLE "self_assessment_response" ADD COLUMN "item_version_id" UUID;
ALTER TABLE "self_assessment_response" ADD COLUMN "response_option_id" UUID;

CREATE TABLE "assessment_result_detail" (
  "id" UUID NOT NULL,
  "self_assessment_id" UUID NOT NULL,
  "scope_type" "AssessmentResultScope" NOT NULL,
  "scope_code" VARCHAR(100) NOT NULL,
  "scope_name" VARCHAR(200) NOT NULL,
  "score" DECIMAL(8,4),
  "positive_count" INTEGER,
  "response_count" INTEGER NOT NULL,
  "completion_percentage" DECIMAL(8,4),
  "weight" DECIMAL(8,4) NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "assessment_result_detail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "assessment_model_role_id_key" ON "assessment_model"("role_id");
CREATE UNIQUE INDEX "assessment_model_code_key" ON "assessment_model"("code");
CREATE UNIQUE INDEX "assessment_model_version_assessment_model_id_version_key" ON "assessment_model_version"("assessment_model_id", "version");
CREATE INDEX "assessment_model_version_status_idx" ON "assessment_model_version"("status");
CREATE UNIQUE INDEX "response_scale_code_key" ON "response_scale"("code");
CREATE UNIQUE INDEX "response_option_scale_id_code_key" ON "response_option"("scale_id", "code");
CREATE INDEX "response_option_scale_id_active_sort_order_idx" ON "response_option"("scale_id", "active", "sort_order");
CREATE UNIQUE INDEX "assessment_section_model_version_id_code_key" ON "assessment_section"("model_version_id", "code");
CREATE INDEX "assessment_section_model_version_id_active_sort_order_idx" ON "assessment_section"("model_version_id", "active", "sort_order");
CREATE UNIQUE INDEX "assessment_dimension_version_section_id_code_key" ON "assessment_dimension_version"("section_id", "code");
CREATE INDEX "assessment_dimension_version_section_id_active_sort_order_idx" ON "assessment_dimension_version"("section_id", "active", "sort_order");
CREATE UNIQUE INDEX "assessment_item_version_dimension_id_code_key" ON "assessment_item_version"("dimension_id", "code");
CREATE UNIQUE INDEX "assessment_item_version_dimension_id_behavior_id_key" ON "assessment_item_version"("dimension_id", "behavior_id");
CREATE INDEX "assessment_item_version_dimension_id_active_sort_order_idx" ON "assessment_item_version"("dimension_id", "active", "sort_order");
CREATE INDEX "period_assessment_model_model_version_id_idx" ON "period_assessment_model"("model_version_id");
CREATE INDEX "self_assessment_response_item_version_id_idx" ON "self_assessment_response"("item_version_id");
CREATE INDEX "self_assessment_response_response_option_id_idx" ON "self_assessment_response"("response_option_id");
CREATE UNIQUE INDEX "assessment_result_detail_self_assessment_id_scope_type_scope_code_key" ON "assessment_result_detail"("self_assessment_id", "scope_type", "scope_code");
CREATE INDEX "assessment_result_detail_self_assessment_id_scope_type_idx" ON "assessment_result_detail"("self_assessment_id", "scope_type");

ALTER TABLE "assessment_model" ADD CONSTRAINT "assessment_model_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_model_version" ADD CONSTRAINT "assessment_model_version_assessment_model_id_fkey" FOREIGN KEY ("assessment_model_id") REFERENCES "assessment_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "response_option" ADD CONSTRAINT "response_option_scale_id_fkey" FOREIGN KEY ("scale_id") REFERENCES "response_scale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_section" ADD CONSTRAINT "assessment_section_model_version_id_fkey" FOREIGN KEY ("model_version_id") REFERENCES "assessment_model_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_section" ADD CONSTRAINT "assessment_section_response_scale_id_fkey" FOREIGN KEY ("response_scale_id") REFERENCES "response_scale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_dimension_version" ADD CONSTRAINT "assessment_dimension_version_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "assessment_section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_item_version" ADD CONSTRAINT "assessment_item_version_dimension_id_fkey" FOREIGN KEY ("dimension_id") REFERENCES "assessment_dimension_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_item_version" ADD CONSTRAINT "assessment_item_version_behavior_id_fkey" FOREIGN KEY ("behavior_id") REFERENCES "observable_behavior"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_item_version" ADD CONSTRAINT "assessment_item_version_response_scale_id_fkey" FOREIGN KEY ("response_scale_id") REFERENCES "response_scale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assessment_item_version" ADD CONSTRAINT "assessment_item_version_maturity_level_id_fkey" FOREIGN KEY ("maturity_level_id") REFERENCES "catalog_value"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "period_assessment_model" ADD CONSTRAINT "period_assessment_model_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "period"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "period_assessment_model" ADD CONSTRAINT "period_assessment_model_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "period_assessment_model" ADD CONSTRAINT "period_assessment_model_model_version_id_fkey" FOREIGN KEY ("model_version_id") REFERENCES "assessment_model_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "role_self_assessment" ADD CONSTRAINT "role_self_assessment_model_version_id_fkey" FOREIGN KEY ("model_version_id") REFERENCES "assessment_model_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "self_assessment_response" ADD CONSTRAINT "self_assessment_response_item_version_id_fkey" FOREIGN KEY ("item_version_id") REFERENCES "assessment_item_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "self_assessment_response" ADD CONSTRAINT "self_assessment_response_response_option_id_fkey" FOREIGN KEY ("response_option_id") REFERENCES "response_option"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assessment_result_detail" ADD CONSTRAINT "assessment_result_detail_self_assessment_id_fkey" FOREIGN KEY ("self_assessment_id") REFERENCES "role_self_assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
