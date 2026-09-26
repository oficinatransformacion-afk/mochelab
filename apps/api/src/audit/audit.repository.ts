import { BadRequestException,Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

type AuditFilters={entities?:string[];actions?:string[];results?:string[];origins?:string[];search?:string;from?:string;to?:string;page?:number;pageSize?:number};

@Injectable()
export class AuditRepository{
  constructor(private readonly prisma:PrismaService){}
  private date(value:string|undefined,end=false){if(!value)return undefined;const date=new Date(value+(end?"T23:59:59.999":"T00:00:00.000"));if(Number.isNaN(date.getTime()))throw new BadRequestException("Fecha inválida");return date}
  async options(){const[entities,actions,results,origins]=await Promise.all([this.prisma.audit.findMany({distinct:["entity"],select:{entity:true},orderBy:{entity:"asc"}}),this.prisma.audit.findMany({distinct:["action"],select:{action:true},orderBy:{action:"asc"}}),this.prisma.audit.findMany({where:{result:{not:null}},distinct:["result"],select:{result:true},orderBy:{result:"asc"}}),this.prisma.audit.findMany({where:{origin:{not:null}},distinct:["origin"],select:{origin:true},orderBy:{origin:"asc"}})]);return{entities:entities.map(x=>x.entity),actions:actions.map(x=>x.action),results:results.flatMap(x=>x.result?[x.result]:[]),origins:origins.flatMap(x=>x.origin?[x.origin]:[])}}
  async list(q:AuditFilters){
    const from=this.date(q.from),to=this.date(q.to,true);if(from&&to&&to<from)throw new BadRequestException("La fecha final no puede ser anterior a la inicial");
    const page=Math.max(1,q.page??1),pageSize=Math.min(100,Math.max(1,q.pageSize??25));
    const where={entity:q.entities?.length?{in:q.entities}:undefined,action:q.actions?.length?{in:q.actions}:undefined,result:q.results?.length?{in:q.results}:undefined,origin:q.origins?.length?{in:q.origins}:undefined,occurredAt:from||to?{gte:from,lte:to}:undefined,OR:q.search?.trim()?[{actorLegacy:{contains:q.search.trim(),mode:"insensitive" as const}},{recordId:{contains:q.search.trim(),mode:"insensitive" as const}},{entity:{contains:q.search.trim(),mode:"insensitive" as const}},{action:{contains:q.search.trim(),mode:"insensitive" as const}},{user:{email:{contains:q.search.trim(),mode:"insensitive" as const}}},{user:{name:{contains:q.search.trim(),mode:"insensitive" as const}}}]:undefined};
    const[total,items]=await Promise.all([this.prisma.audit.count({where}),this.prisma.audit.findMany({where,orderBy:{occurredAt:"desc"},skip:(page-1)*pageSize,take:pageSize,select:{id:true,occurredAt:true,user:{select:{email:true,name:true}},actorLegacy:true,action:true,entity:true,recordId:true,oldValue:true,newValue:true,result:true,origin:true}})]);
    return{items,total,page,pageSize,pages:Math.max(1,Math.ceil(total/pageSize))};
  }
}
