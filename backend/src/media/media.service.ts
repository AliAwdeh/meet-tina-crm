import { Injectable, NotFoundException } from "@nestjs/common";
import { MediaAttachment } from "@prisma/client";
import { existsSync } from "node:fs";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(id: string): Promise<MediaAttachment> {
    const attachment = await this.prisma.mediaAttachment.findUnique({ where: { id } });
    if (!attachment) {
      throw new NotFoundException({ code: "MEDIA_NOT_FOUND", message: "Media attachment was not found." });
    }
    return attachment;
  }

  hasLocalFile(attachment: MediaAttachment): attachment is MediaAttachment & { localPath: string } {
    return Boolean(attachment.localPath && existsSync(attachment.localPath));
  }
}
