const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const workspaceRequire = createRequire(path.resolve(__dirname, "../apps/api/package.json"));
const { Client } = workspaceRequire("pg");
workspaceRequire("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL no configurada");

const targets = ["mochelab_dev", "mochelab_prod"];
const url = new URL(databaseUrl);
for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) url.searchParams.delete(key);

const caPath = process.env.AIVEN_CA_CERT_PATH
  ? path.resolve(__dirname, "../apps/api", process.env.AIVEN_CA_CERT_PATH)
  : path.resolve(__dirname, "../.certs/ca.pem");

const client = new Client({
  connectionString: url.toString(),
  ssl: fs.existsSync(caPath)
    ? { ca: fs.readFileSync(caPath, "utf8"), rejectUnauthorized: true }
    : { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  const existing = await client.query("select datname from pg_database where datname = any($1::text[])", [targets]);
  const names = new Set(existing.rows.map((row) => row.datname));
  for (const target of targets) {
    if (names.has(target)) {
      console.log(`EXISTE ${target}`);
      continue;
    }
    await client.query(`create database ${target}`);
    console.log(`CREADA ${target}`);
  }
}

main().finally(() => client.end()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
