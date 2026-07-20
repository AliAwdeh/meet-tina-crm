import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiSecurity, ApiTags } from "@nestjs/swagger";
import { ConversationsService } from "./conversations.service";
import { CreateConversationDto, ConversationListQueryDto, UpdateConversationDto } from "./dto/conversation.dto";

@ApiTags("conversations")
@ApiSecurity("api-key")
@Controller()
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Post("conversations")
  create(@Body() dto: CreateConversationDto): Promise<unknown> {
    return this.conversations.create(dto);
  }

  @Get("conversations")
  list(@Query() query: ConversationListQueryDto): Promise<unknown> {
    return this.conversations.list(query);
  }

  @Get("conversations/:id")
  findOne(@Param("id") id: string): Promise<unknown> {
    return this.conversations.findOne(id);
  }

  @Get("customers/:customerId/conversations")
  forCustomer(@Param("customerId") customerId: string): Promise<unknown> {
    return this.conversations.findForCustomer(customerId);
  }

  @Patch("conversations/:id")
  update(@Param("id") id: string, @Body() dto: UpdateConversationDto): Promise<unknown> {
    return this.conversations.update(id, dto);
  }
}
