# Estrategia de migración

## Dos cargas separadas

La información de `Data Servicios (15).xlsx` corresponde a una migración de
ensayo. El sistema anterior seguirá operando, por lo que este archivo no se
considerará el corte definitivo.

1. **Migración de prueba:** se ejecuta durante el desarrollo para validar
   estructuras, relaciones, reglas de normalización y resultados funcionales.
2. **Migración final:** se ejecutará con un nuevo Excel obtenido después del
   cierre del sistema anterior y sobre la base productiva limpia.

No se copiarán registros de la base de prueba a producción. Se repetirá el
mismo importador con el archivo final.

## Etapas de cada lote

1. Extraer todas las hojas a staging sin transformar valores.
2. Registrar nombre, SHA-256, versión del importador, modo y cantidades.
3. Validar claves y relaciones; los problemas se registran como incidencias.
4. Normalizar empresas, catálogos, unidades y referencias conocidas.
5. Cargar las tablas maestras antes que sus relaciones.
6. Conciliar cantidades y emitir un reporte del lote.

El hash evita procesar accidentalmente dos veces el mismo archivo con la misma
versión del importador. Un archivo nuevo produce un lote nuevo.

## Reglas confirmadas

- La identidad de Persona es `DNI + Empresa`.
- `DANPER` se normaliza a `DANPER TRUJILLO SAC`.
- El equipo 3 usa `DANPER TRUJILLO SAC` como regla de migración.
- El equipo 33 usa `DOMINUS` como regla de migración.
- Los equipos pueden tener personas de más de una empresa.
- Los objetivos históricos con padre `#REF!` se cargan con padre nulo y
  conservan la referencia original.
- Las unidades y demás combos se resuelven mediante catálogos configurables.
- El valor de unidad malformado `2026-02-01 00:00:00` se conserva como
  incidencia y queda sin unidad relacionada.
- `PersonaConcientizada` no se importa.
- `VW_Academia` se extrae para conciliación, pero no se carga como entidad
  maestra porque replica información de personas, roles y cursos.

## Orden de carga

1. Catálogos, empresas, unidades organizacionales, business partners y períodos.
2. Programas, equipos, roles y cursos.
3. Personas usando `DNI + Empresa`.
4. Asignaciones PersonaRol y relaciones RolCurso.
5. PersonaCurso, MadurezRol y MadurezEquipo.
6. Objetivos y después sus relaciones padre-hijo.
7. Portafolio, metas de indicadores, usuarios y auditoría.

## Corte final

Antes de la migración definitiva se debe congelar la escritura del sistema
anterior, generar el nuevo Excel y comprobar su hash. La carga final debe
ejecutarse primero como simulación, comparar totales y recién después publicarse.
