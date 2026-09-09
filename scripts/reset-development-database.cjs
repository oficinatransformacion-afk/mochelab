const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const workspaceRequire = createRequire(path.resolve(__dirname, "../apps/api/package.json"));
const { Client } = workspaceRequire("pg");
workspaceRequire("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });

const confirmation = process.argv.find((value) => value.startsWith("--confirm-reset="))?.split("=")[1];
if (confirmation !== "mochelab_dev") {
  throw new Error("BLOQUEADO: use --confirm-reset=mochelab_dev para recrear únicamente PRUEBAS.");
}
const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("DATABASE_URL no configurada");
const target = "mochelab_dev";
const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const backup = `${target}_backup_${timestamp}`;
const url = new URL(sourceUrl);
url.pathname = "/defaultdb";
for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) url.searchParams.delete(key);
const caPath = path.resolve(__dirname, "../.certs/ca.pem");
const client = new Client({
  connectionString: url.toString(),
  ssl: fs.existsSync(caPath)
    ? { ca: fs.readFileSync(caPath, "utf8"), rejectUnauthorized: true }
    : { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  const existing = await client.query("select datname from pg_database where datname = any($1::text[])", [[target, backup]]);
  const names = new Set(existing.rows.map((row) => row.datname));
  if (!names.has(target)) throw new Error(`${target} no existe`);
  if (names.has(backup)) throw new Error(`${backup} ya existe`);

  let connectionsDisabled = false;
  try {
    await client.query(`alter database ${target} with allow_connections false`);
    connectionsDisabled = true;
    await client.query("select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()", [target]);
    await client.query(`create database ${backup} with template ${target}`);
    const size = await client.query("select pg_database_size($1)::bigint as bytes", [backup]);
    await client.query(`drop database ${target}`);
    connectionsDisabled = false;
    await client.query(`create database ${target}`);
    console.log(JSON.stringify({ environment: "PRUEBAS", database: target, backup, backupBytes: size.rows[0].bytes }));
  } catch (error) {
    if (connectionsDisabled) await client.query(`alter database ${target} with allow_connections true`).catch(() => undefined);
    throw error;
  }
}

main().finally(() => client.end()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
