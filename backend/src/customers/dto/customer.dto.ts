import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min
} from "class-validator";
import { CUSTOMER_STATUSES, CustomerStatus, IsJsonRecord } from "../../common/validators";

export class CreateCustomerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pushName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  phoneNumber?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  whatsappId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chatId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  jobTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  wantedService?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_STATUSES)
  status?: CustomerStatus;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  freeTextProfile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  internalNotes?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsJsonRecord()
  metadata?: Record<string, unknown>;
}

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}

export class CustomerListQueryDto {
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
  search?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_STATUSES)
  status?: CustomerStatus;

  @ApiPropertyOptional({ enum: ["newest_contact", "newest_customer"] })
  @IsOptional()
  @IsIn(["newest_contact", "newest_customer"])
  sort?: "newest_contact" | "newest_customer" = "newest_contact";
}

export class LookupCustomerQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  whatsappId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chatId?: string;
}

export class ProfileSummaryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  freeTextProfile?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];

  @ApiPropertyOptional({ enum: CUSTOMER_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_STATUSES)
  status?: CustomerStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  wantedService?: string;
}

export class CustomerContextQueryDto {
  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  messageLimit = 20;
}
