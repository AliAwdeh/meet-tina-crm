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
        self.prompt = load_main_prompt()
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
        workflow.add_node("maybe_handoff", self._maybe_handoff)
        workflow.add_node("agent", self._agent)
        workflow.add_node("tools", self._tools)
        workflow.add_edge("load_context", "maybe_handoff")
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
                "Customer profile:",
                customer_profile or "No profile details yet.",
                "Wanted service saved in CRM:",
                wanted_service,
                "Conversation history:",
                history or "No conversation history yet.",
                "Latest customer message:",
                latest_text,
            ]
        )

        return {
            **state,
            "context": context,
            "messages": [SystemMessage(content=self.prompt), HumanMessage(content=user_content)],
        }

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
            recorded_calls.append({"name": name, "args": args, "result": result})
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
