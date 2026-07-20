import { Module } from "@nestjs/common";
import { OpenwaClientService } from "../openwa/openwa-client.service";
import { N8nController } from "./n8n.controller";
import { N8nService } from "./n8n.service";

@Module({
  controllers: [N8nController],
  providers: [OpenwaClientService, N8nService],
  exports: [N8nService]
})
export class N8nModule {}
