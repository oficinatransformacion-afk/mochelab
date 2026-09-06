import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AccessGuard } from "./access.guard";

function context(profile?: string): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({
      getRequest: () => ({ header: () => profile }),
    }),
  } as unknown as ExecutionContext;
}

describe("AccessGuard", () => {
  const reflector = { getAllAndOverride: vi.fn(() => "ADMINISTRADOR") };
  const access={getCapabilities:(profile:string)=>({profile,modules:[]})};
  const guard = new AccessGuard(reflector as never,access as never);

  it("allows the administrator in development", async () => {
    await expect(guard.canActivate(context("ADMINISTRADOR"))).resolves.toBe(true);
  });

  it("rejects a regular user", async () => {
    await expect(guard.canActivate(context("USUARIO"))).rejects.toThrow(ForbiddenException);
  });

  it("rejects a request without identity", async () => {
    await expect(guard.canActivate(context())).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a functional permission not granted to the profile", async () => {
    const permissionReflector={getAllAndOverride:vi.fn((key:string)=>key.includes("requiredPermission")?{moduleCode:"CURSOS",action:"create"}:undefined)};
    const permissionGuard=new AccessGuard(permissionReflector as never,new (class {getCapabilities(){return {profile:"USUARIO",modules:[{code:"CURSOS",canView:true,canCreate:false,canEdit:false,canDelete:false}]}}})() as never);
    await expect(permissionGuard.canActivate(context("USUARIO"))).rejects.toThrow(ForbiddenException);
  });
});
