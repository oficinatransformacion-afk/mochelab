import { describe, expect, it, vi } from "vitest";
import { InitiativesRepository } from "./initiatives.repository";

describe("InitiativesRepository responsables", () => {
  it("acepta un Sponsor activo del mismo equipo como responsable opcional", async () => {
    const prisma = {
      personRole: {
        findFirst: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve({
          person: { names: where.id === "owner-id" ? "Dueño" : "Sponsor" },
          role: { name: where.id === "owner-id" ? "DUEÑO DE PRODUCTO" : "SPONSOR" },
        })),
      },
    };
    const repository = new InitiativesRepository(prisma as never);

    const result = await (repository as any).resolveResponsibles({ productOwnerPersonRoleId: "owner-id", sponsorPersonRoleId: "sponsor-id" }, "team-id");

    expect(result.rows).toEqual([
      { personRoleId: "owner-id", responsibilityType: "PRODUCT_OWNER" },
      { personRoleId: "sponsor-id", responsibilityType: "SPONSOR" },
    ]);
    expect(prisma.personRole.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "sponsor-id", teamId: "team-id" }) }));
  });

  it("rechaza una asignación que no corresponde al rol Sponsor", async () => {
    const prisma = {
      personRole: {
        findFirst: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve({
          person: { names: "Persona" },
          role: { name: where.id === "owner-id" ? "DUEÑO DE PRODUCTO" : "ATF" },
        })),
      },
    };
    const repository = new InitiativesRepository(prisma as never);

    await expect((repository as any).resolveResponsibles({ productOwnerPersonRoleId: "owner-id", sponsorPersonRoleId: "not-sponsor-id" }, "team-id")).rejects.toThrow("El responsable no corresponde al rol SPONSOR");
  });
});
