import { Controller, Get, Headers, Query } from "@nestjs/common";
import { RequirePermission } from "../access/access.decorators";
import { AccessService, type ProfileCode } from "../access/access.service";
import { DashboardRepository } from "./dashboard.repository";

const list = (value?: string) => value?.split(",").map(item => item.trim()).filter(Boolean) ?? [];

@Controller("dashboard")
@RequirePermission("INICIO", "view")
export class DashboardController {
  constructor(private readonly repository: DashboardRepository, private readonly access: AccessService) {}

  private scope(profile: string | undefined, email: string | undefined) {
    return this.access.getTeamScope(profile?.toUpperCase() === "SYSTEM" ? "SYSTEM" : profile?.toUpperCase() === "ADMIN" ? "ADMIN" : "USUARIO" as ProfileCode, email);
  }

  @Get()
  async summary(
    @Query("teamIds") teamIds?: string,
    @Headers("x-mochelab-demo-profile") profile?: string,
    @Headers("x-mochelab-demo-user-email") email?: string,
  ) {
    return this.repository.summary({ teamIds: list(teamIds) }, await this.scope(profile, email));
  }
}
