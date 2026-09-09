import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import {
  UserCapabilitiesSchema,
  type ModuleCapability,
  type UserCapabilities,
} from "@mochelab/shared";
import { MODULES, USER_WRITABLE_MODULES } from "./access.data";
import { PrismaService } from "../database/prisma.service";

export type ProfileCode = "USUARIO" | "ADMIN" | "SYSTEM";

@Injectable()
export class AccessService {
  constructor(@Optional() private readonly prisma?:PrismaService){}

  private defaults(profile:ProfileCode):UserCapabilities {
    const modules: ModuleCapability[] = MODULES.map((module) => {
      const isAdministrator = profile === "ADMIN" || profile === "SYSTEM";
      const canView = isAdministrator || !["CATALOGOS", "USUARIOS", "MIGRACIONES", "AUDITORIA"].includes(module.code);
      const canWrite = isAdministrator || USER_WRITABLE_MODULES.has(module.code);

      return {
        ...module,
        canView,
        canCreate: module.code !== "INICIO" && canWrite,
        canEdit: module.code !== "INICIO" && canWrite,
        canDelete: isAdministrator && !["INICIO", "AUDITORIA"].includes(module.code),
      };
    });

    return UserCapabilitiesSchema.parse({ profile, modules });
  }

  async getCapabilities(profile: ProfileCode): Promise<UserCapabilities> {
    if(!this.prisma)return this.defaults(profile);
    const stored=await this.prisma.profileModule.findMany({
      where:{profile:{code:profile,catalog:{code:"PERFIL_USUARIO"}},module:{active:true}},
      include:{module:true},
      orderBy:{module:{sortOrder:"asc"}},
    });
    if(!stored.length)return this.defaults(profile);
    return UserCapabilitiesSchema.parse({profile,modules:stored.map(row=>({
      code:row.module.code,name:row.module.name,route:row.module.route??"/",icon:row.module.icon??"circle",sortOrder:row.module.sortOrder,
      canView:row.canView,canCreate:row.canCreate,canEdit:row.canEdit,canDelete:row.canDelete,
    }))});
  }
  async getTeamScope(profile:ProfileCode,email?:string):Promise<string[]|null>{
    if(profile==="ADMIN"||profile==="SYSTEM"||!this.prisma)return null;
    const normalized=email?.trim().toLowerCase();
    if(!normalized)throw new ForbiddenException("Falta identificar la cuenta de desarrollo");
    const user=await this.prisma.user.findUnique({where:{email:normalized},include:{
      profile:true,
      status:true,
      person:{select:{dni:true,assignments:{where:{status:{code:"ACTIVO"}},select:{teamId:true}}}},
    }});
    if(!user||user.status.code!=="ACTIVO"||user.profile.code!==profile)throw new ForbiddenException("La cuenta no está activa o no corresponde al perfil indicado");
    if(!user.person?.dni?.trim())throw new ForbiddenException("La cuenta de Usuario debe estar vinculada a una persona con DNI");
    return [...new Set(user.person.assignments.map(item=>item.teamId))];
  }
  async getPersonId(profile:ProfileCode,email?:string):Promise<string|null>{
    if(!this.prisma)return null;
    if(profile==="ADMIN"||profile==="SYSTEM")return null;
    const normalized=email?.trim().toLowerCase();
    if(!normalized)throw new ForbiddenException("Falta identificar la cuenta de desarrollo");
    const user=await this.prisma.user.findUnique({where:{email:normalized},include:{profile:true,status:true}});
    if(!user||user.status.code!=="ACTIVO"||user.profile.code!==profile)throw new ForbiddenException("La cuenta no está activa o no corresponde al perfil indicado");
    if(!user.personId)throw new ForbiddenException("La cuenta no está vinculada a una persona");
    return user.personId;
  }
  async getUserId(profile:ProfileCode,email?:string):Promise<string>{
    if(!this.prisma)throw new ForbiddenException("Base de datos no disponible");
    const normalized=email?.trim().toLowerCase();
    if(!normalized)throw new ForbiddenException("Falta identificar la cuenta de desarrollo");
    const user=await this.prisma.user.findUnique({where:{email:normalized},include:{profile:true,status:true}});
    const accepted=profile==="ADMIN"?["ADMIN","SYSTEM"]:[profile];
    if(!user||user.status.code!=="ACTIVO"||!accepted.includes(user.profile.code as ProfileCode))throw new ForbiddenException("La cuenta no está activa o no corresponde al perfil indicado");
    return user.id;
  }
  async permissionMatrix(){
    if(!this.prisma)throw new BadRequestException("Base de datos no disponible");
    const profiles=await this.prisma.catalogValue.findMany({where:{active:true,catalog:{code:"PERFIL_USUARIO"},code:{in:["USUARIO","ADMIN","SYSTEM"]}},orderBy:{sortOrder:"asc"},include:{profileModuleAccesses:{include:{module:true}}}});
    return profiles.map(profile=>({id:profile.id,code:profile.code,name:profile.name,modules:profile.profileModuleAccesses.sort((a,b)=>a.module.sortOrder-b.module.sortOrder).map(row=>({moduleId:row.moduleId,code:row.module.code,name:row.module.name,canView:row.canView,canCreate:row.canCreate,canEdit:row.canEdit,canDelete:row.canDelete}))}));
  }
  async updatePermission(profileId:string,moduleId:string,input:{canView:boolean;canCreate:boolean;canEdit:boolean;canDelete:boolean},administratorId:string){
    if(!this.prisma)throw new BadRequestException("Base de datos no disponible");
    const current=await this.prisma.profileModule.findUnique({where:{profileId_moduleId:{profileId,moduleId}},include:{profile:true,module:true}});
    if(!current)throw new NotFoundException("No se encontró la asignación de permisos");
    const normalized={canView:Boolean(input.canView),canCreate:Boolean(input.canCreate)&&Boolean(input.canView),canEdit:Boolean(input.canEdit)&&Boolean(input.canView),canDelete:Boolean(input.canDelete)&&Boolean(input.canView)};
    return this.prisma.$transaction(async tx=>{const updated=await tx.profileModule.update({where:{profileId_moduleId:{profileId,moduleId}},data:normalized});await tx.audit.create({data:{occurredAt:new Date(),userId:administratorId,action:"UPDATE_PERMISSION",entity:"PROFILE_MODULE",recordId:profileId+":"+moduleId,oldValue:{canView:current.canView,canCreate:current.canCreate,canEdit:current.canEdit,canDelete:current.canDelete},newValue:normalized,result:"OK",origin:"WEB"}});return updated});
  }
}
