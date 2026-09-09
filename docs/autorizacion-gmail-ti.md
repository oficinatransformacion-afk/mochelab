# Autorización Gmail API para Mochelab

Solicitar a TI habilitar Gmail API en un proyecto de Google Cloud corporativo y crear un cliente OAuth 2.0 de tipo aplicación web.

- Cuenta remitente: `oficinatransformacion@danper.com`
- Nombre visible: `Oficina Transformación`
- Alcance único: `https://www.googleapis.com/auth/gmail.send`
- URI de redirección local: `http://localhost:53682/oauth2/callback`
- No se solicita lectura, modificación ni eliminación de correos.

TI debe confirmar que la cuenta está activa, que puede autorizar aplicaciones OAuth internas y que el dominio permite enviar con ese remitente. El ID y secreto OAuth deben guardarse como secretos en Render y nunca subirse al repositorio.

Con las credenciales cargadas localmente, ejecutar `node scripts/authorize-gmail.mjs`, autorizar con la cuenta indicada y guardar el refresh token resultante como secreto `GOOGLE_GMAIL_REFRESH_TOKEN`. Mantener `GOOGLE_GMAIL_ENABLED=false` hasta completar una prueba controlada.

## Estado pendiente

El envío está bloqueado deliberadamente en `GmailService`, incluso si se modifica la variable de entorno. Para habilitarlo deben completarse y aprobarse estos cinco puntos:

1. TI crea o habilita el proyecto de Google Cloud.
2. Se habilita Gmail API.
3. Se crea el cliente OAuth.
4. `oficinatransformacion@danper.com` concede el permiso `gmail.send`.
5. Se aprueba y ejecuta un envío controlado.
