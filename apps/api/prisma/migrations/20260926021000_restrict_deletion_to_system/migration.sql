UPDATE "profile_module" pm SET "can_delete"=false,"updated_at"=CURRENT_TIMESTAMP
FROM "catalog_value" p,"catalog" c
WHERE pm."profile_id"=p."id" AND p."catalog_id"=c."id"
  AND c."code"='PERFIL_USUARIO' AND p."code" IN ('ADMIN','FACILITADOR','COLABORADOR');
