from typing import Any

import httpx


class N8nClient:
    def __init__(self, webhook_url: str, api_key: str, timeout_seconds: int = 60) -> None:
        self.webhook_url = webhook_url
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds

    @property
    def enabled(self) -> bool:
        return bool(self.webhook_url.strip())

    async def dispatch(self, payload: dict[str, Any], correlation_id: str | None = None) -> dict[str, Any]:
        if not self.enabled:
            return {"success": False, "reason": "TINABRAIN_N8N_WEBHOOK_URL is not configured."}
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["X-TinaBrain-API-Key"] = self.api_key
        if correlation_id:
            headers["X-TinaBrain-Correlation-ID"] = correlation_id
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(self.webhook_url, headers=headers, json=payload)
        response.raise_for_status()
        body = await parse_response(response)
        return {"success": True, "statusCode": response.status_code, "body": body}


async def parse_response(response: httpx.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        return response.text
