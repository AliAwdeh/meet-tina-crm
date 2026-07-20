import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { IS_PUBLIC_KEY } from "../common/public.decorator";

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const configuredKey = this.config.get<string>("API_KEY");
    const providedKey = request.header("X-API-Key");
    const webhookSecret = this.config.get<string>("OPENWA_WEBHOOK_SECRET");
    const providedWebhookSecret = request.header("X-OpenWA-Webhook-Secret");

    if (
      request.path.endsWith("/webhooks/openwa") &&
      webhookSecret &&
      webhookSecret !== "change-me" &&
      providedWebhookSecret === webhookSecret
    ) {
      return true;
    }

    if (!configuredKey || providedKey !== configuredKey) {
      throw new UnauthorizedException({
        code: "UNAUTHORIZED",
        message: "A valid X-API-Key header is required."
      });
    }

    return true;
  }
}
