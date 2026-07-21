import { Module } from "@nestjs/common";
import { OpenwaClientService } from "../openwa/openwa-client.service";
import { AiProcessingService } from "./ai-processing.service";

@Module({
  providers: [AiProcessingService, OpenwaClientService],
  exports: [AiProcessingService]
})
export class AiProcessingModule {}
