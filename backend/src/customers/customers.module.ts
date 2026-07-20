import { Module } from "@nestjs/common";
import { AttributesService } from "./attributes.service";
import { CustomersController } from "./customers.controller";
import { CustomersRepository } from "./customers.repository";
import { CustomersService } from "./customers.service";

@Module({
  controllers: [CustomersController],
  providers: [CustomersRepository, CustomersService, AttributesService],
  exports: [CustomersRepository, CustomersService, AttributesService]
})
export class CustomersModule {}
