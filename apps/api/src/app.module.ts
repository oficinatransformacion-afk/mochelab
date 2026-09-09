import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { AccessController, PermissionsController } from "./access/access.controller";
import { AccessService } from "./access/access.service";
import { MaturityScoringService } from "./maturity/maturity-scoring.service";
import { MaturityPeriodService } from "./maturity/maturity-period.service";
import { DatabaseModule } from "./database/database.module";
import { MaturityRepository } from "./maturity/maturity.repository";
import { APP_GUARD } from "@nestjs/core";
import { AccessGuard } from "./access/access.guard";
import { MaturityController, SelfAssessmentController } from "./maturity/maturity.controller";
import { DirectoryController } from "./directory/directory.controller";
import { DirectoryRepository } from "./directory/directory.repository";
import { AcademyController } from "./academy/academy.controller";
import { AcademyRepository } from "./academy/academy.repository";
import { ObjectivesController } from "./objectives/objectives.controller";
import { ObjectivesRepository } from "./objectives/objectives.repository";
import { InitiativesController } from "./initiatives/initiatives.controller";
import { InitiativesRepository } from "./initiatives/initiatives.repository";
import { CatalogsController } from "./catalogs/catalogs.controller";
import { CatalogsRepository } from "./catalogs/catalogs.repository";
import { UsersController } from "./users/users.controller";
import { UsersRepository } from "./users/users.repository";
import { AuditController } from "./audit/audit.controller";
import { AuditRepository } from "./audit/audit.repository";
import { TargetsController } from "./targets/targets.controller";
import { TargetsRepository } from "./targets/targets.repository";
import { DashboardController } from "./dashboard/dashboard.controller";
import { DashboardRepository } from "./dashboard/dashboard.repository";
import { JobsController } from "./jobs/jobs.controller";
import { JobsRepository } from "./jobs/jobs.repository";
import { CommunicationsController } from "./communications/communications.controller";
import { CommunicationsRepository } from "./communications/communications.repository";
import { GmailService } from "./communications/gmail.service";
import { DataQualityController } from "./dashboard/data-quality.controller";
import { DataQualityRepository } from "./dashboard/data-quality.repository";
import { AuthController } from "./auth/auth.controller";
import { LocalAuthService } from "./auth/local-auth.service";
import { GoogleFormsIntegrationController } from "./integrations/google-forms.controller";
import { GoogleFormsIntegrationService } from "./integrations/google-forms.service";

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController, AuthController, GoogleFormsIntegrationController, AccessController, PermissionsController, MaturityController, SelfAssessmentController, DirectoryController, AcademyController, ObjectivesController, InitiativesController, CatalogsController, UsersController, AuditController, TargetsController, DashboardController, JobsController, CommunicationsController, DataQualityController],
  providers: [
    AccessService,
    MaturityScoringService,
    MaturityPeriodService,
    MaturityRepository,
    DirectoryRepository,
    AcademyRepository,
    ObjectivesRepository,
    InitiativesRepository,
    CatalogsRepository,
    UsersRepository,
    AuditRepository,
    TargetsRepository,
    DashboardRepository,
    JobsRepository,
    CommunicationsRepository,
    GmailService,
    DataQualityRepository,
    LocalAuthService,
    GoogleFormsIntegrationService,
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
})
export class AppModule {}
