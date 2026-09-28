# Sincronización temporal de Portafolio

El proceso consulta el endpoint de solo lectura de Mochelab y actualiza Google Sheets mediante `Portafolio_TMP`. Está desactivado por defecto y no requiere migraciones de base de datos.

## Propiedades de Apps Script

Configurar en **Configuración del proyecto > Propiedades del script**:

| Propiedad | Valor inicial |
| --- | --- |
| `MOCHELAB_PORTFOLIO_URL` | URL del endpoint `/api/integrations/portfolio/export` |
| `MOCHELAB_PORTFOLIO_SECRET` | El mismo valor de `PORTFOLIO_EXPORT_SECRET` |
| `PORTFOLIO_SPREADSHEET_ID` | `1z9HAb2FdnKtXEUGOUXC7Pw921i5BdUUH-sO40Tdo_pA` |
| `PORTFOLIO_SYNC_ENABLED` | `false` durante la configuración; `true` para ejecutar |
| `PORTFOLIO_SYNC_PROMOTE_ENABLED` | `false` para probar solo `Portafolio_TMP`; `true` para actualizar `Portafolio` |
| `PORTFOLIO_SYNC_HOUR` | `6` |
| `PORTFOLIO_SYNC_TIME_ZONE` | `America/Lima` |

## API

Configurar en la API:

```env
PORTFOLIO_EXPORT_ENABLED=false
PORTFOLIO_EXPORT_SECRET=un-secreto-temporal-de-al-menos-32-caracteres
```

## Orden de habilitación

1. Copiar `MochelabPortfolioSync.gs` al proyecto de Apps Script.
2. Configurar las propiedades con ambos interruptores en `false`.
3. Habilitar `PORTFOLIO_EXPORT_ENABLED=true` en la API del entorno correspondiente.
4. Activar `PORTFOLIO_SYNC_ENABLED=true` y ejecutar `sincronizarPortafolio()` manualmente.
5. Comparar `Portafolio_TMP` con `Portafolio`.
6. Establecer `PORTFOLIO_SYNC_PROMOTE_ENABLED=true` únicamente cuando se autorice el reemplazo diario.
7. Ejecutar `instalarActivadorDiarioPortafolio()` una vez.

## Retiro

1. Ejecutar `desinstalarSincronizacionPortafolio()`.
2. Establecer `PORTFOLIO_EXPORT_ENABLED=false` en la API.
3. Eliminar ambos secretos.
4. Retirar el endpoint y este archivo en un despliegue posterior.
