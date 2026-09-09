import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PoolConfig } from "pg";

export function postgresOptions(databaseUrl: string): PoolConfig {
  const configuredPath = process.env.AIVEN_CA_CERT_PATH;
  const certificatePath = configuredPath
    ? resolve(process.cwd(), configuredPath)
    : resolve(process.cwd(), "certs/aiven-ca.pem");

  if (!existsSync(certificatePath)) {
    throw new Error(`Falta el certificado CA de Aiven en ${certificatePath}`);
  }

  // node-postgres lets TLS query parameters in the connection string replace
  // the explicit `ssl` object. Remove them so the downloaded Aiven CA remains
  // the source of trust and certificate validation stays enabled.
  const connectionUrl = new URL(databaseUrl);
  connectionUrl.searchParams.delete("sslmode");
  connectionUrl.searchParams.delete("sslcert");
  connectionUrl.searchParams.delete("sslkey");
  connectionUrl.searchParams.delete("sslrootcert");

  return {
    connectionString: connectionUrl.toString(),
    ssl: {
      ca: readFileSync(certificatePath, "utf8"),
      rejectUnauthorized: true,
    },
  };
}
