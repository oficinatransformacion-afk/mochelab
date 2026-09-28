UPDATE "communication_template"
SET
  "body_template" = $template$<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f3f6f9;font-family:Arial,Helvetica,sans-serif;color:#263244">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td align="center" style="padding:24px 12px">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
            <tr>
              <td style="background:#351414;padding:22px 24px">
                <div style="font-size:11px;line-height:16px;font-weight:800;letter-spacing:1.3px;color:#68e6f5">ACADEMIA MOCHELAB</div>
                <div style="margin-top:7px;font-size:24px;line-height:30px;font-weight:800;color:#ffffff">Cursos pendientes de aprendizaje</div>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 24px 22px">
                <p style="margin:0 0 16px;font-size:14px;line-height:22px;color:#334155">Hola <strong style="color:#263244">{{personName}}</strong>,</p>
                <p style="margin:0 0 18px;font-size:13px;line-height:20px;color:#334155">Tienes cursos pendientes en la Academia Mochelab. Completar estos cursos fortalece tus capacidades para contribuir a la transformación organizacional de DANPER.</p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
                  <tr>
                    <td style="padding:16px 16px 15px">
                      <div style="font-size:11px;line-height:16px;font-weight:800;color:#64748b">TU AVANCE ACADÉMICO</div>
                      <div style="margin-top:8px;font-size:20px;line-height:27px;font-weight:800;color:#263244">{{completedCourses}} de {{totalCourses}} cursos completados ({{progressPercent}}%)</div>
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:12px">
                        <tr>
                          <td style="height:7px;background:#e5e7eb;border-radius:999px;overflow:hidden">
                            <div style="width:{{progressPercent}}%;height:7px;background:#67e8f9;border-radius:999px"></div>
                          </td>
                        </tr>
                      </table>
                      <div style="margin-top:9px;font-size:11px;line-height:16px;color:#64748b">Cursos pendientes: {{pendingCourses}}</div>
                    </td>
                  </tr>
                </table>

                <div>{{pendingCoursesHtml}}</div>

                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px">
                  <tr>
                    <td bgcolor="#e31b23" style="border-radius:9px">
                      <a href="https://classroom.google.com" target="_blank" style="display:inline-block;padding:12px 18px;font-size:12px;line-height:16px;font-weight:800;color:#ffffff;text-decoration:none">Ingresar a Google Classroom</a>
                    </td>
                  </tr>
                </table>

                <p style="margin:0;font-size:11px;line-height:18px;color:#64748b">Gracias por seguir desarrollando tus capacidades. Cada aprendizaje contribuye a una organización más ágil, adaptable y preparada para generar valor sostenible.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:15px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:10px;line-height:17px;color:#64748b">Este es un mensaje automático generado por Mochelab. Por favor, no respondas a este correo.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>$template$,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'COURSE_PENDING_REMINDER';
