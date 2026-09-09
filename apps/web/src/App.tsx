import { lazy, Suspense } from "react";
import {
  UserCapabilitiesSchema,
  type UserCapabilities,
} from "@mochelab/shared";
const SelfAssessmentPage = lazy(() => import("./maturity/SelfAssessmentPage").then(module => ({ default: module.SelfAssessmentPage })));
const CalibrationPage = lazy(() => import("./maturity/CalibrationPage").then(module => ({ default: module.CalibrationPage })));
const CalibrationQueuePage = lazy(() => import("./maturity/CalibrationQueuePage").then(module => ({ default: module.CalibrationQueuePage })));
const MaturityConfigurationPage = lazy(() => import("./maturity/MaturityConfigurationPage").then(module => ({ default: module.MaturityConfigurationPage })));
const MaturityPeriodsPage = lazy(() => import("./maturity/MaturityPeriodsPage").then(module => ({ default: module.MaturityPeriodsPage })));
const PeoplePage = lazy(() => import("./directory/PeoplePage").then(module => ({ default: module.PeoplePage })));
const TeamsPage = lazy(() => import("./directory/TeamsPage").then(module => ({ default: module.TeamsPage })));
const AcademyPage = lazy(() => import("./academy/AcademyPage").then(module => ({ default: module.AcademyPage })));
const ObjectivesPage = lazy(() => import("./objectives/ObjectivesPage").then(module => ({ default: module.ObjectivesPage })));
const InitiativesPage = lazy(() => import("./initiatives/InitiativesPage").then(module => ({ default: module.InitiativesPage })));
const PermissionsPage = lazy(() => import("./access/PermissionsPage").then(module => ({ default: module.PermissionsPage })));
const CatalogsPage = lazy(() => import("./catalogs/CatalogsPage").then(module => ({ default: module.CatalogsPage })));
const UsersPage = lazy(() => import("./access/UsersPage").then(module => ({ default: module.UsersPage })));
const AuditPage = lazy(() => import("./audit/AuditPage").then(module => ({ default: module.AuditPage })));
const TargetsPage = lazy(() => import("./objectives/TargetsPage").then(module => ({ default: module.TargetsPage })));
const MasterDataPage = lazy(() => import("./directory/MasterDataPage").then(module => ({ default: module.MasterDataPage })));
const AssignmentsPage = lazy(() => import("./directory/AssignmentsPage").then(module => ({ default: module.AssignmentsPage })));
const PersonProfilePage = lazy(() => import("./directory/PersonProfilePage").then(module => ({ default: module.PersonProfilePage })));
const LearningRoutesPage = lazy(() => import("./academy/LearningRoutesPage").then(module => ({ default: module.LearningRoutesPage })));
const TeamMaturityPage = lazy(() => import("./maturity/TeamMaturityPage").then(module => ({ default: module.TeamMaturityPage })));
const DashboardPage = lazy(() => import("./dashboard/DashboardPage").then(module => ({ default: module.DashboardPage })));
const JobsPage = lazy(() => import("./jobs/JobsPage").then(module => ({ default: module.JobsPage })));
const CommunicationTemplatesPage = lazy(() => import("./communications/CommunicationTemplatesPage").then(module => ({ default: module.CommunicationTemplatesPage })));
const CommunicationsPage = lazy(() => import("./communications/CommunicationsPage").then(module => ({ default: module.CommunicationsPage })));
const DataQualityPage = lazy(() => import("./dashboard/DataQualityPage").then(module => ({ default: module.DataQualityPage })));
const LoginPage = lazy(() => import("./access/LoginPage").then(module => ({ default: module.LoginPage })));
const ChangePasswordPage = lazy(() => import("./access/ChangePasswordPage").then(module => ({ default: module.ChangePasswordPage })));
import { hasDemoSession } from "./access/demoSession";
import { demoHeaders } from "./directory/DirectoryShell";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

async function loadCapabilities(): Promise<UserCapabilities> {
  const response = await fetch(`${apiUrl}/api/me/capabilities`, {
    headers: demoHeaders,
  });

  if (!response.ok) throw new Error("No se pudieron cargar los accesos");
  return UserCapabilitiesSchema.parse(await response.json());
}

function AppContent() {
  if (window.location.pathname === "/login") return <LoginPage />;
  if (!hasDemoSession()) {
    window.location.replace("/login");
    return null;
  }
  const profileMatch=window.location.pathname.match(/^\/personas\/([^/]+)$/);
  if(profileMatch)return <PersonProfilePage personId={profileMatch[1]} />;
  if (window.location.pathname === "/personas") return <PeoplePage />;
  if (window.location.pathname === "/cuenta/contrasena") return <ChangePasswordPage />;
  if (window.location.pathname === "/asignaciones") return <AssignmentsPage />;
  if (window.location.pathname === "/equipos") return <TeamsPage />;
  if (window.location.pathname === "/roles") return <AcademyPage view="roles" />;
  if (window.location.pathname === "/configuracion/mallas") return <AcademyPage view="mallas" />;
  if (window.location.pathname === "/cursos/catalogo") return <AcademyPage view="courses" />;
  if (window.location.pathname === "/cursos" || window.location.pathname === "/cursos/avance") {
    window.location.replace("/rutas");
    return null;
  }
  if (window.location.pathname === "/rutas") return <LearningRoutesPage />;
  if (window.location.pathname === "/objetivos") return <ObjectivesPage />;
  if (window.location.pathname === "/portafolio") return <InitiativesPage />;
  if (window.location.pathname === "/configuracion/usuarios") return <PermissionsPage />;
  if (window.location.pathname === "/configuracion/catalogos") return <CatalogsPage />;
  if (window.location.pathname === "/configuracion/cuentas") return <UsersPage />;
  if (window.location.pathname === "/configuracion/auditoria") return <AuditPage />;
  if (window.location.pathname === "/objetivos/metas") return <TargetsPage />;
  if (window.location.pathname === "/configuracion/maestros") return <MasterDataPage />;
  if (window.location.pathname === "/configuracion/comunicaciones") return <CommunicationTemplatesPage />;
  if (window.location.pathname === "/comunicaciones") return <CommunicationsPage />;
  if (window.location.pathname === "/calidad-datos") return <DataQualityPage />;
  if (window.location.pathname === "/configuracion/jobs" || window.location.pathname === "/configuracion/migraciones") return <JobsPage />;
  if (window.location.pathname === "/madurez/periodos") {
    return <MaturityPeriodsPage />;
  }

  if (window.location.pathname === "/madurez/configuracion") {
    return <MaturityConfigurationPage />;
  }
  if (window.location.pathname === "/madurez/equipos") return <TeamMaturityPage />;

  if (window.location.pathname === "/madurez/calibraciones") {
    return <CalibrationQueuePage />;
  }

  if (window.location.pathname === "/madurez/calibracion") {
    return <CalibrationPage />;
  }

  if (window.location.pathname === "/madurez") {
    return <SelfAssessmentPage />;
  }

  return <DashboardPage loadCapabilities={loadCapabilities}/>;
}
export function App() {
  return <Suspense fallback={<main className="min-h-screen bg-slate-50 p-8 text-slate-600">Cargando módulo…</main>}><AppContent /></Suspense>;
}
