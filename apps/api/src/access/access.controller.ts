import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, UnauthorizedException } from "@nestjs/common";
import type { UserCapabilities } from "@mochelab/shared";
import { AccessService, type ProfileCode } from "./access.service";
import { AdminOnly } from "./access.decorators";

@Controller("me")
export class AccessController {
  constructor(private readonly accessService: AccessService) {}

  @Get("capabilities")
  getCapabilities(
    @Headers("x-mochelab-demo-profile") requestedProfile?: string,
  ): Promise<UserCapabilities> {
    if (process.env.NODE_ENV === "production") {
      throw new UnauthorizedException("La autenticación corporativa aún no está configurada");
    }

    const profile: ProfileCode =
      requestedProfile?.toUpperCase() === "ADMINISTRADOR"
        ? "ADMINISTRADOR"
        : "USUARIO";

    return this.accessService.getCapabilities(profile);
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
    return this.accessService.updatePermission(profileId,moduleId,body as Required<typeof body>,await this.accessService.getUserId("ADMINISTRADOR",email));
  }
}
