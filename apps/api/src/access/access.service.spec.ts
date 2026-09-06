import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AccessService } from "./access.service";

describe("AccessService", () => {
  const service = new AccessService();

  it("gives the administrator access to configuration modules", async () => {
    const result = await service.getCapabilities("ADMINISTRADOR");
    const users = result.modules.find((module) => module.code === "USUARIOS");

    expect(users).toMatchObject({
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
    });
  });

  it("hides configuration and deletion from a regular user", async () => {
    const result = await service.getCapabilities("USUARIO");
    const catalogs = result.modules.find((module) => module.code === "CATALOGOS");
    const objectives = result.modules.find((module) => module.code === "OBJETIVOS");

    expect(catalogs?.canView).toBe(false);
    expect(objectives).toMatchObject({
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: false,
    });
  });

  it("limits a regular user to the teams assigned to the active account", async () => {
    const findUnique=vi.fn().mockResolvedValue({profile:{code:"USUARIO"},status:{code:"ACTIVO"},teams:[{teamId:"team-1"},{teamId:"team-2"}]});
    const scoped=new AccessService({user:{findUnique}} as never);
    await expect(scoped.getTeamScope("USUARIO","USER@EXAMPLE.COM")).resolves.toEqual(["team-1","team-2"]);
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({where:{email:"user@example.com"}}));
  });

  it("rejects an inactive or mismatched development account", async () => {
    const scoped=new AccessService({user:{findUnique:vi.fn().mockResolvedValue({profile:{code:"USUARIO"},status:{code:"INACTIVO"},teams:[]})}} as never);
    await expect(scoped.getTeamScope("USUARIO","user@example.com")).rejects.toThrow(ForbiddenException);
  });

  it("resolves the person linked to an active account", async () => {
    const scoped=new AccessService({user:{findUnique:vi.fn().mockResolvedValue({profile:{code:"USUARIO"},status:{code:"ACTIVO"},personId:"person-1"})}} as never);
    await expect(scoped.getPersonId("USUARIO","user@example.com")).resolves.toBe("person-1");
  });

  it("rejects self-service access when the account has no linked person", async () => {
    const scoped=new AccessService({user:{findUnique:vi.fn().mockResolvedValue({profile:{code:"USUARIO"},status:{code:"ACTIVO"},personId:null})}} as never);
    await expect(scoped.getPersonId("USUARIO","user@example.com")).rejects.toThrow(ForbiddenException);
  });

  it("resolves the real active administrator for audit records",async()=>{
    const findUnique=vi.fn().mockResolvedValue({id:"admin-1",profile:{code:"ADMINISTRADOR"},status:{code:"ACTIVO"}});
    const scoped=new AccessService({user:{findUnique}} as never);
    await expect(scoped.getUserId("ADMINISTRADOR","ADMIN@EXAMPLE.COM")).resolves.toBe("admin-1");
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({where:{email:"admin@example.com"}}));
  });
});
