INSERT INTO "communication_template" (
  "id", "code", "name", "subject_template", "body_template"
) VALUES (
  gen_random_uuid(),
  'COURSE_PENDING_REMINDER',
  'Recordatorio de cursos pendientes',
  '[Mochelab] Tienes {{pendingCourses}} cursos pendientes en la Academia',
  $template$<!doctype html><html lang="es"><body style="margin:0;padding:0;background:#f3f6f9;font-family:Arial,Helvetica,sans-serif;color:#172033"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden"><tr><td style="background:#351414;padding:24px 28px"><div style="font-size:12px;font-weight:700;letter-spacing:1.3px;color:#68e6f5">ACADEMIA MOCHELAB</div><div style="margin-top:8px;font-size:25px;line-height:32px;font-weight:700;color:#fff">Cursos pendientes de aprendizaje</div></td></tr><tr><td style="padding:28px"><p style="font-size:15px;line-height:24px">Hola <strong>{{personName}}</strong>,</p><p style="font-size:15px;line-height:24px;color:#475569">Tienes cursos pendientes en la Academia Mochelab.</p><div style="margin:22px 0;padding:18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px"><div style="font-size:12px;font-weight:700;color:#64748b">TU AVANCE ACADÉMICO</div><div style="margin-top:10px;font-size:20px;font-weight:700">{{completedCourses}} de {{totalCourses}} cursos completados ({{progressPercent}}%)</div><div style="margin-top:10px;font-size:13px;color:#64748b">Cursos pendientes: {{pendingCourses}}</div></div><div>{{pendingCoursesHtml}}</div><p style="margin:28px 0 0;font-size:13px;line-height:20px;color:#475569">Atentamente,<br><strong>Oficina de Transformación</strong></p></td></tr><tr><td style="padding:17px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;line-height:18px;color:#64748b">Este es un mensaje automático generado por Mochelab. Por favor, no respondas a este correo.</td></tr></table></td></tr></table></body></html>$template$
)
ON CONFLICT ("code") DO NOTHING;

CREATE INDEX "communication_event_status_sent_at_idx"
ON "communication"("event_type", "status", "sent_at");
