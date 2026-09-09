import http from "node:http";
import {URL} from "node:url";

const clientId=process.env.GOOGLE_GMAIL_CLIENT_ID;
const clientSecret=process.env.GOOGLE_GMAIL_CLIENT_SECRET;
const redirectUri="http://localhost:53682/oauth2/callback";
if(!clientId||!clientSecret){console.error("Configura GOOGLE_GMAIL_CLIENT_ID y GOOGLE_GMAIL_CLIENT_SECRET antes de continuar.");process.exit(1)}
const state=crypto.randomUUID();
const authorization=new URL("https://accounts.google.com/o/oauth2/v2/auth");
authorization.search=new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:"code",scope:"https://www.googleapis.com/auth/gmail.send",access_type:"offline",prompt:"consent",state}).toString();
console.log(`Abre esta URL e inicia sesión exclusivamente con oficinatransformacion@danper.com:\n\n${authorization}\n`);
const server=http.createServer(async(req,res)=>{const url=new URL(req.url??"/",redirectUri);if(url.pathname!=="/oauth2/callback")return res.end("Ruta inválida");if(url.searchParams.get("state")!==state){res.statusCode=400;return res.end("Estado OAuth inválido")};const code=url.searchParams.get("code");if(!code){res.statusCode=400;return res.end("Google no entregó el código")};const tokenResponse=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,code,grant_type:"authorization_code",redirect_uri:redirectUri})});const token=await tokenResponse.json();if(!tokenResponse.ok||!token.refresh_token){res.statusCode=400;console.error(token);return res.end("No se obtuvo refresh token. Revisa la consola.")};console.log("\nCopia este valor como GOOGLE_GMAIL_REFRESH_TOKEN en Render (no lo compartas):\n");console.log(token.refresh_token);res.end("Autorización completada. Puedes cerrar esta ventana.");server.close()});
server.listen(53682,"127.0.0.1",()=>console.log("Esperando autorización en http://localhost:53682..."));
