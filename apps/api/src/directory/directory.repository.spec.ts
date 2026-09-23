import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { DirectoryRepository } from "./directory.repository";

describe("DirectoryRepository assignment scope", () => {
  it("requires a meaningful reason for an assignment without a development path", async () => {
    const repository = new DirectoryRepository({} as never);

    await expect(repository.assignPerson("person-1", "role-1", "team-1", "admin-1", null, { withoutDevelopmentPath: true, reason: "breve" }))
      .rejects.toThrow("La justificación de Sin ruta de desarrollo debe tener al menos 10 caracteres");
  });

  it("paginates people in the database and returns the complete filtered total", async () => {
    const prisma = {
      person: {
        count: vi.fn().mockResolvedValue(1250),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const repository = new DirectoryRepository(prisma as never);

    const result = await repository.listPeoplePage({ search: "ana", page: 3, pageSize: 20, statuses: ["Activo"] });

    expect(result).toEqual({ items: [], total: 1250, page: 3, pageSize: 20, pages: 63 });
    expect(prisma.person.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 40, take: 20 }));
    expect(prisma.person.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { name: { in: ["Activo"] } } }),
    }));
  });

  it("clamps the people page size to protect the API", async () => {
    const prisma = { person: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) } };
    const repository = new DirectoryRepository(prisma as never);

    const result = await repository.listPeoplePage({ page: 1, pageSize: 500 });

    expect(result.pageSize).toBe(100);
    expect(prisma.person.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
  });

  it("rejects assigning a person who is not an active member of the user's teams", async () => {
    const prisma = {
      person: { findUnique: vi.fn().mockResolvedValue({ id: "person-2" }) },
      role: { findUnique: vi.fn().mockResolvedValue({ id: "role-1" }) },
      team: { findUnique: vi.fn().mockResolvedValue({ id: "team-1" }) },
      catalogValue: { findFirst: vi.fn().mockResolvedValue({ id: "state-1" }) },
      personRole: { count: vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1) },
    };
    const repository = new DirectoryRepository(prisma as never);

    await expect(repository.assignPerson("person-2", "role-1", "team-1", "user-1", ["team-1"]))
      .rejects.toThrow("La persona no pertenece a tus equipos autorizados");
  });

  it("rejects updating an assignment outside the user's team scope", async () => {
    const prisma = { personRole: { findUnique: vi.fn().mockResolvedValue({ id: "assignment-1", teamId: "team-2", status: {}, onboardingStatus: {} }) } };
    const repository = new DirectoryRepository(prisma as never);

    await expect(repository.updateAssignment("assignment-1", {}, "user-1", ["team-1"]))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});
