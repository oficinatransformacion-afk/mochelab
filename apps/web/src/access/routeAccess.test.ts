import { describe,expect,it } from "vitest";
import { isAdministratorPath,moduleForPath } from "./routeAccess";

describe("route access",()=>{
  it("maps public module routes to their capability",()=>{
    expect(moduleForPath("/personas/abc")).toBe("PERSONAS");
    expect(moduleForPath("/objetivos/metas")).toBe("METAS");
    expect(moduleForPath("/madurez/equipos")).toBe("MADUREZ");
  });
  it("does not turn an unknown route into Inicio",()=>expect(moduleForPath("/ruta-inexistente")).toBeNull());
  it("recognizes administrator-only routes",()=>{
    expect(isAdministratorPath("/configuracion/auditoria")).toBe(true);
    expect(isAdministratorPath("/personas")).toBe(false);
  });
});
