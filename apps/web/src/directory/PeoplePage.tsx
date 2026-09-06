import { useEffect, useState } from "react";
import { apiUrl, demoHeaders, demoProfile, DirectoryShell } from "./DirectoryShell";

type Assignment = { id:string;role:string;team:string;program:string;status:string;statusId:string;onboardingStatus:string;onboardingStatusId:string;startDate:string|null;endDate:string|null };
type Person = { id: string; dni: string; names: string; email: string | null; company: string; organizationalUnit: string | null; status: string; assignments: Assignment[] };
type Option={id:string;label:string;code?:string};
type Options = { people: Option[]; roles: Option[]; teams: Option[];assignmentStatuses:Option[];onboardingStatuses:Option[] };

export function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [options, setOptions] = useState<Options>({ people: [], roles: [], teams: [],assignmentStatuses:[],onboardingStatuses:[] });
  const [personId, setPersonId] = useState(""); const [roleId, setRoleId] = useState(""); const [teamId, setTeamId] = useState(""); const [notice, setNotice] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true); setError("");
      fetch(`${apiUrl}/api/people?search=${encodeURIComponent(search)}`, { headers: demoHeaders })
        .then(async (response) => { if (!response.ok) throw new Error("No se pudieron cargar las personas"); return response.json() as Promise<Person[]>; })
        .then(setPeople).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Error inesperado"))
        .finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => { if(demoProfile!=="ADMINISTRADOR")return;fetch(`${apiUrl}/api/assignment-options`, { headers: demoHeaders }).then((response) => response.json() as Promise<Options>).then(setOptions).catch(() => setError("No se pudieron cargar las opciones de asignación")); }, []);
  async function assign() { setNotice(""); const response = await fetch(`${apiUrl}/api/person-role-assignments`, { method: "POST", headers: { ...demoHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ personId, roleId, teamId }) }); if (!response.ok) { const body = await response.json().catch(() => ({})); setNotice(response.status === 409 ? "La persona ya tiene ese rol en el equipo." : body.message ?? "No se pudo guardar la asignación."); return; } const result = await response.json() as { generatedCourses: number }; setNotice(`Asignación guardada. Se generaron ${result.generatedCourses} curso(s) pendientes.`); setRoleId(""); setTeamId(""); setSearch((value) => `${value} `); }
  async function changeAssignment(item:Assignment,close:boolean){if(close&&!window.confirm("¿Cerrar esta asignación desde hoy? La persona dejará de tener este rol activo."))return;const status=options.assignmentStatuses.find(option=>close?option.code!=="ACTIVO":option.code==="ACTIVO");if(!status){setNotice("Falta configurar el estado correspondiente en el catálogo ESTADO_ASIGNACION.");return}const response=await fetch(`${apiUrl}/api/person-role-assignments/${item.id}`,{method:"PATCH",headers:{...demoHeaders,"Content-Type":"application/json"},body:JSON.stringify({statusId:status.id,onboardingStatusId:item.onboardingStatusId,startDate:item.startDate,endDate:close?new Date().toISOString().slice(0,10):null})});const body=await response.json().catch(()=>({}));if(!response.ok){setNotice(body.message??"No se pudo actualizar la asignación.");return}setNotice(close?"Asignación cerrada correctamente.":"Asignación reactivada correctamente.");setSearch(value=>`${value} `)}

  return <DirectoryShell title="Personas" description="Consulta colaboradores por DNI y empresa, junto con sus roles y equipos." active="people">
    {demoProfile==="ADMINISTRADOR"&&<section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Asignar persona a un rol y equipo</h2><p className="mt-1 text-sm text-slate-500">Al guardar se crearán automáticamente sus cursos requeridos en estado pendiente.</p><div className="mt-4 grid gap-3 lg:grid-cols-[1.3fr_1fr_1fr_auto]"><select aria-label="Persona" value={personId} onChange={(event) => setPersonId(event.target.value)} className="rounded-xl border border-slate-300 px-4 py-3 text-base"><option value="">Selecciona una persona</option>{options.people.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><select aria-label="Rol" value={roleId} onChange={(event) => setRoleId(event.target.value)} className="rounded-xl border border-slate-300 px-4 py-3 text-base"><option value="">Selecciona un rol</option>{options.roles.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><select aria-label="Equipo" value={teamId} onChange={(event) => setTeamId(event.target.value)} className="rounded-xl border border-slate-300 px-4 py-3 text-base"><option value="">Selecciona un equipo</option>{options.teams.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><button type="button" disabled={!personId || !roleId || !teamId} onClick={() => void assign()} className="rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white disabled:bg-slate-300">Guardar</button></div>{notice && <p className={`mt-4 rounded-xl p-3 text-sm font-semibold ${notice.startsWith("Asignación guardada") ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{notice}</p>}</section>}
    <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
        <strong>{loading ? "Consultando…" : `${people.length} persona${people.length === 1 ? "" : "s"}`}</strong>
        <label className="block sm:w-96"><span className="sr-only">Buscar personas</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, DNI o empresa" className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600" /></label>
      </div>
      {error && <p className="p-6 font-semibold text-rose-700">{error}</p>}
      {!error && !loading && people.length === 0 && <p className="p-10 text-center text-slate-500">No se encontraron personas.</p>}
      <div className="divide-y divide-slate-200">
        {people.map((person) => <article key={person.id} className="grid gap-4 p-5 lg:grid-cols-[1.4fr_1fr_1.2fr_auto] lg:items-center">
          <div><h2 className="font-bold">{person.names}</h2><p className="mt-1 text-sm text-slate-500">DNI {person.dni} · {person.email ?? "Sin correo"}</p></div>
          <div><p className="text-sm font-semibold">{person.company}</p><p className="mt-1 text-sm text-slate-500">{person.organizationalUnit ?? "Sin unidad"}</p></div>
          <div>{person.assignments.length ? person.assignments.map((assignment) => <div key={assignment.id} className="mb-2 flex flex-wrap items-center gap-2 text-sm"><span><strong>{assignment.role}</strong><span className="text-slate-500"> · {assignment.team} · {assignment.status}</span></span>{demoProfile==="ADMINISTRADOR"&&<button type="button" onClick={()=>void changeAssignment(assignment,assignment.statusId===options.assignmentStatuses.find(x=>x.code==="ACTIVO")?.id)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-bold hover:bg-slate-100">{assignment.statusId===options.assignmentStatuses.find(x=>x.code==="ACTIVO")?.id?"Cerrar":"Reactivar"}</button>}</div>) : <p className="text-sm text-slate-500">Sin rol asignado</p>}</div>
          <span className="w-fit rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">{person.status}</span>
        </article>)}
      </div>
    </section>
  </DirectoryShell>;
}
