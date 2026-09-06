import { config } from "dotenv";
import { resolve } from "node:path";
import { defineConfig } from "prisma/config";

config({ path: resolve(process.cwd(), "../../.env"), quiet: true });

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://mochelab:mochelab@localhost:5432/mochelab";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
