from typing import Any


def build_message_history(recent_messages: list[dict[str, Any]], latest_message: dict[str, Any] | None = None) -> str:
    messages = list(recent_messages)
    if latest_message and not any(item.get("id") == latest_message.get("id") for item in messages):
        messages.append(latest_message)

    lines: list[str] = []
    for message in messages:
        direction = message.get("direction", "unknown")
        sender = message.get("senderType", "unknown")
        body = message.get("processedText") or message.get("body") or message.get("caption") or media_context(message) or ""
        timestamp = message.get("receivedAt") or message.get("sentAt") or message.get("createdAt") or message.get("timestamp") or ""
        if body:
            lines.append(f"[{timestamp}] {direction}/{sender}: {body}")
    return "\n".join(lines[-30:])


def media_context(message: dict[str, Any]) -> str:
    attachments = message.get("mediaAttachments")
    if not isinstance(attachments, list):
        return ""

    parts: list[str] = []
    for attachment in attachments:
        if not isinstance(attachment, dict):
            continue
        transcript = attachment.get("transcript")
        vision_summary = attachment.get("visionSummary")
        if isinstance(transcript, str) and transcript.strip():
            parts.append(f"Customer sent this voice message as a transcription:\n{transcript.strip()}")
        elif isinstance(vision_summary, str) and vision_summary.strip():
            mime_type = attachment.get("mimeType")
            kind = "image" if isinstance(mime_type, str) and mime_type.startswith("image/") else "document"
            parts.append(f"Customer sent this {kind}. AI analysis:\n{vision_summary.strip()}")
    return "\n\n".join(parts)


def compact_customer_profile(customer: dict[str, Any], attributes: dict[str, Any] | None = None) -> str:
    fields = [
        "id",
        "displayName",
        "phoneNumber",
        "whatsappId",
        "status",
        "wantedService",
        "company",
        "jobTitle",
        "country",
        "city",
        "interests",
        "freeTextProfile",
        "internalNotes",
    ]
    lines = [f"{field}: {customer.get(field)}" for field in fields if customer.get(field) not in (None, "", [], {})]
    if attributes:
        lines.append(f"attributes: {attributes}")
    return "\n".join(lines)
