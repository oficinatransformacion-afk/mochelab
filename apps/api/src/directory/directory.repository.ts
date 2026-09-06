import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
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
      take: 100,
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
        assignments: { include: { person: true, role: true } },
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
      this.prisma.person.findMany({where:teamIds===null?undefined:{assignments:{some:{teamId:{in:teamIds}}}}, include: { company: true }, orderBy: { names: "asc" } }),
      this.prisma.role.findMany({ orderBy: { name: "asc" } }),
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
    const [companies,units,programs,values]=await Promise.all([
      this.prisma.company.findMany({where:{active:true},orderBy:{name:"asc"},select:{id:true,code:true,name:true}}),
      this.prisma.organizationalUnit.findMany({orderBy:{name:"asc"},select:{id:true,code:true,name:true,companyId:true}}),
      this.prisma.program.findMany({where:{active:true},orderBy:{name:"asc"},select:{id:true,code:true,name:true}}),
      this.prisma.catalogValue.findMany({where:{active:true,catalog:{code:{in:["ESTADO_PERSONA","ESTADO_EQUIPO","TIPO_ROL","ESTADO_ROL"]}}},orderBy:[{catalog:{code:"asc"}},{sortOrder:"asc"}],select:{id:true,code:true,name:true,catalog:{select:{code:true}}}}),
    ]);
    return{companies,units,programs,catalogs:Object.fromEntries(["ESTADO_PERSONA","ESTADO_EQUIPO","TIPO_ROL","ESTADO_ROL"].map(code=>[code,values.filter(value=>value.catalog.code===code).map(({catalog:_,...value})=>value)]))};
  }

  async savePerson(id:string|null,input:Record<string,unknown>,userId:string){
    const current=id?await this.prisma.person.findUnique({where:{id},include:{status:true}}):null;if(id&&!current)throw new NotFoundException("No se encontró la persona");
    const data={dni:this.text(input,"dni")!,companyId:this.text(input,"companyId")!,names:this.text(input,"names")!,email:this.text(input,"email",false),organizationalUnitId:this.text(input,"organizationalUnitId",false),statusId:this.text(input,"statusId")!};
    const [company,status,unit]=await Promise.all([this.prisma.company.findUnique({where:{id:data.companyId}}),this.prisma.catalogValue.findFirst({where:{id:data.statusId,catalog:{code:"ESTADO_PERSONA"}}}),data.organizationalUnitId?this.prisma.organizationalUnit.findUnique({where:{id:data.organizationalUnitId}}):Promise.resolve(null)]);
    if(!company||!status||data.organizationalUnitId&&!unit)throw new BadRequestException("Empresa, unidad o estado inválido");
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

  async assignPerson(personId: string, roleId: string, teamId: string,administratorId:string) {
    const [person, role, team, status, onboarding] = await Promise.all([
      this.prisma.person.findUnique({ where: { id: personId } }),
      this.prisma.role.findUnique({ where: { id: roleId } }),
      this.prisma.team.findUnique({ where: { id: teamId } }),
      this.prisma.catalogValue.findFirst({ where: { code: "ACTIVO", catalog: { code: "ESTADO_ASIGNACION" } } }),
      this.prisma.catalogValue.findFirst({ where: { code: "PENDIENTE", catalog: { code: "ESTADO_ONBOARDING" } } }),
    ]);
    if (!person || !role || !team || !status || !onboarding) throw new NotFoundException("No se encontró la persona, rol, equipo o configuración requerida");
    const existing = await this.prisma.personRole.findUnique({ where: { personId_roleId_teamId: { personId, roleId, teamId } } });
    if (existing) throw new ConflictException("La persona ya tiene ese rol en el equipo");
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.personRole.create({ data: { personId, roleId, teamId, statusId: status.id, onboardingStatusId: onboarding.id, startDate: new Date() } });
      const requiredCourses = await tx.roleCourse.findMany({ where: { roleId, active: true } });
      const pending = await tx.catalogValue.findFirst({ where: { code: "PENDIENTE", catalog: { code: "ESTADO_PERSONA_CURSO" } } });
      if (pending && requiredCourses.length) await tx.personCourse.createMany({ data: requiredCourses.map((item) => ({ personRoleId: assignment.id, courseId: item.courseId, statusId: pending.id })), skipDuplicates: true });
      await tx.audit.create({data:{occurredAt:new Date(),userId:administratorId,action:"CREATE",entity:"PERSON_ROLE",recordId:assignment.id,newValue:{personId,roleId,teamId,generatedCourses:requiredCourses.length},result:"OK",origin:"WEB"}});
      return { id: assignment.id, generatedCourses: requiredCourses.length };
    });
  }

  async updateAssignment(id:string,input:Record<string,unknown>,administratorId:string){
    const current=await this.prisma.personRole.findUnique({where:{id},include:{status:true,onboardingStatus:true}});if(!current)throw new NotFoundException("No se encontró la asignación");
    const statusId=this.text(input,"statusId")!,onboardingStatusId=this.text(input,"onboardingStatusId")!;
    const [status,onboarding]=await Promise.all([this.prisma.catalogValue.findFirst({where:{id:statusId,catalog:{code:"ESTADO_ASIGNACION"}}}),this.prisma.catalogValue.findFirst({where:{id:onboardingStatusId,catalog:{code:"ESTADO_ONBOARDING"}}})]);if(!status||!onboarding)throw new BadRequestException("Estado de asignación u onboarding inválido");
    const startDate=typeof input.startDate==="string"&&input.startDate?new Date(input.startDate):current.startDate;
    const requestedEnd=typeof input.endDate==="string"&&input.endDate?new Date(input.endDate):null;
    const active=status.code==="ACTIVO";const endDate=active?null:requestedEnd;if(!active&&!endDate)throw new BadRequestException("La fecha de fin es obligatoria al cerrar una asignación");if(startDate&&endDate&&endDate<startDate)throw new BadRequestException("La fecha de fin no puede ser anterior a la fecha de inicio");
    return this.prisma.$transaction(async tx=>{const updated=await tx.personRole.update({where:{id},data:{statusId,onboardingStatusId,startDate,endDate}});await tx.audit.create({data:{occurredAt:new Date(),userId:administratorId,action:active&&current.status.code!=="ACTIVO"?"REACTIVATE":"UPDATE",entity:"PERSON_ROLE",recordId:id,oldValue:this.snapshot(current),newValue:this.snapshot(updated),result:"OK",origin:"WEB"}});return updated});
  }
}
