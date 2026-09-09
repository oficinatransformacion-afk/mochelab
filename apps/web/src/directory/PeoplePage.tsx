import { useEffect, useMemo, useState } from "react";
import { apiUrl, demoHeaders, DirectoryShell } from "./DirectoryShell";
import { MultiSelect } from "../components/MultiSelect";

type Assignment = { id:string;role:string;team:string;program:string;status:string;statusId:string;onboardingStatus:string;onboardingStatusId:string;startDate:string|null;endDate:string|null };
type Person = { id: string; dni: string; names: string; email: string | null; company: string; organizationalUnit: string | null; status: string; assignments: Assignment[] };

export function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [page,setPage]=useState(1);const pageSize=20;
  const [search, setSearch] = useState("");
  const [companyFilter,setCompanyFilter]=useState<string[]>([]);
  const [unitFilter,setUnitFilter]=useState<string[]>([]);
  const [statusFilter,setStatusFilter]=useState<string[]>(["ACTIVO"]);
  const [assignmentFilter,setAssignmentFilter]=useState<string[]>(["CON_ROL"]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true); setError("");
      fetch(`${apiUrl}/api/people?search=${encodeURIComponent(search)}`, { headers: demoHeaders })
        .then(async (response) => { if (!response.ok) throw new Error("No se pudieron cargar las personas"); return response.json() as Promise<Person[]>; })
        .then(data=>{setPeople(data);setPage(1)}).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Error inesperado"))
        .finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const filteredPeople=useMemo(()=>people.filter(person=>(companyFilter.length===0||companyFilter.includes(person.company))&&(unitFilter.length===0||(person.organizationalUnit!==null&&unitFilter.includes(person.organizationalUnit)))&&(statusFilter.length===0||statusFilter.includes(person.status))&&(assignmentFilter.length===0||(assignmentFilter.includes("CON_ROL")&&person.assignments.length>0)||(assignmentFilter.includes("SIN_ROL")&&person.assignments.length===0))),[people,companyFilter,unitFilter,statusFilter,assignmentFilter]);
  const companies=useMemo(()=>[...new Set(people.map(x=>x.company))].sort(),[people]);
  const units=useMemo(()=>[...new Set(people.map(x=>x.organizationalUnit).filter((x):x is string=>Boolean(x)))].sort(),[people]);
  const statuses=useMemo(()=>[...new Set(people.map(x=>x.status))].sort(),[people]);
  const pages=Math.max(1,Math.ceil(filteredPeople.length/pageSize));const visiblePeople=useMemo(()=>filteredPeople.slice((page-1)*pageSize,page*pageSize),[filteredPeople,page]);
  useEffect(()=>setPage(1),[companyFilter,unitFilter,statusFilter,assignmentFilter]);

  return <DirectoryShell title="Personas" description="Consulta colaboradores por DNI y empresa, junto con sus roles y equipos." active="people">
    <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
        <strong>{loading ? "Consultando…" : `${filteredPeople.length} de ${people.length} personas`}</strong>
        <label className="block sm:w-96"><span className="sr-only">Buscar personas</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, DNI o empresa" className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600" /></label>
      </div>
      <div className="grid gap-3 border-b border-slate-200 bg-slate-50 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <MultiSelect label="Empresas" emptyLabel="Todas las empresas" value={companyFilter} onChange={setCompanyFilter} options={companies.map(value=>({id:value,label:value}))}/>
        <MultiSelect label="Unidades" emptyLabel="Todas las unidades" value={unitFilter} onChange={setUnitFilter} options={units.map(value=>({id:value,label:value}))}/>
        <MultiSelect label="Estados" emptyLabel="Todos los estados" value={statusFilter} onChange={setStatusFilter} options={statuses.map(value=>({id:value,label:value}))}/>
        <MultiSelect label="Asignación" emptyLabel="Con y sin rol" value={assignmentFilter} onChange={setAssignmentFilter} options={[{id:"CON_ROL",label:"Con rol asignado"},{id:"SIN_ROL",label:"Sin rol asignado"}]}/>
      </div>
      {error && <p className="p-6 font-semibold text-rose-700">{error}</p>}
      {!error && !loading && filteredPeople.length === 0 && <p className="p-10 text-center text-slate-500">No se encontraron personas para los filtros seleccionados.</p>}
      <div className="divide-y divide-slate-200">
        {visiblePeople.map((person) => <article key={person.id} className="grid gap-4 p-5 2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] 2xl:items-center">
          <div><h2 className="font-bold">{person.names}</h2><p className="mt-1 text-sm text-slate-500">DNI {person.dni} · {person.email ?? "Sin correo"}</p></div>
          <div><p className="text-sm font-semibold">{person.company}</p><p className="mt-1 text-sm text-slate-500">{person.organizationalUnit ?? "Sin unidad"}</p></div>
          <div>{person.assignments.length ? person.assignments.map((assignment) => <div key={assignment.id} className="mb-2 flex flex-wrap items-center gap-2 text-sm"><span><strong>{assignment.role}</strong><span className="text-slate-500"> · {assignment.team} · {assignment.status}</span></span></div>) : <p className="text-sm text-slate-500">Sin rol asignado</p>}</div>
          <div className="flex items-center gap-2"><span className="w-fit rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">{person.status}</span><a href={`/personas/${person.id}`} className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-bold hover:bg-slate-100">Perfil 360</a></div>
        </article>)}
      </div>
    </section>
    <div className="mt-4 flex justify-end gap-3"><button disabled={page===1} onClick={()=>setPage(page-1)} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40">Anterior</button><span className="py-2 text-sm font-bold">Página {page} de {pages}</span><button disabled={page===pages} onClick={()=>setPage(page+1)} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40">Siguiente</button></div>
  </DirectoryShell>;
}
