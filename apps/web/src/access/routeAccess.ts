import type { ModuleCode } from "@mochelab/shared";

export function moduleForPath(path:string):ModuleCode|null{
  if(path==="/")return"INICIO";
  if(path==="/personas"||/^\/personas\/[^/]+$/.test(path))return"PERSONAS";
  if(path==="/asignaciones")return"ASIGNACIONES";
  if(path==="/equipos")return"EQUIPOS";
  if(["/roles","/configuracion/mallas","/cursos/catalogo","/cursos","/cursos/avance","/rutas"].includes(path))return"CURSOS";
  if(path==="/objetivos/metas")return"METAS";
  if(path==="/objetivos")return"OBJETIVOS";
  if(path==="/portafolio")return"PORTAFOLIO";
  if(path.startsWith("/madurez"))return"MADUREZ";
  if(path==="/configuracion/catalogos"||path==="/configuracion/maestros")return"CATALOGOS";
  if(path==="/configuracion/usuarios"||path==="/configuracion/cuentas"||path==="/configuracion/comunicaciones"||path==="/comunicaciones")return"USUARIOS";
  if(path==="/configuracion/auditoria"||path==="/calidad-datos")return"AUDITORIA";
  if(path==="/configuracion/jobs"||path==="/configuracion/migraciones")return"MIGRACIONES";
  return null;
}

export function isAdministratorPath(path:string){return path.startsWith("/configuracion/")||path==="/calidad-datos"||path.startsWith("/madurez/calibracion")||path==="/madurez/periodos"||path==="/madurez/configuracion"}
