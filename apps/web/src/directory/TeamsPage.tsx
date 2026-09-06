import { useEffect, useState } from "react";
import { apiUrl, demoHeaders, DirectoryShell } from "./DirectoryShell";

type Team = { id: string; sourceId: string; program: string; unit: string | null; company: string | null; status: string; members: { name: string; role: string }[] };

export function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]); const [search, setSearch] = useState(""); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { const timer = window.setTimeout(() => { setLoading(true); setError(""); fetch(`${apiUrl}/api/teams?search=${encodeURIComponent(search)}`, { headers: demoHeaders }).then(async (response) => { if (!response.ok) throw new Error("No se pudieron cargar los equipos"); return response.json() as Promise<Team[]>; }).then(setTeams).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Error inesperado")).finally(() => setLoading(false)); }, 250); return () => window.clearTimeout(timer); }, [search]);
  return <DirectoryShell title="Equipos" description="Consulta equipos, programas y las personas que desempeñan cada rol." active="teams">
    <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between"><strong>{loading ? "Consultando…" : `${teams.length} equipo${teams.length === 1 ? "" : "s"}`}</strong><label className="block sm:w-96"><span className="sr-only">Buscar equipos</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar equipo, programa o unidad" className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600" /></label></div>
      {error && <p className="p-6 font-semibold text-rose-700">{error}</p>}{!error && !loading && teams.length === 0 && <p className="p-10 text-center text-slate-500">No se encontraron equipos.</p>}
      <div className="grid gap-5 p-5 md:grid-cols-2">{teams.map((team) => <article key={team.id} className="rounded-2xl border border-slate-200 p-5"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold">{team.sourceId}</h2><p className="mt-1 text-sm font-semibold text-emerald-700">{team.program}</p></div><span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">{team.status}</span></div><p className="mt-4 text-sm text-slate-500">{team.company ?? "Sin empresa"} · {team.unit ?? "Sin unidad"}</p><div className="mt-5 border-t border-slate-200 pt-4"><p className="text-sm font-bold">Integrantes ({team.members.length})</p>{team.members.length ? team.members.map((member) => <div key={`${member.name}-${member.role}`} className="mt-3 flex justify-between gap-4 text-sm"><span>{member.name}</span><span className="font-semibold text-slate-500">{member.role}</span></div>) : <p className="mt-3 text-sm text-slate-500">Sin integrantes asignados</p>}</div></article>)}</div>
    </section>
  </DirectoryShell>;
}
