import { ApiProperty } from "@nestjs/swagger";
import { Allow, IsIn, IsObject } from "class-validator";

export class UpsertAttributeDto {
  @ApiProperty()
  @Allow()
  value!: unknown;

  @ApiProperty({ enum: ["string", "number", "boolean", "json"] })
  @IsIn(["string", "number", "boolean", "json"])
  valueType!: "string" | "number" | "boolean" | "json";
}

export class BulkUpsertAttributesDto {
  @ApiProperty({
    example: {
      business_type: "restaurant",
      budget: 5000,
      follow_up_required: true
    }
  })
  @IsObject()
  attributes!: Record<string, unknown>;
}
