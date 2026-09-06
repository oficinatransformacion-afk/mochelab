import type { ModuleCapability } from "@mochelab/shared";

type ModuleDefinition = Pick<
  ModuleCapability,
  "code" | "name" | "route" | "icon" | "sortOrder"
>;

export const MODULES: ModuleDefinition[] = [
  { code: "INICIO", name: "Inicio", route: "/", icon: "home", sortOrder: 10 },
  { code: "PERSONAS", name: "Personas", route: "/personas", icon: "users", sortOrder: 20 },
  { code: "EQUIPOS", name: "Equipos", route: "/equipos", icon: "users-round", sortOrder: 30 },
  { code: "CURSOS", name: "Cursos", route: "/cursos", icon: "book-open", sortOrder: 40 },
  { code: "MADUREZ", name: "Madurez", route: "/madurez", icon: "gauge", sortOrder: 50 },
  { code: "OBJETIVOS", name: "Objetivos", route: "/objetivos", icon: "target", sortOrder: 60 },
  { code: "PORTAFOLIO", name: "Portafolio", route: "/portafolio", icon: "briefcase-business", sortOrder: 70 },
  { code: "CATALOGOS", name: "Catálogos", route: "/configuracion/catalogos", icon: "list", sortOrder: 80 },
  { code: "USUARIOS", name: "Usuarios", route: "/configuracion/usuarios", icon: "user-cog", sortOrder: 90 },
  { code: "MIGRACIONES", name: "Migraciones", route: "/configuracion/migraciones", icon: "database", sortOrder: 100 },
  { code: "AUDITORIA", name: "Auditoría", route: "/configuracion/auditoria", icon: "history", sortOrder: 110 },
];

export const USER_WRITABLE_MODULES = new Set(["MADUREZ", "OBJETIVOS", "PORTAFOLIO"]);
