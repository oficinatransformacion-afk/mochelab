-- Classification rule confirmed by the business owner:
-- teams whose name starts with EAD are NEGOCIO; every other team is PROGRAMA.
UPDATE "team"
SET "strategic_type" = CASE
  WHEN UPPER(BTRIM("name")) LIKE 'EAD%' THEN 'NEGOCIO'::"TeamStrategicType"
  ELSE 'PROGRAMA'::"TeamStrategicType"
END;
