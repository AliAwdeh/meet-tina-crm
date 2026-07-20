import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(): Promise<{
    totalCustomers: number;
    newCustomers: number;
    activeCustomers: number;
    qualifiedCustomers: number;
    totalMessages: number;
    incomingMessages: number;
    outgoingMessages: number;
    contactedLastSevenDays: number;
  }> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [
      totalCustomers,
      newCustomers,
      activeCustomers,
      qualifiedCustomers,
      totalMessages,
      incomingMessages,
      outgoingMessages,
      contactedLastSevenDays
    ] = await this.prisma.$transaction([
      this.prisma.customer.count(),
      this.prisma.customer.count({ where: { status: "new" } }),
      this.prisma.customer.count({ where: { status: "active" } }),
      this.prisma.customer.count({ where: { status: "qualified" } }),
      this.prisma.message.count(),
      this.prisma.message.count({ where: { direction: "incoming" } }),
      this.prisma.message.count({ where: { direction: "outgoing" } }),
      this.prisma.customer.count({ where: { lastContactAt: { gte: sevenDaysAgo } } })
    ]);
    return {
      totalCustomers,
      newCustomers,
      activeCustomers,
      qualifiedCustomers,
      totalMessages,
      incomingMessages,
      outgoingMessages,
      contactedLastSevenDays
    };
  }
}
