import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";
import { stringifyJson } from "../../common/json.util";
import { PrismaService } from "../../database/prisma.service";
import { MediaService } from "../../media/media.service";
import { AiProcessingService } from "../ai-processing/ai-processing.service";
import { NormalizedOpenwaEvent, NormalizedOpenwaMessage, OpenwaAckPayload, OpenwaProcessResult } from "./openwa.types";
import { OpenwaNormalizerService } from "./openwa-normalizer.service";

@Injectable()
export class OpenwaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly normalizer: OpenwaNormalizerService,
    private readonly config: ConfigService,
    private readonly aiProcessing: AiProcessingService,
    private readonly media: MediaService
  ) {}

  async process(input: unknown, options: { rawBody?: Buffer; headers?: Record<string, string | string[] | undefined> } = {}): Promise<OpenwaProcessResult> {
    const normalized = this.normalizer.normalize(input);
    const signatureValid = this.verifySignature(input, options.rawBody, options.headers?.["x-openwa-signature"]);
    const idempotencyKey = normalized.idempotencyKey ?? fallbackIdempotencyKey(normalized);
    const existingDelivery = await this.prisma.webhookDelivery.findUnique({ where: { idempotencyKey } });
    if (existingDelivery?.status === "completed" || existingDelivery?.status === "ignored") {
      const duplicateMessage = await this.findMessageForEvent(normalized);
      return duplicateMessage
        ? { success: true, duplicate: true, message: { id: duplicateMessage.id } }
        : { success: true, ignored: true, reason: "duplicate_webhook_delivery" };
    }

    const delivery = existingDelivery
      ? await this.prisma.webhookDelivery.update({
          where: { id: existingDelivery.id },
          data: {
            retryCount: retryCount(options.headers),
            deliveryId: normalized.deliveryId,
            signatureValid,
            rawPayload: stringifyJson(normalized.rawPayload, "{}"),
            headers: stringifyJson(safeHeaders(options.headers), "{}"),
            status: "received",
            error: null
          }
        })
      : await this.prisma.webhookDelivery.create({
          data: {
            event: normalized.event,
            sessionId: normalized.sessionId,
            idempotencyKey,
            deliveryId: normalized.deliveryId,
            retryCount: retryCount(options.headers),
            signatureValid,
            rawPayload: stringifyJson(normalized.rawPayload, "{}"),
            headers: stringifyJson(safeHeaders(options.headers), "{}")
          }
        });

    if (!signatureValid) {
      await this.markDelivery(delivery.id, "failed", "Invalid OpenWA webhook signature.");
      throw new UnauthorizedException({
        code: "OPENWA_INVALID_SIGNATURE",
        message: "OpenWA webhook signature is invalid."
      });
    }

    if (isAck(normalized)) {
      return this.processAck(delivery.id, normalized);
    }

    if (this.shouldIgnore(normalized)) {
      await this.markDelivery(delivery.id, "ignored", this.ignoreReason(normalized));
      return { success: true, ignored: true, reason: this.ignoreReason(normalized) };
    }

    const result: OpenwaProcessResult = await this.prisma.$transaction(async (tx): Promise<OpenwaProcessResult> => {
      const duplicate = await this.findDuplicate(tx, normalized);
      if (duplicate) {
        return { success: true, duplicate: true, message: { id: duplicate.id } };
      }

      const customer = await this.resolveCustomer(tx, normalized);
      const conversation = await this.resolveConversation(tx, customer.id, normalized);
      const message = await tx.message.create({
        data: {
          customerId: customer.id,
          conversationId: conversation.id,
          externalMessageId: normalized.externalMessageId,
          idempotencyKey: normalized.idempotencyKey,
          deliveryId: normalized.deliveryId,
          direction: normalized.direction,
          senderType: normalized.senderType,
          messageType: normalized.messageType,
          body: normalized.body,
          mediaUrl: normalized.mediaUrl,
          caption: normalized.caption,
          status: normalized.direction === "outgoing" ? "sent" : "received",
          n8nStatus: normalized.direction === "incoming" ? "queued" : "not_queued",
          rawPayload: stringifyJson(normalized.rawPayload, "{}"),
          sentAt: normalized.direction === "outgoing" ? normalized.timestamp : null,
          receivedAt: normalized.direction === "incoming" ? normalized.timestamp : null
        }
      });

      await tx.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: normalized.timestamp }
      });
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          lastContactAt: normalized.timestamp,
          firstContactAt: customer.firstContactAt ?? normalized.timestamp
        }
      });

      if (normalized.hasMedia) {
        await tx.mediaAttachment.create({
          data: {
            customerId: customer.id,
            conversationId: conversation.id,
            messageId: message.id,
            externalMediaId: normalized.externalMessageId,
            mediaType: normalized.messageType,
            mimeType: normalized.mimetype,
            filename: normalized.filename,
            sourceUrl: normalized.mediaUrl,
            status: "deferred",
            rawPayload: stringifyJson(normalized.rawPayload, "{}")
          }
        });
      }

      return {
        success: true,
        duplicate: false,
        customer: {
          id: customer.id,
          displayName: customer.displayName,
          whatsappId: customer.whatsappId
        },
        conversation: { id: conversation.id },
        message: { id: message.id, direction: message.direction }
      };
    });

    if ("duplicate" in result && result.duplicate === false && normalized.direction === "incoming" && normalized.event === "message.received") {
      const correlationId = `cpm_${result.message.id}`;
      await this.media.processMessageAttachments(result.message.id);
      await this.aiProcessing.cancelOpenJobsForNewCustomerMessage(result.conversation.id, result.message.id);
      if (!(await this.messageHasUsableText(result.message.id))) {
        const reason = "Skipped: message has no usable text for TinaBrain after media processing.";
        await this.aiProcessing.markMessageUnusable(result.message.id, reason);
        await this.markDelivery(delivery.id, "completed");
        return result;
      }
      const processingJob = await this.aiProcessing.createAndDispatch({
        customerId: result.customer.id,
        conversationId: result.conversation.id,
        messageId: result.message.id,
        correlationId,
        payload: await this.buildN8nPayload(result.customer.id, result.conversation.id, result.message.id, correlationId)
      });
      await this.markDelivery(delivery.id, "completed");
      return { ...result, processingJob };
    }

    await this.markDelivery(delivery.id, "completed");
    return result;
  }

  private async processAck(deliveryId: string, ack: OpenwaAckPayload): Promise<OpenwaProcessResult> {
    if (!ack.externalMessageId) {
      await this.markDelivery(deliveryId, "ignored", "ack_without_message_id");
      return { success: true, ignored: true, reason: "ack_without_message_id" };
    }
    const message = await this.prisma.message.findFirst({
      where: { externalMessageId: ack.externalMessageId },
      select: { id: true }
    });
    if (!message) {
      await this.markDelivery(deliveryId, "ignored", "ack_without_matching_message");
      return { success: true, ignored: true, reason: "ack_without_matching_message" };
    }
    const now = new Date();
    await this.prisma.message.update({
      where: { id: message.id },
      data: {
        status: ack.status,
        failureReason: ack.status === "failed" ? "OpenWA reported message.failed." : null,
        deliveredAt: ack.status === "delivered" ? now : undefined,
        readAt: ack.status === "read" ? now : undefined,
        metadata: stringifyJson({ ack: ack.ack, ackPayload: ack.rawPayload }, "{}")
      }
    });
    await this.markDelivery(deliveryId, "completed");
    return { success: true, duplicate: true, message: { id: message.id } };
  }

  private shouldIgnore(message: NormalizedOpenwaMessage): boolean {
    const ignoreGroups = this.config.get<string>("IGNORE_GROUP_MESSAGES") !== "false";
    const ignoreStatus = this.config.get<string>("IGNORE_STATUS_BROADCASTS") !== "false";
    if (ignoreGroups && message.isGroup) return true;
    if (ignoreStatus && message.isStatusBroadcast) return true;
    if (!message.externalMessageId && !message.body && !message.mediaUrl) return true;
    return false;
  }

  private ignoreReason(message: NormalizedOpenwaMessage): string {
    if (message.isGroup) return "group_message";
    if (message.isStatusBroadcast) return "status_broadcast";
    return "empty_or_unsupported_event";
  }

  private async findDuplicate(
    tx: Prisma.TransactionClient,
    message: NormalizedOpenwaMessage
  ): Promise<{ id: string } | null> {
    const or: Prisma.MessageWhereInput[] = [];
    if (message.idempotencyKey) or.push({ idempotencyKey: message.idempotencyKey });
    if (message.externalMessageId) or.push({ externalMessageId: message.externalMessageId });
    if (or.length === 0) return null;
    return tx.message.findFirst({ where: { OR: or }, select: { id: true } });
  }

  private async findMessageForEvent(event: NormalizedOpenwaEvent): Promise<{ id: string } | null> {
    const externalMessageId = isAck(event) ? event.externalMessageId : event.externalMessageId;
    if (!externalMessageId) return null;
    return this.prisma.message.findFirst({ where: { externalMessageId }, select: { id: true } });
  }

  private async resolveCustomer(tx: Prisma.TransactionClient, message: NormalizedOpenwaMessage) {
    const byWhatsappId = message.whatsappId
      ? await tx.customer.findFirst({ where: { whatsappId: message.whatsappId } })
      : null;
    const byLid = !byWhatsappId && message.lid ? await tx.customer.findFirst({ where: { lid: message.lid } }) : null;
    const byPhone =
      !byWhatsappId && !byLid && message.phoneNumber
        ? await tx.customer.findFirst({ where: { phoneNumber: message.phoneNumber } })
        : null;
    const byChatId =
      !byWhatsappId && !byLid && !byPhone && message.chatId
        ? await tx.customer.findFirst({ where: { chatId: message.chatId } })
        : null;
    const existing = byWhatsappId ?? byLid ?? byPhone ?? byChatId;

    if (existing) {
      return tx.customer.update({
        where: { id: existing.id },
        data: {
          displayName: existing.displayName ?? message.displayName ?? message.pushName,
          pushName: existing.pushName ?? message.pushName,
          whatsappId: existing.whatsappId ?? message.whatsappId,
          lid: existing.lid ?? message.lid,
          phoneNumber: existing.phoneNumber ?? message.phoneNumber,
          chatId: existing.chatId ?? message.chatId
        }
      });
    }

    return tx.customer.create({
      data: {
        displayName: message.displayName ?? message.pushName ?? message.whatsappId,
        pushName: message.pushName,
        whatsappId: message.whatsappId,
        lid: message.lid,
        phoneNumber: message.phoneNumber,
        chatId: message.chatId,
        source: "openwa",
        status: "new",
        firstContactAt: message.timestamp,
        lastContactAt: message.timestamp
      }
    });
  }

  private async resolveConversation(
    tx: Prisma.TransactionClient,
    customerId: string,
    message: NormalizedOpenwaMessage
  ): Promise<{ id: string }> {
    const existing = await tx.conversation.findFirst({
      where: {
        customerId,
        status: "active",
        externalChatId: message.chatId ?? undefined
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true }
    });
    if (existing) {
      const inactiveMinutes = Number(this.config.get<string>("CONVERSATION_INACTIVITY_MINUTES") ?? 60);
      const last = await tx.conversation.findUnique({ where: { id: existing.id }, select: { lastMessageAt: true } });
      const lastMessageAt = last?.lastMessageAt?.getTime() ?? 0;
      const windowMs = (Number.isFinite(inactiveMinutes) && inactiveMinutes > 0 ? inactiveMinutes : 60) * 60 * 1000;
      if (!lastMessageAt || message.timestamp.getTime() - lastMessageAt <= windowMs) {
        return existing;
      }
    }

    return tx.conversation.create({
      data: {
        customerId,
        channel: "whatsapp",
        externalChatId: message.chatId,
        sessionId: message.sessionId,
        status: "active",
        startedAt: message.timestamp,
        lastMessageAt: message.timestamp
      },
      select: { id: true }
    });
  }

  private async buildN8nPayload(
    customerId: string,
    conversationId: string,
    messageId: string,
    correlationId: string
  ): Promise<Record<string, unknown>> {
    const [customer, conversation, message, recentMessages, mediaAttachments] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: customerId } }),
      this.prisma.conversation.findUnique({ where: { id: conversationId } }),
      this.prisma.message.findUnique({ where: { id: messageId } }),
      this.prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: "desc" },
        take: Number(this.config.get<string>("N8N_CONTEXT_MESSAGE_LIMIT") ?? 20)
      }),
      this.prisma.mediaAttachment.findMany({ where: { messageId } })
    ]);
    return {
      correlationId,
      callbackUrl: `${this.publicBaseUrl()}/api/v1/webhooks/n8n/ai-response`,
      customer,
      conversation,
      message,
      mediaAttachments,
      recentMessages: recentMessages.reverse()
    };
  }

  private async messageHasUsableText(messageId: string): Promise<boolean> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { body: true, caption: true, processedText: true }
    });
    return Boolean(message && [message.processedText, message.body, message.caption].some((value) => typeof value === "string" && value.trim().length > 0));
  }

  private publicBaseUrl(): string {
    return (this.config.get<string>("CPM_PUBLIC_URL") ?? `http://localhost:${this.config.get<string>("PORT") ?? 3000}`).replace(/\/+$/u, "");
  }

  private async markDelivery(id: string, status: string, error?: string): Promise<void> {
    await this.prisma.webhookDelivery.update({
      where: { id },
      data: { status, error, processedAt: new Date() }
    });
  }

  private verifySignature(
    input: unknown,
    rawBody: Buffer | undefined,
    header: string | string[] | undefined
  ): boolean {
    const secret = realValue(this.config.get<string>("OPENWA_WEBHOOK_SECRET"));
    if (!secret) return true;
    const signature = Array.isArray(header) ? header[0] : header;
    if (!signature) return false;
    const body = rawBody ?? Buffer.from(stringifyJson(input, "{}"));
    const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    return signatureBuffer.length === expectedBuffer.length && timingSafeEqual(signatureBuffer, expectedBuffer);
  }
}

function isAck(event: NormalizedOpenwaEvent): event is OpenwaAckPayload {
  return event.event === "message.ack" || event.event === "message.failed";
}

function retryCount(headers: Record<string, string | string[] | undefined> | undefined): number {
  const value = headers?.["x-openwa-retry-count"];
  const first = Array.isArray(value) ? value[0] : value;
  const parsed = Number(first ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function safeHeaders(headers: Record<string, string | string[] | undefined> | undefined): Record<string, string | string[]> {
  if (!headers) return {};
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => key.toLowerCase().startsWith("x-openwa-"))
  ) as Record<string, string | string[]>;
}

function fallbackIdempotencyKey(event: NormalizedOpenwaEvent): string {
  const messageId = isAck(event) ? event.externalMessageId : event.externalMessageId;
  return `${event.event}_${event.sessionId ?? "unknown"}_${messageId ?? event.deliveryId ?? Date.now()}`;
}

function realValue(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed && trimmed !== "change-me" && trimmed !== "..." ? trimmed : null;
}
