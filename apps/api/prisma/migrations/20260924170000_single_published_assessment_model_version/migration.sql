CREATE UNIQUE INDEX "assessment_model_version_one_published_per_model"
ON "assessment_model_version" ("assessment_model_id")
WHERE "status" = 'PUBLISHED';
