import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class DirectoryRepository {
  constructor(private readonly prisma: PrismaService) {}
  private snapshot(value:unknown){return JSON.parse(JSON.stringify(value,(_,item)=>typeof item==="bigint"?item.toString():item))}
  private text(input:Record<string,unknown>,key:string,required=true){const value=typeof input[key]==="string"?(input[key] as string).trim():"";if(required&&!value)throw new BadRequestException(`${key} es obligatorio`);return value||null}

  async listPeople(search = "",teamIds:string[]|null=null) {
    const term = search.trim();
    const people = await this.prisma.person.findMany({
      where: {
        assignments:teamIds===null?undefined:{some:{teamId:{in:teamIds}}},
        OR:term ? [
          { dni: { contains: term, mode: "insensitive" } },
          { names: { contains: term, mode: "insensitive" } },
          { email: { contains: term, mode: "insensitive" } },
          { company: { name: { contains: term, mode: "insensitive" } } },
        ]:undefined,
      },
      include: {
        company: true,
        organizationalUnit: true,
        status: true,
        assignments: { where:teamIds===null?undefined:{teamId:{in:teamIds}},include: { role: true, status:true,onboardingStatus:true,team: { include: { program: true } } } },
      },
      orderBy: [{ names: "asc" }, { dni: "asc" }],
      take: 1000,
    });
    return people.map((person) => ({
      id: person.id,
      dni: person.dni,
      names: person.names,
      email: person.email,
      company: person.company.name,
      companyId:person.companyId,
        organizationalUnit: person.organizationalUnit?.name ?? null,
        organizationalUnitId:person.organizationalUnitId,
        phone:person.phone,
        position:person.position,
        occupationLevelId:person.occupationLevelId,
        businessPartnerId:person.businessPartnerId,
      status: person.status.name,
      statusId:person.statusId,
      assignments: person.assignments.map((assignment) => ({
        id:assignment.id,
        role: assignment.role.name,
        team: assignment.team.sourceId,
        program: assignment.team.program.name,
        status:assignment.status.name,
        statusId:assignment.statusId,
        onboardingStatus:assignment.onboardingStatus.name,
        onboardingStatusId:assignment.onboardingStatusId,
        startDate:assignment.startDate?.toISOString().slice(0,10)??null,
        endDate:assignment.endDate?.toISOString().slice(0,10)??null,
      })),
    }));
  }

  async getPersonProfile(id:string,teamIds:string[]|null=null){
    const person=await this.prisma.person.findFirst({
      where:{id,assignments:teamIds===null?undefined:{some:{teamId:{in:teamIds}}}},
      include:{company:true,organizationalUnit:true,businessPartner:true,occupationLevel:true,status:true,assignments:{where:teamIds===null?undefined:{teamId:{in:teamIds}},include:{role:true,team:{include:{program:true}},status:true,onboardingStatus:true,courses:{include:{course:{include:{module:true}},status:true},orderBy:{course:{name:"asc"}}},maturities:{include:{period:true,level:true},orderBy:{evaluatedAt:"desc"}}},orderBy:{startDate:"desc"}}},
    });
    if(!person)throw new NotFoundException("No se encontró la persona o no pertenece a tus equipos");
    return{...person,createdAt:person.createdAt.toISOString(),updatedAt:person.updatedAt.toISOString(),assignments:person.assignments.map(a=>({...a,startDate:a.startDate?.toISOString().slice(0,10)??null,endDate:a.endDate?.toISOString().slice(0,10)??null,courses:a.courses.map(c=>({...c,score:c.score?.toString()??null,startDate:c.startDate?.toISOString().slice(0,10)??null,endDate:c.endDate?.toISOString().slice(0,10)??null})),maturities:a.maturities.map(m=>({...m,score:m.score.toString(),selfAssessmentScore:m.selfAssessmentScore?.toString()??null,calibratedScore:m.calibratedScore?.toString()??null,evaluatedAt:m.evaluatedAt.toISOString().slice(0,10)}))}))};
  }

  async listAssignments(filters:{search?:string;teamId?:string;roleId?:string;statusId?:string;onboardingStatusId?:string},teamIds:string[]|null=null){
    const term=filters.search?.trim();
    return this.prisma.personRole.findMany({where:{teamId:filters.teamId||undefined,roleId:filters.roleId||undefined,statusId:filters.statusId||undefined,onboardingStatusId:filters.onboardingStatusId||undefined,AND:teamIds===null?undefined:[{teamId:{in:teamIds}}],OR:term?[{person:{names:{contains:term,mode:"insensitive"}}},{person:{dni:{contains:term,mode:"insensitive"}}},{role:{name:{contains:term,mode:"insensitive"}}},{team:{sourceId:{contains:term,mode:"insensitive"}}}]:undefined},include:{person:{include:{company:true}},role:true,team:{include:{program:true}},status:true,onboardingStatus:true,_count:{select:{courses:true}}},orderBy:[{person:{names:"asc"}},{role:{name:"asc"}}],take:500});
  }

  async bulkUpdateAssignments(input:{ids:string[];statusId?:string;onboardingStatusId?:string;endDate?:string},administratorId:string,teamIds:string[]|null=null){
    if(!input.statusId&&!input.onboardingStatusId)throw new BadRequestException("Indica el estado de asignación o de onboarding");
    const [status,onboarding]=await Promise.all([input.statusId?this.prisma.catalogValue.findFirst({where:{id:input.statusId,catalog:{code:"ESTADO_ASIGNACION"}}}):null,input.onboardingStatusId?this.prisma.catalogValue.findFirst({where:{id:input.onboardingStatusId,catalog:{code:"ESTADO_ONBOARDING"}}}):null]);
    if(input.statusId&&!status||input.onboardingStatusId&&!onboarding)throw new BadRequestException("El estado seleccionado no es válido");
    const results:{id:string;ok:boolean;message:string}[]=[];
    for(const id of [...new Set(input.ids)]){
      try{
        const current=await this.prisma.personRole.findUnique({where:{id},include:{status:true,person:true,role:true,team:true}});if(!current)throw new Error("No se encontró la asignación");
        if(teamIds!==null&&!teamIds.includes(current.teamId))throw new Error("La asignación no pertenece a tus equipos autorizados");
        const closes=status&&status.code!=="ACTIVO";const endDate=closes?(input.endDate?new Date(input.endDate):new Date()):status?.code==="ACTIVO"?null:current.endDate;
        if(endDate&&current.startDate&&endDate<current.startDate)throw new Error("La fecha final es anterior a la fecha inicial");
        await this.prisma.$transaction(async tx=>{const updated=await tx.personRole.update({where:{id},data:{statusId:status?.id,onboardingStatusId:onboarding?.id,endDate}});await tx.audit.create({data:{occurredAt:new Date(),userId:administratorId,action:"BULK_UPDATE",entity:"PERSON_ROLE",recordId:id,oldValue:this.snapshot(current),newValue:this.snapshot(updated),result:"OK",origin:"WEB"}});if(status&&status.code!==current.status.code){const eventType=status.code==="ACTIVO"?"ROLE_REACTIVATED":"ROLE_CLOSED";await tx.communication.create({data:{eventType,recipient:current.person.email,subject:status.code==="ACTIVO"?`Rol reactivado: ${current.role.name}`:`Rol cerrado: ${current.role.name}`,templateCode:eventType,variables:{personName:current.person.names,roleName:current.role.name,teamCode:current.team.sourceId,endDate:endDate?.toISOString().slice(0,10)??null},status:current.person.email?"PENDIENTE":"OMITIDA_SIN_CORREO",source:"AUTOMATICA",dedupeKey:`${eventType}:${id}:${Date.now()}`,personRoleId:id,requestedById:administratorId}})}});
        results.push({id,ok:true,message:"Actualizada"});
      }catch(error){results.push({id,ok:false,message:error instanceof Error?error.message:"No se pudo actualizar"})}
    }
    return{total:results.length,succeeded:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,results};
  }

  async listTeams(search = "",teamIds:string[]|null=null) {
    const term = search.trim();
    const teams = await this.prisma.team.findMany({
      where: {
        id:teamIds===null?undefined:{in:teamIds},
        OR:term ? [
          { sourceId: { contains: term, mode: "insensitive" } },
          { program: { name: { contains: term, mode: "insensitive" } } },
          { unit: { name: { contains: term, mode: "insensitive" } } },
        ]:undefined,
      },
      include: {
        program: true,
        unit: { include: { company: true } },
        status: true,
        assignments: {
          where: { status: { code: "ACTIVO" }, role: { status: { code: "ACTIVO" } } },
          include: { person: true, role: true },
        },
      },
      orderBy: { sourceId: "asc" },
      take: 100,
    });
    return teams.map((team) => ({
      id: team.id,
      sourceId: team.sourceId,
      name:team.sourceId,
      program: team.program.name,
      programId:team.programId,
      unit: team.unit?.name ?? null,
      unitId:team.unitId,
      company: team.unit?.company?.name ?? null,
      status: team.status.name,
      statusId:team.statusId,
      members: team.assignments.map((assignment) => ({
        name: assignment.person.names,
        role: assignment.role.name,
      })),
    }));
  }

  async listAssignmentOptions(teamIds:string[]|null=null) {
    const [people, roles, teams,values] = await Promise.all([
      this.prisma.person.findMany({where:teamIds===null?{status:{code:"ACTIVO"}}:{status:{code:"ACTIVO"},assignments:{some:{teamId:{in:teamIds},status:{code:"ACTIVO"}}}}, include: { company: true }, orderBy: { names: "asc" } }),
      this.prisma.role.findMany({where:teamIds===null?{status:{code:"ACTIVO"}}:{status:{code:"ACTIVO"},assignments:{some:{teamId:{in:teamIds},status:{code:"ACTIVO"}}}}, orderBy: { name: "asc" } }),
      this.prisma.team.findMany({where:teamIds===null?undefined:{id:{in:teamIds}}, include: { program: true }, orderBy: { sourceId: "asc" } }),
      this.prisma.catalogValue.findMany({where:{active:true,catalog:{code:{in:["ESTADO_ASIGNACION","ESTADO_ONBOARDING"]}}},include:{catalog:true},orderBy:{sortOrder:"asc"}}),
    ]);
    return {
      people: people.map((item) => ({ id: item.id, label: `${item.names} · ${item.dni} · ${item.company.name}` })),
      roles: roles.map((item) => ({ id: item.id, label: item.name })),
      teams: teams.map((item) => ({ id: item.id, label: `${item.sourceId} · ${item.program.name}` })),
      assignmentStatuses:values.filter(item=>item.catalog.code==="ESTADO_ASIGNACION").map(item=>({id:item.id,label:item.name,code:item.code})),
      onboardingStatuses:values.filter(item=>item.catalog.code==="ESTADO_ONBOARDING").map(item=>({id:item.id,label:item.name,code:item.code})),
    };
  }

  async adminOptions(){
    const [companies,units,programs,businessPartners,values]=await Promise.all([
      this.prisma.company.findMany({where:{active:true},orderBy:{name:"asc"},select:{id:true,code:true,name:true}}),
      this.prisma.organizationalUnit.findMany({orderBy:{name:"asc"},select:{id:true,code:true,name:true,companyId:true}}),
      this.prisma.program.findMany({where:{active:true},orderBy:{name:"asc"},select:{id:true,code:true,name:true}}),
      this.prisma.businessPartner.findMany({where:{active:true},orderBy:{name:"asc"},select:{id:true,code:true,name:true}}),
      this.prisma.catalogValue.findMany({where:{active:true,catalog:{code:{in:["ESTADO_PERSONA","NIVEL_OCUPACIONAL","ESTADO_EQUIPO","TIPO_ROL","ESTADO_ROL","MODULO_CURSO","ESTADO_CURSO"]}}},orderBy:[{catalog:{code:"asc"}},{sortOrder:"asc"}],select:{id:true,code:true,name:true,catalog:{select:{code:true}}}}),
    ]);
    return{companies,units,programs,businessPartners,catalogs:Object.fromEntries(["ESTADO_PERSONA","NIVEL_OCUPACIONAL","ESTADO_EQUIPO","TIPO_ROL","ESTADO_ROL","MODULO_CURSO","ESTADO_CURSO"].map(code=>[code,values.filter(value=>value.catalog.code===code).map(({catalog:_,...value})=>value)]))};
  }

  async savePerson(id:string|null,input:Record<string,unknown>,userId:string){
    const current=id?await this.prisma.person.findUnique({where:{id},include:{status:true}}):null;if(id&&!current)throw new NotFoundException("No se encontró la persona");
    const data={dni:this.text(input,"dni")!,companyId:this.text(input,"companyId")!,names:this.text(input,"names")!,email:this.text(input,"email",false),phone:this.text(input,"phone",false),position:this.text(input,"position",false),occupationLevelId:this.text(input,"occupationLevelId",false),organizationalUnitId:this.text(input,"organizationalUnitId",false),businessPartnerId:this.text(input,"businessPartnerId",false),statusId:this.text(input,"statusId")!};
    const [company,status,unit,occupationLevel,businessPartner]=await Promise.all([this.prisma.company.findUnique({where:{id:data.companyId}}),this.prisma.catalogValue.findFirst({where:{id:data.statusId,catalog:{code:"ESTADO_PERSONA"}}}),data.organizationalUnitId?this.prisma.organizationalUnit.findUnique({where:{id:data.organizationalUnitId}}):Promise.resolve(null),data.occupationLevelId?this.prisma.catalogValue.findFirst({where:{id:data.occupationLevelId,catalog:{code:"NIVEL_OCUPACIONAL"}}}):Promise.resolve(null),data.businessPartnerId?this.prisma.businessPartner.findUnique({where:{id:data.businessPartnerId}}):Promise.resolve(null)]);
    if(!company||!status||data.organizationalUnitId&&!unit||data.occupationLevelId&&!occupationLevel||data.businessPartnerId&&!businessPartner)throw new BadRequestException("Empresa, estructura, nivel ocupacional, business partner o estado inválido");
    if(current&&current.status.code==="ACTIVO"&&status.code!=="ACTIVO"&&await this.prisma.personRole.count({where:{personId:id!,status:{code:"ACTIVO"}}}))throw new BadRequestException("No se puede desactivar una persona con asignaciones activas");
    try{return await this.prisma.$transaction(async tx=>{const row=id?await tx.person.update({where:{id},data}):await tx.person.create({data});await tx.audit.create({data:{occurredAt:new Date(),userId,action:id?"UPDATE":"CREATE",entity:"PERSON",recordId:row.id,oldValue:current?this.snapshot(current):undefined,newValue:this.snapshot(row),result:"OK",origin:"WEB"}});return row})}catch(error:unknown){if(typeof error==="object"&&error&&"code" in error&&error.code==="P2002")throw new BadRequestException("Ya existe una persona con ese DNI en la empresa");throw error}
  }

  async saveTeam(id:string|null,input:Record<string,unknown>,userId:string){
    const current=id?await this.prisma.team.findUnique({where:{id},include:{status:true}}):null;if(id&&!current)throw new NotFoundException("No se encontró el equipo");
    const data={sourceId:this.text(input,"sourceId")!,programId:this.text(input,"programId")!,unitId:this.text(input,"unitId",false),statusId:this.text(input,"statusId")!};
    const [program,status,unit]=await Promise.all([this.prisma.program.findUnique({where:{id:data.programId}}),this.prisma.catalogValue.findFirst({where:{id:data.statusId,catalog:{code:"ESTADO_EQUIPO"}}}),data.unitId?this.prisma.organizationalUnit.findUnique({where:{id:data.unitId}}):Promise.resolve(null)]);if(!program||!status||data.unitId&&!unit)throw new BadRequestException("Programa, unidad o estado inválido");
    if(current&&current.status.code==="ACTIVO"&&status.code!=="ACTIVO"&&await this.prisma.personRole.count({where:{teamId:id!,status:{code:"ACTIVO"}}}))throw new BadRequestException("No se puede desactivar un equipo con asignaciones activas");
    try{return await this.prisma.$transaction(async tx=>{const row=id?await tx.team.update({where:{id},data}):await tx.team.create({data});await tx.audit.create({data:{occurredAt:new Date(),userId,action:id?"UPDATE":"CREATE",entity:"TEAM",recordId:row.id,oldValue:current?this.snapshot(current):undefined,newValue:this.snapshot(row),result:"OK",origin:"WEB"}});return row})}catch(error:unknown){if(typeof error==="object"&&error&&"code" in error&&error.code==="P2002")throw new BadRequestException("Ya existe un equipo con ese código");throw error}
  }

  async saveRole(id:string|null,input:Record<string,unknown>,userId:string){
    const current=id?await this.prisma.role.findUnique({where:{id},include:{status:true}}):null;if(id&&!current)throw new NotFoundException("No se encontró el rol");
    const data={sourceId:this.text(input,"sourceId")!,name:this.text(input,"name")!,typeId:this.text(input,"typeId")!,statusId:this.text(input,"statusId")!};
    const [type,status]=await Promise.all([this.prisma.catalogValue.findFirst({where:{id:data.typeId,catalog:{code:"TIPO_ROL"}}}),this.prisma.catalogValue.findFirst({where:{id:data.statusId,catalog:{code:"ESTADO_ROL"}}})]);if(!type||!status)throw new BadRequestException("Tipo o estado del rol inválido");
    if(current&&current.status.code==="ACTIVO"&&status.code!=="ACTIVO"&&await this.prisma.personRole.count({where:{roleId:id!,status:{code:"ACTIVO"}}}))throw new BadRequestException("No se puede desactivar un rol con asignaciones activas");
    try{return await this.prisma.$transaction(async tx=>{const row=id?await tx.role.update({where:{id},data}):await tx.role.create({data});await tx.audit.create({data:{occurredAt:new Date(),userId,action:id?"UPDATE":"CREATE",entity:"ROLE",recordId:row.id,oldValue:current?this.snapshot(current):undefined,newValue:this.snapshot(row),result:"OK",origin:"WEB"}});return row})}catch(error:unknown){if(typeof error==="object"&&error&&"code" in error&&error.code==="P2002")throw new BadRequestException("Ya existe un rol con ese código");throw error}
  }

  async assignPerson(personId: string, roleId: string, teamId: string,administratorId:string,teamIds:string[]|null=null) {
    const [person, role, team, status, onboarding] = await Promise.all([
      this.prisma.person.findUnique({ where: { id: personId } }),
      this.prisma.role.findUnique({ where: { id: roleId } }),
      this.prisma.team.findUnique({ where: { id: teamId } }),
      this.prisma.catalogValue.findFirst({ where: { code: "ACTIVO", catalog: { code: "ESTADO_ASIGNACION" } } }),
      this.prisma.catalogValue.findFirst({ where: { code: "PENDIENTE", catalog: { code: "ESTADO_ONBOARDING" } } }),
    ]);
    if (!person || !role || !team || !status || !onboarding) throw new NotFoundException("No se encontró la persona, rol, equipo o configuración requerida");
    if(teamIds!==null){
      if(!teamIds.includes(teamId))throw new ForbiddenException("El equipo no pertenece a tu alcance autorizado");
      const [personInScope,roleInScope]=await Promise.all([
        this.prisma.personRole.count({where:{personId,teamId:{in:teamIds},status:{code:"ACTIVO"}}}),
        this.prisma.personRole.count({where:{roleId,teamId:{in:teamIds},status:{code:"ACTIVO"}}}),
      ]);
      if(!personInScope)throw new ForbiddenException("La persona no pertenece a tus equipos autorizados");
      if(!roleInScope)throw new ForbiddenException("El rol no pertenece a tus equipos autorizados");
    }
    const existing = await this.prisma.personRole.findUnique({ where: { personId_roleId_teamId: { personId, roleId, teamId } } });
    if (existing) throw new ConflictException("La persona ya tiene ese rol en el equipo");
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.personRole.create({ data: { personId, roleId, teamId, statusId: status.id, onboardingStatusId: onboarding.id, startDate: new Date() } });
      const requiredCourses = await tx.roleCourse.findMany({ where: { roleId, active: true } });
      const pending = await tx.catalogValue.findFirst({ where: { code: "PENDIENTE", catalog: { code: "ESTADO_PERSONA_CURSO" } } });
      if (pending && requiredCourses.length) await tx.personCourse.createMany({ data: requiredCourses.map((item) => ({ personRoleId: assignment.id, courseId: item.courseId, statusId: pending.id })), skipDuplicates: true });
      await tx.audit.create({data:{occurredAt:new Date(),userId:administratorId,action:"CREATE",entity:"PERSON_ROLE",recordId:assignment.id,newValue:{personId,roleId,teamId,generatedCourses:requiredCourses.length},result:"OK",origin:"WEB"}});
      await tx.communication.create({data:{eventType:"ROLE_ASSIGNED",recipient:person.email,subject:`Nuevo rol asignado: ${role.name}`,templateCode:"ROLE_ASSIGNED",variables:{personName:person.names,roleName:role.name,teamCode:team.sourceId},status:person.email?"PENDIENTE":"OMITIDA_SIN_CORREO",source:"AUTOMATICA",dedupeKey:`ROLE_ASSIGNED:${assignment.id}`,personRoleId:assignment.id,requestedById:administratorId}});
      return { id: assignment.id, generatedCourses: requiredCourses.length };
    });
  }

  async updateAssignment(id:string,input:Record<string,unknown>,administratorId:string,teamIds:string[]|null=null){
    const current=await this.prisma.personRole.findUnique({where:{id},include:{status:true,onboardingStatus:true}});if(!current)throw new NotFoundException("No se encontró la asignación");
    if(teamIds!==null&&!teamIds.includes(current.teamId))throw new ForbiddenException("La asignación no pertenece a tus equipos autorizados");
    const statusId=this.text(input,"statusId")!,onboardingStatusId=this.text(input,"onboardingStatusId")!;
    const [status,onboarding]=await Promise.all([this.prisma.catalogValue.findFirst({where:{id:statusId,catalog:{code:"ESTADO_ASIGNACION"}}}),this.prisma.catalogValue.findFirst({where:{id:onboardingStatusId,catalog:{code:"ESTADO_ONBOARDING"}}})]);if(!status||!onboarding)throw new BadRequestException("Estado de asignación u onboarding inválido");
    const startDate=typeof input.startDate==="string"&&input.startDate?new Date(input.startDate):current.startDate;
    const requestedEnd=typeof input.endDate==="string"&&input.endDate?new Date(input.endDate):null;
    const active=status.code==="ACTIVO";const endDate=active?null:requestedEnd;if(!active&&!endDate)throw new BadRequestException("La fecha de fin es obligatoria al cerrar una asignación");if(startDate&&endDate&&endDate<startDate)throw new BadRequestException("La fecha de fin no puede ser anterior a la fecha de inicio");
    return this.prisma.$transaction(async tx=>{const updated=await tx.personRole.update({where:{id},data:{statusId,onboardingStatusId,startDate,endDate}});const action=active&&current.status.code!=="ACTIVO"?"REACTIVATE":"UPDATE";await tx.audit.create({data:{occurredAt:new Date(),userId:administratorId,action,entity:"PERSON_ROLE",recordId:id,oldValue:this.snapshot(current),newValue:this.snapshot(updated),result:"OK",origin:"WEB"}});if(current.status.code!==status.code){const detail=await tx.personRole.findUniqueOrThrow({where:{id},include:{person:true,role:true,team:true}});const eventType=active?"ROLE_REACTIVATED":"ROLE_CLOSED";await tx.communication.create({data:{eventType,recipient:detail.person.email,subject:active?`Rol reactivado: ${detail.role.name}`:`Rol cerrado: ${detail.role.name}`,templateCode:eventType,variables:{personName:detail.person.names,roleName:detail.role.name,teamCode:detail.team.sourceId,endDate:endDate?.toISOString().slice(0,10)??null},status:detail.person.email?"PENDIENTE":"OMITIDA_SIN_CORREO",source:"AUTOMATICA",dedupeKey:`${eventType}:${id}:${Date.now()}`,personRoleId:id,requestedById:administratorId}})}return updated});
  }
}
