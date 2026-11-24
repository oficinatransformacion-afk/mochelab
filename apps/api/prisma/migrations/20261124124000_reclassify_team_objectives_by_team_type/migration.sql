-- Keep CORPORATIVO and teamless historical objectives unchanged.
-- Reclassify only historical EQUIPO objectives that have an associated team.
UPDATE "objective" AS o
SET "level_id" = target_level."id"
FROM "team" AS t,
     "catalog_value" AS target_level,
     "catalog" AS target_catalog,
     "catalog_value" AS current_level
WHERE o."team_id" = t."id"
  AND target_level."code" = t."strategic_type"::text
  AND target_catalog."id" = target_level."catalog_id"
  AND target_catalog."code" = 'NIVEL_OBJETIVO'
  AND current_level."id" = o."level_id"
  AND current_level."code" = 'EQUIPO';
