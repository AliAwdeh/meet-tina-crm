import { Module } from "@nestjs/common";
import { OpenaiModule } from "../integrations/openai/openai.module";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";

@Module({
  imports: [OpenaiModule],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService]
})
export class MediaModule {}
