import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { CustomersService } from "../customers/customers.service";
import { CreateConversationDto, ConversationListQueryDto, UpdateConversationDto } from "./dto/conversation.dto";

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService
  ) {}

  async create(dto: CreateConversationDto): Promise<unknown> {
    await this.customers.ensureExists(dto.customerId);
    return this.prisma.conversation.create({
      data: {
        customerId: dto.customerId,
        channel: dto.channel ?? "whatsapp",
        externalChatId: dto.externalChatId,
        sessionId: dto.sessionId,
        status: dto.status ?? "active",
        startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined
      }
    });
  }

  async list(query: ConversationListQueryDto): Promise<unknown> {
    const where: Prisma.ConversationWhereInput = {};
    if (query.customerId) where.customerId = query.customerId;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.conversation.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { customer: true, _count: { select: { messages: true } } }
      }),
      this.prisma.conversation.count({ where })
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

  async findOne(id: string): Promise<unknown> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: { customer: true, messages: { orderBy: { createdAt: "asc" } } }
    });
    if (!conversation) {
      throw new NotFoundException({ code: "CONVERSATION_NOT_FOUND", message: "Conversation was not found." });
    }
    return conversation;
  }

  async findForCustomer(customerId: string): Promise<unknown> {
    await this.customers.ensureExists(customerId);
    return this.prisma.conversation.findMany({
      where: { customerId },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { messages: true } } }
    });
  }

  async update(id: string, dto: UpdateConversationDto): Promise<unknown> {
    await this.ensureExists(id);
    return this.prisma.conversation.update({
      where: { id },
      data: {
        channel: dto.channel,
        externalChatId: dto.externalChatId,
        sessionId: dto.sessionId,
        status: dto.status,
        startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined
      }
    });
  }

  async ensureExists(id: string): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({ where: { id }, select: { id: true } });
    if (!conversation) {
      throw new NotFoundException({ code: "CONVERSATION_NOT_FOUND", message: "Conversation was not found." });
    }
  }
}
