from typing import Any

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from .cpm_client import CpmClient
from .n8n_client import N8nClient


class UpdateProfileInput(BaseModel):
    customer_id: str = Field(description="CPM customer UUID")
    free_text_profile: str | None = Field(default=None, description="Compact human-readable customer summary")
    interests: list[str] | None = Field(default=None, description="Customer interests")
    status: str | None = Field(default=None, description="CRM status")
    wanted_service: str | None = Field(default=None, description="Main service the customer wants")


class SetCustomerFieldInput(BaseModel):
    customer_id: str
    display_name: str | None = None
    email: str | None = None
    company: str | None = None
    job_title: str | None = None
    country: str | None = None
    city: str | None = None
    wanted_service: str | None = None
    internal_notes: str | None = None


class UpsertAttributeInput(BaseModel):
    customer_id: str
    key: str
    value: str | int | float | bool | dict[str, Any] | list[Any]
    value_type: str | None = None


class BulkAttributesInput(BaseModel):
    customer_id: str
    attributes: dict[str, Any]


class AddInternalNoteInput(BaseModel):
    customer_id: str
    note: str


class GetContextInput(BaseModel):
    customer_id: str
    message_limit: int = 20


class HandoffToN8nInput(BaseModel):
    reason: str
    payload: dict[str, Any]
    correlation_id: str | None = None


def build_tools(cpm: CpmClient, n8n: N8nClient, enable_n8n_tool: bool) -> list[StructuredTool]:
    async def get_customer_context(customer_id: str, message_limit: int = 20) -> dict[str, Any]:
        """Read the current customer profile, attributes, and recent message history from CPM."""
        return await cpm.get_context(customer_id, message_limit)

    async def update_customer_profile(
        customer_id: str,
        free_text_profile: str | None = None,
        interests: list[str] | None = None,
        status: str | None = None,
        wanted_service: str | None = None,
    ) -> dict[str, Any]:
        """Update customer summary, interests, status, and wanted service in CPM."""
        payload = {
            "freeTextProfile": free_text_profile,
            "interests": interests,
            "status": status,
            "wantedService": wanted_service,
        }
        if free_text_profile is not None:
            return await cpm.update_profile_summary(customer_id, payload)
        return await cpm.update_customer(customer_id, payload)

    async def set_customer_fields(
        customer_id: str,
        display_name: str | None = None,
        email: str | None = None,
        company: str | None = None,
        job_title: str | None = None,
        country: str | None = None,
        city: str | None = None,
        wanted_service: str | None = None,
        internal_notes: str | None = None,
    ) -> dict[str, Any]:
        """Set durable customer fields in CPM when the user reveals them."""
        payload = {
            "displayName": display_name,
            "email": email,
            "company": company,
            "jobTitle": job_title,
            "country": country,
            "city": city,
            "wantedService": wanted_service,
            "internalNotes": internal_notes,
        }
        return await cpm.update_customer(customer_id, payload)

    async def upsert_customer_attribute(
        customer_id: str,
        key: str,
        value: str | int | float | bool | dict[str, Any] | list[Any],
        value_type: str | None = None,
    ) -> dict[str, Any]:
        """Create or update one flexible customer attribute in CPM."""
        return await cpm.upsert_attribute(customer_id, key, value, value_type)

    async def bulk_upsert_customer_attributes(customer_id: str, attributes: dict[str, Any]) -> list[dict[str, Any]]:
        """Create or update several flexible customer attributes in CPM."""
        return await cpm.bulk_upsert_attributes(customer_id, attributes)

    async def add_internal_note(customer_id: str, note: str) -> dict[str, Any]:
        """Append a private internal note to the customer profile."""
        customer = await cpm.get_customer(customer_id)
        current = customer.get("internalNotes") or ""
        next_notes = f"{current}\n{note}".strip() if current else note
        return await cpm.update_customer(customer_id, {"internalNotes": next_notes})

    tools = [
        StructuredTool.from_function(
            coroutine=get_customer_context,
            name="get_customer_context",
            description=get_customer_context.__doc__ or "",
            args_schema=GetContextInput,
        ),
        StructuredTool.from_function(
            coroutine=update_customer_profile,
            name="update_customer_profile",
            description=update_customer_profile.__doc__ or "",
            args_schema=UpdateProfileInput,
        ),
        StructuredTool.from_function(
            coroutine=set_customer_fields,
            name="set_customer_fields",
            description=set_customer_fields.__doc__ or "",
            args_schema=SetCustomerFieldInput,
        ),
        StructuredTool.from_function(
            coroutine=upsert_customer_attribute,
            name="upsert_customer_attribute",
            description=upsert_customer_attribute.__doc__ or "",
            args_schema=UpsertAttributeInput,
        ),
        StructuredTool.from_function(
            coroutine=bulk_upsert_customer_attributes,
            name="bulk_upsert_customer_attributes",
            description=bulk_upsert_customer_attributes.__doc__ or "",
            args_schema=BulkAttributesInput,
        ),
        StructuredTool.from_function(
            coroutine=add_internal_note,
            name="add_internal_note",
            description=add_internal_note.__doc__ or "",
            args_schema=AddInternalNoteInput,
        ),
    ]

    if enable_n8n_tool:
        async def handoff_to_n8n(reason: str, payload: dict[str, Any], correlation_id: str | None = None) -> dict[str, Any]:
            """Forward a case to n8n when external automation or a human-designed workflow is needed."""
            return await n8n.dispatch({"reason": reason, **payload}, correlation_id=correlation_id)

        tools.append(
            StructuredTool.from_function(
                coroutine=handoff_to_n8n,
                name="handoff_to_n8n",
                description=handoff_to_n8n.__doc__ or "",
                args_schema=HandoffToN8nInput,
            )
        )

    return tools
