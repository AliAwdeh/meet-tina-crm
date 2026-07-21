import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { createHmac } from "node:crypto";
import request = require("supertest");
import { AppModule } from "../src/app.module";
import { ApiExceptionFilter } from "../src/common/api-exception.filter";
import { PrismaService } from "../src/database/prisma.service";

const apiKey = "test-key";

describe("Meet Tina CRM", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.API_KEY = apiKey;
    process.env.OPENWA_WEBHOOK_SECRET = "test-webhook-secret";
    process.env.OPENAI_API_KEY = "";
    process.env.IGNORE_GROUP_MESSAGES = "true";
    process.env.IGNORE_STATUS_BROADCASTS = "true";

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true
      })
    );
    app.setGlobalPrefix("api/v1");
    prisma = app.get(PrismaService);
    app.get(ConfigService);
    await app.init();
  });

  beforeEach(async () => {
    await prisma.processingJob.deleteMany();
    await prisma.mediaAttachment.deleteMany();
    await prisma.webhookDelivery.deleteMany();
    await prisma.message.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.customerAttribute.deleteMany();
    await prisma.customer.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates, looks up, and upserts customers", async () => {
    const created = await api().post("/api/v1/customers").send({
      displayName: "Ali Awdeh",
      phoneNumber: "+961 71 056 438",
      whatsappId: "96171056438@c.us",
      email: "ali@example.com",
      interests: ["AI chatbots"]
    }).expect(201);

    expect(created.body.phoneNumber).toBe("96171056438");

    const lookup = await api().get("/api/v1/customers/lookup?phoneNumber=96171056438").expect(200);
    expect(lookup.body.id).toBe(created.body.id);

    const upsert = await api().post("/api/v1/customers/upsert").send({
      whatsappId: "96171056438@c.us",
      company: "Meet Tina",
      status: "active"
    }).expect(201);
    expect(upsert.body.id).toBe(created.body.id);
    expect(upsert.body.company).toBe("Meet Tina");
  });

  it("upserts customer attributes", async () => {
    const customer = await createCustomer();
    await api().put(`/api/v1/customers/${customer.id}/attributes/budget`).send({
      value: "5000",
      valueType: "number"
    }).expect(200);
    await api().post(`/api/v1/customers/${customer.id}/attributes`).send({
      attributes: {
        business_type: "restaurant",
        follow_up_required: true
      }
    }).expect(201);

    const attributes = await api().get(`/api/v1/customers/${customer.id}/attributes`).expect(200);
    expect(attributes.body).toHaveLength(3);
  });

  it("normalizes direct OpenWA payloads, preserves @lid identifiers, and creates conversations", async () => {
    const payload = openwaPayload({ id: "incoming-1", idempotencyKey: "key-1" });
    const response = await openwaPost(payload).expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.duplicate).toBe(false);
    expect(response.body.message.direction).toBe("incoming");

    const customer = await prisma.customer.findUnique({ where: { id: response.body.customer.id } });
    expect(customer?.lid).toBe("102907500351574@lid");
    expect(customer?.phoneNumber).toBeNull();
    expect(customer?.whatsappId).toBe("102907500351574@lid");
  });

  it("deduplicates webhook retries and reuses active conversations from n8n wrapper payloads", async () => {
    const first = openwaPayload({ id: "incoming-2", idempotencyKey: "key-2" });
    const second = openwaPayload({ id: "incoming-3", idempotencyKey: "key-3", body: "again" });

    const saved = await openwaPost([n8nWrapper(first)]).expect(201);
    const duplicate = await openwaPost([n8nWrapper(first)]).expect(201);
    await openwaPost([n8nWrapper(second)]).expect(201);

    expect(duplicate.body).toMatchObject({ success: true, duplicate: true });
    expect(duplicate.body.message.id).toBe(saved.body.message.id);
    expect(await prisma.customer.count()).toBe(1);
    expect(await prisma.conversation.count()).toBe(1);
    expect(await prisma.message.count()).toBe(2);
  });

  it("saves unusable incoming messages without sending them to TinaBrain", async () => {
    const response = await openwaPost(openwaPayload({
      id: "incoming-empty",
      idempotencyKey: "key-empty",
      body: ""
    })).expect(201);

    const message = await waitFor(
      () => prisma.message.findUniqueOrThrow({ where: { id: response.body.message.id } }),
      (entry) => entry.n8nStatus === "skipped"
    );
    expect(message.body).toBeNull();
    expect(message.n8nStatus).toBe("skipped");
    expect(message.failureReason).toContain("no usable text");
    expect(await prisma.processingJob.count({ where: { messageId: response.body.message.id } })).toBe(0);
  });

  it("recognizes embedded OpenWA image data as media", async () => {
    const response = await openwaPost(openwaPayload({
      id: "incoming-image",
      idempotencyKey: "key-image",
      body: "",
      type: "unknown",
      mimetype: "image/jpeg",
      data: "/9j/4AAQSkZJRgABAQAAAQABAAD/2w=="
    })).expect(201);

    const attachment = await waitFor(
      () => prisma.mediaAttachment.findFirst({ where: { messageId: response.body.message.id } }),
      (entry) => Boolean(entry && entry.status !== "deferred")
    );
    const message = await prisma.message.findUniqueOrThrow({ where: { id: response.body.message.id } });

    expect(message.messageType).toBe("image");
    expect(attachment?.mediaType).toBe("image");
    expect(attachment?.mimeType).toBe("image/jpeg");
    expect(attachment?.status).toBe("ai_not_configured");
  });

  it("cancels older AI jobs when a newer customer message arrives first", async () => {
    const first = await openwaPost(openwaPayload({
      id: "incoming-superseded-1",
      idempotencyKey: "key-superseded-1",
      body: "I need a sales chatbot."
    })).expect(201);
    const second = await openwaPost(openwaPayload({
      id: "incoming-superseded-2",
      idempotencyKey: "key-superseded-2",
      body: "Actually, it is for appointments."
    })).expect(201);

    const state = await waitFor(
      async () => {
        const [firstMessage, secondMessage, firstJob, secondJob] = await Promise.all([
          prisma.message.findUniqueOrThrow({ where: { id: first.body.message.id } }),
          prisma.message.findUniqueOrThrow({ where: { id: second.body.message.id } }),
          prisma.processingJob.findFirst({ where: { messageId: first.body.message.id } }),
          prisma.processingJob.findFirst({ where: { messageId: second.body.message.id } })
        ]);
        return { firstMessage, secondMessage, firstJob, secondJob };
      },
      (entry) => entry.firstMessage.n8nStatus === "superseded" && entry.firstJob?.status === "cancelled" && Boolean(entry.secondJob)
    );
    const { firstMessage, secondMessage, firstJob, secondJob } = state;

    expect(firstMessage.n8nStatus).toBe("superseded");
    expect(firstMessage.failureReason).toContain("another customer message");
    expect(firstJob?.status).toBe("cancelled");
    expect(firstJob?.lastError).toContain("message_superseded");
    expect(secondMessage.n8nStatus).not.toBe("superseded");
    expect(secondJob?.id).not.toBe(firstJob?.id);
  });

  it("processes outgoing OpenWA and manual messages, then returns chatbot context", async () => {
    const incoming = await openwaPost(openwaPayload({
      id: "incoming-4",
      idempotencyKey: "key-4",
      body: "I need a reservation chatbot."
    })).expect(201);
    await openwaPost(openwaPayload({
      id: "outgoing-1",
      idempotencyKey: "key-5",
      fromMe: true,
      body: "Happy to help."
    })).expect(201);

    await api().put(`/api/v1/customers/${incoming.body.customer.id}/attributes/budget`).send({
      value: 5000,
      valueType: "number"
    }).expect(200);
    await api().patch(`/api/v1/customers/${incoming.body.customer.id}/profile-summary`).send({
      freeTextProfile: "Interested in an AI reservation chatbot.",
      interests: ["reservation chatbot"],
      status: "qualified"
    }).expect(200);

    const manual = await api().post("/api/v1/messages").send({
      customerId: incoming.body.customer.id,
      conversationId: incoming.body.conversation.id,
      externalMessageId: "manual-1",
      direction: "outgoing",
      senderType: "agent",
      messageType: "text",
      body: "Manual follow-up note.",
      sentAt: new Date().toISOString(),
      rawPayload: {}
    }).expect(201);
    expect(manual.body.duplicate).toBe(false);

    const context = await api().get(`/api/v1/customers/${incoming.body.customer.id}/context?messageLimit=3`).expect(200);
    expect(context.body.customer.status).toBe("qualified");
    expect(context.body.attributes.budget).toBe(5000);
    expect(context.body.recentMessages).toHaveLength(3);
  });

  function api() {
    const server = app.getHttpServer();
    return {
      get: (url: string) => request(server).get(url).set("X-API-Key", apiKey),
      post: (url: string) => request(server).post(url).set("X-API-Key", apiKey),
      put: (url: string) => request(server).put(url).set("X-API-Key", apiKey),
      patch: (url: string) => request(server).patch(url).set("X-API-Key", apiKey),
      delete: (url: string) => request(server).delete(url).set("X-API-Key", apiKey)
    };
  }

  function openwaPost(payload: unknown): request.Test {
    const raw = JSON.stringify(payload);
    const signature = `sha256=${createHmac("sha256", "test-webhook-secret").update(raw).digest("hex")}`;
    return request(app.getHttpServer())
      .post("/api/v1/webhooks/openwa")
      .set("Content-Type", "application/json")
      .set("X-OpenWA-Signature", signature)
      .send(raw);
  }

  async function createCustomer(): Promise<{ id: string }> {
    const response = await api().post("/api/v1/customers").send({ displayName: "Test Customer" }).expect(201);
    return response.body as { id: string };
  }
});

async function waitFor<T>(
  getValue: () => Promise<T>,
  isReady: (value: T) => boolean,
  timeoutMs = 1500,
  intervalMs = 25
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let latest = await getValue();
  while (!isReady(latest) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    latest = await getValue();
  }
  return latest;
}

function n8nWrapper(body: unknown): Record<string, unknown> {
  return { headers: {}, params: {}, query: {}, body };
}

function openwaPayload(input: {
  id: string;
  idempotencyKey: string;
  body?: string;
  fromMe?: boolean;
  type?: string;
  mimetype?: string;
  data?: string;
}): Record<string, unknown> {
  const fromMe = input.fromMe ?? false;
  return {
    event: "message.received",
    timestamp: "2026-07-19T22:06:50.363Z",
    sessionId: "610f95e7-e677-4659-8f16-87c222994adb",
    idempotencyKey: input.idempotencyKey,
    deliveryId: `delivery-${input.id}`,
    data: {
      id: input.id,
      from: fromMe ? "96171056438@c.us" : "102907500351574@lid",
      to: fromMe ? "102907500351574@lid" : "96171056438@c.us",
      chatId: "102907500351574@lid",
      body: input.body ?? "hi",
      type: input.type ?? "text",
      mimetype: input.mimetype,
      data: input.data,
      timestamp: 1784498809,
      fromMe,
      isGroup: false,
      isStatusBroadcast: false,
      isLidSender: true,
      contact: {
        pushName: "Ali Awdeh",
        name: "Ali Awdeh"
      }
    }
  };
}
