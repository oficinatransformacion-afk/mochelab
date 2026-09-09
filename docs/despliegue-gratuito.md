# Despliegue gratuito

La configuración `render.yaml` prepara dos recursos gratuitos en Render:

- `mochelab-api`: servicio web Node.js en plan `free`.
- `mochelab-web`: sitio estático React.

La base de datos permanece en Aiven. Antes del despliegue definitivo, el
servicio PostgreSQL debe estar expresamente en el plan gratuito y no en un
plan de prueba con renovación pagada.

## Autenticación habilitada

La publicación utiliza temporalmente autenticación local mediante usuario y
contraseña. En producción la API exige una sesión firmada y no acepta los
encabezados de demostración. La autenticación corporativa de Google Workspace
podrá incorporarse posteriormente sin reemplazar las cuentas locales.

## Publicación

1. Subir el repositorio a un proveedor Git conectado con Render.
2. En Render, crear un Blueprint usando el `render.yaml` de la raíz.
3. Mantener `mochelab-api` en el plan **Free**.
4. Completar las variables que Render solicita, sin guardarlas en Git:
   - `DATABASE_URL`: URI privada de conexión a Aiven.
   - `CORS_ORIGIN`: URL pública exacta de `mochelab-web`, sin `/` final.
   - `VITE_API_URL`: URL pública exacta de `mochelab-api`, sin `/` final.
   - `AUTH_SESSION_SECRET`: Render la genera automáticamente desde el Blueprint.
   - `GOOGLE_FORMS_INTEGRATION_KEY`: Render la genera automáticamente; debe
     copiarse posteriormente en las propiedades seguras de Apps Script.
5. El arranque de la API ejecuta `prisma migrate deploy` de forma idempotente.
6. Desplegar primero la API, comprobar `/api/health` y después desplegar la web.
7. Crear o migrar las cuentas con contraseña antes de entregar acceso.

## Límites aceptados del plan gratuito

El backend puede apagarse tras un periodo sin tráfico y tardar cerca de un
minuto en responder al primer acceso. Esto es aceptable para pruebas, no para
una operación productiva con disponibilidad garantizada.

No se incluye una base de datos gratuita de Render: su instancia gratuita
expira. Se conservará Aiven únicamente cuando el servicio esté confirmado en
su modalidad gratuita permanente.
