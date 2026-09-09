import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Optional, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { REQUIRED_PERMISSION_KEY, REQUIRED_PROFILE_KEY, type PermissionAction } from "./access.decorators";
import { AccessService, type ProfileCode } from "./access.service";
import { LocalAuthService } from "../auth/local-auth.service";

interface RequestWithHeaders {
  header(name: string): string | undefined;
  headers:Record<string,string|undefined>;
}

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector,private readonly accessService:AccessService,@Optional() private readonly auth?:LocalAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredProfile = this.reflector.getAllAndOverride<ProfileCode | undefined>(
      REQUIRED_PROFILE_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredPermission=this.reflector.getAllAndOverride<{moduleCode:string;action:PermissionAction}|undefined>(REQUIRED_PERMISSION_KEY,[context.getHandler(),context.getClass()]);
    if (!requiredProfile&&!requiredPermission) return true;

    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    const bearer=request.header("authorization")?.replace(/^Bearer\s+/i,"");
    const claims=bearer?this.auth?.verifySession(bearer)??null:null;
    if(claims){request.headers["x-mochelab-demo-profile"]=claims.profile;request.headers["x-mochelab-demo-user-email"]=claims.email}
    const rawProfile = (claims?.profile??request.header("x-mochelab-demo-profile"))?.toUpperCase();
    if (process.env.NODE_ENV === "production"&&!claims) throw new UnauthorizedException("Debes iniciar sesión");
    if (!rawProfile) {
      throw new UnauthorizedException("Falta el perfil de desarrollo");
    }
    if (requiredProfile&&rawProfile !== requiredProfile&&!(requiredProfile==="ADMIN"&&rawProfile==="SYSTEM")) {
      throw new ForbiddenException("El perfil no tiene acceso a esta operación");
    }
    if(requiredPermission&&typeof requiredPermission==="object"){
      const profile:ProfileCode=rawProfile==="SYSTEM"?"SYSTEM":rawProfile==="ADMIN"?"ADMIN":"USUARIO";
      const module=(await this.accessService.getCapabilities(profile)).modules.find(item=>item.code===requiredPermission.moduleCode);
      const property={view:"canView",create:"canCreate",edit:"canEdit",delete:"canDelete"}[requiredPermission.action] as "canView"|"canCreate"|"canEdit"|"canDelete";
      if(!module?.[property])throw new ForbiddenException("El perfil no tiene permiso para esta función");
    }
    return true;
  }
}
