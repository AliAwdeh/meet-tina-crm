import { Module } from "@nestjs/common";
import { AiProcessingModule } from "../integrations/ai-processing/ai-processing.module";
import { N8nModule } from "../integrations/n8n/n8n.module";
import { ProcessingJobsController } from "./processing-jobs.controller";
import { ProcessingJobsService } from "./processing-jobs.service";

@Module({
  imports: [AiProcessingModule, N8nModule],
  controllers: [ProcessingJobsController],
  providers: [ProcessingJobsService]
})
export class ProcessingJobsModule {}
