import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

type DashboardFilters = { teamIds: string[]; periodIds: string[] };

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async summary(filters: DashboardFilters, allowedTeams: string[] | null) {
    const deniedTeam = filters.teamIds.find(id => allowedTeams !== null && !allowedTeams.includes(id));
    if (deniedTeam) throw new BadRequestException("El equipo no está permitido para esta cuenta");

    const teamIds = filters.teamIds.length ? filters.teamIds : allowedTeams;
    const periodIds = filters.periodIds.length ? filters.periodIds : null;
    const assignmentWhere = { teamId: teamIds === null ? undefined : { in: teamIds }, status: { code: "ACTIVO" } };

    const [teams, periods, people, assignments, courses, completed, roleMaturities, teamMaturities, objectives, initiatives] = await Promise.all([
      this.prisma.team.findMany({ where: { id: allowedTeams === null ? undefined : { in: allowedTeams } }, include: { program: true }, orderBy: { sourceId: "asc" } }),
      this.prisma.period.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true, status: { select: { code: true } } } }),
      this.prisma.person.count({ where: { assignments: { some: assignmentWhere } } }),
      this.prisma.personRole.count({ where: assignmentWhere }),
      this.prisma.personCourse.count({ where: { personRole: assignmentWhere } }),
      this.prisma.personCourse.count({ where: { personRole: assignmentWhere, status: { code: { in: ["TERMINADO", "APROBADO", "COMPLETADO"] } } } }),
      this.prisma.roleMaturity.findMany({ where: { periodId: periodIds ? { in: periodIds } : undefined, personRole: { teamId: teamIds === null ? undefined : { in: teamIds } } }, select: { score: true, level: { select: { name: true } } } }),
      this.prisma.teamMaturity.findMany({ where: { periodId: periodIds ? { in: periodIds } : undefined, teamId: teamIds === null ? undefined : { in: teamIds } }, select: { score: true, level: { select: { name: true } } } }),
      this.prisma.objective.findMany({ where: { isSystemPlaceholder: false, teamId: teamIds === null ? undefined : { in: teamIds } }, select: { achievement: true, resultStatus: { select: { name: true } } } }),
      this.prisma.initiative.findMany({ where: { teamId: teamIds === null ? undefined : { in: teamIds } }, select: { status: { select: { name: true } }, projectedEconomicBenefit: true, actualEconomicBenefit: true } }),
    ]);

    const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) * 100 / values.length) / 100 : 0;
    const group = (values: string[]) => Object.entries(values.reduce<Record<string, number>>((result, value) => {
      result[value] = (result[value] ?? 0) + 1;
      return result;
    }, {})).map(([name, value]) => ({ name, value }));

    return {
      filters: {
        teams: teams.map(team => ({ id: team.id, label: `${team.sourceId} · ${team.program.name}` })),
        periods: periods.map(period => ({ id: period.id, label: period.name, status: period.status.code })),
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
