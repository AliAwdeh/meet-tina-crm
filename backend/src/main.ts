import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { json, urlencoded } from "express";
import helmet from "helmet";
import { IncomingMessage } from "node:http";
import { AppModule } from "./app.module";
import { ApiExceptionFilter } from "./common/api-exception.filter";
import { sanitizeInput } from "./common/sanitize.middleware";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);
  const frontendUrl = config.get<string>("CPM_FRONTEND_URL") ?? config.get<string>("FRONTEND_URL") ?? "http://localhost:5173";
  const bodyLimit = config.get<string>("REQUEST_BODY_LIMIT") ?? "10mb";

  app.use(helmet());
  app.use(
    json({
      limit: bodyLimit,
      verify: (request: IncomingMessage, _response, buffer) => {
        (request as IncomingMessage & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
      }
    })
  );
  app.use(urlencoded({ extended: true, limit: bodyLimit }));
  app.use(sanitizeInput);
  app.enableCors({
    origin: frontendUrl.split(",").map((url) => url.trim()),
    credentials: true
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );
  app.setGlobalPrefix("api/v1");

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Meet Tina CRM API")
    .setDescription("Customer, WhatsApp conversation, and n8n integration APIs.")
    .setVersion("1.0.0")
    .addApiKey({ type: "apiKey", name: "X-API-Key", in: "header" }, "api-key")
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);

  const port = Number(config.get<string>("PORT") ?? 3000);
  await app.listen(port);
}

void bootstrap();
