/**
 * Relay temporal de correo para Mochelab.
 * Propiedades requeridas del script:
 * - SHARED_SECRET: secreto compartido con Mochelab.
 * - SPREADSHEET_ID: hoja usada como registro idempotente de envíos.
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const input = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const properties = PropertiesService.getScriptProperties();
    if (!input.secret || input.secret !== properties.getProperty("SHARED_SECRET")) {
      return jsonResponse({ ok: false, error: "No autorizado" });
    }
    if (!input.dedupeKey || !input.to || !input.subject || !input.text) {
      return jsonResponse({ ok: false, error: "Solicitud incompleta" });
    }

    const spreadsheet = SpreadsheetApp.openById(properties.getProperty("SPREADSHEET_ID"));
    const sheet = spreadsheet.getSheetByName("Envios") || createLogSheet(spreadsheet);
    const duplicate = sheet.getRange("B:B").createTextFinder(input.dedupeKey).matchEntireCell(true).findNext();
    if (duplicate) return jsonResponse({ ok: true, duplicate: true });

    GmailApp.sendEmail(input.to, input.subject, input.text, {
      name: input.senderName || "Oficina Transformación",
    });
    sheet.appendRow([new Date(), input.dedupeKey, input.communicationId || "", input.to, input.subject, "ENVIADA"]);
    return jsonResponse({ ok: true, duplicate: false });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error && error.message ? error.message : error) });
  } finally {
    lock.releaseLock();
  }
}

function createLogSheet(spreadsheet) {
  const sheet = spreadsheet.insertSheet("Envios");
  sheet.appendRow(["Fecha", "DedupeKey", "CommunicationId", "Destinatario", "Asunto", "Estado"]);
  sheet.setFrozenRows(1);
  return sheet;
}

function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
