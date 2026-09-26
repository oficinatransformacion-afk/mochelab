import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

export type MultiSelectOption = { id:string; label:string };

export function MultiSelect({label,options,value,onChange,emptyLabel="Todas las opciones"}:{label:string;options:MultiSelectOption[];value:string[];onChange:(value:string[])=>void;emptyLabel?:string}){
 const[open,setOpen]=useState(false),[search,setSearch]=useState("");
 const root=useRef<HTMLDivElement>(null),listId=useId();
 const selected=options.filter(option=>value.includes(option.id));
 const allSelected=options.length>0&&selected.length===options.length;
 const visible=useMemo(()=>options.filter(option=>option.label.toLocaleLowerCase("es").includes(search.trim().toLocaleLowerCase("es"))),[options,search]);
 useEffect(()=>{const close=(event:MouseEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false)};document.addEventListener("mousedown",close);return()=>document.removeEventListener("mousedown",close)},[]);
 function toggle(id:string){onChange(value.includes(id)?value.filter(item=>item!==id):[...value,id])}
 function toggleAll(){onChange(allSelected?[]:options.map(option=>option.id));setSearch("")}
 function clear(){onChange([]);setSearch("")}
 return <div ref={root} className="relative min-w-0">
  <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} onClick={()=>setOpen(current=>!current)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:border-slate-300">
   <span className="min-w-0 flex-1 truncate text-slate-700">{selected.length===0?emptyLabel:allSelected?`Todos (${options.length})`:selected.length===1?selected[0].label:`${selected.length} seleccionadas`}</span>
   <span className="flex items-center gap-1">{value.length>0&&<span role="button" tabIndex={0} aria-label={`Limpiar ${label}`} onClick={event=>{event.stopPropagation();clear()}} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();clear()}}} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={14}/></span>}<ChevronDown size={16} className={`text-slate-400 transition-transform ${open?"rotate-180":""}`}/></span>
  </button>
  {selected.length>0&&<div className="mt-2 flex flex-wrap gap-1.5">{allSelected?<button type="button" onClick={clear} className="inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600"><span className="truncate">Todos ({options.length})</span><X size={12}/></button>:<>{selected.slice(0,3).map(option=><button type="button" key={option.id} onClick={()=>toggle(option.id)} className="inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600"><span className="truncate">{option.label}</span><X size={12}/></button>)}{selected.length>3&&<span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">+{selected.length-3}</span>}</>}</div>}
  {open&&<div id={listId} role="listbox" aria-multiselectable="true" className="absolute z-[75] mt-2 w-full min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
   <div className="border-b p-2"><div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3"><Search size={15} className="text-slate-400"/><input autoFocus value={search} onChange={event=>setSearch(event.target.value)} onKeyDown={event=>{if(event.key==="Escape")setOpen(false)}} placeholder={`Buscar en ${label.toLowerCase()}`} className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"/></div></div>
   <div className="flex items-center justify-between gap-3 border-b px-3 py-2 text-xs"><strong>{label}</strong><button type="button" onClick={toggleAll} disabled={!options.length} className="font-bold text-red-700 disabled:text-slate-300">{allSelected?"Deseleccionar todos":"Seleccionar todos"}</button></div>
   <div className="max-h-60 overflow-auto p-2">{visible.length?visible.map(option=>{const checked=value.includes(option.id);return <button type="button" role="option" aria-selected={checked} key={option.id} onClick={()=>toggle(option.id)} className="mt-1 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50"><span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${checked?"border-red-600 bg-red-600 text-white":"border-slate-300"}`}>{checked&&<Check size={12}/>}</span><span>{option.label}</span></button>}):<p className="p-3 text-center text-sm text-slate-500">No hay coincidencias.</p>}</div>
  </div>}
 </div>
}
