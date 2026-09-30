import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { config } from "dotenv";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as XLSX from "xlsx";
import { postgresOptions } from "../src/database/postgres-options";
import { assertSafeDatabaseWrite } from "../src/database/environment-guard";

type SourceRow = { sourceRow: number; data: Record<string, unknown> };
type Issue = { sourceRow: number; field?: string; code: string; detail: string; value?: string };
type PersonInput = {
  sourceRow: number; dni: string; companyId: string; companyCode: string; names: string; email: string | null;
  phone: string | null; position: string | null; occupationLevelId: string | null; organizationalUnitId: string | null;
  managementId: string | null; subManagementId: string | null; divisionId: string | null;
  businessPartnerValueId: string | null; statusId: string;
};

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const confirmLocal = args.includes("--confirm-local");
const confirmDevelopment = args.includes("--confirm-development");
const confirmProduction = args.includes("--confirm-production");
if (Number(confirmLocal) + Number(confirmDevelopment) + Number(confirmProduction) > 1) throw new Error("Seleccione un único entorno de confirmación");
const developmentMode = confirmDevelopment;
const productionMode = confirmProduction;
config({ path: resolve(process.cwd(), developmentMode ? "../../.env" : "../../.env.local"), quiet: true });
const sourceArgument = args.find((value) => !value.startsWith("--"));
if (!sourceArgument) throw new Error("Uso: pnpm db:import:persons <archivo.xlsx> [--apply --confirm-local | --confirm-development]");

const sourcePath = resolve(sourceArgument);
const reportsDir = resolve(process.cwd(), "../../reports");
const trim = (value: unknown) => value == null ? "" : String(value).replace(/\s+/g, " ").trim();
const normalized = (value: unknown) => trim(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
const catalogKey = (catalog: string, code: string) => `${catalog}|${code}`;
const companyAliases = new Map<string, string>([
  ["DANPER TRUJILLO SAC", "DANPER_TRUJILLO_SAC"],
  ["DANPER AGRICOLA VENTUROSA", "DANPER_AGRICOLA_VENTUROSA"],
]);
const headerAliases: Record<string, string> = {
  DNI: "DNI",
  EMPRESA_CODIGO: "EMPRESA_CODIGO",
  NOMBRES: "NOMBRES",
  NOMBRES_MAYUSCULA: "NOMBRES",
  CORREO: "CORREO",
  TELEFONO: "TELEFONO",
  POSICION: "POSICION",
  NIVEL_OCUPACIONAL_CODIGO: "NIVEL_OCUPACIONAL_CODIGO",
  UNIDAD_ORGANIZACIONAL_CODIGO: "UNIDAD_ORGANIZACIONAL_CODIGO",
  GERENCIA_CODIGO: "GERENCIA_CODIGO",
  SUBGERENCIA_CODIGO: "SUBGERENCIA_CODIGO",
  DIVISION_CODIGO: "DIVISION_CODIGO",
  BUSINESS_PARTNER_CODIGO: "BUSINESS_PARTNER_CODIGO",
  ESTADO_PERSONA_CODIGO: "ESTADO_PERSONA_CODIGO",
  FILA_ORIGEN: "FILA_ORIGEN",
};

function headerCode(value: unknown) {
  return normalized(value).replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function textOrNull(value: unknown) {
  const result = trim(value);
  return result ? result : null;
}

function chunks<T>(items: T[], size = 250): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

function loadRows(): SourceRow[] {
  const workbook = XLSX.readFile(sourcePath, { cellDates: false, raw: false });
  const sheet = workbook.Sheets.Personas_Carga;
  if (!sheet) throw new Error("No existe la hoja Personas_Carga");
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, range: 4, defval: null, raw: false });
  const headers = rawRows[0]?.map((value) => headerAliases[headerCode(value)] ?? headerCode(value)) ?? [];
  const required = ["DNI", "EMPRESA_CODIGO", "NOMBRES", "ESTADO_PERSONA_CODIGO"];
  const missing = required.filter((field) => !headers.includes(field));
  if (missing.length) throw new Error(`Faltan columnas obligatorias: ${missing.join(", ")}`);
  return rawRows.slice(1).map((values, index) => ({
    sourceRow: index + 6,
    data: Object.fromEntries(headers.map((header, column) => [header, values[column] ?? null])),
  })).filter((row) => Object.values(row.data).some((value) => textOrNull(value) !== null));
}

async function main() {
  await access(sourcePath);
  const rawBytes = await readFile(sourcePath);
  const sourceHash = createHash("sha256").update(rawBytes).digest("hex");
  const rows = loadRows();
  const configuredConnectionString = productionMode ? process.env.MOCHELAB_PROD_DATABASE_URL : process.env.DATABASE_URL;
  if (!configuredConnectionString) throw new Error("DATABASE_URL no está configurada");
  const targetUrl = new URL(configuredConnectionString);
  if (developmentMode) targetUrl.pathname = "/mochelab_dev";
  if (productionMode) targetUrl.pathname = "/mochelab_prod";
  const connectionString = targetUrl.toString();
  const adapter = new PrismaPg({ connectionString, ...postgresOptions(connectionString) });
  const prisma = new PrismaClient({ adapter });
  const issues: Issue[] = [];
  try {
    const [companies, values, units] = await Promise.all([
      prisma.company.findMany({ where: { active: true }, select: { id: true, code: true } }),
      prisma.catalogValue.findMany({ where: { active: true, catalog: { code: { in: ["ESTADO_PERSONA", "NIVEL_OCUPACIONAL", "GERENCIA", "DIVISION", "BUSINESS_PARTNER"] } } }, select: { id: true, code: true, catalog: { select: { code: true } } } }),
      prisma.organizationalUnit.findMany({ where: { active: true }, select: { id: true, code: true } }),
    ]);
    const companiesByCode = new Map(companies.map((row) => [row.code, row.id]));
    const valuesByCode = new Map(values.map((row) => [catalogKey(row.catalog.code, row.code), row.id]));
    const unitsByCode = new Map<string, string>();
    const ambiguousUnitCodes = new Set<string>();
    for (const unit of units) {
      if (unitsByCode.has(unit.code)) ambiguousUnitCodes.add(unit.code);
      else unitsByCode.set(unit.code, unit.id);
    }
    for (const code of ambiguousUnitCodes) unitsByCode.delete(code);

    const persons: PersonInput[] = [];
    const keys = new Set<string>();
    const valueId = (sourceRow: number, field: string, catalog: string, value: unknown) => {
      const code = normalized(value);
      if (!code) return null;
      const id = valuesByCode.get(catalogKey(catalog, code));
      if (!id) issues.push({ sourceRow, field, code: "CATALOG_VALUE_NOT_FOUND", detail: `No existe ${code} en ${catalog}`, value: code });
      return id ?? null;
    };
    const unitId = (sourceRow: number, field: string, value: unknown) => {
      const code = normalized(value);
      if (!code) return null;
      if (ambiguousUnitCodes.has(code)) issues.push({ sourceRow, field, code: "AMBIGUOUS_UNIT_CODE", detail: `El código de unidad ${code} no es único`, value: code });
      else if (!unitsByCode.has(code)) issues.push({ sourceRow, field, code: "UNIT_NOT_FOUND", detail: `No existe la unidad ${code}`, value: code });
      return unitsByCode.get(code) ?? null;
    };

    for (const row of rows) {
      const dni = trim(row.data.DNI);
      const names = trim(row.data.NOMBRES);
      const sourceCompany = normalized(row.data.EMPRESA_CODIGO);
      const companyCode = companyAliases.get(sourceCompany) ?? sourceCompany;
      const companyId = companiesByCode.get(companyCode);
      if (!dni) issues.push({ sourceRow: row.sourceRow, field: "DNI", code: "REQUIRED", detail: "El DNI es obligatorio" });
      if (dni.length > 20) issues.push({ sourceRow: row.sourceRow, field: "DNI", code: "TOO_LONG", detail: "El DNI supera 20 caracteres", value: dni });
      if (!names) issues.push({ sourceRow: row.sourceRow, field: "NOMBRES", code: "REQUIRED", detail: "Los nombres son obligatorios" });
      if (!companyId) issues.push({ sourceRow: row.sourceRow, field: "EMPRESA_CODIGO", code: "COMPANY_NOT_FOUND", detail: `No existe la empresa ${companyCode}`, value: companyCode });
      const email = textOrNull(row.data.CORREO)?.toLowerCase() ?? null;
      if (email && !/^\S+@\S+\.\S+$/.test(email)) issues.push({ sourceRow: row.sourceRow, field: "CORREO", code: "INVALID_EMAIL", detail: "El correo no tiene un formato válido", value: email });
      const occupationLevelId = valueId(row.sourceRow, "NIVEL_OCUPACIONAL_CODIGO", "NIVEL_OCUPACIONAL", row.data.NIVEL_OCUPACIONAL_CODIGO);
      const managementId = valueId(row.sourceRow, "GERENCIA_CODIGO", "GERENCIA", row.data.GERENCIA_CODIGO);
      const divisionId = valueId(row.sourceRow, "DIVISION_CODIGO", "DIVISION", row.data.DIVISION_CODIGO);
      const businessPartnerValueId = valueId(row.sourceRow, "BUSINESS_PARTNER_CODIGO", "BUSINESS_PARTNER", row.data.BUSINESS_PARTNER_CODIGO);
      const statusId = valueId(row.sourceRow, "ESTADO_PERSONA_CODIGO", "ESTADO_PERSONA", row.data.ESTADO_PERSONA_CODIGO);
      const organizationalUnitId = unitId(row.sourceRow, "UNIDAD_ORGANIZACIONAL_CODIGO", row.data.UNIDAD_ORGANIZACIONAL_CODIGO);
      const subManagementId = unitId(row.sourceRow, "SUBGERENCIA_CODIGO", row.data.SUBGERENCIA_CODIGO);
      const key = `${dni}|${companyCode}`;
      if (dni && companyId && keys.has(key)) issues.push({ sourceRow: row.sourceRow, field: "DNI", code: "DUPLICATE_IN_FILE", detail: "La combinación DNI + empresa está duplicada", value: key });
      keys.add(key);
      if (!dni || !names || !companyId || !statusId) continue;
      persons.push({ sourceRow: row.sourceRow, dni, companyId, companyCode, names, email, phone: textOrNull(row.data.TELEFONO), position: textOrNull(row.data.POSICION), occupationLevelId, organizationalUnitId, managementId, subManagementId, divisionId, businessPartnerValueId, statusId });
    }
    const invalidRows = new Set(issues.map((issue) => issue.sourceRow));
    const validPersons = persons.filter((person) => !invalidRows.has(person.sourceRow));
    const dniValues = [...new Set(validPersons.map((person) => person.dni))];
    const companyIds = [...new Set(validPersons.map((person) => person.companyId))];
    const existing = dniValues.length ? await prisma.person.findMany({ where: { dni: { in: dniValues }, companyId: { in: companyIds } }, select: { dni: true, companyId: true } }) : [];
    const existingKeys = new Set(existing.map((person) => `${person.dni}|${person.companyId}`));
    const toCreate = validPersons.filter((person) => !existingKeys.has(`${person.dni}|${person.companyId}`));
    const toUpdate = validPersons.filter((person) => existingKeys.has(`${person.dni}|${person.companyId}`));
    const report = { sourceFile: basename(sourcePath), sourceHash, database: new URL(connectionString).pathname.slice(1), dryRun: !apply, totals: { received: rows.length, valid: validPersons.length, invalid: invalidRows.size, create: toCreate.length, excludedExisting: toUpdate.length, issues: issues.length }, companyNormalization: Object.fromEntries(companyAliases), issues };
    await mkdir(reportsDir, { recursive: true });
    const reportPath = resolve(reportsDir, `person-import-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    if (!apply) {
      console.log(JSON.stringify({ ...report, reportPath }, null, 2));
      return;
    }
    const target = assertSafeDatabaseWrite(connectionString, "legacy-import");
    const allowedLocal = target === "mochelab_local" && confirmLocal;
    const allowedDevelopment = target === "mochelab_dev" && confirmDevelopment;
    const backupArg = args.find((argument) => argument.startsWith("--backup-file="));
    const backupPath = backupArg?.slice("--backup-file=".length);
    const allowedProduction = target === "mochelab_prod" && confirmProduction && backupPath && existsSync(resolve(backupPath)) && statSync(resolve(backupPath)).size > 0;
    if (!allowedLocal && !allowedDevelopment && !allowedProduction) throw new Error("BLOQUEADO: requiere confirmación del entorno; PRODUCCIÓN exige --confirm-production, MOCHELAB_PRODUCTION_WRITE_CONFIRMATION=MOCHELAB_PROD y --backup-file válido");
    for (const batch of chunks(toCreate)) {
      await prisma.$transaction(async (tx) => {
        await tx.person.createMany({ data: batch.map((person) => ({ dni: person.dni, companyId: person.companyId, names: person.names, email: person.email, phone: person.phone, position: person.position, occupationLevelId: person.occupationLevelId, organizationalUnitId: person.organizationalUnitId, managementId: person.managementId, subManagementId: person.subManagementId, divisionId: person.divisionId, businessPartnerValueId: person.businessPartnerValueId, businessPartnerId: null, statusId: person.statusId, sourceRow: person.sourceRow })) });
      });
    }
    await prisma.audit.create({ data: { occurredAt: new Date(), actorLegacy: "PERSON_IMPORT", action: "BULK_IMPORT", entity: "PERSON", recordId: sourceHash.slice(0, 80), newValue: { sourceFile: basename(sourcePath), sourceHash, created: toCreate.length, excludedExisting: toUpdate.length, rejected: invalidRows.size, reportPath }, result: "OK", origin: productionMode ? "PRODUCTION_SCRIPT" : developmentMode ? "DEVELOPMENT_SCRIPT" : "LOCAL_SCRIPT" } });
    console.log(JSON.stringify({ ...report, applied: true, reportPath }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

void main();
