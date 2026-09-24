-- La migración anterior eliminó la restricción de Prisma, pero en algunas
-- bases locales quedó el índice único creado por la versión original.
DROP INDEX IF EXISTS "assessment_model_role_id_key";
