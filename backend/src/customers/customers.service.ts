import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { stringifyJson } from "../common/json.util";
import { PrismaService } from "../database/prisma.service";
import { CreateCustomerDto, CustomerListQueryDto, ProfileSummaryDto, UpdateCustomerDto } from "./dto/customer.dto";
import { CustomersRepository } from "./customers.repository";
import { CustomerView, toAttributeView, toCustomerView } from "./customer.mapper";

@Injectable()
export class CustomersService {
  constructor(
    private readonly customers: CustomersRepository,
    private readonly prisma: PrismaService
  ) {}

  async create(dto: CreateCustomerDto): Promise<CustomerView> {
    const customer = await this.customers.create(this.toCreateInput(dto));
    return toCustomerView(customer);
  }

  async list(query: CustomerListQueryDto): Promise<{
    data: CustomerView[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const { customers, total } = await this.customers.list(query);
    return {
      data: customers.map(toCustomerView),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit)
      }
    };
  }

  async findOne(id: string): Promise<CustomerView> {
    const customer = await this.customers.findById(id);
    if (!customer) {
      throw new NotFoundException({ code: "CUSTOMER_NOT_FOUND", message: "Customer was not found." });
    }
    return toCustomerView(customer);
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<CustomerView> {
    await this.ensureExists(id);
    const customer = await this.customers.update(id, this.toUpdateInput(dto));
    return toCustomerView(customer);
  }

  async remove(id: string): Promise<{ success: true }> {
    await this.ensureExists(id);
    await this.customers.delete(id);
    return { success: true };
  }

  async lookup(input: {
    whatsappId?: string | null;
    lid?: string | null;
    phoneNumber?: string | null;
    chatId?: string | null;
  }): Promise<CustomerView> {
    if (!input.whatsappId && !input.lid && !input.phoneNumber && !input.chatId) {
      throw new BadRequestException({
        code: "CUSTOMER_LOOKUP_IDENTIFIER_REQUIRED",
        message: "At least one identifier must be provided."
      });
    }
    const customer = await this.customers.findByIdentifiers({
      ...input,
      phoneNumber: normalizePhoneNumber(input.phoneNumber)
    });
    if (!customer) {
      throw new NotFoundException({ code: "CUSTOMER_NOT_FOUND", message: "Customer was not found." });
    }
    return toCustomerView(customer);
  }

  async upsert(dto: CreateCustomerDto): Promise<CustomerView> {
    const phoneNumber = normalizePhoneNumber(dto.phoneNumber);
    if (!dto.whatsappId && !dto.lid && !phoneNumber && !dto.chatId) {
      throw new BadRequestException({
        code: "CUSTOMER_UPSERT_IDENTIFIER_REQUIRED",
        message: "At least one WhatsApp ID, LID, phone number, or chat ID must be provided."
      });
    }
    const existing = await this.customers.findByIdentifiers({
      whatsappId: dto.whatsappId,
      lid: dto.lid,
      phoneNumber,
      chatId: dto.chatId
    });
    if (existing) {
      const updated = await this.customers.update(existing.id, this.toUpdateInput({ ...dto, phoneNumber }));
      return toCustomerView(updated);
    }
    const created = await this.customers.create(this.toCreateInput({ ...dto, phoneNumber }));
    return toCustomerView(created);
  }

  async context(customerId: string, messageLimit: number): Promise<{
    customer: Pick<
      CustomerView,
      | "id"
      | "displayName"
      | "phoneNumber"
      | "whatsappId"
      | "status"
      | "wantedService"
      | "interests"
      | "freeTextProfile"
      | "internalNotes"
    >;
    attributes: Record<string, unknown>;
    recentMessages: Array<{
      direction: string;
      senderType: string;
      body: string | null;
      timestamp: string;
    }>;
  }> {
    const customer = await this.findOne(customerId);
    const [attributes, messages] = await Promise.all([
      this.prisma.customerAttribute.findMany({ where: { customerId }, orderBy: { key: "asc" } }),
      this.prisma.message.findMany({
        where: { customerId },
        orderBy: { createdAt: "desc" },
        take: messageLimit
      })
    ]);
    return {
      customer: {
        id: customer.id,
        displayName: customer.displayName,
        phoneNumber: customer.phoneNumber,
        whatsappId: customer.whatsappId,
        status: customer.status,
        wantedService: customer.wantedService,
        interests: customer.interests,
        freeTextProfile: customer.freeTextProfile,
        internalNotes: customer.internalNotes
      },
      attributes: Object.fromEntries(attributes.map((attribute) => [attribute.key, toAttributeView(attribute).value])),
      recentMessages: messages.reverse().map((message) => ({
        direction: message.direction,
        senderType: message.senderType,
        body: message.body,
        timestamp: (message.receivedAt ?? message.sentAt ?? message.createdAt).toISOString()
      }))
    };
  }

  async updateProfileSummary(customerId: string, dto: ProfileSummaryDto): Promise<CustomerView> {
    await this.ensureExists(customerId);
    const customer = await this.customers.update(customerId, {
      freeTextProfile: dto.freeTextProfile,
      interests: dto.interests ? stringifyJson(dto.interests, "[]") : undefined,
      status: dto.status,
      wantedService: dto.wantedService
    });
    return toCustomerView(customer);
  }

  async ensureExists(id: string): Promise<void> {
    const customer = await this.customers.findById(id);
    if (!customer) {
      throw new NotFoundException({ code: "CUSTOMER_NOT_FOUND", message: "Customer was not found." });
    }
  }

  private toCreateInput(dto: CreateCustomerDto): Prisma.CustomerCreateInput {
    const nameFromParts = [dto.firstName, dto.lastName].filter(Boolean).join(" ");
    const displayName = dto.displayName ?? (nameFromParts || dto.pushName);
    return {
      displayName,
      pushName: dto.pushName,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phoneNumber: normalizePhoneNumber(dto.phoneNumber),
      whatsappId: dto.whatsappId,
      lid: dto.lid,
      chatId: dto.chatId,
      email: dto.email,
      company: dto.company,
      jobTitle: dto.jobTitle,
      wantedService: dto.wantedService,
      country: dto.country,
      city: dto.city,
      source: dto.source,
      status: dto.status ?? "new",
      interests: stringifyJson(dto.interests ?? [], "[]"),
      freeTextProfile: dto.freeTextProfile,
      internalNotes: dto.internalNotes,
      metadata: stringifyJson(dto.metadata ?? {}, "{}")
    };
  }

  private toUpdateInput(dto: UpdateCustomerDto): Prisma.CustomerUpdateInput {
    return {
      displayName: dto.displayName,
      pushName: dto.pushName,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phoneNumber: dto.phoneNumber === undefined ? undefined : normalizePhoneNumber(dto.phoneNumber),
      whatsappId: dto.whatsappId,
      lid: dto.lid,
      chatId: dto.chatId,
      email: dto.email,
      company: dto.company,
      jobTitle: dto.jobTitle,
      wantedService: dto.wantedService,
      country: dto.country,
      city: dto.city,
      source: dto.source,
      status: dto.status,
      interests: dto.interests ? stringifyJson(dto.interests, "[]") : undefined,
      freeTextProfile: dto.freeTextProfile,
      internalNotes: dto.internalNotes,
      metadata: dto.metadata ? stringifyJson(dto.metadata, "{}") : undefined
    };
  }
}

export function normalizePhoneNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.includes("@lid")) return null;
  const withoutSuffix = value.replace(/@c\.us$/u, "");
  const digits = withoutSuffix.replace(/[^\d]/gu, "");
  return digits.length > 0 ? digits : null;
}
