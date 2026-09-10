import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

type DashboardFilters = { teamIds: string[] };

const dashboardRoles = [
  "SPONSOR",
  "LIDER AE",
  "LIDER EAD",
  "DUEÑO DE PROGRAMA",
  "DUEÑO DE PRODUCTO",
  "ATF",
];

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async summary(filters: DashboardFilters, allowedTeams: string[] | null) {
    const deniedTeam = filters.teamIds.find(id => allowedTeams !== null && !allowedTeams.includes(id));
    if (deniedTeam) throw new BadRequestException("El equipo no está permitido para esta cuenta");

    const teamIds = filters.teamIds.length ? filters.teamIds : allowedTeams;
    const currentYear = Number(new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "America/Lima" }).format(new Date()));
    const now = new Date();
    const currentPeriod = await this.prisma.period.findFirst({
      where: { active: true, status: { code: { not: "CANCELADO" } }, startDate: { lte: now }, endDate: { gte: now } },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true, status: { select: { code: true } } },
    }) ?? await this.prisma.period.findFirst({
      where: { active: true, status: { code: { not: "CANCELADO" } } },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true, status: { select: { code: true } } },
    });
    const assignmentWhere = {
      teamId: teamIds === null ? undefined : { in: teamIds },
      role: { name: { in: dashboardRoles } },
      status: { code: "ACTIVO" },
    };

    const [teams, people, assignments, courses, completed, roleMaturities, teamMaturities, objectives, initiatives] = await Promise.all([
      this.prisma.team.findMany({ where: { status: { code: "ACTIVO" }, id: allowedTeams === null ? undefined : { in: allowedTeams } }, include: { program: true }, orderBy: { sourceId: "asc" } }),
      this.prisma.person.count({ where: { assignments: { some: assignmentWhere } } }),
      this.prisma.personRole.count({ where: assignmentWhere }),
      this.prisma.personCourse.count({ where: { personRole: assignmentWhere } }),
      this.prisma.personCourse.count({ where: { personRole: assignmentWhere, status: { code: { in: ["TERMINADO", "APROBADO", "COMPLETADO"] } } } }),
      currentPeriod ? this.prisma.roleMaturity.findMany({ where: { periodId: currentPeriod.id, personRole: { teamId: teamIds === null ? undefined : { in: teamIds }, role: { name: { in: dashboardRoles } } } }, select: { score: true, level: { select: { name: true } } } }) : Promise.resolve([]),
      currentPeriod ? this.prisma.teamMaturity.findMany({ where: { periodId: currentPeriod.id, teamId: teamIds === null ? undefined : { in: teamIds } }, select: { score: true, level: { select: { name: true } } } }) : Promise.resolve([]),
      this.prisma.objective.findMany({ where: { isSystemPlaceholder: false, year: currentYear, teamId: teamIds === null ? undefined : { in: teamIds } }, select: { achievement: true, resultStatus: { select: { name: true } } } }),
      this.prisma.initiative.findMany({ where: { year: currentYear, type: { code: "ESTRATEGICA", catalog: { code: "TIPO_INICIATIVA" } }, teamId: teamIds === null ? undefined : { in: teamIds } }, select: { status: { select: { name: true } }, projectedEconomicBenefit: true, actualEconomicBenefit: true } }),
    ]);

    const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) * 100 / values.length) / 100 : 0;
    const group = (values: string[]) => Object.entries(values.reduce<Record<string, number>>((result, value) => {
      result[value] = (result[value] ?? 0) + 1;
      return result;
    }, {})).map(([name, value]) => ({ name, value }));

    return {
      filters: {
        teams: teams.map(team => ({ id: team.id, sourceId: team.sourceId, label: `${team.sourceId} · ${team.program.name}` })),
      },
      context: {
        year: currentYear,
        maturityPeriod: currentPeriod ? { id: currentPeriod.id, label: currentPeriod.name, status: currentPeriod.status.code } : null,
      },
      capabilities: {
        people, assignments, courses, completedCourses: completed,
        pendingCourses: courses - completed,
        learningCompletion: courses ? Math.round(completed * 10000 / courses) / 100 : 0,
        roleMaturityAverage: average(roleMaturities.map(item => Number(item.score))),
        teamMaturityAverage: average(teamMaturities.map(item => Number(item.score))),
        roleLevels: group(roleMaturities.map(item => item.level.name)),
        teamLevels: group(teamMaturities.map(item => item.level.name)),
      },
      strategy: {
        objectives: objectives.length,
        objectiveAverage: average(objectives.map(item => Number(item.achievement ?? 0))),
        objectiveStatuses: group(objectives.map(item => item.resultStatus?.name ?? "Sin resultado")),
        initiatives: initiatives.length,
        initiativeStatuses: group(initiatives.map(item => item.status.name)),
        projectedBenefit: initiatives.reduce((sum, item) => sum + Number(item.projectedEconomicBenefit ?? 0), 0),
        actualBenefit: initiatives.reduce((sum, item) => sum + Number(item.actualEconomicBenefit ?? 0), 0),
      },
    };
  }
}
