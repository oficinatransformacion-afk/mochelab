import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type AssessmentSectionType } from "@prisma/client";
import { postgresOptions } from "../src/database/postgres-options";
import { assertSafeDatabaseWrite } from "../src/database/environment-guard";

const developmentMode = process.argv.includes("--confirm-development");
const productionMode = process.argv.includes("--confirm-production");
if (developmentMode && productionMode) throw new Error("Seleccione solo un entorno remoto");
const remoteMode = developmentMode || productionMode;
const allRoles = process.argv.includes("--all-roles");
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

const prisma = new PrismaClient({ adapter: new PrismaPg(postgresOptions(databaseUrl)) });

type ItemDefinition = { code: string; statement: string; level?: string; maturityLevel?: string };
type DimensionDefinition = { code: string; name: string; items: ItemDefinition[] };
type SectionDefinition = { code: string; name: string; type: AssessmentSectionType; weight: number; scale: string; dimensions: DimensionDefinition[] };
type RoleDefinition = { sourceId: string; name: string; sections: SectionDefinition[] };
type ModelFile = { version: string; roles: RoleDefinition[] };

const officialRoleSourceIds: Record<string, string> = {
  "MAT-01": "1",
  "MAT-02": "2",
  "MAT-03": "3",
  "MAT-04": "4",
  "MAT-05": "5",
  "MAT-06": "5",
  "MAT-07": "6",
};

const scaleDefinitions = [
  { code: "FREQUENCY_0_2", name: "Frecuencia 0 a 2", options: [["NEVER", "Nunca", 0, false], ["SOMETIMES", "A veces", 1, false], ["ALWAYS", "Siempre", 2, true]] },
  { code: "BINARY_COMPLIANCE", name: "Cumplimiento binario", options: [["NO", "No", 0, false], ["YES", "Sí", 2, true]] },
  { code: "COMPETENCY_0_2", name: "Competencia 0 a 2", options: [["LOW", "Bajo", 0, false], ["DEVELOPING", "En desarrollo", 1, false], ["CONSOLIDATED", "Consolidado", 2, true]] },
] as const;

async function catalogValueId(catalogCode: string, valueCode: string) {
  const value = await prisma.catalogValue.findFirst({ where: { code: valueCode, catalog: { code: catalogCode } }, select: { id: true } });
  if (!value) throw new Error(`Falta configurar ${catalogCode}.${valueCode}`);
  return value.id;
}

async function main() {
  const source = JSON.parse(await readFile(resolve(process.cwd(), "prisma/data/maturity-models.local.json"), "utf8")) as ModelFile;
  const roleDefinitions = remoteMode && !allRoles ? source.roles.filter(role => role.name === "ATF") : source.roles;
  if (remoteMode && !allRoles && roleDefinitions.length !== 1) throw new Error("No se encontró exactamente una definición ATF");
  const [roleTypeId, roleStatusId, assignmentStatusId, onboardingStatusId, periodStatusId] = await Promise.all([
    catalogValueId("TIPO_ROL", "3_OPERATIVO"), catalogValueId("ESTADO_ROL", "ACTIVO"),
    catalogValueId("ESTADO_ASIGNACION", "ACTIVO"), catalogValueId("ESTADO_ONBOARDING", "NO_APLICA"),
    remoteMode ? Promise.resolve(null) : catalogValueId("ESTADO_PERIODO_MADUREZ", "AUTOEVALUACION"),
  ]);
  if (remoteMode) {
    const maturityCatalog = await prisma.catalog.findUnique({ where: { code: "NIVEL_MADUREZ" }, select: { id: true } });
    if (!maturityCatalog) throw new Error("Falta el catálogo NIVEL_MADUREZ");
    await prisma.catalogValue.upsert({
      where: { catalogId_code: { catalogId: maturityCatalog.id, code: "MAESTRO" } },
      create: { catalogId: maturityCatalog.id, code: "MAESTRO", name: "4.MAESTRO", sortOrder: 4, active: true },
      update: { name: "4.MAESTRO", sortOrder: 4, active: true },
    });
  }
  const maturityLevels = new Map((await prisma.catalogValue.findMany({ where: { catalog: { code: "NIVEL_MADUREZ" } }, select: { id: true, code: true } })).map(value => [value.code, value.id]));

  const scales = new Map<string, string>();
  for (const definition of scaleDefinitions) {
    const scale = await prisma.responseScale.upsert({
      where: { code: definition.code }, create: { code: definition.code, name: definition.name },
      update: { name: definition.name, active: true },
    });
    scales.set(definition.code, scale.id);
    for (const [code, label, numericValue, isPositive] of definition.options) {
      await prisma.responseOption.upsert({
        where: { scaleId_code: { scaleId: scale.id, code } },
        create: { scaleId: scale.id, code, label, numericValue, isPositive, sortOrder: numericValue },
        update: { label, numericValue, isPositive, sortOrder: numericValue, active: true },
      });
    }
  }

  let person = null;
  let team = null;
  if (!remoteMode) {
    const user = await prisma.user.findUnique({ where: { email: "usuario.prueba@example.invalid" }, include: { person: true, teams: true } });
    person = user?.person ?? await prisma.person.findFirst({ where: { status: { code: "ACTIVO" } }, orderBy: { createdAt: "asc" } });
    team = user?.teams[0] ? await prisma.team.findUnique({ where: { id: user.teams[0].teamId } }) : await prisma.team.findFirst({ where: { status: { code: "ACTIVO" } }, orderBy: { createdAt: "asc" } });
    if (!person || !team) throw new Error("No existe una persona o equipo local para habilitar la prueba");
    if (user && !user.personId) await prisma.user.update({ where: { id: user.id }, data: { personId: person.id } });
    const legacyDemoRole = await prisma.role.findUnique({ where: { sourceId: "DEMO-ROL-001" }, select: { id: true } });
    if (legacyDemoRole) await prisma.personRole.updateMany({
      where: { personId: person.id, roleId: legacyDemoRole.id },
      data: { developmentPathMode: "EXEMPT", developmentExclusionReason: "Fuera del piloto local de modelos de madurez" },
    });
  }

  const period = remoteMode
    ? await prisma.period.findUnique({ where: { code: "202608" } })
    : await prisma.period.upsert({
      where: { code: "LOCAL-MAD-2026" },
      create: { code: "LOCAL-MAD-2026", name: "Calibración de modelos 2026 (LOCAL)", startDate: new Date("2026-09-01"), endDate: new Date("2026-12-31"), selfAssessmentOpensAt: new Date("2026-09-01T05:00:00Z"), selfAssessmentClosesAt: new Date("2026-12-31T05:00:00Z"), configurationVersion: source.version, statusId: periodStatusId!, active: true },
      update: { name: "Calibración de modelos 2026 (LOCAL)", configurationVersion: source.version },
    });
  if (!period) throw new Error("No existe el período 202608 en PRUEBAS");

  for (const [roleIndex, definition] of roleDefinitions.entries()) {
    const sourceRoleId = remoteMode
      ? officialRoleSourceIds[definition.sourceId]
      : definition.sourceId;
    const role = remoteMode
      ? await prisma.role.findFirst({ where: sourceRoleId ? { sourceId: sourceRoleId } : { name: { equals: "ATF", mode: "insensitive" } } })
      : await prisma.role.upsert({
        where: { sourceId: definition.sourceId },
        create: { sourceId: definition.sourceId, name: definition.name, typeId: roleTypeId, statusId: roleStatusId },
        update: { name: definition.name, typeId: roleTypeId, statusId: roleStatusId },
      });
    if (!role) throw new Error("No existe el rol ATF en PRUEBAS");
    if (!remoteMode && person && team) await prisma.personRole.upsert({
      where: { personId_roleId_teamId: { personId: person.id, roleId: role.id, teamId: team.id } },
      create: { personId: person.id, roleId: role.id, teamId: team.id, statusId: assignmentStatusId, onboardingStatusId },
      update: { statusId: assignmentStatusId, onboardingStatusId },
    });
    const modelCode = `MODEL_${definition.sourceId}`;
    const existingModel = await prisma.assessmentModel.findUnique({ where: { code: modelCode } });
    const model = existingModel
      ? await prisma.assessmentModel.update({ where: { id: existingModel.id }, data: { roleId: role.id, name: `Modelo de madurez - ${definition.name}`, active: true } })
      : await prisma.assessmentModel.create({ data: { roleId: role.id, code: modelCode, name: `Modelo de madurez - ${definition.name}` } });
    const version = await prisma.assessmentModelVersion.upsert({
      where: { assessmentModelId_version: { assessmentModelId: model.id, version: source.version } },
      create: { assessmentModelId: model.id, version: source.version, status: "PUBLISHED", publishedAt: new Date(), validFrom: new Date("2026-09-01") },
      update: { status: "PUBLISHED", publishedAt: new Date(), validFrom: new Date("2026-09-01"), validTo: null },
    });

    for (const [sectionIndex, sectionDefinition] of definition.sections.entries()) {
      const responseScaleId = scales.get(sectionDefinition.scale);
      if (!responseScaleId) throw new Error(`Escala desconocida: ${sectionDefinition.scale}`);
      const section = await prisma.assessmentSection.upsert({
        where: { modelVersionId_code: { modelVersionId: version.id, code: sectionDefinition.code } },
        create: { modelVersionId: version.id, responseScaleId, code: sectionDefinition.code, name: sectionDefinition.name, type: sectionDefinition.type, weight: sectionDefinition.weight, sortOrder: sectionIndex },
        update: { responseScaleId, name: sectionDefinition.name, type: sectionDefinition.type, weight: sectionDefinition.weight, sortOrder: sectionIndex, active: true },
      });
      for (const [dimensionIndex, dimensionDefinition] of sectionDefinition.dimensions.entries()) {
        const stableDimensionCode = `${definition.sourceId}_${sectionDefinition.code}_${dimensionDefinition.code}`.slice(0, 80);
        const legacyDimension = await prisma.maturityDimension.upsert({
          where: { code: stableDimensionCode },
          create: { code: stableDimensionCode, name: dimensionDefinition.name, weight: 1, sortOrder: roleIndex * 100 + sectionIndex * 20 + dimensionIndex },
          update: { name: dimensionDefinition.name, weight: 1, active: true },
        });
        const dimension = await prisma.assessmentDimensionVersion.upsert({
          where: { sectionId_code: { sectionId: section.id, code: dimensionDefinition.code } },
          create: { sectionId: section.id, code: dimensionDefinition.code, name: dimensionDefinition.name, weight: 1, sortOrder: dimensionIndex },
          update: { name: dimensionDefinition.name, weight: 1, sortOrder: dimensionIndex, active: true },
        });
        for (const [itemIndex, itemDefinition] of dimensionDefinition.items.entries()) {
          const behaviorCode = `${definition.sourceId}_${sectionDefinition.code}_${dimensionDefinition.code}_${itemDefinition.code}`.slice(0, 100);
          const behavior = await prisma.observableBehavior.upsert({
            where: { code: behaviorCode },
            create: { dimensionId: legacyDimension.id, code: behaviorCode, statement: itemDefinition.statement, weight: 1, sortOrder: itemIndex },
            update: { dimensionId: legacyDimension.id, statement: itemDefinition.statement, weight: 1, sortOrder: itemIndex, active: true },
          });
          await prisma.observableBehaviorRole.upsert({
            where: { behaviorId_roleId: { behaviorId: behavior.id, roleId: role.id } },
            create: { behaviorId: behavior.id, roleId: role.id }, update: { active: true },
          });
          const maturityLevelCode = itemDefinition.maturityLevel ?? itemDefinition.level;
          const maturityLevelId = maturityLevelCode ? maturityLevels.get(maturityLevelCode) : undefined;
          if (maturityLevelCode && !maturityLevelId) throw new Error(`Nivel desconocido: ${maturityLevelCode}`);
          await prisma.assessmentItemVersion.upsert({
            where: { dimensionId_code: { dimensionId: dimension.id, code: itemDefinition.code } },
            create: { dimensionId: dimension.id, behaviorId: behavior.id, maturityLevelId, code: itemDefinition.code, statement: itemDefinition.statement, weight: 1, required: true, sortOrder: itemIndex },
            update: { behaviorId: behavior.id, maturityLevelId, statement: itemDefinition.statement, weight: 1, required: true, sortOrder: itemIndex, active: true },
          });
        }
      }
    }
    await prisma.periodAssessmentModel.upsert({
      where: { periodId_modelVersionId: { periodId: period.id, modelVersionId: version.id } },
      create: { periodId: period.id, roleId: role.id, modelVersionId: version.id },
      update: { modelVersionId: version.id, active: true },
    });
  }

  console.log(`${productionMode ? "PRODUCCIÓN" : developmentMode ? "PRUEBAS" : "LOCAL"} listo: ${roleDefinitions.length} modelo(s) publicado(s) en ${period.code}${person ? ` para ${person.names}` : ""}.`);
}

main().finally(async () => prisma.$disconnect());
