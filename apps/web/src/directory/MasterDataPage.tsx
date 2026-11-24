import { useEffect, useMemo, useState, type ReactNode } from "react";
import { apiUrl, demoHeaders } from "./DirectoryShell";

type O = { id: string; code: string; name: string };
type Unit = O & {
  companyId: string;
  unitType?: string;
  parentId?: string | null;
};
type Options = {
  companies: O[];
  units: Unit[];
  programs: O[];
  businessPartners: O[];
  catalogs: Record<string, O[]>;
};
type Person = {
  id: string;
  dni: string;
  names: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  company: string;
  companyId: string;
  occupationLevelId: string | null;
  occupationLevel: string | null;
  organizationalUnitId: string | null;
  managementId: string | null;
  subManagementId: string | null;
  divisionId: string | null;
  businessPartnerValueId: string | null;
  status: string;
  statusId: string;
};
type Team = {
  id: string;
  sourceId: string;
  name: string;
  strategicType: "NEGOCIO" | "PROGRAMA";
  focusAreaId: string | null;
  status: string;
  statusId: string;
};
type Role = {
  id: string;
  sourceId: string;
  name: string;
  type: string;
  typeId: string;
  status: string;
  statusId: string;
  peopleCount: number;
};
type Course = {
  id: string;
  sourceId: string;
  name: string;
  module: string;
  moduleId: string;
  status: string;
  statusId: string;
  roles: { id: string; name: string }[];
};
type Kind = "personas" | "equipos" | "roles" | "cursos";
const blanks = {
  personas: {
    dni: "",
    names: "",
    email: "",
    phone: "",
    position: "",
    companyId: "",
    occupationLevelId: "",
    managementId: "",
    divisionId: "",
    businessPartnerValueId: "",
    statusId: "",
  },
  equipos: { sourceId: "", strategicType: "PROGRAMA", focusAreaId: "", name: "", statusId: "" },
  roles: { sourceId: "", name: "", typeId: "", statusId: "" },
  cursos: { sourceId: "", name: "", moduleId: "", statusId: "" },
};

export function MasterDataPage() {
  const [kind, setKind] = useState<Kind>("personas"),
    [options, setOptions] = useState<Options | null>(null),
    [people, setPeople] = useState<Person[]>([]),
    [teams, setTeams] = useState<Team[]>([]),
    [roles, setRoles] = useState<Role[]>([]),
    [courses, setCourses] = useState<Course[]>([]),
    [form, setForm] = useState<Record<string, string>>(blanks.personas),
    [editing, setEditing] = useState<string | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [peoplePage, setPeoplePage] = useState(1),
    [peoplePageSize, setPeoplePageSize] = useState(50),
    [peopleTotal, setPeopleTotal] = useState(0),
    [peoplePages, setPeoplePages] = useState(1),
    [peopleReload, setPeopleReload] = useState(0),
    [companyFilter, setCompanyFilter] = useState(""),
    [statusFilter, setStatusFilter] = useState("ACTIVO"),
    [occupationScope, setOccupationScope] = useState("NON_OPERATOR"),
    [managementFilter, setManagementFilter] = useState(""),
    [divisionFilter, setDivisionFilter] = useState(""),
    [assignmentFilter, setAssignmentFilter] = useState("");
  async function load() {
    setBusy(true);
    const responses = await Promise.all([
      fetch(apiUrl + "/api/directory-admin/options", { headers: demoHeaders }),
      fetch(apiUrl + "/api/teams", { headers: demoHeaders }),
      fetch(apiUrl + "/api/academy/roles", { headers: demoHeaders }),
      fetch(apiUrl + "/api/academy/courses", { headers: demoHeaders }),
    ]);
    if (responses.some((x) => !x.ok)) {
      setMessage(
        "No se pudieron cargar los maestros. Verifica el perfil administrador.",
      );
      setBusy(false);
      return;
    }
    setOptions(await responses[0].json());
    setTeams(await responses[1].json());
    setRoles(await responses[2].json());
    setCourses(await responses[3].json());
    setBusy(false);
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (kind !== "personas") return;
    const timer = window.setTimeout(async () => {
      setBusy(true);
      const params = new URLSearchParams({
        page: String(peoplePage),
        pageSize: String(peoplePageSize),
        search: query,
        occupationScope,
      });
      if (companyFilter) params.set("companyIds", companyFilter);
      if (statusFilter) params.set("statuses", statusFilter);
      if (managementFilter) params.set("managements", managementFilter);
      if (divisionFilter) params.set("divisions", divisionFilter);
      if (assignmentFilter) params.set("assignment", assignmentFilter);
      try {
        const response = await fetch(`${apiUrl}/api/people?${params}`, { headers: demoHeaders });
        if (!response.ok) throw new Error("No se pudo consultar el maestro de personas");
        const data = await response.json() as {items:Person[];total:number;pages:number};
        setPeople(data.items);
        setPeopleTotal(data.total);
        setPeoplePages(data.pages);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "No se pudo consultar el maestro de personas");
      } finally {
        setBusy(false);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [kind, query, peoplePage, peoplePageSize, peopleReload, companyFilter, statusFilter, occupationScope, managementFilter, divisionFilter, assignmentFilter]);
  useEffect(() => setPeoplePage(1), [query, peoplePageSize, companyFilter, statusFilter, occupationScope, managementFilter, divisionFilter, assignmentFilter]);
  function start(next: Kind) {
    setKind(next);
    setEditing(null);
    setMessage("");
    const base = { ...blanks[next] };
    const catalog =
      next === "personas"
        ? "ESTADO_PERSONA"
        : next === "equipos"
          ? "ESTADO_EQUIPO"
          : next === "roles"
            ? "ESTADO_ROL"
            : "ESTADO_CURSO";
    base.statusId =
      options?.catalogs[catalog]?.find((x) => x.code === "ACTIVO")?.id || "";
    setForm(base);
  }
  function edit(row: Person | Team | Role | Course) {
    setEditing(row.id);
    if (kind === "personas") {
      const x = row as Person;
      setForm({
        dni: x.dni,
        names: x.names,
        email: x.email || "",
        phone: x.phone || "",
        position: x.position || "",
        companyId: x.companyId,
        occupationLevelId: x.occupationLevelId || "",
        managementId: x.managementId || "",
        divisionId: x.divisionId || "",
        businessPartnerValueId: x.businessPartnerValueId || "",
        statusId: x.statusId,
      });
    } else if (kind === "equipos") {
      const x = row as Team;
      setForm({
        sourceId: x.sourceId,
        name: x.name,
        strategicType: x.strategicType,
        focusAreaId: x.focusAreaId || "",
        statusId: x.statusId,
      });
    } else if (kind === "roles") {
      const x = row as Role;
      setForm({
        sourceId: x.sourceId,
        name: x.name,
        typeId: x.typeId,
        statusId: x.statusId,
      });
    } else {
      const x = row as Course;
      setForm({
        sourceId: x.sourceId,
        name: x.name,
        moduleId: x.moduleId,
        statusId: x.statusId,
      });
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const set = (key: string, value: string) =>
    setForm((x) => ({ ...x, [key]: value }));
  async function save() {
    setBusy(true);
    setMessage("");
    const path =
      kind === "personas"
        ? "people"
        : kind === "equipos"
          ? "teams"
          : kind === "roles"
            ? "roles"
            : "academy/courses";
    const response = await fetch(
      `${apiUrl}/api/${path}${editing ? `/${editing}` : ""}`,
      {
        method: editing ? "PATCH" : "POST",
        headers: { ...demoHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(form),
      },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(
        typeof body.message === "string" ? body.message : "No se pudo guardar",
      );
      setBusy(false);
      return;
    }
    setMessage(editing ? "Registro actualizado." : "Registro creado.");
    setEditing(null);
    await load();
    if (kind === "personas") { setPeoplePage(1); setPeopleReload(value=>value+1); }
  }
  const rows = (
    kind === "personas"
      ? people
      : kind === "equipos"
        ? teams
        : kind === "roles"
          ? roles
          : courses
  ).filter((row) => kind === "personas" || JSON.stringify(row).toLowerCase().includes(query.toLowerCase()));
  const optional = [
    "email",
    "phone",
    "position",
    "occupationLevelId",
    "organizationalUnitId",
    "businessPartnerId",
  ];
  const valid = Object.entries(form).every(
    ([key, value]) => Boolean(value) || optional.includes(key),
  );
  const companyUnits = useMemo(
    () =>
      options?.units.filter(
        (x) => !form.companyId || x.companyId === form.companyId,
      ) ?? [],
    [options, form.companyId],
  );
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl justify-between px-5 py-4">
          <a href="/" className="font-bold">
            Mochelab <span className="text-red-700">2.0</span>
          </a>
          <b>Administrador</b>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-8">
        <p className="text-sm font-bold uppercase tracking-wider text-red-700">
          Configuración
        </p>
        <h1 className="mt-2 text-3xl font-bold">Maestros organizacionales</h1>
        <div className="mt-6 flex flex-wrap gap-2">
          {(["personas", "equipos", "roles", "cursos"] as Kind[]).map((x) => (
            <button
              key={x}
              onClick={() => start(x)}
              className={`rounded-full px-4 py-2 font-bold capitalize ${kind === x ? "bg-slate-950 text-white" : "border bg-white text-slate-600"}`}
            >
              {x}
            </button>
          ))}
        </div>
        {options && (
          <section className="mt-6 rounded-2xl border bg-white p-6 shadow-sm">
            <div className="flex justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-red-700">
                  {editing ? "Edición" : "Nuevo registro"}
                </p>
                <h2 className="mt-1 text-xl font-bold">{kind.slice(0, -1)}</h2>
              </div>
              <button
                onClick={() => start(kind)}
                className="brand-link text-sm font-bold"
              >
                Limpiar
              </button>
            </div>
            {kind === "personas" && (
              <div className="mt-5 space-y-6">
                <FormGroup title="Identificación">
                  <Field
                    label="DNI"
                    value={form.dni}
                    onChange={(v) => set("dni", v)}
                  />
                  <Field
                    label="Nombres completos"
                    value={form.names}
                    onChange={(v) => set("names", v)}
                  />
                  <Select
                    label="Empresa"
                    value={form.companyId}
                    options={options.companies}
                    onChange={(v) => {
                      set("companyId", v);
                      set("organizationalUnitId", "");
                    }}
                  />
                  <Field
                    label="Correo"
                    value={form.email}
                    type="email"
                    optional
                    onChange={(v) => set("email", v)}
                  />
                  <Field
                    label="Teléfono"
                    value={form.phone}
                    optional
                    onChange={(v) => set("phone", v)}
                  />
                </FormGroup>
                <FormGroup title="Información laboral">
                  <Field
                    label="Posición / puesto"
                    value={form.position}
                    optional
                    onChange={(v) => set("position", v)}
                  />
                  <Select
                    label="Nivel ocupacional"
                    value={form.occupationLevelId}
                    options={options.catalogs.NIVEL_OCUPACIONAL || []}
                    optional
                    onChange={(v) => set("occupationLevelId", v)}
                  />
                  <Select label="Gerencia" value={form.managementId} options={options.catalogs.GERENCIA || []} optional onChange={(v) => set("managementId", v)} />
                  <Select label="División" value={form.divisionId} options={options.catalogs.DIVISION || []} optional onChange={(v) => set("divisionId", v)} />
                  <Select
                    label="Business partner"
                    value={form.businessPartnerValueId}
                    options={options.businessPartners}
                    optional
                    onChange={(v) => set("businessPartnerValueId", v)}
                  />
                  <Select
                    label="Estado"
                    value={form.statusId}
                    options={options.catalogs.ESTADO_PERSONA || []}
                    onChange={(v) => set("statusId", v)}
                  />
                </FormGroup>
              </div>
            )}
            {kind === "equipos" && (
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field
                  label="Código"
                  value={form.sourceId}
                  onChange={(v) => set("sourceId", v)}
                />
                <Select
                  label="Tipo de equipo"
                  value={form.strategicType}
                  options={[{id:"NEGOCIO",code:"NEGOCIO",name:"Negocio"},{id:"PROGRAMA",code:"PROGRAMA",name:"Programa"}]}
                  onChange={(v) => set("strategicType", v)}
                />
                <Select
                  label="Área de enfoque"
                  value={form.focusAreaId}
                  options={options.catalogs.AREA_ENFOQUE || []}
                  onChange={(v) => set("focusAreaId", v)}
                />
                <Field
                  label="Nombre"
                  value={form.name}
                  onChange={(v) => set("name", v)}
                />
                <Select
                  label="Estado"
                  value={form.statusId}
                  options={options.catalogs.ESTADO_EQUIPO || []}
                  onChange={(v) => set("statusId", v)}
                />
              </div>
            )}
            {kind === "roles" && (
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field
                  label="Código"
                  value={form.sourceId}
                  onChange={(v) => set("sourceId", v)}
                />
                <Field
                  label="Nombre"
                  value={form.name}
                  onChange={(v) => set("name", v)}
                />
                <Select
                  label="Tipo"
                  value={form.typeId}
                  options={options.catalogs.TIPO_ROL || []}
                  onChange={(v) => set("typeId", v)}
                />
                <Select
                  label="Estado"
                  value={form.statusId}
                  options={options.catalogs.ESTADO_ROL || []}
                  onChange={(v) => set("statusId", v)}
                />
              </div>
            )}
            {kind === "cursos" && (
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field
                  label="Código"
                  value={form.sourceId}
                  onChange={(v) => set("sourceId", v)}
                />
                <Field
                  label="Nombre"
                  value={form.name}
                  onChange={(v) => set("name", v)}
                />
                <Select
                  label="Módulo"
                  value={form.moduleId}
                  options={options.catalogs.MODULO_CURSO || []}
                  onChange={(v) => set("moduleId", v)}
                />
                <Select
                  label="Estado"
                  value={form.statusId}
                  options={options.catalogs.ESTADO_CURSO || []}
                  onChange={(v) => set("statusId", v)}
                />
              </div>
            )}
            <div className="mt-6 flex justify-end">
              <button
                disabled={busy || !valid}
                onClick={() => void save()}
                className="brand-action rounded-xl px-7 py-3 font-bold disabled:opacity-40"
              >
                {busy
                  ? "Guardando…"
                  : editing
                    ? "Guardar cambios"
                    : "Crear registro"}
              </button>
            </div>
          </section>
        )}
        {message && (
          <p className="mt-5 rounded-xl bg-amber-50 p-4 font-semibold text-amber-900">
            {message}
          </p>
        )}
        <section className="mt-6 overflow-hidden rounded-2xl border bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
            <b>{kind === "personas" ? (peopleTotal ? `${(peoplePage - 1) * peoplePageSize + 1}–${Math.min(peoplePage * peoplePageSize, peopleTotal)} de ${peopleTotal} personas` : "0 personas") : `${rows.length} registro(s)`}</b>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={kind === "personas" ? "Buscar por nombre, DNI, correo o puesto" : "Buscar en el maestro"}
              className="w-full rounded-xl border px-4 py-2.5 sm:w-[28rem]"
            />
          </div>
          {kind === "personas" && options && <div className="grid gap-3 border-b bg-slate-50 p-5 sm:grid-cols-2 xl:grid-cols-6">
            <FilterSelect label="Empresa" value={companyFilter} onChange={setCompanyFilter} empty="Todas las empresas" options={options.companies}/>
            <FilterSelect label="Estado" value={statusFilter} onChange={setStatusFilter} empty="Todos los estados" options={options.catalogs.ESTADO_PERSONA || []} useCode/>
            <label className="text-sm font-bold">Nivel ocupacional<select value={occupationScope} onChange={event=>setOccupationScope(event.target.value)} className="mt-2 w-full rounded-xl border bg-white px-3 py-2.5 font-normal"><option value="NON_OPERATOR">No operarios</option><option value="OPERATOR">Solo operarios</option><option value="ALL">Todos</option></select></label>
            <FilterSelect label="Gerencia" value={managementFilter} onChange={setManagementFilter} empty="Todas" options={options.catalogs.GERENCIA || []}/>
            <FilterSelect label="División" value={divisionFilter} onChange={setDivisionFilter} empty="Todas" options={options.catalogs.DIVISION || []}/>
            <label className="text-sm font-bold">Asignación<select value={assignmentFilter} onChange={event=>setAssignmentFilter(event.target.value)} className="mt-2 w-full rounded-xl border bg-white px-3 py-2.5 font-normal"><option value="">Con y sin rol</option><option value="CON_ROL">Con rol asignado</option><option value="SIN_ROL">Sin rol asignado</option></select></label>
            <div className="flex items-center justify-between gap-4 sm:col-span-2 xl:col-span-6">
              <p className="text-xs text-slate-500">La búsqueda consulta toda la base de datos.</p>
              <button type="button" onClick={()=>{setQuery("");setCompanyFilter("");setStatusFilter("ACTIVO");setOccupationScope("NON_OPERATOR");setManagementFilter("");setDivisionFilter("");setAssignmentFilter("")}} className="text-sm font-bold text-red-700">Limpiar filtros</button>
            </div>
          </div>}
          <div className={`hidden bg-slate-50 px-5 py-3 text-sm font-bold text-slate-500 sm:grid ${kind === "personas" ? "grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,.8fr)_minmax(0,.6fr)_auto]" : "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"}`}>
            <span>{kind === "personas" ? "Persona" : "Registro"}</span>
            {kind === "personas" && <span>Empresa</span>}
            {kind === "personas" && <span>Nivel ocupacional</span>}
            <span>{kind === "personas" ? "Estado" : "Estado / detalle"}</span>
            <span>Acción</span>
          </div>
          {rows.map((row) => (
            <div
              key={row.id}
              className={`grid grid-cols-1 gap-2 border-t px-5 py-4 sm:items-center ${kind === "personas" ? "sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,.8fr)_minmax(0,.6fr)_auto]" : "sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"}`}
            >
              <div>
                <b>{"names" in row ? row.names : row.name}</b>
                <p className="text-sm text-slate-500">
                  {"dni" in row ? `DNI ${row.dni}${row.email ? ` · ${row.email}` : ""}` : row.sourceId}
                </p>
              </div>
              {"dni" in row && <span>{row.company}</span>}
              {"dni" in row && <span>{row.occupationLevel || "Sin nivel"}</span>}
              <span>
                {row.status}
                {"peopleCount" in row
                  ? ` · ${row.peopleCount} persona(s)`
                  : "program" in row
                    ? ` · ${row.program}`
                    : "module" in row
                      ? ` · ${row.module}`
                      : ""}
              </span>
              <button
                onClick={() => edit(row)}
                className="rounded-lg border px-3 py-2 text-sm font-bold"
              >
                Editar
              </button>
            </div>
          ))}
          {kind === "personas" && <div className="flex flex-wrap items-center justify-between gap-3 border-t p-5">
            <select value={peoplePageSize} onChange={event=>setPeoplePageSize(Number(event.target.value))} className="rounded-xl border bg-white px-3 py-2 text-sm"><option value={25}>25 por página</option><option value={50}>50 por página</option><option value={100}>100 por página</option></select>
            <div className="flex items-center gap-3"><button disabled={peoplePage===1||busy} onClick={()=>setPeoplePage(value=>value-1)} className="rounded-lg border px-3 py-2 text-sm font-bold disabled:opacity-40">Anterior</button><span className="text-sm font-bold">Página {peoplePage} de {peoplePages}</span><button disabled={peoplePage===peoplePages||busy} onClick={()=>setPeoplePage(value=>value+1)} className="rounded-lg border px-3 py-2 text-sm font-bold disabled:opacity-40">Siguiente</button></div>
          </div>}
        </section>
      </div>
    </main>
  );
}

function FilterSelect({label,value,onChange,empty,options,useCode=false}:{label:string;value:string;onChange:(value:string)=>void;empty:string;options:O[];useCode?:boolean}){
  return <label className="text-sm font-bold">{label}<select value={value} onChange={event=>onChange(event.target.value)} className="mt-2 w-full rounded-xl border bg-white px-3 py-2.5 font-normal"><option value="">{empty}</option>{options.map(option=><option key={option.id} value={useCode?option.code:option.id}>{option.name}</option>)}</select></label>;
}

function FormGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-extrabold uppercase tracking-wide text-slate-500">
        {title}
      </legend>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  );
}
function Field({
  label,
  value,
  onChange,
  optional = false,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
  type?: string;
}) {
  return (
    <label className="text-sm font-bold">
      {label}
      {optional && (
        <span className="ml-1 font-normal text-slate-400">(opcional)</span>
      )}
      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border px-4 py-3 text-base font-normal"
      />
    </label>
  );
}
function Select({
  label,
  value,
  options,
  onChange,
  optional = false,
}: {
  label: string;
  value: string;
  options: O[];
  onChange: (value: string) => void;
  optional?: boolean;
}) {
  return (
    <label className="text-sm font-bold">
      {label}
      {optional && (
        <span className="ml-1 font-normal text-slate-400">(opcional)</span>
      )}
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border bg-white px-4 py-3 text-base font-normal"
      >
        <option value="">{optional ? "Sin asignar" : "Selecciona"}</option>
        {options.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
    </label>
  );
}
