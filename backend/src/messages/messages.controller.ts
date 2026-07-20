import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiSecurity, ApiTags } from "@nestjs/swagger";
import { CreateMessageDto, MessageListQueryDto, SendConversationMessageDto } from "./dto/message.dto";
import { MessagesService } from "./messages.service";

@ApiTags("messages")
@ApiSecurity("api-key")
@Controller()
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Post("messages")
  create(@Body() dto: CreateMessageDto): Promise<unknown> {
    return this.messages.create(dto);
  }

  @Get("messages/:id")
  findOne(@Param("id") id: string): Promise<unknown> {
    return this.messages.findOne(id);
  }

  @Post("messages/:id/retry")
  retry(@Param("id") id: string): Promise<unknown> {
    return this.messages.retry(id);
  }

  @Post("conversations/:id/send")
  sendToConversation(@Param("id") id: string, @Body() dto: SendConversationMessageDto): Promise<unknown> {
    return this.messages.sendToConversation(id, dto);
  }

  @Get("conversations/:conversationId/messages")
  forConversation(
    @Param("conversationId") conversationId: string,
    @Query() query: MessageListQueryDto
  ): Promise<unknown> {
    return this.messages.forConversation(conversationId, query);
  }

  @Get("customers/:customerId/messages")
  forCustomer(@Param("customerId") customerId: string, @Query() query: MessageListQueryDto): Promise<unknown> {
    return this.messages.forCustomer(customerId, query);
  }
}
