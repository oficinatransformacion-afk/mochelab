import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { DirectoryRepository } from "./directory.repository";

describe("DirectoryRepository assignment scope", () => {
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
