import { Module } from "@nestjs/common";
import { N8nModule } from "../n8n/n8n.module";
import { OpenwaClientService } from "./openwa-client.service";
import { OpenwaController } from "./openwa.controller";
import { OpenwaNormalizerService } from "./openwa-normalizer.service";
import { OpenwaService } from "./openwa.service";

@Module({
  imports: [N8nModule],
  controllers: [OpenwaController],
  providers: [OpenwaClientService, OpenwaNormalizerService, OpenwaService],
  exports: [OpenwaClientService, OpenwaNormalizerService, OpenwaService]
})
export class OpenwaModule {}
