import { Module } from "@nestjs/common";
import { OpenaiMediaService } from "./openai-media.service";

@Module({
  providers: [OpenaiMediaService],
  exports: [OpenaiMediaService]
})
export class OpenaiModule {}
