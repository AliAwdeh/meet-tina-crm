from typing import Any

from fastapi import FastAPI, Header, HTTPException

from .config import get_settings
from .cpm_client import CpmClient
from .graph import TinaBrainGraph
from .models import BrainResponse, CpmWebhookEnvelope, DirectChatRequest
from .n8n_client import N8nClient

settings = get_settings()
cpm_client = CpmClient(settings.cpm_base_url, settings.cpm_api_key)
n8n_client = N8nClient(
    settings.tinabrain_n8n_webhook_url,
    settings.tinabrain_n8n_api_key,
    settings.tinabrain_n8n_timeout_seconds,
)
brain = TinaBrainGraph(settings, cpm_client, n8n_client)

app = FastAPI(title="TinaBrain", version="0.1.0")


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "success": True,
        "service": "tinabrain",
        "model": settings.tinabrain_model,
        "n8nMode": settings.n8n_mode,
    }


@app.post("/webhooks/cpm", response_model=BrainResponse)
async def cpm_webhook(
    envelope: CpmWebhookEnvelope,
    x_cpm_api_key: str | None = Header(default=None),
) -> BrainResponse:
    expected_key = settings.tinabrain_inbound_api_key.strip()
    if expected_key and x_cpm_api_key != expected_key:
        raise HTTPException(status_code=401, detail="Invalid X-CPM-API-Key header.")
    return await run_brain(envelope.model_dump())


@app.post("/chat", response_model=BrainResponse)
async def direct_chat(request: DirectChatRequest) -> BrainResponse:
    customer = await cpm_client.get_customer(request.customerId)
    payload = {
        "correlationId": request.correlationId,
        "callbackUrl": request.callbackUrl,
        "customer": customer,
        "conversation": {"id": request.conversationId} if request.conversationId else {},
        "message": {"body": request.message, "direction": "incoming", "senderType": "customer"},
        "recentMessages": [],
        "mediaAttachments": [],
    }
    return await run_brain(payload)


async def run_brain(payload: dict[str, Any]) -> BrainResponse:
    try:
        state = await brain.run(payload)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

    callback_result = None
    reply = state.get("reply")
    callback_url = state.get("callback_url")
    correlation_id = state.get("correlation_id")
    if settings.tinabrain_auto_callback and reply and callback_url and correlation_id:
        callback_secret = settings.cpm_callback_secret
        callback_result = await cpm_client.callback_ai_response(callback_url, callback_secret, correlation_id, reply)

    return BrainResponse(
        success=True,
        mode="n8n" if state.get("n8n_result") else "internal",
        correlationId=correlation_id,
        customerId=state["customer_id"],
        conversationId=state.get("conversation_id"),
        reply=reply,
        toolCalls=state.get("tool_calls", []),
        callbackResult=callback_result,
        n8nResult=state.get("n8n_result"),
    )
