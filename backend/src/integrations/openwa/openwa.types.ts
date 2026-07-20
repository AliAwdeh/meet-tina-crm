import { MessageDirection, SenderType } from "../../common/validators";

export type NormalizedOpenwaMessage = {
  event: string;
  timestamp: Date;
  sessionId: string | null;
  idempotencyKey: string | null;
  deliveryId: string | null;
  externalMessageId: string | null;
  whatsappId: string | null;
  lid: string | null;
  phoneNumber: string | null;
  chatId: string | null;
  displayName: string | null;
  pushName: string | null;
  body: string | null;
  messageType: string;
  mediaUrl: string | null;
  caption: string | null;
  mimetype: string | null;
  filename: string | null;
  hasMedia: boolean;
  direction: MessageDirection;
  senderType: SenderType;
  isGroup: boolean;
  isStatusBroadcast: boolean;
  rawPayload: Record<string, unknown>;
};

export type OpenwaAckPayload = {
  event: "message.ack" | "message.failed";
  timestamp: Date;
  sessionId: string | null;
  idempotencyKey: string | null;
  deliveryId: string | null;
  externalMessageId: string | null;
  status: string;
  ack: number | null;
  rawPayload: Record<string, unknown>;
};

export type NormalizedOpenwaEvent = NormalizedOpenwaMessage | OpenwaAckPayload;

export type OpenwaProcessResult =
  | {
      success: true;
      duplicate: true;
      message: { id: string };
    }
  | {
      success: true;
      ignored: true;
      reason: string;
    }
  | {
      success: true;
      duplicate: false;
      customer: { id: string; displayName: string | null; whatsappId: string | null };
      conversation: { id: string };
      message: { id: string; direction: string };
      processingJob?: { id: string; status: string; correlationId: string };
    };
