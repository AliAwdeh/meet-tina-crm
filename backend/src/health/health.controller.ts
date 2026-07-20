import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../common/public.decorator";

@ApiTags("health")
@Controller("health")
export class HealthController {
  @Public()
  @Get()
  check(): { success: true; status: "ok"; timestamp: string } {
    return { success: true, status: "ok", timestamp: new Date().toISOString() };
  }
}
