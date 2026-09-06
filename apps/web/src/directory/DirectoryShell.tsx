import type { ReactNode } from "react";

export function DirectoryShell({ title, description, active, children }: { title: string; description: string; active: "people" | "teams"; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <a href="/" className="text-lg font-bold tracking-tight">Mochelab <span className="text-emerald-600">2.0</span></a>
          <nav className="flex gap-2" aria-label="Directorio">
            <a href="/personas" className={`rounded-lg px-4 py-2 text-sm font-bold ${active === "people" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}>Personas</a>
            <a href="/equipos" className={`rounded-lg px-4 py-2 text-sm font-bold ${active === "teams" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}>Equipos</a>
            {demoProfile==="ADMINISTRADOR"&&<a href="/configuracion/maestros" className="rounded-lg px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50">Administrar</a>}
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        <p className="text-sm font-semibold uppercase tracking-wider text-emerald-700">Directorio organizacional</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-3 text-base text-slate-600">{description}</p>
        {children}
      </div>
    </main>
  );
}

export const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
export const demoProfile=import.meta.env.VITE_DEMO_PROFILE??"USUARIO";
export const demoHeaders = { "x-mochelab-demo-profile":demoProfile, "x-mochelab-demo-user-email": import.meta.env.VITE_DEMO_USER_EMAIL ?? (demoProfile==="ADMINISTRADOR"?"admin.prueba@example.invalid":"usuario.prueba@example.invalid") };
