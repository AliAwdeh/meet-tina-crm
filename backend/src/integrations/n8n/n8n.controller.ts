import { Body, Controller, Headers, Post, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBody, ApiTags } from "@nestjs/swagger";
import { Public } from "../../common/public.decorator";
import { N8nService } from "./n8n.service";

@ApiTags("webhooks")
@Controller("webhooks/n8n")
export class N8nController {
  constructor(
    private readonly n8n: N8nService,
    private readonly config: ConfigService
  ) {}

  @Public()
  @Post("ai-response")
  @ApiBody({ description: "n8n AI callback with correlationId and text/replies." })
  aiResponse(
    @Body() body: unknown,
    @Headers("x-cpm-callback-secret") callbackSecret: string | undefined,
    @Headers("x-cpm-correlation-id") correlationId: string | undefined
  ): Promise<unknown> {
    const configured = realValue(this.config.get<string>("N8N_AI_CALLBACK_SECRET"));
    if (configured && callbackSecret !== configured) {
      throw new UnauthorizedException({
        code: "N8N_CALLBACK_UNAUTHORIZED",
        message: "A valid X-CPM-Callback-Secret header is required."
      });
    }
    return this.n8n.handleCallback(body, correlationId);
  }
}

function realValue(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed && trimmed !== "change-me" && trimmed !== "..." ? trimmed : null;
}
