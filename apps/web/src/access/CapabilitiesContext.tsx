import { createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode } from "react";
import { UserCapabilitiesSchema,type UserCapabilities } from "@mochelab/shared";
import { apiUrl,demoHeaders } from "../directory/DirectoryShell";
import { endDemoSession,hasDemoSession } from "./demoSession";

type CapabilityState={access:UserCapabilities|null;status:"idle"|"loading"|"ready"|"error";error:string;reload:()=>void};
const CapabilitiesContext=createContext<CapabilityState|undefined>(undefined);

export function CapabilitiesProvider({children}:{children:ReactNode}){
  const[access,setAccess]=useState<UserCapabilities|null>(null),[status,setStatus]=useState<CapabilityState["status"]>("idle"),[error,setError]=useState(""),[revision,setRevision]=useState(0);
  useEffect(()=>{
    if(!hasDemoSession()){setAccess(null);setStatus("idle");return}
    const controller=new AbortController();setStatus("loading");setError("");
    fetch(`${apiUrl}/api/me/capabilities`,{headers:demoHeaders,signal:controller.signal}).then(async response=>{
      if(response.status===401){endDemoSession();window.location.replace("/login");throw new Error("Tu sesión venció. Ingresa nuevamente.")}
      if(!response.ok)throw new Error("No se pudieron cargar tus permisos.");
      return UserCapabilitiesSchema.parse(await response.json());
    }).then(value=>{setAccess(value);setStatus("ready")}).catch(reason=>{if(reason instanceof DOMException&&reason.name==="AbortError")return;setAccess(null);setStatus("error");setError(reason instanceof Error?reason.message:"No se pudieron cargar tus permisos.")});
    return()=>controller.abort();
  },[revision]);
  const reload=useCallback(()=>setRevision(value=>value+1),[]);
  const value=useMemo(()=>({access,status,error,reload}),[access,status,error,reload]);
  return <CapabilitiesContext.Provider value={value}>{children}</CapabilitiesContext.Provider>;
}

export function useCapabilities(){const value=useContext(CapabilitiesContext);if(!value)throw new Error("useCapabilities debe usarse dentro de CapabilitiesProvider");return value}
