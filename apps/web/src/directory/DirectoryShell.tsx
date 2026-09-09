import type { ReactNode } from "react";
import { DEMO_EMAIL_KEY, DEMO_PROFILE_KEY, SESSION_TOKEN_KEY, type DemoProfile } from "../access/demoSession";

export function DirectoryShell({ title, description, active, children }: { title: string; description: string; active: "people" | "teams" | "assignments"; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <a href="/" className="text-lg font-bold tracking-tight">Mochelab <span className="text-emerald-600">2.0</span></a>
          <nav className="flex gap-2" aria-label="Directorio">
            <a href="/personas" className={`rounded-lg px-4 py-2 text-sm font-bold ${active === "people" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}>Personas</a>
            <a href="/equipos" className={`rounded-lg px-4 py-2 text-sm font-bold ${active === "teams" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}>Equipos</a>
            {(demoProfile==="ADMIN"||demoProfile==="SYSTEM")&&<a href="/configuracion/maestros" className="rounded-lg px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50">Administrar</a>}
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        <p className="text-sm font-semibold uppercase tracking-wider text-emerald-700">Directorio organizacional</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-3 text-base text-slate-600">{description}</p>
        {(active === "people" || active === "assignments") && <nav className="mt-7 flex gap-2 border-b border-slate-200" aria-label="Gestión de personas"><a href="/personas" className={`border-b-2 px-4 py-3 text-sm font-bold ${active === "people" ? "border-slate-950 text-slate-950" : "border-transparent text-slate-400 hover:text-slate-700"}`}>Directorio</a><a href="/asignaciones" className={`border-b-2 px-4 py-3 text-sm font-bold ${active === "assignments" ? "border-slate-950 text-slate-950" : "border-transparent text-slate-400 hover:text-slate-700"}`}>Asignaciones</a></nav>}
        {children}
      </div>
    </main>
  );
}

export const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
const storedProfile = sessionStorage.getItem(DEMO_PROFILE_KEY);
export const demoProfile: DemoProfile = storedProfile === "SYSTEM" ? "SYSTEM" : storedProfile === "ADMIN" ? "ADMIN" : storedProfile === "USUARIO" ? "USUARIO" : import.meta.env.VITE_DEMO_PROFILE === "SYSTEM" ? "SYSTEM" : import.meta.env.VITE_DEMO_PROFILE === "ADMIN" ? "ADMIN" : "USUARIO";
const sessionToken=sessionStorage.getItem(SESSION_TOKEN_KEY);
export const demoHeaders = { "x-mochelab-demo-profile":demoProfile, "x-mochelab-demo-user-email": sessionStorage.getItem(DEMO_EMAIL_KEY) ?? import.meta.env.VITE_DEMO_USER_EMAIL ?? (demoProfile==="SYSTEM"?"system.prueba@example.invalid":demoProfile==="ADMIN"?"admin.prueba@example.invalid":"usuario.prueba@example.invalid"),...(sessionToken?{Authorization:`Bearer ${sessionToken}`}:{}) };
