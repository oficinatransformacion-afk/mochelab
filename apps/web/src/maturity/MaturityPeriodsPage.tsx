import { useCallback, useEffect, useState } from "react";
import { apiUrl, demoHeaders } from "../directory/DirectoryShell";
import { CalendarCheck, Mail } from "lucide-react";
import { ConfirmationDialog } from "../components/ConfirmationDialog";

type Status =
  | "PLANIFICADO"
  | "AUTOEVALUACION"
  | "CALIBRACION"
  | "CERRADO"
  | "CANCELADO";
type PeriodModel = {
  roleId: string;
  role: string;
  modelVersionId: string;
  model: string;
  version: string;
};
type Period = {
  id: string;
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  selfAssessmentOpensAt: string | null;
  selfAssessmentClosesAt: string | null;
  calibrationClosesAt: string | null;
  configurationVersion: string;
  status: { code: Status; name: string };
  models: PeriodModel[];
  _count: { selfAssessments: number; roleMaturities: number };
  summary: {
    eligibleRoles: number;
    submitted: number;
    pendingSubmission: number;
    calibrated: number;
    pendingCalibration: number;
  };
};
type Form = {
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  selfAssessmentOpensAt: string;
  selfAssessmentClosesAt: string;
  calibrationClosesAt: string;
};
type ModelOption = {
  roleId: string;
  roleSourceId: string;
  role: string;
  modelVersionId: string;
  version: string;
  model: string;
  sectionCount: number;
};
type PendingAction =
  | { kind: "advance"; period: Period; status: Status }
  | {
      kind: "communicate";
      period: Period;
      type: "OPENING" | "REMINDER";
      preview: { withEmail: number; withoutEmail: number };
    }
  | { kind: "reopen"; period: Period };
const empty: Form = {
  code: "",
  name: "",
  startDate: "",
  endDate: "",
  selfAssessmentOpensAt: "",
  selfAssessmentClosesAt: "",
  calibrationClosesAt: "",
};
const styles: Record<Status, string> = {
  PLANIFICADO: "bg-slate-100 text-slate-700",
  AUTOEVALUACION: "bg-sky-100 text-sky-800",
  CALIBRACION: "bg-amber-100 text-amber-800",
  CERRADO: "bg-emerald-100 text-emerald-800",
  CANCELADO: "bg-rose-100 text-rose-800",
};
const next: Partial<Record<Status, Status>> = {
  PLANIFICADO: "AUTOEVALUACION",
  AUTOEVALUACION: "CALIBRACION",
  CALIBRACION: "CERRADO",
};
const actions: Partial<Record<Status, string>> = {
  PLANIFICADO: "Abrir autoevaluación",
  AUTOEVALUACION: "Iniciar calibración",
  CALIBRACION: "Cerrar período",
};
const date = (value: string) =>
  new Date(value).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
const datetime = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("es-PE", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Sin configurar";
const fields: [keyof Form, string, string, string][] = [
  ["code", "Código", "2027-1", "text"],
  ["name", "Nombre", "Primer semestre 2027", "text"],
  ["startDate", "Fecha inicial", "", "date"],
  ["endDate", "Fecha final", "", "date"],
  ["selfAssessmentOpensAt", "Apertura de autoevaluación", "", "datetime-local"],
  ["selfAssessmentClosesAt", "Cierre de autoevaluación", "", "datetime-local"],
  ["calibrationClosesAt", "Cierre de calibración", "", "datetime-local"],
];

export function MaturityPeriodsPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [selectedModels, setSelectedModels] = useState<Record<string, boolean>>(
    {},
  );
  const [form, setForm] = useState<Form>(empty);
  const [show, setShow] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [confirmError, setConfirmError] = useState("");
  const [transitionChecks, setTransitionChecks] = useState<string[]>([]);
  const [reopenJustification, setReopenJustification] = useState("");
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [periodResponse, modelResponse] = await Promise.all([
        fetch(`${apiUrl}/api/maturity/admin/periods`, { headers: demoHeaders }),
        fetch(`${apiUrl}/api/maturity/admin/periods/model-options`, {
          headers: demoHeaders,
        }),
      ]);
      if (!periodResponse.ok || !modelResponse.ok)
        throw new Error("No se pudo cargar la configuración de períodos");
      setPeriods(await periodResponse.json());
      setModelOptions(await modelResponse.json());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const set = (field: keyof Form, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));
  async function create() {
    setBusy(true);
    setMessage("");
    const roleModels = Object.entries(selectedModels)
      .filter(([, selected]) => selected)
      .map(([modelVersionId]) => {
        const option=modelOptions.find((item)=>item.modelVersionId===modelVersionId)!;
        return { roleId:option.roleId, modelVersionId };
      });
    const versions = [
      ...new Set(
        roleModels
          .map(
            (item) =>
              modelOptions.find(
                (option) => option.modelVersionId === item.modelVersionId,
              )?.version,
          )
          .filter(Boolean),
      ),
    ];
    const r = await fetch(`${apiUrl}/api/maturity/admin/periods`, {
      method: "POST",
      headers: { ...demoHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        configurationVersion: versions.length === 1 ? versions[0] : "POR_ROL",
        roleModels,
      }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMessage(
        typeof body.message === "string"
          ? body.message
          : "No se pudo crear el período",
      );
      setBusy(false);
      return;
    }
    setMessage(
      "Período creado como Planificado. Los modelos quedaron congelados para este ciclo.",
    );
    setForm(empty);
    setSelectedModels({});
    setWizardStep(1);
    setShow(false);
    await load();
  }
  function requestAdvance(period: Period) {
    const status = next[period.status.code];
    if (status) {
      setConfirmError("");
      setTransitionChecks([]);
      setPending({ kind: "advance", period, status });
    }
  }
  async function advance(period: Period, status: Status) {
    setBusy(true);
    setMessage("");
    setConfirmError("");
    try {
      const r = await fetch(
        `${apiUrl}/api/maturity/admin/periods/${period.id}/status`,
        {
          method: "PATCH",
          headers: { ...demoHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setConfirmError(
          typeof body.message === "string"
            ? body.message
            : "No se pudo cambiar el estado",
        );
        return;
      }
      setMessage(`Período actualizado: ${body.status.name}.`);
      setPending(null);
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function requestCommunication(
    period: Period,
    type: "OPENING" | "REMINDER",
  ) {
    setBusy(true);
    setMessage("");
    setConfirmError("");
    try {
      const response = await fetch(
        `${apiUrl}/api/communications/maturity/${period.id}/preview?type=${type}`,
        { headers: demoHeaders },
      );
      const preview = await response.json();
      if (!response.ok)
        throw new Error(
          preview.message ?? "No se pudo preparar la comunicación",
        );
      setPending({ kind: "communicate", period, type, preview });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }
  async function communicate(period: Period, type: "OPENING" | "REMINDER") {
    setBusy(true);
    setConfirmError("");
    try {
      const response = await fetch(
        `${apiUrl}/api/communications/maturity/${period.id}`,
        {
          method: "POST",
          headers: { ...demoHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ type }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        setConfirmError(
          result.message ?? "No se pudo preparar la comunicación",
        );
        return;
      }
      setMessage(
        `${result.created} comunicación(es) generadas. ${result.skipped} ya existían.`,
      );
      setPending(null);
    } catch (error) {
      setConfirmError(
        error instanceof Error ? error.message : "Error inesperado",
      );
    } finally {
      setBusy(false);
    }
  }
  async function reopen(period: Period) {
    setBusy(true);
    setConfirmError("");
    try {
      const response = await fetch(
        `${apiUrl}/api/maturity/admin/periods/${period.id}/reopen-calibration`,
        {
          method: "PATCH",
          headers: { ...demoHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ justification: reopenJustification }),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setConfirmError(result.message ?? "No se pudo reabrir el período");
        return;
      }
      setMessage(`${period.name} fue reabierto en calibración.`);
      setPending(null);
      setReopenJustification("");
      await load();
    } finally {
      setBusy(false);
    }
  }
  const groupedModels = [
    ...new Map(
      modelOptions.map((option) => [
        option.roleId,
        {
          roleId: option.roleId,
          role: option.role,
          roleSourceId: option.roleSourceId,
          options: modelOptions.filter(
            (candidate) => candidate.roleId === option.roleId,
          ),
        },
      ]),
    ).values(),
  ];
  const stepOneValid = Boolean(
    form.code.trim() &&
      form.name.trim() &&
      form.startDate &&
      form.endDate &&
      form.endDate >= form.startDate,
  );
  const stepTwoValid = Boolean(
    form.selfAssessmentOpensAt &&
      form.selfAssessmentClosesAt &&
      form.calibrationClosesAt &&
      form.selfAssessmentClosesAt >= form.selfAssessmentOpensAt &&
      form.calibrationClosesAt >= form.selfAssessmentClosesAt,
  );
  const selectedModelOptions = Object.entries(selectedModels)
    .filter(([, selected]) => selected)
    .map(([id]) => modelOptions.find((option) => option.modelVersionId === id))
    .filter((option): option is ModelOption => Boolean(option));
  const valid = stepOneValid && stepTwoValid && selectedModelOptions.length > 0;
  const transitionChecklist =
    pending?.kind === "advance"
      ? pending.status === "AUTOEVALUACION"
        ? {
            automatic: [
              {
                label: "Hay al menos un modelo publicado asociado a un rol",
                ok: (pending.period.models?.length ?? 0) > 0,
              },
              {
                label: "Existe al menos una persona y rol elegible",
                ok: pending.period.summary.eligibleRoles > 0,
              },
              {
                label: "Las fechas de autoevaluación están configuradas",
                ok: Boolean(
                  pending.period.selfAssessmentOpensAt &&
                    pending.period.selfAssessmentClosesAt,
                ),
              },
            ],
            manual: [
              "Revisé los roles, versiones de modelo y población que participará",
              "Confirmo que esta configuración quedará congelada al abrir la autoevaluación",
            ],
          }
        : pending.status === "CALIBRACION"
          ? {
              automatic: [
                {
                  label: "Existe al menos una autoevaluación enviada",
                  ok: pending.period.summary.submitted > 0,
                },
                {
                  label: "No quedan autoevaluaciones pendientes",
                  ok: pending.period.summary.pendingSubmission === 0,
                },
              ],
              manual: [
                "Revisé los resultados enviados",
                "Confirmo que al iniciar calibración ya no se admitirán nuevas respuestas",
              ],
            }
          : {
              automatic: [
                {
                  label: "No existen calibraciones pendientes",
                  ok: pending.period.summary.pendingCalibration === 0,
                },
              ],
              manual: [
                "Revisé los resultados finales y confirmo el cierre del período",
              ],
            }
      : null;
  const transitionReady = Boolean(
    transitionChecklist &&
      transitionChecklist.automatic.every((item) => item.ok) &&
      transitionChecklist.manual.every((item) =>
        transitionChecks.includes(item),
      ),
  );
  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <a href="/" className="text-lg font-bold">
            Mochelab <span className="text-emerald-600">2.0</span>
          </a>
          <span className="rounded-full bg-slate-900 px-3 py-1 text-sm font-semibold text-white">
            Administrador
          </span>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
        <div className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-7 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-emerald-700">
              Configuración de madurez
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Períodos de evaluación
            </h1>
            <p className="mt-3 text-base text-slate-600">
              Administra el ciclo completo de autoevaluación y calibración.
            </p>
          </div>
          <button
            onClick={() => {
              setShow(true);
              setWizardStep(1);
              setMessage("");
            }}
            className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white"
          >
            Nuevo período
          </button>
        </div>
        {show && (
          <section className="mt-6 rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">Nuevo período</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Define el ciclo, sus fechas y la versión del modelo que usará
                  cada rol.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700">
                Paso {wizardStep} de 3
              </span>
            </div>
            <ol
              className="mt-5 grid grid-cols-3 gap-2"
              aria-label="Pasos para crear un período"
            >
              {["Datos generales", "Fechas del ciclo", "Roles y revisión"].map(
                (label, index) => {
                  const step = index + 1;
                  return (
                    <li
                      key={label}
                      className={`rounded-xl px-3 py-2 text-center text-xs font-bold sm:text-sm ${step === wizardStep ? "bg-slate-950 text-white" : step < wizardStep ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-400"}`}
                    >
                      {step}. {label}
                    </li>
                  );
                },
              )}
            </ol>
            {wizardStep === 1 && (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {fields.slice(0, 4).map(([field, label, placeholder, type]) => (
                  <label key={field} className="text-sm font-semibold">
                    {label}
                    <input
                      type={type}
                      min={field === "endDate" ? form.startDate : undefined}
                      value={form[field]}
                      onChange={(event) => set(field, event.target.value)}
                      placeholder={placeholder}
                      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-base font-normal outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600"
                    />
                  </label>
                ))}
                {form.startDate &&
                  form.endDate &&
                  form.endDate < form.startDate && (
                    <p className="sm:col-span-2 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-900">
                      La fecha final no puede ser anterior a la fecha inicial.
                    </p>
                  )}
              </div>
            )}
            {wizardStep === 2 && (
              <div className="mt-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  {fields.slice(4).map(([field, label, placeholder, type]) => (
                    <label key={field} className="text-sm font-semibold">
                      {label}
                      <input
                        type={type}
                        min={
                          field === "selfAssessmentClosesAt"
                            ? form.selfAssessmentOpensAt
                            : field === "calibrationClosesAt"
                              ? form.selfAssessmentClosesAt
                              : undefined
                        }
                        value={form[field]}
                        onChange={(event) => set(field, event.target.value)}
                        placeholder={placeholder}
                        className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-base font-normal outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600"
                      />
                    </label>
                  ))}
                </div>
                <p className="mt-4 rounded-xl bg-sky-50 p-3 text-sm text-sky-900">
                  La autoevaluación solo estará disponible dentro de su ventana.
                  Al iniciar calibración se bloquearán nuevas respuestas.
                </p>
              </div>
            )}
            {wizardStep === 3 && (
              <div className="mt-6">
                <h3 className="font-bold">Modelos publicados por rol</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Incluye solamente los roles que participarán en este período.
                </p>
                {groupedModels.length ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {groupedModels.map((group) => (
                      <label
                        key={group.roleId}
                        className="text-sm font-semibold"
                      >
                        {group.roleSourceId} · {group.role}
                        <div className="mt-2 space-y-2">
                          {group.options.map((option) => (
                            <label key={option.modelVersionId} className="flex cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 py-2 font-normal">
                              <input type="checkbox" checked={Boolean(selectedModels[option.modelVersionId])} onChange={(event)=>setSelectedModels(current=>({...current,[option.modelVersionId]:event.target.checked}))}/>
                              <span>{option.model} · {option.version} ({option.sectionCount} secciones)</span>
                            </label>
                          ))}
                        </div>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">
                    No existen modelos publicados. Publica al menos uno antes de
                    crear el período.
                  </p>
                )}
                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="font-bold">Revisión antes de crear</h3>
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-slate-500">Período</dt>
                      <dd className="font-bold">
                        {form.code} · {form.name}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Vigencia</dt>
                      <dd className="font-bold">
                        {form.startDate} – {form.endDate}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Autoevaluación</dt>
                      <dd className="font-bold">
                        {form.selfAssessmentOpensAt} –{" "}
                        {form.selfAssessmentClosesAt}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Cierre de calibración</dt>
                      <dd className="font-bold">{form.calibrationClosesAt}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 space-y-2">
                    {selectedModelOptions.map((option) => (
                      <div
                        key={option.modelVersionId}
                        className="flex flex-wrap justify-between gap-2 rounded-xl bg-white px-3 py-2 text-sm"
                      >
                        <strong>{option.role}</strong>
                        <span>
                          {option.model} · {option.version}
                        </span>
                      </div>
                    ))}
                    {!selectedModelOptions.length && (
                      <p className="text-sm font-semibold text-amber-900">
                        Selecciona al menos un rol y su versión publicada.
                      </p>
                    )}
                  </div>
                  <p className="mt-4 text-sm font-semibold text-slate-700">
                    El período se creará como Planificado. Las versiones
                    quedarán congeladas para este ciclo y no serán reemplazadas
                    por publicaciones futuras.
                  </p>
                </div>
              </div>
            )}
            <div className="mt-6 flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-5">
              <button
                onClick={() => {
                  setShow(false);
                  setWizardStep(1);
                }}
                className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600"
              >
                Cancelar
              </button>
              <div className="flex gap-2">
                {wizardStep > 1 && (
                  <button
                    onClick={() =>
                      setWizardStep((current) => (current - 1) as 1 | 2)
                    }
                    className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700"
                  >
                    Anterior
                  </button>
                )}
                {wizardStep < 3 ? (
                  <button
                    disabled={wizardStep === 1 ? !stepOneValid : !stepTwoValid}
                    onClick={() =>
                      setWizardStep((current) => (current + 1) as 2 | 3)
                    }
                    className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white disabled:bg-slate-300"
                  >
                    Continuar
                  </button>
                ) : (
                  <button
                    disabled={!valid || busy}
                    onClick={create}
                    className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white disabled:bg-slate-300"
                  >
                    Crear período planificado
                  </button>
                )}
              </div>
            </div>
          </section>
        )}
        {message && (
          <p
            role="status"
            className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900"
          >
            {message}
          </p>
        )}
        <div className="mt-7 space-y-4">
          {busy && !periods.length && (
            <p className="text-slate-600">Cargando períodos…</p>
          )}
          {periods.map((period) => (
            <article
              key={period.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
            >
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-xl font-bold">{period.name}</h2>
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-semibold ${styles[period.status.code]}`}
                    >
                      {period.status.name}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {period.code} · {date(period.startDate)} –{" "}
                    {date(period.endDate)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {next[period.status.code] && (
                    <button
                      disabled={busy}
                      onClick={() => requestAdvance(period)}
                      className="self-start rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                    >
                      {actions[period.status.code]}
                    </button>
                  )}
                  {period.status.code === "CERRADO" &&
                    period._count.roleMaturities >
                      period.summary.calibrated && (
                      <button
                        disabled={busy}
                        onClick={() => {
                          setConfirmError("");
                          setReopenJustification("");
                          setPending({ kind: "reopen", period });
                        }}
                        className="rounded-xl border border-amber-400 px-4 py-2.5 text-sm font-bold text-amber-800"
                      >
                        Reabrir calibración
                      </button>
                    )}
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-sky-50 p-4">
                  <p className="text-sm text-sky-700">Personas y roles</p>
                  <p className="mt-1 text-2xl font-bold">
                    {period.summary.submitted} / {period.summary.eligibleRoles}
                  </p>
                  <p className="text-sm text-sky-700">
                    {period.summary.pendingSubmission} pendiente(s)
                  </p>
                </div>
                <div className="rounded-xl bg-amber-50 p-4">
                  <p className="text-sm text-amber-700">Calibraciones</p>
                  <p className="mt-1 text-2xl font-bold">
                    {period.summary.calibrated} / {period._count.roleMaturities}
                  </p>
                  <p className="text-sm text-amber-700">
                    {period.summary.pendingCalibration} pendiente(s)
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-600">
                    Avance de autoevaluación
                  </p>
                  <p className="mt-1 text-2xl font-bold">
                    {period.summary.eligibleRoles
                      ? Math.round(
                          (period.summary.submitted /
                            period.summary.eligibleRoles) *
                            100,
                        )
                      : 0}
                    %
                  </p>
                  <div className="mt-2 h-2 rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{
                        width: `${period.summary.eligibleRoles ? Math.min((period.summary.submitted / period.summary.eligibleRoles) * 100, 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
              <dl className="mt-5 grid gap-4 border-t border-slate-200 pt-5 sm:grid-cols-4">
                <div>
                  <dt className="text-sm text-slate-500">Autoevaluación</dt>
                  <dd className="mt-1 font-semibold">
                    {datetime(period.selfAssessmentOpensAt)} –{" "}
                    {datetime(period.selfAssessmentClosesAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">
                    Cierre de calibración
                  </dt>
                  <dd className="mt-1 font-semibold">
                    {datetime(period.calibrationClosesAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Modelos congelados</dt>
                  <dd className="mt-1 space-y-1 font-semibold">
                    {period.models?.length
                      ? period.models.map((model) => (
                          <span key={model.roleId} className="block">
                            {model.role}: {model.model} · {model.version}
                          </span>
                        ))
                      : period.configurationVersion}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Actividad</dt>
                  <dd className="mt-1 font-semibold">
                    {period._count.selfAssessments} autoevaluación(es) ·{" "}
                    {period._count.roleMaturities} resultado(s)
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
        {periods
          .filter((period) => period.status.code === "AUTOEVALUACION")
          .map((period) => (
            <section
              key={`communications-${period.id}`}
              className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"
            >
              <h2 className="font-bold">Comunicaciones de {period.name}</h2>
              <p className="mt-1 text-sm text-slate-600">
                Solo incluye roles activos que tienen comportamientos
                observables configurados. Los recordatorios masivos de cursos se
                administran fuera de Mochelab.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  disabled={busy}
                  onClick={() => void requestCommunication(period, "OPENING")}
                  className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  Comunicar apertura
                </button>
                <button
                  disabled={busy || period.summary.pendingSubmission === 0}
                  onClick={() => void requestCommunication(period, "REMINDER")}
                  className="rounded-xl border border-amber-400 bg-white px-4 py-2.5 text-sm font-bold text-amber-800 disabled:opacity-50"
                >
                  Recordar pendientes ({period.summary.pendingSubmission})
                </button>
              </div>
            </section>
          ))}
        <div className="mt-7 flex gap-5 text-sm font-semibold">
          <a href="/madurez/configuracion" className="text-emerald-700">
            Configurar formulario
          </a>
          <a href="/madurez/calibraciones" className="text-slate-600">
            Ver calibraciones
          </a>
        </div>
      </div>
      {pending?.kind === "advance" && (
        <ConfirmationDialog
          title={actions[pending.period.status.code] ?? "Avanzar período"}
          description="Completa el checklist antes de cambiar la etapa."
          icon={<CalendarCheck size={20} />}
          confirmLabel={
            actions[pending.period.status.code] ?? "Confirmar cambio"
          }
          busy={busy}
          confirmDisabled={!transitionReady}
          error={confirmError}
          danger={pending.status === "CERRADO"}
          onClose={() => setPending(null)}
          onConfirm={() => void advance(pending.period, pending.status)}
        >
          <div className="rounded-xl bg-slate-50 p-4">
            <strong>{pending.period.name}</strong>
            <span className="mt-1 block text-sm text-slate-500">
              {pending.period.status.name} → {pending.status}
            </span>
          </div>
          {pending.status === "AUTOEVALUACION" && (
            <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3">
              <p className="text-sm font-bold text-sky-900">
                Configuración que quedará congelada
              </p>
              <div className="mt-2 space-y-1 text-sm text-sky-950">
                {pending.period.models.map((model) => (
                  <p key={model.roleId}>
                    <strong>{model.role}:</strong> {model.model} ·{" "}
                    {model.version}
                  </p>
                ))}
              </div>
              <p className="mt-2 text-xs text-sky-800">
                Población elegible: {pending.period.summary.eligibleRoles}{" "}
                persona(s) y rol(es).
              </p>
            </div>
          )}
          <div className="mt-4 space-y-3">
            <p className="text-sm font-bold text-slate-700">
              Validaciones automáticas
            </p>
            {transitionChecklist?.automatic.map((item) => (
              <div
                key={item.label}
                className={`flex items-start gap-3 rounded-xl p-3 text-sm font-semibold ${item.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}
              >
                <span aria-hidden="true">{item.ok ? "✓" : "!"}</span>
                <span>{item.label}</span>
              </div>
            ))}
            <p className="pt-2 text-sm font-bold text-slate-700">
              Confirmación del administrador
            </p>
            {transitionChecklist?.manual.map((item) => (
              <label
                key={item}
                className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={transitionChecks.includes(item)}
                  onChange={(event) =>
                    setTransitionChecks((current) =>
                      event.target.checked
                        ? [...current, item]
                        : current.filter((value) => value !== item),
                    )
                  }
                  className="mt-0.5"
                />
                <span>{item}</span>
              </label>
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-700">
            Pendientes actuales: {pending.period.summary.pendingSubmission}{" "}
            autoevaluación(es) y {pending.period.summary.pendingCalibration}{" "}
            calibración(es).
          </p>
          {!transitionReady && (
            <p className="mt-3 text-sm font-semibold text-amber-800">
              Completa las validaciones y confirmaciones para continuar.
            </p>
          )}
        </ConfirmationDialog>
      )}
      {pending?.kind === "reopen" && (
        <ConfirmationDialog
          title="Reabrir período en calibración"
          description="Esta acción excepcional quedará registrada en auditoría."
          icon={<CalendarCheck size={20} />}
          confirmLabel="Reabrir calibración"
          busy={busy}
          confirmDisabled={reopenJustification.trim().length < 10}
          error={confirmError}
          onClose={() => setPending(null)}
          onConfirm={() => void reopen(pending.period)}
        >
          <div className="rounded-xl bg-amber-50 p-4">
            <strong>{pending.period.name}</strong>
            <span className="mt-1 block text-sm text-amber-900">
              Cerrado → En calibración
            </span>
          </div>
          <label className="mt-4 block text-sm font-bold">
            Justificación obligatoria
            <textarea
              rows={4}
              value={reopenJustification}
              onChange={(event) => setReopenJustification(event.target.value)}
              placeholder="Explica por qué debe reabrirse el período"
              className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal"
            />
          </label>
          <p className="mt-2 text-xs text-slate-500">
            Mínimo 10 caracteres. Las calibraciones finales ya guardadas no se
            modificarán.
          </p>
        </ConfirmationDialog>
      )}
      {pending?.kind === "communicate" && (
        <ConfirmationDialog
          title={
            pending.type === "OPENING"
              ? "Comunicar apertura"
              : "Enviar recordatorio"
          }
          description="Confirma el alcance antes de generar las comunicaciones."
          icon={<Mail size={20} />}
          confirmLabel={
            pending.type === "OPENING"
              ? "Generar comunicaciones"
              : "Generar recordatorios"
          }
          busy={busy}
          error={confirmError}
          onClose={() => setPending(null)}
          onConfirm={() => void communicate(pending.period, pending.type)}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-emerald-50 p-4">
              <span className="text-sm text-emerald-800">Con correo</span>
              <strong className="mt-1 block text-2xl">
                {pending.preview.withEmail}
              </strong>
            </div>
            <div className="rounded-xl bg-amber-50 p-4">
              <span className="text-sm text-amber-800">Sin correo</span>
              <strong className="mt-1 block text-2xl">
                {pending.preview.withoutEmail}
              </strong>
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-700">
            Las personas sin correo quedarán identificadas para seguimiento.
          </p>
        </ConfirmationDialog>
      )}
    </main>
  );
}
