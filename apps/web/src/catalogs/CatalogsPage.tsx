import { useEffect, useState } from "react";
import { Archive } from "lucide-react";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { apiUrl, demoHeaders } from "../directory/DirectoryShell";

type Value = { id:string; code:string; name:string; description:string|null; sortOrder:number; active:boolean; validFrom:string|null; validUntil:string|null };
type Catalog = { id:string; code:string; name:string; description:string|null; active:boolean; values:Value[]; _count:{values:number} };
type ValueForm = { code:string; name:string; description:string; sortOrder:string; active:boolean; validFrom:string; validUntil:string };
type CatalogForm = { code:string; name:string; description:string; active:boolean };
type Notice = { type:"success"|"error"|"info"; text:string };

const blankValue:ValueForm = { code:"", name:"", description:"", sortOrder:"0", active:true, validFrom:"", validUntil:"" };
const blankCatalog:CatalogForm = { code:"", name:"", description:"", active:true };
const errorText = (body:unknown, fallback:string) => typeof body === "object" && body && "message" in body
  ? Array.isArray(body.message) ? body.message.join(". ") : String(body.message)
  : fallback;

export function CatalogsPage() {
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [catalogId, setCatalogId] = useState("");
  const [form, setForm] = useState<ValueForm>(blankValue);
  const [catalogForm, setCatalogForm] = useState<CatalogForm>(blankCatalog);
  const [editing, setEditing] = useState<string|null>(null);
  const [editingCatalog, setEditingCatalog] = useState<string|null>(null);
  const [show, setShow] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [notice, setNotice] = useState<Notice|null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [impact, setImpact] = useState<{total:number;dependencies:{label:string;count:number}[]}|null>(null);

  async function load(preferredId?:string) {
    const response = await fetch(`${apiUrl}/api/catalogs/admin`, { headers:demoHeaders });
    if (!response.ok) {
      setNotice({ type:"error", text:response.status === 403 ? "Solo el administrador puede configurar catálogos." : "No se pudieron cargar los catálogos." });
      return;
    }
    const data = await response.json() as Catalog[];
    setCatalogs(data);
    setCatalogId(current => preferredId ?? (data.some(item => item.id === current) ? current : data[0]?.id ?? ""));
  }

  useEffect(() => { void load(); }, []);

  const catalog = catalogs.find(item => item.id === catalogId);
  const setValueField = (key:keyof ValueForm, value:string|boolean) => setForm(current => ({ ...current, [key]:value }));
  const setCatalogField = (key:keyof CatalogForm, value:string|boolean) => setCatalogForm(current => ({ ...current, [key]:value }));

  function startCreateCatalog() {
    setEditingCatalog(null);
    setCatalogForm(blankCatalog);
    setShowCatalog(true);
    setShow(false);
    setNotice(null);
  }

  function startEditCatalog() {
    if (!catalog) return;
    setEditingCatalog(catalog.id);
    setCatalogForm({ code:catalog.code, name:catalog.name, description:catalog.description ?? "", active:catalog.active });
    setShowCatalog(true);
    setShow(false);
    setNotice(null);
  }

  async function saveCatalog() {
    if (!catalogForm.code.trim() || !catalogForm.name.trim()) return;
    setBusy(true);
    setNotice(null);
    const response = await fetch(`${apiUrl}/api/catalogs/admin${editingCatalog ? `/${editingCatalog}` : ""}`, {
      method:editingCatalog ? "PATCH" : "POST",
      headers:{ ...demoHeaders, "Content-Type":"application/json" },
      body:JSON.stringify(catalogForm),
    });
    const body = await response.json().catch(() => ({})) as {id?:string;message?:unknown};
    if (!response.ok) {
      setNotice({ type:"error", text:errorText(body, "No se pudo guardar el catálogo") });
      setBusy(false);
      return;
    }
    const selectedId = body.id ?? editingCatalog ?? catalogId;
    setNotice({ type:"success", text:editingCatalog ? "Catálogo actualizado." : "Catálogo creado. Ya puedes agregarle valores." });
    setShowCatalog(false);
    await load(selectedId);
    setBusy(false);
  }

  function createValue() {
    setEditing(null);
    setForm(blankValue);
    setShow(true);
    setShowCatalog(false);
    setNotice(null);
    setImpact(null);
  }

  async function editValue(value:Value) {
    setEditing(value.id);
    setForm({ code:value.code, name:value.name, description:value.description ?? "", sortOrder:String(value.sortOrder), active:value.active, validFrom:value.validFrom?.slice(0, 10) ?? "", validUntil:value.validUntil?.slice(0, 10) ?? "" });
    setShow(true);
    setShowCatalog(false);
    const response = await fetch(`${apiUrl}/api/catalogs/admin/values/${value.id}/impact`, { headers:demoHeaders });
    if (response.ok) {
      const nextImpact = await response.json() as {total:number;dependencies:{label:string;count:number}[]};
      setImpact(nextImpact);
      setNotice({ type:"info", text:nextImpact.total ? `Impacto: ${nextImpact.total} dependencia(s) — ${nextImpact.dependencies.map(item => `${item.label}: ${item.count}`).join(", ")}. No se permitirá desactivar mientras existan.` : "Sin dependencias: este valor puede desactivarse." });
    }
  }

  async function saveValue() {
    if (!catalog || !form.name.trim() || (!editing && !form.code.trim())) return;
    if (editing && !form.active) {
      setConfirmError("");
      setConfirming(true);
      return;
    }
    await persistValue();
  }

  async function persistValue() {
    if (!catalog) return;
    setBusy(true);
    setConfirmError("");
    const path = editing ? `/api/catalogs/admin/values/${editing}` : `/api/catalogs/admin/${catalog.id}/values`;
    const response = await fetch(apiUrl + path, { method:editing ? "PATCH" : "POST", headers:{ ...demoHeaders, "Content-Type":"application/json" }, body:JSON.stringify(form) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const text = errorText(body, "No se pudo guardar el valor");
      setNotice({ type:"error", text });
      setConfirmError(text);
      setBusy(false);
      return;
    }
    setNotice({ type:"success", text:"Valor de catálogo guardado." });
    setShow(false);
    setConfirming(false);
    await load(catalog.id);
    setBusy(false);
  }

  const noticeStyle = notice?.type === "error" ? "border-rose-200 bg-rose-50 text-rose-900" : notice?.type === "info" ? "border-sky-200 bg-sky-50 text-sky-900" : "border-emerald-200 bg-emerald-50 text-emerald-900";

  return <main className="min-h-screen bg-slate-100 text-slate-950">
    <header className="border-b bg-white"><div className="mx-auto flex max-w-7xl justify-between px-5 py-4"><a href="/" className="text-lg font-bold">Mochelab <span className="text-emerald-600">2.0</span></a><a href="/configuracion/usuarios" className="text-sm font-bold text-emerald-700">Permisos</a></div></header>
    <div className="mx-auto max-w-6xl px-5 py-8">
      <p className="text-sm font-semibold uppercase tracking-wider text-emerald-700">Configuración</p>
      <h1 className="mt-2 text-3xl font-bold">Catálogos y opciones</h1>
      <p className="mt-3 text-slate-600">Administra los catálogos y los valores mostrados en los combos de la plataforma.</p>
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-end">
        <label className="flex-1 text-sm font-semibold">Catálogo<select value={catalogId} onChange={event => { setCatalogId(event.target.value); setShow(false); setShowCatalog(false); setNotice(null); }} className="mt-2 w-full rounded-xl border bg-white px-4 py-3 text-base font-normal">{catalogs.map(item => <option key={item.id} value={item.id}>{item.name} ({item._count.values}){item.active ? "" : " · Inactivo"}</option>)}</select></label>
        <button type="button" onClick={startCreateCatalog} className="rounded-xl border border-emerald-600 px-5 py-3 text-sm font-bold text-emerald-700">Nuevo catálogo</button>
        <button type="button" onClick={startEditCatalog} disabled={!catalog} className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 disabled:bg-slate-200 disabled:text-slate-400">Editar catálogo</button>
        <button type="button" onClick={createValue} disabled={!catalog || !catalog.active} className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white disabled:bg-slate-300">Nuevo valor</button>
      </div>
      {notice && <p role={notice.type === "error" ? "alert" : "status"} className={`mt-5 rounded-xl border px-4 py-3 text-sm font-semibold ${noticeStyle}`}>{notice.text}</p>}

      {showCatalog && <section className="mt-6 rounded-2xl border border-emerald-200 bg-white p-6">
        <div className="flex justify-between"><div><h2 className="text-xl font-bold">{editingCatalog ? "Editar catálogo" : "Nuevo catálogo"}</h2><p className="mt-1 text-sm text-slate-500">El código identifica técnicamente el catálogo y no podrá modificarse después.</p></div><button type="button" onClick={() => setShowCatalog(false)} className="font-bold text-slate-500">Cerrar</button></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">Código<input disabled={Boolean(editingCatalog)} value={catalogForm.code} onChange={event => setCatalogField("code", event.target.value)} placeholder="EJEMPLO_CATALOGO" className="mt-2 w-full rounded-xl border px-4 py-3 font-mono text-base font-normal uppercase disabled:bg-slate-100"/></label>
          <label className="text-sm font-semibold">Nombre<input value={catalogForm.name} onChange={event => setCatalogField("name", event.target.value)} placeholder="Nombre visible" className="mt-2 w-full rounded-xl border px-4 py-3 text-base font-normal"/></label>
          <label className="text-sm font-semibold sm:col-span-2">Descripción<textarea rows={3} value={catalogForm.description} onChange={event => setCatalogField("description", event.target.value)} placeholder="Explica para qué se utilizará este catálogo" className="mt-2 w-full rounded-xl border px-4 py-3 text-base font-normal"/></label>
          <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={catalogForm.active} onChange={event => setCatalogField("active", event.target.checked)} className="h-5 w-5 accent-emerald-600"/>Activo</label>
        </div>
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Crear el catálogo permite administrar sus valores. Para mostrarlo en un campo nuevo de otro módulo, ese módulo debe vincularse al código del catálogo.</p>
        <div className="mt-5 flex justify-end"><button type="button" disabled={busy || !catalogForm.code.trim() || !catalogForm.name.trim()} onClick={() => void saveCatalog()} className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white disabled:bg-slate-300">{busy ? "Guardando…" : "Guardar catálogo"}</button></div>
      </section>}

      {show && <section className="mt-6 rounded-2xl border border-emerald-200 bg-white p-6">
        <div className="flex justify-between"><h2 className="text-xl font-bold">{editing ? "Editar valor" : "Nuevo valor"}</h2><button type="button" onClick={() => setShow(false)} className="font-bold text-slate-500">Cerrar</button></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">Código<input disabled={Boolean(editing)} value={form.code} onChange={event => setValueField("code", event.target.value)} className="mt-2 w-full rounded-xl border px-4 py-3 text-base font-normal disabled:bg-slate-100"/></label>
          <label className="text-sm font-semibold">Nombre<input value={form.name} onChange={event => setValueField("name", event.target.value)} className="mt-2 w-full rounded-xl border px-4 py-3 text-base font-normal"/></label>
          <label className="text-sm font-semibold">Descripción<input value={form.description} onChange={event => setValueField("description", event.target.value)} className="mt-2 w-full rounded-xl border px-4 py-3 text-base font-normal"/></label>
          <label className="text-sm font-semibold">Orden<input type="number" value={form.sortOrder} onChange={event => setValueField("sortOrder", event.target.value)} className="mt-2 w-full rounded-xl border px-4 py-3 text-base font-normal"/></label>
          <label className="text-sm font-semibold">Válido desde<input type="date" value={form.validFrom} onChange={event => setValueField("validFrom", event.target.value)} className="mt-2 w-full rounded-xl border px-4 py-3 text-base font-normal"/></label>
          <label className="text-sm font-semibold">Válido hasta<input type="date" value={form.validUntil} onChange={event => setValueField("validUntil", event.target.value)} className="mt-2 w-full rounded-xl border px-4 py-3 text-base font-normal"/></label>
          <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={form.active} onChange={event => setValueField("active", event.target.checked)} className="h-5 w-5 accent-emerald-600"/>Activo</label>
        </div>
        <div className="mt-5 flex justify-end"><button type="button" disabled={busy || !form.name.trim() || (!editing && !form.code.trim())} onClick={() => void saveValue()} className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white disabled:bg-slate-300">{busy ? "Guardando…" : "Guardar valor"}</button></div>
      </section>}

      <div className="mt-7 overflow-x-auto rounded-2xl border bg-white"><table className="w-full text-left"><thead className="bg-slate-50"><tr><th className="px-5 py-4">Código</th><th className="px-5 py-4">Nombre</th><th className="px-5 py-4">Orden</th><th className="px-5 py-4">Estado</th><th className="px-5 py-4"></th></tr></thead><tbody>{catalog?.values.length ? catalog.values.map(value => <tr key={value.id} className="border-t"><td className="px-5 py-4 font-mono text-sm">{value.code}</td><td className="px-5 py-4 font-semibold">{value.name}</td><td className="px-5 py-4">{value.sortOrder}</td><td className="px-5 py-4"><span className={`rounded-full px-3 py-1 text-sm font-semibold ${value.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{value.active ? "Activo" : "Inactivo"}</span></td><td className="px-5 py-4 text-right"><button type="button" onClick={() => void editValue(value)} className="rounded-lg border px-3 py-2 text-sm font-bold">Editar</button></td></tr>) : <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">Este catálogo todavía no tiene valores.</td></tr>}</tbody></table></div>
    </div>
    {confirming && <ConfirmationDialog title="Desactivar valor de catálogo" description="El valor dejará de aparecer en los combos para nuevos registros." icon={<Archive size={20}/>} confirmLabel="Desactivar valor" danger busy={busy} error={confirmError} onClose={() => setConfirming(false)} onConfirm={() => void persistValue()}><div className="rounded-xl bg-slate-50 p-4"><strong>{form.name}</strong><span className="mt-1 block text-sm text-slate-500">{catalog?.name} · Código {form.code}</span></div>{impact && <p className={`mt-4 rounded-xl p-3 text-sm font-semibold ${impact.total ? "bg-rose-50 text-rose-900" : "bg-emerald-50 text-emerald-900"}`}>{impact.total ? `${impact.total} dependencia(s) detectada(s). El sistema impedirá la desactivación mientras existan.` : "No se detectaron dependencias activas."}</p>}</ConfirmationDialog>}
  </main>;
}
