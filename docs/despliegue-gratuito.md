# Despliegue gratuito

La configuración `render.yaml` prepara dos recursos gratuitos en Render:

- `mochelab-api`: servicio web Node.js en plan `free`.
- `mochelab-web`: sitio estático React.

La base de datos permanece en Aiven. Antes del despliegue definitivo, el
servicio PostgreSQL debe estar expresamente en el plan gratuito y no en un
plan de prueba con renovación pagada.

## Bloqueo previo obligatorio

No se debe exponer esta versión en Internet hasta terminar la autenticación
corporativa. La API actualmente rechaza los accesos cuando
`NODE_ENV=production`; es una protección deliberada para impedir que los
perfiles de demostración se conviertan en una puerta de acceso pública.

## Publicación después de configurar la autenticación

1. Subir el repositorio a un proveedor Git conectado con Render.
2. En Render, crear un Blueprint usando el `render.yaml` de la raíz.
3. Mantener `mochelab-api` en el plan **Free**.
4. Completar las variables que Render solicita, sin guardarlas en Git:
   - `DATABASE_URL`: URI privada de conexión a Aiven.
   - `CORS_ORIGIN`: URL pública exacta de `mochelab-web`, sin `/` final.
   - `VITE_API_URL`: URL pública exacta de `mochelab-api`, sin `/` final.
5. Agregar en Render las variables de autenticación corporativa que se
   definan en el punto de seguridad.
6. Desplegar primero la API, comprobar `/api/health` y después desplegar la web.

## Límites aceptados del plan gratuito

El backend puede apagarse tras un periodo sin tráfico y tardar cerca de un
minuto en responder al primer acceso. Esto es aceptable para pruebas, no para
una operación productiva con disponibilidad garantizada.

No se incluye una base de datos gratuita de Render: su instancia gratuita
expira. Se conservará Aiven únicamente cuando el servicio esté confirmado en
su modalidad gratuita permanente.
