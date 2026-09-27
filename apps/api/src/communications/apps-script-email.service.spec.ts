import { afterEach, describe, expect, it, vi } from "vitest";
import { AppsScriptEmailService } from "./apps-script-email.service";

const keys=["APPS_SCRIPT_EMAIL_ENABLED","APPS_SCRIPT_EMAIL_WEB_APP_URL","APPS_SCRIPT_EMAIL_SECRET","APPS_SCRIPT_EMAIL_SENDER_NAME"];
afterEach(()=>{for(const key of keys)delete process.env[key];vi.restoreAllMocks()});

describe("AppsScriptEmailService",()=>{
  it("permanece en Solo cola cuando no hay configuración",()=>{
    const status=new AppsScriptEmailService().status();
    expect(status.mode).toBe("SOLO_COLA");
    expect(status.missing).toEqual(["APPS_SCRIPT_EMAIL_WEB_APP_URL","APPS_SCRIPT_EMAIL_SECRET"]);
  });

  it("envía un mensaje firmado al Web App configurado",async()=>{
    process.env.APPS_SCRIPT_EMAIL_ENABLED="true";
    process.env.APPS_SCRIPT_EMAIL_WEB_APP_URL="https://script.google.com/example";
    process.env.APPS_SCRIPT_EMAIL_SECRET="secreto-local";
    process.env.APPS_SCRIPT_EMAIL_SENDER_NAME="Mochelab";
    const fetchMock=vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response(JSON.stringify({ok:true}),{status:200,headers:{"Content-Type":"application/json"}}));
    await expect(new AppsScriptEmailService().send({communicationId:"c1",dedupeKey:"d1",to:"persona@danper.com",subject:"Prueba",text:"Contenido"})).resolves.toEqual({duplicate:false});
    expect(fetchMock).toHaveBeenCalledWith("https://script.google.com/example",expect.objectContaining({method:"POST",body:expect.stringContaining('"dedupeKey":"d1"')}));
  });
});
