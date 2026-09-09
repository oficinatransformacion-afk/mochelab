import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AccessService } from "./access.service";

describe("AccessService", () => {
  const service = new AccessService();

  it("gives the administrator access to configuration modules", async () => {
    const result = await service.getCapabilities("ADMIN");
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
    const assignments = result.modules.find((module) => module.code === "ASIGNACIONES");

    expect(catalogs?.canView).toBe(false);
    expect(objectives).toMatchObject({
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: false,
    });
    expect(assignments).toMatchObject({
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: false,
    });
  });

  it("limits a regular user to the active teams associated through the linked DNI", async () => {
    const findUnique=vi.fn().mockResolvedValue({profile:{code:"USUARIO"},status:{code:"ACTIVO"},person:{dni:"12345678",assignments:[{teamId:"team-1"},{teamId:"team-2"},{teamId:"team-1"}]}});
    const scoped=new AccessService({user:{findUnique}} as never);
    await expect(scoped.getTeamScope("USUARIO","USER@EXAMPLE.COM")).resolves.toEqual(["team-1","team-2"]);
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({where:{email:"user@example.com"}}));
  });

  it("rejects an inactive or mismatched development account", async () => {
    const scoped=new AccessService({user:{findUnique:vi.fn().mockResolvedValue({profile:{code:"USUARIO"},status:{code:"INACTIVO"},person:{dni:"12345678",assignments:[]}})}} as never);
    await expect(scoped.getTeamScope("USUARIO","user@example.com")).rejects.toThrow(ForbiddenException);
  });

  it("rejects team scope when a Usuario account has no linked DNI", async () => {
    const scoped=new AccessService({user:{findUnique:vi.fn().mockResolvedValue({profile:{code:"USUARIO"},status:{code:"ACTIVO"},person:null})}} as never);
    await expect(scoped.getTeamScope("USUARIO","user@example.com")).rejects.toThrow("vinculada a una persona con DNI");
  });

  it("keeps global team scope for Admin and System", async () => {
    const scoped=new AccessService({} as never);
    await expect(scoped.getTeamScope("ADMIN","admin@example.com")).resolves.toBeNull();
    await expect(scoped.getTeamScope("SYSTEM","system@example.com")).resolves.toBeNull();
  });

  it("does not require a linked person for Admin or System", async () => {
    const scoped=new AccessService({} as never);
    await expect(scoped.getPersonId("ADMIN","admin@example.com")).resolves.toBeNull();
    await expect(scoped.getPersonId("SYSTEM","system@example.com")).resolves.toBeNull();
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
    const findUnique=vi.fn().mockResolvedValue({id:"admin-1",profile:{code:"ADMIN"},status:{code:"ACTIVO"}});
    const scoped=new AccessService({user:{findUnique}} as never);
    await expect(scoped.getUserId("ADMIN","ADMIN@EXAMPLE.COM")).resolves.toBe("admin-1");
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({where:{email:"admin@example.com"}}));
  });
});
