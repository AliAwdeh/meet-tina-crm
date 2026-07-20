import { Controller, Get } from "@nestjs/common";
import { ApiSecurity, ApiTags } from "@nestjs/swagger";
import { StatsService } from "./stats.service";

@ApiTags("stats")
@ApiSecurity("api-key")
@Controller("stats")
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get()
  overview(): Promise<unknown> {
    return this.stats.overview();
  }
}
