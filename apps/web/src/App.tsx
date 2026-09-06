import { useEffect, useState } from "react";
import {
  UserCapabilitiesSchema,
  type UserCapabilities,
} from "@mochelab/shared";
import { SelfAssessmentPage } from "./maturity/SelfAssessmentPage";
import { CalibrationPage } from "./maturity/CalibrationPage";
import { CalibrationQueuePage } from "./maturity/CalibrationQueuePage";
import { MaturityConfigurationPage } from "./maturity/MaturityConfigurationPage";
import { MaturityPeriodsPage } from "./maturity/MaturityPeriodsPage";
import { PeoplePage } from "./directory/PeoplePage";
import { TeamsPage } from "./directory/TeamsPage";
import { AcademyPage } from "./academy/AcademyPage";
import { CourseProgressPage } from "./academy/CourseProgressPage";
import { ObjectivesPage } from "./objectives/ObjectivesPage";
import { InitiativesPage } from "./initiatives/InitiativesPage";
import { PermissionsPage } from "./access/PermissionsPage";
import { CatalogsPage } from "./catalogs/CatalogsPage";
import { UsersPage } from "./access/UsersPage";
import { AuditPage } from "./audit/AuditPage";
import { TargetsPage } from "./objectives/TargetsPage";
import { MasterDataPage } from "./directory/MasterDataPage";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

async function loadCapabilities(): Promise<UserCapabilities> {
  const response = await fetch(`${apiUrl}/api/me/capabilities`, {
    headers: {
      "x-mochelab-demo-profile": import.meta.env.VITE_DEMO_PROFILE ?? "USUARIO",
    },
  });

  if (!response.ok) throw new Error("No se pudieron cargar los accesos");
  return UserCapabilitiesSchema.parse(await response.json());
}

export function App() {
  if (window.location.pathname === "/personas") return <PeoplePage />;
  if (window.location.pathname === "/equipos") return <TeamsPage />;
  if (window.location.pathname === "/roles") return <AcademyPage view="roles" />;
  if (window.location.pathname === "/cursos/catalogo") return <AcademyPage view="courses" />;
  if (window.location.pathname === "/cursos") return <CourseProgressPage />;
  if (window.location.pathname === "/cursos/avance") return <CourseProgressPage />;
  if (window.location.pathname === "/objetivos") return <ObjectivesPage />;
  if (window.location.pathname === "/portafolio") return <InitiativesPage />;
  if (window.location.pathname === "/configuracion/usuarios") return <PermissionsPage />;
  if (window.location.pathname === "/configuracion/catalogos") return <CatalogsPage />;
  if (window.location.pathname === "/configuracion/cuentas") return <UsersPage />;
  if (window.location.pathname === "/configuracion/auditoria") return <AuditPage />;
  if (window.location.pathname === "/objetivos/metas") return <TargetsPage />;
  if (window.location.pathname === "/configuracion/maestros") return <MasterDataPage />;
  if (window.location.pathname === "/madurez/periodos") {
    return <MaturityPeriodsPage />;
  }

  if (window.location.pathname === "/madurez/configuracion") {
    return <MaturityConfigurationPage />;
  }

  if (window.location.pathname === "/madurez/calibraciones") {
    return <CalibrationQueuePage />;
  }

  if (window.location.pathname === "/madurez/calibracion") {
    return <CalibrationPage />;
  }

  if (window.location.pathname === "/madurez") {
    return <SelfAssessmentPage />;
  }

  const [capabilities, setCapabilities] = useState<UserCapabilities>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    void loadCapabilities().then(setCapabilities).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Error inesperado");
    });
  }, []);

  const visibleModules = capabilities?.modules.filter((module) => module.canView) ?? [];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.24em] text-emerald-400">
          Plataforma de gestión
        </p>
        <h1 className="max-w-3xl text-5xl font-bold tracking-tight sm:text-7xl">
          Mochelab <span className="text-emerald-400">2.0</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
          La nueva base para gestionar personas, equipos, madurez y objetivos con
          información consistente y catálogos configurables.
        </p>

        {capabilities && (
          <p className="mt-8 text-sm text-slate-400">
            Perfil de prueba: <span className="font-semibold text-slate-200">{capabilities.profile}</span>
          </p>
        )}

        <nav className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {visibleModules.map((module) => (
            <a
              key={module.name}
              href={module.code === "MADUREZ" && capabilities?.profile === "ADMINISTRADOR" ? "/madurez/calibraciones" : module.code === "USUARIOS" ? "/configuracion/cuentas" : module.route}
              className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl shadow-black/10"
            >
              <h2 className="text-lg font-semibold">{module.name}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {module.canCreate || module.canEdit ? "Consulta y mantenimiento" : "Solo consulta"}
              </p>
            </a>
          ))}
        </nav>

        {!capabilities && !error && <p className="mt-8 text-slate-400">Cargando accesos…</p>}
        {error && <p className="mt-8 text-rose-400">{error}</p>}

        <div className="mt-10 flex items-center gap-3 text-sm text-slate-400">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          Base técnica lista para continuar el desarrollo
        </div>
      </section>
    </main>
  );
}
