import { Body, Controller, Headers, Post } from "@nestjs/common";
import { GoogleFormsIntegrationService } from "./google-forms.service";

@Controller("integrations/google-forms")
export class GoogleFormsIntegrationController {
  constructor(private readonly integration: GoogleFormsIntegrationService) {}

  @Post("course-result")
  async registerCourseResult(
    @Body() body: { email?: unknown; courseCode?: unknown; score?: unknown; completedAt?: unknown },
    @Headers("x-mochelab-integration-key") key?: string,
  ) {
    return this.integration.registerCourseResult(body, key);
  }
}
