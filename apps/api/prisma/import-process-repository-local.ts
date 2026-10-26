import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as XLSX from "xlsx";
import { assertSafeDatabaseWrite } from "../src/database/environment-guard";
import { postgresOptions } from "../src/database/postgres-options";

type SourceRow = {
  sourceRow: number;
  macroprocessName: string;
  macroprocessResponsible: string;
  processName: string;
  processResponsible: string;
  subprocessName: string;
  subprocessResponsible: string;
};

type PersonReference = { id: string; names: string; email: string | null; dni: string; statusCode: string };
type MatchResult =
  | { status: "MATCHED"; person: PersonReference; method: "EXACT" | "TOKEN_SUBSET" | "ALIAS" }
  | { status: "MISSING"; candidates: PersonReference[] }
  | { status: "AMBIGUOUS"; candidates: PersonReference[] };
type Issue = {
  sourceRow: number;
  level: "MACROPROCESS" | "PROCESS" | "SUBPROCESS";
  name: string;
  responsible: string;
  code: "RESPONSIBLE_NOT_FOUND" | "RESPONSIBLE_AMBIGUOUS";
  candidates: string[];
};
type Warning = {
  sourceRow: number;
  level: "MACROPROCESS" | "PROCESS" | "SUBPROCESS";
  name: string;
  responsible: string;
  code: "RESPONSIBLE_INACTIVE";
  person: string;
};

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const confirmLocal = args.includes("--confirm-local");
const confirmDevelopment = args.includes("--confirm-development");
if (confirmLocal && confirmDevelopment) throw new Error("Seleccione solo LOCAL o PRUEBAS");
if (args.includes("--confirm-production")) throw new Error("Este importador no admite PRODUCCIÓN");
const developmentMode = confirmDevelopment;
const sourceArgument = args.find((argument) => !argument.startsWith("--"));
if (!sourceArgument) {
  throw new Error("Uso: pnpm db:import:processes-local <archivo.xlsx> [--apply --confirm-local|--confirm-development] [--company-code=CODIGO]");
}
const companyCode = args.find((argument) => argument.startsWith("--company-code="))?.slice("--company-code=".length) || "DANPER_TRUJILLO_SAC";

config({ path: resolve(process.cwd(), developmentMode ? "../../.env" : "../../.env.local"), quiet: true });
const configuredDatabaseUrl = process.env.DATABASE_URL;
if (!configuredDatabaseUrl) throw new Error(`DATABASE_URL no configurada en ${developmentMode ? ".env" : ".env.local"}`);
const targetUrl = new URL(configuredDatabaseUrl);
if (developmentMode) targetUrl.pathname = "/mochelab_dev";
const databaseUrl = targetUrl.toString();
const databaseName = assertSafeDatabaseWrite(databaseUrl, developmentMode ? "development-write" : "legacy-import");
const expectedDatabase = developmentMode ? "mochelab_dev" : "mochelab_local";
const environment = developmentMode ? "PRUEBAS" : "LOCAL";
if (databaseName !== expectedDatabase) throw new Error(`BLOQUEADO: se esperaba ${expectedDatabase}, no ${databaseName}`);
if (apply && developmentMode && !confirmDevelopment) throw new Error("BLOQUEADO: la escritura en PRUEBAS requiere --apply --confirm-development");
if (apply && !developmentMode && !confirmLocal) throw new Error("BLOQUEADO: la escritura LOCAL requiere --apply --confirm-local");

const sourcePath = resolve(sourceArgument);
const reportsDir = resolve(process.cwd(), "../../reports");
const trim = (value: unknown) => value == null ? "" : String(value).replace(/\s+/g, " ").trim();
const normalize = (value: unknown) => trim(value)
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^A-Za-z0-9]+/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .toUpperCase();
const pad = (value: number) => String(value).padStart(3, "0");
const responsibleAliases = new Map<string, string>([
  ["HELLEN CCAUIN", "CCAHUIN SANCHEZ HELEN DESCIREE"],
  ["WILDER GONZALES", "GONZALEZ TOLEDO WILDER LEONEL"],
]);

function loadRows(): SourceRow[] {
  const workbook = XLSX.readFile(sourcePath, { cellDates: false, raw: false });
  const sheet = workbook.Sheets.Resumen;
  if (!sheet) throw new Error("No existe la hoja Resumen");
  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false });
  const expected = [
    "MACROPROCESO",
    "RESPONSABLE DEL MACROPROCESO",
    "PROCESO",
    "RESPONSABLE DEL PROCESO",
    "SUBPROCESO",
    "RESPONSABLE DEL SUBPROCESO",
  ];
  const headers = (data[0] ?? []).slice(0, expected.length).map(normalize);
  const invalidHeaders = expected.filter((header, index) => headers[index] !== header);
  if (invalidHeaders.length) throw new Error(`La hoja Resumen no tiene el formato esperado. Columnas inválidas: ${invalidHeaders.join(", ")}`);
  return data.slice(1).map((row, index) => ({
    sourceRow: index + 2,
    macroprocessName: trim(row[0]),
    macroprocessResponsible: trim(row[1]),
    processName: trim(row[2]),
    processResponsible: trim(row[3]),
    subprocessName: trim(row[4]),
    subprocessResponsible: trim(row[5]),
  })).filter((row) => Object.values(row).some((value) => typeof value === "string" && value.length > 0));
}

function buildPersonMatcher(people: PersonReference[]) {
  const exact = new Map<string, PersonReference[]>();
  for (const person of people) {
    const key = normalize(person.names);
    exact.set(key, [...(exact.get(key) ?? []), person]);
  }
  return (responsible: string): MatchResult => {
    const sourceKey = normalize(responsible);
    const key = responsibleAliases.get(sourceKey) ?? sourceKey;
    const exactCandidates = exact.get(key) ?? [];
    if (exactCandidates.length === 1) return { status: "MATCHED", person: exactCandidates[0], method: key === sourceKey ? "EXACT" : "ALIAS" };
    if (exactCandidates.length > 1) {
      const activeCandidates = exactCandidates.filter((candidate) => candidate.statusCode === "ACTIVO");
      if (activeCandidates.length === 1) return { status: "MATCHED", person: activeCandidates[0], method: key === sourceKey ? "EXACT" : "ALIAS" };
      return { status: "AMBIGUOUS", candidates: exactCandidates };
    }
    const tokens = [...new Set(key.split(" ").filter((token) => token.length >= 3))];
    if (tokens.length < 2) return { status: "MISSING", candidates: [] };
    const subsetCandidates = people.filter((person) => {
      const personTokens = new Set(normalize(person.names).split(" "));
      return tokens.every((token) => personTokens.has(token));
    });
    if (subsetCandidates.length === 1) return { status: "MATCHED", person: subsetCandidates[0], method: "TOKEN_SUBSET" };
    if (subsetCandidates.length > 1) {
      const activeCandidates = subsetCandidates.filter((candidate) => candidate.statusCode === "ACTIVO");
      if (activeCandidates.length === 1) return { status: "MATCHED", person: activeCandidates[0], method: "TOKEN_SUBSET" };
      return { status: "AMBIGUOUS", candidates: subsetCandidates };
    }
    return { status: "MISSING", candidates: [] };
  };
}

async function main() {
  await access(sourcePath);
  const sourceHash = createHash("sha256").update(await readFile(sourcePath)).digest("hex");
  const rows = loadRows();
  const adapter = new PrismaPg({ connectionString: databaseUrl, ...postgresOptions(databaseUrl) });
  const prisma = new PrismaClient({ adapter });
  try {
    const actualDatabase = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
    if (actualDatabase[0]?.database !== expectedDatabase) throw new Error(`Destino inesperado: ${actualDatabase[0]?.database}`);
    const company = await prisma.company.findUnique({ where: { code: companyCode }, select: { id: true, code: true, name: true, active: true } });
    if (!company?.active) throw new Error(`La empresa ${companyCode} no existe o no está activa`);
    const rawPeople = await prisma.person.findMany({
      where: { companyId: company.id },
      select: { id: true, names: true, email: true, dni: true, status: { select: { code: true } } },
    });
    const people: PersonReference[] = rawPeople.map(({ status, ...person }) => ({ ...person, statusCode: status.code }));
    const matchPerson = buildPersonMatcher(people);
    const issues: Issue[] = [];
    const warnings: Warning[] = [];
    const matchCache = new Map<string, MatchResult>();
    const match = (responsible: string) => {
      const key = normalize(responsible);
      if (!matchCache.has(key)) matchCache.set(key, matchPerson(responsible));
      return matchCache.get(key)!;
    };
    const validateResponsible = (row: SourceRow, level: Issue["level"], name: string, responsible: string, required: boolean) => {
      if (!responsible) {
        if (required) issues.push({ sourceRow: row.sourceRow, level, name, responsible, code: "RESPONSIBLE_NOT_FOUND", candidates: [] });
        return null;
      }
      const result = match(responsible);
      if (result.status === "MATCHED") {
        if (result.person.statusCode !== "ACTIVO") warnings.push({ sourceRow: row.sourceRow, level, name, responsible, code: "RESPONSIBLE_INACTIVE", person: `${result.person.names} (${result.person.dni})` });
        return { personId: result.person.id, responsibleActive: result.person.statusCode === "ACTIVO" };
      }
      issues.push({
        sourceRow: row.sourceRow,
        level,
        name,
        responsible,
        code: result.status === "AMBIGUOUS" ? "RESPONSIBLE_AMBIGUOUS" : "RESPONSIBLE_NOT_FOUND",
        candidates: result.candidates.map((candidate) => `${candidate.names} (${candidate.dni})`),
      });
      return { personId: null, responsibleActive: false };
    };

    const macroprocesses: Array<{ code: string; name: string; responsiblePersonId: string | null; sourceRow: number; sortOrder: number; processes: Array<{ code: string; name: string; responsiblePersonId: string | null; sourceRow: number; sortOrder: number; subprocesses: Array<{ code: string; name: string; responsiblePersonId: string | null; responsibleActive: boolean; sourceRow: number; sortOrder: number }> }> }> = [];
    const macroByName = new Map<string, (typeof macroprocesses)[number]>();
    for (const row of rows) {
      if (!row.macroprocessName || !row.processName || !row.subprocessName) throw new Error(`Fila ${row.sourceRow}: la jerarquía está incompleta`);
      const macroKey = normalize(row.macroprocessName);
      let macro = macroByName.get(macroKey);
      if (!macro) {
        const position = macroprocesses.length + 1;
        macro = { code: `MP-${pad(position)}`, name: row.macroprocessName, responsiblePersonId: validateResponsible(row, "MACROPROCESS", row.macroprocessName, row.macroprocessResponsible, true)?.personId ?? null, sourceRow: row.sourceRow, sortOrder: position, processes: [] };
        macroprocesses.push(macro);
        macroByName.set(macroKey, macro);
      }
      const processKey = normalize(row.processName);
      let process = macro.processes.find((candidate) => normalize(candidate.name) === processKey);
      if (!process) {
        const position = macro.processes.length + 1;
        process = { code: `PR-${macro.code.slice(3)}-${pad(position)}`, name: row.processName, responsiblePersonId: validateResponsible(row, "PROCESS", row.processName, row.processResponsible, false)?.personId ?? null, sourceRow: row.sourceRow, sortOrder: position, subprocesses: [] };
        macro.processes.push(process);
      }
      const subprocessKey = normalize(row.subprocessName);
      if (process.subprocesses.some((candidate) => normalize(candidate.name) === subprocessKey)) throw new Error(`Fila ${row.sourceRow}: subproceso duplicado dentro del mismo proceso: ${row.subprocessName}`);
      const position = process.subprocesses.length + 1;
      const subprocessResponsible = validateResponsible(row, "SUBPROCESS", row.subprocessName, row.subprocessResponsible, true);
      process.subprocesses.push({ code: `SP-${macro.code.slice(3)}-${process.code.slice(-3)}-${pad(position)}`, name: row.subprocessName, responsiblePersonId: subprocessResponsible?.personId ?? null, responsibleActive: subprocessResponsible?.responsibleActive ?? false, sourceRow: row.sourceRow, sortOrder: position });
    }

    const uniqueIssues = [...new Map(issues.map((issue) => [`${issue.level}|${normalize(issue.name)}|${normalize(issue.responsible)}`, issue])).values()];
    const uniqueWarnings = [...new Map(warnings.map((warning) => [`${warning.level}|${normalize(warning.name)}|${normalize(warning.responsible)}`, warning])).values()];
    const matchedPeople = [...matchCache.values()].filter((result): result is Extract<MatchResult, { status: "MATCHED" }> => result.status === "MATCHED");
    const totals = {
      rows: rows.length,
      macroprocesses: macroprocesses.length,
      processes: macroprocesses.reduce((total, macro) => total + macro.processes.length, 0),
      subprocesses: macroprocesses.reduce((total, macro) => total + macro.processes.reduce((sum, process) => sum + process.subprocesses.length, 0), 0),
      uniqueResponsibleNames: matchCache.size,
      matchedResponsibleNames: matchedPeople.length,
      tokenSubsetMatches: matchedPeople.filter((result) => result.method === "TOKEN_SUBSET").length,
      aliasMatches: matchedPeople.filter((result) => result.method === "ALIAS").length,
      issues: uniqueIssues.length,
      warnings: uniqueWarnings.length,
      inactiveSubprocesses: macroprocesses.reduce((total, macro) => total + macro.processes.reduce((sum, process) => sum + process.subprocesses.filter((subprocess) => !subprocess.responsibleActive).length, 0), 0),
    };
    await mkdir(reportsDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportPath = resolve(reportsDir, `process-import-${timestamp}.json`);
    const report = { environment, database: databaseName, company: { code: company.code, name: company.name }, sourceFile: basename(sourcePath), sourceHash, dryRun: !apply, totals, issues: uniqueIssues, warnings: uniqueWarnings };
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    if (!apply) {
      console.log(JSON.stringify({ ...report, reportPath }, null, 2));
      return;
    }
    if (uniqueIssues.length) throw new Error(`BLOQUEADO: existen ${uniqueIssues.length} responsables sin conciliación única. Revise ${reportPath}`);
    const existingCount = await prisma.macroprocess.count({ where: { companyId: company.id } });
    if (existingCount > 0) throw new Error(`BLOQUEADO: ya existen ${existingCount} macroprocesos para ${company.code}; la carga inicial no se repetirá automáticamente`);

    await prisma.$transaction(async (tx) => {
      for (const macro of macroprocesses) {
        const createdMacro = await tx.macroprocess.create({ data: { companyId: company.id, code: macro.code, name: macro.name, responsiblePersonId: macro.responsiblePersonId, active: true, sortOrder: macro.sortOrder, sourceRow: macro.sourceRow } });
        for (const process of macro.processes) {
          const createdProcess = await tx.businessProcess.create({ data: { macroprocessId: createdMacro.id, code: process.code, name: process.name, responsiblePersonId: process.responsiblePersonId, active: true, sortOrder: process.sortOrder, sourceRow: process.sourceRow } });
          for (const subprocess of process.subprocesses) {
            await tx.subprocess.create({ data: { businessProcessId: createdProcess.id, code: subprocess.code, name: subprocess.name, responsiblePersonId: subprocess.responsiblePersonId, active: subprocess.responsibleActive, sortOrder: subprocess.sortOrder, sourceRow: subprocess.sourceRow } });
          }
        }
      }
      await tx.audit.create({ data: { occurredAt: new Date(), actorLegacy: "PROCESS_REPOSITORY_IMPORT", action: "BULK_IMPORT", entity: "PROCESS_REPOSITORY", recordId: sourceHash.slice(0, 80), newValue: { sourceFile: basename(sourcePath), sourceHash, companyCode: company.code, environment, ...totals, reportPath }, result: "OK", origin: developmentMode ? "DEVELOPMENT_SCRIPT" : "LOCAL_SCRIPT" } });
    });
    console.log(JSON.stringify({ ...report, dryRun: false, applied: true, reportPath }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

void main();
