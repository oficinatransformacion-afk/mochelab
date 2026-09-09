import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
type Issue={type:string;severity:"ALTA"|"MEDIA";entity:string;recordId:string;label:string;detail:string;href:string};
@Injectable()
export class DataQualityRepository{
 constructor(private readonly prisma:PrismaService){}
 async list(){
  const[people,assignments,roles,teams]=await Promise.all([
   this.prisma.person.findMany({where:{status:{code:"ACTIVO"}},include:{company:true}}),
   this.prisma.personRole.findMany({include:{person:true,role:true,team:true,status:true}}),
   this.prisma.role.findMany({
    where:{status:{code:"ACTIVO"}},
    include:{_count:{select:{
     roleCourses:{where:{active:true}},
     observableBehaviors:{where:{active:true,behavior:{active:true,dimension:{active:true}}}},
    }}},
   }),
   this.prisma.team.findMany({
    where:{status:{code:"ACTIVO"}},
    include:{_count:{select:{assignments:{where:{status:{code:"ACTIVO"}}}}}},
   }),
  ]);
  const issues:Issue[]=[];
  for(const x of people){if(!x.email)issues.push({type:"PERSONA_SIN_CORREO",severity:"ALTA",entity:"PERSONA",recordId:x.id,label:x.names,detail:`${x.dni} · ${x.company.name}: no tiene correo`,href:`/personas/${x.id}`});if(!x.organizationalUnitId)issues.push({type:"PERSONA_SIN_UNIDAD",severity:"MEDIA",entity:"PERSONA",recordId:x.id,label:x.names,detail:`${x.dni} · ${x.company.name}: no tiene unidad organizacional`,href:`/personas/${x.id}`})}
  const normalize=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().replace(/\s+/g," ").toLowerCase();
  const repeated=(key:(person:typeof people[number])=>string)=>Object.values(people.reduce<Record<string,typeof people>>((groups,person)=>{const value=key(person);if(value)(groups[value]??=[]).push(person);return groups},{})).filter(group=>group.length>1);
  for(const group of repeated(person=>person.email?.trim().toLowerCase()??""))for(const person of group)issues.push({type:"POSIBLE_DUPLICADO_CORREO",severity:"ALTA",entity:"PERSONA",recordId:person.id,label:person.names,detail:`Correo compartido por ${group.length} personas: ${person.email}`,href:`/personas/${person.id}`});
  for(const group of repeated(person=>`${normalize(person.names)}|${person.companyId}`))for(const person of group)issues.push({type:"POSIBLE_DUPLICADO_NOMBRE",severity:"MEDIA",entity:"PERSONA",recordId:person.id,label:person.names,detail:`Nombre repetido ${group.length} veces en ${person.company.name}`,href:`/personas/${person.id}`});
  for(const x of assignments){if(x.status.code==="ACTIVO"&&!x.startDate)issues.push({type:"ASIGNACION_SIN_INICIO",severity:"MEDIA",entity:"ASIGNACION",recordId:x.id,label:x.person.names,detail:`${x.role.name} · ${x.team.sourceId}: falta fecha de inicio`,href:"/asignaciones"});if(x.status.code!=="ACTIVO"&&!x.endDate)issues.push({type:"ASIGNACION_CERRADA_SIN_FIN",severity:"ALTA",entity:"ASIGNACION",recordId:x.id,label:x.person.names,detail:`${x.role.name} · ${x.team.sourceId}: cierre sin fecha final`,href:"/asignaciones"})}
  for(const x of roles){if(!x._count.observableBehaviors)issues.push({type:"ROL_SIN_COMPORTAMIENTOS",severity:"ALTA",entity:"ROL",recordId:x.id,label:x.name,detail:"No puede participar en autoevaluación",href:"/madurez/configuracion"});if(!x._count.roleCourses)issues.push({type:"ROL_SIN_MALLA",severity:"MEDIA",entity:"ROL",recordId:x.id,label:x.name,detail:"No tiene cursos activos configurados",href:"/roles"})}
  for(const x of teams)if(!x._count.assignments)issues.push({type:"EQUIPO_SIN_MIEMBROS",severity:"MEDIA",entity:"EQUIPO",recordId:x.id,label:x.sourceId,detail:"Equipo activo sin asignaciones activas",href:"/equipos"});
  return{generatedAt:new Date(),total:issues.length,high:issues.filter(x=>x.severity==="ALTA").length,medium:issues.filter(x=>x.severity==="MEDIA").length,possibleDuplicates:issues.filter(x=>x.type.startsWith("POSIBLE_DUPLICADO")).length,byType:Object.entries(issues.reduce<Record<string,number>>((a,x)=>(a[x.type]=(a[x.type]??0)+1,a),{})).map(([type,count])=>({type,count})),issues};
 }
}
