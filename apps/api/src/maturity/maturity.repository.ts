import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CalibrateRoleMaturity, SubmitSelfAssessment } from "@mochelab/shared";
import { PrismaService } from "../database/prisma.service";
import { MaturityScoringService } from "./maturity-scoring.service";
import { MaturityPeriodService, type MaturityPeriodStatus } from "./maturity-period.service";

type ModelItemInput={behaviorId:string;weight:number;required?:boolean;responseScaleId?:string|null;maturityLevelId?:string|null};
type ModelDimensionInput={code:string;name:string;description?:string;weight:number;items:ModelItemInput[]};
type ModelSectionInput={code:string;name:string;type:"INTEGRAL"|"TECHNICAL"|"SOFT";weight:number;responseScaleId:string;dimensions:ModelDimensionInput[]};
type ModelDefinitionInput={sections:ModelSectionInput[]};

@Injectable()
export class MaturityRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: MaturityScoringService,
    private readonly periods: MaturityPeriodService,
  ) {}
  private snapshot(value:unknown){return JSON.parse(JSON.stringify(value,(_,item)=>typeof item==="bigint"?item.toString():item))}

  private async periodPopulation(periodId:string){
    const configuredModels=await this.prisma.periodAssessmentModel.count({where:{periodId,active:true}});
    const roleFilter=configuredModels?{periodAssessmentModels:{some:{periodId,active:true}}}:{observableBehaviors:{some:{active:true,behavior:{active:true,dimension:{active:true}}}}};
    const assignmentWhere={status:{code:"ACTIVO"},developmentPathMode:"STANDARD" as const,role:roleFilter};
    const [eligibleRows,submittedRows,resultRows]=await Promise.all([
      this.prisma.personRole.findMany({where:assignmentWhere,distinct:["personId","roleId"],select:{personId:true,roleId:true}}),
      this.prisma.roleSelfAssessment.findMany({where:{periodId,role:roleFilter},select:{personId:true,roleId:true}}),
      this.prisma.roleMaturity.findMany({where:{periodId,role:roleFilter},select:{calibratedAt:true,personId:true,roleId:true}}),
    ]);
    const submitted=new Set(submittedRows.map(row=>`${row.personId}:${row.roleId}`)).size;
    const results=new Set(resultRows.map(row=>`${row.personId}:${row.roleId}`));
    const calibrated=new Set(resultRows.filter(row=>row.calibratedAt!==null).map(row=>`${row.personId}:${row.roleId}`)).size;
    return{eligibleRoles:eligibleRows.length,submitted,pendingSubmission:Math.max(eligibleRows.length-submitted,0),results:results.size,calibrated,pendingCalibration:Math.max(results.size-calibrated,0)};
  }

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
    const periods=await this.prisma.period.findMany({
      orderBy: { startDate: "desc" },
      include: {
        status: { select: { code: true, name: true } },
        _count: { select: { selfAssessments: true, roleMaturities: true } },
      },
    });
    return Promise.all(periods.map(async period=>{const[population,models]=await Promise.all([this.periodPopulation(period.id),this.prisma.periodAssessmentModel.findMany({where:{periodId:period.id,active:true},include:{role:{select:{id:true,name:true}},modelVersion:{select:{id:true,version:true,assessmentModel:{select:{name:true}}}}},orderBy:{role:{name:"asc"}}})]);return{...period,_count:{...period._count,roleMaturities:population.results},models:models.map(item=>({roleId:item.roleId,role:item.role.name,modelVersionId:item.modelVersionId,model:item.modelVersion.assessmentModel.name,version:item.modelVersion.version})),summary:population}}));
  }

  async listPeriodModelOptions(){
    const versions=await this.prisma.assessmentModelVersion.findMany({where:{status:"PUBLISHED",assessmentModel:{active:true,role:{status:{code:"ACTIVO"}}}},include:{assessmentModel:{include:{role:{select:{id:true,sourceId:true,name:true}}}},_count:{select:{sections:true}}},orderBy:[{assessmentModel:{role:{name:"asc"}}},{version:"desc"}]});
    return versions.map(item=>({roleId:item.assessmentModel.role.id,roleSourceId:item.assessmentModel.role.sourceId,role:item.assessmentModel.role.name,modelVersionId:item.id,version:item.version,model:item.assessmentModel.name,sectionCount:item._count.sections}));
  }

  async createPeriod(input: { code: string; name: string; startDate: string; endDate: string; selfAssessmentOpensAt: string; selfAssessmentClosesAt: string; calibrationClosesAt: string; configurationVersion?: string; roleModels?:{roleId:string;modelVersionId:string}[] },administratorId:string) {
    const code = input.code?.trim().toUpperCase();
    const name = input.name?.trim();
    const roleModels=[...new Map((input.roleModels??[]).map(item=>[item.modelVersionId,item])).values()];
    if (!code || !name || roleModels.length===0) throw new BadRequestException("Código, nombre y al menos un modelo por rol son obligatorios");
    const versions=await this.prisma.assessmentModelVersion.findMany({where:{id:{in:roleModels.map(item=>item.modelVersionId)},status:"PUBLISHED"},include:{assessmentModel:{select:{roleId:true}}}});
    if(versions.length!==roleModels.length||versions.some(version=>roleModels.find(item=>item.modelVersionId===version.id)?.roleId!==version.assessmentModel.roleId))throw new BadRequestException("Los modelos seleccionados no corresponden a versiones publicadas de sus roles");
    const configurationVersion=input.configurationVersion?.trim()||([...new Set(versions.map(item=>item.version))].length===1?versions[0].version:"POR_ROL");
    const dates = {
      startDate: new Date(input.startDate), endDate: new Date(input.endDate),
      selfAssessmentOpensAt: new Date(input.selfAssessmentOpensAt), selfAssessmentClosesAt: new Date(input.selfAssessmentClosesAt),
      calibrationClosesAt: new Date(input.calibrationClosesAt),
    };
    if (Object.values(dates).some((date) => Number.isNaN(date.getTime()))) throw new BadRequestException("Todas las fechas del período son obligatorias y deben ser válidas");
    this.periods.validateDates(dates);
    const statusId = await this.catalogValueId("ESTADO_PERIODO_MADUREZ", "PLANIFICADO");
    try {
      return await this.prisma.$transaction(async tx=>{const period=await tx.period.create({ data: { code, name, ...dates, configurationVersion, statusId }, include: { status: { select: { code: true, name: true } }, _count: { select: { selfAssessments: true, roleMaturities: true } } } });await tx.periodAssessmentModel.createMany({data:roleModels.map(item=>({periodId:period.id,roleId:item.roleId,modelVersionId:item.modelVersionId,active:true}))});await tx.audit.create({data:{occurredAt:new Date(),userId:administratorId,action:"CREATE",entity:"MATURITY_PERIOD",recordId:period.id,newValue:{...this.snapshot(period),roleModels},result:"OK",origin:"WEB"}});return period});
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
        const configuredModels=await tx.periodAssessmentModel.findMany({where:{periodId:id,active:true},select:{modelVersion:{select:{status:true}}}});
        if(configuredModels.length===0)throw new BadRequestException("No se puede abrir la autoevaluación: el período no tiene modelos por rol");
        if(configuredModels.some(item=>item.modelVersion.status==="DRAFT"))throw new BadRequestException("No se puede abrir la autoevaluación: los modelos no pueden estar en borrador");
        const population=await this.periodPopulation(id);
        if(population.eligibleRoles===0)throw new BadRequestException("No se puede abrir la autoevaluación: no existen personas y roles elegibles");
        const anotherOpen = await tx.period.count({ where: { id: { not: id }, active: true, status: { code: "AUTOEVALUACION", catalog: { code: "ESTADO_PERIODO_MADUREZ" } } } });
        if (anotherOpen > 0) throw new BadRequestException("Ya existe otro período con la autoevaluación abierta");
      }
      if(next==="CALIBRACION"){
        const population=await this.periodPopulation(id);
        if(population.submitted<population.eligibleRoles)throw new BadRequestException(`No se puede iniciar la calibración: faltan ${population.pendingSubmission} autoevaluaciones`);
      }
      if (next === "CERRADO") {
        const population=await this.periodPopulation(id);
        if (population.pendingCalibration > 0) throw new BadRequestException(`No se puede cerrar: quedan ${population.pendingCalibration} calibraciones pendientes`);
      }
      const status = await tx.catalogValue.findFirst({ where: { code: next, active: true, catalog: { code: "ESTADO_PERIODO_MADUREZ", active: true } }, select: { id: true } });
      if (!status) throw new BadRequestException(`Falta configurar ESTADO_PERIODO_MADUREZ.${next}`);
      const updated=await tx.period.update({ where: { id }, data: { statusId: status.id, active: !["CERRADO", "CANCELADO"].includes(next) }, include: { status: { select: { code: true, name: true } }, _count: { select: { selfAssessments: true, roleMaturities: true } } } });
      await tx.audit.create({data:{occurredAt:new Date(),userId:administratorId,action:"STATUS_CHANGE",entity:"MATURITY_PERIOD",recordId:id,oldValue:this.snapshot(period),newValue:this.snapshot(updated),result:"OK",origin:"WEB"}});
      return updated;
    });
  }

  async reopenPeriodForCalibration(id:string,justification:string,administratorId:string){
    const reason=justification?.trim();
    if(!reason||reason.length<10)throw new BadRequestException("La justificación de reapertura debe tener al menos 10 caracteres");
    return this.prisma.$transaction(async tx=>{
      const period=await tx.period.findUnique({where:{id},include:{status:{select:{code:true,name:true}}}});
      if(!period)throw new NotFoundException("No se encontró el período");
      if(period.status.code!=="CERRADO")throw new BadRequestException("Solo puede reabrirse un período cerrado");
      const status=await tx.catalogValue.findFirst({where:{code:"CALIBRACION",active:true,catalog:{code:"ESTADO_PERIODO_MADUREZ",active:true}},select:{id:true}});
      if(!status)throw new BadRequestException("Falta configurar ESTADO_PERIODO_MADUREZ.CALIBRACION");
      const updated=await tx.period.update({where:{id},data:{statusId:status.id,active:true},include:{status:{select:{code:true,name:true}},_count:{select:{selfAssessments:true,roleMaturities:true}}}});
      await tx.audit.create({data:{occurredAt:new Date(),userId:administratorId,action:"REOPEN_FOR_CALIBRATION",entity:"MATURITY_PERIOD",recordId:id,oldValue:this.snapshot(period),newValue:{...this.snapshot(updated),justification:reason},result:"OK",origin:"WEB"}});
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

  async listAssessmentModels() {
    this.prisma.requireConnection();
    return this.prisma.assessmentModel.findMany({
      orderBy: { role: { name: "asc" } },
      include: {
        role: { select: { id: true, sourceId: true, name: true } },
        versions: {
          orderBy: { createdAt: "desc" },
          include: {
            sections: {
              orderBy: { sortOrder: "asc" },
              include: {
                responseScale: { include: { options: { where: { active: true }, orderBy: { sortOrder: "asc" } } } },
                dimensions: {
                  where: { active: true },
                  orderBy: { sortOrder: "asc" },
                  include: { items: { where: { active: true }, orderBy: { sortOrder: "asc" }, include: { maturityLevel: { select: { code: true, name: true } } } } },
                },
              },
            },
          },
        },
      },
    });
  }

  async listAssessmentModelOptions(){
    this.prisma.requireConnection();
    const [scales,levels]=await Promise.all([
      this.prisma.responseScale.findMany({where:{active:true},include:{options:{where:{active:true},orderBy:{sortOrder:"asc"}}},orderBy:{name:"asc"}}),
      this.prisma.catalogValue.findMany({where:{active:true,catalog:{code:"NIVEL_MADUREZ",active:true}},select:{id:true,code:true,name:true,sortOrder:true},orderBy:{sortOrder:"asc"}}),
    ]);
    return{scales,levels};
  }

  async createAssessmentModel(input:{roleId:string;code:string;name:string;version:string},administratorId:string){
    const roleId=input.roleId?.trim(),code=input.code?.trim().toUpperCase().replace(/[^A-Z0-9]+/g,"_"),name=input.name?.trim(),version=input.version?.trim();
    if(!roleId||!code||!name||!version)throw new BadRequestException("Rol, código, nombre y versión son obligatorios");
    try{return await this.prisma.$transaction(async tx=>{
      const model=await tx.assessmentModel.create({data:{roleId,code,name,versions:{create:{version,status:"DRAFT"}}},include:{versions:true,role:{select:{id:true,sourceId:true,name:true}}}});
      await tx.audit.create({data:{occurredAt:new Date(),userId:administratorId,action:"CREATE",entity:"ASSESSMENT_MODEL",recordId:model.id,newValue:this.snapshot(model),result:"OK",origin:"WEB"}});
      return model;
    })}catch(error:unknown){if(typeof error==="object"&&error&&"code" in error&&error.code==="P2002")throw new BadRequestException("El rol o código ya tiene un modelo de madurez");throw error}
  }

  async createAssessmentModelVersion(modelId:string,input:{version:string;cloneFromVersionId?:string},administratorId:string){
    const version=input.version?.trim();if(!version)throw new BadRequestException("La versión es obligatoria");
    const source=input.cloneFromVersionId?await this.prisma.assessmentModelVersion.findFirst({where:{id:input.cloneFromVersionId,assessmentModelId:modelId},include:{sections:{orderBy:{sortOrder:"asc"},include:{dimensions:{orderBy:{sortOrder:"asc"},include:{items:{orderBy:{sortOrder:"asc"}}}}}}}}):null;
    if(input.cloneFromVersionId&&!source)throw new BadRequestException("La versión base no pertenece al modelo");
    try{return await this.prisma.$transaction(async tx=>{
      const created=await tx.assessmentModelVersion.create({data:{assessmentModelId:modelId,version,status:"DRAFT",calculationMethod:source?.calculationMethod??"WEIGHTED_SECTIONS",sections:source?{create:source.sections.map(section=>({responseScaleId:section.responseScaleId,code:section.code,name:section.name,type:section.type,weight:section.weight,sortOrder:section.sortOrder,dimensions:{create:section.dimensions.map(dimension=>({code:dimension.code,name:dimension.name,description:dimension.description,weight:dimension.weight,sortOrder:dimension.sortOrder,items:{create:dimension.items.map(item=>({behaviorId:item.behaviorId,responseScaleId:item.responseScaleId,maturityLevelId:item.maturityLevelId,code:item.code,statement:item.statement,helpText:item.helpText,weight:item.weight,required:item.required,sortOrder:item.sortOrder}))}}))}}))}:undefined},include:{sections:true}});
      await tx.audit.create({data:{occurredAt:new Date(),userId:administratorId,action:"CREATE",entity:"ASSESSMENT_MODEL_VERSION",recordId:created.id,newValue:this.snapshot(created),result:"OK",origin:"WEB"}});return created;
    })}catch(error:unknown){if(typeof error==="object"&&error&&"code" in error&&error.code==="P2002")throw new BadRequestException("Ya existe esa versión para el modelo");throw error}
  }

  private validateModelDefinition(input:ModelDefinitionInput){
    if(!Array.isArray(input.sections)||input.sections.length===0)throw new BadRequestException("El modelo debe tener al menos una sección");
    const sectionCodes=new Set<string>();
    for(const section of input.sections){section.code=section.code?.trim().toUpperCase().replace(/[^A-Z0-9]+/g,"_");section.name=section.name?.trim();if(!section.code||!section.name||!section.responseScaleId||!section.type||section.weight<=0)throw new BadRequestException("Cada sección requiere código, nombre, tipo, escala y peso positivo");if(sectionCodes.has(section.code))throw new BadRequestException(`Código de sección duplicado: ${section.code}`);sectionCodes.add(section.code);if(!section.dimensions?.length)throw new BadRequestException(`La sección ${section.name} debe tener al menos una dimensión`);const dimensionCodes=new Set<string>();for(const dimension of section.dimensions){dimension.code=dimension.code?.trim().toUpperCase().replace(/[^A-Z0-9]+/g,"_");dimension.name=dimension.name?.trim();if(!dimension.code||!dimension.name||dimension.weight<=0)throw new BadRequestException(`Cada dimensión de ${section.name} requiere código, nombre y peso positivo`);if(dimensionCodes.has(dimension.code))throw new BadRequestException(`Código de dimensión duplicado en ${section.name}: ${dimension.code}`);dimensionCodes.add(dimension.code);if(!dimension.items?.length)throw new BadRequestException(`La dimensión ${dimension.name} debe tener al menos una pregunta`);if(dimension.items.some(item=>!item.behaviorId||item.weight<=0))throw new BadRequestException(`Cada pregunta de ${dimension.name} requiere un comportamiento y peso positivo`);if(new Set(dimension.items.map(item=>item.behaviorId)).size!==dimension.items.length)throw new BadRequestException(`Hay preguntas repetidas en ${dimension.name}`)}}
  }

  async saveAssessmentModelVersion(versionId:string,input:ModelDefinitionInput,administratorId:string){
    this.validateModelDefinition(input);
    const current=await this.prisma.assessmentModelVersion.findUnique({where:{id:versionId},include:{assessmentModel:{select:{roleId:true}}}});if(!current)throw new NotFoundException("No se encontró la versión");if(current.status!=="DRAFT")throw new BadRequestException("Solo puede editarse una versión en borrador");
    const behaviorIds=[...new Set(input.sections.flatMap(section=>section.dimensions.flatMap(dimension=>dimension.items.map(item=>item.behaviorId))))];
    const scaleIds=[...new Set(input.sections.flatMap(section=>[section.responseScaleId,...section.dimensions.flatMap(dimension=>dimension.items.map(item=>item.responseScaleId).filter((id):id is string=>Boolean(id)))]))];
    const [behaviorRows,scaleCount]=await Promise.all([this.prisma.observableBehavior.findMany({where:{id:{in:behaviorIds},active:true,roles:{some:{roleId:current.assessmentModel.roleId,active:true}}},select:{id:true,code:true,statement:true,helpText:true}}),this.prisma.responseScale.count({where:{id:{in:scaleIds},active:true}})]);
    if(behaviorRows.length!==behaviorIds.length)throw new BadRequestException("Una o más preguntas no están activas o no corresponden al rol del modelo");if(scaleCount!==scaleIds.length)throw new BadRequestException("Una o más escalas no están activas");const behaviorMap=new Map(behaviorRows.map(item=>[item.id,item]));
    return this.prisma.$transaction(async tx=>{
      const sectionIds=(await tx.assessmentSection.findMany({where:{modelVersionId:versionId},select:{id:true}})).map(item=>item.id);
      const dimensionIds=(await tx.assessmentDimensionVersion.findMany({where:{sectionId:{in:sectionIds}},select:{id:true}})).map(item=>item.id);
      await tx.assessmentItemVersion.deleteMany({where:{dimensionId:{in:dimensionIds}}});
      await tx.assessmentDimensionVersion.deleteMany({where:{sectionId:{in:sectionIds}}});
      await tx.assessmentSection.deleteMany({where:{modelVersionId:versionId}});
      for(const [sectionIndex,section] of input.sections.entries()){
        await tx.assessmentSection.create({data:{
          modelVersionId:versionId,responseScaleId:section.responseScaleId,code:section.code,name:section.name,type:section.type,weight:section.weight,sortOrder:sectionIndex,
          dimensions:{create:section.dimensions.map((dimension,dimensionIndex)=>({
            code:dimension.code,name:dimension.name,description:dimension.description?.trim()||null,weight:dimension.weight,sortOrder:dimensionIndex,
            items:{create:dimension.items.map((item,itemIndex)=>{const behavior=behaviorMap.get(item.behaviorId)!;return{behaviorId:item.behaviorId,responseScaleId:item.responseScaleId||null,maturityLevelId:item.maturityLevelId||null,code:behavior.code,statement:behavior.statement,helpText:behavior.helpText,weight:item.weight,required:item.required!==false,sortOrder:itemIndex}})},
          }))},
        }});
      }
      await tx.audit.create({data:{occurredAt:new Date(),userId:administratorId,action:"UPDATE",entity:"ASSESSMENT_MODEL_VERSION",recordId:versionId,oldValue:this.snapshot(current),newValue:this.snapshot(input),result:"OK",origin:"WEB"}});
      return tx.assessmentModelVersion.findUnique({where:{id:versionId},include:{sections:{include:{dimensions:{include:{items:true}}}}}});
    });
  }

  async publishAssessmentModelVersion(versionId:string,administratorId:string){
    const version=await this.prisma.assessmentModelVersion.findUnique({where:{id:versionId},include:{sections:{include:{dimensions:{include:{items:true}}}},assessmentModel:true}});if(!version)throw new NotFoundException("No se encontró la versión");if(version.status!=="DRAFT")throw new BadRequestException("Solo puede publicarse una versión en borrador");this.validateModelDefinition({sections:version.sections.map(section=>({code:section.code,name:section.name,type:section.type,weight:Number(section.weight),responseScaleId:section.responseScaleId,dimensions:section.dimensions.map(dimension=>({code:dimension.code,name:dimension.name,description:dimension.description??undefined,weight:Number(dimension.weight),items:dimension.items.map(item=>({behaviorId:item.behaviorId,weight:Number(item.weight),required:item.required,responseScaleId:item.responseScaleId,maturityLevelId:item.maturityLevelId}))}))}))});
    return this.prisma.$transaction(async tx=>{await tx.assessmentModelVersion.updateMany({where:{assessmentModelId:version.assessmentModelId,status:"PUBLISHED",id:{not:versionId}},data:{status:"RETIRED",validTo:new Date()}});const published=await tx.assessmentModelVersion.update({where:{id:versionId},data:{status:"PUBLISHED",publishedAt:new Date(),validFrom:new Date(),validTo:null}});await tx.audit.create({data:{occurredAt:new Date(),userId:administratorId,action:"PUBLISH",entity:"ASSESSMENT_MODEL_VERSION",recordId:versionId,oldValue:this.snapshot(version),newValue:this.snapshot(published),result:"OK",origin:"WEB"}});return published});
  }

  private versionedModel(periodId: string, roleId: string) {
    return this.prisma.periodAssessmentModel.findFirst({
      where: { periodId, roleId, active:true },
      include: {
        modelVersion: {
          include: {
            sections: {
              where: { active: true },
              orderBy: { sortOrder: "asc" },
              include: {
                responseScale: { include: { options: { where: { active: true }, orderBy: { sortOrder: "asc" } } } },
                dimensions: {
                  where: { active: true },
                  orderBy: { sortOrder: "asc" },
                  include: {
                    items: {
                      where: { active: true },
                      orderBy: { sortOrder: "asc" },
                      include: {
                        behavior: true,
                        responseScale: { include: { options: { where: { active: true }, orderBy: { sortOrder: "asc" } } } },
                        maturityLevel: { select: { code: true, name: true } },
                      },
                    },
                  },
                },
              },
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
    const rows=await this.prisma.roleMaturity.findMany({
      where: { calibratedAt: null, selfAssessmentId: { not: null } },
      orderBy: [{role:{name:"asc"}},{person:{names:"asc"}},{evaluatedAt:"desc"}],
      include: {
        level: { select: { code: true, name: true } },
        period: { select: { id: true, code: true, name: true } },
        person: { select: { id: true, dni: true, names: true } },
        role: { select: { id: true, sourceId: true, name: true } },
      },
    });
    return this.calibrationRows(rows);
  }

  async listCalibrations(){
    this.prisma.requireConnection();
    const rows=await this.prisma.roleMaturity.findMany({where:{selfAssessmentId:{not:null}},orderBy:[{role:{name:"asc"}},{person:{names:"asc"}},{evaluatedAt:"desc"}],include:{level:{select:{code:true,name:true}},period:{select:{id:true,code:true,name:true,status:{select:{code:true,name:true}}}},selfAssessment:{select:{configurationVersion:true,modelVersion:{select:{id:true,version:true,assessmentModel:{select:{name:true}}}}}},person:{select:{id:true,dni:true,names:true}},role:{select:{id:true,sourceId:true,name:true}}}});
    return this.calibrationRows(rows);
  }

  private async calibrationRows<T extends {personId:string;roleId:string}>(rows:T[]){
    const assignments=await this.prisma.personRole.findMany({where:{status:{code:"ACTIVO"},OR:rows.map(row=>({personId:row.personId,roleId:row.roleId}))},include:{team:true}});
    const teamsByPair=new Map<string,typeof assignments>();
    for(const assignment of assignments){const key=`${assignment.personId}|${assignment.roleId}`;teamsByPair.set(key,[...(teamsByPair.get(key)??[]),assignment])}
    return rows.map(row=>{const teams=teamsByPair.get(`${row.personId}|${row.roleId}`)??[];return{...row,teamIds:teams.map(item=>item.teamId),team:teams.map(item=>item.team.sourceId).join(", ")||"Sin equipo activo"}});
  }

  async teamMaturityOptions(teamIds:string[]|null=null){
    const[teams,periods]=await Promise.all([this.prisma.team.findMany({where:{status:{code:"ACTIVO"},id:teamIds===null?undefined:{in:teamIds}},include:{program:true},orderBy:{sourceId:"asc"}}),this.prisma.period.findMany({where:{status:{code:{not:"CANCELADO"}}},include:{status:true},orderBy:{startDate:"desc"}})]);
    return{teams:teams.map(x=>({id:x.id,label:`${x.sourceId} · ${x.name}`})),periods:periods.map(x=>({id:x.id,label:x.name,status:x.status.code}))};
  }

  async listTeamMaturities(filters:{periodId?:string;teamId?:string},teamIds:string[]|null=null){
    const teamId=teamIds===null?filters.teamId||undefined:{in:teamIds,...(filters.teamId?{equals:filters.teamId}:{})};
    return this.prisma.teamMaturity.findMany({where:{periodId:filters.periodId||undefined,teamId},include:{team:{include:{program:true}},period:true,level:true},orderBy:[{period:{startDate:"desc"}},{team:{sourceId:"asc"}}]});
  }

  async saveTeamMaturity(input:{teamId:string;periodId:string;score:number;comments?:string},administratorId:string){
    if(!Number.isFinite(input.score)||input.score<0||input.score>2)throw new BadRequestException("El puntaje del equipo debe estar entre 0 y 2");
    const[team,period]=await Promise.all([this.prisma.team.findUnique({where:{id:input.teamId}}),this.prisma.period.findUnique({where:{id:input.periodId},include:{status:true}})]);if(!team||!period)throw new NotFoundException("No se encontró el equipo o período");if(period.status.code==="CANCELADO")throw new BadRequestException("No se puede evaluar un período cancelado");
    const level=this.scoring.levelFor(input.score,{trainedPerson:false,facilitatedCamp:false,teamIsOfficial:false});
    const levelId=await this.catalogValueId("NIVEL_MADUREZ",level);
    return this.prisma.$transaction(async tx=>{const current=await tx.teamMaturity.findUnique({where:{teamId_periodId:{teamId:input.teamId,periodId:input.periodId}}});const row=await tx.teamMaturity.upsert({where:{teamId_periodId:{teamId:input.teamId,periodId:input.periodId}},create:{teamId:input.teamId,periodId:input.periodId,evaluatedAt:new Date(),score:input.score,levelId,comments:input.comments?.trim()||null},update:{evaluatedAt:new Date(),score:input.score,levelId,comments:input.comments?.trim()||null},include:{team:true,period:true,level:true}});await tx.audit.create({data:{occurredAt:new Date(),userId:administratorId,action:current?"UPDATE":"CREATE",entity:"TEAM_MATURITY",recordId:row.id,oldValue:current?this.snapshot(current):undefined,newValue:this.snapshot(row),result:"OK",origin:"WEB"}});return row});
  }

  async maturityHistory(filters:{periodId?:string;teamId?:string},teamIds:string[]|null=null){
    const teamId=teamIds===null?filters.teamId||undefined:{in:teamIds,...(filters.teamId?{equals:filters.teamId}:{})};
    const[teams,results]=await Promise.all([this.listTeamMaturities(filters,teamIds),this.prisma.roleMaturity.findMany({where:{periodId:filters.periodId||undefined},include:{period:true,level:true,person:true,role:true},orderBy:[{role:{name:"asc"}},{person:{names:"asc"}},{evaluatedAt:"desc"}]})]);
    const assignments=await this.prisma.personRole.findMany({where:{status:{code:"ACTIVO"},developmentPathMode:"STANDARD",teamId},include:{team:true}});
    const assignmentMap=new Map<string,typeof assignments>();
    for(const assignment of assignments){const key=`${assignment.personId}|${assignment.roleId}`;assignmentMap.set(key,[...(assignmentMap.get(key)??[]),assignment])}
    const roles=results.flatMap(result=>{const related=assignmentMap.get(`${result.personId}|${result.roleId}`)??[];return related.length?[{id:result.id,person:result.person.names,personDni:result.person.dni,roleId:result.roleId,role:result.role.name,teamId:related[0].teamId,teamIds:related.map(item=>item.teamId),team:related.map(item=>item.team.sourceId).join(", "),period:result.period.name,periodId:result.periodId,score:Number(result.score),selfAssessmentScore:result.selfAssessmentScore===null?null:Number(result.selfAssessmentScore),calibratedScore:result.calibratedScore===null?null:Number(result.calibratedScore),calibratedAt:result.calibratedAt?.toISOString()??null,legacyRecord:result.legacyRecord,level:result.level.name,evaluatedAt:result.evaluatedAt.toISOString().slice(0,10)}]:[]});
    return{teams:teams.map(x=>({id:x.id,teamId:x.teamId,team:x.team.sourceId,program:x.team.name,period:x.period.name,periodId:x.periodId,score:Number(x.score),level:x.level.name,evaluatedAt:x.evaluatedAt.toISOString().slice(0,10),comments:x.comments})),roles};
  }

  async getCalibration(id: string) {
    const maturity = await this.prisma.roleMaturity.findUnique({ where: { id }, include: { level: true, period: {include:{status:true}}, person:true,role:true,selfAssessment: { include: { modelVersion:{include:{assessmentModel:{select:{name:true}}}},responses: { orderBy: [{ dimensionCode: "asc" }, { behaviorId: "asc" }] }, resultDetails: { orderBy: [{ scopeType: "asc" }, { scopeCode: "asc" }] } } } } });
    if (!maturity) throw new NotFoundException("No se encontró la calibración");
    const [people,relatedAssignments] = await Promise.all([
      this.prisma.person.findMany({ select: { id: true, names: true }, orderBy: { names: "asc" } }),
      this.prisma.personRole.findMany({where:{personId:maturity.personId,roleId:maturity.roleId,status:{code:"ACTIVO"}},include:{team:true},orderBy:{team:{sourceId:"asc"}}}),
    ]);
    const officialTeamMaturities=await this.prisma.teamMaturity.findMany({ where: { teamId: {in:relatedAssignments.map(item=>item.teamId)}, periodId: maturity.periodId, level: { code: "OFICIAL" } }, select: { id: true,teamId:true } });
    const modelVersion=maturity.selfAssessment?.modelVersion;
    const integrityReason=!maturity.selfAssessment?"No existe una autoevaluación asociada":!modelVersion?"No se puede identificar la versión del modelo utilizada":maturity.period.status.code!=="CALIBRACION"?"El período no se encuentra en etapa de calibración":null;
    return { id: maturity.id, personId:maturity.person.id,person: maturity.person.names, role: maturity.role.name, team: relatedAssignments.map(item=>item.team.sourceId).join(", ")||"Sin equipo activo",teams:relatedAssignments.map(item=>({id:item.teamId,label:`${item.team.sourceId} · ${item.team.name}`})), period: maturity.period.name,periodStatus:maturity.period.status.code,model:modelVersion?{id:modelVersion.id,name:modelVersion.assessmentModel.name,version:modelVersion.version}:null,integrity:{canCalibrate:integrityReason===null,reason:integrityReason}, originalScore: Number(maturity.selfAssessmentScore ?? maturity.score), calibratedScore:maturity.calibratedScore===null?null:Number(maturity.calibratedScore),calibratedAt:maturity.calibratedAt,calibrationComments:maturity.calibrationComments, level: maturity.level.code, responses: maturity.selfAssessment?.responses.map((r) => ({ behaviorId: r.behaviorId, statement: r.behaviorStatement, score: Number(r.score), comments: r.comments, dimensionCode: r.dimensionCode, dimensionName: r.dimensionName })) ?? [], resultDetails:maturity.selfAssessment?.resultDetails.map(detail=>({scopeType:detail.scopeType,scopeCode:detail.scopeCode,scopeName:detail.scopeName,score:detail.score===null?null:Number(detail.score),positiveCount:detail.positiveCount,responseCount:detail.responseCount,completionPercentage:detail.completionPercentage===null?null:Number(detail.completionPercentage),weight:Number(detail.weight)}))??[], people:people.filter(person=>person.id!==maturity.person.id), officialTeamMaturities };
  }

  async getSelfAssessmentForm(personRoleId?: string,teamIds:string[]|null=null,personId:string|null=null) {
    this.prisma.requireConnection();
    const assignments=await this.prisma.personRole.findMany({where:{personId:personId??undefined,person:personId===null?{dni:{startsWith:"DEMO"}}:undefined,teamId:teamIds===null?undefined:{in:teamIds},status:{code:"ACTIVO"},developmentPathMode:"STANDARD"},include:{person:true,role:true,team:true},orderBy:[{team:{sourceId:"asc"}},{role:{name:"asc"}}]});
    const roleAssignments=[...new Map(assignments.map(item=>[item.roleId,item])).values()];
    const requestedAssignment=personRoleId?assignments.find(item=>item.id===personRoleId):undefined;
    const assignment=requestedAssignment?roleAssignments.find(item=>item.roleId===requestedAssignment.roleId):roleAssignments[0];
    if (!assignment) throw new NotFoundException("No se encontró una asignación para autoevaluar");
    const period = await this.prisma.period.findFirst({
      where: { active: true, status: { code: "AUTOEVALUACION", catalog: { code: "ESTADO_PERIODO_MADUREZ" } } },
      orderBy: { startDate: "desc" },
      include: { status: true },
    }) ?? await this.prisma.period.findFirst({ orderBy: { startDate: "desc" }, include: { status: true } });
    if (!period) throw new NotFoundException("No existe un período de madurez configurado");
    const submitted=await this.prisma.roleSelfAssessment.findMany({where:{periodId:period.id,personId:assignment.personId},select:{roleId:true,submittedAt:true,status:{select:{code:true,name:true}}}});
    const submittedByRole=new Map(submitted.map(item=>[item.roleId,item]));
    const configured=await this.versionedModel(period.id,assignment.roleId);
    if(configured?.active&&configured.modelVersion.status!=="DRAFT"){
      const dimensions=configured.modelVersion.sections.flatMap(section=>section.dimensions.map(dimension=>({
        id:dimension.id,code:dimension.code,name:dimension.name,description:dimension.description,
        section:{id:section.id,code:section.code,name:section.name,type:section.type,weight:Number(section.weight)},
        behaviors:dimension.items.map(item=>{const scale=item.responseScale??section.responseScale;return{
          id:item.behaviorId,itemVersionId:item.id,statement:item.statement,helpText:item.helpText,maturityLevel:item.maturityLevel,
          options:scale.options.map(option=>({id:option.id,code:option.code,label:option.label,value:Number(option.numericValue)})),
        }})
      })));
      return { personRoleId: assignment.id, person: assignment.person.names, role: assignment.role.name, team: assignments.filter(item=>item.roleId===assignment.roleId).map(item=>item.team.sourceId).join(", "), period: { id: period.id, code: period.code, name: period.name, status: period.status.code, configurationVersion: configured.modelVersion.version }, modelVersion:{id:configured.modelVersion.id,version:configured.modelVersion.version}, canSubmit: period.status.code === "AUTOEVALUACION"&&!submittedByRole.has(assignment.roleId), dimensions,availableRoles:roleAssignments.map(item=>({personRoleId:item.id,role:item.role.name,team:assignments.filter(candidate=>candidate.roleId===item.roleId).map(candidate=>candidate.team.sourceId).join(", "),status:submittedByRole.get(item.roleId)?.status.name??"Pendiente",submitted:Boolean(submittedByRole.has(item.roleId))})),progress:{completed:submittedByRole.size,total:roleAssignments.length} };
    }
    const behaviors = await this.prisma.observableBehavior.findMany({
      where: { active: true, dimension: { active: true }, roles: { some: { roleId: assignment.roleId, active: true } } },
      include: { dimension: true }, orderBy: [{ dimension: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    });
    const grouped = new Map<string, { id: string; code: string; name: string; description: string | null; behaviors: { id: string; statement: string; helpText: string | null; options: { id: null; code: string; label: string; value: number }[] }[] }>();
    for (const item of behaviors) { const dimension = grouped.get(item.dimensionId) ?? { id: item.dimension.id, code: item.dimension.code, name: item.dimension.name, description: item.dimension.description, behaviors: [] }; dimension.behaviors.push({ id: item.id, statement: item.statement, helpText: item.helpText,options:[{id:null,code:"NOT_DEMONSTRATED",label:"No demostrado",value:0},{id:null,code:"WITH_SUPPORT",label:"Con apoyo",value:1},{id:null,code:"AUTONOMOUS",label:"Autónomo",value:2}] }); grouped.set(item.dimensionId, dimension); }
    return { personRoleId: assignment.id, person: assignment.person.names, role: assignment.role.name, team: assignments.filter(item=>item.roleId===assignment.roleId).map(item=>item.team.sourceId).join(", "), period: { id: period.id, code: period.code, name: period.name, status: period.status.code, configurationVersion: period.configurationVersion }, canSubmit: period.status.code === "AUTOEVALUACION"&&!submittedByRole.has(assignment.roleId), dimensions: [...grouped.values()],availableRoles:roleAssignments.map(item=>({personRoleId:item.id,role:item.role.name,team:assignments.filter(candidate=>candidate.roleId===item.roleId).map(candidate=>candidate.team.sourceId).join(", "),status:submittedByRole.get(item.roleId)?.status.name??"Pendiente",submitted:Boolean(submittedByRole.has(item.roleId))})),progress:{completed:submittedByRole.size,total:roleAssignments.length} };
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
        select: { id: true, personId: true, roleId: true, developmentPathMode: true },
      }),
    ]);
    if (!period || !personRole) throw new NotFoundException("No se encontró el período o la asignación del rol");
    if(personRole.developmentPathMode!=="STANDARD")throw new BadRequestException("La asignación no tiene ruta de desarrollo y no admite evaluaciones de madurez");
    if (period.status.code !== "AUTOEVALUACION") throw new BadRequestException("El período no admite autoevaluaciones");
    const configured=await this.versionedModel(period.id,personRole.roleId);
    const expectedVersion=configured?.active&&configured.modelVersion.status!=="DRAFT"?configured.modelVersion.version:period.configurationVersion;
    if (expectedVersion !== input.configurationVersion) throw new BadRequestException("La versión del formulario no corresponde al período y rol");
    if(await this.prisma.roleSelfAssessment.findFirst({where:{periodId:input.periodId,personId:personRole.personId,roleId:personRole.roleId,modelVersionId:configured?.modelVersion.id??null},select:{id:true}}))throw new BadRequestException("La autoevaluación de esta persona, rol y modelo ya fue enviada para el período");
    const existingMaturity=await this.prisma.roleMaturity.findFirst({where:{periodId:input.periodId,personId:personRole.personId,roleId:personRole.roleId,modelVersionId:configured?.modelVersion.id??null},select:{id:true}});

    if(configured?.active&&configured.modelVersion.status!=="DRAFT"){
      const items=configured.modelVersion.sections.flatMap(section=>section.dimensions.flatMap(dimension=>dimension.items.map(item=>({section,dimension,item,scale:item.responseScale??section.responseScale}))));
      const answers=new Map(input.answers.map(answer=>[answer.behaviorId,answer]));
      if(items.length===0||items.some(entry=>!answers.has(entry.item.behaviorId))||answers.size!==items.length)throw new BadRequestException("Se deben responder todos y únicamente los comportamientos aplicables al rol");
      const selectedOptions=new Map<string,{id:string;value:number;positive:boolean}>();
      for(const entry of items){const answer=answers.get(entry.item.behaviorId)!;const option=entry.scale.options.find(candidate=>Number(candidate.numericValue)===answer.score);if(!option)throw new BadRequestException(`La respuesta no pertenece a la escala configurada: ${entry.item.statement}`);selectedOptions.set(entry.item.id,{id:option.id,value:Number(option.numericValue),positive:option.isPositive});}
      const details:{scopeType:"SECTION"|"DIMENSION"|"LEVEL"|"TOTAL";scopeCode:string;scopeName:string;score:number|null;positiveCount:number|null;responseCount:number;completionPercentage:number|null;weight:number}[]=[];
      let weightedTotal=0,totalSectionWeight=0;
      for(const section of configured.modelVersion.sections){let weightedSection=0,totalDimensionWeight=0;for(const dimension of section.dimensions){let sum=0,totalWeight=0;for(const item of dimension.items){const selected=selectedOptions.get(item.id)!;sum+=selected.value*Number(item.weight);totalWeight+=Number(item.weight)}const dimensionScore=Math.round(sum/totalWeight*10000)/10000;weightedSection+=dimensionScore*Number(dimension.weight);totalDimensionWeight+=Number(dimension.weight);details.push({scopeType:"DIMENSION",scopeCode:`${section.code}:${dimension.code}`,scopeName:dimension.name,score:dimensionScore,positiveCount:null,responseCount:dimension.items.length,completionPercentage:null,weight:Number(dimension.weight)})}const sectionScore=Math.round(weightedSection/totalDimensionWeight*10000)/10000;weightedTotal+=sectionScore*Number(section.weight);totalSectionWeight+=Number(section.weight);details.push({scopeType:"SECTION",scopeCode:section.code,scopeName:section.name,score:sectionScore,positiveCount:null,responseCount:section.dimensions.reduce((total,dimension)=>total+dimension.items.length,0),completionPercentage:null,weight:Number(section.weight)})}
      const levelGroups=new Map<string,{name:string;positive:number;total:number}>();for(const entry of items){if(!entry.item.maturityLevel)continue;const current=levelGroups.get(entry.item.maturityLevel.code)??{name:entry.item.maturityLevel.name,positive:0,total:0};current.total++;if(selectedOptions.get(entry.item.id)!.positive)current.positive++;levelGroups.set(entry.item.maturityLevel.code,current)}for(const [code,value] of levelGroups)details.push({scopeType:"LEVEL",scopeCode:code,scopeName:value.name,score:null,positiveCount:value.positive,responseCount:value.total,completionPercentage:Math.round(value.positive/value.total*10000)/10000,weight:1});
      const resultScore=Math.round(weightedTotal/totalSectionWeight*10000)/10000;details.push({scopeType:"TOTAL",scopeCode:"GLOBAL",scopeName:"Puntaje global",score:resultScore,positiveCount:null,responseCount:items.length,completionPercentage:null,weight:1});
      const [submittedStatusId,levelId]=await Promise.all([this.catalogValueId("ESTADO_AUTOEVALUACION","ENVIADA"),this.catalogValueId("NIVEL_MADUREZ",this.scoring.levelFor(resultScore))]);
      return this.prisma.$transaction(async transaction=>{const assessment=await transaction.roleSelfAssessment.create({data:{personId:personRole.personId,roleId:personRole.roleId,personRoleId:input.personRoleId,periodId:input.periodId,statusId:submittedStatusId,modelVersionId:configured.modelVersion.id,configurationVersion:configured.modelVersion.version,calculatedScore:resultScore,submittedAt:new Date(),responses:{create:items.map(entry=>({behaviorId:entry.item.behaviorId,itemVersionId:entry.item.id,responseOptionId:selectedOptions.get(entry.item.id)!.id,score:answers.get(entry.item.behaviorId)!.score,comments:answers.get(entry.item.behaviorId)!.comments,behaviorStatement:entry.item.statement,behaviorWeight:entry.item.weight,dimensionCode:entry.dimension.code,dimensionName:entry.dimension.name,dimensionWeight:entry.dimension.weight}))},resultDetails:{create:details}}});const maturityData={personId:personRole.personId,roleId:personRole.roleId,modelVersionId:configured.modelVersion.id,personRoleId:input.personRoleId,periodId:input.periodId,selfAssessmentId:assessment.id,evaluatedAt:new Date(),score:resultScore,selfAssessmentScore:resultScore,calibratedScore:null,calibratedAt:null,calibratedById:null,calibrationComments:null,levelId};const maturity=existingMaturity?await transaction.roleMaturity.update({where:{id:existingMaturity.id},data:maturityData}):await transaction.roleMaturity.create({data:maturityData});return{assessmentId:assessment.id,roleMaturityId:maturity.id,score:resultScore,level:this.scoring.levelFor(resultScore),dimensionScores:details.filter(detail=>detail.scopeType==="DIMENSION").map(detail=>detail.score)}});
    }

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
          personId: personRole.personId,
          roleId: personRole.roleId,
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

      const maturityData = {
        personId: personRole.personId,
        roleId: personRole.roleId,
        modelVersionId: null,
        personRoleId: input.personRoleId,
        periodId: input.periodId,
        selfAssessmentId: assessment.id,
        evaluatedAt: new Date(),
        score: result.score,
        selfAssessmentScore: result.score,
        calibratedScore: null,
        calibratedAt: null,
        calibratedById: null,
        calibrationComments: null,
        levelId,
      };
      const maturity = existingMaturity
        ? await transaction.roleMaturity.update({ where:{ id:existingMaturity.id }, data:maturityData })
        : await transaction.roleMaturity.create({ data:maturityData });
      return { assessmentId: assessment.id, roleMaturityId: maturity.id, ...result };
    });
  }

  async calibrate(input: CalibrateRoleMaturity, administratorId: string) {
    this.prisma.requireConnection();
    const maturity = await this.prisma.roleMaturity.findUnique({
      where: { id: input.roleMaturityId },
      include: { selfAssessment:{select:{id:true,modelVersionId:true}},person:true,role:true,period:{include:{status:true}} },
    });
    if (!maturity) throw new NotFoundException("No se encontró el resultado de madurez");
    if(!maturity.selfAssessment)throw new BadRequestException("No existe una autoevaluación asociada a este resultado");
    if(!maturity.selfAssessment.modelVersionId)throw new BadRequestException("No se puede calibrar porque no se identificó la versión del modelo utilizada");
    if(maturity.period.status.code!=="CALIBRACION")throw new BadRequestException("El período no se encuentra en etapa de calibración");
    if(maturity.calibratedAt)throw new BadRequestException("Esta autoevaluación ya fue calibrada");
    const existingCalibration=await this.prisma.roleMaturity.findFirst({where:{id:{not:maturity.id},periodId:maturity.periodId,modelVersionId:maturity.modelVersionId,calibratedAt:{not:null},personId:maturity.personId,roleId:maturity.roleId},select:{id:true}});
    if(existingCalibration)throw new BadRequestException("Esta persona y rol ya tienen una calibración final para el período");
    const relatedAssignments=await this.prisma.personRole.findMany({where:{personId:maturity.personId,roleId:maturity.roleId,status:{code:"ACTIVO"}},include:{team:true}});
    const relatedTeamIds=relatedAssignments.map(item=>item.teamId);
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
      if(mastery.trainedPersonId===maturity.personId)throw new BadRequestException("La persona formada debe ser distinta de la persona evaluada");
      const campDate=new Date(`${mastery.campDate}T00:00:00Z`);if(campDate>new Date())throw new BadRequestException("La fecha del campamento no puede estar en el futuro");
      const [teamMaturity,trainedPerson] = await Promise.all([this.prisma.teamMaturity.findFirst({
        where: {
          id: mastery.teamMaturityId,
          teamId: {in:relatedTeamIds},
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
      const template=await transaction.communicationTemplate.findFirst({where:{code:"MATURITY_RESULT_AVAILABLE",active:true}});
      if(template){const variables={personName:maturity.person.names,roleName:maturity.role.name,teamCode:relatedAssignments.map(item=>item.team.sourceId).join(", ")||"Sin equipo activo",periodName:maturity.period.name,score:input.calibratedScore.toFixed(2),levelName:level};const subject=template.subjectTemplate.replace(/\{\{(\w+)\}\}/g,(_,key)=>String(variables[key as keyof typeof variables]??""));await transaction.communication.create({data:{eventType:"MATURITY_RESULT_AVAILABLE",recipient:maturity.person.email,subject,templateCode:template.code,variables,status:maturity.person.email?"PENDIENTE":"OMITIDA_SIN_CORREO",source:"AUTOMATICA",dedupeKey:`MATURITY_RESULT_AVAILABLE:${updated.id}`,personRoleId:maturity.personRoleId,periodId:maturity.periodId,requestedById:administratorId}})}
      return { id: updated.id, score: Number(updated.score), level, masteryQualified };
    });
  }
}
