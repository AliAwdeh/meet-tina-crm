import { BadRequestException, Injectable } from "@nestjs/common";
import { normalizePhoneNumber } from "../../customers/customers.service";
import { NormalizedOpenwaEvent } from "./openwa.types";

type JsonRecord = Record<string, unknown>;

@Injectable()
export class OpenwaNormalizerService {
  normalize(input: unknown): NormalizedOpenwaEvent {
    const payload = this.unwrapN8n(input);
    const data = record(payload.data);
    if (!data) {
      throw new BadRequestException({
        code: "OPENWA_INVALID_PAYLOAD",
        message: "OpenWA payload must include a data object."
      });
    }

    const event = stringValue(payload.event) ?? stringValue(data.event) ?? "message.received";
    if (event === "message.ack" || event === "message.failed") {
      return {
        event,
        timestamp: dateFromIso(payload.timestamp) ?? new Date(),
        sessionId: stringValue(payload.sessionId),
        idempotencyKey: stringValue(payload.idempotencyKey),
        deliveryId: stringValue(payload.deliveryId),
        externalMessageId: stringValue(data.messageId) ?? stringValue(data.id),
        status: stringValue(data.status) ?? (event === "message.failed" ? "failed" : "sent"),
        ack: numberValue(data.ack),
        rawPayload: payload
      };
    }

    const fromMe = booleanValue(data.fromMe);
    const contactId = stringValue(fromMe ? data.to : data.from) ?? stringValue(data.chatId);
    const chatId = stringValue(data.chatId) ?? contactId;
    const contact = record(data.contact);
    const pushName = stringValue(contact?.pushName);
    const displayName = stringValue(contact?.name) ?? pushName;
    const externalTimestamp = dateFromOpenwa(data.timestamp) ?? dateFromIso(payload.timestamp) ?? new Date();
    const lid = contactId?.endsWith("@lid") ? contactId : null;
    const phoneNumber = contactId?.endsWith("@c.us") ? normalizePhoneNumber(contactId) : null;
    const senderType = senderTypeValue(payload.senderType) ?? senderTypeValue(data.senderType) ?? (fromMe ? "bot" : "customer");

    return {
      event,
      timestamp: externalTimestamp,
      sessionId: stringValue(payload.sessionId),
      idempotencyKey: stringValue(payload.idempotencyKey),
      deliveryId: stringValue(payload.deliveryId),
      externalMessageId: stringValue(data.id),
      whatsappId: contactId,
      lid,
      phoneNumber,
      chatId,
      displayName,
      pushName,
      body: stringValue(data.body),
      messageType: stringValue(data.type) ?? "text",
      mediaUrl: stringValue(data.mediaUrl) ?? stringValue(data.fileUrl),
      caption: stringValue(data.caption),
      mimetype: stringValue(data.mimetype) ?? stringValue(record(data.media)?.mimetype),
      filename: stringValue(data.filename) ?? stringValue(record(data.media)?.filename),
      hasMedia: booleanValue(data.hasMedia) || Boolean(data.mediaUrl || data.fileUrl || data.media),
      direction: fromMe ? "outgoing" : "incoming",
      senderType,
      isGroup: booleanValue(data.isGroup),
      isStatusBroadcast: booleanValue(data.isStatusBroadcast),
      rawPayload: payload
    };
  }

  private unwrapN8n(input: unknown): JsonRecord {
    const candidate = Array.isArray(input) ? input[0] : input;
    const wrapper = record(candidate);
    const body = record(wrapper?.body);
    const payload = body && (body.event || body.data) ? body : wrapper;
    if (!payload || typeof payload !== "object") {
      throw new BadRequestException({
        code: "OPENWA_INVALID_PAYLOAD",
        message: "OpenWA webhook body must be an object or an n8n wrapper array."
      });
    }
    return payload;
  }
}

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function dateFromIso(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateFromOpenwa(value: unknown): Date | null {
  if (typeof value !== "number") return null;
  const milliseconds = value < 100000000000 ? value * 1000 : value;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date;
}

function senderTypeValue(value: unknown): "customer" | "bot" | "agent" | "system" | null {
  if (value === "customer" || value === "bot" || value === "agent" || value === "system") return value;
  return null;
}
