from pathlib import Path


def load_main_prompt() -> str:
    prompt_path = Path(__file__).resolve().parents[1] / "prompts" / "main_chatbot.md"
    return prompt_path.read_text(encoding="utf-8")
