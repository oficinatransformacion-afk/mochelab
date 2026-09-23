import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { postgresOptions } from "../src/database/postgres-options";
import { assertSafeDatabaseWrite } from "../src/database/environment-guard";

config({ path: resolve(process.cwd(), "../../.env.local"), quiet: true });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL no configurada");
const databaseName = assertSafeDatabaseWrite(databaseUrl, "seed");
if (databaseName !== "mochelab_local") throw new Error(`Esta importación solo puede ejecutarse en mochelab_local, no en ${databaseName}`);
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
    prisma.company.findUnique({ where: { code: "DEMO_DANPER" } }),
    prisma.team.findUnique({ where: { sourceId: "DEMO-TEAM-001" } }),
    prisma.role.findUnique({ where: { sourceId: "MAT-07" } }),
    prisma.period.findUnique({ where: { code: "LOCAL-MAD-2026" }, include: { status: true } }),
  ]);
  if (!company || !team || !role || !period) throw new Error("Falta la configuración local de empresa, equipo, rol ATF o período");
  if (period.status.code !== "AUTOEVALUACION") throw new Error("LOCAL-MAD-2026 no está abierto para autoevaluación");

  const periodModel = await prisma.periodAssessmentModel.findUnique({
    where: { periodId_roleId: { periodId: period.id, roleId: role.id } },
    include: { modelVersion: { include: { sections: { where: { active: true }, include: { responseScale: { include: { options: { where: { active: true } } } }, dimensions: { where: { active: true }, include: { items: { where: { active: true }, include: { behavior: true, maturityLevel: true, responseScale: { include: { options: { where: { active: true } } } } } } } } } } } } },
  });
  if (!periodModel || periodModel.modelVersion.version !== source.modelVersion || periodModel.modelVersion.status !== "PUBLISHED") throw new Error("La versión ATF del archivo no coincide con la publicada en LOCAL");

  const configuredItems = periodModel.modelVersion.sections.flatMap(section => section.dimensions.flatMap(dimension => dimension.items.map(item => ({ section, dimension, item, scale: item.responseScale ?? section.responseScale }))));
  if (configuredItems.length !== 125) throw new Error(`El modelo ATF publicado tiene ${configuredItems.length} preguntas; se esperaban 125`);
  const itemByKey = new Map(configuredItems.map(entry => [`${entry.section.code}|${entry.dimension.code}|${entry.item.code}`, entry]));
  const [personStatusId, assignmentStatusId, onboardingStatusId, submittedStatusId] = await Promise.all([
    catalogValueId("ESTADO_PERSONA", "ACTIVO"), catalogValueId("ESTADO_ASIGNACION", "ACTIVO"),
    catalogValueId("ESTADO_ONBOARDING", "NO_APLICA"), catalogValueId("ESTADO_AUTOEVALUACION", "ENVIADA"),
  ]);
  const levelIds = new Map((await prisma.catalogValue.findMany({ where: { catalog: { code: "NIVEL_MADUREZ" }, code: { in: ["POSTULANTE", "PRINCIPIANTE", "OFICIAL"] } }, select: { id: true, code: true } })).map(row => [row.code, row.id]));

  for (const sourcePerson of source.people) {
    const supplied = new Map(sourcePerson.answers.map(answer => [`${answer.sectionCode}|${answer.dimensionCode}|${answer.itemCode}`, answer]));
    if (supplied.size !== configuredItems.length || configuredItems.some(entry => !supplied.has(`${entry.section.code}|${entry.dimension.code}|${entry.item.code}`))) throw new Error(`Las respuestas de ${sourcePerson.dni} no corresponden exactamente al modelo ATF`);
    const person = await prisma.person.upsert({
      where: { dni_companyId: { dni: sourcePerson.dni, companyId: company.id } },
      create: { dni: sourcePerson.dni, companyId: company.id, names: sourcePerson.name, email: sourcePerson.email, statusId: personStatusId },
      update: { names: sourcePerson.name, email: sourcePerson.email, statusId: personStatusId },
    });
    const assignment = await prisma.personRole.upsert({
      where: { personId_roleId_teamId: { personId: person.id, roleId: role.id, teamId: team.id } },
      create: { personId: person.id, roleId: role.id, teamId: team.id, statusId: assignmentStatusId, onboardingStatusId, developmentPathMode: "STANDARD" },
      update: { statusId: assignmentStatusId, onboardingStatusId, developmentPathMode: "STANDARD" },
    });
    const existing = await prisma.roleSelfAssessment.findUnique({ where: { personRoleId_periodId: { personRoleId: assignment.id, periodId: period.id } }, include: { responses: true } });
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
        personRoleId: assignment.id, periodId: period.id, statusId: submittedStatusId, modelVersionId: periodModel.modelVersion.id,
        configurationVersion: source.modelVersion, calculatedScore: score, submittedAt: new Date(),
        responses: { create: configuredItems.map(entry => {
          const answer = supplied.get(`${entry.section.code}|${entry.dimension.code}|${entry.item.code}`)!;
          const option = entry.scale.options.find(candidate => Number(candidate.numericValue) === answer.value);
          if (!option) throw new Error(`Valor ${answer.value} fuera de escala para ${entry.item.statement}`);
          return { behaviorId: entry.item.behaviorId, itemVersionId: entry.item.id, responseOptionId: option.id, score: answer.value, comments: `Importado desde ${answer.source}`, behaviorStatement: entry.item.statement, behaviorWeight: entry.item.weight, dimensionCode: entry.dimension.code, dimensionName: entry.dimension.name, dimensionWeight: entry.dimension.weight };
        }) }, resultDetails: { create: details },
      } });
      await transaction.roleMaturity.upsert({
        where: { personRoleId_periodId: { personRoleId: assignment.id, periodId: period.id } },
        create: { personRoleId: assignment.id, periodId: period.id, selfAssessmentId: assessment.id, evaluatedAt: new Date(), score, selfAssessmentScore: score, levelId },
        update: { selfAssessmentId: assessment.id, evaluatedAt: new Date(), score, selfAssessmentScore: score, calibratedScore: null, calibratedAt: null, calibratedById: null, calibrationComments: null, levelId },
      });
    });
    console.log(`Importado ${sourcePerson.dni} · ${sourcePerson.name} · ${score.toFixed(4)} · ${levelCode}`);
  }
}

main().finally(async () => prisma.$disconnect());
