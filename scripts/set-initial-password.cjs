const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { randomBytes, scryptSync } = require("node:crypto");

const workspaceRequire = createRequire(path.resolve(__dirname, "../apps/api/package.json"));
const { Client } = workspaceRequire("pg");
workspaceRequire("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });

const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const [key, ...parts] = item.replace(/^--/, "").split("=");
  return [key, parts.join("=")];
}));
if (!args.database || !args.email || !args.password) {
  throw new Error("Uso: node scripts/set-initial-password.cjs --database=<db> --email=<correo> --password=<clave>");
}
if (args.password.length < 10) throw new Error("La contraseña debe tener al menos 10 caracteres");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no configurada");
const allowedDatabase = args.database === "mochelab_dev" || /^mochelab_migration_test_[a-z0-9_]+$/i.test(args.database);
const confirmedProduction = args.database === "mochelab_prod"
  && args["confirm-production"] === "MOCHELAB_PROD"
  && process.env.MOCHELAB_PRODUCTION_WRITE_CONFIRMATION === "MOCHELAB_PROD";
if (!allowedDatabase && !confirmedProduction) {
  throw new Error("BLOQUEADO: use mochelab_dev o confirme explícitamente una escritura en mochelab_prod.");
}

const url = new URL(process.env.DATABASE_URL);
url.pathname = `/${args.database}`;
for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) url.searchParams.delete(key);
const caPath = path.resolve(__dirname, "../apps/api/certs/aiven-ca.pem");
const salt = randomBytes(16).toString("hex");
const passwordHash = `${salt}:${scryptSync(args.password, salt, 64).toString("hex")}`;
const client = new Client({
  connectionString: url.toString(),
  ssl: { ca: fs.readFileSync(caPath, "utf8"), rejectUnauthorized: true },
});

async function main() {
  await client.connect();
  const result = await client.query(
    "update app_user set password_hash = $1, password_changed_at = now(), updated_at = now() where lower(email) = lower($2) returning email",
    [passwordHash, args.email],
  );
  if (result.rowCount !== 1) throw new Error(`No se encontró una cuenta única para ${args.email}`);
  console.log(`Contraseña inicial configurada para ${result.rows[0].email} en ${args.database}`);
}

main().finally(() => client.end()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
