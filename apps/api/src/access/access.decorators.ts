import { SetMetadata } from "@nestjs/common";

export const REQUIRED_PROFILE_KEY = "mochelab.requiredProfile";

export const AdminOnly = () => SetMetadata(REQUIRED_PROFILE_KEY, "ADMIN");

export const REQUIRED_PERMISSION_KEY = "mochelab.requiredPermission";
export type PermissionAction = "view" | "create" | "edit" | "delete";
export const RequirePermission = (moduleCode:string,action:PermissionAction) =>
  SetMetadata(REQUIRED_PERMISSION_KEY,{moduleCode,action});
