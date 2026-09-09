export type DatabaseWritePurpose = "seed" | "visualization-seed" | "legacy-import";

export function databaseName(databaseUrl: string): string {
  try {
    return decodeURIComponent(new URL(databaseUrl).pathname).replace(/^\/+/, "");
  } catch {
    throw new Error("DATABASE_URL no tiene un formato válido");
  }
}

export function assertSafeDatabaseWrite(
  databaseUrl: string,
  purpose: DatabaseWritePurpose,
  args: readonly string[] = process.argv,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const target = databaseName(databaseUrl);
  const isDevelopment = target === "mochelab_dev";
  const isMigrationTest = /^mochelab_migration_test_[a-z0-9_]+$/i.test(target);
  const isProduction = target === "mochelab_prod";

  if (purpose === "visualization-seed" && !isDevelopment && !isMigrationTest) {
    throw new Error(`BLOQUEADO: los datos de visualización no pueden cargarse en ${target || "una base sin nombre"}.`);
  }

  if (isProduction) {
    const confirmedByArgument = args.includes("--confirm-production");
    const confirmedByEnvironment = environment.MOCHELAB_PRODUCTION_WRITE_CONFIRMATION === "MOCHELAB_PROD";
    if (!confirmedByArgument || !confirmedByEnvironment) {
      throw new Error(
        "BLOQUEADO: una escritura en mochelab_prod requiere --confirm-production y MOCHELAB_PRODUCTION_WRITE_CONFIRMATION=MOCHELAB_PROD.",
      );
    }
    return target;
  }

  if (!isDevelopment && !isMigrationTest) {
    throw new Error(`BLOQUEADO: ${target || "la base sin nombre"} no está registrada como PRUEBAS ni PRODUCCIÓN.`);
  }

  return target;
}

