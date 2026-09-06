import { useEffect,useState } from "react";
import type { ModuleCapability,UserCapabilities } from "@mochelab/shared";
import { apiUrl,demoHeaders } from "../directory/DirectoryShell";
export function useModuleCapability(code:string){const [value,setValue]=useState<ModuleCapability|null>(null);useEffect(()=>{fetch(apiUrl+"/api/me/capabilities",{headers:demoHeaders}).then(r=>r.json() as Promise<UserCapabilities>).then(data=>setValue(data.modules.find(x=>x.code===code)??null)).catch(()=>setValue(null))},[code]);return value}
