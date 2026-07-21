import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Message, Prisma } from "@prisma/client";
import { stringifyJson } from "../common/json.util";
import { ConversationsService } from "../conversations/conversations.service";
import { CustomersService } from "../customers/customers.service";
import { PrismaService } from "../database/prisma.service";
import { OpenwaClientService } from "../integrations/openwa/openwa-client.service";
import { CreateMessageDto, MessageListQueryDto, SendConversationMessageDto } from "./dto/message.dto";

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly conversations: ConversationsService,
    private readonly openwa: OpenwaClientService
  ) {}

  async create(dto: CreateMessageDto): Promise<{ duplicate: boolean; message: Message }> {
    await this.customers.ensureExists(dto.customerId);
    await this.conversations.ensureExists(dto.conversationId);
    const existing = await this.findDuplicate(dto);
    if (existing) {
      return { duplicate: true, message: existing };
    }

    const timestamp = this.messageTimestamp(dto);
    const message = await this.prisma.message.create({
      data: this.toCreateInput(dto)
    });
    await this.prisma.$transaction([
      this.prisma.conversation.update({
        where: { id: dto.conversationId },
        data: { lastMessageAt: timestamp }
      }),
      this.prisma.customer.update({
        where: { id: dto.customerId },
        data: {
          lastContactAt: timestamp,
          firstContactAt: { set: timestamp }
        }
      })
    ]);
    return { duplicate: false, message };
  }

  async findOne(id: string): Promise<Message> {
    const message = await this.prisma.message.findUnique({
      where: { id },
      include: { mediaAttachments: { orderBy: { createdAt: "asc" } } }
    });
    if (!message) {
      throw new NotFoundException({ code: "MESSAGE_NOT_FOUND", message: "Message was not found." });
    }
    return message;
  }

  async sendToConversation(conversationId: string, dto: SendConversationMessageDto): Promise<Message> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { customer: true }
    });
    if (!conversation) {
      throw new NotFoundException({ code: "CONVERSATION_NOT_FOUND", message: "Conversation was not found." });
    }

    const chatId = dto.chatId ?? conversation.externalChatId ?? conversation.customer.chatId ?? conversation.customer.whatsappId ?? phoneChatId(conversation.customer.phoneNumber);
    if (!chatId) {
      throw new BadRequestException({
        code: "CONVERSATION_CHAT_ID_REQUIRED",
        message: "Conversation or customer must have a WhatsApp chat ID before sending."
      });
    }

    const message = await this.prisma.message.create({
      data: {
        customerId: conversation.customerId,
        conversationId,
        direction: "outgoing",
        senderType: dto.senderType ?? "agent",
        messageType: "text",
        body: dto.text,
        status: "pending",
        sentAt: new Date(),
        rawPayload: "{}",
        metadata: stringifyJson({ requestedChatId: chatId }, "{}")
      }
    });

    try {
      const result = await this.openwa.sendText({
        sessionId: dto.sessionId ?? conversation.sessionId,
        chatId,
        text: dto.text
      });
      const updated = await this.prisma.message.update({
        where: { id: message.id },
        data: {
          externalMessageId: result.messageId,
          status: result.mocked ? "mocked" : "sent",
          rawPayload: stringifyJson(result.raw, "{}"),
          metadata: stringifyJson({ requestedChatId: chatId, openwaMocked: result.mocked }, "{}")
        }
      });
      await this.touchConversationAndCustomer(conversationId, conversation.customerId, updated.sentAt ?? new Date());
      return updated;
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : "Unknown OpenWA send error";
      await this.prisma.message.update({
        where: { id: message.id },
        data: { status: "failed", failureReason }
      });
      throw error;
    }
  }

  async retry(id: string): Promise<Message> {
    const message = await this.prisma.message.findUnique({
      where: { id },
      include: { conversation: { include: { customer: true } } }
    });
    if (!message) {
      throw new NotFoundException({ code: "MESSAGE_NOT_FOUND", message: "Message was not found." });
    }
    if (message.direction !== "outgoing" || !message.body) {
      throw new BadRequestException({
        code: "MESSAGE_RETRY_NOT_SENDABLE",
        message: "Only outgoing text messages can be retried."
      });
    }

    const chatId =
      message.conversation.externalChatId ??
      message.conversation.customer.chatId ??
      message.conversation.customer.whatsappId ??
      phoneChatId(message.conversation.customer.phoneNumber);
    const result = await this.openwa.sendText({
      sessionId: message.conversation.sessionId,
      chatId,
      text: message.body
    });
    return this.prisma.message.update({
      where: { id },
      data: {
        retryCount: { increment: 1 },
        externalMessageId: result.messageId ?? message.externalMessageId,
        status: result.mocked ? "mocked" : "sent",
        failureReason: null,
        rawPayload: stringifyJson(result.raw, "{}")
      }
    });
  }

  async forConversation(conversationId: string, query: MessageListQueryDto): Promise<unknown> {
    await this.conversations.ensureExists(conversationId);
    return this.list({ conversationId }, query);
  }

  async forCustomer(customerId: string, query: MessageListQueryDto): Promise<unknown> {
    await this.customers.ensureExists(customerId);
    return this.list({ customerId }, query);
  }

  async findDuplicate(input: Pick<CreateMessageDto, "idempotencyKey" | "externalMessageId" | "deliveryId">): Promise<Message | null> {
    const or: Prisma.MessageWhereInput[] = [];
    if (input.idempotencyKey) or.push({ idempotencyKey: input.idempotencyKey });
    if (input.externalMessageId) or.push({ externalMessageId: input.externalMessageId });
    if (input.deliveryId) or.push({ deliveryId: input.deliveryId });
    if (or.length === 0) return null;
    return this.prisma.message.findFirst({ where: { OR: or } });
  }

  toCreateInput(dto: CreateMessageDto): Prisma.MessageCreateInput {
    return {
      customer: { connect: { id: dto.customerId } },
      conversation: { connect: { id: dto.conversationId } },
      externalMessageId: dto.externalMessageId,
      idempotencyKey: dto.idempotencyKey,
      deliveryId: dto.deliveryId,
      direction: dto.direction,
      senderType: dto.senderType,
      messageType: dto.messageType ?? "text",
      body: dto.body,
      mediaUrl: dto.mediaUrl,
      caption: dto.caption,
      rawPayload: stringifyJson(dto.rawPayload ?? {}, "{}"),
      sentAt: dto.sentAt ? new Date(dto.sentAt) : undefined,
      receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : undefined
    };
  }

  private async touchConversationAndCustomer(conversationId: string, customerId: string, timestamp: Date): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: timestamp }
      }),
      this.prisma.customer.update({
        where: { id: customerId },
        data: { lastContactAt: timestamp }
      })
    ]);
  }

  messageTimestamp(dto: Pick<CreateMessageDto, "receivedAt" | "sentAt">): Date {
    return dto.receivedAt ? new Date(dto.receivedAt) : dto.sentAt ? new Date(dto.sentAt) : new Date();
  }

  private async list(where: Prisma.MessageWhereInput, query: MessageListQueryDto): Promise<unknown> {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.message.findMany({
        where,
        orderBy: { createdAt: "asc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { mediaAttachments: { orderBy: { createdAt: "asc" } } }
      }),
      this.prisma.message.count({ where })
    ]);
    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit)
      }
    };
  }
}

function phoneChatId(phoneNumber: string | null): string | null {
  return phoneNumber ? `${phoneNumber}@c.us` : null;
}
