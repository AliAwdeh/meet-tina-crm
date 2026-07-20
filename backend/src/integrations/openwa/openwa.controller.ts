import { Body, Controller, Headers, Post, Req } from "@nestjs/common";
import { ApiBody, ApiSecurity, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { Public } from "../../common/public.decorator";
import { OpenwaService } from "./openwa.service";
import { OpenwaProcessResult } from "./openwa.types";

@ApiTags("webhooks")
@ApiSecurity("api-key")
@Controller("webhooks/openwa")
export class OpenwaController {
  constructor(private readonly openwa: OpenwaService) {}

  @Public()
  @Post()
  @ApiBody({ description: "Direct OpenWA payload or n8n webhook wrapper array." })
  process(
    @Body() body: unknown,
    @Req() request: Request & { rawBody?: Buffer },
    @Headers() headers: Record<string, string | string[] | undefined>
  ): Promise<OpenwaProcessResult> {
    return this.openwa.process(body, { rawBody: request.rawBody, headers });
  }
}
