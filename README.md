# Mochelab 2.0

Monorepo para la nueva plataforma web de gestión de madurez, objetivos e iniciativas.

## Requisitos

- Node.js 24 LTS
- pnpm 11
- PostgreSQL (se usará Aiven)

## Inicio local

1. Copiar `.env.example` a `.env` y configurar `DATABASE_URL`.
2. Ejecutar `pnpm install`.
3. Validar el modelo con `pnpm db:validate`.
4. Iniciar API y web con `pnpm dev`.

La API queda en `http://localhost:3000` y la web en `http://localhost:5173`.

## Estructura

- `apps/api`: API REST NestJS y modelo Prisma.
- `apps/web`: aplicación React + Vite.
- `packages/shared`: contratos y validaciones compartidas.
- `database/seeds`: catálogos preparados desde el Excel legado.
- `database/staging`: lotes extraídos localmente; se ignoran en Git por contener datos.
- `docs`: decisiones y modelo relacional.

## Preparar un lote de migración

La extracción conserva todos los valores y no escribe en PostgreSQL:

```powershell
python scripts/extraer_lote_migracion.py "C:\ruta\Data Servicios.xlsx" --mode test
```

Para el corte definitivo se usará el mismo comando con `--mode final` y el
nuevo archivo generado al cerrar el sistema anterior. Ver
`docs/estrategia-migracion.md`.

## Ejecutar la migración

El importador trabaja sobre un lote de staging y, por defecto, solo genera un
reporte sin conectarse ni escribir en PostgreSQL:

```powershell
pnpm migration:import database/staging/test-e97d887c2518
```

La carga real se habilita de forma explícita. Se ejecuta dentro de una
transacción y se rechaza si la base ya contiene Personas, Asignaciones, OKR o
Portafolio:

```powershell
pnpm migration:import database/staging/test-e97d887c2518 --apply
```

`--allow-non-empty` queda reservado para una carga incremental controlada. El
resultado se registra en `ImportBatch`, las incidencias en `ImportIssue` y se
genera `import-report-apply.json` dentro del lote.

Después de la carga, la conciliación es de solo lectura y falla si cualquier
cantidad no coincide con el plan:

```powershell
pnpm migration:import database/staging/test-e97d887c2518 --verify
```

## Despliegue

El proyecto incluye un Blueprint gratuito de Render en `render.yaml`. La guía,
los límites del plan y el bloqueo previo de autenticación están documentados
en `docs/despliegue-gratuito.md`.
