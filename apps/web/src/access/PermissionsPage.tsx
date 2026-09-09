import { useEffect, useState } from "react";
import { apiUrl, demoHeaders } from "../directory/DirectoryShell";

type Module = { moduleId:string; code:string; name:string; canView:boolean; canCreate:boolean; canEdit:boolean; canDelete:boolean };
type Profile = { id:string; code:string; name:string; modules:Module[] };
const labels = [["canView","Ver"],["canCreate","Crear"],["canEdit","Editar"],["canDelete","Eliminar"]] as const;
const menuOptions = [
  ["Principal","Inicio","INICIO"],["Principal","Personas","PERSONAS"],["Principal","Asignaciones","ASIGNACIONES"],["Principal","Equipos","EQUIPOS"],
  ["Academia","Rutas de aprendizaje","CURSOS"],
  ["Madurez","Autoevaluación","MADUREZ"],["Madurez","Calibraciones","MADUREZ"],["Madurez","Madurez","MADUREZ"],
  ["Estrategia","Objetivos y KR","OBJETIVOS"],["Estrategia","Portafolio","PORTAFOLIO"],["Estrategia","Metas","OBJETIVOS"],
  ["Administración","Maestros","CATALOGOS"],["Administración","Mallas por rol","CURSOS"],["Administración","Catálogos","CATALOGOS"],
  ["Administración","Permisos por perfil","USUARIOS"],["Administración","Cuentas y equipos","USUARIOS"],["Administración","Comunicaciones","USUARIOS"],
  ["Administración","Auditoría","AUDITORIA"],["Administración","Calidad de datos","AUDITORIA"],["Administración","Procesos","MIGRACIONES"],
] as const;

const menuNames = (code:string) => menuOptions.filter(([, , module]) => module === code).map(([, name]) => name);

export function PermissionsPage() {
  const [profiles,setProfiles]=useState<Profile[]>([]);
  const [selected,setSelected]=useState("USUARIO");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  async function load(){
    const response=await fetch(apiUrl+"/api/access/admin/permissions",{headers:demoHeaders});
    if(!response.ok){setMessage(response.status===403?"El perfil no puede configurar permisos.":"No se pudo cargar la matriz.");return}
    const next=await response.json() as Profile[];
    setProfiles(next);
    if(!next.some(profile=>profile.code===selected)&&next[0])setSelected(next[0].code);
  }
  useEffect(()=>{void load()},[]);
  const profile=profiles.find(item=>item.code===selected);

  async function change(module:Module,key:typeof labels[number][0],checked:boolean){
    if(!profile)return;
    if(!checked&&!window.confirm(`¿Retirar este permiso de ${menuNames(module.code).join(", ")||module.name}?`))return;
    setBusy(true);
    const updated={...module,[key]:checked};
    if(key==="canView"&&!checked){updated.canCreate=false;updated.canEdit=false;updated.canDelete=false}
    const response=await fetch(`${apiUrl}/api/access/admin/profiles/${profile.id}/modules/${module.moduleId}`,{method:"PATCH",headers:{...demoHeaders,"Content-Type":"application/json"},body:JSON.stringify({canView:updated.canView,canCreate:updated.canCreate,canEdit:updated.canEdit,canDelete:updated.canDelete})});
    if(!response.ok){const body=await response.json().catch(()=>({}));setMessage(body.message??"No se pudo guardar el permiso")}
    else{setMessage(`Permisos de ${profile.name} actualizados.`);await load()}
    setBusy(false);
  }

  return <main className="min-h-screen bg-slate-100 text-slate-950"><div className="mx-auto max-w-6xl px-5 py-8">
    <p className="text-sm font-semibold uppercase tracking-wider text-emerald-700">Seguridad</p>
    <h1 className="mt-2 text-3xl font-bold">Permisos por perfil</h1>
    <p className="mt-3 text-slate-600">Administra los accesos de Usuario, Admin y System. Los nombres corresponden a las opciones visibles del menú lateral.</p>
    <label className="mt-6 block max-w-sm text-sm font-semibold">Perfil
      <select value={selected} onChange={event=>setSelected(event.target.value)} className="mt-2 w-full rounded-xl border bg-white px-4 py-3 text-base font-normal">
        {profiles.map(item=><option key={item.id} value={item.code}>{item.name}</option>)}
      </select>
    </label>
    {message&&<p role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold">{message}</p>}
    <div className="mt-6 overflow-x-auto rounded-2xl border bg-white">
      <table className="w-full text-left"><thead className="bg-slate-50"><tr><th className="px-5 py-4">Sección y opciones del menú</th>{labels.map(([,name])=><th key={name} className="px-5 py-4 text-center">{name}</th>)}</tr></thead>
      <tbody>{profile?.modules.map(module=>{const options=menuOptions.filter(([, , code])=>code===module.code);const section=[...new Set(options.map(([group])=>group))].join(" / ");const names=options.map(([,name])=>name);return <tr key={module.moduleId} className="border-t align-top"><td className="px-5 py-4"><span className="text-xs font-bold uppercase tracking-wider text-slate-400">{section||"Sistema"}</span><strong className="mt-1 block">{names.join(" · ")||module.name}</strong><span className="mt-1 block text-xs text-slate-400">{module.code}</span></td>{labels.map(([key])=><td key={key} className="px-5 py-4 text-center"><input aria-label={key+" "+names.join(", ")} type="checkbox" checked={module[key]} disabled={busy} onChange={event=>void change(module,key,event.target.checked)} className="h-5 w-5 accent-emerald-600"/></td>)}</tr>})}</tbody></table>
    </div>
    <p className="mt-4 text-sm text-slate-500">Cuando varias opciones comparten un módulo funcional, se muestran juntas y reciben el mismo permiso. Quitar “Ver” desactiva también Crear, Editar y Eliminar.</p>
  </div></main>;
}
