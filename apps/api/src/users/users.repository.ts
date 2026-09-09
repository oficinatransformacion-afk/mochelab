import { BadRequestException,Injectable,NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class UsersRepository{
 constructor(private readonly prisma:PrismaService){}
 private snapshot(v:unknown){return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue}
 private email(v:unknown){const x=typeof v==="string"?v.trim().toLowerCase():"";if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))throw new BadRequestException("Correo inválido");return x}
 async getEmail(id:string){const user=await this.prisma.user.findUnique({where:{id},select:{email:true}});if(!user)throw new NotFoundException("No se encontró el usuario");return user}
 async options(){
  const [values,teams,people]=await Promise.all([
   this.prisma.catalogValue.findMany({where:{active:true,OR:[{catalog:{code:"ESTADO_USUARIO"}},{catalog:{code:"PERFIL_USUARIO"},code:{in:["USUARIO","ADMIN","SYSTEM"]}}]},orderBy:[{catalog:{code:"asc"}},{sortOrder:"asc"}],select:{id:true,code:true,name:true,catalog:{select:{code:true}}}}),
   this.prisma.team.findMany({orderBy:{sourceId:"asc"},select:{id:true,sourceId:true,program:{select:{name:true}}}}),
   this.prisma.person.findMany({where:{status:{code:"ACTIVO"}},orderBy:{names:"asc"},select:{id:true,dni:true,names:true,email:true,company:{select:{name:true}},user:{select:{id:true}}}}),
  ]);
  return{profiles:values.filter(x=>x.catalog.code==="PERFIL_USUARIO").map(({catalog:_,...x})=>x),statuses:values.filter(x=>x.catalog.code==="ESTADO_USUARIO").map(({catalog:_,...x})=>x),teams,people};
 }
 async list(search?:string){return this.prisma.user.findMany({where:search?.trim()?{OR:[{email:{contains:search.trim(),mode:"insensitive"}},{name:{contains:search.trim(),mode:"insensitive"}},{person:{names:{contains:search.trim(),mode:"insensitive"}}}]}:undefined,orderBy:{email:"asc"},include:{profile:{select:{id:true,code:true,name:true}},status:{select:{id:true,code:true,name:true}},person:{select:{id:true,dni:true,names:true,company:{select:{name:true}}}},teams:{include:{team:{select:{id:true,sourceId:true}}}}}})}
 async refs(profileId:string,statusId:string,teamIds:string[],personId:string|null,currentUserId?:string){
  const [profile,status,teams,person]=await Promise.all([
   this.prisma.catalogValue.findFirst({where:{id:profileId,code:{in:["USUARIO","ADMIN","SYSTEM"]},catalog:{code:"PERFIL_USUARIO"}}}),
   this.prisma.catalogValue.findFirst({where:{id:statusId,catalog:{code:"ESTADO_USUARIO"}}}),
   this.prisma.team.count({where:{id:{in:teamIds}}}),
   personId?this.prisma.person.findUnique({where:{id:personId},select:{id:true,user:{select:{id:true}}}}):Promise.resolve(null),
  ]);
  if(!profile||!status||teams!==teamIds.length||personId&&!person)throw new BadRequestException("Perfil, estado, persona o equipos inválidos");
  if(person?.user&&person.user.id!==currentUserId)throw new BadRequestException("La persona ya está vinculada a otra cuenta");
  return{profile,status};
 }
 async create(i:Record<string,unknown>,administratorId:string){
  const email=this.email(i.email),name=typeof i.name==="string"?i.name.trim()||null:null,profileId=String(i.profileId||""),statusId=String(i.statusId||""),personId=i.personId?String(i.personId):null,teamIds=[...new Set(Array.isArray(i.teamIds)?i.teamIds.map(String):[])];
  await this.refs(profileId,statusId,teamIds,personId);
  try{return await this.prisma.$transaction(async tx=>{const user=await tx.user.create({data:{email,name,profileId,statusId,personId,teams:{create:teamIds.map(teamId=>({teamId}))}},include:{profile:true,status:true,person:true,teams:{include:{team:true}}}});await tx.audit.create({data:{occurredAt:new Date(),userId:administratorId,action:"CREATE",entity:"USER",recordId:user.id,newValue:this.snapshot(user),result:"OK",origin:"WEB"}});return user})}catch(e:unknown){if(typeof e==="object"&&e&&"code" in e&&e.code==="P2002")throw new BadRequestException("Ya existe un usuario con ese correo o persona");throw e}
 }
 async update(id:string,i:Record<string,unknown>,administratorId:string){
  const current=await this.prisma.user.findUnique({where:{id},include:{profile:true,status:true,teams:true}});if(!current)throw new NotFoundException("No se encontró el usuario");
  const email=i.email===undefined?current.email:this.email(i.email),name=i.name===undefined?current.name:typeof i.name==="string"?i.name.trim()||null:null,profileId=String(i.profileId??current.profileId),statusId=String(i.statusId??current.statusId),personId=i.personId===undefined?current.personId:i.personId?String(i.personId):null,teamIds=[...new Set(Array.isArray(i.teamIds)?i.teamIds.map(String):current.teams.map(x=>x.teamId))];
  const refs=await this.refs(profileId,statusId,teamIds,personId,id);
  if(current.profile.code==="ADMIN"&&(refs.profile.code!=="ADMIN"||refs.status.code!=="ACTIVO")){const activeAdmins=await this.prisma.user.count({where:{profile:{code:"ADMIN"},status:{code:"ACTIVO"}}});if(activeAdmins<=1)throw new BadRequestException("No se puede desactivar o degradar al último admin activo")}
  return this.prisma.$transaction(async tx=>{await tx.userTeam.deleteMany({where:{userId:id}});const user=await tx.user.update({where:{id},data:{email,name,profileId,statusId,personId,teams:{create:teamIds.map(teamId=>({teamId}))}},include:{profile:true,status:true,person:true,teams:{include:{team:true}}}});await tx.audit.create({data:{occurredAt:new Date(),userId:administratorId,action:"UPDATE",entity:"USER",recordId:id,oldValue:this.snapshot(current),newValue:this.snapshot(user),result:"OK",origin:"WEB"}});return user})
 }
}
