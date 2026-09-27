import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";

type SendEmail={communicationId:string;dedupeKey:string;to:string;subject:string;text:string};

@Injectable()
export class AppsScriptEmailService {
  private required(name:string){const value=process.env[name]?.trim();if(!value)throw new ServiceUnavailableException(`Falta configurar ${name}`);return value}
  status(){const keys=["APPS_SCRIPT_EMAIL_WEB_APP_URL","APPS_SCRIPT_EMAIL_SECRET"],missing=keys.filter(key=>!process.env[key]?.trim());return{provider:"GOOGLE_APPS_SCRIPT",enabled:process.env.APPS_SCRIPT_EMAIL_ENABLED==="true",configured:missing.length===0,missing,senderName:process.env.APPS_SCRIPT_EMAIL_SENDER_NAME?.trim()||"Oficina Transformación",transport:"HTTPS_WEB_APP",mode:process.env.APPS_SCRIPT_EMAIL_ENABLED==="true"&&missing.length===0?"ENVIO":"SOLO_COLA"}}
  async send(input:SendEmail){const status=this.status();if(!status.enabled||!status.configured)throw new ServiceUnavailableException("Google Apps Script no está habilitado o configurado");if(!/^\S+@\S+\.\S+$/.test(input.to))throw new BadRequestException("Destinatario inválido");const response=await fetch(this.required("APPS_SCRIPT_EMAIL_WEB_APP_URL"),{method:"POST",redirect:"follow",headers:{"Content-Type":"application/json"},body:JSON.stringify({secret:this.required("APPS_SCRIPT_EMAIL_SECRET"),communicationId:input.communicationId,dedupeKey:input.dedupeKey,to:input.to,subject:input.subject,text:input.text,senderName:status.senderName})});const body=await response.json().catch(()=>({})) as {ok?:boolean;duplicate?:boolean;error?:string};if(!response.ok||!body.ok)throw new ServiceUnavailableException(body.error??`Apps Script respondió HTTP ${response.status}`);return{duplicate:Boolean(body.duplicate)}}
}
