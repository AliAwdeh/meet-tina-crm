import { Module } from "@nestjs/common";
import { MediaModule } from "../../media/media.module";
import { AiProcessingModule } from "../ai-processing/ai-processing.module";
import { OpenwaClientService } from "./openwa-client.service";
import { OpenwaController } from "./openwa.controller";
import { OpenwaNormalizerService } from "./openwa-normalizer.service";
import { OpenwaService } from "./openwa.service";

@Module({
  imports: [AiProcessingModule, MediaModule],
  controllers: [OpenwaController],
  providers: [OpenwaClientService, OpenwaNormalizerService, OpenwaService],
  exports: [OpenwaClientService, OpenwaNormalizerService, OpenwaService]
})
export class OpenwaModule {}
