import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export const PROMPT_CATEGORIES = ["Sales", "Routing", "Classification", "Extraction", "Generation", "Safety", "Media", "Follow-up", "Internal", "Other"] as const;
export const PROMPT_STATUSES = ["draft", "active", "archived"] as const;

export class PromptVariableDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  example?: string;
}

export class CreatePromptDto {
  @IsString()
  key!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(PROMPT_CATEGORIES)
  category?: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsIn(PROMPT_STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxTokens?: number;

  @IsOptional()
  @IsString()
  responseFormat?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PromptVariableDto)
  variables?: PromptVariableDto[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  usage?: unknown[];

  @IsOptional()
  @IsString()
  changeNote?: string;

  @IsOptional()
  @IsString()
  updatedBy?: string;
}

export class UpdatePromptDto extends PartialType(CreatePromptDto) {}

export class PromptListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}

export class ActivatePromptDto {
  @IsOptional()
  @IsString()
  versionId?: string;

  @IsOptional()
  @IsString()
  changeNote?: string;

  @IsOptional()
  @IsString()
  updatedBy?: string;
}

export class TestPromptDto {
  @IsOptional()
  @IsString()
  promptId?: string;

  @IsOptional()
  @IsString()
  key?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxTokens?: number;

  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  sampleMessage?: string;

  @IsOptional()
  @IsString()
  sampleHistory?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PromptVariableDto)
  variableDefinitions?: PromptVariableDto[];
}
