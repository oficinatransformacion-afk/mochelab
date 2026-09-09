# Despliegue gratuito

La configuración `render.yaml` prepara cuatro recursos gratuitos en Render:

- `mochelab-api-dev` y `mochelab-web-dev`, desplegados desde `develop`.
- `mochelab-api` y `mochelab-web`, desplegados desde `main`.

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
   - `DATABASE_URL` de Dev: conexión a la base `mochelab_dev`.
   - `DATABASE_URL` de Producción: conexión a la base `mochelab_prod`.
   - `AUTH_SESSION_SECRET`: Render la genera automáticamente desde el Blueprint.
   - `GOOGLE_FORMS_INTEGRATION_KEY`: Render la genera automáticamente; debe
     copiarse posteriormente en las propiedades seguras de Apps Script.
5. El arranque de la API ejecuta `prisma migrate deploy` de forma idempotente.
6. Validar primero Dev: API, migraciones, login, permisos y módulos críticos.
7. Promover el commit validado de `develop` a `main` para publicar Producción.
8. Crear o migrar las cuentas con contraseña antes de entregar acceso.

## Límites aceptados del plan gratuito

El backend puede apagarse tras un periodo sin tráfico y tardar cerca de un
minuto en responder al primer acceso. Esto es aceptable para pruebas, no para
una operación productiva con disponibilidad garantizada.

No se incluye una base de datos gratuita de Render: su instancia gratuita
expira. Se conservará Aiven únicamente cuando el servicio esté confirmado en
su modalidad gratuita permanente.
