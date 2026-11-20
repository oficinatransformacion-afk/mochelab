import { Download, FileSpreadsheet } from "lucide-react";
import { useEffect, useState } from "react";
import { MultiSelect } from "../components/MultiSelect";
import { apiUrl, demoHeaders, DirectoryShell } from "./DirectoryShell";

type Option = { id: string; label: string; code?: string };
type ReportOptions = {
  companies: string[];
  personStatuses: string[];
  managements: Option[];
  divisions: Option[];
  roles: Option[];
  teams: Option[];
  assignmentStatuses: Option[];
};
type ReportJob = {
  id: string;
  status: "QUEUED" | "PROCESSING" | "READY" | "FAILED";
  progress: number;
  filename: string | null;
  error: string | null;
  downloadUrl: string | null;
};

const emptyOptions: ReportOptions = { companies: [], personStatuses: [], managements: [], divisions: [], roles: [], teams: [], assignmentStatuses: [] };

export function PeopleReportsPage() {
  const [options, setOptions] = useState<ReportOptions>(emptyOptions);
  const [companyNames, setCompanyNames] = useState<string[]>([]);
  const [personStatusNames, setPersonStatusNames] = useState<string[]>([]);
  const [managementIds, setManagementIds] = useState<string[]>([]);
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [assignmentStatusIds, setAssignmentStatusIds] = useState<string[]>([]);
  const [cutoffDate, setCutoffDate] = useState("");
  const [includeContact, setIncludeContact] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [job, setJob] = useState<ReportJob | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`${apiUrl}/api/people-reports/options`, { headers: demoHeaders })
      .then(async response => { if (!response.ok) throw new Error("No se pudieron cargar los filtros del reporte."); return response.json() as Promise<ReportOptions>; })
      .then(setOptions)
      .catch(error => setMessage(error instanceof Error ? error.message : "Error inesperado"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!job || !["QUEUED", "PROCESSING"].includes(job.status)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`${apiUrl}/api/people-reports/jobs/${job.id}`, { headers: demoHeaders, signal: controller.signal });
        const body = await response.json().catch(() => ({})) as ReportJob & { message?: string };
        if (!response.ok) throw new Error(body.message ?? "No se pudo consultar el avance del reporte.");
        setJob(body);
        if (body.status === "READY") setMessage("El reporte está listo para descargar.");
        if (body.status === "FAILED") setMessage(body.error ?? "No se pudo generar el reporte.");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setJob(null);
        setMessage(error instanceof Error ? error.message : "No se pudo consultar el avance del reporte.");
      }
    }, 1500);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [job]);

  async function exportReport() {
    setExporting(true); setMessage("");
    try {
      const response = await fetch(`${apiUrl}/api/people-reports/jobs`, {
        method: "POST",
        headers: { ...demoHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ companyNames, personStatusNames, managementIds, divisionIds, roleIds, teamIds, assignmentStatusIds, cutoffDate: cutoffDate || undefined, includeContact }),
      });
      const body = await response.json().catch(() => ({})) as ReportJob & { message?: string };
      if (!response.ok) throw new Error(body.message ?? "No se pudo iniciar la generación del reporte.");
      setJob(body);
      setMessage("El reporte se está generando en segundo plano. Puedes mantener esta pantalla abierta.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado");
    } finally { setExporting(false); }
  }

  async function downloadReport() {
    if (!job?.downloadUrl) return;
    setExporting(true); setMessage("");
    try {
      const response = await fetch(`${apiUrl}${job.downloadUrl}`, { headers: demoHeaders });
      if (!response.ok) { const body = await response.json().catch(() => ({})) as { message?: string }; throw new Error(body.message ?? "No se pudo descargar el reporte."); }
      const blob = await response.blob();
      const match = response.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/i);
      const anchor = document.createElement("a");
      anchor.href = URL.createObjectURL(blob);
      anchor.download = match?.[1] ?? job.filename ?? `participacion_resumen_${new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" })}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(anchor.href);
      setJob(null);
      setMessage("Reporte exportado correctamente.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado");
    } finally { setExporting(false); }
  }

  return <DirectoryShell title="Personas" description="Consulta colaboradores, asignaciones y participación en transformación." active="reports">
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3"><span className="rounded-xl bg-red-50 p-2.5 text-[#d71920]"><FileSpreadsheet size={24}/></span><h2 className="text-2xl font-extrabold tracking-tight">Reporte de participación en transformación</h2></div>
          <p className="mt-3 max-w-3xl text-slate-600">Exporta la base completa de empleados, sus roles y los indicadores de participación. Los resultados respetan el alcance de equipos autorizado para tu usuario.</p>
        </div>
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <MultiSelect label="Empresa" emptyLabel="Todas las empresas" value={companyNames} onChange={setCompanyNames} options={options.companies.map(value => ({ id: value, label: value }))}/>
        <MultiSelect label="Estado del empleado" emptyLabel="Todos los estados" value={personStatusNames} onChange={setPersonStatusNames} options={options.personStatuses.map(value => ({ id: value, label: value }))}/>
        <MultiSelect label="Gerencia" emptyLabel="Todas las gerencias" value={managementIds} onChange={setManagementIds} options={options.managements}/>
        <MultiSelect label="División" emptyLabel="Todas las divisiones" value={divisionIds} onChange={setDivisionIds} options={options.divisions}/>
        <MultiSelect label="Rol" emptyLabel="Todos los roles" value={roleIds} onChange={setRoleIds} options={options.roles}/>
        <MultiSelect label="Equipo" emptyLabel="Todos los equipos" value={teamIds} onChange={setTeamIds} options={options.teams}/>
        <MultiSelect label="Estado de asignación" emptyLabel="Todos los estados" value={assignmentStatusIds} onChange={setAssignmentStatusIds} options={options.assignmentStatuses}/>
        <label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">Fecha de corte <span className="font-normal text-slate-400">(opcional)</span></span><input type="date" value={cutoffDate} onChange={event => setCutoffDate(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 outline-none focus:border-[#d71920] focus:ring-2 focus:ring-red-100"/><small className="mt-2 block text-slate-500">Déjala vacía para exportar todo el histórico.</small></label>
        <label className="flex min-h-12 items-center gap-3 self-start rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 md:mt-7"><input type="checkbox" checked={includeContact} onChange={event => setIncludeContact(event.target.checked)} className="h-5 w-5 accent-[#d71920]"/><span><strong className="block text-sm">Incluir correo y teléfono</strong><small className="text-slate-500">Agrega datos de contacto al archivo.</small></span></label>
      </div>

      <div className="mt-8 rounded-2xl bg-slate-50 p-5">
        <p className="font-extrabold text-slate-700">El archivo incluirá</p>
        <div className="mt-3 flex flex-wrap gap-2">{["Resumen", "Base de empleados", "Detalle persona–rol", "Participación organizacional", "Metodología"].map(item => <span key={item} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">{item}</span>)}</div>
        {job && ["QUEUED", "PROCESSING"].includes(job.status) && <div className="mt-5 border-t border-slate-200 pt-5"><div className="mb-2 flex items-center justify-between text-sm font-bold text-slate-700"><span>{job.status === "QUEUED" ? "Reporte en cola" : "Generando el Excel"}</span><span>{job.progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-[#e31b23] transition-all" style={{ width: `${job.progress}%` }}/></div></div>}
        <div className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-slate-500">Con todos los filtros en “Todos” y la fecha vacía se exporta el histórico completo permitido.</p><button type="button" disabled={loading || exporting || Boolean(job && ["QUEUED", "PROCESSING"].includes(job.status))} onClick={() => void (job?.status === "READY" ? downloadReport() : exportReport())} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#e31b23] px-6 py-3 font-extrabold text-white shadow-sm transition hover:bg-[#c9141b] disabled:cursor-not-allowed disabled:bg-slate-300"><Download size={19}/>{exporting ? "Procesando…" : job?.status === "READY" ? "Descargar Excel" : job?.status === "FAILED" ? "Reintentar exportación" : job ? "Generando…" : "Exportar Excel"}</button></div>
      </div>
      {message && <p className={`mt-5 rounded-xl p-4 font-semibold ${message.includes("correctamente") || message.includes("listo") ? "bg-emerald-50 text-emerald-800" : message.includes("generando") ? "bg-blue-50 text-blue-800" : "bg-rose-50 text-rose-800"}`}>{message}</p>}
    </section>
  </DirectoryShell>;
}
