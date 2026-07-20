import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ApiKeyGuard } from "./auth/api-key.guard";
import { ConversationsModule } from "./conversations/conversations.module";
import { CustomersModule } from "./customers/customers.module";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { MessagesModule } from "./messages/messages.module";
import { MediaModule } from "./media/media.module";
import { StatsModule } from "./stats/stats.module";
import { OpenwaModule } from "./integrations/openwa/openwa.module";
import { ProcessingJobsModule } from "./processing-jobs/processing-jobs.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: Number(config.get<string>("RATE_LIMIT_TTL") ?? 60),
          limit: Number(config.get<string>("RATE_LIMIT_LIMIT") ?? 120)
        }
      ]
    }),
    DatabaseModule,
    HealthModule,
    CustomersModule,
    ConversationsModule,
    MessagesModule,
    MediaModule,
    StatsModule,
    OpenwaModule,
    ProcessingJobsModule
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: ApiKeyGuard }
  ]
})
export class AppModule {}
