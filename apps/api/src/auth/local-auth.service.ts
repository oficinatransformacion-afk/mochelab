import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { PrismaService } from "../database/prisma.service";

const minimumPasswordLength = 10;

function hash(password:string, salt=randomBytes(16).toString("hex")){return `${salt}:${scryptSync(password,salt,64).toString("hex")}`}
function matches(password:string, stored:string){const [salt,value]=stored.split(":");if(!salt||!value)return false;const candidate=scryptSync(password,salt,64).toString("hex");return candidate.length===value.length&&timingSafeEqual(Buffer.from(candidate),Buffer.from(value))}

@Injectable()
export class LocalAuthService {
  constructor(private readonly prisma:PrismaService){}
  private validate(password:string){if(password.length<minimumPasswordLength)throw new BadRequestException(`La contraseña debe tener al menos ${minimumPasswordLength} caracteres`)}
  private secret(){const value=process.env.AUTH_SESSION_SECRET;if(!value||value.length<32)throw new BadRequestException("AUTH_SESSION_SECRET debe tener al menos 32 caracteres") ;return value}
  private sign(payload:string){return createHmac("sha256",this.secret()).update(payload).digest("base64url")}
  issueSession(input:{id:string;email:string;profile:string}){const payload=Buffer.from(JSON.stringify({...input,exp:Date.now()+8*60*60*1000})).toString("base64url");return `${payload}.${this.sign(payload)}`}
  verifySession(token:string){const [payload,signature]=token.split(".");if(!payload||!signature||this.sign(payload)!==signature)throw new UnauthorizedException("Sesión inválida");const claims=JSON.parse(Buffer.from(payload,"base64url").toString()) as {id:string;email:string;profile:string;exp:number};if(claims.exp<Date.now())throw new UnauthorizedException("La sesión expiró");return claims}
  async login(email:string,password:string){const user=await this.prisma.user.findUnique({where:{email:email.trim().toLowerCase()},include:{profile:true,status:true}});if(!user||user.status.code!=="ACTIVO"||!user.passwordHash||!matches(password,user.passwordHash))throw new UnauthorizedException("Usuario o contraseña inválidos");await this.prisma.user.update({where:{id:user.id},data:{lastLoginAt:new Date()}});return {email:user.email,name:user.name,profile:user.profile.code,token:this.issueSession({id:user.id,email:user.email,profile:user.profile.code})}}
  async changePassword(email:string,currentPassword:string,nextPassword:string){this.validate(nextPassword);const user=await this.prisma.user.findUnique({where:{email:email.trim().toLowerCase()}});if(!user?.passwordHash||!matches(currentPassword,user.passwordHash))throw new UnauthorizedException("La contraseña actual no es válida");await this.prisma.user.update({where:{id:user.id},data:{passwordHash:hash(nextPassword),passwordChangedAt:new Date()}});return {ok:true}}
  async setInitialPassword(email:string,password:string){this.validate(password);await this.prisma.user.update({where:{email:email.trim().toLowerCase()},data:{passwordHash:hash(password),passwordChangedAt:new Date()}});return {ok:true}}
}
