import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import * as XLSX from "xlsx";
import { PrismaService } from "../database/prisma.service";

export type InitiativeExportFilters = {
  search?: string;
  years?: number[]; statusIds?: string[]; companyIds?: string[]; programIds?: string[]; teamIds?: string[];
  focusAreaIds?: string[]; cycleIds?: string[]; initiativeTypeIds?: string[]; managementTypeIds?: string[];
  impactIds?: string[]; executionAreaIds?: string[]; objectiveIds?: string[]; responsiblePersonRoleIds?: string[];
  hasDocumentation?: "ALL"|"WITH"|"WITHOUT"; hasFinancialData?: "ALL"|"WITH"|"WITHOUT";
  hasSubprocess?: "ALL"|"WITH"|"WITHOUT"; executionStartFrom?: string; executionStartTo?: string;
};

const fields = [
 ["Empresa","Contexto","Empresa vinculada a la iniciativa.","Directo"],["Año","Contexto","Año del portafolio.","Directo"],["Ciclo KR","Contexto","Ciclo del objetivo o resultado clave.","Directo"],["Tipo KR","Contexto","Tipo del resultado clave.","Directo"],["Programa","Contexto","Programa asociado.","Directo"],["Área Enfoque","Contexto","Área de enfoque de la iniciativa.","Directo"],["Área de ejecución","Contexto","Área responsable de la ejecución.","Directo"],["ID Equipo","Contexto","Código funcional del equipo.","Directo"],["Equipo","Contexto","Nombre del equipo asociado.","Directo"],["Nivel","Contexto","Nivel organizacional de la iniciativa.","Directo"],
 ["ID Iniciativa","Identificación","Identificador funcional único.","Directo"],["Iniciativa","Identificación","Nombre de la iniciativa.","Directo"],["Estado Iniciativa","Identificación","Estado vigente.","Directo"],["Tipo de iniciativa","Identificación","Clasificación de la iniciativa.","Directo"],["Talla","Identificación","Tamaño estimado.","Directo"],["Prioridad","Identificación","Prioridad registrada.","Directo"],["Impacto","Identificación","Tipo de impacto esperado.","Directo"],["Tipo de gestión","Identificación","Modelo de gestión aplicado.","Directo"],
 ["Sponsor","Responsables","Sponsor asociado directamente a la iniciativa; si no existe, Sponsor activo del equipo.","Directo / respaldo por equipo"],["Dueño de programa","Responsables","Personas activas con el rol DUEÑO DE PROGRAMA en el equipo de la iniciativa.","Respaldo por equipo"],["Líder de área de enfoque","Responsables","Personas activas con el rol LIDER AE en el equipo de la iniciativa.","Respaldo por equipo"],["Líder EAD","Responsables","Personas activas con el rol LIDER EAD en el equipo de la iniciativa.","Respaldo por equipo"],["ATF","Responsables","Persona asignada como ATF.","Directo"],["Gestor de mejora continua","Responsables","Persona asignada como gestor.","Directo"],["Supervisor de mejora continua","Responsables","Supervisor registrado.","Directo"],["Dueño de Producto","Responsables","Responsable del producto.","Directo"],["Líder técnico","Responsables","Líder técnico asignado.","Directo"],["Equipo desarrollador","Responsables","Desarrolladores separados por punto y coma.","Directo"],["Cantidad de desarrolladores","Responsables","Número de desarrolladores.","Calculado"],["ATF/Gestor legado sin clasificar","Responsables","Responsable legado no clasificado.","Directo"],
 ["Fecha inicio ejecución","Ejecución","Fecha de inicio.","Directo"],["Fecha fin ejecución","Ejecución","Fecha de fin.","Directo"],["Semana","Ejecución","Semana ISO de la última actualización.","Calculado"],["Release","Ejecución","Release asociado.","Directo"],["Hito de acompañamiento","Ejecución","Hito registrado.","Directo"],["Horizonte de retorno","Ejecución","Horizonte estimado.","Directo"],["Categoría","Ejecución","Categoría registrada.","Directo"],["Escalamiento","Ejecución","Escalamiento registrado.","Directo"],["Capacidad TI","Ejecución","Capacidad tecnológica.","Directo"],["Descripción del impacto","Ejecución","Detalle del impacto.","Directo"],["Días de ejecución","Ejecución","Días entre inicio y fin o corte.","Calculado"],["Días de atraso","Ejecución","Días vencidos para registros no terminados.","Calculado"],["Última actualización","Ejecución","Fecha de actualización.","Directo"],["Días sin actualización","Ejecución","Días desde la actualización.","Calculado"],["Semáforo de actualización","Ejecución","Verde hasta 30, amarillo hasta 60 y rojo mayor a 60 días.","Calculado"],
 ["ID KR","Alineamiento","Identificador del resultado clave.","Directo"],["Resultado clave","Alineamiento","Resultado clave asociado.","Directo"],["Objetivo","Alineamiento","Objetivo asociado.","Directo"],
 ["Macroproceso principal","Procesos","Macroproceso principal.","Directo"],["Proceso principal","Procesos","Proceso principal.","Directo"],["Subproceso principal","Procesos","Subproceso principal.","Directo"],["Subprocesos relacionados","Procesos","Subprocesos relacionados.","Directo"],["Cantidad de subprocesos","Procesos","Número de subprocesos.","Calculado"],
 ["Inversión proyectada (USD)","Finanzas","Inversión presupuestada.","Directo"],["Inversión ejecutada (USD)","Finanzas","Inversión ejecutada.","Directo"],["Variación de inversión (USD)","Finanzas","Ejecutada menos proyectada.","Calculado"],["Variación de inversión (%)","Finanzas","Variación sobre proyectada.","Calculado"],["Beneficio económico proyectado (USD)","Finanzas","Beneficio previsto.","Directo"],["Beneficio económico real (USD)","Finanzas","Beneficio alcanzado.","Directo"],["Variación de beneficio (USD)","Finanzas","Real menos proyectado.","Calculado"],["Cumplimiento de beneficio (%)","Finanzas","Real sobre proyectado.","Calculado"],["Mitigación proyectada (USD)","Finanzas","Mitigación prevista.","Directo"],["Mitigación real (USD)","Finanzas","Mitigación alcanzada.","Directo"],["Beneficio total proyectado (USD)","Finanzas","Económico más mitigación proyectada.","Calculado"],["Beneficio total real (USD)","Finanzas","Económico más mitigación real.","Calculado"],["Beneficio potencial anual (USD)","Finanzas","Potencial anual estimado.","Directo"],["ROI proyectado (%)","Finanzas","Beneficio total sobre inversión proyectada.","Calculado"],["ROI real (%)","Finanzas","Beneficio total sobre inversión ejecutada.","Calculado"],
 ["Enlace de documentación","Documentación","Enlace de respaldo.","Directo"],["Estado de documentación","Documentación","Indica si existe documentación.","Calculado"],["Observaciones","Documentación","Observaciones generales.","Directo"],["Fecha de creación","Documentación","Fecha de creación.","Directo"],["Usuario última actualización","Documentación","Último usuario identificado en auditoría.","Auditoría"],
] as const;

const strings=(value:unknown)=>Array.isArray(value)?value.filter(item=>typeof item==="string"&&item.trim()).map(String):[];
const date=(value:unknown)=>{if(!value)return undefined;const parsed=new Date(String(value));if(Number.isNaN(parsed.valueOf()))throw new BadRequestException("Rango de fechas inválido");return parsed};
const num=(value:unknown)=>value===null||value===undefined?null:Number(value);
const normalized=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toUpperCase();
const joinedNames=(values:string[])=>[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es",{sensitivity:"base"})).join("; ");
const names=(row:any,type:string)=>joinedNames(row.responsibilities.filter((item:any)=>item.responsibilityType===type).map((item:any)=>item.personRole.person.names));
const teamRoleNames=(row:any,roleName:string)=>joinedNames((row.team?.assignments??[]).filter((item:any)=>normalized(item.role.name)===normalized(roleName)).map((item:any)=>item.person.names));
const sponsorNames=(row:any)=>names(row,"SPONSOR")||teamRoleNames(row,"SPONSOR");
const iso=(value:Date|null|undefined)=>value?value.toISOString().slice(0,10):"";
const days=(from:Date,to:Date)=>Math.max(0,Math.floor((to.valueOf()-from.valueOf())/86400000));
const isoWeek=(dateValue:Date)=>{const d=new Date(Date.UTC(dateValue.getUTCFullYear(),dateValue.getUTCMonth(),dateValue.getUTCDate()));d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));const y=new Date(Date.UTC(d.getUTCFullYear(),0,1));return Math.ceil((((d.valueOf()-y.valueOf())/86400000)+1)/7)};

@Injectable()
export class InitiativesExportService {
 constructor(private readonly prisma:PrismaService){}

 private where(raw:InitiativeExportFilters,teamScope:string[]|null){
  const f=raw??{},and:any[]=[];
  const years=Array.isArray(f.years)?f.years.map(Number).filter(Number.isInteger):[];
  if(!years.length)throw new BadRequestException("Debes seleccionar al menos un año para exportar");
  const requested=strings(f.teamIds),allowed=teamScope===null?requested:requested.length?requested.filter(id=>teamScope.includes(id)):teamScope;
  if(teamScope!==null&&requested.length&&!allowed.length)and.push({id:"00000000-0000-0000-0000-000000000000"});
  const where:any={AND:and};
  const search=typeof f.search==="string"?f.search.trim():"";
  if(search)where.OR=[{name:{contains:search,mode:"insensitive"}},{release:{contains:search,mode:"insensitive"}}];
  const map:[keyof InitiativeExportFilters,string][]=[["statusIds","statusId"],["companyIds","companyId"],["programIds","programId"],["focusAreaIds","focusAreaId"],["cycleIds","cycleId"],["initiativeTypeIds","typeId"],["managementTypeIds","managementTypeId"],["impactIds","impactId"],["executionAreaIds","executionAreaId"],["objectiveIds","objectiveId"]];
  if(years.length)where.year={in:years}; if(allowed.length)where.teamId={in:allowed};
  for(const [source,target] of map){const values=strings(f[source]);if(values.length)where[target]={in:values}}
  const responsible=strings(f.responsiblePersonRoleIds);if(responsible.length)where.responsibilities={some:{personRoleId:{in:responsible}}};
  if(f.hasDocumentation==="WITH")and.push({documentationUrl:{not:null}});if(f.hasDocumentation==="WITHOUT")and.push({documentationUrl:null});
  if(f.hasSubprocess==="WITH")where.subprocesses={some:{}};if(f.hasSubprocess==="WITHOUT")where.subprocesses={none:{}};
  const moneyFields=["projectedEconomicBenefit","actualEconomicBenefit","projectedMitigationBenefit","actualMitigationBenefit","annualPotentialBenefit","projectedInvestment","actualInvestment"];
  if(f.hasFinancialData==="WITH")and.push({OR:moneyFields.map(field=>({[field]:{not:null}}))});
  if(f.hasFinancialData==="WITHOUT")and.push({AND:moneyFields.map(field=>({[field]:null}))});
  const from=date(f.executionStartFrom),to=date(f.executionStartTo);if(from||to)where.executionStart={...(from?{gte:from}:{}),...(to?{lte:new Date(to.valueOf()+86399999)}:{})};
  return where;
 }

 async preview(filters:InitiativeExportFilters,scope:string[]|null){return {count:await this.prisma.initiative.count({where:this.where(filters,scope)})}}

 async export(filters:InitiativeExportFilters,scope:string[]|null,userId:string|null,actor:string){
  const where=this.where(filters,scope),rows:any[]=await this.prisma.initiative.findMany({where,orderBy:[{year:"desc"},{sourceId:"desc"}],include:{team:{include:{assignments:{where:{status:{code:"ACTIVO"},person:{status:{code:"ACTIVO"}},role:{status:{code:"ACTIVO"}}},include:{person:true,role:true}}}},company:true,cycle:true,focusArea:true,level:true,program:true,type:true,size:true,priority:true,managementType:true,status:true,escalation:true,returnHorizon:true,tiCapacity:true,category:true,impact:true,executionArea:true,improvementSupervisor:true,objectiveLink:{include:{type:true}},keyResultLink:true,responsibilities:{include:{personRole:{include:{person:true,role:true}}}},subprocesses:{include:{subprocess:{include:{businessProcess:{include:{macroprocess:true}}}}}}}});
  const audits:any[]=rows.length?await this.prisma.audit.findMany({where:{entity:"INITIATIVE",recordId:{in:rows.map(row=>row.id)}},orderBy:{occurredAt:"desc"},include:{user:true}}):[];
  const latest=new Map<string,any>();for(const audit of audits)if(audit.recordId&&!latest.has(audit.recordId))latest.set(audit.recordId,audit);
  const now=new Date();
  const data=rows.map(row=>{const primary=row.subprocesses.find((item:any)=>item.relationshipType==="PRIMARY")??row.subprocesses[0],related=row.subprocesses.filter((item:any)=>item!==primary).map((item:any)=>`${item.subprocess.code} · ${item.subprocess.name}`).join("; ");const start=row.executionStart as Date|null,end=row.executionEnd as Date|null,updated=row.updatedAt as Date;const stale=days(updated,now),pi=num(row.projectedInvestment),ai=num(row.actualInvestment),pb=num(row.projectedEconomicBenefit),ab=num(row.actualEconomicBenefit),pm=num(row.projectedMitigationBenefit),am=num(row.actualMitigationBenefit),pt=pb===null&&pm===null?null:(pb??0)+(pm??0),at=ab===null&&am===null?null:(ab??0)+(am??0);return [
   row.company.name,row.year,row.cycle.name,row.objectiveLink.type?.name??"",row.program.name,row.focusArea.name,row.executionArea?.name??"",row.team?.sourceId??"",row.team?.name??"",row.level.name,String(row.sourceId),row.name,row.status.name,row.type.name,row.size.name,row.priority?.name??"",row.impact.name,row.managementType.name,
   sponsorNames(row),teamRoleNames(row,"DUEÑO DE PROGRAMA"),teamRoleNames(row,"LIDER AE"),teamRoleNames(row,"LIDER EAD"),names(row,"ATF"),names(row,"MANAGER"),row.improvementSupervisor?.name??"",names(row,"PRODUCT_OWNER"),names(row,"TECHNICAL_LEAD"),names(row,"DEVELOPER"),row.responsibilities.filter((x:any)=>x.responsibilityType==="DEVELOPER").length,row.manager??"",
   iso(start),iso(end),isoWeek(updated),row.release??"",row.accompanimentMilestone??"",row.returnHorizon?.name??"",row.category?.name??"",row.escalation?.name??"",row.tiCapacity?.name??"",row.impactDescription??"",start?days(start,end??now):"",end&&end<now&&!/TERMINADO/.test(row.status.code)?days(end,now):0,updated.toISOString(),stale,stale<=30?"Verde":stale<=60?"Amarillo":"Rojo",
   row.keyResultLink?String(row.keyResultLink.sourceId):"",row.keyResultLink?.keyResult??"",row.objectiveLink.objective,primary?.subprocess.businessProcess.macroprocess.name??"",primary?.subprocess.businessProcess.name??"",primary?.subprocess.name??"",related,row.subprocesses.length,
   pi??"",ai??"",pi!==null&&ai!==null?ai-pi:"",pi?((ai??0)-pi)/pi:"",pb??"",ab??"",pb!==null&&ab!==null?ab-pb:"",pb? (ab??0)/pb:"",pm??"",am??"",pt??"",at??"",num(row.annualPotentialBenefit)??"",pi&&pt!==null?pt/pi:"",ai&&at!==null?at/ai:"",
   row.documentationUrl??"",row.documentationUrl?"Con documentación":"Sin documentación",row.observations??"",(row.sourceCreatedAt??row.createdAt).toISOString(),latest.get(row.id)?.user?.name??latest.get(row.id)?.actorLegacy??""
  ]});
  const book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([["Portafolio de iniciativas"],[`Esquema PORTAFOLIO_V2 · ${rows.length} registros`],[],fields.map(field=>field[1]),fields.map(field=>field[0]),...data]);
  const lastColumn=(()=>{let n:number=fields.length,result="";while(n>0){const remainder=(n-1)%26;result=String.fromCharCode(65+remainder)+result;n=Math.floor((n-1)/26)}return result})();
  sheet["!autofilter"]={ref:`A5:${lastColumn}${Math.max(5,5+data.length)}`};sheet["!cols"]=fields.map(([name])=>({wch:/Iniciativa|Objetivo|Resultado|Descripción|Observaciones|Equipo desarrollador/.test(name)?34:20}));sheet["!merges"]=[{s:{r:0,c:0},e:{r:0,c:9}},{s:{r:1,c:0},e:{r:1,c:18}}];
  XLSX.utils.book_append_sheet(book,sheet,"Portafolio");
  const criteria=XLSX.utils.aoa_to_sheet([["Criterios de exportación"],[],["Parámetro","Valor"],["Versión","PORTAFOLIO_V2"],["Fecha de generación",now.toISOString()],["Usuario",actor],["Entorno",process.env.NODE_ENV??"local"],["Cantidad de registros",rows.length],["Filtros",JSON.stringify(filters)],["Alcance de equipos",scope===null?"Todos los permitidos":`${scope.length} equipos permitidos`]]);criteria["!cols"]=[{wch:28},{wch:90}];XLSX.utils.book_append_sheet(book,criteria,"Criterios");
  const dictionary=XLSX.utils.aoa_to_sheet([["Diccionario de campos"],[],["Campo","Bloque","Definición","Disponibilidad"],...fields.map(field=>[...field])]);dictionary["!cols"]=[{wch:36},{wch:20},{wch:65},{wch:20}];XLSX.utils.book_append_sheet(book,dictionary,"Diccionario");
  const buffer=XLSX.write(book,{bookType:"xlsx",type:"buffer",compression:true}) as Buffer;
  await this.prisma.audit.create({data:{occurredAt:now,userId:userId??undefined,actorLegacy:actor||undefined,action:"EXPORT",entity:"INITIATIVE_REPORT",newValue:{schema:"PORTAFOLIO_V2",filters:filters as Prisma.InputJsonValue,records:rows.length},result:"SUCCESS",origin:"WEB"}});
  const stamp=now.toISOString().replace(/[-:T]/g,"").slice(0,12);return {buffer,filename:`Portafolio_Iniciativas_${stamp}.xlsx`,count:rows.length};
 }
}
