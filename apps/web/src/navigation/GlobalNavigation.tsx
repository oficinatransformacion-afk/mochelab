import { useEffect, useState, type ComponentType } from "react";
import {
  Award, BarChart3, BriefcaseBusiness, Building2, CalendarRange,
  Database, FileCog, Gauge, GraduationCap, Home, ListChecks,
  KeyRound, LogOut, Mail, Map, Network, PanelLeftClose, PanelLeftOpen, Settings2, ShieldCheck, Target, Users, UsersRound,
} from "lucide-react";
import { demoHeaders } from "../directory/DirectoryShell";
import { endDemoSession } from "../access/demoSession";
import { useCapabilities } from "../access/CapabilitiesContext";

type Icon = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
type Profile = "USUARIO" | "ADMIN" | "SYSTEM";
type Link = { label: string; href: string; icon: Icon; module: string; profiles?: Profile[] };
const groups: { label: string; links: Link[]; profiles?: Profile[] }[] = [
  { label: "Principal", links: [
    { label: "Inicio", href: "/", icon: Home, module: "INICIO" }, { label: "Personas", href: "/personas", icon: Users, module: "PERSONAS" },
    { label: "Equipos", href: "/equipos", icon: UsersRound, module: "EQUIPOS" },
  ] },
  { label: "Academia", links: [
    { label: "Rutas de aprendizaje", href: "/rutas", icon: GraduationCap, module: "CURSOS" },
  ] },
  { label: "Madurez", links: [
    { label: "Autoevaluación", href: "/madurez", icon: ListChecks, module: "MADUREZ" }, { label: "Calibraciones", href: "/madurez/calibraciones", icon: Award, module: "MADUREZ", profiles: ["ADMIN","SYSTEM"] }, { label: "Madurez", href: "/madurez/equipos", icon: Gauge, module: "MADUREZ" },
  ] },
  { label: "Estrategia", links: [
    { label: "Objetivos y KR", href: "/objetivos", icon: Target, module: "OBJETIVOS" }, { label: "Portafolio", href: "/portafolio", icon: BriefcaseBusiness, module: "PORTAFOLIO" }, { label: "Metas", href: "/objetivos/metas", icon: BarChart3, module: "METAS" },
  ] },
  { label: "Administración", profiles: ["ADMIN","SYSTEM"], links: [
    { label: "Maestros", href: "/configuracion/maestros", icon: Database, module: "CATALOGOS" }, { label: "Mallas por rol", href: "/configuracion/mallas", icon: Map, module: "CURSOS" }, { label: "Catálogos", href: "/configuracion/catalogos", icon: Settings2, module: "CATALOGOS" },
    { label: "Permisos por perfil", href: "/configuracion/usuarios", icon: ShieldCheck, module: "USUARIOS" }, { label: "Cuentas y equipos", href: "/configuracion/cuentas", icon: Building2, module: "USUARIOS" }, { label: "Comunicaciones", href: "/configuracion/comunicaciones", icon: Mail, module: "USUARIOS" },
    { label: "Auditoría", href: "/configuracion/auditoria", icon: FileCog, module: "AUDITORIA" }, { label: "Calidad de datos", href: "/calidad-datos", icon: Network, module: "AUDITORIA" }, { label: "Procesos", href: "/configuracion/jobs", icon: CalendarRange, module: "MIGRACIONES" },
  ] },
];

function isActive(path: string) {
  if (path === "/") return location.pathname === "/";
  if (path === "/personas") return location.pathname === "/personas" || location.pathname === "/asignaciones" || /^\/personas\/[^/]+$/.test(location.pathname);
  return location.pathname === path;
}

export function GlobalNavigation() {
  const activeGroup = groups.find(group => group.links.some(link => isActive(link.href)))?.label;
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("mochelab.sidebar.collapsed") === "true");
  const {access,status,error,reload}=useCapabilities();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => Object.fromEntries(groups.map(group => [group.label, group.label === activeGroup || group.label === "Principal"])));
  const accountEmail = String(demoHeaders["x-mochelab-demo-user-email"] || "");
  useEffect(() => {
    document.documentElement.classList.toggle("app-sidebar-collapsed", collapsed);
    localStorage.setItem("mochelab.sidebar.collapsed", String(collapsed));
    return () => document.documentElement.classList.remove("app-sidebar-collapsed");
  }, [collapsed]);
  const visible = (module: string) => access?.modules.some(item => item.code === module && item.canView) ?? false;
  const toggle = (label: string) => setExpanded(value => ({ ...value, [label]: !value[label] }));
  const logout = () => { endDemoSession(); window.location.replace("/login"); };
  return <>
    <button onClick={() => setOpen(true)} className="app-menu-trigger" aria-label="Abrir menú principal">Menú</button>
    {open && <button className="app-nav-backdrop" aria-label="Cerrar menú" onClick={() => setOpen(false)} />}
    <aside className={`app-sidebar ${open ? "is-open" : ""} ${collapsed ? "is-collapsed" : ""}`} aria-label="Navegación principal">
      <div className="app-brand"><div className="app-brand-mark">M</div><div className="app-brand-copy"><strong>Mochelab</strong><span>Gestión 2.0</span></div><button type="button" className="app-sidebar-collapse" onClick={() => setCollapsed(value => !value)} aria-label={collapsed ? "Expandir menú" : "Colapsar menú"} title={collapsed ? "Expandir menú" : "Colapsar menú"}>{collapsed ? <PanelLeftOpen size={19}/> : <PanelLeftClose size={19}/>}</button><button type="button" className="app-sidebar-mobile-close" onClick={() => setOpen(false)} aria-label="Cerrar menú">×</button></div>
      <nav className="app-nav-scroll">
        {status==="loading"&&<p className="px-3 py-4 text-sm text-slate-400">Cargando opciones…</p>}
        {status==="error"&&<div className="rounded-lg bg-red-950/60 px-3 py-3 text-sm text-red-200"><p>{error}</p><button type="button" onClick={reload} className="mt-2 font-bold underline">Reintentar</button></div>}
        {groups.map(group => {
          const groupAllowed = !group.profiles || Boolean(access&&group.profiles.includes(access.profile));
          const links = groupAllowed ? group.links.filter(link => visible(link.module)&&(!link.profiles||Boolean(access&&link.profiles.includes(access.profile)))) : [];
          const sectionOpen = collapsed || (expanded[group.label] ?? false);
          return links.length ? <section key={group.label} className="app-nav-group">
            <button type="button" className="app-nav-heading" aria-expanded={sectionOpen} aria-controls={`nav-${group.label}`} onClick={() => toggle(group.label)}><span>{group.label}</span><span className={`app-nav-chevron ${sectionOpen ? "open" : ""}`}>⌄</span></button>
            <div id={`nav-${group.label}`} className={`app-nav-links ${sectionOpen ? "open" : ""}`}>{links.map(link => {
              const Icon = link.icon;
              return <a key={link.href} href={link.href} className={isActive(link.href) ? "active" : ""} title={collapsed ? link.label : undefined} aria-label={link.label}><span className="app-nav-icon" aria-hidden="true"><Icon size={16} strokeWidth={2.1} /></span><span className="app-nav-label">{link.label}</span></a>;
            })}</div>
          </section> : null;
        })}
      </nav>
      <div className="app-profile"><div className="app-sidebar-account"><span className="app-account-avatar" aria-hidden="true">{accountEmail.charAt(0).toUpperCase() || "U"}</span><div className="app-profile-copy min-w-0"><span>{access?.profile === "SYSTEM" ? "System" : access?.profile === "ADMIN" ? "Admin" : "Usuario"}</span><small title={accountEmail}>{accountEmail || "Permisos aplicados"}</small></div></div><div className="app-account-actions"><a href="/cuenta/contrasena" className="app-account-action" title={collapsed ? "Cambiar contraseña" : undefined} aria-label="Cambiar contraseña"><KeyRound size={16}/><span className="app-account-label">Cambiar contraseña</span></a><button type="button" className="app-account-action app-account-action-danger" onClick={logout} title={collapsed ? "Cerrar sesión" : undefined} aria-label="Cerrar sesión"><LogOut size={16}/><span className="app-account-label">Cerrar sesión</span></button></div></div>
    </aside>
  </>;
}
