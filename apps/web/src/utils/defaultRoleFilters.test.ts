import { describe, expect, it } from "vitest";
import { defaultRoleFilterIds } from "./defaultRoleFilters";

describe("defaultRoleFilterIds", () => {
  it("preselecciona únicamente los seis roles operativos aunque varíen las tildes", () => {
    const roles = [
      { id: "1", label: "Sponsor" },
      { id: "2", label: "Líder AE" },
      { id: "3", label: "LIDER EAD" },
      { id: "4", label: "Dueño de Programa" },
      { id: "5", label: "DUEÑO DE PRODUCTO" },
      { id: "6", label: "ATF" },
      { id: "7", label: "Administrador" },
    ];

    expect(defaultRoleFilterIds(roles, role => role.id, role => role.label)).toEqual(["1", "2", "3", "4", "5", "6"]);
  });
});
