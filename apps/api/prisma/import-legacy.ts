import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "dotenv";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { postgresOptions } from "../src/database/postgres-options";

config({ path: resolve(process.cwd(), "../../.env"), quiet: true });

type LegacyRow = { _sheet: string; _source_row: number; data: Record<string, unknown> };
type Issue = {
  sheet: string; sourceRow?: number; entity: string; field?: string;
  severity: "WARNING" | "ERROR"; code: string; description: string;
  originalValue?: string; resolution?: string;
};
type Counts = Record<string, { source: number; prepared: number; omitted: number; written?: number }>;

const IMPORTER_VERSION = "2.0.0";
const APPLY = process.argv.includes("--apply");
const VERIFY = process.argv.includes("--verify");
const ALLOW_NON_EMPTY = process.argv.includes("--allow-non-empty");
const batchArgument = process.argv.slice(2).find((value) => !value.startsWith("--"));
if (!batchArgument) throw new Error("Uso: pnpm migration:import <lote> [--apply|--verify] [--allow-non-empty]");
let batchPath = "";

async function resolveBatchPath(argument: string): Promise<string> {
  const candidates = [resolve(argument), resolve(process.cwd(), "../..", argument)];
  for (const candidate of candidates) {
    try { await access(resolve(candidate, "manifest.json")); return candidate; } catch { /* probar la siguiente ruta */ }
  }
  throw new Error(`No se encontró manifest.json para el lote ${argument}`);
}

const text = (value: unknown): string => value == null ? "" : String(value).replace(/\s+/g, " ").trim();
const key = (value: unknown): string => {
  if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value)) return String(value);
  return text(value);
};
const plain = (value: unknown): string => text(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
const semantic = (value: unknown): string => plain(value).toLowerCase();
const code = (value: unknown): string => plain(value).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 100) || "SIN_VALOR";
const validText = (value: unknown): string | null => {
  const normalized = text(value);
  return !normalized || ["#N/D", "#REF!", "NULL", "NONE"].includes(normalized.toUpperCase()) ? null : normalized;
};
const dateValue = (value: unknown): Date | null => {
  const normalized = text(value);
  if (!normalized || /^column/i.test(normalized)) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const decimal = (value: unknown): string | null => {
  if (value == null || text(value) === "") return null;
  let normalized = text(value).replace(/\s/g, "");
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(normalized)) normalized = normalized.replace(/,/g, "");
  else if (/^-?\d+,\d+$/.test(normalized)) normalized = normalized.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? String(parsed) : null;
};
const integer = (value: unknown): number | null => {
  const parsed = Number(key(value));
  return Number.isInteger(parsed) ? parsed : null;
};
const uuid = (namespace: string, value: string): string => {
  const hash = createHash("sha256").update(`${namespace}:${value}`).digest("hex").slice(0, 32).split("");
  hash[12] = "5"; hash[16] = ((parseInt(hash[16], 16) & 3) | 8).toString(16);
  return `${hash.slice(0, 8).join("")}-${hash.slice(8, 12).join("")}-${hash.slice(12, 16).join("")}-${hash.slice(16, 20).join("")}-${hash.slice(20).join("")}`;
};
const companyName = (value: unknown): string => {
  const normalized = plain(value).toUpperCase();
  if (normalized === "DANPER") return "DANPER TRUJILLO SAC";
  if (normalized === "DOMINUS") return "DOMINUS SAC";
  return text(value) || "SIN EMPRESA";
};
const maturityLevelCode = (value: unknown): string => code(value).replace(/^\d+_/, "").replace(/^\d+/, "");
const periodCode = (value: unknown): string | null => /^\d{6}$/.test(key(value)) ? key(value) : null;
const chunks = <T>(rows: T[], size = 500): T[][] => Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size));
const uniqueBy = <T>(rows: T[], selector: (row: T) => string): T[] => [...new Map(rows.map((row) => [selector(row), row])).values()];

async function readRows(name: string): Promise<LegacyRow[]> {
  const content = await readFile(resolve(batchPath, `${name}.jsonl`), "utf8");
  return content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as LegacyRow);
}

async function createMany<T>(rows: T[], write: (data: T[]) => Promise<{ count: number }>): Promise<number> {
  let total = 0;
  for (const part of chunks(rows)) total += (await write(part)).count;
  return total;
}

async function main() {
  batchPath = await resolveBatchPath(batchArgument!);
  const manifest = JSON.parse(await readFile(resolve(batchPath, "manifest.json"), "utf8")) as {
    source_file: string; source_sha256: string; mode: string; missing_sheets: string[];
  };
  const names = ["persona", "personarol", "personacurso", "equipo", "objetivos", "portafolio", "rol", "curso", "metasindicadores", "rolcurso", "madurezequipo", "madurezrol", "auditoria", "usuario"];
  const loaded = await Promise.all(names.map((name) => readRows(name)));
  const data = Object.fromEntries(names.map((name, index) => [name, loaded[index]])) as Record<string, LegacyRow[]>;
  const issues: Issue[] = [];
  const counts: Counts = Object.fromEntries(names.map((name) => [name, { source: data[name].length, prepared: 0, omitted: 0 }]));
  if (manifest.missing_sheets.filter((name) => name !== "VW_Academia").length) throw new Error(`Faltan hojas obligatorias: ${manifest.missing_sheets.join(", ")}`);

  const personDnis = new Set(data.persona.map((row) => key(row.data.DNI)).filter(Boolean));
  const roleIds = new Set(data.rol.map((row) => key(row.data.ID_ROL)).filter(Boolean));
  const teamIds = new Set(data.equipo.map((row) => key(row.data.ID_TEAM)).filter(Boolean));
  const courseIds = new Set(data.curso.map((row) => key(row.data.ID_CURSO)).filter(Boolean));
  const objectiveIds = new Set(data.objetivos.map((row) => key(row.data.ID_OKR)).filter(Boolean));

  const assignmentsByPair = new Map<string, LegacyRow[]>();
  for (const row of data.personarol) {
    const pair = `${key(row.data.DNI)}|${key(row.data.ID_ROL)}`;
    assignmentsByPair.set(pair, [...(assignmentsByPair.get(pair) ?? []), row]);
  }
  const consolidatedAssignments = uniqueBy(
    [...data.personarol].sort((a, b) => code(b.data.ESTADO_PERSONA_ROL).localeCompare(code(a.data.ESTADO_PERSONA_ROL)) || a._source_row - b._source_row),
    (row) => `${key(row.data.DNI)}|${key(row.data.ID_ROL)}|${key(row.data.ID_TEAM)}`,
  );
  counts.personarol.prepared = consolidatedAssignments.length;
  counts.personarol.omitted = data.personarol.length - consolidatedAssignments.length;

  const projectedAssignments = new Map<string, LegacyRow[]>();
  for (const row of consolidatedAssignments) {
    const dni = key(row.data.DNI), role = key(row.data.ID_ROL), team = key(row.data.ID_TEAM);
    if (!personDnis.has(dni) || !roleIds.has(role) || !teamIds.has(team)) {
      counts.personarol.prepared--; counts.personarol.omitted++;
      issues.push({ sheet: row._sheet, sourceRow: row._source_row, entity: "PersonRole", severity: "ERROR", code: "INVALID_ASSIGNMENT_REFERENCE", description: "La asignación referencia una persona, rol o equipo inexistente." });
      continue;
    }
    const pair = `${dni}|${role}`; projectedAssignments.set(pair, [...(projectedAssignments.get(pair) ?? []), row]);
  }

  const projectedCourses = new Set<string>();
  const orderedPersonCourses = [...data.personacurso].sort((a, b) => {
    const status = Number(code(a.data.ESTADO_PERSONA_CURSO) === "TERMINADO") - Number(code(b.data.ESTADO_PERSONA_CURSO) === "TERMINADO");
    const end = (dateValue(a.data.FECHA_FIN)?.getTime() ?? 0) - (dateValue(b.data.FECHA_FIN)?.getTime() ?? 0);
    return status || end || a._source_row - b._source_row;
  });
  for (const row of orderedPersonCourses) {
    const pair = `${key(row.data.DNI)}|${key(row.data.ID_ROL)}`;
    const options = projectedAssignments.get(pair) ?? [];
    const selected = options.some((item) => code(item.data.ESTADO_PERSONA_ROL) === "ACTIVO")
      ? options.filter((item) => code(item.data.ESTADO_PERSONA_ROL) === "ACTIVO")
      : [...options].sort((a, b) => b._source_row - a._source_row).slice(0, 1);
    if (!courseIds.has(key(row.data.ID_CURSO)) || !selected.length) {
      counts.personacurso.omitted++;
      issues.push({ sheet: row._sheet, sourceRow: row._source_row, entity: "PersonCourse", severity: "WARNING", code: "ASSIGNMENT_OR_COURSE_NOT_FOUND", description: "Curso personal omitido porque no existe curso o asignación Persona-Rol aplicable." });
      continue;
    }
    for (const assignment of selected) projectedCourses.add(`${assignment._source_row}|${key(row.data.ID_CURSO)}`);
  }
  counts.personacurso.prepared = projectedCourses.size;

  const validTeamMaturity = data.madurezequipo.filter((row) => periodCode(row.data.FECHA_MADUREZ) && !["SIN_EVALUACION", "SIN_VALOR"].includes(maturityLevelCode(row.data.NIVEL_MADUREZ)) && decimal(row.data.PUNTAJE_MADUREZ) != null);
  const validRoleMaturity = data.madurezrol.filter((row) => periodCode(row.data.FECHA_MADUREZ) && !["SIN_EVALUACION", "SIN_VALOR"].includes(maturityLevelCode(row.data.NIVEL_MADUREZ)) && decimal(row.data.PUNTAJE_MADUREZ) != null);
  counts.madurezequipo.prepared = uniqueBy(validTeamMaturity, (row) => `${key(row.data.ID_TEAM)}|${periodCode(row.data.FECHA_MADUREZ)}`).length;
  counts.madurezequipo.omitted = data.madurezequipo.length - counts.madurezequipo.prepared;
  counts.madurezrol.prepared = validRoleMaturity.length;
  counts.madurezrol.omitted = data.madurezrol.length - validRoleMaturity.length;

  const projectedRoleMaturity = new Set<string>();
  for (const row of validRoleMaturity) {
    const pair = `${key(row.data.DNI)}|${key(row.data.ID_ROL)}`;
    const options = projectedAssignments.get(pair) ?? [];
    const selected = options.some((item) => code(item.data.ESTADO_PERSONA_ROL) === "ACTIVO")
      ? options.filter((item) => code(item.data.ESTADO_PERSONA_ROL) === "ACTIVO")
      : [...options].sort((a, b) => b._source_row - a._source_row).slice(0, 1);
    if (!selected.length) {
      counts.madurezrol.omitted++;
      issues.push({ sheet: row._sheet, sourceRow: row._source_row, entity: "RoleMaturity", severity: "WARNING", code: "ASSIGNMENT_NOT_FOUND", description: "Madurez de rol omitida porque no existe asignación Persona-Rol aplicable." });
      continue;
    }
    for (const assignment of selected) projectedRoleMaturity.add(`${assignment._source_row}|${periodCode(row.data.FECHA_MADUREZ)}`);
  }
  counts.madurezrol.prepared = projectedRoleMaturity.size;
  for (const row of validTeamMaturity) if (!teamIds.has(key(row.data.ID_TEAM))) {
    counts.madurezequipo.prepared--; counts.madurezequipo.omitted++;
    issues.push({ sheet: row._sheet, sourceRow: row._source_row, entity: "TeamMaturity", field: "ID_TEAM", severity: "WARNING", code: "TEAM_NOT_FOUND", description: "Madurez de equipo omitida porque el equipo no existe." });
  }
  for (const row of data.objetivos) {
    const parent = key(row.data.ID_OKR_PADRE);
    if (parent && !objectiveIds.has(parent)) issues.push({ sheet: row._sheet, sourceRow: row._source_row, entity: "Objective", field: "ID_OKR_PADRE", severity: "WARNING", code: "PARENT_NOT_FOUND", description: "El objetivo se cargará como raíz histórica porque su padre no existe.", originalValue: parent, resolution: "Reconstruir jerarquía posteriormente." });
  }
  for (const row of data.persona) if (!validText(row.data.ESTADO) || code(row.data.ESTADO) !== text(row.data.ESTADO).toUpperCase()) {
    issues.push({ sheet: row._sheet, sourceRow: row._source_row, entity: "Person", field: "ESTADO", severity: "WARNING", code: "NORMALIZED_PERSON_STATUS", description: `Estado normalizado a ${validText(row.data.ESTADO) ? code(row.data.ESTADO) : "INACTIVO"}.`, originalValue: text(row.data.ESTADO) || "(vacío)" });
  }

  for (const name of names.filter((value) => !["personarol", "personacurso", "madurezequipo", "madurezrol"].includes(value))) counts[name].prepared = data[name].length;
  const reportPath = resolve(batchPath, APPLY ? "import-report-apply.json" : "import-report-dry-run.json");
  if (!APPLY && !VERIFY) {
    const report = { importerVersion: IMPORTER_VERSION, mode: "DRY_RUN", source: manifest, counts, issues, generatedAt: new Date().toISOString(), writesPerformed: false };
    await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
    console.log(JSON.stringify({ importerVersion: IMPORTER_VERSION, mode: "DRY_RUN", counts, issues: { total: issues.length, errors: issues.filter((item) => item.severity === "ERROR").length, warnings: issues.filter((item) => item.severity === "WARNING").length }, writesPerformed: false }, null, 2));
    console.log(`Reporte: ${reportPath}`);
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL no configurada");
  const migrationSchema = process.env.MIGRATION_SCHEMA?.trim();
  if (migrationSchema) throw new Error("MIGRATION_SCHEMA no está soportado por Prisma; use una base de datos aislada.");
  const prisma = new PrismaClient({ adapter: new PrismaPg(postgresOptions(databaseUrl)) });
  if (VERIFY) {
    const expected: Record<string, number> = {
      persona: counts.persona.prepared, personarol: counts.personarol.prepared, personacurso: counts.personacurso.prepared,
      equipo: counts.equipo.prepared, rol: counts.rol.prepared, curso: counts.curso.prepared, rolcurso: counts.rolcurso.prepared,
      madurezrol: counts.madurezrol.prepared, madurezequipo: counts.madurezequipo.prepared, objetivos: counts.objetivos.prepared,
      portafolio: counts.portafolio.prepared, metasindicadores: counts.metasindicadores.prepared, usuario: counts.usuario.prepared, auditoria: counts.auditoria.prepared,
    };
    const values = await Promise.all([
      prisma.person.count(), prisma.personRole.count(), prisma.personCourse.count(), prisma.team.count(), prisma.role.count(), prisma.course.count(), prisma.roleCourse.count(),
      prisma.roleMaturity.count(), prisma.teamMaturity.count(), prisma.objective.count({ where: { isSystemPlaceholder: false } }), prisma.initiative.count(),
      prisma.indicatorTarget.count(), prisma.user.count(), prisma.audit.count({ where: { origin: "LEGACY" } }), prisma.importIssue.count(),
    ]);
    const keys = ["persona", "personarol", "personacurso", "equipo", "rol", "curso", "rolcurso", "madurezrol", "madurezequipo", "objetivos", "portafolio", "metasindicadores", "usuario", "auditoria"];
    const actual = Object.fromEntries(keys.map((name, index) => [name, values[index]]));
    const differences = keys.filter((name) => actual[name] !== expected[name]).map((name) => ({ entity: name, expected: expected[name], actual: actual[name], difference: actual[name] - expected[name] }));
    const batch = await prisma.importBatch.findUnique({ where: { fileHash_importerVersion: { fileHash: manifest.source_sha256, importerVersion: IMPORTER_VERSION } }, select: { id: true, status: true, completedAt: true } });
    const verification = { importerVersion: IMPORTER_VERSION, mode: "VERIFY", sourceHash: manifest.source_sha256, batch, expected, actual, importIssues: values[14], differences, ok: differences.length === 0 && batch?.status === "COMPLETED", generatedAt: new Date().toISOString(), writesPerformed: false };
    const verificationPath = resolve(batchPath, "verification-report.json");
    await writeFile(verificationPath, JSON.stringify(verification, null, 2), "utf8");
    console.log(JSON.stringify(verification, null, 2)); console.log(`Reporte: ${verificationPath}`);
    await prisma.$disconnect();
    if (!verification.ok) process.exitCode = 1;
    return;
  }
  try {
    const completed = await prisma.$transaction(async (tx) => {
      const previous = await tx.importBatch.findUnique({ where: { fileHash_importerVersion: { fileHash: manifest.source_sha256, importerVersion: IMPORTER_VERSION } }, select: { status: true } });
      if (previous?.status === "COMPLETED") throw new Error("Este archivo ya fue migrado completamente con esta versión del importador.");
      const batch = await tx.importBatch.upsert({
        where: { fileHash_importerVersion: { fileHash: manifest.source_sha256, importerVersion: IMPORTER_VERSION } },
        create: { fileName: manifest.source_file, fileHash: manifest.source_sha256, importerVersion: IMPORTER_VERSION, status: "RUNNING" },
        update: { status: "RUNNING", startedAt: new Date(), completedAt: null, totals: Prisma.JsonNull },
      });
      const result = await applyImport(tx, data, consolidatedAssignments, validRoleMaturity, validTeamMaturity, issues, counts, batch.id);
      await tx.importBatch.update({ where: { id: batch.id }, data: { status: "COMPLETED", completedAt: new Date(), totals: result as Prisma.InputJsonValue } });
      return { batchId: batch.id, result };
    }, { maxWait: 60_000, timeout: 30 * 60_000 });
    const report = { importerVersion: IMPORTER_VERSION, mode: "APPLY", batchId: completed.batchId, source: manifest, counts, issues, result: completed.result, generatedAt: new Date().toISOString(), writesPerformed: true };
    await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
    console.log(JSON.stringify({ importerVersion: IMPORTER_VERSION, mode: "APPLY", batchId: completed.batchId, result: completed.result, writesPerformed: true }, null, 2));
    console.log(`Reporte: ${reportPath}`);
  } catch (error) {
    await prisma.$transaction(async (tx) => {
      const previous = await tx.importBatch.findUnique({ where: { fileHash_importerVersion: { fileHash: manifest.source_sha256, importerVersion: IMPORTER_VERSION } }, select: { status: true } });
      if (previous?.status === "COMPLETED") return;
      await tx.importBatch.upsert({
        where: { fileHash_importerVersion: { fileHash: manifest.source_sha256, importerVersion: IMPORTER_VERSION } },
        create: { fileName: manifest.source_file, fileHash: manifest.source_sha256, importerVersion: IMPORTER_VERSION, status: "FAILED", completedAt: new Date(), totals: { error: error instanceof Error ? error.message : String(error) } },
        update: { status: "FAILED", completedAt: new Date(), totals: { error: error instanceof Error ? error.message : String(error) } },
      });
    });
    throw error;
  } finally { await prisma.$disconnect(); }
}

async function applyImport(
  tx: Prisma.TransactionClient, data: Record<string, LegacyRow[]>, assignments: LegacyRow[], roleMaturity: LegacyRow[], teamMaturity: LegacyRow[],
  issues: Issue[], counts: Counts, batchId: string,
) {
  const current = await Promise.all([tx.person.count(), tx.personRole.count(), tx.objective.count({ where: { isSystemPlaceholder: false } }), tx.initiative.count()]);
  if (!ALLOW_NON_EMPTY && current.some(Boolean)) throw new Error(`La base contiene datos funcionales (${current.join(", ")}). Use una base limpia o --allow-non-empty.`);

  const catalogCache = new Map<string, string>();
  async function cv(catalogCode: string, raw: unknown, fallback = "SIN_DEFINIR") {
    let valueCode = code(raw);
    if (!validText(raw)) valueCode = fallback;
    if (catalogCode === "NIVEL_MADUREZ") valueCode = maturityLevelCode(raw);
    if (catalogCode === "PERFIL_USUARIO" && valueCode === "ADMINISTRADOR") valueCode = "ADMIN";
    const cacheKey = `${catalogCode}|${valueCode}`;
    if (catalogCache.has(cacheKey)) return catalogCache.get(cacheKey)!;
    const catalog = await tx.catalog.upsert({ where: { code: catalogCode }, create: { code: catalogCode, name: catalogCode.toLowerCase().replaceAll("_", " ") }, update: { active: true } });
    const value = await tx.catalogValue.upsert({
      where: { catalogId_code: { catalogId: catalog.id, code: valueCode } },
      create: { catalogId: catalog.id, code: valueCode, name: validText(raw) ?? fallback.replaceAll("_", " "), active: true },
      update: { active: true },
    });
    catalogCache.set(cacheKey, value.id); return value.id;
  }

  const unitAliases = new Map<string, string>();
  const aliasContent = await readFile(resolve(process.cwd(), "../../database/seeds/unidad_kr_alias.csv"), "utf8");
  for (const line of aliasContent.replace(/^\uFEFF/, "").split(/\r?\n/).slice(1).filter(Boolean)) {
    const fields = line.split(","); unitAliases.set(plain(fields[0]).toLowerCase(), fields[1]);
  }
  async function objectiveUnit(raw: unknown, row: LegacyRow) {
    if (!validText(raw)) return null;
    const destination = unitAliases.get(plain(raw).toLowerCase());
    if (!destination) {
      issues.push({ sheet: row._sheet, sourceRow: row._source_row, entity: "Objective", field: "UNIDAD_KR", severity: "WARNING", code: "UNMAPPED_UNIT", description: "Unidad histórica sin equivalencia canónica; se conserva sin relación.", originalValue: text(raw) });
      return null;
    }
    return cv("UNIDAD_KR", destination);
  }

  const companies = uniqueBy([...data.persona.map((r) => companyName(r.data.EMPRESA)), ...data.portafolio.map((r) => companyName(r.data.EMPRESA))], (name) => code(name));
  const companyMap = new Map<string, string>();
  for (const name of companies) {
    const record = await tx.company.upsert({ where: { code: code(name) }, create: { code: code(name), name, sourceName: name }, update: { name, active: true } });
    companyMap.set(code(name), record.id);
  }

  const programs = uniqueBy([...data.equipo.map((r) => validText(r.data.PROGRAMA) ?? "SIN PROGRAMA"), ...data.portafolio.map((r) => validText(r.data.PROGRAMA) ?? "SIN PROGRAMA")], (name) => code(name));
  const programMap = new Map<string, string>();
  for (const name of programs) {
    const record = await tx.program.upsert({ where: { code: code(name) }, create: { code: code(name), name }, update: { name, active: true } });
    programMap.set(code(name), record.id);
  }

  const bpMap = new Map<string, string>();
  for (const name of uniqueBy(data.persona.map((r) => validText(r.data.BUSINESS_PARTNER)).filter((v): v is string => Boolean(v)), (value) => code(value))) {
    const record = await tx.businessPartner.upsert({ where: { code: code(name) }, create: { code: code(name), name }, update: { name, active: true } });
    bpMap.set(code(name), record.id);
  }

  const teamUnitMap = new Map<string, string>();
  for (const name of uniqueBy(data.equipo.map((r) => validText(r.data.UNIDAD)).filter((v): v is string => Boolean(v)), (value) => code(value))) {
    const id = uuid("org-unit", `UNIDAD|${code(name)}|GLOBAL`);
    await tx.organizationalUnit.upsert({ where: { id }, create: { id, code: code(name), name, unitType: "UNIDAD" }, update: { name, active: true } });
    teamUnitMap.set(code(name), id);
  }

  const personUnitMap = new Map<string, string>();
  for (const row of data.persona) {
    const companyId = companyMap.get(code(companyName(row.data.EMPRESA)))!;
    let parentId: string | null = null;
    let selectedId: string | null = null;
    for (const [field, type] of [["GERENCIA", "GERENCIA"], ["SUBGERENCIA", "SUBGERENCIA"], ["DIVISION", "DIVISION"]] as const) {
      const name = validText(row.data[field]); if (!name) continue;
      const unitCode = code(name); const mapKey = `${companyId}|${type}|${unitCode}`;
      const id = personUnitMap.get(mapKey) ?? uuid("org-unit", mapKey);
      if (!personUnitMap.has(mapKey)) {
        await tx.organizationalUnit.upsert({ where: { id }, create: { id, code: unitCode, name, unitType: type, companyId, parentId }, update: { name, parentId, active: true } });
        personUnitMap.set(mapKey, id);
      }
      parentId = id; selectedId = id;
    }
    if (selectedId) personUnitMap.set(`PERSON|${row._source_row}`, selectedId);
  }

  const roleMap = new Map<string, string>();
  for (const row of data.rol) {
    const sourceId = key(row.data.ID_ROL); if (!sourceId) continue;
    const record = await tx.role.upsert({ where: { sourceId }, create: { sourceId, name: text(row.data.NOMBRE_ROL), typeId: await cv("TIPO_ROL", row.data.TIPO), statusId: await cv("ESTADO_ROL", row.data.ESTADO, "ACTIVO") }, update: { name: text(row.data.NOMBRE_ROL), typeId: await cv("TIPO_ROL", row.data.TIPO), statusId: await cv("ESTADO_ROL", row.data.ESTADO, "ACTIVO") } });
    roleMap.set(sourceId, record.id);
  }
  const courseMap = new Map<string, string>();
  for (const row of data.curso) {
    const sourceId = key(row.data.ID_CURSO); if (!sourceId) continue;
    const record = await tx.course.upsert({ where: { sourceId }, create: { sourceId, name: text(row.data.NOMBRE_CURSO), moduleId: await cv("MODULO_CURSO", row.data.MODULO), statusId: await cv("ESTADO_CURSO", row.data.ESTADO, "ACTIVO") }, update: { name: text(row.data.NOMBRE_CURSO), moduleId: await cv("MODULO_CURSO", row.data.MODULO), statusId: await cv("ESTADO_CURSO", row.data.ESTADO, "ACTIVO") } });
    courseMap.set(sourceId, record.id);
  }
  const teamMap = new Map<string, string>();
  for (const row of data.equipo) {
    const sourceId = key(row.data.ID_TEAM); if (!sourceId) continue;
    const record = await tx.team.upsert({ where: { sourceId }, create: { sourceId, unitId: teamUnitMap.get(code(row.data.UNIDAD)), programId: programMap.get(code(validText(row.data.PROGRAMA) ?? "SIN PROGRAMA"))!, statusId: await cv("ESTADO_EQUIPO", row.data.ESTADO, "ACTIVO") }, update: { unitId: teamUnitMap.get(code(row.data.UNIDAD)), programId: programMap.get(code(validText(row.data.PROGRAMA) ?? "SIN PROGRAMA"))!, statusId: await cv("ESTADO_EQUIPO", row.data.ESTADO, "ACTIVO") } });
    teamMap.set(sourceId, record.id);
  }

  const peopleByDni = new Map<string, { id: string; companyCode: string; email: string }[]>();
  for (const row of data.persona) {
    const dni = key(row.data.DNI); if (!dni) continue;
    const normalizedCompany = companyName(row.data.EMPRESA); const companyId = companyMap.get(code(normalizedCompany))!;
    const statusRaw = validText(row.data.ESTADO) ?? "INACTIVO";
    const record = await tx.person.upsert({
      where: { dni_companyId: { dni, companyId } },
      create: { dni, companyId, names: text(row.data.NOMBRES) || "SIN NOMBRE", email: validText(row.data.CORREO)?.toLowerCase(), phone: validText(row.data.TELEFONO), position: validText(row.data.POSICION), occupationLevelId: validText(row.data.NIVEL_OCUPACIONAL) ? await cv("NIVEL_OCUPACIONAL", row.data.NIVEL_OCUPACIONAL) : null, organizationalUnitId: personUnitMap.get(`PERSON|${row._source_row}`), businessPartnerId: validText(row.data.BUSINESS_PARTNER) ? bpMap.get(code(row.data.BUSINESS_PARTNER)) : null, statusId: await cv("ESTADO_PERSONA", statusRaw, "INACTIVO"), sourceRow: row._source_row },
      update: { names: text(row.data.NOMBRES) || "SIN NOMBRE", email: validText(row.data.CORREO)?.toLowerCase(), phone: validText(row.data.TELEFONO), position: validText(row.data.POSICION), occupationLevelId: validText(row.data.NIVEL_OCUPACIONAL) ? await cv("NIVEL_OCUPACIONAL", row.data.NIVEL_OCUPACIONAL) : null, organizationalUnitId: personUnitMap.get(`PERSON|${row._source_row}`), businessPartnerId: validText(row.data.BUSINESS_PARTNER) ? bpMap.get(code(row.data.BUSINESS_PARTNER)) : null, statusId: await cv("ESTADO_PERSONA", statusRaw, "INACTIVO"), sourceRow: row._source_row },
    });
    peopleByDni.set(dni, [...(peopleByDni.get(dni) ?? []), { id: record.id, companyCode: code(normalizedCompany), email: validText(row.data.CORREO)?.toLowerCase() ?? "" }]);
  }

  function resolvePerson(dni: string, teamSourceId: string, sourceRow: number, sheet: string) {
    const candidates = peopleByDni.get(dni) ?? [];
    if (!candidates.length) { issues.push({ sheet, sourceRow, entity: "PersonRole", field: "DNI", severity: "ERROR", code: "PERSON_NOT_FOUND", description: `No existe Persona para DNI ${dni}.`, originalValue: dni }); return null; }
    if (candidates.length === 1) return candidates[0].id;
    const preferred = teamSourceId === "3" ? "DANPER_TRUJILLO_SAC" : teamSourceId === "33" ? "DOMINUS_SAC" : "";
    const selected = candidates.find((candidate) => candidate.companyCode === preferred) ?? candidates[0];
    if (!preferred) issues.push({ sheet, sourceRow, entity: "PersonRole", field: "DNI", severity: "WARNING", code: "AMBIGUOUS_PERSON_COMPANY", description: `DNI ${dni} existe en varias empresas; se seleccionó ${selected.companyCode}.`, originalValue: dni, resolution: "Revisar vínculo DNI-equipo." });
    return selected.id;
  }

  const assignmentMap = new Map<string, { id: string; active: boolean; sourceRow: number }[]>();
  for (const row of assignments) {
    const dni = key(row.data.DNI), roleSource = key(row.data.ID_ROL), teamSource = key(row.data.ID_TEAM);
    const personId = resolvePerson(dni, teamSource, row._source_row, row._sheet), roleId = roleMap.get(roleSource), teamId = teamMap.get(teamSource);
    if (!personId || !roleId || !teamId) { counts.personarol.omitted++; continue; }
    const record = await tx.personRole.upsert({
      where: { personId_roleId_teamId: { personId, roleId, teamId } },
      create: { personId, roleId, teamId, statusId: await cv("ESTADO_ASIGNACION", row.data.ESTADO_PERSONA_ROL, "INACTIVO"), onboardingStatusId: await cv("ESTADO_ONBOARDING", row.data.ESTADO_ONBOARDING, "PENDIENTE"), startDate: dateValue(row.data.FECHA_ALTA), endDate: dateValue(row.data.FECHA_BAJA), sourceRow: row._source_row },
      update: { statusId: await cv("ESTADO_ASIGNACION", row.data.ESTADO_PERSONA_ROL, "INACTIVO"), onboardingStatusId: await cv("ESTADO_ONBOARDING", row.data.ESTADO_ONBOARDING, "PENDIENTE"), startDate: dateValue(row.data.FECHA_ALTA), endDate: dateValue(row.data.FECHA_BAJA), sourceRow: row._source_row },
    });
    const pair = `${dni}|${roleSource}`; assignmentMap.set(pair, [...(assignmentMap.get(pair) ?? []), { id: record.id, active: code(row.data.ESTADO_PERSONA_ROL) === "ACTIVO", sourceRow: row._source_row }]);
  }
  counts.personarol.written = [...assignmentMap.values()].reduce((sum, rows) => sum + rows.length, 0);

  const roleCourses = uniqueBy(data.rolcurso, (row) => `${key(row.data.ID_ROL)}|${key(row.data.ID_CURSO)}`).flatMap((row) => {
    const roleId = roleMap.get(key(row.data.ID_ROL)), courseId = courseMap.get(key(row.data.ID_CURSO));
    return roleId && courseId ? [{ roleId, courseId, active: true }] : [];
  });
  counts.rolcurso.written = await createMany(roleCourses, (rows) => tx.roleCourse.createMany({ data: rows, skipDuplicates: true }));

  const personCourseRows: Prisma.PersonCourseCreateManyInput[] = [];
  const orderedPersonCourses = [...data.personacurso].sort((a, b) => {
    const status = Number(code(a.data.ESTADO_PERSONA_CURSO) === "TERMINADO") - Number(code(b.data.ESTADO_PERSONA_CURSO) === "TERMINADO");
    const end = (dateValue(a.data.FECHA_FIN)?.getTime() ?? 0) - (dateValue(b.data.FECHA_FIN)?.getTime() ?? 0);
    return status || end || a._source_row - b._source_row;
  });
  for (const row of orderedPersonCourses) {
    const courseId = courseMap.get(key(row.data.ID_CURSO)); const pair = `${key(row.data.DNI)}|${key(row.data.ID_ROL)}`;
    const options = assignmentMap.get(pair) ?? []; const selected = options.some((item) => item.active) ? options.filter((item) => item.active) : [...options].sort((a, b) => b.sourceRow - a.sourceRow).slice(0, 1);
    if (!courseId || !selected.length) { issues.push({ sheet: row._sheet, sourceRow: row._source_row, entity: "PersonCourse", severity: "WARNING", code: "ASSIGNMENT_OR_COURSE_NOT_FOUND", description: "Curso personal omitido porque no existe curso o asignación Persona-Rol aplicable." }); continue; }
    for (const assignment of selected) personCourseRows.push({ id: uuid("person-course", `${assignment.id}|${courseId}`), personRoleId: assignment.id, courseId, statusId: await cv("ESTADO_PERSONA_CURSO", row.data.ESTADO_PERSONA_CURSO, "PENDIENTE"), score: decimal(row.data.NOTA), startDate: dateValue(row.data.FECHA_INICIO), endDate: dateValue(row.data.FECHA_FIN), sourceId: validText(row.data.FUENTE) ? await cv("FUENTE_PERSONA_CURSO", row.data.FUENTE) : null, groupId: validText(row.data.GRUPO) ? await cv("GRUPO_PERSONA_CURSO", row.data.GRUPO) : null, loadedAt: dateValue(row.data.FECHA_CARGA), loadedByLegacy: validText(row.data.USUARIO_CARGA), sourceRow: row._source_row });
  }
  const personCourses = uniqueBy(personCourseRows, (row) => `${row.personRoleId}|${row.courseId}`);
  counts.personacurso.prepared = personCourses.length;
  counts.personacurso.written = await createMany(personCourses, (rows) => tx.personCourse.createMany({ data: rows, skipDuplicates: true }));

  const periods = new Map<string, string>();
  for (const period of uniqueBy([...roleMaturity, ...teamMaturity].map((row) => periodCode(row.data.FECHA_MADUREZ)).filter((value): value is string => Boolean(value)), (value) => value)) {
    const year = Number(period.slice(0, 4)), month = Number(period.slice(4)); const startDate = new Date(Date.UTC(year, month - 1, 1)), endDate = new Date(Date.UTC(year, month, 0));
    const record = await tx.period.upsert({ where: { code: period }, create: { code: period, name: startDate.toLocaleDateString("es-PE", { month: "short", year: "numeric", timeZone: "UTC" }), startDate, endDate, statusId: await cv("ESTADO_PERIODO_MADUREZ", "CERRADO") }, update: { startDate, endDate } }); periods.set(period, record.id);
  }
  const roleMaturityRows: Prisma.RoleMaturityCreateManyInput[] = [];
  for (const row of roleMaturity) {
    const period = periodCode(row.data.FECHA_MADUREZ)!; const options = assignmentMap.get(`${key(row.data.DNI)}|${key(row.data.ID_ROL)}`) ?? [];
    const selected = options.some((item) => item.active) ? options.filter((item) => item.active) : [...options].sort((a, b) => b.sourceRow - a.sourceRow).slice(0, 1);
    if (!selected.length) continue;
    for (const assignment of selected) roleMaturityRows.push({ id: uuid("role-maturity", `${assignment.id}|${period}`), personRoleId: assignment.id, periodId: periods.get(period)!, evaluatedAt: new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(4)) - 1, 1)), score: decimal(row.data.PUNTAJE_MADUREZ)!, levelId: await cv("NIVEL_MADUREZ", row.data.NIVEL_MADUREZ), comments: validText(row.data.COMENTARIOS), legacyRecord: true, sourceRow: row._source_row });
  }
  const uniqueRoleMaturity = uniqueBy(roleMaturityRows, (row) => `${row.personRoleId}|${row.periodId}`);
  counts.madurezrol.prepared = uniqueRoleMaturity.length;
  counts.madurezrol.written = await createMany(uniqueRoleMaturity, (rows) => tx.roleMaturity.createMany({ data: rows, skipDuplicates: true }));
  const teamMaturityRows = uniqueBy(teamMaturity, (row) => `${key(row.data.ID_TEAM)}|${periodCode(row.data.FECHA_MADUREZ)}`).flatMap((row): Prisma.TeamMaturityCreateManyInput[] => {
    const period = periodCode(row.data.FECHA_MADUREZ)!, teamId = teamMap.get(key(row.data.ID_TEAM));
    if (!teamId) { issues.push({ sheet: row._sheet, sourceRow: row._source_row, entity: "TeamMaturity", field: "ID_TEAM", severity: "WARNING", code: "TEAM_NOT_FOUND", description: "Madurez de equipo omitida porque el equipo no existe." }); return []; }
    return [{ id: uuid("team-maturity", `${teamId}|${period}`), teamId, periodId: periods.get(period)!, evaluatedAt: new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(4)) - 1, 1)), score: decimal(row.data.PUNTAJE_MADUREZ)!, levelId: catalogCache.get(`NIVEL_MADUREZ|${maturityLevelCode(row.data.NIVEL_MADUREZ)}`) ?? "", comments: validText(row.data.COMENTARIOS), sourceRow: row._source_row }];
  });
  for (const row of teamMaturityRows) if (!row.levelId) row.levelId = await cv("NIVEL_MADUREZ", teamMaturity.find((source) => source._source_row === row.sourceRow)?.data.NIVEL_MADUREZ);
  counts.madurezequipo.written = await createMany(teamMaturityRows, (rows) => tx.teamMaturity.createMany({ data: rows, skipDuplicates: true }));

  const objectiveIds = new Map<string, string>();
  const objectivesByText = new Map<string, string[]>();
  const objectivesByKeyResult = new Map<string, string[]>();
  const objectiveRows: Prisma.ObjectiveCreateManyInput[] = [];
  for (const row of data.objetivos) {
    const source = key(row.data.ID_OKR), sourceId = BigInt(source || "0"); if (!source) { counts.objetivos.omitted++; continue; }
    const id = uuid("objective", source); objectiveIds.set(source, id);
    const textKey = `${semantic(row.data.OBJETIVO)}|${semantic(row.data.RESULTADO_CLAVE)}|${integer(row.data.ANIO) ?? 0}`;
    const resultKey = `${semantic(row.data.RESULTADO_CLAVE)}|${integer(row.data.ANIO) ?? 0}`;
    objectivesByText.set(textKey, [...(objectivesByText.get(textKey) ?? []), id]);
    objectivesByKeyResult.set(resultKey, [...(objectivesByKeyResult.get(resultKey) ?? []), id]);
    objectiveRows.push({ id, sourceId, levelId: await cv("NIVEL_OBJETIVO", row.data.NIVEL), parentReferenceLegacy: validText(row.data.ID_OKR_PADRE), teamId: teamMap.get(key(row.data.ID_TEAM)), focusAreaId: await cv("AREA_ENFOQUE", row.data.AREA_ENFOQUE), year: integer(row.data.ANIO) ?? 0, cycleId: await cv("CICLO", row.data.CICLO), objective: text(row.data.OBJETIVO) || "SIN INFORMACIÓN", keyResult: text(row.data.RESULTADO_CLAVE) || "SIN INFORMACIÓN", directionId: await cv("DIRECCION_INDICADOR", row.data.INDICADOR), typeId: await cv("TIPO_OBJETIVO", row.data.TIPO), unitId: await objectiveUnit(row.data.UNIDAD_KR, row), baseline: decimal(row.data.LINEA_BASE), baselineDate: dateValue(row.data.FECHA_BASE), target: decimal(row.data.META), actual: decimal(row.data.EJECUTADO), cutoffDate: dateValue(row.data.FECHA_CORTE), resultStatusId: validText(row.data.ESTADO) ? await cv("ESTADO_RESULTADO_CLAVE", row.data.ESTADO) : null, recordStatusId: await cv("ESTADO_REGISTRO_OBJETIVO", row.data.ESTADO_REGISTRO, "ACTIVO"), achievement: decimal(row.data["%CUMPLIMIENTO"]), legacyRecord: true, sourceRow: row._source_row });
  }
  counts.objetivos.written = await createMany(objectiveRows, (rows) => tx.objective.createMany({ data: rows, skipDuplicates: true }));
  for (const row of data.objetivos) {
    const source = key(row.data.ID_OKR), parentSource = key(row.data.ID_OKR_PADRE); if (!source || !parentSource) continue;
    const parentId = objectiveIds.get(parentSource);
    if (parentId) await tx.objective.update({ where: { sourceId: BigInt(source) }, data: { parentId } });
    else issues.push({ sheet: row._sheet, sourceRow: row._source_row, entity: "Objective", field: "ID_OKR_PADRE", severity: "WARNING", code: "PARENT_NOT_FOUND", description: "Objetivo cargado como raíz histórica porque su padre no existe.", originalValue: parentSource, resolution: "Reconstruir jerarquía posteriormente." });
  }

  const placeholderObjectives = new Map<string, string>();
  async function placeholderObjective(year: number, kind: "INTERNAL" | "UNRESOLVED") {
    const mapKey = `${kind}|${year}`; if (placeholderObjectives.has(mapKey)) return placeholderObjectives.get(mapKey)!;
    const systemKey = kind === "INTERNAL" ? `NO_APLICA_GESTION_INTERNA_${year}` : `MIGRACION_SIN_OKR_${year}`;
    const label = kind === "INTERNAL" ? "NO APLICA – GESTIÓN INTERNA" : "PENDIENTE DE CONCILIACIÓN – MIGRACIÓN";
    const record = await tx.objective.upsert({
      where: { systemKey },
      create: { sourceId: BigInt(kind === "INTERNAL" ? -year : -(10000 + year)), year, objective: label, keyResult: kind === "INTERNAL" ? "No aplica" : "Referencia histórica no identificada", isSystemPlaceholder: true, systemKey, levelId: await cv("NIVEL_OBJETIVO", "Corporativo"), focusAreaId: await cv("AREA_ENFOQUE", "Estrategia del negocio"), cycleId: await cv("CICLO", "Anual"), directionId: await cv("DIRECCION_INDICADOR", "Directo"), typeId: await cv("TIPO_OBJETIVO", "Output/Entrega"), recordStatusId: await cv("ESTADO_REGISTRO_OBJETIVO", "ACTIVO") },
      update: { objective: label, keyResult: kind === "INTERNAL" ? "No aplica" : "Referencia histórica no identificada", isSystemPlaceholder: true },
      select: { id: true },
    });
    placeholderObjectives.set(mapKey, record.id); return record.id;
  }

  const initiativeRows: Prisma.InitiativeCreateManyInput[] = [];
  for (const row of data.portafolio) {
    const source = key(row.data.ID_INICIATIVA); if (!source) { counts.portafolio.omitted++; continue; }
    const year = integer(row.data.ANIO) ?? 0;
    const internal = code(row.data.TIPO_INICIATIVA) === "GESTION_INTERNA";
    let objectiveId = internal ? await placeholderObjective(year, "INTERNAL") : objectiveIds.get(key(row.data.ID_OKR));
    if (!objectiveId && !internal) {
      const exact = objectivesByText.get(`${semantic(row.data.OBJETIVO)}|${semantic(row.data.RESULTADO_CLAVE)}|${year}`) ?? [];
      const byResult = objectivesByKeyResult.get(`${semantic(row.data.RESULTADO_CLAVE)}|${year}`) ?? [];
      const inferred = exact.length === 1 ? exact[0] : byResult.length === 1 ? byResult[0] : null;
      if (inferred) {
        objectiveId = inferred;
        issues.push({ sheet: row._sheet, sourceRow: row._source_row, entity: "Initiative", field: "ID_OKR", severity: "WARNING", code: "PORTFOLIO_OKR_INFERRED", description: "ID_OKR inferido mediante objetivo y resultado clave históricos.", resolution: "Validar durante la conciliación." });
      } else {
        objectiveId = await placeholderObjective(year, "UNRESOLVED");
        issues.push({ sheet: row._sheet, sourceRow: row._source_row, entity: "Initiative", field: "ID_OKR", severity: "WARNING", code: "PORTFOLIO_OKR_PLACEHOLDER", description: "Iniciativa histórica vinculada a un objetivo técnico porque no fue posible identificar un OKR único.", resolution: "Conciliar y reemplazar por el OKR correcto." });
      }
    }
    if (!objectiveId) throw new Error(`No se pudo resolver objetivo para Portafolio fila ${row._source_row}`);
    const linkedObjectiveId = objectiveId;
    initiativeRows.push({ id: uuid("initiative", source), sourceId: BigInt(source), teamId: teamMap.get(key(row.data.ID_TEAM)), companyId: companyMap.get(code(companyName(row.data.EMPRESA)))!, year, cycleId: await cv("CICLO", row.data.CICLO), focusAreaId: await cv("AREA_ENFOQUE", row.data.AREA_ENFOQUE), levelId: await cv("NIVEL_OBJETIVO", row.data.NIVEL), programId: programMap.get(code(validText(row.data.PROGRAMA) ?? "SIN PROGRAMA"))!, objectiveLegacy: validText(row.data.OBJETIVO), keyResultLegacy: validText(row.data.RESULTADO_CLAVE), typeId: await cv("TIPO_INICIATIVA", row.data.TIPO_INICIATIVA), sizeId: await cv("TALLA_INICIATIVA", row.data.TALLA), name: text(row.data.INICIATIVA) || "SIN INFORMACIÓN", release: validText(row.data.RELEASE), executionStart: dateValue(row.data.FECHA_INICIO_EJECUCION), executionEnd: dateValue(row.data.FECHA_FIN_EJECUCION), priorityId: validText(row.data.PRIORIDAD) ? await cv("PRIORIDAD_INICIATIVA", row.data.PRIORIDAD) : null, productOwner: validText(row.data.DUENO_PRODUCTO), manager: validText(row.data["ATF/GESTOR"]), technicalLead: validText(row.data.LIDER_TECNICO), managementTypeId: await cv("TIPO_GESTION_INICIATIVA", row.data.TIPO_GESTION), statusId: await cv("ESTADO_INICIATIVA", row.data.ESTADO_INICIATIVA), accompanimentMilestone: validText(row.data["HITO ACOMPAÑAMIENTO"]), escalationId: validText(row.data.ESCALAMIENTO) ? await cv("ESCALAMIENTO_INICIATIVA", row.data.ESCALAMIENTO) : null, returnHorizonId: validText(row.data.HORIZONTE_RETORNO) ? await cv("HORIZONTE_RETORNO", row.data.HORIZONTE_RETORNO) : null, tiCapacityId: validText(row.data.TI_CAPACITY) ? await cv("CAPACIDAD_TI", row.data.TI_CAPACITY) : null, categoryId: validText(row.data.CATEGORIA) ? await cv("CATEGORIA_INICIATIVA", row.data.CATEGORIA) : null, impactId: await cv("IMPACTO_INICIATIVA", row.data.IMPACTO), impactDescription: validText(row.data.DESCRIPCION_IMPACTO), projectedEconomicBenefit: decimal(row.data.BENEFICIO_ECONOMICO_PROYECTADO), actualEconomicBenefit: decimal(row.data.BENEFICIO_ECONOMICO_EJECUTADO), projectedMitigationBenefit: decimal(row.data.BENEFICIO_MITIGACION_PROYECTADO), actualMitigationBenefit: decimal(row.data.BENEFICIO_MITIGACION_EJECUTADO), annualPotentialBenefit: decimal(row.data.BENEFICIO_POTENCIAL_ANUAL), projectedInvestment: decimal(row.data.INVERSION_PROYECTADA), actualInvestment: decimal(row.data.INVERSION_EJECUTADA), observations: validText(row.data.OBSERVACIONES), documentationUrl: validText(row.data.LINK_DOCUMENTACION), sourceCreatedAt: dateValue(row.data.FECHA_CREACION), objectiveId: linkedObjectiveId, sourceRow: row._source_row });
  }
  counts.portafolio.written = await createMany(initiativeRows, (rows) => tx.initiative.createMany({ data: rows, skipDuplicates: true }));

  const targetRows: Prisma.IndicatorTargetCreateManyInput[] = [];
  for (const row of data.metasindicadores) {
    const sourceId = key(row.data.ID_META); if (!sourceId || decimal(row.data.VALOR_META) == null || !dateValue(row.data.VIGENCIA_DESDE)) { counts.metasindicadores.omitted++; continue; }
    targetRows.push({ id: uuid("indicator-target", sourceId), sourceId, indicatorId: await cv("INDICADOR_META", row.data.INDICADOR), scopeId: await cv("ALCANCE_META", row.data.ALCANCE), teamId: teamMap.get(key(row.data.ID_TEAM)), roleId: roleMap.get(key(row.data.ID_ROL)), validFrom: dateValue(row.data.VIGENCIA_DESDE)!, validUntil: dateValue(row.data.VIGENCIA_HASTA), target: decimal(row.data.VALOR_META)!, unitId: await cv("UNIDAD_META", row.data.UNIDAD), statusId: await cv("ESTADO_META", row.data.ESTADO, "ACTIVO") });
  }
  counts.metasindicadores.written = await createMany(targetRows, (rows) => tx.indicatorTarget.createMany({ data: rows, skipDuplicates: true }));

  const users: Prisma.UserCreateManyInput[] = [];
  const usedPeople = new Set<string>();
  for (const row of data.usuario) {
    const email = validText(row.data.USUARIO)?.toLowerCase(); if (!email) { counts.usuario.omitted++; continue; }
    const candidates = [...peopleByDni.values()].flat().filter((person) => person.email === email); const personId = candidates.find((candidate) => !usedPeople.has(candidate.id))?.id;
    if (personId) usedPeople.add(personId);
    users.push({ id: uuid("user", email), email, name: null, profileId: await cv("PERFIL_USUARIO", row.data.PERFIL, "USUARIO"), statusId: await cv("ESTADO_USUARIO", row.data.ESTADO, "ACTIVO"), personId, passwordHash: null });
  }
  counts.usuario.written = await createMany(users, (rows) => tx.user.createMany({ data: rows, skipDuplicates: true }));

  const modules = [
    ["INICIO", "Inicio", "/", "home", 10], ["PERSONAS", "Personas", "/personas", "users", 20],
    ["ASIGNACIONES", "Asignaciones", "/asignaciones", "clipboard-list", 25], ["EQUIPOS", "Equipos", "/equipos", "users-round", 30],
    ["CURSOS", "Cursos", "/cursos", "book-open", 40], ["MADUREZ", "Madurez", "/madurez", "gauge", 50],
    ["OBJETIVOS", "Objetivos", "/objetivos", "target", 60], ["PORTAFOLIO", "Portafolio", "/portafolio", "briefcase-business", 70],
    ["CATALOGOS", "Catálogos", "/configuracion/catalogos", "list", 80], ["USUARIOS", "Usuarios", "/configuracion/usuarios", "user-cog", 90],
    ["MIGRACIONES", "Migraciones", "/configuracion/migraciones", "database", 100], ["AUDITORIA", "Auditoría", "/configuracion/auditoria", "history", 110],
  ] as const;
  const profiles = await Promise.all([cv("PERFIL_USUARIO", "USUARIO"), cv("PERFIL_USUARIO", "ADMIN"), cv("PERFIL_USUARIO", "SYSTEM")]);
  for (const [moduleCode, name, route, icon, sortOrder] of modules) {
    const module = await tx.systemModule.upsert({ where: { code: moduleCode }, create: { code: moduleCode, name, route, icon, sortOrder }, update: { name, route, icon, sortOrder, active: true } });
    for (const profileId of profiles) {
      const profileCode = [...catalogCache.entries()].find(([entry, id]) => entry.startsWith("PERFIL_USUARIO|") && id === profileId)?.[0].split("|")[1] ?? "USUARIO";
      const administrator = profileCode === "ADMIN" || profileCode === "SYSTEM";
      const writable = ["ASIGNACIONES", "MADUREZ", "OBJETIVOS", "PORTAFOLIO"].includes(moduleCode);
      const canView = administrator || !["CATALOGOS", "USUARIOS", "MIGRACIONES", "AUDITORIA"].includes(moduleCode);
      await tx.profileModule.upsert({ where: { profileId_moduleId: { profileId, moduleId: module.id } }, create: { profileId, moduleId: module.id, canView, canCreate: moduleCode !== "INICIO" && (administrator || writable), canEdit: moduleCode !== "INICIO" && (administrator || writable), canDelete: administrator && !["INICIO", "AUDITORIA"].includes(moduleCode) }, update: { canView, canCreate: moduleCode !== "INICIO" && (administrator || writable), canEdit: moduleCode !== "INICIO" && (administrator || writable), canDelete: administrator && !["INICIO", "AUDITORIA"].includes(moduleCode) } });
    }
  }

  const auditRows: Prisma.AuditCreateManyInput[] = data.auditoria.flatMap((row) => {
    const sourceId = validText(row.data.ID_AUDITORIA), occurredAt = dateValue(row.data.FECHA); if (!sourceId || !occurredAt) { counts.auditoria.omitted++; return []; }
    return [{ id: uuid("audit", sourceId), sourceId, occurredAt, actorLegacy: validText(row.data.USUARIO), action: text(row.data.ACCION) || "SIN_ACCION", entity: text(row.data.ENTIDAD) || "SIN_ENTIDAD", recordId: validText(row.data.ID_REGISTRO), legacyDetail: validText(row.data.DETALLE), result: "OK", origin: "LEGACY" }];
  });
  counts.auditoria.written = await createMany(auditRows, (rows) => tx.audit.createMany({ data: rows, skipDuplicates: true }));
  const uniqueIssues = uniqueBy(issues, (issue) => `${issue.sheet}|${issue.sourceRow ?? ""}|${issue.entity}|${issue.field ?? ""}|${issue.code}`);
  issues.splice(0, issues.length, ...uniqueIssues);
  if (issues.length) await createMany(issues.map((issue) => ({ importBatchId: batchId, ...issue })), (rows) => tx.importIssue.createMany({ data: rows }));
  return { counts, issues: { total: issues.length, errors: issues.filter((item) => item.severity === "ERROR").length, warnings: issues.filter((item) => item.severity === "WARNING").length } };
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
