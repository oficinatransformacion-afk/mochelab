import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, UnauthorizedException } from "@nestjs/common";
import type { UserCapabilities } from "@mochelab/shared";
import { AccessService,profileCode,type ProfileCode } from "./access.service";
import { AdminOnly } from "./access.decorators";
import { LocalAuthService } from "../auth/local-auth.service";

@Controller("me")
export class AccessController {
  constructor(private readonly accessService: AccessService,private readonly auth:LocalAuthService) {}

  @Get("capabilities")
  async getCapabilities(
    @Headers("x-mochelab-demo-profile") requestedProfile?: string,
    @Headers("x-mochelab-demo-user-email") requestedEmail?: string,
    @Headers("authorization") authorization?:string,
  ): Promise<UserCapabilities> {
    const token=authorization?.replace(/^Bearer\s+/i,"");
    const claims=token?this.auth.verifySession(token):null;
    if(process.env.NODE_ENV==="production"&&!claims)throw new UnauthorizedException("Debes iniciar sesión");
    const raw=(claims?.profile??requestedProfile)?.toUpperCase();
    const profile: ProfileCode = profileCode(raw);
    const personId=await this.accessService.getPersonId(profile,claims?.email??requestedEmail);
    return {...await this.accessService.getCapabilities(profile),personId};
  }
}
@AdminOnly()
@Controller("access/admin")
export class PermissionsController{
  constructor(private readonly accessService:AccessService){}
  @Get("permissions") matrix(){return this.accessService.permissionMatrix()}
  @Patch("profiles/:profileId/modules/:moduleId")
  async update(@Param("profileId") profileId:string,@Param("moduleId") moduleId:string,@Body() body:{canView?:boolean;canCreate?:boolean;canEdit?:boolean;canDelete?:boolean},@Headers("x-mochelab-demo-user-email") email?:string){
    if(["canView","canCreate","canEdit","canDelete"].some(key=>typeof body[key as keyof typeof body]!=="boolean"))throw new BadRequestException("Debe indicar los cuatro permisos");
    return this.accessService.updatePermission(profileId,moduleId,body as Required<typeof body>,await this.accessService.getUserId("ADMIN",email));
  }
}
