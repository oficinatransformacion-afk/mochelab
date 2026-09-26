UPDATE "profile_module" pm
SET "can_view"=false, "can_create"=false, "can_edit"=false, "can_delete"=false, "updated_at"=CURRENT_TIMESTAMP
FROM "catalog_value" p, "catalog" c, "system_module" m
WHERE pm."profile_id"=p."id"
  AND p."catalog_id"=c."id"
  AND pm."module_id"=m."id"
  AND c."code"='PERFIL_USUARIO'
  AND p."code"='FACILITADOR'
  AND m."code"='METAS';
