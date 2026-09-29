/**
 * Integración resiliente Google Forms/Sheets -> Mochelab PRODUCCIÓN.
 *
 * Activadores instalables:
 * 1. enviarResultadoCursoAMochelab
 *    Desde una hoja de cálculo -> Al enviar formulario
 * Los reintentos crean un activador temporal solo cuando existe una falla.
 *
 * Propiedad requerida:
 *   MOCHELAB_INTEGRATION_KEY=clave productiva de al menos 32 caracteres
 */

const MOCHELAB_PRODUCTION_API_URL = 'https://mochelab-api.onrender.com';

const MOCHELAB_COURSE_FORM = Object.freeze({
  courseCode: '1',
  emailHeader: 'Dirección de correo electrónico',
  scoreHeader: 'Puntuación',
  formMaximumScore: 20,
  queueSheetName: 'Mochelab_Queue',
  maximumAttempts: 5,
  retryIntervalMinutes: 15,
});

const MOCHELAB_QUEUE_HEADERS = Object.freeze([
  'SUBMISSION_ID', 'RESPONSE_SHEET', 'RESPONSE_ROW', 'EMAIL', 'COURSE_CODE',
  'SCORE_20', 'COMPLETED_AT', 'STATUS', 'ATTEMPTS', 'NEXT_ATTEMPT_AT',
  'LAST_ERROR', 'SENT_AT', 'API_RESPONSE', 'UPDATED_AT',
]);

const QUEUE = Object.freeze({
  SUBMISSION_ID: 1, RESPONSE_SHEET: 2, RESPONSE_ROW: 3, EMAIL: 4,
  COURSE_CODE: 5, SCORE: 6, COMPLETED_AT: 7, STATUS: 8, ATTEMPTS: 9,
  NEXT_ATTEMPT_AT: 10, LAST_ERROR: 11, SENT_AT: 12, API_RESPONSE: 13,
  UPDATED_AT: 14,
});

function enviarResultadoCursoAMochelab(event) {
  if (!event || !event.namedValues || !event.range) {
    throw new Error('Esta función solo debe ejecutarse mediante el activador de envío de la hoja.');
  }

  const responseSheet = event.range.getSheet();
  const responseRow = event.range.getRow();
  const submissionId = `${event.source.getId()}:${responseSheet.getSheetId()}:${responseRow}`;
  const email = readNamedValue_(event.namedValues, MOCHELAB_COURSE_FORM.emailHeader)
    .trim().toLowerCase();
  if (!email) throw new Error(`No se encontró el correo en "${MOCHELAB_COURSE_FORM.emailHeader}".`);

  const rawScore = readNamedValue_(event.namedValues, MOCHELAB_COURSE_FORM.scoreHeader);
  const score = normalizeScore_(rawScore, MOCHELAB_COURSE_FORM.formMaximumScore);
  const completedAt = parseSheetTimestamp_(responseSheet.getRange(responseRow, 1).getValue());
  const queueRow = enqueueSubmission_({
    submissionId,
    responseSheet: responseSheet.getName(),
    responseRow,
    email,
    courseCode: MOCHELAB_COURSE_FORM.courseCode,
    score,
    completedAt,
  });

  // Si Render está dormido, la fila queda en cola para el activador temporal.
  processQueueRow_(queueRow);
}

function reintentarPendientesMochelab() {
  removeRetryTriggers_();
  const queue = getQueueSheet_();
  const lastRow = queue.getLastRow();
  if (lastRow < 2) return;

  const now = new Date();
  const rows = queue.getRange(2, 1, lastRow - 1, MOCHELAB_QUEUE_HEADERS.length).getValues();
  rows.forEach((values, index) => {
    const status = String(values[QUEUE.STATUS - 1] || '');
    const attempts = Number(values[QUEUE.ATTEMPTS - 1] || 0);
    const nextAttempt = asDate_(values[QUEUE.NEXT_ATTEMPT_AT - 1]);
    const retryable = status === 'PENDIENTE'
      || status === 'ERROR_REINTENTABLE'
      || (status === 'PROCESANDO' && nextAttempt && nextAttempt <= now);
    if (retryable && attempts < MOCHELAB_COURSE_FORM.maximumAttempts && (!nextAttempt || nextAttempt <= now)) {
      processQueueRow_(index + 2);
    }
  });
  if (hasRetryableQueueRows_()) scheduleRetry_();
}

function desinstalarReintentosMochelab() {
  removeRetryTriggers_();
}

function removeRetryTriggers_() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === 'reintentarPendientesMochelab')
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
}

function scheduleRetry_() {
  const exists = ScriptApp.getProjectTriggers()
    .some((trigger) => trigger.getHandlerFunction() === 'reintentarPendientesMochelab');
  if (!exists) {
    ScriptApp.newTrigger('reintentarPendientesMochelab')
      .timeBased()
      .after(MOCHELAB_COURSE_FORM.retryIntervalMinutes * 60000)
      .create();
  }
}

function enqueueSubmission_(submission) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const queue = getQueueSheet_();
    const existingRow = findSubmissionRow_(queue, submission.submissionId);
    if (existingRow) return existingRow;
    const now = new Date();
    queue.appendRow([
      submission.submissionId, submission.responseSheet, submission.responseRow,
      submission.email, submission.courseCode, submission.score, submission.completedAt,
      'PENDIENTE', 0, now, '', '', '', now,
    ]);
    return queue.getLastRow();
  } finally {
    lock.releaseLock();
  }
}

function processQueueRow_(rowNumber) {
  const claimed = claimQueueRow_(rowNumber);
  if (!claimed) return;

  try {
    const integrationKey = PropertiesService.getScriptProperties()
      .getProperty('MOCHELAB_INTEGRATION_KEY');
    if (!integrationKey) throw permanentError_('Falta configurar MOCHELAB_INTEGRATION_KEY.');

    const response = UrlFetchApp.fetch(
      `${MOCHELAB_PRODUCTION_API_URL}/api/integrations/google-forms/course-result`,
      {
        method: 'post',
        contentType: 'application/json',
        headers: { 'X-Mochelab-Integration-Key': integrationKey },
        payload: JSON.stringify({
          submissionId: claimed.submissionId,
          email: claimed.email,
          courseCode: claimed.courseCode,
          score: claimed.score,
          completedAt: claimed.completedAt.toISOString(),
        }),
        muteHttpExceptions: true,
      },
    );

    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();
    if (statusCode < 200 || statusCode >= 300) {
      const error = new Error(`HTTP ${statusCode}: ${responseText}`);
      error.retryable = statusCode === 408 || statusCode === 425
        || statusCode === 429 || statusCode >= 500;
      throw error;
    }

    finishQueueRow_(rowNumber, {
      status: 'ENVIADO', nextAttemptAt: '', lastError: '', sentAt: new Date(),
      apiResponse: responseText,
    });
  } catch (error) {
    const retryable = !error || error.retryable !== false;
    const exhausted = claimed.attempts >= MOCHELAB_COURSE_FORM.maximumAttempts;
    finishQueueRow_(rowNumber, {
      status: retryable && !exhausted ? 'ERROR_REINTENTABLE' : 'ERROR_DEFINITIVO',
      nextAttemptAt: retryable && !exhausted ? nextRetryAt_(claimed.attempts) : '',
      lastError: error && error.message ? error.message : String(error),
      sentAt: '', apiResponse: '',
    });
    if (retryable && !exhausted) scheduleRetry_();
  }
}

function claimQueueRow_(rowNumber) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return null;
  try {
    const queue = getQueueSheet_();
    const values = queue.getRange(rowNumber, 1, 1, MOCHELAB_QUEUE_HEADERS.length).getValues()[0];
    const status = String(values[QUEUE.STATUS - 1] || '');
    const attempts = Number(values[QUEUE.ATTEMPTS - 1] || 0);
    const nextAttempt = asDate_(values[QUEUE.NEXT_ATTEMPT_AT - 1]);
    if (status === 'ENVIADO' || status === 'ERROR_DEFINITIVO') return null;
    if (status === 'PROCESANDO' && nextAttempt && nextAttempt > new Date()) return null;
    if (attempts >= MOCHELAB_COURSE_FORM.maximumAttempts) return null;

    const claimedAttempts = attempts + 1;
    queue.getRange(rowNumber, QUEUE.STATUS, 1, 3).setValues([[
      'PROCESANDO', claimedAttempts,
      new Date(Date.now() + MOCHELAB_COURSE_FORM.retryIntervalMinutes * 60000),
    ]]);
    queue.getRange(rowNumber, QUEUE.UPDATED_AT).setValue(new Date());
    return {
      submissionId: String(values[QUEUE.SUBMISSION_ID - 1]),
      email: String(values[QUEUE.EMAIL - 1]),
      courseCode: String(values[QUEUE.COURSE_CODE - 1]),
      score: Number(values[QUEUE.SCORE - 1]),
      completedAt: parseSheetTimestamp_(values[QUEUE.COMPLETED_AT - 1]),
      attempts: claimedAttempts,
    };
  } finally {
    lock.releaseLock();
  }
}

function finishQueueRow_(rowNumber, result) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const queue = getQueueSheet_();
    queue.getRange(rowNumber, QUEUE.STATUS).setValue(result.status);
    queue.getRange(rowNumber, QUEUE.NEXT_ATTEMPT_AT, 1, 5).setValues([[
      result.nextAttemptAt, result.lastError, result.sentAt, result.apiResponse, new Date(),
    ]]);
  } finally {
    lock.releaseLock();
  }
}

function getQueueSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let queue = spreadsheet.getSheetByName(MOCHELAB_COURSE_FORM.queueSheetName);
  if (!queue) {
    queue = spreadsheet.insertSheet(MOCHELAB_COURSE_FORM.queueSheetName);
    queue.getRange(1, 1, 1, MOCHELAB_QUEUE_HEADERS.length).setValues([MOCHELAB_QUEUE_HEADERS]);
    queue.setFrozenRows(1);
  }
  return queue;
}

function findSubmissionRow_(queue, submissionId) {
  const lastRow = queue.getLastRow();
  if (lastRow < 2) return null;
  const match = queue.getRange(2, QUEUE.SUBMISSION_ID, lastRow - 1, 1)
    .createTextFinder(submissionId).matchEntireCell(true).findNext();
  return match ? match.getRow() : null;
}

function hasRetryableQueueRows_() {
  const queue = getQueueSheet_();
  const lastRow = queue.getLastRow();
  if (lastRow < 2) return false;
  const rows = queue.getRange(2, QUEUE.STATUS, lastRow - 1, 2).getValues();
  return rows.some(([status, attempts]) =>
    ['PENDIENTE', 'ERROR_REINTENTABLE', 'PROCESANDO'].includes(String(status))
      && Number(attempts || 0) < MOCHELAB_COURSE_FORM.maximumAttempts,
  );
}

function readNamedValue_(namedValues, header) {
  const value = namedValues[header];
  return value && value.length ? String(value[0] == null ? '' : value[0]) : '';
}

function normalizeScore_(rawScore, maximumScore) {
  const match = String(rawScore).replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  if (!match) throw new Error(`No se pudo interpretar la nota: "${rawScore}".`);
  const score = Number(match[0]);
  const maximum = Number(maximumScore);
  if (!Number.isFinite(score) || !Number.isFinite(maximum) || maximum <= 0 || score < 0 || score > maximum) {
    throw new Error(`La nota debe estar en el rango 0-${maximum}.`);
  }
  return Math.round(((score / maximum) * 20) * 100) / 100;
}

function parseSheetTimestamp_(value) {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function asDate_(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function nextRetryAt_(attempts) {
  const multiplier = Math.pow(2, Math.max(0, attempts - 1));
  return new Date(Date.now() + MOCHELAB_COURSE_FORM.retryIntervalMinutes * multiplier * 60000);
}

function permanentError_(message) {
  const error = new Error(message);
  error.retryable = false;
  return error;
}
