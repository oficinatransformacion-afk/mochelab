import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { postgresOptions } from "../src/database/postgres-options";
import { assertSafeDatabaseWrite, databaseName } from "../src/database/environment-guard";

type SourceRow = {
  DNI?: unknown;
  EMPRESA?: unknown;
  GERENCIA?: unknown;
  DIVISION?: unknown;
  BUSINESS_PARTNER?: unknown;
};

const apply = process.argv.includes("--apply");
const developmentMode = process.argv.includes("--confirm-development");
config({ path: resolve(process.cwd(), developmentMode ? "../../.env" : "../../.env.local"), quiet: true });

const configuredDatabaseUrl = process.env.DATABASE_URL;
if (!configuredDatabaseUrl) throw new Error("DATABASE_URL no configurada");
const targetUrl = new URL(configuredDatabaseUrl);
if (developmentMode) targetUrl.pathname = "/mochelab_dev";
const databaseUrl = targetUrl.toString();
const targetDatabase = databaseName(databaseUrl);
const expectedDatabase = developmentMode ? "mochelab_dev" : "mochelab_local";
if (targetDatabase !== expectedDatabase) throw new Error(`Destino no permitido: ${targetDatabase}`);
if (apply) assertSafeDatabaseWrite(databaseUrl, "legacy-import");

const prisma = new PrismaClient({ adapter: new PrismaPg(postgresOptions(databaseUrl)) });
const sourcePath = resolve(
  process.cwd(),
  process.env.PERSON_STRUCTURE_JSONL ?? "../../database/staging/data-servicios-19-clean/persona.jsonl",
);

const text = (value: unknown) => String(value ?? "").trim();
const key = (value: unknown) =>
  text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase();
const isUsableCode = (code: string) => Boolean(code && code !== "N_D");

async function main() {
  const source = (await readFile(sourcePath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => (JSON.parse(line) as { data: SourceRow }).data);

  const [people, catalogValues] = await Promise.all([
    prisma.person.findMany({ select: { id: true, dni: true, company: { select: { name: true } } } }),
    prisma.catalogValue.findMany({
      where: { catalog: { code: { in: ["GERENCIA", "DIVISION", "BUSINESS_PARTNER"] } } },
      select: { id: true, code: true, catalog: { select: { code: true } } },
    }),
  ]);

  const personBySourceKey = new Map(people.map((person) => [`${text(person.dni)}|${text(person.company.name)}`, person]));
  const valueByCode = new Map(catalogValues.map((value) => [`${value.catalog.code}|${value.code}`, value.id]));
  const changes: Array<{
    personId: string;
    managementId: string | null;
    divisionId: string | null;
    businessPartnerValueId: string | null;
  }> = [];
  const missingPeople: string[] = [];
  const missingManagementValues = new Set<string>();
  const missingDivisionValues = new Set<string>();
  const missingBusinessPartnerValues = new Set<string>();

  for (const row of source) {
    const dni = text(row.DNI);
    const company = text(row.EMPRESA);
    const person = personBySourceKey.get(`${dni}|${company}`);
    if (!person) {
      missingPeople.push(`${dni}|${company}`);
      continue;
    }

    const managementCode = key(row.GERENCIA);
    const divisionCode = key(row.DIVISION);
    const businessPartnerCode = key(row.BUSINESS_PARTNER);
    const managementId = isUsableCode(managementCode) ? valueByCode.get(`GERENCIA|${managementCode}`) ?? null : null;
    const divisionId = isUsableCode(divisionCode) ? valueByCode.get(`DIVISION|${divisionCode}`) ?? null : null;
    const businessPartnerValueId = isUsableCode(businessPartnerCode)
      ? valueByCode.get(`BUSINESS_PARTNER|${businessPartnerCode}`) ?? null
      : null;
    if (isUsableCode(managementCode) && !managementId) missingManagementValues.add(text(row.GERENCIA));
    if (isUsableCode(divisionCode) && !divisionId) missingDivisionValues.add(text(row.DIVISION));
    if (isUsableCode(businessPartnerCode) && !businessPartnerValueId) {
      missingBusinessPartnerValues.add(text(row.BUSINESS_PARTNER));
    }
    changes.push({ personId: person.id, managementId, divisionId, businessPartnerValueId });
  }

  if (missingPeople.length || missingManagementValues.size || missingDivisionValues.size || missingBusinessPartnerValues.size) {
    throw new Error(
      JSON.stringify({
        missingPeople: missingPeople.slice(0, 20),
        missingManagementValues: [...missingManagementValues],
        missingDivisionValues: [...missingDivisionValues],
        missingBusinessPartnerValues: [...missingBusinessPartnerValues],
      }),
    );
  }

  if (apply) {
    for (let start = 0; start < changes.length; start += 50) {
      await Promise.all(
        changes.slice(start, start + 50).map((change) =>
          prisma.person.update({
            where: { id: change.personId },
            data: {
              managementId: change.managementId,
              divisionId: change.divisionId,
              businessPartnerValueId: change.businessPartnerValueId,
            },
          }),
        ),
      );
    }
  }

  const expectedManagement = changes.filter((change) => change.managementId).length;
  const expectedDivision = changes.filter((change) => change.divisionId).length;
  const expectedBusinessPartner = changes.filter((change) => change.businessPartnerValueId).length;
  const actual = apply
    ? await prisma.person.aggregate({
        _count: { id: true, managementId: true, divisionId: true, businessPartnerValueId: true },
      })
    : null;

  console.log(
    JSON.stringify({
      database: targetDatabase,
      mode: apply ? "apply" : "dry-run",
      source: source.length,
      matched: changes.length,
      missing: missingPeople.length,
      expectedManagement,
      expectedDivision,
      expectedBusinessPartner,
      actual: actual?._count ?? null,
    }),
  );
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
