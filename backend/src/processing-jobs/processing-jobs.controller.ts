import { Controller, Get, Param, Post } from "@nestjs/common";
import { ApiSecurity, ApiTags } from "@nestjs/swagger";
import { ProcessingJobsService } from "./processing-jobs.service";

@ApiTags("processing-jobs")
@ApiSecurity("api-key")
@Controller("processing-jobs")
export class ProcessingJobsController {
  constructor(private readonly jobs: ProcessingJobsService) {}

  @Get()
  list(): Promise<unknown> {
    return this.jobs.list();
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<unknown> {
    return this.jobs.findOne(id);
  }

  @Post(":id/retry")
  retry(@Param("id") id: string): Promise<unknown> {
    return this.jobs.retry(id);
  }
}
