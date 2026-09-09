# Integración de resultados de Google Forms

Cada formulario calificado debe tener activada la recopilación de correos. El código del curso es el valor único de `Curso.sourceId` en Mochelab, por ejemplo `CURSO-001`; no se utiliza el UUID interno de la base de datos.

## API de Mochelab

`POST /api/integrations/google-forms/course-result`

Encabezado requerido:

```text
X-Mochelab-Integration-Key: <GOOGLE_FORMS_INTEGRATION_KEY>
Content-Type: application/json
```

Cuerpo:

```json
{
  "email": "persona@danper.com",
  "courseCode": "CURSO-001",
  "score": 20,
  "completedAt": "2026-09-07T14:30:00-05:00"
}
```

La API busca a la persona activa por correo, resuelve internamente su DNI y actualiza **todos** los registros de `PersonaCurso` de sus roles activos que correspondan al código del curso. La nota siempre se guarda y el estado siempre se actualiza a `TERMINADO`, incluso con una nota baja. También registra la fecha de finalización y una auditoría por cada curso actualizado.

## Apps Script por formulario

1. Abra el formulario en Google Forms y active **Recopilar direcciones de correo electrónico**.
2. En Extensiones → Apps Script, agregue este código.
3. En Configuración del proyecto → Propiedades de secuencia de comandos, cree `MOCHELAB_API_URL` y `MOCHELAB_INTEGRATION_KEY`.
4. Reemplace el código del curso por el `sourceId` configurado en Mochelab.
5. Cree un trigger instalable: función `onCourseFormSubmit`, origen **From form**, evento **On form submit**.

```javascript
const COURSE_CODE = 'CURSO-001';

function onCourseFormSubmit(event) {
  const response = event.response;
  const email = response.getRespondentEmail();
  const score = response.getScore();
  const completedAt = response.getTimestamp();

  if (!email) {
    throw new Error('El formulario no recibió correo del participante. Activa la recopilación de correos.');
  }
  if (score === null) {
    throw new Error('El formulario no tiene una nota calculada. Debe ser un cuestionario calificado.');
  }

  const properties = PropertiesService.getScriptProperties();
  const apiUrl = properties.getProperty('MOCHELAB_API_URL');
  const integrationKey = properties.getProperty('MOCHELAB_INTEGRATION_KEY');
  if (!apiUrl || !integrationKey) throw new Error('Falta configurar la URL o clave de integración.');

  const result = UrlFetchApp.fetch(`${apiUrl}/api/integrations/google-forms/course-result`, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Mochelab-Integration-Key': integrationKey },
    payload: JSON.stringify({
      email,
      courseCode: COURSE_CODE,
      score,
      completedAt: completedAt.toISOString()
    }),
    muteHttpExceptions: true
  });

  if (result.getResponseCode() < 200 || result.getResponseCode() >= 300) {
    throw new Error(`Mochelab respondió ${result.getResponseCode()}: ${result.getContentText()}`);
  }
}
```

## Respuesta exitosa

```json
{
  "personDni": "12345678",
  "personName": "Nombre de la persona",
  "courseCode": "CURSO-001",
  "courseName": "Nombre del curso",
  "score": 20,
  "status": "TERMINADO",
  "completedAt": "2026-09-07",
  "updatedRecords": 2
}
```

`updatedRecords` puede ser mayor a uno: ocurre cuando la persona posee el mismo curso en varios roles activos.
