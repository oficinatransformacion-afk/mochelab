import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";

const catalogCodes=["NIVEL_OBJETIVO","AREA_ENFOQUE","CICLO","DIRECCION_INDICADOR","TIPO_OBJETIVO","UNIDAD_KR","ESTADO_RESULTADO_CLAVE","ESTADO_REGISTRO_OBJETIVO"] as const;
type Input=Record<string,unknown>;

@Injectable()
export class ObjectivesRepository {
 constructor(private readonly prisma:PrismaService){}
 private text(input:Input,key:string,required=true){const value=typeof input[key]==="string"?(input[key] as string).trim():"";if(required&&!value)throw new BadRequestException(`${key} es obligatorio`);return value||null}
 private number(input:Input,key:string,required=false){const raw=input[key];if(raw===""||raw===null||raw===undefined){if(required)throw new BadRequestException(`${key} es obligatorio`);return null}const value=Number(raw);if(!Number.isFinite(value))throw new BadRequestException(`${key} debe ser numérico`);return value}
 private date(input:Input,key:string){const raw=this.text(input,key,false);if(!raw)return null;const value=new Date(raw);if(Number.isNaN(value.getTime()))throw new BadRequestException(`${key} no es una fecha válida`);return value}
  private dto(row:any){return {...row,sourceId:String(row.sourceId),parent:row.parent?{...row.parent,sourceId:String(row.parent.sourceId)}:null,baseline:row.baseline===null?null:Number(row.baseline),target:row.target===null?null:Number(row.target),actual:row.actual===null?null:Number(row.actual),achievement:row.achievement===null?null:Number(row.achievement)}}
 private snapshot(value:unknown){return JSON.parse(JSON.stringify(value,(_,item)=>typeof item==="bigint"?item.toString():item)) as Prisma.InputJsonValue}
 private assertTeam(teamId:unknown,teamIds:string[]|null){if(teamIds!==null&&(!teamId||!teamIds.includes(String(teamId))))throw new BadRequestException("El equipo no está permitido para esta cuenta")}
 private async withAchievement(data:any,current?:{directionId:string;target:Prisma.Decimal|null;actual:Prisma.Decimal|null}){const directionId=data.directionId??current?.directionId,target=data.target===undefined?current?.target:data.target,actual=data.actual===undefined?current?.actual:data.actual;if(target===null||target===undefined||actual===null||actual===undefined)return{...data,achievement:null};const direction=await this.prisma.catalogValue.findUnique({where:{id:directionId},select:{code:true}});const goal=Number(target),executed=Number(actual);let achievement=direction?.code==="INVERSO"?(executed===0?100:(goal/executed)*100):(goal===0?(executed===0?100:0):(executed/goal)*100);achievement=Math.round(Math.max(0,Math.min(100,achievement))*100)/100;return{...data,achievement}}
 private async assertNoHierarchyCycle(id:string,parentId:string|null){let current=parentId;const visited=new Set<string>();while(current){if(current===id)throw new BadRequestException("La jerarquía de objetivos generaría un ciclo");if(visited.has(current))throw new BadRequestException("La jerarquía existente contiene un ciclo");visited.add(current);const parent=await this.prisma.objective.findUnique({where:{id:current},select:{parentId:true}});current=parent?.parentId??null}}
 private async validateScope(levelId:string,teamId:string|null){const level=await this.prisma.catalogValue.findFirst({where:{id:levelId,catalog:{code:"NIVEL_OBJETIVO"}},select:{code:true}});if(level?.code==="CORPORATIVO"&&teamId)throw new BadRequestException("Un objetivo Corporativo no debe tener equipo");if(level?.code==="EQUIPO"&&!teamId)throw new BadRequestException("Un objetivo de Equipo requiere seleccionar un equipo")}
 private async validateBusinessRules(data:{levelId:string;teamId:string|null;parentId:string|null;year:number;cycleId:string;focusAreaId:string},isAdmin:boolean){
  const level=await this.prisma.catalogValue.findFirst({where:{id:data.levelId,catalog:{code:"NIVEL_OBJETIVO"}},select:{code:true}});if(!level)throw new BadRequestException("El nivel del objetivo no es válido");
  if(level.code==="CORPORATIVO"){if(!isAdmin)throw new BadRequestException("Solo un administrador puede crear o editar objetivos corporativos");if(data.teamId||data.parentId)throw new BadRequestException("Un objetivo corporativo no debe tener equipo ni objetivo padre");return}
  if(level.code==="EQUIPO"){if(!data.teamId||!data.parentId)throw new BadRequestException("Un objetivo de equipo requiere equipo y objetivo corporativo padre");const parent=await this.prisma.objective.findUnique({where:{id:data.parentId},include:{level:true,recordStatus:true}});if(!parent||parent.isSystemPlaceholder||parent.level.code!=="CORPORATIVO")throw new BadRequestException("El objetivo padre debe ser corporativo");if(parent.recordStatus.code!=="ACTIVO")throw new BadRequestException("El objetivo corporativo padre debe estar activo");if(parent.year!==data.year||parent.cycleId!==data.cycleId||parent.focusAreaId!==data.focusAreaId)throw new BadRequestException("El objetivo padre debe pertenecer al mismo año, ciclo y área de enfoque");}
 }
 private async validateReferences(input:Input){
  const mapping:Record<string,string>={levelId:"NIVEL_OBJETIVO",focusAreaId:"AREA_ENFOQUE",cycleId:"CICLO",directionId:"DIRECCION_INDICADOR",typeId:"TIPO_OBJETIVO",unitId:"UNIDAD_KR",resultStatusId:"ESTADO_RESULTADO_CLAVE",recordStatusId:"ESTADO_REGISTRO_OBJETIVO"};
  const supplied=Object.entries(mapping).filter(([key])=>typeof input[key]==="string"&&Boolean((input[key] as string).trim()));
  if(supplied.length){
   const values=await this.prisma.catalogValue.findMany({where:{id:{in:supplied.map(([key])=>input[key] as string)},active:true},select:{id:true,catalog:{select:{code:true}}}});
   if(supplied.some(([key,catalog])=>!values.some(value=>value.id===input[key]&&value.catalog.code===catalog)))throw new BadRequestException("Uno o más valores seleccionados no pertenecen al catálogo correspondiente");
  }
  if(input.teamId){const exists=await this.prisma.team.count({where:{id:String(input.teamId)}});if(!exists)throw new BadRequestException("El equipo seleccionado no existe")}
  if(input.parentId){const exists=await this.prisma.objective.count({where:{id:String(input.parentId),isSystemPlaceholder:false}});if(!exists)throw new BadRequestException("El objetivo padre no existe")}
 }

 async options(teamIds:string[]|null=null){
  const [values,teams,parents]=await Promise.all([
   this.prisma.catalogValue.findMany({where:{active:true,catalog:{code:{in:[...catalogCodes]},active:true}},orderBy:[{catalog:{code:"asc"}},{sortOrder:"asc"},{name:"asc"}],select:{id:true,code:true,name:true,catalog:{select:{code:true}}}}),
   this.prisma.team.findMany({where:teamIds===null?undefined:{id:{in:teamIds}},orderBy:{sourceId:"asc"},select:{id:true,sourceId:true,program:{select:{name:true}}}}),
   this.prisma.objective.findMany({where:{isSystemPlaceholder:false,recordStatus:{code:"ACTIVO"},level:{code:"CORPORATIVO"}},orderBy:{sourceId:"desc"},select:{id:true,sourceId:true,objective:true,year:true,cycleId:true,focusAreaId:true}}),
  ]);
  const catalogs=Object.fromEntries(catalogCodes.map(code=>[code,values.filter(v=>v.catalog.code===code).map(({catalog:_,...v})=>v)]));
  return {catalogs,teams,parents:parents.map(p=>({...p,sourceId:String(p.sourceId) }))};
 }

 async list(year?:number,search?:string,teamIds:string[]|null=null){
  if(year!==undefined&&(!Number.isInteger(year)||year<2000||year>2100))throw new BadRequestException("Año inválido");
  const rows=await this.prisma.objective.findMany({where:{isSystemPlaceholder:false,year,teamId:teamIds===null?undefined:{in:teamIds},OR:search?.trim()?[{objective:{contains:search.trim(),mode:"insensitive"}},{keyResult:{contains:search.trim(),mode:"insensitive"}}]:undefined},orderBy:[{year:"desc"},{sourceId:"desc"}],include:{level:{select:{code:true,name:true}},team:{select:{id:true,sourceId:true}},focusArea:{select:{code:true,name:true}},cycle:{select:{code:true,name:true}},direction:{select:{code:true,name:true}},type:{select:{code:true,name:true}},unit:{select:{code:true,name:true}},resultStatus:{select:{code:true,name:true}},recordStatus:{select:{code:true,name:true}},parent:{select:{id:true,sourceId:true,objective:true}},_count:{select:{children:true,initiatives:true}}}});
  return rows.map(row=>this.dto(row));
 }

 async create(input:Input,teamIds:string[]|null=null,userId?:string,isAdmin=false){
  this.assertTeam(input.teamId,teamIds);
  await this.validateReferences(input);
  const data=await this.withAchievement(this.data(input,true));await this.validateScope(data.levelId,data.teamId);await this.validateBusinessRules(data,isAdmin);
  return this.prisma.$transaction(async tx=>{
   const maximum=await tx.objective.aggregate({_max:{sourceId:true}});
   const row=await tx.objective.create({data:{...data,sourceId:(maximum._max.sourceId??0n)+1n},include:{level:true,team:true,focusArea:true,cycle:true,direction:true,type:true,unit:true,resultStatus:true,recordStatus:true,parent:true,_count:{select:{children:true,initiatives:true}}}});
   await tx.audit.create({data:{occurredAt:new Date(),userId,action:"CREATE",entity:"OBJECTIVE",recordId:row.id,newValue:this.snapshot(row),result:"OK",origin:"WEB"}});
   return this.dto(row);
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }

 async update(id:string,input:Input,teamIds:string[]|null=null,userId?:string,isAdmin=false){
  const current=await this.prisma.objective.findUnique({where:{id}});
  if(!current)throw new NotFoundException("No se encontró el objetivo");
  if(current.isSystemPlaceholder)throw new BadRequestException("Los objetivos técnicos son administrados automáticamente");
  this.assertTeam(current.teamId,teamIds);
  this.assertTeam(input.teamId===undefined?current.teamId:input.teamId,teamIds);
  if(input.parentId===id)throw new BadRequestException("Un objetivo no puede depender de sí mismo");
  await this.validateReferences(input);
  const data=await this.withAchievement(this.data(input,false),current);const merged={levelId:data.levelId??current.levelId,teamId:data.teamId===undefined?current.teamId:data.teamId,parentId:data.parentId===undefined?current.parentId:data.parentId,year:data.year??current.year,cycleId:data.cycleId??current.cycleId,focusAreaId:data.focusAreaId??current.focusAreaId};await this.validateScope(merged.levelId,merged.teamId);await this.validateBusinessRules(merged,isAdmin);await this.assertNoHierarchyCycle(id,merged.parentId);
  return this.prisma.$transaction(async tx=>{const row=await tx.objective.update({where:{id},data,include:{level:true,team:true,focusArea:true,cycle:true,direction:true,type:true,unit:true,resultStatus:true,recordStatus:true,parent:true,_count:{select:{children:true,initiatives:true}}}});await tx.audit.create({data:{occurredAt:new Date(),userId,action:"UPDATE",entity:"OBJECTIVE",recordId:id,oldValue:this.snapshot(current),newValue:this.snapshot(row),result:"OK",origin:"WEB"}});return this.dto(row)});
 }

 private data(input:Input,required:boolean){
  const result:any={};
  const requiredText=["levelId","focusAreaId","cycleId","objective","keyResult","directionId","typeId","recordStatusId"];
  for(const key of requiredText){if(required||input[key]!==undefined)result[key]=this.text(input,key,true)}
  if(required||input.year!==undefined){const year=this.number(input,"year",true)!;if(!Number.isInteger(year)||year<2000||year>2100)throw new BadRequestException("El año debe estar entre 2000 y 2100");result.year=year}
  for(const key of ["parentId","teamId","unitId","resultStatusId"]){if(required||input[key]!==undefined)result[key]=this.text(input,key,false)}
  for(const key of ["baseline","target","actual"]){if(required||input[key]!==undefined)result[key]=this.number(input,key)}
  for(const key of ["baselineDate","cutoffDate"]){if(required||input[key]!==undefined)result[key]=this.date(input,key)}
  if((required||input.levelId!==undefined||input.teamId!==undefined)&&result.levelId&&result.teamId===undefined)result.teamId=this.text(input,"teamId",false);
  return result;
 }
}
