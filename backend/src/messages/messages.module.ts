import { Module } from "@nestjs/common";
import { ConversationsModule } from "../conversations/conversations.module";
import { CustomersModule } from "../customers/customers.module";
import { OpenwaModule } from "../integrations/openwa/openwa.module";
import { MessagesController } from "./messages.controller";
import { MessagesService } from "./messages.service";

@Module({
  imports: [CustomersModule, ConversationsModule, OpenwaModule],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService]
})
export class MessagesModule {}
