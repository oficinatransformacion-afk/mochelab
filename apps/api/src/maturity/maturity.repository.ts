import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CalibrateRoleMaturity, SubmitSelfAssessment } from "@mochelab/shared";
import { PrismaService } from "../database/prisma.service";
import { MaturityScoringService } from "./maturity-scoring.service";
import { MaturityPeriodService, type MaturityPeriodStatus } from "./maturity-period.service";

@Injectable()
export class MaturityRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: MaturityScoringService,
    private readonly periods: MaturityPeriodService,
  ) {}
  private snapshot(value:unknown){return JSON.parse(JSON.stringify(value,(_,item)=>typeof item==="bigint"?item.toString():item))}

  private async catalogValueId(catalogCode: string, valueCode: string): Promise<string> {
    const value = await this.prisma.catalogValue.findFirst({
      where: { code: valueCode, active: true, catalog: { code: catalogCode, active: true } },
      select: { id: true },
    });
    if (!value) throw new BadRequestException(`Falta configurar ${catalogCode}.${valueCode}`);
    return value.id;
  }

  async assertPersonRoleScope(personRoleId:string,teamIds:string[]|null,personId:string|null=null){
    const assignment=await this.prisma.personRole.findUnique({where:{id:personRoleId},select:{teamId:true,personId:true}});
    if(!assignment||(teamIds!==null&&!teamIds.includes(assignment.teamId))||(personId!==null&&assignment.personId!==personId))throw new BadRequestException("La asignación no pertenece a la cuenta o a un equipo permitido");
  }

  async listPeriods() {
    this.prisma.requireConnection();
    const [periods,eligibleRoles]=await Promise.all([this.prisma.period.findMany({
      orderBy: { startDate: "desc" },
      include: {
        status: { select: { code: true, name: true } },
        _count: { select: { selfAssessments: true, roleMaturities: true } },
      },
    }),this.prisma.personRole.count({where:{status:{code:"ACTIVO"},role:{observableBehaviors:{some:{active:true,behavior:{active:true,dimension:{active:true}}}}}}})]);
    return Promise.all(periods.map(async period=>{const calibrated=await this.prisma.roleMaturity.count({where:{periodId:period.id,calibratedAt:{not:null}}});return{...period,summary:{eligibleRoles,submitted:period._count.selfAssessments,pendingSubmission:Math.max(eligibleRoles-period._count.selfAssessments,0),calibrated,pendingCalibration:Math.max(period._count.roleMaturities-calibrated,0)}}}));
  }

  async createPeriod(input: { code: string; name: string; startDate: string; endDate: string; selfAssessmentOpensAt: string; selfAssessmentClosesAt: string; calibrationClosesAt: string; configurationVersion: string },administratorId:string) {
    const code = input.code?.trim().toUpperCase();
    const name = input.name?.trim();
    const configurationVersion = input.configurationVersion?.trim();
    if (!code || !name || !configurationVersion) throw new BadRequestException("Código, nombre y versión son obligatorios");
    const dates = {
      startDate: new Date(input.startDate), endDate: new Date(input.endDate),
      selfAssessmentOpensAt: new Date(input.selfAssessmentOpensAt), selfAssessmentClosesAt: new Date(input.selfAssessmentClosesAt),
      calibrationClosesAt: new Date(input.calibrationClosesAt),
    };
    if (Object.values(dates).some((date) => Number.isNaN(date.getTime()))) throw new BadRequestException("Todas las fechas del período son obligatorias y deben ser válidas");
    this.periods.validateDates(dates);
    const statusId = await this.catalogValueId("ESTADO_PERIODO_MADUREZ", "PLANIFICADO");
    try {
      return await this.prisma.$transaction(async tx=>{const period=await tx.period.create({ data: { code, name, ...dates, configurationVersion, statusId }, include: { status: { select: { code: true, name: true } }, _count: { select: { selfAssessments: true, roleMaturities: true } } } });await tx.audit.create({data:{occurredAt:new Date(),userId:administratorId,action:"CREATE",entity:"MATURITY_PERIOD",recordId:period.id,newValue:this.snapshot(period),result:"OK",origin:"WEB"}});return period});
    } catch (error: unknown) {
      if (typeof error === "object" && error && "code" in error && error.code === "P2002") throw new BadRequestException("Ya existe un período con ese código");
      throw error;
    }
  }

  async transitionPeriod(id: string, nextValue: string,administratorId:string) {
    const statuses: MaturityPeriodStatus[] = ["PLANIFICADO", "AUTOEVALUACION", "CALIBRACION", "CERRADO", "CANCELADO"];
    if (!statuses.includes(nextValue as MaturityPeriodStatus)) throw new BadRequestException("Estado de período inválido");
    const next = nextValue as MaturityPeriodStatus;
    return this.prisma.$transaction(async (tx) => {
      const period = await tx.period.findUnique({ where: { id }, include: { status: { select: { code: true } } } });
      if (!period) throw new NotFoundException("No se encontró el período");
      const current = period.status.code as MaturityPeriodStatus;
      this.periods.validateTransition(current, next);
      if (next === "AUTOEVALUACION") {
        const anotherOpen = await tx.period.count({ where: { id: { not: id }, active: true, status: { code: "AUTOEVALUACION", catalog: { code: "ESTADO_PERIODO_MADUREZ" } } } });
        if (anotherOpen > 0) throw new BadRequestException("Ya existe otro período con la autoevaluación abierta");
      }
      if(next==="CALIBRACION"){
        const [eligible,submitted]=await Promise.all([tx.personRole.count({where:{status:{code:"ACTIVO"},role:{observableBehaviors:{some:{active:true,behavior:{active:true,dimension:{active:true}}}}}}}),tx.roleSelfAssessment.count({where:{periodId:id}})]);
        if(submitted<eligible)throw new BadRequestException(`No se puede iniciar la calibración: faltan ${eligible-submitted} autoevaluaciones`);
      }
      if (next === "CERRADO") {
        const pending = await tx.roleMaturity.count({ where: { periodId: id, selfAssessmentId: { not: null }, calibratedAt: null } });
        if (pending > 0) throw new BadRequestException(`No se puede cerrar: quedan ${pending} calibraciones pendientes`);
      }
      const status = await tx.catalogValue.findFirst({ where: { code: next, active: true, catalog: { code: "ESTADO_PERIODO_MADUREZ", active: true } }, select: { id: true } });
      if (!status) throw new BadRequestException(`Falta configurar ESTADO_PERIODO_MADUREZ.${next}`);
      const updated=await tx.period.update({ where: { id }, data: { statusId: status.id, active: !["CERRADO", "CANCELADO"].includes(next) }, include: { status: { select: { code: true, name: true } }, _count: { select: { selfAssessments: true, roleMaturities: true } } } });
      await tx.audit.create({data:{occurredAt:new Date(),userId:administratorId,action:"STATUS_CHANGE",entity:"MATURITY_PERIOD",recordId:id,oldValue:this.snapshot(period),newValue:this.snapshot(updated),result:"OK",origin:"WEB"}});
      return updated;
    });
  }

  async listConfiguration() {
    this.prisma.requireConnection();
    return this.prisma.maturityDimension.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        behaviors: {
          orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
          include: {
            roles: {
              where: { active: true },
              include: { role: { select: { id: true, sourceId: true, name: true } } },
            },
          },
        },
      },
    });
  }

  async createDimension(input: { code: string; name: string; description?: string; weight: number }, administratorId: string) {
    if (!input.code.trim() || !input.name.trim() || input.weight <= 0) throw new BadRequestException("Código, nombre y peso positivo son obligatorios");
    return this.prisma.$transaction(async tx => { const row = await tx.maturityDimension.create({ data: { code: input.code.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_"), name: input.name.trim(), description: input.description?.trim() || null, weight: input.weight } }); await tx.audit.create({data:{occurredAt:new Date(),userId:administratorId,action:"CREATE",entity:"MATURITY_DIMENSION",recordId:row.id,newValue:this.snapshot(row),result:"OK",origin:"WEB"}}); return row; });
  }

  async updateDimension(id: string, input: { name?: string; description?: string; weight?: number; active?: boolean }, administratorId: string) {
    if (input.weight !== undefined && input.weight <= 0) throw new BadRequestException("El peso debe ser positivo");
    const current=await this.prisma.maturityDimension.findUnique({where:{id}});if(!current)throw new NotFoundException("No se encontró la dimensión");
    try { return await this.prisma.$transaction(async tx=>{const row=await tx.maturityDimension.update({ where: { id }, data: { name: input.name?.trim(), description: input.description?.trim(), weight: input.weight, active: input.active } });await tx.audit.create({data:{occurredAt:new Date(),userId:administratorId,action:"UPDATE",entity:"MATURITY_DIMENSION",recordId:id,oldValue:this.snapshot(current),newValue:this.snapshot(row),result:"OK",origin:"WEB"}});return row}); }
    catch { throw new NotFoundException("No se encontró la dimensión"); }
  }

  async createBehavior(input: { dimensionId: string; code: string; statement: string; helpText?: string; weight: number; roleIds: string[] }, administratorId: string) {
    if (!input.dimensionId || !input.code.trim() || !input.statement.trim() || input.weight <= 0 || input.roleIds.length === 0) throw new BadRequestException("Dimensión, código, comportamiento, peso y roles son obligatorios");
    const roles = [...new Set(input.roleIds)];
    const existingRoles = await this.prisma.role.count({ where: { id: { in: roles } } });
    if (existingRoles !== roles.length) throw new BadRequestException("Uno o más roles no existen");
    return this.prisma.$transaction(async tx => {const row=await tx.observableBehavior.create({ data: { dimensionId: input.dimensionId, code: input.code.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_"), statement: input.statement.trim(), helpText: input.helpText?.trim() || null, weight: input.weight, roles: { create: roles.map((roleId) => ({ roleId })) } }, include: { roles: true } });await tx.audit.create({data:{occurredAt:new Date(),userId:administratorId,action:"CREATE",entity:"OBSERVABLE_BEHAVIOR",recordId:row.id,newValue:this.snapshot(row),result:"OK",origin:"WEB"}});return row});
  }

  async updateBehavior(id: string, input: { statement?: string; helpText?: string; weight?: number; active?: boolean; roleIds?: string[] }, administratorId: string) {
    if (input.weight !== undefined && input.weight <= 0) throw new BadRequestException("El peso debe ser positivo");
    return this.prisma.$transaction(async (tx) => {
      const behavior = await tx.observableBehavior.findUnique({ where: { id } });
      if (!behavior) throw new NotFoundException("No se encontró el comportamiento");
      if (input.roleIds) {
        const roles = [...new Set(input.roleIds)];
        if (!roles.length) throw new BadRequestException("Debe seleccionar al menos un rol");
        await tx.observableBehaviorRole.deleteMany({ where: { behaviorId: id } });
        await tx.observableBehaviorRole.createMany({ data: roles.map((roleId) => ({ behaviorId: id, roleId })) });
      }
      const row=await tx.observableBehavior.update({ where: { id }, data: { statement: input.statement?.trim(), helpText: input.helpText?.trim(), weight: input.weight, active: input.active },include:{roles:true} });await tx.audit.create({data:{occurredAt:new Date(),userId:administratorId,action:"UPDATE",entity:"OBSERVABLE_BEHAVIOR",recordId:id,oldValue:this.snapshot(behavior),newValue:this.snapshot(row),result:"OK",origin:"WEB"}});return row;
    });
  }

  async listPendingCalibrations() {
    this.prisma.requireConnection();
    return this.prisma.roleMaturity.findMany({
      where: { calibratedAt: null, selfAssessmentId: { not: null } },
      orderBy: { evaluatedAt: "desc" },
      include: {
        level: { select: { code: true, name: true } },
        period: { select: { id: true, code: true, name: true } },
        personRole: {
          include: {
            person: { select: { id: true, dni: true, names: true } },
            role: { select: { id: true, sourceId: true, name: true } },
            team: { select: { id: true, sourceId: true } },
          },
        },
      },
    });
  }

  async listCalibrations(){
    this.prisma.requireConnection();
    return this.prisma.roleMaturity.findMany({where:{selfAssessmentId:{not:null}},orderBy:{evaluatedAt:"desc"},include:{level:{select:{code:true,name:true}},period:{select:{id:true,code:true,name:true}},personRole:{include:{person:{select:{id:true,dni:true,names:true}},role:{select:{id:true,sourceId:true,name:true}},team:{select:{id:true,sourceId:true}}}}}});
  }

  async getCalibration(id: string) {
    const maturity = await this.prisma.roleMaturity.findUnique({ where: { id }, include: { level: true, period: true, selfAssessment: { include: { responses: { orderBy: [{ dimensionCode: "asc" }, { behaviorId: "asc" }] } } }, personRole: { include: { person: true, role: true, team: true } } } });
    if (!maturity) throw new NotFoundException("No se encontró la calibración");
    const [people, officialTeamMaturities] = await Promise.all([
      this.prisma.person.findMany({ select: { id: true, names: true }, orderBy: { names: "asc" } }),
      this.prisma.teamMaturity.findMany({ where: { teamId: maturity.personRole.teamId, periodId: maturity.periodId, level: { code: "OFICIAL" } }, select: { id: true } }),
    ]);
    return { id: maturity.id, personId:maturity.personRole.person.id,person: maturity.personRole.person.names, role: maturity.personRole.role.name, team: maturity.personRole.team.sourceId, period: maturity.period.name, originalScore: Number(maturity.selfAssessmentScore ?? maturity.score), calibratedScore:maturity.calibratedScore===null?null:Number(maturity.calibratedScore),calibratedAt:maturity.calibratedAt,calibrationComments:maturity.calibrationComments, level: maturity.level.code, responses: maturity.selfAssessment?.responses.map((r) => ({ behaviorId: r.behaviorId, statement: r.behaviorStatement, score: Number(r.score), comments: r.comments, dimensionCode: r.dimensionCode, dimensionName: r.dimensionName })) ?? [], people:people.filter(person=>person.id!==maturity.personRole.person.id), officialTeamMaturities };
  }

  async getSelfAssessmentForm(personRoleId?: string,teamIds:string[]|null=null,personId:string|null=null) {
    this.prisma.requireConnection();
    const assignments=await this.prisma.personRole.findMany({where:{personId:personId??undefined,person:personId===null?{dni:{startsWith:"DEMO"}}:undefined,teamId:teamIds===null?undefined:{in:teamIds},status:{code:"ACTIVO"}},include:{person:true,role:true,team:true},orderBy:[{team:{sourceId:"asc"}},{role:{name:"asc"}}]});
    const assignment=personRoleId?assignments.find(item=>item.id===personRoleId):assignments[0];
    if (!assignment) throw new NotFoundException("No se encontró una asignación para autoevaluar");
    const period = await this.prisma.period.findFirst({
      where: { active: true, status: { code: "AUTOEVALUACION", catalog: { code: "ESTADO_PERIODO_MADUREZ" } } },
      orderBy: { startDate: "desc" },
      include: { status: true },
    }) ?? await this.prisma.period.findFirst({ orderBy: { startDate: "desc" }, include: { status: true } });
    if (!period) throw new NotFoundException("No existe un período de madurez configurado");
    const submitted=await this.prisma.roleSelfAssessment.findMany({where:{periodId:period.id,personRoleId:{in:assignments.map(item=>item.id)}},select:{personRoleId:true,submittedAt:true,status:{select:{code:true,name:true}}}});
    const submittedByRole=new Map(submitted.map(item=>[item.personRoleId,item]));
    const behaviors = await this.prisma.observableBehavior.findMany({
      where: { active: true, dimension: { active: true }, roles: { some: { roleId: assignment.roleId, active: true } } },
      include: { dimension: true }, orderBy: [{ dimension: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    });
    const grouped = new Map<string, { id: string; code: string; name: string; description: string | null; behaviors: { id: string; statement: string; helpText: string | null }[] }>();
    for (const item of behaviors) { const dimension = grouped.get(item.dimensionId) ?? { id: item.dimension.id, code: item.dimension.code, name: item.dimension.name, description: item.dimension.description, behaviors: [] }; dimension.behaviors.push({ id: item.id, statement: item.statement, helpText: item.helpText }); grouped.set(item.dimensionId, dimension); }
    return { personRoleId: assignment.id, person: assignment.person.names, role: assignment.role.name, team: assignment.team.sourceId, period: { id: period.id, code: period.code, name: period.name, status: period.status.code, configurationVersion: period.configurationVersion }, canSubmit: period.status.code === "AUTOEVALUACION"&&!submittedByRole.has(assignment.id), dimensions: [...grouped.values()],availableRoles:assignments.map(item=>({personRoleId:item.id,role:item.role.name,team:item.team.sourceId,status:submittedByRole.get(item.id)?.status.name??"Pendiente",submitted:Boolean(submittedByRole.has(item.id))})),progress:{completed:submitted.length,total:assignments.length} };
  }

  async submitSelfAssessment(input: SubmitSelfAssessment) {
    this.prisma.requireConnection();
    const [period, personRole] = await Promise.all([
      this.prisma.period.findUnique({
        where: { id: input.periodId },
        include: { status: { select: { code: true } } },
      }),
      this.prisma.personRole.findUnique({
        where: { id: input.personRoleId },
        select: { id: true, roleId: true },
      }),
    ]);
    if (!period || !personRole) throw new NotFoundException("No se encontró el período o la asignación del rol");
    if (period.status.code !== "AUTOEVALUACION") throw new BadRequestException("El período no admite autoevaluaciones");
    if (period.configurationVersion !== input.configurationVersion) throw new BadRequestException("La versión del formulario no corresponde al período");
    if(await this.prisma.roleSelfAssessment.findUnique({where:{personRoleId_periodId:{personRoleId:input.personRoleId,periodId:input.periodId}},select:{id:true}}))throw new BadRequestException("La autoevaluación de este rol ya fue enviada");

    const behaviors = await this.prisma.observableBehavior.findMany({
      where: { active: true, roles: { some: { roleId: personRole.roleId, active: true } } },
      include: { dimension: true },
      orderBy: [{ dimension: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    });
    const answers = new Map(input.answers.map((answer) => [answer.behaviorId, answer]));
    if (behaviors.length === 0 || behaviors.some((behavior) => !answers.has(behavior.id)) || answers.size !== behaviors.length) {
      throw new BadRequestException("Se deben responder todos y únicamente los comportamientos aplicables al rol");
    }

    const grouped = new Map<string, { weight: number; behaviors: { score: number; weight: number }[] }>();
    for (const behavior of behaviors) {
      const dimension = grouped.get(behavior.dimensionId) ?? {
        weight: Number(behavior.dimension.weight),
        behaviors: [],
      };
      dimension.behaviors.push({ score: answers.get(behavior.id)!.score, weight: Number(behavior.weight) });
      grouped.set(behavior.dimensionId, dimension);
    }
    const result = this.scoring.calculate([...grouped.values()]);
    const [submittedStatusId, levelId] = await Promise.all([
      this.catalogValueId("ESTADO_AUTOEVALUACION", "ENVIADA"),
      this.catalogValueId("NIVEL_MADUREZ", result.level),
    ]);

    return this.prisma.$transaction(async (transaction) => {
      const assessment = await transaction.roleSelfAssessment.create({
        data: {
          personRoleId: input.personRoleId,
          periodId: input.periodId,
          statusId: submittedStatusId,
          configurationVersion: input.configurationVersion,
          calculatedScore: result.score,
          submittedAt: new Date(),
          responses: {
            create: behaviors.map((behavior) => ({
              behaviorId: behavior.id,
              score: answers.get(behavior.id)!.score,
              comments: answers.get(behavior.id)!.comments,
              behaviorStatement: behavior.statement,
              behaviorWeight: behavior.weight,
              dimensionCode: behavior.dimension.code,
              dimensionName: behavior.dimension.name,
              dimensionWeight: behavior.dimension.weight,
            })),
          },
        },
      });

      const maturity = await transaction.roleMaturity.upsert({
        where: { personRoleId_periodId: { personRoleId: input.personRoleId, periodId: input.periodId } },
        create: {
          personRoleId: input.personRoleId,
          periodId: input.periodId,
          selfAssessmentId: assessment.id,
          evaluatedAt: new Date(),
          score: result.score,
          selfAssessmentScore: result.score,
          levelId,
        },
        update: {
          selfAssessmentId: assessment.id,
          evaluatedAt: new Date(),
          score: result.score,
          selfAssessmentScore: result.score,
          calibratedScore: null,
          calibratedAt: null,
          calibratedById: null,
          calibrationComments: null,
          levelId,
        },
      });
      return { assessmentId: assessment.id, roleMaturityId: maturity.id, ...result };
    });
  }

  async calibrate(input: CalibrateRoleMaturity, administratorId: string) {
    this.prisma.requireConnection();
    const maturity = await this.prisma.roleMaturity.findUnique({
      where: { id: input.roleMaturityId },
      include: { personRole: { select: { teamId: true,personId:true } },period:{include:{status:true}} },
    });
    if (!maturity) throw new NotFoundException("No se encontró el resultado de madurez");
    if(maturity.period.status.code!=="CALIBRACION")throw new BadRequestException("El período no se encuentra en etapa de calibración");
    if(maturity.calibratedAt)throw new BadRequestException("Esta autoevaluación ya fue calibrada");
    if (Number(maturity.selfAssessmentScore ?? maturity.score) !== input.calibratedScore && !input.comments?.trim()) {
      throw new BadRequestException("Se requiere un comentario para modificar el puntaje");
    }

    const mastery = input.mastery;
    const wantsMastery = Boolean(mastery?.trainingVerified || mastery?.campVerified || mastery?.teamMaturityId);
    let masteryQualified = false;
    if (wantsMastery) {
      if (input.calibratedScore < 1.5) throw new BadRequestException("Solo un rol Oficial puede calificar a Maestro");
      if (!mastery?.trainingVerified || !mastery.trainedPersonId || !mastery.trainingEvidence?.trim() || !mastery.campVerified || !mastery.campName || !mastery.campDate || !mastery.campEvidence?.trim() || !mastery.teamMaturityId) {
        throw new BadRequestException("Para Maestro deben acreditarse formación, sus evidencias, campamento y equipo Oficial");
      }
      if(mastery.trainedPersonId===maturity.personRole.personId)throw new BadRequestException("La persona formada debe ser distinta de la persona evaluada");
      const campDate=new Date(`${mastery.campDate}T00:00:00Z`);if(campDate>new Date())throw new BadRequestException("La fecha del campamento no puede estar en el futuro");
      const [teamMaturity,trainedPerson] = await Promise.all([this.prisma.teamMaturity.findFirst({
        where: {
          id: mastery.teamMaturityId,
          teamId: maturity.personRole.teamId,
          periodId: maturity.periodId,
          level: { code: "OFICIAL", catalog: { code: "NIVEL_MADUREZ" } },
        },
        select: { id: true },
      }),this.prisma.person.findFirst({where:{id:mastery.trainedPersonId,status:{code:"ACTIVO"}},select:{id:true}})]);
      if (!teamMaturity) throw new BadRequestException("El equipo no tiene nivel Oficial en este período");
      if(!trainedPerson)throw new BadRequestException("La persona formada no existe o no está activa");
      masteryQualified = true;
    }

    const level = this.scoring.levelFor(input.calibratedScore, {
      trainedPerson: masteryQualified,
      facilitatedCamp: masteryQualified,
      teamIsOfficial: masteryQualified,
    });
    const levelId = await this.catalogValueId("NIVEL_MADUREZ", level);

    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.roleMaturity.update({
        where: { id: input.roleMaturityId },
        data: {
          calibratedScore: input.calibratedScore,
          score: input.calibratedScore,
          levelId,
          calibrationComments: input.comments,
          calibratedById: administratorId,
          calibratedAt: new Date(),
        },
      });
      if (masteryQualified && mastery) {
        await transaction.roleMasteryQualification.upsert({
          where: { roleMaturityId: input.roleMaturityId },
          create: {
            roleMaturityId: input.roleMaturityId,
            trainedPersonId: mastery.trainedPersonId,
            trainingEvidence: mastery.trainingEvidence,
            trainingVerified: true,
            campName: mastery.campName,
            campDate: new Date(mastery.campDate!),
            campEvidence: mastery.campEvidence,
            campVerified: true,
            teamMaturityId: mastery.teamMaturityId,
            reviewedById: administratorId,
            reviewedAt: new Date(),
            comments: input.comments,
          },
          update: {
            trainedPersonId: mastery.trainedPersonId,
            trainingEvidence: mastery.trainingEvidence,
            trainingVerified: true,
            campName: mastery.campName,
            campDate: new Date(mastery.campDate!),
            campEvidence: mastery.campEvidence,
            campVerified: true,
            teamMaturityId: mastery.teamMaturityId,
            reviewedById: administratorId,
            reviewedAt: new Date(),
            comments: input.comments,
          },
        });
      }
      await transaction.audit.create({data:{occurredAt:new Date(),userId:administratorId,action:"CALIBRATE",entity:"ROLE_MATURITY",recordId:updated.id,oldValue:this.snapshot(maturity),newValue:this.snapshot(updated),result:"OK",origin:"WEB"}});
      return { id: updated.id, score: Number(updated.score), level, masteryQualified };
    });
  }
}
