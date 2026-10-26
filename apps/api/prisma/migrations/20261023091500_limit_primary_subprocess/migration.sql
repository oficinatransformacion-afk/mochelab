CREATE UNIQUE INDEX "initiative_subprocess_one_primary_per_initiative_idx"
ON "initiative_subprocess"("initiative_id")
WHERE "relationship_type" = 'PRIMARY';
