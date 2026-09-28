import { Controller, Get, Headers } from "@nestjs/common";
import { PortfolioExportService } from "./portfolio-export.service";

@Controller("integrations/portfolio")
export class PortfolioExportController {
  constructor(private readonly portfolio: PortfolioExportService) {}

  @Get("export")
  export(@Headers("x-mochelab-integration-key") key?: string) {
    return this.portfolio.export(key);
  }
}
