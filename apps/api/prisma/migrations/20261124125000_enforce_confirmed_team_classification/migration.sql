-- Enforce the confirmed master rule: EAD names are NEGOCIO; all others are PROGRAMA.
UPDATE "team"
SET "strategic_type" = CASE
  WHEN UPPER(BTRIM("name")) LIKE 'EAD%' THEN 'NEGOCIO'::"TeamStrategicType"
  ELSE 'PROGRAMA'::"TeamStrategicType"
END;

-- Synchronize only objectives already associated with a team.
UPDATE "objective" AS o
SET "level_id" = target_level."id"
FROM "team" AS t,
     "catalog_value" AS target_level,
     "catalog" AS target_catalog
WHERE o."team_id" = t."id"
  AND target_level."code" = t."strategic_type"::text
  AND target_catalog."id" = target_level."catalog_id"
  AND target_catalog."code" = 'NIVEL_OBJETIVO';
