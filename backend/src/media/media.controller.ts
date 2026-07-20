import { Controller, Get, Param, Res } from "@nestjs/common";
import { ApiSecurity, ApiTags } from "@nestjs/swagger";
import { Response } from "express";
import { MediaService } from "./media.service";

@ApiTags("media")
@ApiSecurity("api-key")
@Controller("media")
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get(":id")
  async get(@Param("id") id: string, @Res() response: Response): Promise<void> {
    const attachment = await this.media.findOne(id);
    if (this.media.hasLocalFile(attachment)) {
      response.sendFile(attachment.localPath);
      return;
    }
    response.json(attachment);
  }
}
