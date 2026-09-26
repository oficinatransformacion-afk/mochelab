# Pase a PRODUCCIÓN: madurez ATF del período 202608

Este procedimiento prepara la promoción del código validado en PRUEBAS y la carga excepcional de seis autoevaluaciones ATF. No debe ejecutarse parcialmente ni contra una base distinta de `mochelab_prod`.

## Alcance

- Aplicación: `mochelab-api` y `mochelab-web`.
- Rama productiva: `main`.
- Base: `mochelab_prod`.
- Período: `202608` (`Ago. 2026`).
- Modelo: ATF `2026-v1`, 125 ítems.
- Carga: 6 personas, 750 respuestas.
- Estado final esperado del período: `CALIBRACION`, activo.
- No se cargan datos DUMMY.

## Condiciones obligatorias

1. Autorización explícita del usuario para ejecutar en PRODUCCIÓN.
2. PRUEBAS validado funcionalmente.
3. Rama `main` actualizada mediante PR desde el candidato validado.
4. Servicios confirmados: `mochelab-api` y `mochelab-web`.
5. `DATABASE_URL` del servicio productivo apuntando a `mochelab_prod`.
6. Respaldo completo, no vacío y restaurable de `mochelab_prod` antes de las migraciones.
7. Ventana de mantenimiento y responsable de rollback definidos.

## Fase 1: respaldo

Crear un respaldo completo en formato custom con PostgreSQL 17. El archivo debe conservarse fuera del repositorio.

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = "C:\ruta-segura\mochelab_prod_pre_release_$stamp.dump"
& 'C:\Users\user\AppData\Local\Mochelab\PostgreSQL17\pgsql\bin\pg_dump.exe' --format=custom --file=$backup $env:MOCHELAB_PROD_DATABASE_URL
if (-not (Test-Path -LiteralPath $backup) -or (Get-Item -LiteralPath $backup).Length -eq 0) { throw 'Respaldo inválido' }
```

Registrar ruta, tamaño, fecha y responsable. Probar `pg_restore --list $backup` antes de continuar.

## Fase 2: promoción y migraciones

1. Crear/revisar PR desde `develop` hacia `main`.
2. Confirmar que CI, typecheck, pruebas y build estén verdes.
3. Fusionar el PR.
4. Render desplegará `mochelab-api` y ejecutará `prisma migrate deploy` al iniciar.
5. Esperar estado saludable de API y web.
6. No ejecutar la carga ATF si alguna migración falla.

## Fase 3: auditoría previa de solo lectura

```powershell
node scripts/audit-atf-development.cjs --database=mochelab_prod --backup
```

Debe devolver `readyForAtfImport` sin faltantes, el período `202608`, las seis personas, asignaciones ATF activas y cero resultados ATF del lote. Si encuentra resultados existentes, detenerse y comparar; el importador no debe sobrescribir resultados manuales.

## Fase 4: modelo ATF

Desde `apps/api`, con autorización explícita y la confirmación técnica activa:

```powershell
$env:MOCHELAB_PRODUCTION_WRITE_CONFIRMATION = 'MOCHELAB_PROD'
& '.\node_modules\.bin\tsc.cmd' -p tsconfig.seed-local.json --pretty false
node dist-seed-local/prisma/seed-maturity-models-local.js --confirm-production
```

Repetir la auditoría. El modelo debe mostrar versión `2026-v1`, estado `PUBLISHED` y `itemCount: 125`.

## Fase 5: carga excepcional

```powershell
node dist-seed-local/prisma/import-atf-responses-local.js --confirm-production --backup-file="C:\ruta-segura\mochelab_prod_pre_release_YYYYMMDD-HHMMSS.dump"
```

El importador exige simultáneamente:

- base exacta `mochelab_prod`;
- argumento `--confirm-production`;
- variable `MOCHELAB_PRODUCTION_WRITE_CONFIRMATION=MOCHELAB_PROD`;
- respaldo existente y no vacío;
- período `202608`;
- modelo ATF `2026-v1` publicado con 125 ítems;
- persona y asignación ATF activa para cada DNI;
- ausencia de autoevaluaciones manuales que pudieran ser sobrescritas.

## Fase 6: validación posterior

1. Auditoría final de solo lectura.
2. Confirmar 6 autoevaluaciones y 750 respuestas.
3. Confirmar 125 respuestas por persona.
4. Confirmar período `202608` en `CALIBRACION` y activo.
5. Confirmar seis pendientes en el Centro de calibración.
6. Comparar los seis puntajes con el Excel fuente.
7. Calibrar un caso controlado y comprobar Perfil 360.

## Criterios de detención y rollback

Detener el proceso ante cualquier migración fallida, conteo diferente, DNI ausente, modelo distinto, respuesta duplicada o error de salud. No continuar con correcciones improvisadas.

Si se requiere rollback, suspender los servicios productivos, conservar evidencias y restaurar el respaldo completo con `pg_restore` bajo una autorización específica de PRODUCCIÓN. La restauración es destructiva y requiere una confirmación distinta de la autorización de despliegue.
