import { Injectable } from "@nestjs/common";
import { Prisma, Customer } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";

export type CustomerWithMessageCount = Customer & { _count: { messages: number } };

@Injectable()
export class CustomersRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.CustomerCreateInput): Promise<Customer> {
    return this.prisma.customer.create({ data });
  }

  update(id: string, data: Prisma.CustomerUpdateInput): Promise<Customer> {
    return this.prisma.customer.update({ where: { id }, data });
  }

  delete(id: string): Promise<Customer> {
    return this.prisma.customer.delete({ where: { id } });
  }

  findById(id: string): Promise<Customer | null> {
    return this.prisma.customer.findUnique({ where: { id } });
  }

  findByIdentifiers(input: {
    whatsappId?: string | null;
    lid?: string | null;
    phoneNumber?: string | null;
    chatId?: string | null;
  }): Promise<Customer | null> {
    const where: Prisma.CustomerWhereInput[] = [];
    if (input.whatsappId) where.push({ whatsappId: input.whatsappId });
    if (input.lid) where.push({ lid: input.lid });
    if (input.phoneNumber) where.push({ phoneNumber: input.phoneNumber });
    if (input.chatId) where.push({ chatId: input.chatId });
    if (where.length === 0) return Promise.resolve(null);
    return this.prisma.customer.findFirst({ where: { OR: where }, orderBy: { updatedAt: "desc" } });
  }

  async list(input: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    sort?: "newest_contact" | "newest_customer";
  }): Promise<{ customers: CustomerWithMessageCount[]; total: number }> {
    const where: Prisma.CustomerWhereInput = {};
    if (input.status) {
      where.status = input.status;
    }
    if (input.search) {
      const search = input.search.trim();
      where.OR = [
        { displayName: { contains: search } },
        { pushName: { contains: search } },
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { phoneNumber: { contains: search } },
        { whatsappId: { contains: search } },
        { email: { contains: search } },
        { company: { contains: search } },
        { interests: { contains: search } },
        { freeTextProfile: { contains: search } },
        { internalNotes: { contains: search } }
      ];
    }

    const orderBy: Prisma.CustomerOrderByWithRelationInput =
      input.sort === "newest_customer" ? { createdAt: "desc" } : { lastContactAt: "desc" };

    const [customers, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy,
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        include: { _count: { select: { messages: true } } }
      }),
      this.prisma.customer.count({ where })
    ]);
    return { customers, total };
  }
}
