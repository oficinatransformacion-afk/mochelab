const PORTFOLIO_HEADERS = [
  'ID_INICIATIVA', 'ID_TEAM', 'EMPRESA', 'ANIO', 'CICLO', 'AREA_ENFOQUE', 'NIVEL', 'PROGRAMA',
  'OBJETIVO', 'RESULTADO_CLAVE', 'TIPO_INICIATIVA', 'TALLA', 'INICIATIVA', 'RELEASE',
  'FECHA_INICIO_EJECUCION', 'FECHA_FIN_EJECUCION', 'PRIORIDAD', 'DUENO_PRODUCTO', 'ATF/GESTOR',
  'LIDER_TECNICO', 'TIPO_GESTION', 'ESTADO_INICIATIVA', 'HITO ACOMPAÑAMIENTO', 'ESCALAMIENTO',
  'HORIZONTE_RETORNO', 'TI_CAPACITY', 'CATEGORIA', 'IMPACTO', 'DESCRIPCION_IMPACTO',
  'BENEFICIO_ECONOMICO_PROYECTADO', 'BENEFICIO_ECONOMICO_EJECUTADO',
  'BENEFICIO_MITIGACION_PROYECTADO', 'BENEFICIO_MITIGACION_EJECUTADO', 'BENEFICIO_POTENCIAL_ANUAL',
  'OBSERVACIONES', 'LINK_DOCUMENTACION', 'FECHA_CREACION', 'ID_OKR'
];

function sincronizarPortafolio() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Ya existe una sincronización de Portafolio en ejecución.');
  const startedAt = new Date();
  try {
    const config = portfolioConfig_();
    if (!config.enabled) throw new Error('PORTFOLIO_SYNC_ENABLED está desactivado.');
    const response = UrlFetchApp.fetch(config.url, {
      method: 'get',
      headers: { 'X-Mochelab-Integration-Key': config.secret },
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) {
      throw new Error('Mochelab respondió HTTP ' + response.getResponseCode() + ': ' + response.getContentText().slice(0, 500));
    }
    const payload = JSON.parse(response.getContentText());
    validarPayloadPortafolio_(payload);
    const values = [PORTFOLIO_HEADERS].concat(payload.rows);
    const spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    const temporary = obtenerHoja_(spreadsheet, 'Portafolio_TMP');
    prepararHoja_(temporary, values.length, PORTFOLIO_HEADERS.length);
    temporary.getRange(1, 1, temporary.getMaxRows(), PORTFOLIO_HEADERS.length).clearContent();
    temporary.getRange(1, 1, values.length, PORTFOLIO_HEADERS.length).setValues(values);
    verificarHoja_(temporary, values.length);

    if (config.promoteEnabled) {
      const portfolio = spreadsheet.getSheetByName('Portafolio');
      if (!portfolio) throw new Error('No existe la hoja Portafolio.');
      prepararHoja_(portfolio, values.length, PORTFOLIO_HEADERS.length);
      portfolio.getRange(1, 1, portfolio.getMaxRows(), PORTFOLIO_HEADERS.length).clearContent();
      portfolio.getRange(1, 1, values.length, PORTFOLIO_HEADERS.length).setValues(values);
      verificarHoja_(portfolio, values.length);
      temporary.getRange(1, 1, temporary.getMaxRows(), PORTFOLIO_HEADERS.length).clearContent();
    }

    registrarResultadoPortafolio_({
      fecha: new Date().toISOString(),
      duracionMs: new Date().getTime() - startedAt.getTime(),
      cantidad: payload.rows.length,
      promovido: config.promoteEnabled,
      resultado: 'OK'
    });
  } catch (error) {
    registrarResultadoPortafolio_({
      fecha: new Date().toISOString(),
      duracionMs: new Date().getTime() - startedAt.getTime(),
      cantidad: 0,
      promovido: false,
      resultado: 'ERROR',
      detalle: String(error && error.message ? error.message : error).slice(0, 1000)
    });
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function instalarActivadorDiarioPortafolio() {
  const config = portfolioConfig_();
  desinstalarActivadorPortafolio();
  ScriptApp.newTrigger('sincronizarPortafolio')
    .timeBased()
    .atHour(config.hour)
    .everyDays(1)
    .inTimezone(config.timeZone)
    .create();
}

function desinstalarActivadorPortafolio() {
  ScriptApp.getProjectTriggers()
    .filter(function(trigger) { return trigger.getHandlerFunction() === 'sincronizarPortafolio'; })
    .forEach(function(trigger) { ScriptApp.deleteTrigger(trigger); });
}

function desinstalarSincronizacionPortafolio() {
  desinstalarActivadorPortafolio();
  PropertiesService.getScriptProperties().setProperty('PORTFOLIO_SYNC_ENABLED', 'false');
}

function portfolioConfig_() {
  const properties = PropertiesService.getScriptProperties();
  const required = ['MOCHELAB_PORTFOLIO_URL', 'MOCHELAB_PORTFOLIO_SECRET', 'PORTFOLIO_SPREADSHEET_ID'];
  const missing = required.filter(function(key) { return !properties.getProperty(key); });
  if (missing.length) throw new Error('Faltan propiedades: ' + missing.join(', '));
  const hour = Number(properties.getProperty('PORTFOLIO_SYNC_HOUR') || '6');
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error('PORTFOLIO_SYNC_HOUR debe estar entre 0 y 23.');
  return {
    enabled: properties.getProperty('PORTFOLIO_SYNC_ENABLED') === 'true',
    promoteEnabled: properties.getProperty('PORTFOLIO_SYNC_PROMOTE_ENABLED') === 'true',
    url: properties.getProperty('MOCHELAB_PORTFOLIO_URL'),
    secret: properties.getProperty('MOCHELAB_PORTFOLIO_SECRET'),
    spreadsheetId: properties.getProperty('PORTFOLIO_SPREADSHEET_ID'),
    hour: hour,
    timeZone: properties.getProperty('PORTFOLIO_SYNC_TIME_ZONE') || 'America/Lima'
  };
}

function validarPayloadPortafolio_(payload) {
  if (!payload || !Array.isArray(payload.headers) || !Array.isArray(payload.rows)) throw new Error('Respuesta de Mochelab inválida.');
  if (payload.headers.length !== 38 || JSON.stringify(payload.headers) !== JSON.stringify(PORTFOLIO_HEADERS)) {
    throw new Error('Los encabezados no coinciden con las 38 columnas de Portafolio.');
  }
  const ids = {};
  payload.rows.forEach(function(row, index) {
    if (!Array.isArray(row) || row.length !== 38) throw new Error('La fila ' + (index + 2) + ' no contiene 38 columnas.');
    const id = String(row[0] === null || row[0] === undefined ? '' : row[0]).trim();
    if (!id) throw new Error('La fila ' + (index + 2) + ' no contiene ID_INICIATIVA.');
    if (ids[id]) throw new Error('ID_INICIATIVA duplicado: ' + id);
    ids[id] = true;
  });
}

function obtenerHoja_(spreadsheet, name) {
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function prepararHoja_(sheet, requiredRows, requiredColumns) {
  if (sheet.getMaxRows() < requiredRows) sheet.insertRowsAfter(sheet.getMaxRows(), requiredRows - sheet.getMaxRows());
  if (sheet.getMaxColumns() < requiredColumns) sheet.insertColumnsAfter(sheet.getMaxColumns(), requiredColumns - sheet.getMaxColumns());
  sheet.setFrozenRows(1);
}

function verificarHoja_(sheet, expectedRows) {
  const headers = sheet.getRange(1, 1, 1, PORTFOLIO_HEADERS.length).getValues()[0];
  if (JSON.stringify(headers) !== JSON.stringify(PORTFOLIO_HEADERS)) throw new Error('La verificación de encabezados falló en ' + sheet.getName() + '.');
  if (sheet.getLastRow() !== expectedRows) throw new Error('Cantidad inesperada en ' + sheet.getName() + ': ' + sheet.getLastRow() + '.');
  const ids = sheet.getRange(2, 1, expectedRows - 1, 1).getValues().map(function(row) { return String(row[0]); });
  if (new Set(ids).size !== ids.length) throw new Error('La verificación detectó ID_INICIATIVA duplicados en ' + sheet.getName() + '.');
}

function registrarResultadoPortafolio_(result) {
  const value = JSON.stringify(result);
  PropertiesService.getScriptProperties().setProperty('PORTFOLIO_SYNC_LAST_RESULT', value);
  console.log(value);
}
