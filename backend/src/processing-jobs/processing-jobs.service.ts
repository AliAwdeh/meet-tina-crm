import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { N8nService } from "../integrations/n8n/n8n.service";

@Injectable()
export class ProcessingJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly n8n: N8nService
  ) {}

  async list(): Promise<unknown> {
    return this.prisma.processingJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        customer: { select: { id: true, displayName: true, whatsappId: true, phoneNumber: true } },
        conversation: { select: { id: true, externalChatId: true, sessionId: true } },
        message: { select: { id: true, body: true, messageType: true, status: true, n8nStatus: true } }
      }
    });
  }

  async findOne(id: string): Promise<unknown> {
    const job = await this.prisma.processingJob.findUnique({
      where: { id },
      include: {
        customer: true,
        conversation: true,
        message: true
      }
    });
    if (!job) {
      throw new NotFoundException({ code: "PROCESSING_JOB_NOT_FOUND", message: "Processing job was not found." });
    }
    return job;
  }

  async retry(id: string): Promise<unknown> {
    await this.findOne(id);
    return this.n8n.retry(id);
  }
}
