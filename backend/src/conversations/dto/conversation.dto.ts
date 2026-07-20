import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from "class-validator";

export class CreateConversationDto {
  @ApiProperty()
  @IsString()
  customerId!: string;

  @ApiPropertyOptional({ default: "whatsapp" })
  @IsOptional()
  @IsString()
  channel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalChatId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({ enum: ["active", "closed"] })
  @IsOptional()
  @IsIn(["active", "closed"])
  status?: "active" | "closed";

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  startedAt?: string;
}

export class UpdateConversationDto extends PartialType(CreateConversationDto) {}

export class ConversationListQueryDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;
}
