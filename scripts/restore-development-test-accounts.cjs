const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const workspaceRequire = createRequire(path.resolve(__dirname, "../apps/api/package.json"));
const { Client } = workspaceRequire("pg");
workspaceRequire("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });

const backup = process.argv.find((value) => value.startsWith("--backup="))?.split("=")[1];
if (!/^mochelab_dev_backup_\d{14}$/.test(backup ?? "")) throw new Error("Use --backup=mochelab_dev_backup_<fecha>");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no configurada");

const caPath = path.resolve(__dirname, "../.certs/ca.pem");
const connection = (database) => {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${database}`;
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) url.searchParams.delete(key);
  return new Client({ connectionString: url.toString(), ssl: { ca: fs.readFileSync(caPath, "utf8"), rejectUnauthorized: true } });
};

async function main() {
  const source = connection(backup);
  const target = connection("mochelab_dev");
  await Promise.all([source.connect(), target.connect()]);
  try {
    const accounts = await source.query(
      "select email, name, password_hash, password_changed_at from app_user where email like $1 order by email",
      ["%.prueba@example.invalid"],
    );
    const refs = await target.query(`
      select c.code as catalog, v.code, v.id
      from catalog_value v join catalog c on c.id = v.catalog_id
      where (c.code = 'PERFIL_USUARIO' and v.code in ('USUARIO','ADMIN','SYSTEM'))
         or (c.code = 'ESTADO_USUARIO' and v.code = 'ACTIVO')
    `);
    const id = (catalog, code) => refs.rows.find((row) => row.catalog === catalog && row.code === code)?.id;
    const active = id("ESTADO_USUARIO", "ACTIVO");
    if (!active) throw new Error("No existe ESTADO_USUARIO.ACTIVO en la base migrada");

    let restored = 0;
    for (const account of accounts.rows) {
      const profileCode = account.email.startsWith("admin.") ? "ADMIN" : account.email.startsWith("system.") ? "SYSTEM" : "USUARIO";
      const profile = id("PERFIL_USUARIO", profileCode);
      if (!profile) throw new Error(`No existe PERFIL_USUARIO.${profileCode}`);
      await target.query(`
        insert into app_user (id, email, name, profile_id, status_id, password_hash, password_changed_at, created_at, updated_at)
        values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, now(), now())
        on conflict (email) do update set name=excluded.name, profile_id=excluded.profile_id,
          status_id=excluded.status_id, password_hash=excluded.password_hash,
          password_changed_at=excluded.password_changed_at, updated_at=now()
      `, [account.email, account.name, profile, active, account.password_hash, account.password_changed_at]);
      restored++;
    }
    console.log(JSON.stringify({ database: "mochelab_dev", restoredTestAccounts: restored }));
  } finally {
    await Promise.all([source.end(), target.end()]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

