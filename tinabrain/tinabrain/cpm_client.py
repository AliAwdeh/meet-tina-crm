from typing import Any

import httpx


class CpmClient:
    def __init__(self, base_url: str, api_key: str, timeout_seconds: int = 30) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds

    async def get_customer(self, customer_id: str) -> dict[str, Any]:
        return await self._request("GET", f"/customers/{customer_id}")

    async def get_context(self, customer_id: str, message_limit: int = 20) -> dict[str, Any]:
        return await self._request("GET", f"/customers/{customer_id}/context", params={"messageLimit": message_limit})

    async def update_customer(self, customer_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._request("PATCH", f"/customers/{customer_id}", json=clean_payload(payload))

    async def update_profile_summary(self, customer_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._request("PATCH", f"/customers/{customer_id}/profile-summary", json=clean_payload(payload))

    async def list_attributes(self, customer_id: str) -> list[dict[str, Any]]:
        return await self._request("GET", f"/customers/{customer_id}/attributes")

    async def upsert_attribute(
        self,
        customer_id: str,
        key: str,
        value: Any,
        value_type: str | None = None,
    ) -> dict[str, Any]:
        inferred_type = value_type or infer_value_type(value)
        return await self._request(
            "PUT",
            f"/customers/{customer_id}/attributes/{key}",
            json={"value": value, "valueType": inferred_type},
        )

    async def bulk_upsert_attributes(self, customer_id: str, attributes: dict[str, Any]) -> list[dict[str, Any]]:
        return await self._request("POST", f"/customers/{customer_id}/attributes", json={"attributes": attributes})

    async def get_customer_messages(self, customer_id: str, limit: int = 50) -> dict[str, Any]:
        return await self._request("GET", f"/customers/{customer_id}/messages", params={"limit": limit})

    async def create_message(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._request("POST", "/messages", json=payload)

    async def send_conversation_message(self, conversation_id: str, text: str, sender_type: str = "bot") -> dict[str, Any]:
        return await self._request(
            "POST",
            f"/conversations/{conversation_id}/send",
            json={"text": text, "senderType": sender_type},
        )

    async def callback_ai_response(
        self,
        callback_url: str,
        callback_secret: str,
        correlation_id: str,
        text: str,
    ) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(
                callback_url,
                headers={
                    "Content-Type": "application/json",
                    "X-CPM-Callback-Secret": callback_secret,
                    "X-CPM-Correlation-ID": correlation_id,
                },
                json={"correlationId": correlation_id, "text": text},
            )
        response.raise_for_status()
        return response.json()

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        async with httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout_seconds) as client:
            response = await client.request(
                method,
                path,
                headers={"X-API-Key": self.api_key, "Content-Type": "application/json"},
                **kwargs,
            )
        response.raise_for_status()
        return response.json()


def clean_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if value is not None}


def infer_value_type(value: Any) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int | float):
        return "number"
    if isinstance(value, dict | list):
        return "json"
    return "string"
