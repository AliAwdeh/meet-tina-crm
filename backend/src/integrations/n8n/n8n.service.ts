import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../database/prisma.service";
import { stringifyJson } from "../../common/json.util";
import { OpenwaClientService } from "../openwa/openwa-client.service";

type DispatchInput = {
  customerId: string;
  conversationId: string;
  messageId: string;
  correlationId: string;
  payload: Record<string, unknown>;
};

@Injectable()
export class N8nService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly openwa: OpenwaClientService
  ) {}

  async createAndDispatch(input: DispatchInput): Promise<{ id: string; status: string; correlationId: string }> {
    const maxAttempts = numberFromEnv(this.config.get<string>("N8N_MAX_ATTEMPTS"), 3);
    const job = await this.prisma.processingJob.create({
      data: {
        type: "n8n_ai",
        status: "queued",
        maxAttempts,
        correlationId: input.correlationId,
        customerId: input.customerId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        payload: stringifyJson(input.payload, "{}")
      }
    });
    await this.dispatch(job.id);
    const updated = await this.prisma.processingJob.findUniqueOrThrow({
      where: { id: job.id },
      select: { id: true, status: true, correlationId: true }
    });
    return updated;
  }

  async dispatch(jobId: string): Promise<void> {
    const job = await this.prisma.processingJob.findUnique({ where: { id: jobId } });
    if (!job) return;
    const url = realValue(this.config.get<string>("N8N_AI_WEBHOOK_URL"));
    const apiKey = realValue(this.config.get<string>("N8N_OUTBOUND_API_KEY")) ?? realValue(this.config.get<string>("API_KEY"));
    if (!url) {
      await this.prisma.processingJob.update({
        where: { id: job.id },
        data: {
          status: "mocked",
          attempts: { increment: 1 },
          result: stringifyJson({ reason: "N8N_AI_WEBHOOK_URL is not configured." }, "{}"),
          completedAt: new Date()
        }
      });
      await this.markMessageN8n(job.messageId, "mocked");
      return;
    }

    await this.prisma.processingJob.update({
      where: { id: job.id },
      data: { status: "processing", attempts: { increment: 1 }, lastError: null }
    });

    try {
      const timeoutMs = numberFromEnv(this.config.get<string>("N8N_REQUEST_TIMEOUT_MS"), 10000);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CPM-API-Key": apiKey ?? "",
          "X-CPM-Correlation-ID": job.correlationId
        },
        body: job.payload,
        signal: controller.signal
      });
      clearTimeout(timeout);
      const result = (await response.json().catch(() => ({ statusCode: response.status }))) as unknown;
      if (!response.ok) {
        throw new Error(`n8n webhook returned ${response.status}`);
      }
      await this.prisma.processingJob.update({
        where: { id: job.id },
        data: {
          status: "sent",
          result: stringifyJson(result, "{}")
        }
      });
      await this.markMessageN8n(job.messageId, "sent");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown n8n dispatch error";
      const attempts = job.attempts + 1;
      const exhausted = attempts >= job.maxAttempts;
      await this.prisma.processingJob.update({
        where: { id: job.id },
        data: {
          status: exhausted ? "failed" : "retryable",
          lastError: message,
          nextRunAt: exhausted ? null : new Date(Date.now() + retryDelayMs(attempts))
        }
      });
      await this.markMessageN8n(job.messageId, exhausted ? "failed" : "retryable");
    }
  }

  async retry(jobId: string): Promise<unknown> {
    await this.prisma.processingJob.update({
      where: { id: jobId },
      data: { status: "queued", nextRunAt: null, lastError: null }
    });
    await this.dispatch(jobId);
    return this.prisma.processingJob.findUnique({ where: { id: jobId } });
  }

  async handleCallback(input: unknown, correlationHeader?: string): Promise<unknown> {
    const body = asRecord(input);
    const correlationId = stringValue(body?.correlationId) ?? correlationHeader;
    const jobId = stringValue(body?.jobId);
    const job = correlationId
      ? await this.prisma.processingJob.findUnique({ where: { correlationId }, include: { conversation: { include: { customer: true } } } })
      : jobId
        ? await this.prisma.processingJob.findUnique({ where: { id: jobId }, include: { conversation: { include: { customer: true } } } })
        : null;
    if (!job || !job.conversation) {
      return { success: false, code: "PROCESSING_JOB_NOT_FOUND" };
    }

    const replies = extractReplies(body);
    const sentMessages = [];
    for (const text of replies) {
      const chatId =
        job.conversation.externalChatId ??
        job.conversation.customer.chatId ??
        job.conversation.customer.whatsappId ??
        phoneChatId(job.conversation.customer.phoneNumber);
      const message = await this.prisma.message.create({
        data: {
          customerId: job.conversation.customerId,
          conversationId: job.conversation.id,
          direction: "outgoing",
          senderType: "bot",
          messageType: "text",
          body: text,
          status: "pending",
          sentAt: new Date(),
          rawPayload: stringifyJson(input, "{}")
        }
      });
      const result = await this.openwa.sendText({ sessionId: job.conversation.sessionId, chatId, text });
      const updated = await this.prisma.message.update({
        where: { id: message.id },
        data: {
          externalMessageId: result.messageId,
          status: result.mocked ? "mocked" : "sent",
          rawPayload: stringifyJson(result.raw, "{}")
        }
      });
      sentMessages.push(updated);
    }

    await this.prisma.processingJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        result: stringifyJson(mergeCallbackResult(job.result, input, sentMessages.length), "{}"),
        completedAt: new Date()
      }
    });
    if (job.messageId) {
      await this.markMessageN8n(job.messageId, "completed");
    }
    return { success: true, jobId: job.id, correlationId: job.correlationId, messages: sentMessages };
  }

  private async markMessageN8n(messageId: string | null, status: string): Promise<void> {
    if (!messageId) return;
    await this.prisma.message.update({ where: { id: messageId }, data: { n8nStatus: status } }).catch(() => undefined);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractReplies(body: Record<string, unknown> | null): string[] {
  if (!body) return [];
  const replies = Array.isArray(body.replies) ? body.replies : Array.isArray(body.messages) ? body.messages : null;
  if (replies) {
    return replies
      .map((entry) => (typeof entry === "string" ? entry : stringValue(asRecord(entry)?.text)))
      .filter((entry): entry is string => Boolean(entry));
  }
  const single = stringValue(body.text) ?? stringValue(body.message) ?? stringValue(body.response);
  return single ? [single] : [];
}

function mergeCallbackResult(previousResult: string | null, callback: unknown, sentMessageCount: number): Record<string, unknown> {
  const previous = parseJsonRecord(previousResult);
  if (previous && ("dispatch" in previous || "callback" in previous)) {
    return { ...previous, callback, callbackSentMessageCount: sentMessageCount };
  }
  return { dispatch: previous, callback, callbackSentMessageCount: sentMessageCount };
}

function parseJsonRecord(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function phoneChatId(phoneNumber: string | null): string | null {
  return phoneNumber ? `${phoneNumber}@c.us` : null;
}

function realValue(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed && trimmed !== "change-me" && trimmed !== "..." ? trimmed : null;
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function retryDelayMs(attempts: number): number {
  return Math.min(60000, 1000 * 2 ** Math.max(0, attempts - 1));
}
