import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertSafeDatabaseWrite, databaseName } from "../src/database/environment-guard";
import { postgresOptions } from "../src/database/postgres-options";

const developmentMode = process.argv.includes("--confirm-development");
config({ path: resolve(process.cwd(), developmentMode ? "../../.env" : "../../.env.local"), quiet: true });

type LegacyRow = { _sheet: string; _source_row: number; data: Record<string, unknown> };
type PreparedRole = LegacyRow & { dni: string; roleSourceId: string; period: string; score: number; level: string };
type PreparedTeam = LegacyRow & { teamSourceId: string; period: string; score: number; level: string };

const apply = process.argv.includes("--apply");
const batchArgument = process.argv.slice(2).find((value) => !value.startsWith("--"))
  ?? "database/staging/final-f5cd07cfc136";
const configuredDatabaseUrl = process.env.DATABASE_URL ?? "";
if (!configuredDatabaseUrl) throw new Error("DATABASE_URL no configurada");
const targetUrl = new URL(configuredDatabaseUrl);
if (developmentMode) targetUrl.pathname = "/mochelab_dev";
const databaseUrl = targetUrl.toString();
const expectedDatabase = developmentMode ? "mochelab_dev" : "mochelab_local";
if (databaseName(databaseUrl) !== expectedDatabase) throw new Error(`Destino no permitido: ${databaseName(databaseUrl)}`);
if (apply) assertSafeDatabaseWrite(databaseUrl, "legacy-import");

const db = new PrismaClient({ adapter: new PrismaPg(postgresOptions(databaseUrl)) });
const clean = (value: unknown) => value == null ? "" : String(value).replace(/\s+/g, " ").trim();
const sourceKey = (value: unknown) => {
  if (typeof value === "number" && Number.isInteger(value)) return String(value);
  return clean(value);
};
const decimal = (value: unknown): number | null => {
  const normalized = clean(value).replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};
const periodCode = (value: unknown) => /^\d{6}$/.test(sourceKey(value)) ? sourceKey(value) : null;
const levelCode = (value: unknown) => clean(value)
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toUpperCase().replace(/^\d+\.?\s*/, "").replace(/\s+/g, "_");
const isEvaluated = (score: number | null, level: string) => score != null && score >= 0 && !["SIN_EVALUACION", "SIN_VALOR"].includes(level);

async function batchPath(argument: string) {
  for (const candidate of [resolve(argument), resolve(process.cwd(), "../..", argument)]) {
    try { await access(resolve(candidate, "manifest.json")); return candidate; } catch { /* next */ }
  }
  throw new Error(`No se encontró el lote ${argument}`);
}

async function rows(path: string, name: string): Promise<LegacyRow[]> {
  const content = await readFile(resolve(path, `${name}.jsonl`), "utf8");
  return content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as LegacyRow);
}

function prepareRoles(source: LegacyRow[]) {
  const valid: PreparedRole[] = [];
  let notEvaluated = 0;
  let invalidKey = 0;
  for (const row of source) {
    const dni = sourceKey(row.data.DNI);
    const roleSourceId = sourceKey(row.data.ID_ROL);
    const period = periodCode(row.data.FECHA_MADUREZ);
    const score = decimal(row.data.PUNTAJE_MADUREZ);
    const level = levelCode(row.data.NIVEL_MADUREZ);
    if (!dni || !roleSourceId || !period) { invalidKey++; continue; }
    if (!isEvaluated(score, level)) { notEvaluated++; continue; }
    valid.push({ ...row, dni, roleSourceId, period, score: score!, level });
  }
  const deduped = [...new Map(valid.map((row) => [`${row.dni}|${row.roleSourceId}|${row.period}`, row])).values()];
  return { rows: deduped, valid: valid.length, duplicates: valid.length - deduped.length, notEvaluated, invalidKey };
}

function prepareTeams(source: LegacyRow[]) {
  const valid: PreparedTeam[] = [];
  let notEvaluated = 0;
  let invalidKey = 0;
  for (const row of source) {
    const teamSourceId = sourceKey(row.data.ID_TEAM);
    const period = periodCode(row.data.FECHA_MADUREZ);
    const score = decimal(row.data.PUNTAJE_MADUREZ);
    const level = levelCode(row.data.NIVEL_MADUREZ);
    if (!teamSourceId || !period) { invalidKey++; continue; }
    if (!isEvaluated(score, level)) { notEvaluated++; continue; }
    valid.push({ ...row, teamSourceId, period, score: score!, level });
  }
  // La última fila del Excel prevalece cuando un equipo y período se repiten.
  const deduped = [...new Map(valid.map((row) => [`${row.teamSourceId}|${row.period}`, row])).values()];
  return { rows: deduped, valid: valid.length, duplicates: valid.length - deduped.length, notEvaluated, invalidKey };
}

const periodName: Record<string, string> = {
  "202402": "Feb. 2024", "202502": "Feb. 2025", "202602": "Feb. 2026", "202608": "Ago. 2026",
};

async function main() {
  const path = await batchPath(batchArgument);
  const manifest = JSON.parse(await readFile(resolve(path, "manifest.json"), "utf8")) as { source_file: string; source_sha256: string };
  const [roleSource, teamSource] = await Promise.all([rows(path, "madurezrol"), rows(path, "madurezequipo")]);
  const rolePrepared = prepareRoles(roleSource);
  const teamPrepared = prepareTeams(teamSource);

  const [assignments, teams, levels, closedStatus] = await Promise.all([
    db.personRole.findMany({
      include: { person: { include: { company: true } }, role: true, team: true, status: true },
      orderBy: [{ sourceRow: "asc" }, { team: { sourceId: "asc" } }],
    }),
    db.team.findMany({ select: { id: true, sourceId: true, name: true } }),
    db.catalogValue.findMany({ where: { catalog: { code: "NIVEL_MADUREZ" } }, select: { id: true, code: true } }),
    db.catalogValue.findFirst({ where: { code: "CERRADO", catalog: { code: "ESTADO_PERIODO_MADUREZ" } }, select: { id: true } }),
  ]);
  if (!closedStatus) throw new Error("Falta el catálogo ESTADO_PERIODO_MADUREZ.CERRADO");

  const assignmentGroups = new Map<string, typeof assignments>();
  for (const assignment of assignments) {
    const key = `${assignment.person.dni}|${assignment.role.sourceId}`;
    assignmentGroups.set(key, [...(assignmentGroups.get(key) ?? []), assignment]);
  }
  const canonicalAssignments = new Map<string, (typeof assignments)[number]>();
  const ambiguousPeople: string[] = [];
  for (const [key, options] of assignmentGroups) {
    const personIds = new Set(options.map((item) => item.personId));
    if (personIds.size > 1) { ambiguousPeople.push(key); continue; }
    const ordered = [...options].sort((a, b) =>
      Number(b.status.code === "ACTIVO") - Number(a.status.code === "ACTIVO")
      || a.team.sourceId.localeCompare(b.team.sourceId, undefined, { numeric: true })
      || a.id.localeCompare(b.id),
    );
    canonicalAssignments.set(key, ordered[0]!);
  }

  const teamMap = new Map(teams.map((team) => [team.sourceId, team]));
  const levelMap = new Map(levels.map((level) => [level.code, level.id]));
  const mappedRoles = rolePrepared.rows.flatMap((row) => {
    const assignment = canonicalAssignments.get(`${row.dni}|${row.roleSourceId}`);
    const levelId = levelMap.get(row.level);
    return assignment && levelId ? [{ row, assignment, levelId }] : [];
  });
  const mappedTeams = teamPrepared.rows.flatMap((row) => {
    const team = teamMap.get(row.teamSourceId);
    const levelId = levelMap.get(row.level);
    return team && levelId ? [{ row, team, levelId }] : [];
  });
  const missingRoleMappings = rolePrepared.rows.filter((row) => !canonicalAssignments.has(`${row.dni}|${row.roleSourceId}`) || !levelMap.has(row.level));
  const missingTeamMappings = teamPrepared.rows.filter((row) => !teamMap.has(row.teamSourceId) || !levelMap.has(row.level));
  const periodCodes = [...new Set([...mappedRoles.map(({ row }) => row.period), ...mappedTeams.map(({ row }) => row.period)])].sort();

  console.log(JSON.stringify({
    mode: apply ? `APPLY_${expectedDatabase}` : `DRY_RUN_${expectedDatabase}`,
    database: databaseName(databaseUrl),
    source: manifest.source_file,
    sourceSha256: manifest.source_sha256,
    roleMaturity: { source: roleSource.length, ...rolePrepared, rows: undefined, mapped: mappedRoles.length, missingMappings: missingRoleMappings.length },
    teamMaturity: { source: teamSource.length, ...teamPrepared, rows: undefined, mapped: mappedTeams.length, missingMappings: missingTeamMappings.length },
    periods: periodCodes,
    ambiguousPersonRoleKeys: ambiguousPeople,
    missingRoleSamples: missingRoleMappings.slice(0, 20).map((row) => ({ row: row._source_row, dni: row.dni, role: row.roleSourceId, period: row.period })),
    missingTeamSamples: missingTeamMappings.slice(0, 20).map((row) => ({ row: row._source_row, team: row.teamSourceId, period: row.period })),
  }, null, 2));

  if (!apply) return;
  await db.$transaction(async (tx) => {
    const periods = new Map<string, string>();
    for (const code of periodCodes) {
      const year = Number(code.slice(0, 4));
      const month = Number(code.slice(4));
      const record = await tx.period.upsert({
        where: { code },
        create: {
          code, name: periodName[code] ?? code,
          startDate: new Date(Date.UTC(year, month - 1, 1)),
          endDate: new Date(Date.UTC(year, month, 0)), statusId: closedStatus.id, active: false,
        },
        update: {
          name: periodName[code] ?? code,
          startDate: new Date(Date.UTC(year, month - 1, 1)),
          endDate: new Date(Date.UTC(year, month, 0)), statusId: closedStatus.id, active: false,
        },
      });
      periods.set(code, record.id);
    }

    for (const { row, assignment, levelId } of mappedRoles) {
      const periodId = periods.get(row.period)!;
      const existing = await tx.roleMaturity.findFirst({
        where: { personRoleId: assignment.id, periodId, modelVersionId: null },
        select: { id: true, legacyRecord: true },
      });
      const data = {
        evaluatedAt: new Date(Date.UTC(Number(row.period.slice(0, 4)), Number(row.period.slice(4)) - 1, 1)),
        score: row.score, levelId, comments: clean(row.data.COMENTARIOS) || null,
        legacyRecord: true, sourceRow: row._source_row,
      };
      if (existing) {
        if (!existing.legacyRecord) throw new Error(`Conflicto: existe madurez no histórica para ${row.dni}, rol ${row.roleSourceId}, período ${row.period}`);
        await tx.roleMaturity.update({ where: { id: existing.id }, data });
      } else {
        await tx.roleMaturity.create({ data: { ...data, personRoleId: assignment.id, periodId } });
      }
    }

    for (const { row, team, levelId } of mappedTeams) {
      const periodId = periods.get(row.period)!;
      await tx.teamMaturity.upsert({
        where: { teamId_periodId: { teamId: team.id, periodId } },
        create: {
          teamId: team.id, periodId,
          evaluatedAt: new Date(Date.UTC(Number(row.period.slice(0, 4)), Number(row.period.slice(4)) - 1, 1)),
          score: row.score, levelId, comments: clean(row.data.COMENTARIOS) || null, sourceRow: row._source_row,
        },
        update: {
          evaluatedAt: new Date(Date.UTC(Number(row.period.slice(0, 4)), Number(row.period.slice(4)) - 1, 1)),
          score: row.score, levelId, comments: clean(row.data.COMENTARIOS) || null, sourceRow: row._source_row,
        },
      });
    }
  }, { timeout: 120_000 });

  console.log(`LOCAL actualizado: ${mappedRoles.length} resultados por persona/rol y ${mappedTeams.length} resultados por equipo.`);
}

main().finally(() => db.$disconnect());
