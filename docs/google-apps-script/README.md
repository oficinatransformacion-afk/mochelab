# Relay temporal de correo con Google Apps Script

Esta integración conserva la cola de Mochelab y permite que una cuenta corporativa envíe los pendientes sin configurar todavía Gmail API/OAuth en el backend.

## Preparación en Google

1. Crear una hoja de cálculo corporativa para el registro de envíos.
2. Abrir Extensiones → Apps Script y copiar `MochelabEmailRelay.gs`.
3. En Propiedades del script agregar:
   - `SHARED_SECRET`: valor aleatorio de al menos 32 caracteres.
   - `SPREADSHEET_ID`: identificador de la hoja creada.
4. Ejecutar una función desde el editor para autorizar Gmail y Sheets con la cuenta remitente.
5. Implementar como Aplicación web:
   - Ejecutar como: propietario del script.
   - Acceso: el nivel permitido por la política corporativa que sea compatible con llamadas desde Render.
6. Copiar la URL terminada en `/exec`.

## Configuración de Mochelab

Mantener primero `APPS_SCRIPT_EMAIL_ENABLED=false`. Configurar en el entorno:

- `APPS_SCRIPT_EMAIL_WEB_APP_URL`: URL `/exec` de la aplicación web.
- `APPS_SCRIPT_EMAIL_SECRET`: el mismo `SHARED_SECRET`.
- `APPS_SCRIPT_EMAIL_SENDER_NAME`: nombre visible del remitente.

Después de enviar un correo de prueba controlado, cambiar `APPS_SCRIPT_EMAIL_ENABLED=true`.

## Seguridad y operación

- No incluir el secreto en el código, la hoja ni el repositorio.
- La hoja `Envios` funciona como control contra duplicados mediante `dedupeKey`.
- Mochelab procesa como máximo 50 comunicaciones por ejecución.
- Si el relay está deshabilitado o incompleto, las comunicaciones permanecen en `PENDIENTE` y no se envía nada.
- Esta solución es temporal; la integración definitiva continúa siendo Gmail API con OAuth corporativo.
