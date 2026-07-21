import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, ProcessingJob } from "@prisma/client";
import { stringifyJson } from "../../common/json.util";
import { PrismaService } from "../../database/prisma.service";
import { OpenwaClientService } from "../openwa/openwa-client.service";

type DispatchInput = {
  customerId: string;
  conversationId: string;
  messageId: string;
  correlationId: string;
  payload: Record<string, unknown>;
};

type ProcessingStage = "job_started" | "tina_request" | "tina_response" | "openwa_send" | "job_completed" | "message_superseded" | "message_unusable";

@Injectable()
export class AiProcessingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiProcessingService.name);
  private timer: NodeJS.Timeout | null = null;
  private workerRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly openwa: OpenwaClientService
  ) {}

  onModuleInit(): void {
    const intervalMs = numberFromEnv(this.config.get<string>("PROCESSING_JOB_POLL_MS"), 10000);
    void this.requeueStaleProcessingJobs();
    this.timer = setInterval(() => void this.processDueJobs(), intervalMs);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async createAndDispatch(input: DispatchInput): Promise<{ id: string; status: string; correlationId: string } | null> {
    const maxAttempts = numberFromEnv(
      this.config.get<string>("TINABRAIN_MAX_ATTEMPTS") ?? this.config.get<string>("N8N_MAX_ATTEMPTS"),
      5
    );
    const job = await this.prisma.processingJob
      .create({
        data: {
          type: "tinabrain_ai",
          status: "queued",
          maxAttempts,
          correlationId: input.correlationId,
          customerId: input.customerId,
          conversationId: input.conversationId,
          messageId: input.messageId,
          payload: stringifyJson({ ...input.payload, callbackUrl: null }, "{}"),
          result: stringifyJson({ architecture: "tinabrain_direct", stages: [] }, "{}")
        }
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return null;
        throw error;
      });
    if (!job) return null;
    this.enqueueDispatch(job.id);
    return this.prisma.processingJob.findUniqueOrThrow({
      where: { id: job.id },
      select: { id: true, status: true, correlationId: true }
    });
  }

  private enqueueDispatch(jobId: string): void {
    setImmediate(() => {
      void this.dispatch(jobId).catch((error: unknown) => {
        this.logger.error(error instanceof Error ? error.message : "Queued AI dispatch failed");
      });
    });
  }

  async dispatch(jobId: string): Promise<void> {
    const job = await this.prisma.processingJob.findUnique({
      where: { id: jobId },
      include: { conversation: { include: { customer: true } } }
    });
    if (!job) return;
    if (job.type !== "tinabrain_ai") return;
    if (job.status !== "queued" && job.status !== "retryable") return;
    if (!(await this.jobMessageHasUsableText(job.messageId))) {
      await this.markJobSkipped(job.id, job.messageId, "Skipped: message has no usable text for TinaBrain.");
      return;
    }

    const attempts = job.attempts + 1;
    await this.prisma.processingJob.update({
      where: { id: job.id },
      data: {
        status: "processing",
        attempts: { increment: 1 },
        nextRunAt: null,
        lastError: null,
        result: this.appendStage(job.result, "job_started", { attempt: attempts })
      }
    });
    await this.markInboundMessage(job.messageId, "processing");

    try {
      await this.assertJobStillCurrent(job.id);
      const tinaResponse = await this.callTinaBrain(job);
      await this.assertJobStillCurrent(job.id);
      const replies = extractReplies(tinaResponse).slice(0, 1);
      if (replies.length === 0) {
        throw new StageError("tina_response", "TinaBrain returned no usable reply text.");
      }
      const sentMessages = [];
      for (const text of replies) {
        if (!job.conversation) {
          throw new StageError("openwa_send", "Processing job has no conversation attached.");
        }
        const chatId =
          job.conversation.externalChatId ??
          job.conversation.customer.chatId ??
          job.conversation.customer.whatsappId ??
          phoneChatId(job.conversation.customer.phoneNumber);
        if (!chatId) {
          throw new StageError("openwa_send", "Conversation has no WhatsApp chat ID.");
        }
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
            rawPayload: stringifyJson({ jobId: job.id, correlationId: job.correlationId, source: "tinabrain_direct" }, "{}")
          }
        });
        const sendResult = await this.sendOpenwaText(job.conversation.sessionId, chatId, text);
        const updated = await this.prisma.message.update({
          where: { id: message.id },
          data: {
            externalMessageId: sendResult.messageId,
            status: sendResult.mocked ? "mocked" : "sent",
            rawPayload: stringifyJson(sendResult.raw, "{}")
          }
        });
        sentMessages.push(updated);
      }

      await this.prisma.processingJob.update({
        where: { id: job.id },
        data: {
          status: "completed",
          result: this.appendStage(await this.currentResult(job.id), "job_completed", {
            architecture: "tinabrain_direct",
            tinaResponse,
            sentMessageCount: sentMessages.length,
            sentMessages: sentMessages.map((message) => ({ id: message.id, status: message.status }))
          }),
          completedAt: new Date(),
          lastError: null
        }
      });
      await this.markInboundMessage(job.messageId, "completed");
    } catch (error) {
      if (error instanceof SupersededError) {
        await this.markSuperseded(job.id, job.messageId, error.message);
        return;
      }
      const stage = error instanceof StageError ? error.stage : "tina_request";
      const message = error instanceof Error ? error.message : "Unknown TinaBrain processing error";
      const exhausted = attempts >= job.maxAttempts;
      const currentJob = await this.prisma.processingJob.findUnique({ where: { id: job.id }, select: { status: true } });
      if (!currentJob || currentJob.status === "cancelled") return;
      await this.prisma.processingJob.update({
        where: { id: job.id },
        data: {
          status: exhausted ? "failed" : "retryable",
          lastError: `${stage}: ${message}`,
          nextRunAt: exhausted ? null : new Date(Date.now() + retryDelayMs(attempts)),
          result: this.appendStage(await this.currentResult(job.id), stage, {
            ok: false,
            attempt: attempts,
            error: message,
            retryable: !exhausted
          })
        }
      });
      await this.markInboundMessage(job.messageId, exhausted ? "failed" : "retryable", message);
    }
  }

  async retry(jobId: string): Promise<unknown> {
    await this.prisma.processingJob.update({
      where: { id: jobId },
      data: { type: "tinabrain_ai", status: "queued", nextRunAt: null, lastError: null, completedAt: null }
    });
    await this.dispatch(jobId);
    return this.prisma.processingJob.findUnique({ where: { id: jobId } });
  }

  async cancelOpenJobsForNewCustomerMessage(conversationId: string, newMessageId: string): Promise<number> {
    const jobs = await this.prisma.processingJob.findMany({
      where: {
        type: "tinabrain_ai",
        conversationId,
        messageId: { not: newMessageId },
        status: { in: ["queued", "processing", "retryable"] }
      },
      select: { id: true, messageId: true, result: true }
    });
    for (const job of jobs) {
      const updated = await this.prisma.processingJob.updateMany({
        where: { id: job.id },
        data: {
          status: "cancelled",
          lastError: "message_superseded: another customer message arrived before a reply was sent",
          nextRunAt: null,
          result: this.appendStage(job.result, "message_superseded", {
            ok: false,
            newMessageId,
            reason: "Another customer message arrived before this job sent a reply."
          })
        }
      });
      if (updated.count === 0) continue;
      await this.markInboundMessage(job.messageId, "superseded", "Not sent: another customer message arrived before Tina replied.");
    }
    return jobs.length;
  }

  async markMessageUnusable(messageId: string, reason: string): Promise<void> {
    await this.markInboundMessage(messageId, "skipped", reason);
  }

  private async processDueJobs(): Promise<void> {
    if (this.workerRunning) return;
    this.workerRunning = true;
    try {
      const jobs = await this.prisma.processingJob.findMany({
        where: {
          type: "tinabrain_ai",
          status: { in: ["queued", "retryable"] },
          OR: [{ nextRunAt: null }, { nextRunAt: { lte: new Date() } }]
        },
        orderBy: { createdAt: "asc" },
        take: numberFromEnv(this.config.get<string>("PROCESSING_JOB_BATCH_SIZE"), 5),
        select: { id: true }
      });
      for (const job of jobs) {
        await this.dispatch(job.id);
      }
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : "AI processing worker failed");
    } finally {
      this.workerRunning = false;
    }
  }

  private async requeueStaleProcessingJobs(): Promise<void> {
    const staleMinutes = numberFromEnv(this.config.get<string>("PROCESSING_JOB_STALE_MINUTES"), 5);
    await this.prisma.processingJob.updateMany({
      where: {
        type: "tinabrain_ai",
        status: "processing",
        updatedAt: { lt: new Date(Date.now() - staleMinutes * 60 * 1000) }
      },
      data: {
        status: "retryable",
        lastError: "job_recovered: backend restarted while job was processing",
        nextRunAt: new Date()
      }
    });
  }

  private async jobMessageHasUsableText(messageId: string | null): Promise<boolean> {
    if (!messageId) return false;
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { body: true, caption: true, processedText: true }
    });
    return Boolean(message && [message.processedText, message.body, message.caption].some((value) => typeof value === "string" && value.trim().length > 0));
  }

  private async markJobSkipped(jobId: string, messageId: string | null, reason: string): Promise<void> {
    const updated = await this.prisma.processingJob.updateMany({
      where: { id: jobId },
      data: {
        status: "skipped",
        lastError: reason,
        nextRunAt: null,
        result: this.appendStage(await this.currentResult(jobId), "message_unusable", { ok: false, reason })
      }
    });
    if (updated.count === 0) return;
    await this.markInboundMessage(messageId, "skipped", reason);
  }

  private async callTinaBrain(job: ProcessingJob): Promise<Record<string, unknown>> {
    const baseUrl = realValue(this.config.get<string>("TINABRAIN_BASE_URL")) ?? "http://127.0.0.1:8010";
    const apiKey =
      realValue(this.config.get<string>("TINABRAIN_INBOUND_API_KEY")) ??
      realValue(this.config.get<string>("N8N_OUTBOUND_API_KEY")) ??
      realValue(this.config.get<string>("API_KEY"));
    const timeoutMs = numberFromEnv(
      this.config.get<string>("TINABRAIN_REQUEST_TIMEOUT_MS") ?? this.config.get<string>("N8N_REQUEST_TIMEOUT_MS"),
      120000
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/u, "")}/webhooks/cpm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CPM-API-Key": apiKey ?? "",
          "X-CPM-Correlation-ID": job.correlationId
        },
        body: job.payload,
        signal: controller.signal
      });
      const body = (await response.json().catch(() => ({ statusCode: response.status, statusText: response.statusText }))) as unknown;
      if (!response.ok) {
        throw new StageError("tina_request", `TinaBrain returned ${response.status}: ${stringifyJson(body, "{}")}`);
      }
      const parsed = asRecord(body);
      if (!parsed?.success) {
        throw new StageError("tina_response", `TinaBrain returned an unsuccessful response: ${stringifyJson(body, "{}")}`);
      }
      await this.prisma.processingJob.update({
        where: { id: job.id },
        data: { result: this.appendStage(await this.currentResult(job.id), "tina_response", { ok: true, replyPresent: Boolean(parsed.reply) }) }
      });
      return parsed;
    } catch (error) {
      if (error instanceof StageError) throw error;
      const message = error instanceof Error ? error.message : "Unknown TinaBrain request error";
      throw new StageError("tina_request", message);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async assertJobStillCurrent(jobId: string): Promise<void> {
    const job = await this.prisma.processingJob.findUnique({
      where: { id: jobId },
      include: { message: true }
    });
    if (!job || !job.messageId || !job.conversationId || !job.message) return;
    if (job.status === "cancelled") {
      throw new SupersededError("Not sent: another customer message arrived before Tina replied.");
    }
    const newerIncoming = await this.prisma.message.findFirst({
      where: {
        conversationId: job.conversationId,
        direction: "incoming",
        senderType: "customer",
        createdAt: { gt: job.message.createdAt }
      },
      select: { id: true }
    });
    if (newerIncoming) {
      throw new SupersededError("Not sent: another customer message arrived before Tina replied.");
    }
  }

  private async markSuperseded(jobId: string, messageId: string | null, reason: string): Promise<void> {
    const current = await this.currentResult(jobId);
    await this.prisma.processingJob.update({
      where: { id: jobId },
      data: {
        status: "cancelled",
        lastError: `message_superseded: ${reason}`,
        nextRunAt: null,
        result: this.appendStage(current, "message_superseded", { ok: false, reason })
      }
    });
    await this.markInboundMessage(messageId, "superseded", reason);
  }

  private async sendOpenwaText(sessionId: string | null, chatId: string, text: string): Promise<{ messageId: string | null; mocked: boolean; raw: unknown }> {
    try {
      return await this.openwa.sendText({ sessionId, chatId, text });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown OpenWA send error";
      throw new StageError("openwa_send", message);
    }
  }

  private appendStage(previousResult: string | null, stage: ProcessingStage, details: Record<string, unknown>): string {
    const previous = parseJsonRecord(previousResult) ?? { architecture: "tinabrain_direct", stages: [] };
    const stages = Array.isArray(previous.stages) ? previous.stages : [];
    return stringifyJson(
      {
        ...previous,
        architecture: "tinabrain_direct",
        stages: [...stages, { stage, at: new Date().toISOString(), ...details }]
      },
      "{}"
    );
  }

  private async currentResult(jobId: string): Promise<string | null> {
    const job = await this.prisma.processingJob.findUnique({ where: { id: jobId }, select: { result: true } });
    return job?.result ?? null;
  }

  private async markInboundMessage(messageId: string | null, status: string, failureReason?: string): Promise<void> {
    if (!messageId) return;
    await this.prisma.message
      .update({
        where: { id: messageId },
        data: { n8nStatus: status, failureReason }
      })
      .catch(() => undefined);
  }
}

class StageError extends Error {
  constructor(
    readonly stage: ProcessingStage,
    message: string
  ) {
    super(message);
  }
}

class SupersededError extends Error {}

function extractReplies(response: Record<string, unknown>): string[] {
  const reply = stringValue(response.reply);
  const replies = Array.isArray(response.replies) ? response.replies : Array.isArray(response.messages) ? response.messages : null;
  const values = replies
    ? replies.map((entry) => (typeof entry === "string" ? entry : stringValue(asRecord(entry)?.text)))
    : [reply];
  return values.filter((entry): entry is string => Boolean(entry));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function parseJsonRecord(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return asRecord(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
  return Math.min(120000, 2000 * 2 ** Math.max(0, attempts - 1));
}
