import { Module } from "@nestjs/common";
import { OpenaiModule } from "../integrations/openai/openai.module";
import { PromptsModule } from "../prompts/prompts.module";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";

@Module({
  imports: [OpenaiModule, PromptsModule],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService]
})
export class MediaModule {}
