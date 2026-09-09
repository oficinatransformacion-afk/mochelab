import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { postgresOptions } from "../src/database/postgres-options";

config({ path: resolve(process.cwd(), "../../.env"), quiet: true });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL no configurada");

const prisma = new PrismaClient({ adapter: new PrismaPg(postgresOptions(databaseUrl)) });

const catalogs = [
  {
    code: "PERFIL_USUARIO",
    name: "Perfil de usuario",
    values: [
      ["USUARIO", "Usuario"],
      ["ADMIN", "Admin"],
      ["SYSTEM", "System"],
    ],
  },
  {
    code: "ESTADO_USUARIO",
    name: "Estado de usuario",
    values: [["ACTIVO", "Activo"], ["INACTIVO", "Inactivo"]],
  },
  {
    code: "ESTADO_PERIODO_MADUREZ",
    name: "Estado del período de madurez",
    values: [
      ["PLANIFICADO", "Planificado"],
      ["AUTOEVALUACION", "Autoevaluación abierta"],
      ["CALIBRACION", "En calibración"],
      ["CERRADO", "Cerrado"],
      ["CANCELADO", "Cancelado"],
    ],
  },
  {
    code: "ESTADO_AUTOEVALUACION",
    name: "Estado de autoevaluación",
    values: [
      ["BORRADOR", "Borrador"],
      ["ENVIADA", "Enviada"],
      ["CALIBRADA", "Calibrada"],
      ["ANULADA", "Anulada"],
    ],
  },
  {
    code: "NIVEL_MADUREZ",
    name: "Nivel de madurez",
    values: [
      ["POSTULANTE", "Postulante"],
      ["PRINCIPIANTE", "Principiante"],
      ["OFICIAL", "Oficial"],
      ["MAESTRO", "Maestro"],
    ],
  },
  {
    code: "AREA_EJECUCION_INICIATIVA",
    name: "Área de ejecución de iniciativa",
    values: [
      ["AGRICOLA", "Agrícola"],
      ["OPC", "OPC"],
      ["ACOPIO_TRUJILLO", "Acopio Trujillo"],
      ["NAVE_01", "Nave 01"],
      ["NAVE_02", "Nave 02"],
      ["NAVE_03", "Nave 03"],
      ["NAVE_04", "Nave 04"],
      ["NAVE_05", "Nave 05"],
      ["NAVE_06", "Nave 06"],
      ["NAVE_09", "NAVE 09"],
      ["NAVE_10", "Nave 10"],
      ["NAVE_12", "Nave 12"],
      ["APT_TRUJILLO", "APT Trujillo"],
      ["APT_AREQUIPA", "APT Arequipa"],
    ],
  },
] as const;

const modules = [
  ["INICIO", "Inicio", "/", "home", 10],
  ["PERSONAS", "Personas", "/personas", "users", 20],
  ["ASIGNACIONES", "Asignaciones", "/asignaciones", "clipboard-list", 25],
  ["EQUIPOS", "Equipos", "/equipos", "users-round", 30],
  ["CURSOS", "Cursos", "/cursos", "book-open", 40],
  ["MADUREZ", "Madurez", "/madurez", "gauge", 50],
  ["OBJETIVOS", "Objetivos", "/objetivos", "target", 60],
  ["PORTAFOLIO", "Portafolio", "/portafolio", "briefcase-business", 70],
  ["CATALOGOS", "Catálogos", "/configuracion/catalogos", "list", 80],
  ["USUARIOS", "Usuarios", "/configuracion/usuarios", "user-cog", 90],
  ["MIGRACIONES", "Migraciones", "/configuracion/migraciones", "database", 100],
  ["AUDITORIA", "Auditoría", "/configuracion/auditoria", "history", 110],
] as const;

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(current);
      current = "";
    } else current += character;
  }
  values.push(current);
  return values;
}

async function seedCatalogs() {
  const ids = new Map<string, string>();
  for (const definition of catalogs) {
    const catalog = await prisma.catalog.upsert({
      where: { code: definition.code },
      create: { code: definition.code, name: definition.name },
      update: { name: definition.name, active: true },
    });
    ids.set(definition.code, catalog.id);
    for (const [index, [code, name]] of definition.values.entries()) {
      await prisma.catalogValue.upsert({
        where: { catalogId_code: { catalogId: catalog.id, code } },
        create: { catalogId: catalog.id, code, name, sortOrder: (index + 1) * 10 },
        update: { name, sortOrder: (index + 1) * 10, active: true },
      });
    }
  }
  return ids;
}

async function seedUnits() {
  const catalog = await prisma.catalog.upsert({
    where: { code: "UNIDAD_KR" },
    create: { code: "UNIDAD_KR", name: "Unidad de resultado clave" },
    update: { active: true },
  });
  const content = await readFile(resolve(process.cwd(), "../../database/seeds/unidad_kr_catalogo.csv"), "utf8");
  for (const line of content.replace(/^\uFEFF/, "").split(/\r?\n/).slice(1).filter(Boolean)) {
    const [code, name, description, order, state] = parseCsvLine(line);
    await prisma.catalogValue.upsert({
      where: { catalogId_code: { catalogId: catalog.id, code } },
      create: { catalogId: catalog.id, code, name, description, sortOrder: Number(order), active: state === "ACTIVO" },
      update: { name, description, sortOrder: Number(order), active: state === "ACTIVO" },
    });
  }
}

async function seedPreparedCatalogs() {
  const path = resolve(
    process.cwd(),
    "../../database/staging/test-3bc268566e0e/prepared/catalog_values.csv",
  );
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch {
    return;
  }
  for (const line of content.replace(/^\uFEFF/, "").split(/\r?\n/).slice(1).filter(Boolean)) {
    const [catalogCode, code, name, sourceCount, active] = parseCsvLine(line);
    const catalog = await prisma.catalog.upsert({
      where: { code: catalogCode },
      create: { code: catalogCode, name: catalogCode.toLocaleLowerCase().replaceAll("_", " ") },
      update: { active: true },
    });
    await prisma.catalogValue.upsert({
      where: { catalogId_code: { catalogId: catalog.id, code } },
      create: {
        catalogId: catalog.id,
        code,
        name,
        active: active.toLowerCase() === "true",
        metadata: { sourceCount: Number(sourceCount) },
      },
      update: {
        name,
        active: active.toLowerCase() === "true",
        metadata: { sourceCount: Number(sourceCount) },
      },
    });
  }
}

async function seedModules() {
  const profiles = await prisma.catalogValue.findMany({
    where: { catalog: { code: "PERFIL_USUARIO" }, code: { in: ["USUARIO", "ADMIN", "SYSTEM"] } },
  });
  for (const [code, name, route, icon, sortOrder] of modules) {
    const module = await prisma.systemModule.upsert({
      where: { code },
      create: { code, name, route, icon, sortOrder },
      update: { name, route, icon, sortOrder, active: true },
    });
    for (const profile of profiles) {
      const administrator = profile.code === "ADMIN" || profile.code === "SYSTEM";
      const writable = ["ASIGNACIONES", "MADUREZ", "OBJETIVOS", "PORTAFOLIO"].includes(code);
      const visible = administrator || !["CATALOGOS", "USUARIOS", "MIGRACIONES", "AUDITORIA"].includes(code);
      await prisma.profileModule.upsert({
        where: { profileId_moduleId: { profileId: profile.id, moduleId: module.id } },
        create: {
          profileId: profile.id, moduleId: module.id, canView: visible,
          canCreate: code !== "INICIO" && (administrator || writable),
          canEdit: code !== "INICIO" && (administrator || writable),
          canDelete: administrator && !["INICIO", "AUDITORIA"].includes(code),
        },
        update: {
          canView: visible,
          canCreate: code !== "INICIO" && (administrator || writable),
          canEdit: code !== "INICIO" && (administrator || writable),
          canDelete: administrator && !["INICIO", "AUDITORIA"].includes(code),
        },
      });
    }
  }
}

async function catalogValue(catalogCode: string, valueCode: string) {
  const value = await prisma.catalogValue.findFirst({
    where: { code: valueCode, catalog: { code: catalogCode } },
  });
  if (!value) throw new Error(`Falta ${catalogCode}.${valueCode}`);
  return value;
}

async function seedRepresentativeData() {
  const [activePerson, roleType, activeRole, activeTeam, activeAssignment, onboardingDone,
    courseModule, activeCourse, courseDone, periodStatus, submittedStatus, officialLevel,
    adminProfile, userProfile, systemProfile, activeUser] = await Promise.all([
    catalogValue("ESTADO_PERSONA", "ACTIVO"),
    catalogValue("TIPO_ROL", "3_OPERATIVO"),
    catalogValue("ESTADO_ROL", "ACTIVO"),
    catalogValue("ESTADO_EQUIPO", "ACTIVO"),
    catalogValue("ESTADO_ASIGNACION", "ACTIVO"),
    catalogValue("ESTADO_ONBOARDING", "TERMINADO"),
    catalogValue("MODULO_CURSO", "1_POSTULANTE"),
    catalogValue("ESTADO_CURSO", "ACTIVO"),
    catalogValue("ESTADO_PERSONA_CURSO", "TERMINADO"),
    catalogValue("ESTADO_PERIODO_MADUREZ", "CALIBRACION"),
    catalogValue("ESTADO_AUTOEVALUACION", "ENVIADA"),
    catalogValue("NIVEL_MADUREZ", "OFICIAL"),
    catalogValue("PERFIL_USUARIO", "ADMIN"),
    catalogValue("PERFIL_USUARIO", "USUARIO"),
    catalogValue("PERFIL_USUARIO", "SYSTEM"),
    catalogValue("ESTADO_USUARIO", "ACTIVO"),
  ]);

  const company = await prisma.company.upsert({
    where: { code: "DEMO_DANPER" },
    create: { code: "DEMO_DANPER", name: "DANPER TRUJILLO SAC (PRUEBA)" },
    update: { name: "DANPER TRUJILLO SAC (PRUEBA)", active: true },
  });
  const program = await prisma.program.upsert({
    where: { code: "DEMO_AGILIDAD" },
    create: { code: "DEMO_AGILIDAD", name: "Programa de agilidad (PRUEBA)" },
    update: { name: "Programa de agilidad (PRUEBA)", active: true },
  });
  let unit = await prisma.organizationalUnit.findFirst({
    where: { unitType: "UNIDAD", code: "DEMO_OPERACIONES", companyId: company.id },
  });
  unit ??= await prisma.organizationalUnit.create({
    data: { unitType: "UNIDAD", code: "DEMO_OPERACIONES", name: "Operaciones (PRUEBA)", companyId: company.id },
  });
  const team = await prisma.team.upsert({
    where: { sourceId: "DEMO-TEAM-001" },
    create: { sourceId: "DEMO-TEAM-001", unitId: unit.id, programId: program.id, statusId: activeTeam.id },
    update: { unitId: unit.id, programId: program.id, statusId: activeTeam.id },
  });
  const role = await prisma.role.upsert({
    where: { sourceId: "DEMO-ROL-001" },
    create: { sourceId: "DEMO-ROL-001", name: "Facilitador ágil (PRUEBA)", typeId: roleType.id, statusId: activeRole.id },
    update: { name: "Facilitador ágil (PRUEBA)", typeId: roleType.id, statusId: activeRole.id },
  });
  const person = await prisma.person.upsert({
    where: { dni_companyId: { dni: "DEMO0001", companyId: company.id } },
    create: { dni: "DEMO0001", companyId: company.id, names: "Persona de prueba", email: "persona.prueba@example.invalid", organizationalUnitId: unit.id, statusId: activePerson.id },
    update: { names: "Persona de prueba", organizationalUnitId: unit.id, statusId: activePerson.id },
  });
  const assignment = await prisma.personRole.upsert({
    where: { personId_roleId_teamId: { personId: person.id, roleId: role.id, teamId: team.id } },
    create: { personId: person.id, roleId: role.id, teamId: team.id, statusId: activeAssignment.id, onboardingStatusId: onboardingDone.id },
    update: { statusId: activeAssignment.id, onboardingStatusId: onboardingDone.id },
  });
  const course = await prisma.course.upsert({
    where: { sourceId: "DEMO-CURSO-001" },
    create: { sourceId: "DEMO-CURSO-001", name: "Fundamentos del rol (PRUEBA)", moduleId: courseModule.id, statusId: activeCourse.id },
    update: { name: "Fundamentos del rol (PRUEBA)", moduleId: courseModule.id, statusId: activeCourse.id },
  });
  await prisma.roleCourse.upsert({
    where: { roleId_courseId: { roleId: role.id, courseId: course.id } },
    create: { roleId: role.id, courseId: course.id }, update: { active: true },
  });
  await prisma.personCourse.upsert({
    where: { personRoleId_courseId: { personRoleId: assignment.id, courseId: course.id } },
    create: { personRoleId: assignment.id, courseId: course.id, statusId: courseDone.id, score: 18 },
    update: { statusId: courseDone.id, score: 18 },
  });
  const period = await prisma.period.upsert({
    where: { code: "DEMO-2026" },
    create: { code: "DEMO-2026", name: "Periodo demostrativo 2026", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), configurationVersion: "demo-v1", statusId: periodStatus.id },
    update: { name: "Periodo demostrativo 2026", configurationVersion: "demo-v1", statusId: periodStatus.id },
  });
  const dimension = await prisma.maturityDimension.upsert({
    where: { code: "DEMO_COLABORACION" },
    create: { code: "DEMO_COLABORACION", name: "Colaboración (PRUEBA)", description: "Dimensión demostrativa", sortOrder: 10 },
    update: { name: "Colaboración (PRUEBA)", active: true },
  });
  const behavior = await prisma.observableBehavior.upsert({
    where: { code: "DEMO_COLAB_01" },
    create: { code: "DEMO_COLAB_01", dimensionId: dimension.id, statement: "Facilita acuerdos y da seguimiento a los compromisos del equipo.", helpText: "Comportamiento de prueba", sortOrder: 10 },
    update: { dimensionId: dimension.id, statement: "Facilita acuerdos y da seguimiento a los compromisos del equipo.", active: true },
  });
  await prisma.observableBehaviorRole.upsert({
    where: { behaviorId_roleId: { behaviorId: behavior.id, roleId: role.id } },
    create: { behaviorId: behavior.id, roleId: role.id }, update: { active: true },
  });
  const assessment = await prisma.roleSelfAssessment.upsert({
    where: { personRoleId_periodId: { personRoleId: assignment.id, periodId: period.id } },
    create: { personRoleId: assignment.id, periodId: period.id, statusId: submittedStatus.id, calculatedScore: 2, configurationVersion: "demo-v1", submittedAt: new Date("2026-09-01T15:00:00Z") },
    update: { statusId: submittedStatus.id, calculatedScore: 2, configurationVersion: "demo-v1" },
  });
  await prisma.selfAssessmentResponse.upsert({
    where: { selfAssessmentId_behaviorId: { selfAssessmentId: assessment.id, behaviorId: behavior.id } },
    create: { selfAssessmentId: assessment.id, behaviorId: behavior.id, score: 2, comments: "Ejemplo enviado para revisión y calibración.", behaviorStatement: behavior.statement, behaviorWeight: behavior.weight, dimensionCode: dimension.code, dimensionName: dimension.name, dimensionWeight: dimension.weight },
    update: { score: 2, comments: "Ejemplo enviado para revisión y calibración." },
  });
  await prisma.teamMaturity.upsert({
    where: { teamId_periodId: { teamId: team.id, periodId: period.id } },
    create: { teamId: team.id, periodId: period.id, evaluatedAt: new Date("2026-09-01"), score: 2, levelId: officialLevel.id, comments: "Dato representativo" },
    update: { score: 2, levelId: officialLevel.id },
  });
  const admin = await prisma.user.upsert({
    where: { email: "admin.prueba@example.invalid" },
    create: { email: "admin.prueba@example.invalid", name: "Admin de prueba", profileId: adminProfile.id, statusId: activeUser.id },
    update: { profileId: adminProfile.id, statusId: activeUser.id },
  });
  await prisma.user.upsert({
    where: { email: "system.prueba@example.invalid" },
    create: { email: "system.prueba@example.invalid", name: "System de prueba", profileId: systemProfile.id, statusId: activeUser.id },
    update: { profileId: systemProfile.id, statusId: activeUser.id },
  });
  await prisma.userTeam.upsert({
    where: { userId_teamId: { userId: admin.id, teamId: team.id } },
    create: { userId: admin.id, teamId: team.id }, update: {},
  });
  const demoUser = await prisma.user.upsert({
    where: { email: "usuario.prueba@example.invalid" },
    create: { email: "usuario.prueba@example.invalid", name: "Usuario de prueba", profileId: userProfile.id, statusId: activeUser.id, personId: person.id },
    update: { profileId: userProfile.id, statusId: activeUser.id, personId: person.id },
  });
  await prisma.userTeam.upsert({
    where: { userId_teamId: { userId: demoUser.id, teamId: team.id } },
    create: { userId: demoUser.id, teamId: team.id }, update: {},
  });
}

async function main() {
  await seedCatalogs();
  await seedUnits();
  await seedPreparedCatalogs();
  await seedModules();
  await seedRepresentativeData();
  const totals = await Promise.all([
    prisma.catalog.count(),
    prisma.catalogValue.count(),
    prisma.systemModule.count(),
    prisma.profileModule.count(),
    prisma.person.count({ where: { dni: { startsWith: "DEMO" } } }),
    prisma.team.count({ where: { sourceId: { startsWith: "DEMO" } } }),
  ]);
  console.log(JSON.stringify({ catalogs: totals[0], catalogValues: totals[1], modules: totals[2], profileModuleRules: totals[3], demoPeople: totals[4], demoTeams: totals[5] }));
}

main().finally(async () => prisma.$disconnect());
