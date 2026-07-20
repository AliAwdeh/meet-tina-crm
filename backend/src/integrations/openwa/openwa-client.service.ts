import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type SendTextInput = {
  sessionId?: string | null;
  chatId?: string | null;
  text: string;
};

type SendTextResult = {
  mocked: boolean;
  messageId: string | null;
  timestamp: number | null;
  raw: unknown;
};

@Injectable()
export class OpenwaClientService {
  constructor(private readonly config: ConfigService) {}

  async sendText(input: SendTextInput): Promise<SendTextResult> {
    const baseUrl = normalizedBaseUrl(this.config.get<string>("OPENWA_BASE_URL"));
    const apiKey = realValue(this.config.get<string>("OPENWA_API_KEY"));
    const sessionId = input.sessionId ?? realValue(this.config.get<string>("OPENWA_SESSION_ID"));
    if (!input.chatId) {
      throw new BadRequestException({ code: "OPENWA_CHAT_ID_REQUIRED", message: "A WhatsApp chat ID is required." });
    }
    if (!baseUrl || !apiKey || !sessionId) {
      return {
        mocked: true,
        messageId: `mock_${Date.now()}`,
        timestamp: Math.floor(Date.now() / 1000),
        raw: { reason: "OpenWA credentials are not configured." }
      };
    }

    const response = await fetch(`${baseUrl}/sessions/${encodeURIComponent(sessionId)}/messages/send-text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey
      },
      body: JSON.stringify({ chatId: input.chatId, text: input.text })
    });
    const raw = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      throw new BadRequestException({
        code: "OPENWA_SEND_FAILED",
        message: `OpenWA send failed with ${response.status}.`,
        details: raw
      });
    }
    const body = asRecord(raw);
    return {
      mocked: false,
      messageId: stringValue(body?.messageId),
      timestamp: numberValue(body?.timestamp),
      raw
    };
  }
}

function normalizedBaseUrl(value: string | undefined): string | null {
  const cleaned = realValue(value);
  if (!cleaned) return null;
  const withoutSlash = cleaned.replace(/\/+$/u, "");
  return withoutSlash.endsWith("/api") ? withoutSlash : `${withoutSlash}/api`;
}

function realValue(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed && trimmed !== "change-me" && trimmed !== "..." ? trimmed : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
