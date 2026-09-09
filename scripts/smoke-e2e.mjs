const api = process.env.SMOKE_API_URL ?? "http://localhost:3000/api";
const web = process.env.SMOKE_WEB_URL ?? "http://127.0.0.1:5173";
const headers = {
  "x-mochelab-demo-profile": "ADMINISTRADOR",
  "x-mochelab-demo-user-email": process.env.SMOKE_ADMIN_EMAIL ?? "admin.prueba@example.invalid",
};

const checks = [
  ["salud", `${api}/health`, false],
  ["capacidades", `${api}/me/capabilities`, false],
  ["personas", `${api}/people`, true],
  ["equipos", `${api}/teams`, true],
  ["objetivos", `${api}/objectives`, true],
  ["portafolio", `${api}/initiatives`, true],
  ["metas", `${api}/targets`, true],
  ["historial de madurez", `${api}/maturity/admin/history`, false],
  ["auditoría", `${api}/audit/admin`, true],
  ["plantillas", `${api}/communications/templates`, true],
  ["calidad de datos", `${api}/data-quality`, false],
];

let failures = 0;
for (const [name, url, expectsArray] of checks) {
  try {
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    if (expectsArray && !Array.isArray(body)) throw new Error("respuesta no es una lista");
    const count = Array.isArray(body) ? ` (${body.length})` : "";
    console.log(`OK  ${name}${count}`);
  } catch (error) {
    failures += 1;
    console.error(`ERR ${name}: ${error.message}`);
  }
}

const userHeaders = {
  "x-mochelab-demo-profile": "USUARIO",
  "x-mochelab-demo-user-email": process.env.SMOKE_USER_EMAIL ?? "usuario.prueba@example.invalid",
};
for (const [name, url] of [
  ["auditoría protegida", `${api}/audit/admin`],
  ["plantillas protegidas", `${api}/communications/templates`],
  ["madurez administrativa protegida", `${api}/maturity/admin/periods`],
]) {
  try {
    const response = await fetch(url, { headers: userHeaders });
    if (response.status !== 403) throw new Error(`se esperaba HTTP 403 y respondió ${response.status}`);
    console.log(`OK  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`ERR ${name}: ${error.message}`);
  }
}

for (const route of ["/", "/personas", "/objetivos", "/portafolio", "/madurez/equipos", "/configuracion/auditoria", "/calidad-datos", "/configuracion/comunicaciones"]) {
  try {
    const response = await fetch(web + route);
    const html = await response.text();
    if (!response.ok || !html.includes('id="root"')) throw new Error(`HTTP ${response.status} o HTML inválido`);
    console.log(`OK  web ${route}`);
  } catch (error) {
    failures += 1;
    console.error(`ERR web ${route}: ${error.message}`);
  }
}

if (failures) {
  console.error(`\nSmoke E2E falló: ${failures} verificación(es).`);
  process.exitCode = 1;
} else {
  console.log(`\nSmoke E2E correcto: ${checks.length + 11} verificaciones.`);
}
