# Entornos de Mochelab

## Regla predeterminada

- Toda solicitud, prueba, carga, migración o cambio de datos se ejecuta en **PRUEBAS** salvo que el usuario autorice explícitamente **PRODUCCIÓN**.
- No interpretar expresiones como `go`, `ok`, `continúa` o `implementa` como autorización para modificar producción.
- Antes de una escritura externa, indicar el entorno y la base objetivo.

## Mapeo de entornos

| Entorno | Rama | Web | API | Base de datos |
| --- | --- | --- | --- | --- |
| PRUEBAS | `develop` | `mochelab-web-dev` | `mochelab-api-dev` | `mochelab_dev` |
| PRODUCCIÓN | `main` | `mochelab-web` | `mochelab-api` | `mochelab_prod` |

## Operaciones productivas

Para modificar datos en `mochelab_prod` se requiere todo lo siguiente:

1. El usuario debe mencionar explícitamente que autoriza la ejecución en **PRODUCCIÓN**.
2. Verificar rama, servicio y nombre de base antes de ejecutar.
3. Generar o comprobar un respaldo antes de migraciones, cargas masivas o cambios destructivos.
4. Ejecutar primero el mismo procedimiento en `mochelab_dev` y revisar su resultado.
5. Usar las confirmaciones técnicas exigidas por los scripts; nunca desactivar ni eludir las guardas.

Los datos DUMMY o de visualización están prohibidos en producción, incluso con confirmación.

