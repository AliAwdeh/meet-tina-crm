import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { ApiSecurity, ApiTags } from "@nestjs/swagger";
import { AttributesService } from "./attributes.service";
import { CustomersService } from "./customers.service";
import { BulkUpsertAttributesDto, UpsertAttributeDto } from "./dto/attribute.dto";
import {
  CreateCustomerDto,
  CustomerContextQueryDto,
  CustomerListQueryDto,
  LookupCustomerQueryDto,
  ProfileSummaryDto,
  UpdateCustomerDto
} from "./dto/customer.dto";

@ApiTags("customers")
@ApiSecurity("api-key")
@Controller("customers")
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly attributes: AttributesService
  ) {}

  @Post()
  create(@Body() dto: CreateCustomerDto): Promise<unknown> {
    return this.customers.create(dto);
  }

  @Get()
  list(@Query() query: CustomerListQueryDto): Promise<unknown> {
    return this.customers.list(query);
  }

  @Get("lookup")
  lookup(@Query() query: LookupCustomerQueryDto): Promise<unknown> {
    return this.customers.lookup(query);
  }

  @Post("upsert")
  upsert(@Body() dto: CreateCustomerDto): Promise<unknown> {
    return this.customers.upsert(dto);
  }

  @Get(":customerId/context")
  context(@Param("customerId") customerId: string, @Query() query: CustomerContextQueryDto): Promise<unknown> {
    return this.customers.context(customerId, query.messageLimit);
  }

  @Patch(":customerId/profile-summary")
  profileSummary(@Param("customerId") customerId: string, @Body() dto: ProfileSummaryDto): Promise<unknown> {
    return this.customers.updateProfileSummary(customerId, dto);
  }

  @Get(":customerId/attributes")
  listAttributes(@Param("customerId") customerId: string): Promise<unknown> {
    return this.attributes.list(customerId);
  }

  @Post(":customerId/attributes")
  bulkUpsertAttributes(@Param("customerId") customerId: string, @Body() dto: BulkUpsertAttributesDto): Promise<unknown> {
    return this.attributes.bulkUpsert(customerId, dto.attributes);
  }

  @Put(":customerId/attributes/:key")
  upsertAttribute(
    @Param("customerId") customerId: string,
    @Param("key") key: string,
    @Body() dto: UpsertAttributeDto
  ): Promise<unknown> {
    return this.attributes.upsert(customerId, key, dto.value, dto.valueType);
  }

  @Delete(":customerId/attributes/:key")
  deleteAttribute(@Param("customerId") customerId: string, @Param("key") key: string): Promise<unknown> {
    return this.attributes.remove(customerId, key);
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<unknown> {
    return this.customers.findOne(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateCustomerDto): Promise<unknown> {
    return this.customers.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string): Promise<unknown> {
    return this.customers.remove(id);
  }
}
