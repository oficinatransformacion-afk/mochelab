import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";

type Input = Record<string, unknown>;

@Injectable()
export class AnnualObjectivesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private text(input: Input, key: string, required = true) {
    const value = typeof input[key] === "string" ? String(input[key]).trim() : "";
    if (required && !value) throw new BadRequestException(`${key} es obligatorio`);
    return value || null;
  }
  private number(input: Input, key: string, required = false) {
    const raw = input[key];
    if (raw === "" || raw === null || raw === undefined) {
      if (required) throw new BadRequestException(`${key} es obligatorio`);
      return null;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new BadRequestException(`${key} debe ser numérico`);
    return value;
  }
  private date(input: Input, key: string) {
    const raw = this.text(input, key, false);
    if (!raw) return null;
    const value = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(value.getTime())) throw new BadRequestException(`${key} no es una fecha válida`);
    return value;
  }
  private snapshot(value: unknown) {
    return JSON.parse(JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item)) as Prisma.InputJsonValue;
  }
  private async catalog(catalog: string, code: string) {
    const value = await this.prisma.catalogValue.findFirst({ where: { code, active: true, catalog: { code: catalog, active: true } } });
    if (!value) throw new BadRequestException(`No se encontró ${catalog}:${code}`);
    return value;
  }
  private async level(levelId: string, allowHistoricalEquipo = false) {
    const value = await this.prisma.catalogValue.findFirst({ where: { id: levelId, active: true, catalog: { code: "NIVEL_OBJETIVO" } } });
    const allowed = allowHistoricalEquipo ? ["CORPORATIVO", "NEGOCIO", "PROGRAMA", "EQUIPO"] : ["CORPORATIVO", "NEGOCIO", "PROGRAMA"];
    if (!value || !allowed.includes(value.code)) throw new BadRequestException("El nivel debe ser Corporativo, Negocio o Programa");
    return value;
  }
  private scopeWhere(teamIds: string[] | null): Prisma.ObjectiveWhereInput {
    if (teamIds === null) return {};
    return { OR: [
      { teamId: { in: teamIds } },
      { program: { teams: { some: { id: { in: teamIds } } } } },
      { level: { code: "CORPORATIVO" } },
    ] };
  }
  private async assertScope(programId: string | null, teamIds: string[] | null) {
    if (teamIds === null || !programId) return;
    const allowed = await this.prisma.program.count({ where: { id: programId, teams: { some: { id: { in: teamIds } } } } });
    if (!allowed) throw new BadRequestException("El programa no está permitido para esta cuenta");
  }
  private async validateObjective(input: Input, isAdmin: boolean, allowHistoricalEquipo = false) {
    const year = this.number(input, "year", true)!;
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new BadRequestException("Año inválido");
    const levelId = this.text(input, "levelId")!;
    const level = await this.level(levelId, allowHistoricalEquipo);
    const teamId = this.text(input, "teamId", false);
    const corporateObjectiveId = this.text(input, "corporateObjectiveId", false);
    if (level.code === "CORPORATIVO") {
      if (!isAdmin) throw new BadRequestException("Solo un administrador puede crear o editar objetivos corporativos");
      if (teamId || corporateObjectiveId) throw new BadRequestException("Un objetivo corporativo no debe tener Negocio, Programa ni Objetivo Corporativo");
    }
    if (level.code === "EQUIPO") {
      if (teamId || corporateObjectiveId) throw new BadRequestException("Un objetivo histórico de nivel Equipo pendiente de clasificación debe permanecer sin equipo");
      return { year, level, levelId, teamId, corporateObjectiveId };
    }
    if (level.code !== "CORPORATIVO") {
      if (!teamId) throw new BadRequestException(`Un objetivo de ${level.name} requiere seleccionar un ${level.name}`);
      const team = await this.prisma.team.findUnique({ where: { id: teamId }, select: { strategicType: true } });
      if (!team || team.strategicType !== level.code) throw new BadRequestException(`El equipo seleccionado debe estar clasificado como ${level.name}`);
    }
    if (level.code !== "CORPORATIVO") {
      if (!corporateObjectiveId) throw new BadRequestException("Objetivo Corporativo es obligatorio");
      const parent = await this.prisma.objective.findFirst({ where: { id: corporateObjectiveId, year, level: { code: "CORPORATIVO" }, recordStatus: { code: "ACTIVO" }, isSystemPlaceholder: false } });
      if (!parent) throw new BadRequestException("El Objetivo Corporativo debe estar activo y pertenecer al mismo año");
    }
    return { year, level, levelId, teamId, corporateObjectiveId };
  }

  async options(teamIds: string[] | null = null) {
    const allowedProgramWhere = teamIds === null ? {} : { teams: { some: { id: { in: teamIds } } } };
    const [values, teams, corporateObjectives] = await Promise.all([
      this.prisma.catalogValue.findMany({ where: { active: true, catalog: { code: { in: ["NIVEL_OBJETIVO", "AREA_ENFOQUE", "CICLO", "DIRECCION_INDICADOR", "TIPO_OBJETIVO", "UNIDAD_KR", "ESTADO_RESULTADO_CLAVE", "ESTADO_REGISTRO_OBJETIVO"] } } }, orderBy: [{ catalog: { code: "asc" } }, { sortOrder: "asc" }, { name: "asc" }], select: { id: true, code: true, name: true, catalog: { select: { code: true } } } }),
      this.prisma.team.findMany({ where: { status: { code: "ACTIVO" }, id: teamIds === null ? undefined : { in: teamIds } }, orderBy: { sourceId: "asc" }, select: { id: true, sourceId: true, name: true, strategicType: true } }),
      this.prisma.objective.findMany({ where: { isSystemPlaceholder: false, level: { code: "CORPORATIVO" }, recordStatus: { code: "ACTIVO" } }, orderBy: [{ year: "desc" }, { sourceId: "desc" }], select: { id: true, sourceId: true, year: true, objective: true, focusAreaId: true } }),
    ]);
    const catalogs = Object.fromEntries(["NIVEL_OBJETIVO", "AREA_ENFOQUE", "CICLO", "DIRECCION_INDICADOR", "TIPO_OBJETIVO", "UNIDAD_KR", "ESTADO_RESULTADO_CLAVE", "ESTADO_REGISTRO_OBJETIVO"].map(code => [code, values.filter(value => value.catalog.code === code).map(({ catalog: _, ...value }) => value)]));
    return { catalogs, teams, corporateObjectives: corporateObjectives.map(item => ({ ...item, sourceId: String(item.sourceId) })) };
  }

  async list(years: number[] = [], search = "", teamIds: string[] | null = null) {
    const where: Prisma.ObjectiveWhereInput = { isSystemPlaceholder: false, year: years.length ? { in: years } : undefined, ...this.scopeWhere(teamIds), OR: search.trim() ? [{ objective: { contains: search.trim(), mode: "insensitive" } }, { keyResults: { some: { keyResult: { contains: search.trim(), mode: "insensitive" } } } }] : undefined };
    const rows = await this.prisma.objective.findMany({ where, orderBy: [{ year: "desc" }, { sourceId: "desc" }], include: { level: true, team: { select: { id: true, sourceId: true, name: true, strategicType: true } }, business: true, program: true, focusArea: true, type: true, recordStatus: true, corporateObjective: { select: { id: true, sourceId: true, objective: true } }, keyResults: { include: { cycle: true, direction: true, unit: true, resultStatus: true, recordStatus: true }, orderBy: [{ cycle: { sortOrder: "asc" } }, { sourceId: "asc" }] }, _count: { select: { initiatives: true, keyResults: true } } } });
    return rows.map(row => ({ ...row, sourceId: String(row.sourceId), corporateObjective: row.corporateObjective ? { ...row.corporateObjective, sourceId: String(row.corporateObjective.sourceId) } : null, keyResults: row.keyResults.map(kr => ({ ...kr, sourceId: String(kr.sourceId), baseline: kr.baseline === null ? null : Number(kr.baseline), target: kr.target === null ? null : Number(kr.target), actual: kr.actual === null ? null : Number(kr.actual), achievement: kr.achievement === null ? null : Number(kr.achievement) })) }));
  }

  async create(input: Input, teamIds: string[] | null, userId: string | undefined, isAdmin: boolean) {
    const validated = await this.validateObjective(input, isAdmin);
    if (teamIds !== null && validated.teamId && !teamIds.includes(validated.teamId)) throw new BadRequestException("El equipo no está permitido para esta cuenta");
    const objective = this.text(input, "objective")!;
    const focusAreaId = this.text(input, "focusAreaId")!;
    const typeId = this.text(input, "typeId")!;
    const recordStatusId = this.text(input, "recordStatusId")!;
    const [annualCycle, direct] = await Promise.all([this.catalog("CICLO", "ANUAL"), this.catalog("DIRECCION_INDICADOR", "DIRECTO")]);
    return this.prisma.$transaction(async tx => {
      const maximum = await tx.objective.aggregate({ _max: { sourceId: true } });
      const row = await tx.objective.create({ data: { sourceId: (maximum._max.sourceId ?? 0n) + 1n, year: validated.year, levelId: validated.levelId, teamId: validated.teamId, corporateObjectiveId: validated.corporateObjectiveId, parentId: validated.corporateObjectiveId, focusAreaId, objective, typeId, recordStatusId, cycleId: annualCycle.id, keyResult: "Gestionado en resultados clave", directionId: direct.id }, include: { level: true, team: true, focusArea: true, type: true, recordStatus: true } });
      await tx.audit.create({ data: { occurredAt: new Date(), userId, action: "CREATE", entity: "ANNUAL_OBJECTIVE", recordId: row.id, newValue: this.snapshot(row), result: "OK", origin: "WEB" } });
      return { ...row, sourceId: String(row.sourceId) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async update(id: string, input: Input, teamIds: string[] | null, userId: string | undefined, isAdmin: boolean) {
    const current = await this.prisma.objective.findUnique({ where: { id } });
    if (!current || current.isSystemPlaceholder) throw new NotFoundException("No se encontró el objetivo anual");
    const merged: Input = { year: input.year ?? current.year, levelId: input.levelId ?? current.levelId, teamId: input.teamId === undefined ? current.teamId : input.teamId, corporateObjectiveId: input.corporateObjectiveId === undefined ? current.corporateObjectiveId : input.corporateObjectiveId };
    const currentLevel = await this.prisma.catalogValue.findUnique({ where: { id: current.levelId }, select: { code: true } });
    const requestedLevelId = String(merged.levelId ?? "");
    const validated = await this.validateObjective(merged, isAdmin, currentLevel?.code === "EQUIPO" && requestedLevelId === current.levelId);
    if (teamIds !== null && validated.teamId && !teamIds.includes(validated.teamId)) throw new BadRequestException("El equipo no está permitido para esta cuenta");
    const data: Prisma.ObjectiveUpdateInput = { year: validated.year, level: { connect: { id: validated.levelId } }, team: validated.teamId ? { connect: { id: validated.teamId } } : { disconnect: true }, business: { disconnect: true }, program: { disconnect: true }, corporateObjective: validated.corporateObjectiveId ? { connect: { id: validated.corporateObjectiveId } } : { disconnect: true }, parent: validated.corporateObjectiveId ? { connect: { id: validated.corporateObjectiveId } } : { disconnect: true } };
    if (input.objective !== undefined) data.objective = this.text(input, "objective")!;
    if (input.focusAreaId !== undefined) data.focusArea = { connect: { id: this.text(input, "focusAreaId")! } };
    if (input.typeId !== undefined) data.type = { connect: { id: this.text(input, "typeId")! } };
    if (input.recordStatusId !== undefined) data.recordStatus = { connect: { id: this.text(input, "recordStatusId")! } };
    return this.prisma.$transaction(async tx => { const row = await tx.objective.update({ where: { id }, data }); await tx.audit.create({ data: { occurredAt: new Date(), userId, action: "UPDATE", entity: "ANNUAL_OBJECTIVE", recordId: id, oldValue: this.snapshot(current), newValue: this.snapshot(row), result: "OK", origin: "WEB" } }); return { ...row, sourceId: String(row.sourceId) }; });
  }

  private async keyResultData(input: Input, current?: { directionId: string; target: Prisma.Decimal | null; actual: Prisma.Decimal | null }) {
    const directionId = this.text(input, "directionId") ?? current?.directionId;
    if (!directionId) throw new BadRequestException("directionId es obligatorio");
    const target = input.target === undefined ? current?.target ?? null : this.number(input, "target");
    const actual = input.actual === undefined ? current?.actual ?? null : this.number(input, "actual");
    let achievement: number | null = null;
    if (target !== null && actual !== null) { const direction = await this.prisma.catalogValue.findUnique({ where: { id: directionId } }); const goal = Number(target), executed = Number(actual); achievement = direction?.code === "INVERSO" ? (executed === 0 ? 100 : goal / executed * 100) : (goal === 0 ? (executed === 0 ? 100 : 0) : executed / goal * 100); achievement = Math.round(Math.max(0, Math.min(100, achievement)) * 100) / 100; }
    return { directionId, target, actual, achievement };
  }

  async createKeyResult(objectiveId: string, input: Input, userId?: string) {
    const objective = await this.prisma.objective.findFirst({ where: { id: objectiveId, isSystemPlaceholder: false } });
    if (!objective) throw new NotFoundException("No se encontró el objetivo anual");
    const calculated = await this.keyResultData(input);
    const cycleId = this.text(input, "cycleId")!, keyResult = this.text(input, "keyResult")!, recordStatusId = this.text(input, "recordStatusId")!;
    return this.prisma.$transaction(async tx => { const maximum = await tx.keyResult.aggregate({ _max: { sourceId: true } }); const row = await tx.keyResult.create({ data: { sourceId: (maximum._max.sourceId ?? 0n) + 1n, objectiveId, cycleId, keyResult, directionId: calculated.directionId, unitId: this.text(input, "unitId", false), baseline: this.number(input, "baseline"), baselineDate: this.date(input, "baselineDate"), target: calculated.target, actual: calculated.actual, cutoffDate: this.date(input, "cutoffDate"), resultStatusId: this.text(input, "resultStatusId", false), recordStatusId, achievement: calculated.achievement } }); await tx.audit.create({ data: { occurredAt: new Date(), userId, action: "CREATE", entity: "KEY_RESULT", recordId: row.id, newValue: this.snapshot(row), result: "OK", origin: "WEB" } }); return { ...row, sourceId: String(row.sourceId) }; }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async updateKeyResult(id: string, input: Input, userId?: string) {
    const current = await this.prisma.keyResult.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("No se encontró el resultado clave");
    const calculated = await this.keyResultData(input, current);
    const data: Prisma.KeyResultUpdateInput = { direction: { connect: { id: calculated.directionId } }, target: calculated.target, actual: calculated.actual, achievement: calculated.achievement };
    if (input.cycleId !== undefined) data.cycle = { connect: { id: this.text(input, "cycleId")! } };
    if (input.keyResult !== undefined) data.keyResult = this.text(input, "keyResult")!;
    if (input.unitId !== undefined) data.unit = this.text(input, "unitId", false) ? { connect: { id: this.text(input, "unitId")! } } : { disconnect: true };
    for (const key of ["baseline", "baselineDate", "cutoffDate"] as const) if (input[key] !== undefined) (data as any)[key] = key === "baseline" ? this.number(input, key) : this.date(input, key);
    if (input.resultStatusId !== undefined) data.resultStatus = this.text(input, "resultStatusId", false) ? { connect: { id: this.text(input, "resultStatusId")! } } : { disconnect: true };
    if (input.recordStatusId !== undefined) data.recordStatus = { connect: { id: this.text(input, "recordStatusId")! } };
    return this.prisma.$transaction(async tx => { const row = await tx.keyResult.update({ where: { id }, data }); await tx.audit.create({ data: { occurredAt: new Date(), userId, action: "UPDATE", entity: "KEY_RESULT", recordId: id, oldValue: this.snapshot(current), newValue: this.snapshot(row), result: "OK", origin: "WEB" } }); return { ...row, sourceId: String(row.sourceId) }; });
  }
}
