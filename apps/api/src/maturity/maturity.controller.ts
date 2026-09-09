import { BadRequestException, Body, Controller, Get, Headers, Optional, Param, Patch, Post, Query, UnauthorizedException } from "@nestjs/common";
import { CalibrateRoleMaturitySchema, SubmitSelfAssessmentSchema } from "@mochelab/shared";
import { AdminOnly, RequirePermission } from "../access/access.decorators";
import { AccessService, type ProfileCode } from "../access/access.service";
import { MaturityRepository } from "./maturity.repository";

@AdminOnly()
@Controller("maturity/admin")
export class MaturityController {
  constructor(private readonly repository: MaturityRepository,private readonly access:AccessService) {}

  @Get("periods")
  listPeriods() {
    return this.repository.listPeriods();
  }

  @Post("periods")
  async createPeriod(@Body() body: { code: string; name: string; startDate: string; endDate: string; selfAssessmentOpensAt: string; selfAssessmentClosesAt: string; calibrationClosesAt: string; configurationVersion: string },@Headers("x-mochelab-demo-user-email") email?:string) {
    return this.repository.createPeriod(body,await this.access.getUserId("ADMIN",email));
  }

  @Patch("periods/:id/status")
  async transitionPeriod(@Param("id") id: string, @Body() body: { status: string },@Headers("x-mochelab-demo-user-email") email?:string) {
    return this.repository.transitionPeriod(id, body.status,await this.access.getUserId("ADMIN",email));
  }

  @Get("configuration")
  listConfiguration() {
    return this.repository.listConfiguration();
  }

  @Post("configuration/dimensions")
  async createDimension(@Body() body: { code: string; name: string; description?: string; weight: number },@Headers("x-mochelab-demo-user-email") email?:string) { return this.repository.createDimension(body,await this.access.getUserId("ADMIN",email)); }

  @Patch("configuration/dimensions/:id")
  async updateDimension(@Param("id") id: string, @Body() body: { name?: string; description?: string; weight?: number; active?: boolean },@Headers("x-mochelab-demo-user-email") email?:string) { return this.repository.updateDimension(id, body,await this.access.getUserId("ADMIN",email)); }

  @Post("configuration/behaviors")
  async createBehavior(@Body() body: { dimensionId: string; code: string; statement: string; helpText?: string; weight: number; roleIds: string[] },@Headers("x-mochelab-demo-user-email") email?:string) { return this.repository.createBehavior(body,await this.access.getUserId("ADMIN",email)); }

  @Patch("configuration/behaviors/:id")
  async updateBehavior(@Param("id") id: string, @Body() body: { statement?: string; helpText?: string; weight?: number; active?: boolean; roleIds?: string[] },@Headers("x-mochelab-demo-user-email") email?:string) { return this.repository.updateBehavior(id, body,await this.access.getUserId("ADMIN",email)); }

  @Get("calibrations/pending")
  listPendingCalibrations() {
    return this.repository.listPendingCalibrations();
  }

  @Get("calibrations")
  listCalibrations(){return this.repository.listCalibrations();}

  @Get("team-maturities")
  listTeamMaturities(@Query("periodId") periodId?:string,@Query("teamId") teamId?:string){return this.repository.listTeamMaturities({periodId,teamId});}

  @Get("team-maturities/options")
  teamMaturityOptions(){return this.repository.teamMaturityOptions();}

  @Post("team-maturities")
  async saveTeamMaturity(@Body() body:{teamId?:string;periodId?:string;score?:number;comments?:string},@Headers("x-mochelab-demo-user-email") email?:string){
    if(!body.teamId||!body.periodId||typeof body.score!=="number")throw new BadRequestException("Equipo, período y puntaje son obligatorios");
    return this.repository.saveTeamMaturity({teamId:body.teamId,periodId:body.periodId,score:body.score,comments:body.comments},await this.access.getUserId("ADMIN",email));
  }

  @Get("history")
  maturityHistory(@Query("periodId") periodId?:string,@Query("teamId") teamId?:string){return this.repository.maturityHistory({periodId,teamId});}

  @Get("calibrations/:roleMaturityId")
  getCalibration(@Param("roleMaturityId") roleMaturityId: string) { return this.repository.getCalibration(roleMaturityId); }

  @Patch("calibrations/:roleMaturityId")
  calibrate(
    @Param("roleMaturityId") roleMaturityId: string,
    @Headers("x-mochelab-demo-user-email") email: string | undefined,
    @Body() body: unknown,
  ) {
    const parsed = CalibrateRoleMaturitySchema.safeParse({
      ...(typeof body === "object" && body ? body : {}),
      roleMaturityId,
    });
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.access.getUserId("ADMIN",email).then(administratorId=>this.repository.calibrate(parsed.data,administratorId));
  }
}

@Controller("maturity")
@RequirePermission("MADUREZ","view")
export class SelfAssessmentController {
  constructor(private readonly repository: MaturityRepository,@Optional() private readonly access?:AccessService) {}
  private scope(profile:string|undefined,email:string|undefined){return this.access?this.access.getTeamScope(profile?.toUpperCase()==="SYSTEM"?"SYSTEM":profile?.toUpperCase()==="ADMIN"?"ADMIN":"USUARIO" as ProfileCode,email):Promise.resolve(null)}

  @Get("self-assessment-form")
  async form(@Query("personRoleId") currentPersonRoleId?: string,@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string) {
    if (process.env.NODE_ENV === "production") throw new UnauthorizedException("La autenticación corporativa aún no está configurada");
    const identityProfile:ProfileCode=profile?.toUpperCase()==="SYSTEM"?"SYSTEM":profile?.toUpperCase()==="ADMIN"?"ADMIN":"USUARIO";
    const [teamIds,personId]=await Promise.all([this.scope(profile,email),this.access?this.access.getPersonId(identityProfile,email):Promise.resolve(null)]);
    return this.repository.getSelfAssessmentForm(currentPersonRoleId,teamIds,personId);
  }

  @Post("self-assessments")
  @RequirePermission("MADUREZ","create")
  async submit(
    @Headers("x-mochelab-demo-person-role-id") currentPersonRoleId: string | undefined,
    @Body() body: unknown,
    @Headers("x-mochelab-demo-profile") profile?:string,
    @Headers("x-mochelab-demo-user-email") email?:string,
  ) {
    if (process.env.NODE_ENV === "production") {
      throw new UnauthorizedException("La autenticación corporativa aún no está configurada");
    }
    const parsed = SubmitSelfAssessmentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    if (!currentPersonRoleId || currentPersonRoleId !== parsed.data.personRoleId) {
      throw new UnauthorizedException("La autoevaluación solo puede enviarla el rol autenticado");
    }
    const identityProfile:ProfileCode=profile?.toUpperCase()==="SYSTEM"?"SYSTEM":profile?.toUpperCase()==="ADMIN"?"ADMIN":"USUARIO";
    const [teamIds,personId]=await Promise.all([this.scope(profile,email),this.access?this.access.getPersonId(identityProfile,email):Promise.resolve(null)]);
    await this.repository.assertPersonRoleScope(currentPersonRoleId,teamIds,personId);
    return this.repository.submitSelfAssessment(parsed.data);
  }
}
