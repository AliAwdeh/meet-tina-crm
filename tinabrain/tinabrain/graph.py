from datetime import UTC, datetime
from typing import Any, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph

from .config import Settings
from .cpm_client import CpmClient
from .history import build_message_history, compact_customer_profile
from .n8n_client import N8nClient
from .prompt_loader import load_main_prompt
from .tools import build_tools


class BrainState(TypedDict, total=False):
    payload: dict[str, Any]
    customer_id: str
    conversation_id: str | None
    correlation_id: str | None
    callback_url: str | None
    context: dict[str, Any]
    messages: list[BaseMessage]
    intent_context: str | None
    user_context: str
    tool_rounds: int
    tool_calls: list[dict[str, Any]]
    reply: str | None
    n8n_result: dict[str, Any] | None


class TinaBrainGraph:
    def __init__(self, settings: Settings, cpm: CpmClient, n8n: N8nClient) -> None:
        self.settings = settings
        self.cpm = cpm
        self.n8n = n8n
        self.tools = build_tools(cpm, n8n, enable_n8n_tool=settings.n8n_mode == "tool")
        self.tools_by_name = {tool.name: tool for tool in self.tools}
        self.llm = ChatOpenAI(
            model=settings.tinabrain_model,
            temperature=settings.tinabrain_temperature,
            api_key=settings.openai_api_key,
        ).bind_tools(self.tools)
        self.intent_llm = ChatOpenAI(
            model=settings.tinabrain_intent_model or settings.tinabrain_model,
            temperature=0,
            api_key=settings.openai_api_key,
        )
        self.fallback_prompt = load_main_prompt()
        self.graph = self._compile()

    async def run(self, payload: dict[str, Any]) -> BrainState:
        customer = as_record(payload.get("customer")) or {}
        conversation = as_record(payload.get("conversation")) or {}
        message = as_record(payload.get("message")) or {}
        customer_id = string_value(customer.get("id")) or string_value(payload.get("customerId"))
        if not customer_id:
            raise ValueError("TinaBrain requires a customer.id or customerId.")
        initial: BrainState = {
            "payload": payload,
            "customer_id": customer_id,
            "conversation_id": string_value(conversation.get("id")) or string_value(payload.get("conversationId")),
            "correlation_id": string_value(payload.get("correlationId")),
            "callback_url": string_value(payload.get("callbackUrl")),
            "tool_rounds": 0,
            "tool_calls": [],
        }
        return await self.graph.ainvoke(initial)

    def _compile(self):
        workflow = StateGraph(BrainState)
        workflow.add_node("load_context", self._load_context)
        workflow.add_node("classify_intent", self._classify_intent)
        workflow.add_node("maybe_handoff", self._maybe_handoff)
        workflow.add_node("agent", self._agent)
        workflow.add_node("tools", self._tools)
        workflow.add_edge("load_context", "classify_intent")
        workflow.add_edge("classify_intent", "maybe_handoff")
        workflow.add_conditional_edges("maybe_handoff", self._route_after_handoff, {"agent": "agent", "end": END})
        workflow.add_conditional_edges("agent", self._route_after_agent, {"tools": "tools", "end": END})
        workflow.add_edge("tools", "agent")
        workflow.set_entry_point("load_context")
        return workflow.compile()

    async def _load_context(self, state: BrainState) -> BrainState:
        customer_id = state["customer_id"]
        payload = state["payload"]
        payload_customer = as_record(payload.get("customer")) or {}
        payload_message = as_record(payload.get("message")) or {}
        payload_recent = as_list_of_records(payload.get("recentMessages"))

        try:
            context = await self.cpm.get_context(customer_id, message_limit=20)
        except Exception:
            context = {
                "customer": payload_customer,
                "attributes": {},
                "recentMessages": payload_recent,
            }

        customer_profile = compact_customer_profile(as_record(context.get("customer")) or payload_customer, as_record(context.get("attributes")))
        history = build_message_history(as_list_of_records(context.get("recentMessages")) or payload_recent, payload_message)
        latest_text = string_value(payload_message.get("processedText")) or string_value(payload_message.get("body")) or string_value(payload.get("message")) or ""
        wanted_service = string_value((as_record(context.get("customer")) or payload_customer).get("wantedService")) or "Not set yet."

        user_content = "\n\n".join(
            [
                "Information about the prospect saved in CPM/CRM (structured, not JSON):",
                customer_profile or "No profile details yet.",
                "Wanted service saved in CRM:",
                wanted_service,
                "Conversation history:",
                history or "No conversation history yet.",
                "Latest customer message:",
                latest_text,
            ]
        )

        system_prompt = await self._load_system_prompt()
        return {
            **state,
            "context": context,
            "user_context": user_content,
            "messages": [SystemMessage(content=system_prompt), HumanMessage(content=user_content)],
        }

    async def _load_system_prompt(self) -> str:
        return await self._load_prompt_content("sales.main_system", self.fallback_prompt)

    async def _load_intent_prompt(self) -> str:
        return await self._load_prompt_content("classification.intent", intent_classifier_fallback_prompt())

    async def _load_prompt_content(self, key: str, fallback: str) -> str:
        try:
            prompt = await self.cpm.get_active_prompt(key)
            content = prompt.get("content")
            if isinstance(content, str) and content.strip():
                return content
        except Exception:
            return fallback
        return fallback

    async def _classify_intent(self, state: BrainState) -> BrainState:
        user_context = state.get("user_context") or ""
        if not user_context.strip():
            return state
        try:
            intent_prompt = await self._load_intent_prompt()
            response = await self.intent_llm.ainvoke(
                [
                    SystemMessage(content=intent_prompt),
                    HumanMessage(content=user_context),
                ]
            )
            intent_context = stringify_content(response.content)
            if not intent_context:
                return state
        except Exception:
            return state

        messages = list(state["messages"])
        if len(messages) >= 2 and isinstance(messages[1], HumanMessage):
            messages[1] = HumanMessage(
                content="\n\n".join(
                    [
                        state.get("user_context") or stringify_content(messages[1].content),
                        "Intent classifier analysis for Tina (internal guidance, not customer-facing):",
                        intent_context,
                    ]
                )
            )
        return {**state, "intent_context": intent_context, "messages": messages}

    async def _maybe_handoff(self, state: BrainState) -> BrainState:
        if self.settings.n8n_mode != "always":
            return state
        result = await self.n8n.dispatch(state["payload"], correlation_id=state.get("correlation_id"))
        return {**state, "n8n_result": result, "reply": None}

    def _route_after_handoff(self, state: BrainState) -> str:
        return "end" if state.get("n8n_result") else "agent"

    async def _agent(self, state: BrainState) -> BrainState:
        response = await self.llm.ainvoke(state["messages"])
        next_state = {**state, "messages": [*state["messages"], response]}
        if isinstance(response, AIMessage) and not response.tool_calls:
            next_state["reply"] = stringify_content(response.content)
        return next_state

    def _route_after_agent(self, state: BrainState) -> str:
        last = state["messages"][-1]
        if isinstance(last, AIMessage) and last.tool_calls and state.get("tool_rounds", 0) < self.settings.tinabrain_max_tool_rounds:
            return "tools"
        return "end"

    async def _tools(self, state: BrainState) -> BrainState:
        last = state["messages"][-1]
        if not isinstance(last, AIMessage):
            return state

        messages: list[BaseMessage] = list(state["messages"])
        recorded_calls = list(state.get("tool_calls", []))
        for call in last.tool_calls:
            name = call["name"]
            args = call.get("args", {})
            tool = self.tools_by_name.get(name)
            if not tool:
                result: Any = {"error": f"Unknown tool: {name}"}
            else:
                result = await tool.ainvoke(args)
            recorded_calls.append({"name": name, "args": args, "result": result, "triggeredAt": datetime.now(UTC).isoformat()})
            messages.append(ToolMessage(content=stringify_tool_result(result), tool_call_id=call["id"]))

        return {
            **state,
            "messages": messages,
            "tool_rounds": state.get("tool_rounds", 0) + 1,
            "tool_calls": recorded_calls,
        }


def as_record(value: Any) -> dict[str, Any] | None:
    return value if isinstance(value, dict) else None


def as_list_of_records(value: Any) -> list[dict[str, Any]]:
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def string_value(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def stringify_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
            elif isinstance(item, str):
                parts.append(item)
        return "\n".join(parts).strip()
    return str(content)


def stringify_tool_result(result: Any) -> str:
    if isinstance(result, str):
        return result
    return repr(result)


def intent_classifier_fallback_prompt() -> str:
    return """You are Tina's internal intent classifier for Meet Tina.

Your job is not to reply to the customer. Your job is to help the main sales assistant understand what the customer likely means and what direction would help them.

Classify the latest customer intent using the full context you receive, including normal text, voice transcription, image analysis, document analysis, and recent conversation history.

Use practical sales and business judgment. Consider intents such as:
- exploring Meet Tina services
- pricing or budget discussion
- booking a demo or consultation
- asking what Tina can do
- describing a business problem
- sending business requirements
- asking technical/integration questions
- support or troubleshooting
- objection, hesitation, or trust concern
- irrelevant, unclear, or casual message

Return concise internal guidance in plain text with:
- Primary intent
- What the customer likely means
- Helpful direction for the main reply
- Useful missing information to ask for
- Sales stage signal
- Urgency or risk if visible

Do not invent facts. Do not write the customer-facing answer. Do not expose this classifier analysis."""
