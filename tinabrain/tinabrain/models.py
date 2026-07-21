from typing import Any, Literal

from pydantic import BaseModel, Field


class CpmWebhookEnvelope(BaseModel):
    correlationId: str
    callbackUrl: str | None = None
    customer: dict[str, Any]
    conversation: dict[str, Any]
    message: dict[str, Any]
    mediaAttachments: list[dict[str, Any]] = Field(default_factory=list)
    recentMessages: list[dict[str, Any]] = Field(default_factory=list)


class DirectChatRequest(BaseModel):
    customerId: str
    conversationId: str | None = None
    message: str
    callbackUrl: str | None = None
    correlationId: str | None = None


class BrainResponse(BaseModel):
    success: bool
    mode: Literal["internal", "n8n"]
    correlationId: str | None = None
    customerId: str
    conversationId: str | None = None
    reply: str | None = None
    toolCalls: list[dict[str, Any]] = Field(default_factory=list)
    callbackResult: dict[str, Any] | None = None
    n8nResult: dict[str, Any] | None = None
