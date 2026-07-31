import { Body, Controller, Get, Param, Post, Put, Query } from "@nestjs/common";
import { ApiSecurity, ApiTags } from "@nestjs/swagger";
import { ActivatePromptDto, CreatePromptDto, PromptListQueryDto, TestPromptDto, UpdatePromptDto } from "./dto/prompt.dto";
import { PromptsService } from "./prompts.service";

@ApiTags("prompts")
@ApiSecurity("api-key")
@Controller("prompts")
export class PromptsController {
  constructor(private readonly prompts: PromptsService) {}

  @Get()
  list(@Query() query: PromptListQueryDto): Promise<unknown> {
    return this.prompts.listPrompts(query);
  }

  @Get("key/:key")
  getByKey(@Param("key") key: string): Promise<unknown> {
    return this.prompts.getActivePrompt(key);
  }

  @Post("test")
  test(@Body() dto: TestPromptDto): Promise<unknown> {
    return this.prompts.testPrompt(dto);
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<unknown> {
    return this.prompts.getPromptById(id);
  }

  @Post()
  create(@Body() dto: CreatePromptDto): Promise<unknown> {
    return this.prompts.createPrompt(dto);
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() dto: UpdatePromptDto): Promise<unknown> {
    return this.prompts.updatePrompt(id, dto);
  }

  @Post(":id/activate")
  activate(@Param("id") id: string, @Body() dto: ActivatePromptDto): Promise<unknown> {
    return this.prompts.activateVersion(id, dto);
  }

  @Get(":id/versions")
  versions(@Param("id") id: string): Promise<unknown> {
    return this.prompts.getVersionHistory(id);
  }

  @Post(":id/restore/:versionId")
  restore(@Param("id") id: string, @Param("versionId") versionId: string, @Body() dto: ActivatePromptDto): Promise<unknown> {
    return this.prompts.restoreVersion(id, versionId, dto.changeNote, dto.updatedBy);
  }

  @Get(":id/usages")
  usages(@Param("id") id: string): Promise<unknown> {
    return this.prompts.getUsages(id);
  }
}
