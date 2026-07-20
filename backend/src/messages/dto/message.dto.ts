import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from "class-validator";
import { IsJsonRecord, MESSAGE_DIRECTIONS, MessageDirection, SENDER_TYPES, SenderType } from "../../common/validators";

export class CreateMessageDto {
  @ApiProperty()
  @IsString()
  customerId!: string;

  @ApiProperty()
  @IsString()
  conversationId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalMessageId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryId?: string;

  @ApiProperty({ enum: MESSAGE_DIRECTIONS })
  @IsIn(MESSAGE_DIRECTIONS)
  direction!: MessageDirection;

  @ApiProperty({ enum: SENDER_TYPES })
  @IsIn(SENDER_TYPES)
  senderType!: SenderType;

  @ApiPropertyOptional({ default: "text" })
  @IsOptional()
  @IsString()
  messageType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  caption?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsJsonRecord()
  rawPayload?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  sentAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  receivedAt?: string;
}

export class MessageListQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 50;
}

export class SendConversationMessageDto {
  @ApiProperty()
  @IsString()
  text!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chatId?: string;

  @ApiPropertyOptional({ default: "agent" })
  @IsOptional()
  @IsIn(["agent", "bot"])
  senderType?: "agent" | "bot";
}
