import { ConflictException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { DirectoryRepository } from "./directory.repository";

describe("DirectoryRepository assignment scope", () => {
  it("requires a meaningful reason for an assignment without a development path", async () => {
    const repository = new DirectoryRepository({} as never);

    await expect(repository.assignPerson("person-1", "role-1", "team-1", "admin-1", null, { withoutDevelopmentPath: true, reasonCode:"OTRO",detail: "breve" }))
      .rejects.toThrow("El detalle para el motivo Otro debe tener al menos 10 caracteres");
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

  it("returns the focus area id required to edit a team", async () => {
    const prisma = {
      team: {
        findMany: vi.fn().mockResolvedValue([{
          id: "team-1", sourceId: "2", name: "EAD Alcachofa", focusAreaId: "focus-1", programId: null,
          unitId: null, focusArea: { name: "EAD" }, program: null, unit: null,
          status: { name: "ACTIVO" }, statusId: "status-1", assignments: [],
        }]),
      },
    };
    const repository = new DirectoryRepository(prisma as never);

    const [team] = await repository.listTeams();

    expect(team).toEqual(expect.objectContaining({ id: "team-1", focusAreaId: "focus-1", focusArea: "EAD" }));
  });

  it("rejects assigning any person outside the user's authorized team", async () => {
    const prisma = {
      person: { findUnique: vi.fn().mockResolvedValue({ id: "person-2",status:{code:"ACTIVO"} }) },
      role: { findUnique: vi.fn().mockResolvedValue({ id: "role-1",status:{code:"ACTIVO"} }) },
      team: { findUnique: vi.fn().mockResolvedValue({ id: "team-2",status:{code:"ACTIVO"} }) },
      catalogValue: { findFirst: vi.fn().mockResolvedValue({ id: "state-1" }) },
    };
    const repository = new DirectoryRepository(prisma as never);

    await expect(repository.assignPerson("person-2", "role-1", "team-2", "user-1", ["team-1"]))
      .rejects.toThrow("El equipo no pertenece a tu alcance autorizado");
  });

  it("returns the existing assignment details when person, role and team are duplicated", async () => {
    const prisma = {
      person: { findUnique: vi.fn().mockResolvedValue({ id: "person-1", status: { code: "ACTIVO" } }) },
      role: { findUnique: vi.fn().mockResolvedValue({ id: "role-1", status: { code: "ACTIVO" } }) },
      team: { findUnique: vi.fn().mockResolvedValue({ id: "team-1", status: { code: "ACTIVO" } }) },
      catalogValue: { findFirst: vi.fn().mockResolvedValue({ id: "catalog-value-1" }) },
      assessmentModel: { findMany: vi.fn().mockResolvedValue([{ id: "model-1", name: "Modelo publicado" }]) },
      personRole: { findUnique: vi.fn().mockResolvedValue({
        id: "assignment-1",
        person: { names: "Persona Existente" },
        role: { name: "DUEÑO DE PRODUCTO" },
        team: { sourceId: "1", name: "Agilidad en Acción" },
      }) },
    };
    const repository = new DirectoryRepository(prisma as never);

    try {
      await repository.assignPerson("person-1", "role-1", "team-1", "admin-1", null, { withoutDevelopmentPath: false, modelIds: ["model-1"] });
      throw new Error("La operación debió rechazar el duplicado");
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toEqual(expect.objectContaining({
        message: "La persona ya tiene ese rol en el equipo",
        existingAssignmentId: "assignment-1",
        personName: "Persona Existente",
        roleName: "DUEÑO DE PRODUCTO",
        teamName: "Agilidad en Acción",
      }));
    }
  });

  it("filters the people directory independently by management and division", async () => {
    const prisma = { person: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) } };
    const repository = new DirectoryRepository(prisma as never);

    await repository.listPeoplePage({ managements:["management-1"],divisions:["division-1"] });

    expect(prisma.person.count).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({managementId:{in:["management-1"]},divisionId:{in:["division-1"]}})}));
  });

  it("offers every active person and role while keeping teams within facilitator scope", async () => {
    const prisma = {
      person: { findMany: vi.fn().mockResolvedValue([]) },
      role: { findMany: vi.fn().mockResolvedValue([]) },
      team: { findMany: vi.fn().mockResolvedValue([]) },
      catalogValue: { findMany: vi.fn().mockResolvedValue([]) },
      assessmentModel: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const repository = new DirectoryRepository(prisma as never);

    await repository.listAssignmentOptions(["team-1"]);

    expect(prisma.person.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: { code: "ACTIVO" } } }));
    expect(prisma.role.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: { code: "ACTIVO" } } }));
    expect(prisma.team.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: { code: "ACTIVO" }, id: { in: ["team-1"] } },
    }));
  });

  it("rejects updating an assignment outside the user's team scope", async () => {
    const prisma = { personRole: { findUnique: vi.fn().mockResolvedValue({ id: "assignment-1", teamId: "team-2", status: {}, onboardingStatus: {} }) } };
    const repository = new DirectoryRepository(prisma as never);

    await expect(repository.updateAssignment("assignment-1", {}, "user-1", ["team-1"]))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});
