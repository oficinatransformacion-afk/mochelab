import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { postgresOptions } from "../src/database/postgres-options";
import { assertSafeDatabaseWrite } from "../src/database/environment-guard";

const developmentMode = process.argv.includes("--confirm-development");
const productionMode = process.argv.includes("--confirm-production");
if (developmentMode && productionMode) throw new Error("Seleccione solo un entorno remoto");
const remoteMode = developmentMode || productionMode;
config({ path: resolve(process.cwd(), remoteMode ? "../../.env" : "../../.env.local"), quiet: true });
const configuredDatabaseUrl = process.env.DATABASE_URL;
if (!configuredDatabaseUrl) throw new Error("DATABASE_URL no configurada");
const targetUrl = new URL(configuredDatabaseUrl);
if (developmentMode) targetUrl.pathname = "/mochelab_dev";
if (productionMode) targetUrl.pathname = "/mochelab_prod";
const databaseUrl = targetUrl.toString();
const databaseName = assertSafeDatabaseWrite(databaseUrl, "seed");
const expectedDatabase = productionMode ? "mochelab_prod" : developmentMode ? "mochelab_dev" : "mochelab_local";
if (databaseName !== expectedDatabase) throw new Error(`Destino no permitido: ${databaseName}`);
if (productionMode) {
  const backupArg = process.argv.find(argument => argument.startsWith("--backup-file="));
  const backupPath = backupArg?.slice("--backup-file=".length);
  if (!backupPath) throw new Error("BLOQUEADO: PRODUCCIÓN requiere --backup-file=<respaldo verificado>");
  if (!existsSync(resolve(backupPath))) throw new Error("BLOQUEADO: no existe el respaldo indicado para PRODUCCIÓN");
  if (statSync(resolve(backupPath)).size === 0) throw new Error("BLOQUEADO: el respaldo de PRODUCCIÓN está vacío");
}
const prisma = new PrismaClient({ adapter: new PrismaPg(postgresOptions(databaseUrl)) });

type Answer = { sectionCode: string; dimensionCode: string; itemCode: string; value: number; source: string };
type SourcePerson = { dni: string; name: string; email: string | null; answers: Answer[] };
type SourceFile = { modelVersion: string; people: SourcePerson[] };

async function catalogValueId(catalogCode: string, valueCode: string) {
  const row = await prisma.catalogValue.findFirst({ where: { code: valueCode, catalog: { code: catalogCode } }, select: { id: true } });
  if (!row) throw new Error(`Falta configurar ${catalogCode}.${valueCode}`);
  return row.id;
}

const round4 = (value: number) => Math.round(value * 10000) / 10000;

async function main() {
  const inputPath = process.env.ATF_RESPONSES_JSON ?? resolve(process.cwd(), "../../.artifact-work/atf-responses.local.json");
  const source = JSON.parse(await readFile(inputPath, "utf8")) as SourceFile;
  const [company, team, role, period] = await Promise.all([
    remoteMode ? Promise.resolve(null) : prisma.company.findUnique({ where: { code: "DEMO_DANPER" } }),
    remoteMode ? Promise.resolve(null) : prisma.team.findUnique({ where: { sourceId: "DEMO-TEAM-001" } }),
    remoteMode ? prisma.role.findFirst({ where: { name: { equals: "ATF", mode: "insensitive" } } }) : prisma.role.findUnique({ where: { sourceId: "MAT-07" } }),
    prisma.period.findUnique({ where: { code: remoteMode ? "202608" : "LOCAL-MAD-2026" }, include: { status: true } }),
  ]);
  if (!role || !period || (!remoteMode && (!company || !team))) throw new Error("Falta la configuración de empresa, equipo, rol ATF o período");
  if (!remoteMode && period.status.code !== "AUTOEVALUACION") throw new Error("LOCAL-MAD-2026 no está abierto para autoevaluación");
  const importActor = remoteMode
    ? await prisma.user.findFirst({
      where: { profile: { code: { in: ["SYSTEM", "ADMIN"] } }, status: { code: "ACTIVO" } },
      orderBy: [{ profile: { code: "asc" } }, { email: "asc" }],
    })
    : null;
  if (remoteMode && !importActor) throw new Error("No existe un usuario SYSTEM o ADMIN activo para registrar la carga excepcional");

  const periodModel = await prisma.periodAssessmentModel.findFirst({
    where: { periodId: period.id, roleId: role.id, active: true },
    include: { modelVersion: { include: { sections: { where: { active: true }, include: { responseScale: { include: { options: { where: { active: true } } } }, dimensions: { where: { active: true }, include: { items: { where: { active: true }, include: { behavior: true, maturityLevel: true, responseScale: { include: { options: { where: { active: true } } } } } } } } } } } } },
  });
  if (!periodModel || periodModel.modelVersion.version !== source.modelVersion || periodModel.modelVersion.status !== "PUBLISHED") throw new Error("La versión ATF del archivo no coincide con la publicada en LOCAL");

  const configuredItems = periodModel.modelVersion.sections.flatMap(section => section.dimensions.flatMap(dimension => dimension.items.map(item => ({ section, dimension, item, scale: item.responseScale ?? section.responseScale }))));
  if (configuredItems.length !== 125) throw new Error(`El modelo ATF publicado tiene ${configuredItems.length} preguntas; se esperaban 125`);
  const itemByKey = new Map(configuredItems.map(entry => [`${entry.section.code}|${entry.dimension.code}|${entry.item.code}`, entry]));
  if (remoteMode) {
    const statusCatalog = await prisma.catalog.upsert({
      where: { code: "ESTADO_AUTOEVALUACION" },
      create: { code: "ESTADO_AUTOEVALUACION", name: "Estado de autoevaluación", active: true },
      update: { active: true },
    });
    await prisma.catalogValue.upsert({
      where: { catalogId_code: { catalogId: statusCatalog.id, code: "ENVIADA" } },
      create: { catalogId: statusCatalog.id, code: "ENVIADA", name: "Enviada", sortOrder: 1, active: true },
      update: { name: "Enviada", sortOrder: 1, active: true },
    });
  }
  const [personStatusId, assignmentStatusId, onboardingStatusId, submittedStatusId] = await Promise.all([
    catalogValueId("ESTADO_PERSONA", "ACTIVO"), catalogValueId("ESTADO_ASIGNACION", "ACTIVO"),
    catalogValueId("ESTADO_ONBOARDING", "NO_APLICA"), catalogValueId("ESTADO_AUTOEVALUACION", "ENVIADA"),
  ]);
  const levelIds = new Map((await prisma.catalogValue.findMany({ where: { catalog: { code: "NIVEL_MADUREZ" }, code: { in: ["POSTULANTE", "PRINCIPIANTE", "OFICIAL"] } }, select: { id: true, code: true } })).map(row => [row.code, row.id]));

  for (const sourcePerson of source.people) {
    const supplied = new Map(sourcePerson.answers.map(answer => [`${answer.sectionCode}|${answer.dimensionCode}|${answer.itemCode}`, answer]));
    if (supplied.size !== configuredItems.length || configuredItems.some(entry => !supplied.has(`${entry.section.code}|${entry.dimension.code}|${entry.item.code}`))) throw new Error(`Las respuestas de ${sourcePerson.dni} no corresponden exactamente al modelo ATF`);
    const person = remoteMode
      ? await prisma.person.findFirst({ where: { dni: sourcePerson.dni } })
      : await prisma.person.upsert({
        where: { dni_companyId: { dni: sourcePerson.dni, companyId: company!.id } },
        create: { dni: sourcePerson.dni, companyId: company!.id, names: sourcePerson.name, email: sourcePerson.email, statusId: personStatusId },
        update: { names: sourcePerson.name, email: sourcePerson.email, statusId: personStatusId },
      });
    if (!person) throw new Error(`No existe la persona con DNI ${sourcePerson.dni} en PRUEBAS`);
    const assignment = remoteMode
      ? (await prisma.personRole.findMany({ where: { personId: person.id, roleId: role.id, status: { code: "ACTIVO" }, developmentPathMode: "STANDARD" }, include: { team: true }, orderBy: { team: { sourceId: "asc" } } }))[0]
      : await prisma.personRole.upsert({
        where: { personId_roleId_teamId: { personId: person.id, roleId: role.id, teamId: team!.id } },
        create: { personId: person.id, roleId: role.id, teamId: team!.id, statusId: assignmentStatusId, onboardingStatusId, developmentPathMode: "STANDARD" },
        update: { statusId: assignmentStatusId, onboardingStatusId, developmentPathMode: "STANDARD" },
      });
    if (!assignment) throw new Error(`El DNI ${sourcePerson.dni} no tiene una asignación ATF activa con ruta de desarrollo`);
    const existing = remoteMode
      ? await prisma.roleSelfAssessment.findFirst({ where: { periodId: period.id, personId: person.id, roleId: role.id, modelVersionId: periodModel.modelVersion.id }, include: { responses: true } })
      : await prisma.roleSelfAssessment.findFirst({ where: { personId: person.id, roleId: role.id, periodId: period.id, modelVersionId: periodModel.modelVersion.id }, include: { responses: true } });
    if (existing && !(existing.responses.length === 125 && existing.responses.every(response => response.comments?.startsWith("Importado desde ")))) throw new Error(`El DNI ${sourcePerson.dni} ya tiene una autoevaluación que no será sobrescrita`);

    const details: { scopeType: "SECTION" | "DIMENSION" | "LEVEL" | "TOTAL"; scopeCode: string; scopeName: string; score: number | null; positiveCount: number | null; responseCount: number; completionPercentage: number | null; weight: number }[] = [];
    let weightedTotal = 0, totalSectionWeight = 0;
    for (const section of periodModel.modelVersion.sections) {
      let weightedSection = 0, totalDimensionWeight = 0;
      for (const dimension of section.dimensions) {
        let weightedDimension = 0, totalItemWeight = 0;
        for (const item of dimension.items) {
          const answer = supplied.get(`${section.code}|${dimension.code}|${item.code}`)!;
          weightedDimension += answer.value * Number(item.weight); totalItemWeight += Number(item.weight);
        }
        const dimensionScore = round4(weightedDimension / totalItemWeight);
        weightedSection += dimensionScore * Number(dimension.weight); totalDimensionWeight += Number(dimension.weight);
        details.push({ scopeType: "DIMENSION", scopeCode: `${section.code}:${dimension.code}`, scopeName: dimension.name, score: dimensionScore, positiveCount: null, responseCount: dimension.items.length, completionPercentage: null, weight: Number(dimension.weight) });
      }
      const sectionScore = round4(weightedSection / totalDimensionWeight);
      weightedTotal += sectionScore * Number(section.weight); totalSectionWeight += Number(section.weight);
      details.push({ scopeType: "SECTION", scopeCode: section.code, scopeName: section.name, score: sectionScore, positiveCount: null, responseCount: section.dimensions.reduce((total, dimension) => total + dimension.items.length, 0), completionPercentage: null, weight: Number(section.weight) });
    }
    const levels = new Map<string, { name: string; positive: number; total: number }>();
    for (const entry of configuredItems) {
      if (!entry.item.maturityLevel) continue;
      const answer = supplied.get(`${entry.section.code}|${entry.dimension.code}|${entry.item.code}`)!;
      const option = entry.scale.options.find(candidate => Number(candidate.numericValue) === answer.value);
      if (!option) throw new Error(`Valor ${answer.value} fuera de escala para ${entry.item.statement}`);
      const current = levels.get(entry.item.maturityLevel.code) ?? { name: entry.item.maturityLevel.name, positive: 0, total: 0 };
      current.total += 1; if (option.isPositive) current.positive += 1; levels.set(entry.item.maturityLevel.code, current);
    }
    for (const [code, value] of levels) details.push({ scopeType: "LEVEL", scopeCode: code, scopeName: value.name, score: null, positiveCount: value.positive, responseCount: value.total, completionPercentage: round4(value.positive / value.total), weight: 1 });
    const score = round4(weightedTotal / totalSectionWeight);
    details.push({ scopeType: "TOTAL", scopeCode: "GLOBAL", scopeName: "Puntaje global", score, positiveCount: null, responseCount: configuredItems.length, completionPercentage: null, weight: 1 });
    const levelCode = score < 1 ? "POSTULANTE" : score < 1.5 ? "PRINCIPIANTE" : "OFICIAL";
    const levelId = levelIds.get(levelCode); if (!levelId) throw new Error(`Falta NIVEL_MADUREZ.${levelCode}`);

    if (existing) {
      for (const detail of details) await prisma.assessmentResultDetail.upsert({
        where: { selfAssessmentId_scopeType_scopeCode: { selfAssessmentId: existing.id, scopeType: detail.scopeType, scopeCode: detail.scopeCode } },
        create: { selfAssessmentId: existing.id, ...detail }, update: detail,
      });
      console.log(`Verificado ${sourcePerson.dni} · ${sourcePerson.name} · ${score.toFixed(4)} · ${levelCode}`);
      continue;
    }

    await prisma.$transaction(async transaction => {
      const assessment = await transaction.roleSelfAssessment.create({ data: {
        personId:person.id,roleId:role.id,personRoleId: assignment.id, periodId: period.id, statusId: submittedStatusId, modelVersionId: periodModel.modelVersion.id,
        configurationVersion: source.modelVersion, calculatedScore: score, submittedAt: new Date(),
        submissionMode: remoteMode ? "ADMIN_ASSISTED" : "SELF",
        submittedById: importActor?.id ?? null,
        assistanceReason: remoteMode ? "Carga excepcional autorizada de autoevaluaciones ATF desde archivo consolidado" : null,
        assistanceMethod: remoteMode ? "IMPORTACION_EXCEL" : null,
        assistedAt: remoteMode ? new Date() : null,
        assistanceNotes: remoteMode ? "Fuente: Consolidado_Evaluacion_ATF_Recalculado (1).xlsx" : null,
        respondentConfirmed: !remoteMode,
        responses: { create: configuredItems.map(entry => {
          const answer = supplied.get(`${entry.section.code}|${entry.dimension.code}|${entry.item.code}`)!;
          const option = entry.scale.options.find(candidate => Number(candidate.numericValue) === answer.value);
          if (!option) throw new Error(`Valor ${answer.value} fuera de escala para ${entry.item.statement}`);
          return { behaviorId: entry.item.behaviorId, itemVersionId: entry.item.id, responseOptionId: option.id, score: answer.value, comments: `Importado desde ${answer.source}`, behaviorStatement: entry.item.statement, behaviorWeight: entry.item.weight, dimensionCode: entry.dimension.code, dimensionName: entry.dimension.name, dimensionWeight: entry.dimension.weight };
        }) }, resultDetails: { create: details },
      } });
      await transaction.roleMaturity.upsert({
        where: { personId_roleId_periodId_modelVersionId: { personId:person.id,roleId:role.id, periodId: period.id, modelVersionId: periodModel.modelVersion.id } },
        create: { personId:person.id,roleId:role.id,personRoleId: assignment.id, periodId: period.id, modelVersionId: periodModel.modelVersion.id, selfAssessmentId: assessment.id, evaluatedAt: new Date(), score, selfAssessmentScore: score, levelId },
        update: { selfAssessmentId: assessment.id, evaluatedAt: new Date(), score, selfAssessmentScore: score, calibratedScore: null, calibratedAt: null, calibratedById: null, calibrationComments: null, levelId },
      });
      if (remoteMode) await transaction.audit.create({ data: {
        occurredAt: new Date(), userId: importActor!.id, action: "IMPORT_ASSISTED_ASSESSMENT",
        entity: "ROLE_SELF_ASSESSMENT", recordId: assessment.id,
        newValue: { personId: person.id, dni: sourcePerson.dni, roleId: role.id, periodId: period.id, modelVersion: source.modelVersion, score, responseCount: configuredItems.length },
        result: "OK", origin: "AUTHORIZED_EXCEL_IMPORT",
      } });
    });
    console.log(`Importado ${sourcePerson.dni} · ${sourcePerson.name} · ${score.toFixed(4)} · ${levelCode}`);
  }

  if (remoteMode) {
    const calibrationStatus = await prisma.catalogValue.findFirst({
      where: { code: "CALIBRACION", active: true, catalog: { code: "ESTADO_PERIODO_MADUREZ", active: true } },
      select: { id: true },
    });
    if (!calibrationStatus) throw new Error("Falta configurar ESTADO_PERIODO_MADUREZ.CALIBRACION");
    await prisma.$transaction(async transaction => {
      await transaction.period.update({ where: { id: period.id }, data: { statusId: calibrationStatus.id, active: true } });
      await transaction.audit.create({ data: {
        occurredAt: new Date(), userId: importActor!.id, action: "REOPEN_FOR_CALIBRATION",
        entity: "MATURITY_PERIOD", recordId: period.id,
        oldValue: { code: period.code, status: period.status.code, active: period.active },
        newValue: { code: period.code, status: "CALIBRACION", active: true, reason: "Carga excepcional autorizada de autoevaluaciones ATF" },
        result: "OK", origin: "AUTHORIZED_EXCEL_IMPORT",
      } });
    });
    console.log(`Período ${period.code} habilitado para calibración`);
  }
}

main().finally(async () => prisma.$disconnect());
