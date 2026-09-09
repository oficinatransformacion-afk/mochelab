import { Body, Controller, Headers, Post } from "@nestjs/common";
import { LocalAuthService } from "./local-auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth:LocalAuthService){}
  @Post("login") login(@Body() body:{email?:string;password?:string}){return this.auth.login(body.email??"",body.password??"")}
  @Post("change-password") change(@Headers("authorization") authorization:string|undefined,@Body() body:{currentPassword?:string;nextPassword?:string}){const token=authorization?.replace(/^Bearer\s+/i,"")??"";const claims=this.auth.verifySession(token);return this.auth.changePassword(claims.email,body.currentPassword??"",body.nextPassword??"")}
}
