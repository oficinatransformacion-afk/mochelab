import { lazy, Suspense } from "react";
const SelfAssessmentPage = lazy(() => import("./maturity/SelfAssessmentPage").then(module => ({ default: module.SelfAssessmentPage })));
const AssistedAssessmentPage = lazy(() => import("./maturity/AssistedAssessmentPage").then(module => ({ default: module.AssistedAssessmentPage })));
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
import { useCapabilities } from "./access/CapabilitiesContext";
import { isAdministratorPath,moduleForPath } from "./access/routeAccess";

function StatePage({title,detail,action}:{title:string;detail:string;action?:()=>void}){return <main className="grid min-h-screen place-items-center bg-slate-50 px-5"><section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><h1 className="text-2xl font-bold text-slate-950">{title}</h1><p className="mt-3 text-slate-600">{detail}</p><div className="mt-6 flex justify-center gap-3">{action&&<button type="button" onClick={action} className="rounded-xl bg-slate-950 px-4 py-2 font-bold text-white">Reintentar</button>}<a href="/" className="rounded-xl border border-slate-300 px-4 py-2 font-bold text-slate-700">Ir al inicio</a></div></section></main>}

function AppContent() {
  const{access,status,error,reload}=useCapabilities();
  if (window.location.pathname === "/login") return <LoginPage />;
  if (!hasDemoSession()) {
    window.location.replace("/login");
    return null;
  }
  if(status==="loading"||status==="idle")return <StatePage title="Preparando tu espacio" detail="Estamos consultando tus permisos y módulos disponibles."/>;
  if(status==="error")return <StatePage title="No pudimos cargar tus accesos" detail={error} action={reload}/>;
  const administrator=access?.profile==="ADMIN"||access?.profile==="SYSTEM";
  if(access?.profile==="COLABORADOR"&&window.location.pathname==="/"&&access.personId){window.location.replace(`/personas/${access.personId}`);return null}
  const administratorRoute=isAdministratorPath(window.location.pathname);
  if(!administrator&&administratorRoute)return <StatePage title="Acceso restringido" detail="Tu perfil no tiene autorización para ingresar a esta sección."/>;
  const requiredModule=moduleForPath(window.location.pathname);
  if(requiredModule&&!access?.modules.some(item=>item.code===requiredModule&&item.canView))return <StatePage title="Acceso restringido" detail="No tienes permiso para consultar este módulo."/>;
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

  if(window.location.pathname==="/madurez/asistida")return <AssistedAssessmentPage/>;

  if (window.location.pathname === "/madurez/calibracion") {
    return <CalibrationPage />;
  }

  if (window.location.pathname === "/madurez") {
    return <SelfAssessmentPage />;
  }

  if(window.location.pathname==="/")return <DashboardPage/>;
  return <StatePage title="Página no encontrada" detail="La dirección solicitada no existe o fue trasladada."/>;
}
export function App() {
  return <Suspense fallback={<main className="min-h-screen bg-slate-50 p-8 text-slate-600">Cargando módulo…</main>}><AppContent /></Suspense>;
}
