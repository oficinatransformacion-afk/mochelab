# Matriz de paridad campo a campo: Apps Script → Mochelab 2.0

Revisión en modo solo lectura del proyecto anterior en
`C:\Users\user\Documents\ChatGPT\Mochelab`. Fecha de revisión: 2026-09-06.

## Conclusión

Mochelab 2.0 todavía **no tiene paridad funcional completa** con el proyecto
Apps Script. El modelo PostgreSQL cubre la mayoría de entidades, pero hay campos
presentes solo en base de datos, campos no expuestos en formularios y reglas del
sistema anterior que aún no se validan en el backend nuevo.

## Asignación de roles y equipos

El sistema anterior no tiene una entidad independiente `EquipoRol`. La relación
operativa es `PersonaRol` y su llave es `DNI + ID_ROL + ID_TEAM`: se asigna una
persona a un rol dentro de un equipo. Al crearla se despliega la malla `RolCurso`
en `PersonaCurso`.

En 2.0 la relación equivalente es `PersonRole` (`personId + roleId + teamId`):

- Alta: pantalla `/personas`, bloque **Asignar persona a un rol y equipo**.
- Gestión: pantalla `/asignaciones`.
- Cursos de la malla: pantalla `/roles`.

Brechas de experiencia frente a Apps Script:

- `/asignaciones` no ofrece el botón de alta; está separado en `/personas`.
- Faltan filtros específicos por gerencia, múltiples equipos, múltiples roles,
  onboarding/situación de atención y varios KPIs del tablero anterior.
- Falta limitar a personas, roles y equipos activos en todas las opciones.
- El guardado múltiple existe, pero falta comprobar la misma respuesta y
  recuperación parcial por fila que implementaba Apps Script.

Si el negocio necesita definir previamente "qué roles admite cada equipo" sin
asignar personas, eso sería una funcionalidad nueva `EquipoRol`; no existe en el
proyecto Apps Script revisado ni en 2.0.

## Campos por entidad

Leyenda: **Completo** = persistencia y pantalla; **Solo BD** = modelado pero no
editable en pantalla; **Falta** = sin equivalencia funcional suficiente.

### Persona

| Apps Script | 2.0 | Estado |
|---|---|---|
| DNI | `Person.dni` | Completo |
| EMPRESA | `companyId` | Completo; PK 2.0 = DNI + empresa |
| NOMBRES | `names` | Completo |
| CORREO | `email` | Completo |
| TELEFONO | `phone` | Solo BD |
| POSICION | `position` | Solo BD |
| NIVEL_OCUPACIONAL | `occupationLevelId` | Solo BD |
| BUSINESS_PARTNER | `businessPartnerId` | Solo BD |
| GERENCIA / SUBGERENCIA / DIVISION | jerarquía `OrganizationalUnit` | Falta seleccionar y mostrar explícitamente los niveles en alta/edición |
| ESTADO | `statusId` | Completo |

Además, la pantalla 2.0 no reproduce todavía todos los indicadores de calidad
del anterior: campos faltantes, DNI/correo duplicado y atención estructural.

### PersonaRol

| Apps Script | 2.0 | Estado |
|---|---|---|
| DNI + ID_ROL + ID_TEAM | `personId + roleId + teamId` | Completo |
| ESTADO_PERSONA_ROL | `statusId` | Completo |
| ESTADO_ONBOARDING | `onboardingStatusId` | Completo |
| FECHA_ALTA | `startDate` | Completo |
| FECHA_BAJA | `endDate` | Completo |
| creación automática de PersonaCurso | `RoleCourse → PersonCourse` | Completo |
| cierre/reactivación y auditoría | transacción y auditoría | Completo |

### Curso, RolCurso y PersonaCurso

| Contrato anterior | 2.0 | Estado |
|---|---|---|
| Curso: ID_CURSO, NOMBRE_CURSO, MODULO, ESTADO | `Course` | Completo |
| RolCurso: ID_ROL + ID_CURSO | `RoleCourse` | Completo |
| PersonaCurso: persona/rol/curso, NOTA, ESTADO, FECHA_INICIO, FECHA_FIN | `PersonCourse` | Completo en BD; actualización básica disponible |
| FUENTE, FECHA_CARGA, USUARIO_CARGA, GRUPO | `sourceId`, `loadedAt`, `loadedByLegacy`, `groupId` | Solo BD / migración |

Brechas: estados de avance todavía están codificados en la pantalla en vez de
consumirse íntegramente desde catálogo; faltan filtros, exportación y vista de
metadatos equivalentes al módulo formativo anterior.

### Rol y Equipo

| Contrato anterior | 2.0 | Estado |
|---|---|---|
| Rol: ID_ROL, NOMBRE_ROL, TIPO, ESTADO | `Role` | Completo |
| Equipo: ID_TEAM, UNIDAD, PROGRAMA, ESTADO | `Team` | Completo mediante relaciones normalizadas |

## OKR

Contrato anterior:

`ID_OKR, NIVEL, ID_OKR_PADRE, AREA_ENFOQUE, ID_TEAM, ANIO, CICLO, OBJETIVO, RESULTADO_CLAVE, INDICADOR, TIPO, UNIDAD_KR, LINEA_BASE, FECHA_BASE, META, EJECUTADO, FECHA_CORTE, ESTADO, ESTADO_REGISTRO, %CUMPLIMIENTO`

Todos esos campos están modelados en `Objective`. Sin embargo:

- `FECHA_BASE` (`baselineDate`) y `FECHA_CORTE` (`cutoffDate`) no aparecen en el
  formulario web.
- El backend exige equipo para nivel Equipo y lo prohíbe para Corporativo, pero
  aún no exige `ID_OKR_PADRE` para cada OKR de equipo.
- La lista de padres no está restringida a corporativos compatibles.
- Falta validar que padre e hijo correspondan al año/ciclo/área aplicables.
- Falta la regla de autorización que reserva altas/ediciones corporativas al
  administrador; el permiso actual es general por módulo.
- El cálculo directo/inverso y la protección contra ciclos sí existen.

Estado correcto: **paridad de modelo, paridad funcional incompleta**.

## Portafolio

Los campos del Apps Script están modelados casi por completo en `Initiative`,
pero la pantalla nueva solo expone una parte.

Campos visibles hoy: empresa, año, ciclo, área, nivel, programa, equipo, tipo,
talla, gestión, estado, impacto, iniciativa, release, OKR, fechas de ejecución y
beneficios económicos proyectado/real.

Campos que están en BD pero faltan en la pantalla o no se restauran al editar:

- prioridad;
- dueño de producto;
- ATF/gestor;
- líder técnico;
- hito de acompañamiento;
- escalamiento;
- horizonte de retorno;
- TI Capacity;
- categoría;
- descripción de impacto;
- beneficios de mitigación proyectado y real;
- beneficio potencial anual;
- enlace de documentación;
- observaciones.

Reglas faltantes en backend respecto al anterior:

- exigir equipo, OKR, fecha de inicio, dueño de producto, ATF/gestor, horizonte
  de retorno y categoría;
- aceptar solo OKR activo de nivel Equipo;
- validar que el OKR coincida con equipo + área + año + ciclo;
- filtrar en la interfaz únicamente los OKR compatibles, conservando el enlace
  histórico al editar.

Estado correcto: **modelo amplio, formulario y reglas incompletos**.

## Metas de indicadores

El contrato `ID_META, indicador, alcance, equipo/rol, vigencia, valor, unidad,
estado` está modelado y el CRUD básico está disponible. Faltan validaciones de
negocio que el anterior aplicaba: coherencia entre alcance y equipo/rol,
combinaciones indicador-unidad, vigencias incompatibles/solapadas y consumo
equivalente en todos los tableros.

## Estado global revisado

| Área | Estado verificado |
|---|---|
| Personas | Parcial: faltan campos del formulario y controles de calidad |
| PersonaRol / asignaciones | Núcleo completo; experiencia y filtros parciales |
| Cursos / RolCurso / PersonaCurso | Núcleo completo; operación y filtros parciales |
| Madurez | Cobertura transaccional amplia; requiere casos de aceptación contra Apps Script |
| OKR | Modelo completo; formulario, reglas y permisos parciales |
| Portafolio | Modelo casi completo; formulario y validaciones con brechas importantes |
| Metas | CRUD completo; reglas de coherencia parciales |
| Auditoría | Cobertura transaccional amplia; pendiente equivalencia de reportes |
| Usuarios/perfiles | Preparado; autenticación corporativa diferida por decisión |
| Jobs masivos | Diferidos por decisión; cursos se procesarán externamente |

## Pendientes priorizados

1. Completar Persona (todos los campos organizacionales y personales).
2. Unificar o enlazar claramente el alta de PersonaRol desde Asignaciones y
   completar filtros/KPIs.
3. Completar el formulario y las reglas obligatorias de Portafolio.
4. Completar fechas, jerarquía y autorización corporativa de OKR.
5. Completar reglas de alcance y vigencia de MetasIndicadores.
6. Completar filtros/exportaciones de PersonaCurso y rutas.
7. Ejecutar casos de aceptación módulo por módulo antes de declarar paridad.
8. Mantener correo real, jobs masivos y autenticación para sus fases acordadas.
