import { useEffect, useMemo, useRef, useState } from "react";
import { apiUrl, demoHeaders, DirectoryShell } from "./DirectoryShell";
import { MultiSelect } from "../components/MultiSelect";
import { defaultRoleFilterIds } from "../utils/defaultRoleFilters";

type Team = { id: string; sourceId: string; program: string; unit: string | null; company: string | null; status: string; members: { name: string; role: string }[] };

export function TeamsPage() {
  const roleDefaultsInitialized=useRef(false);
  const [teams, setTeams] = useState<Team[]>([]); const [search, setSearch] = useState(""); const [roleIds,setRoleIds]=useState<string[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { const timer = window.setTimeout(() => { setLoading(true); setError(""); fetch(`${apiUrl}/api/teams?search=${encodeURIComponent(search)}`, { headers: demoHeaders }).then(async (response) => { if (!response.ok) throw new Error("No se pudieron cargar los equipos"); return response.json() as Promise<Team[]>; }).then(setTeams).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Error inesperado")).finally(() => setLoading(false)); }, 250); return () => window.clearTimeout(timer); }, [search]);
  const roleOptions=useMemo(()=>[...new Set(teams.flatMap(team=>team.members.map(member=>member.role)))].sort().map(role=>({id:role,label:role})),[teams]);
  useEffect(()=>{if(roleDefaultsInitialized.current||roleOptions.length===0)return;roleDefaultsInitialized.current=true;setRoleIds(defaultRoleFilterIds(roleOptions,item=>item.id,item=>item.label))},[roleOptions]);
  const filteredTeams=useMemo(()=>teams.map(team=>({...team,members:team.members.filter(member=>roleIds.length===0||roleIds.includes(member.role)).sort((a,b)=>a.role.localeCompare(b.role,"es")||a.name.localeCompare(b.name,"es"))})).filter(team=>roleIds.length===0||team.members.length>0),[teams,roleIds]);
  return <DirectoryShell title="Equipos" description="Consulta equipos, programas y las personas que desempeñan cada rol." active="teams">
    <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-3 border-b border-slate-200 p-5 md:grid-cols-2"><div className="flex items-center"><strong>{loading ? "Consultando…" : `${filteredTeams.length} equipo${filteredTeams.length === 1 ? "" : "s"}`}</strong></div><label><span className="sr-only">Buscar equipos</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar equipo, programa o unidad" className="control" /></label><div className="md:col-span-2"><MultiSelect label="Roles" emptyLabel="Todos los roles" value={roleIds} onChange={setRoleIds} options={roleOptions}/></div></div>
      {error && <p className="p-6 font-semibold text-rose-700">{error}</p>}{!error && !loading && filteredTeams.length === 0 && <p className="p-10 text-center text-slate-500">No se encontraron equipos para los roles seleccionados.</p>}
      <div className="grid gap-5 p-5 md:grid-cols-2">{filteredTeams.map((team) => <article key={team.id} className="rounded-2xl border border-slate-200 p-5"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold">{team.sourceId}</h2><p className="mt-1 text-sm font-semibold text-emerald-700">{team.program}</p></div><span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">{team.status}</span></div><p className="mt-4 text-sm text-slate-500">{team.company ?? "Sin empresa"} · {team.unit ?? "Sin unidad"}</p><div className="mt-5 border-t border-slate-200 pt-4"><p className="text-sm font-bold">Integrantes ({team.members.length})</p>{team.members.length ? team.members.map((member) => <div key={`${member.name}-${member.role}`} className="mt-3 flex justify-between gap-4 text-sm"><span>{member.name}</span><span className="font-semibold text-slate-500">{member.role}</span></div>) : <p className="mt-3 text-sm text-slate-500">Sin integrantes asignados</p>}</div></article>)}</div>
    </section>
  </DirectoryShell>;
}
